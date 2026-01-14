
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
  
  // State
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // Logic State (Physics)
  const runtimeRef = useRef<Map<string, CircleRuntime>>(new Map());
  const pulseRef = useRef<number>(0);

  // --- Hooks ---
  
  // 1. Hand Tracking (AI)
  const { analyzeFrame, landmarksRef, tipRef } = useHandTracking(onStatsUpdate, settings, canvasRef);

  // 2. WebSocket Feed (Professional Mode)
  const wsFeed = useWebSocketFeed({
      url: settings.wsUrl,
      isActive: settings.cameraType === 'professional' && !isPaused,
      onStats: onStatsUpdate,
      targetIp: settings.cameraIp,
      streamMode: settings.streamMode
  });

  // 3. Mouse/Touch Input
  const inputHandlers = useCanvasInput({ canvasRef, settings, circles, setCircles, editingId, setEditingId });

  // --- Media & Runtime Management ---
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
      const normImg = c.imgPath ? normalizeUrl(c.imgPath) : '';
      const normAudio = c.audioPath ? normalizeUrl(c.audioPath) : '';

      // Image/GIF Loading
      if (normImg && (!rt.imgEl || rt.imgEl.src !== normImg)) {
         if (isGif(normImg) && window.gifler) {
             rt.imgEl = null;
             rt.gifCanvas = document.createElement('canvas');
             rt.gifCanvas.width = c.radius * 2;
             rt.gifCanvas.height = c.radius * 2;
             if(rt.gifAnim) try { rt.gifAnim.stop(); } catch(e){}
             window.gifler(normImg).frames(rt.gifCanvas, (ctx: CanvasRenderingContext2D, frame: any) => {
                 ctx.clearRect(0, 0, rt.gifCanvas!.width, rt.gifCanvas!.height);
                 ctx.drawImage(frame.buffer, 0, 0, rt.gifCanvas!.width, rt.gifCanvas!.height);
             }).then((anim: any) => {
                 rt.gifAnim = anim;
                 anim.pause();
             });
         } else {
             const img = new Image();
             img.crossOrigin = "anonymous";
             img.src = normImg;
             img.onload = () => { rt.imgEl = img; rt.gifAnim = null; };
         }
      } else if (!normImg) {
          rt.imgEl = null; rt.gifAnim = null;
      }

      // Audio Loading
      if (normAudio && (!rt.audioEl || rt.audioEl.src !== normAudio)) {
          if(rt.audioEl) rt.audioEl.pause();
          rt.audioEl = new Audio(normAudio);
          rt.audioEl.crossOrigin = "anonymous";
          rt.audioEl.loop = true;
      } else if (!normAudio) {
          if(rt.audioEl) rt.audioEl.pause();
          rt.audioEl = null;
      }
      
      if (rt.audioEl) rt.audioEl.volume = c.volume ?? 1.0;
    });

    // Cleanup removed
    const currentIds = new Set(circles.map(c => c.id));
    for (const id of runtimeRef.current.keys()) {
        if (!currentIds.has(id)) {
            const rt = runtimeRef.current.get(id);
            if(rt?.audioEl) rt.audioEl.pause();
            runtimeRef.current.delete(id);
        }
    }
  }, [circles]);

  // --- Local Camera Management (Robust) ---
  useEffect(() => {
      // If paused or using professional mode, stop local camera
      if (settings.cameraType === 'professional' || isPaused) {
          const vid = videoRef.current;
          if (vid && vid.srcObject) {
              const s = vid.srcObject as MediaStream;
              s.getTracks().forEach(t => t.stop());
              vid.srcObject = null;
              vid.load(); // Force release
          }
          return;
      }

      let isMounted = true;
      const initCamera = async (retry = 0) => {
          try {
              // 1. Cleanup existing
              if (videoRef.current?.srcObject) {
                 const s = videoRef.current.srcObject as MediaStream;
                 s.getTracks().forEach(t => t.stop());
                 videoRef.current.srcObject = null;
                 videoRef.current.load();
              }
              
              // 2. Wait a tick to allow HW release (Fixes 'Device in use')
              // 500ms initial safety, 1s for retries
              const delay = retry > 0 ? 1000 : 500;
              await new Promise(r => setTimeout(r, delay));

              if (!isMounted) return;

              // 3. Request Stream
              const stream = await navigator.mediaDevices.getUserMedia({
                  video: { 
                      width: { ideal: 1280 }, 
                      height: { ideal: 720 },
                      deviceId: settings.deviceId ? { exact: settings.deviceId } : undefined
                  }
              });
              
              if(!isMounted) {
                  stream.getTracks().forEach(t => t.stop());
                  return;
              }

              if (videoRef.current) {
                  videoRef.current.srcObject = stream;
                  await videoRef.current.play();
                  setCameraError(null);
              }
          } catch (e: any) {
              console.error("[Camera Init]", e);
              if (!isMounted) return;

              if ((e.name === 'NotReadableError' || e.name === 'TrackStartError') && retry < 2) {
                  setCameraError(`Camera busy, retrying (${retry+1}/2)...`);
                  // Retry logic
                  setTimeout(() => initCamera(retry + 1), 500);
              } else if (e.name === 'NotAllowedError') {
                  setCameraError("Permission Denied");
              } else {
                  setCameraError(`Camera Error: ${e.name}`);
              }
          }
      };
      
      initCamera();
      
      return () => {
          isMounted = false;
          if (videoRef.current?.srcObject) {
              (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
              videoRef.current.srcObject = null;
          }
      };
  }, [settings.cameraType, settings.deviceId, isPaused]);

  // --- Main Animation Loop ---
  useEffect(() => {
      let rafId: number;
      
      const loop = () => {
          const now = performance.now();
          const canvas = canvasRef.current;
          if (!canvas) { rafId = requestAnimationFrame(loop); return; }
          
          const ctx = canvas.getContext('2d', { alpha: false });
          if (!ctx) { rafId = requestAnimationFrame(loop); return; }

          // 1. Determine Source & Aspect Ratio
          let source: HTMLVideoElement | HTMLCanvasElement | null = null;
          let remoteHands = null;
          let depth = 0;
          let activeError = cameraError;

          if (settings.cameraType === 'professional') {
              source = wsFeed.feedCanvas;
              remoteHands = wsFeed.hands;
              depth = wsFeed.depthMm;
              if (!wsFeed.isConnected) activeError = "CONNECTING TO BRIDGE...";
          } else {
              if (videoRef.current && videoRef.current.readyState >= 2) {
                  source = videoRef.current;
              }
          }

          // Canvas Sizing (Match Settings)
          const s = settings;
          let targetW = s.baseShortSide;
          let targetH = s.baseShortSide;
          const [aw, ah] = s.useCustomAspect ? s.aspect : s.aspect;
          if (aw > ah) { targetW = Math.round(targetH * (aw/ah)); } 
          else { targetH = Math.round(targetW * (ah/aw)); }
          
          if (canvas.width !== targetW || canvas.height !== targetH) {
              canvas.width = targetW;
              canvas.height = targetH;
          }

          // 2. AI Analysis (Hybrid Mode Logic)
          if (source) {
              // We always try to analyze if we have a source.
              // useHandTracking handles the priority: External Data > Local AI.
              analyzeFrame(source, now, remoteHands);
          }

          // 3. Physics & State
          pulseRef.current = (Math.sin(now / 300) + 1) * 0.5;
          updateCirclePhysics(circles, runtimeRef.current, tipRef.current, settings, depth, now);

          // 4. Draw Scene
          drawScene({
              ctx, width: targetW, height: targetH,
              settings, circles, runtimeMap: runtimeRef.current,
              editingId, backgroundImage, sourceCanvas: source,
              landmarks: landmarksRef.current, tip: tipRef.current,
              depthMm: depth, pulseVal: pulseRef.current,
              cameraError: activeError // Pass error to renderer
          });

          rafId = requestAnimationFrame(loop);
      };
      
      rafId = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(rafId);
  }, [settings, circles, editingId, backgroundImage, cameraError, wsFeed]);

  return (
    <div className="relative flex justify-center items-center h-full w-full bg-black">
      {/* Hidden Video for Local Camera */}
      <video ref={videoRef} className="hidden" playsInline muted />
      
      {/* Main Rendering Canvas */}
      <canvas 
        ref={canvasRef} 
        onMouseDown={inputHandlers.handleMouseDown}
        onMouseMove={inputHandlers.handleMouseMove}
        onMouseUp={inputHandlers.handleMouseUp}
        onMouseLeave={inputHandlers.handleMouseUp}
        className="max-w-full max-h-full rounded-2xl shadow-2xl cursor-crosshair touch-none"
      />
      
      <div className="absolute bottom-4 left-4 text-cyan-200/50 text-xs pointer-events-none transition-opacity duration-300">
         Shift + [/] to resize • Drag to move
      </div>
    </div>
  );
};

export default CanvasLayer;
