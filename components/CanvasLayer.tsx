
import React, { useEffect, useRef, useState } from 'react';
import { AppSettings, CircleConfig, CircleRuntime } from '../types';
import { useHandTracking } from '../hooks/useHandTracking';
import { useWebSocketFeed } from '../hooks/useWebSocketFeed';
import { useCanvasInput } from '../hooks/useCanvasInput';
import { updateCirclePhysics } from '../utils/physicsLogic';
import { drawScene } from '../utils/canvasRenderer';
import { isGif, normalizeUrl } from '../utils';

interface CanvasLayerProps {
  settings: AppSettings;
  circles: CircleConfig[];
  setCircles: React.Dispatch<React.SetStateAction<CircleConfig[]>>;
  editingId: string | null;
  backgroundImage: HTMLImageElement | null;
  onStatsUpdate: (stats: string) => void;
  setEditingId: (id: string | null) => void;
  isPaused?: boolean;
}

const CanvasLayer: React.FC<CanvasLayerProps> = ({
  settings,
  circles,
  setCircles,
  editingId,
  backgroundImage,
  onStatsUpdate,
  setEditingId,
  isPaused = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [cameraError, setCameraError] = useState<string | null>(null);
  const runtimeRef = useRef<Map<string, CircleRuntime>>(new Map());
  const pulseRef = useRef<number>(0);

  // --- Hooks ---
  const { analyzeFrame, landmarksRef, tipRef } = useHandTracking(onStatsUpdate, settings, canvasRef);

  const wsFeed = useWebSocketFeed({
      url: settings.wsUrl,
      isActive: settings.cameraType === 'professional' && !isPaused,
      onStats: onStatsUpdate,
      targetIp: settings.cameraIp,
      streamMode: settings.streamMode
  });

  const inputHandlers = useCanvasInput({ canvasRef, settings, circles, setCircles, editingId, setEditingId });

  // Runtime Media Sync
  useEffect(() => {
    circles.forEach(c => {
      if (!runtimeRef.current.has(c.id)) {
        runtimeRef.current.set(c.id, {
           isFilled: false, wasFilled: false, graceLeft: 0, lastAngle: null,
           cwAccum: 0, rotAngle: 0, lastCWTime: 0, isHandInside: false,
           imgEl: null, audioEl: null, gifAnim: null, gifCanvas: null
        });
      }
      
      const rt = runtimeRef.current.get(c.id)!;
      const nImg = c.imgPath ? normalizeUrl(c.imgPath) : '';
      const nAud = c.audioPath ? normalizeUrl(c.audioPath) : '';

      if (nImg && (!rt.imgEl || rt.imgEl.src !== nImg)) {
         if (isGif(nImg) && window.gifler) {
             rt.imgEl = null; rt.gifCanvas = document.createElement('canvas');
             rt.gifCanvas.width = c.radius * 2; rt.gifCanvas.height = c.radius * 2;
             if(rt.gifAnim) rt.gifAnim.stop();
             window.gifler(nImg).frames(rt.gifCanvas, (ctx: any, frame: any) => {
                 ctx.clearRect(0, 0, rt.gifCanvas!.width, rt.gifCanvas!.height);
                 ctx.drawImage(frame.buffer, 0, 0, rt.gifCanvas!.width, rt.gifCanvas!.height);
             }).then((anim: any) => { rt.gifAnim = anim; anim.pause(); });
         } else {
             const img = new Image(); img.crossOrigin = "anonymous"; img.src = nImg;
             img.onload = () => { rt.imgEl = img; rt.gifAnim = null; };
         }
      }

      if (nAud && (!rt.audioEl || rt.audioEl.src !== nAud)) {
          if(rt.audioEl) rt.audioEl.pause();
          rt.audioEl = new Audio(nAud); rt.audioEl.crossOrigin = "anonymous"; rt.audioEl.loop = true;
      }
      if (rt.audioEl) rt.audioEl.volume = c.volume ?? 1.0;
    });

    const cIds = new Set(circles.map(c => c.id));
    for (const id of runtimeRef.current.keys()) {
        if (!cIds.has(id)) {
            const rt = runtimeRef.current.get(id);
            if(rt?.audioEl) rt.audioEl.pause();
            runtimeRef.current.delete(id);
        }
    }
  }, [circles]);

  // Animation Loop
  useEffect(() => {
      let rafId: number;
      const loop = () => {
          const now = performance.now();
          const canvas = canvasRef.current;
          if (!canvas) { rafId = requestAnimationFrame(loop); return; }
          
          const ctx = canvas.getContext('2d', { alpha: true });
          if (!ctx) { rafId = requestAnimationFrame(loop); return; }

          let src: HTMLVideoElement | HTMLCanvasElement | null = null;
          let rHands = null; let dep = 0; let err = cameraError;

          if (settings.cameraType === 'professional') {
              src = wsFeed.feedCanvas; rHands = wsFeed.hands; dep = wsFeed.depthMm;
              if (!wsFeed.isConnected) err = "CONNECTING...";
          } else if (videoRef.current && videoRef.current.readyState >= 2) {
              src = videoRef.current;
          }

          const s = settings;
          let tw = s.baseShortSide; let th = s.baseShortSide;
          const [aw, ah] = s.aspect;
          if (aw > ah) tw = Math.round(th * (aw/ah)); else th = Math.round(tw * (ah/aw));
          
          if (canvas.width !== tw || canvas.height !== th) { canvas.width = tw; canvas.height = th; }

          if (src) analyzeFrame(src, now, rHands);

          pulseRef.current = (Math.sin(now / 300) + 1) * 0.5;
          updateCirclePhysics(circles, runtimeRef.current, tipRef.current, settings, dep, now, tw, th);

          drawScene({
              ctx, width: tw, height: th, settings, circles, runtimeMap: runtimeRef.current,
              editingId, backgroundImage, sourceCanvas: src, landmarks: landmarksRef.current,
              tip: tipRef.current, depthMm: dep, pulseVal: pulseRef.current, cameraError: err
          });

          rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(rafId);
  }, [settings, circles, editingId, backgroundImage, cameraError, wsFeed]);

  // Local Camera Init
  useEffect(() => {
      if (settings.cameraType === 'professional' || isPaused) {
          if (videoRef.current?.srcObject) {
              (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
              videoRef.current.srcObject = null;
          }
          return;
      }

      let isM = true; let retryT: any;
      const init = async (att = 1) => {
          try {
              if (videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
              await new Promise(r => setTimeout(r, att === 1 ? 500 : 1500));
              if (!isM) return;
              const stream = await navigator.mediaDevices.getUserMedia({
                  video: { width: { ideal: 1280 }, height: { ideal: 720 }, deviceId: settings.deviceId ? { exact: settings.deviceId } : undefined }
              });
              if(!isM) { stream.getTracks().forEach(t => t.stop()); return; }
              if (videoRef.current) {
                  videoRef.current.srcObject = stream;
                  videoRef.current.onloadedmetadata = () => videoRef.current?.play();
                  setCameraError(null);
              }
          } catch (e: any) {
              if (isM && (e.name === 'NotReadableError' || e.name === 'TrackStartError')) {
                  setCameraError(`Device busy. Retrying...`);
                  retryT = setTimeout(() => init(att + 1), 100);
              } else { setCameraError(`Error: ${e.name}`); }
          }
      };
      init();
      return () => { isM = false; clearTimeout(retryT); };
  }, [settings.cameraType, settings.deviceId, isPaused]);

  return (
    <div className="relative flex justify-center items-center h-full w-full bg-black">
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas 
        ref={canvasRef} 
        onMouseDown={inputHandlers.handleMouseDown}
        onMouseMove={inputHandlers.handleMouseMove}
        onMouseUp={inputHandlers.handleMouseUp}
        onMouseLeave={inputHandlers.handleMouseUp}
        style={{ 
            borderRadius: `${settings.borderRadius}px`, 
            overflow: 'hidden',
            // 关键：强制开启合成层剪裁，防止 Canvas 重绘溢出
            transform: 'translateZ(0)',
            WebkitTransform: 'translateZ(0)',
            backfaceVisibility: 'hidden'
        }}
        className="max-w-full max-h-full shadow-2xl cursor-crosshair touch-none transition-[border-radius] duration-200 bg-transparent"
      />
    </div>
  );
};

export default CanvasLayer;
