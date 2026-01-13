import React, { useEffect, useRef, useState } from 'react';
import { AppSettings, CircleConfig, CircleRuntime, Point } from '../types';
import { calculateAngle, angleDiff, smoothLandmarks, smoothPoint, isGif } from '../utils';

interface CanvasLayerProps {
  settings: AppSettings;
  circles: CircleConfig[];
  setCircles: React.Dispatch<React.SetStateAction<CircleConfig[]>>;
  editingId: string | null;
  backgroundImage: HTMLImageElement | null;
  onStatsUpdate: (stats: string) => void;
  setEditingId: (id: string | null) => void;
}

// Constants for physics interaction
const SMOOTH_ALPHA = 0.35;
const HOLD_FRAMES = 6;
const ROTATE_TARGET_DEG = 90;
const STILL_EPS_DEG = 2;
const LEAVE_MARGIN_RATIO = 0.18;
const MIN_LEAVE_MARGIN_PX = 8;
const LEAVE_GRACE_FRAMES = 10;
const SPIN_GRACE_MS = 2000;
const INDEX_TIP = 8;
const ROT_SPEED_DEG_PER_SEC = 45;

const CanvasLayer: React.FC<CanvasLayerProps> = ({
  settings,
  circles,
  setCircles,
  editingId,
  backgroundImage,
  onStatsUpdate,
  setEditingId
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Offscreen canvases
  const feedCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const analysisCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));

  // Mutable state refs (to avoid re-renders during 60fps loop)
  const runtimeRef = useRef<Map<string, CircleRuntime>>(new Map());
  const prevLmsRef = useRef<Point[] | null>(null);
  const prevTipRef = useRef<Point | null>(null);
  const holdLeftRef = useRef<number>(0);
  const lastAnalyzeRef = useRef<number>(0);
  const nextAnalyzeDueRef = useRef<number>(0);
  const draggingRef = useRef<{active: boolean, offset: Point}>({ active: false, offset: {x:0, y:0} });
  const pulseRef = useRef<number>(0); // For global pulse animation
  const requestRef = useRef<number>(0); // RequestAnimationFrame ID
  
  // Mapping State
  const [draggingPointIndex, setDraggingPointIndex] = useState<number | null>(null);
  
  // Keep track of latest props in refs for the animation loop
  const circlesRef = useRef(circles);
  const settingsRef = useRef(settings);
  const editingIdRef = useRef(editingId);
  const backgroundImageRef = useRef(backgroundImage);
  
  useEffect(() => { circlesRef.current = circles; }, [circles]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { editingIdRef.current = editingId; }, [editingId]);
  useEffect(() => { backgroundImageRef.current = backgroundImage; }, [backgroundImage]);

  // Sync Runtime State
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
      
      // Load Image/Gif
      if (c.imgPath && (!rt.imgEl || rt.imgEl.src !== c.imgPath)) {
        if (isGif(c.imgPath) && window.gifler) {
           rt.imgEl = null;
           rt.gifCanvas = document.createElement('canvas');
           rt.gifCanvas.width = c.radius * 2;
           rt.gifCanvas.height = c.radius * 2;
           if (rt.gifAnim) try { rt.gifAnim.stop(); } catch(e){}
           window.gifler(c.imgPath).frames(rt.gifCanvas, (ctx: CanvasRenderingContext2D, frame: any) => {
             ctx.clearRect(0, 0, rt.gifCanvas!.width, rt.gifCanvas!.height);
             ctx.drawImage(frame.buffer, 0, 0, rt.gifCanvas!.width, rt.gifCanvas!.height);
           }).then((anim: any) => {
             rt.gifAnim = anim;
             anim.pause(); // Start paused
           });
        } else {
           const img = new Image();
           img.src = c.imgPath;
           img.onload = () => { rt.imgEl = img; rt.gifAnim = null; };
        }
      } else if (!c.imgPath) {
        rt.imgEl = null; rt.gifAnim = null;
      }

      // Load Audio
      if (c.audioPath && (!rt.audioEl || rt.audioEl.src !== c.audioPath)) {
        if(rt.audioEl) rt.audioEl.pause();
        rt.audioEl = new Audio(c.audioPath);
        rt.audioEl.loop = true;
      } else if (!c.audioPath) {
        if(rt.audioEl) rt.audioEl.pause();
        rt.audioEl = null;
      }

      // Apply Volume
      if (rt.audioEl) {
          rt.audioEl.volume = c.volume ?? 1.0;
      }
    });

    // Cleanup
    const currentIds = new Set(circles.map(c => c.id));
    for (const id of runtimeRef.current.keys()) {
      if (!currentIds.has(id)) {
        const rt = runtimeRef.current.get(id);
        if(rt?.audioEl) rt.audioEl.pause();
        runtimeRef.current.delete(id);
      }
    }
  }, [circles]);

  // Audio Unlock
  useEffect(() => {
    const unlock = () => {
      const a = new Audio();
      a.play().catch(() => {});
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('click', unlock);
    window.addEventListener('touchstart', unlock);
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  // --------------- Logic: Geometry & Physics ---------------- //

  const updateCirclePhysics = (tip: Point | null, now: number) => {
    // Skip interaction physics if we are editing the map
    if (settingsRef.current.isMappingEdit) return;

    pulseRef.current = (Math.sin(now / 300) + 1) * 0.5;

    circlesRef.current.forEach(c => {
      const rt = runtimeRef.current.get(c.id);
      if (!rt) return;

      if (tip) {
        const dx = tip.x - c.x;
        const dy = tip.y - c.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const margin = Math.max(MIN_LEAVE_MARGIN_PX, c.radius * LEAVE_MARGIN_RATIO);
        
        let inside = false;
        if (dist <= c.radius) {
          inside = true;
          rt.graceLeft = LEAVE_GRACE_FRAMES;
        } else if (rt.isHandInside && dist <= c.radius + margin) {
          inside = true;
          rt.graceLeft = LEAVE_GRACE_FRAMES;
        } else if (rt.isHandInside && rt.graceLeft > 0) {
          inside = true;
          rt.graceLeft--;
        }

        if (!rt.isHandInside && inside) {
           rt.isHandInside = true;
           rt.lastAngle = null;
        }

        if (inside) {
          const ang = calculateAngle(c.x, c.y, tip.x, tip.y);
          if (rt.lastAngle !== null) {
            const diff = angleDiff(rt.lastAngle, ang);
            if (Math.abs(diff) >= STILL_EPS_DEG) {
              if (diff > 0) {
                 rt.cwAccum += Math.abs(diff);
                 rt.lastCWTime = now;
              } else {
                 rt.cwAccum = Math.max(0, rt.cwAccum - Math.abs(diff) * 0.5);
              }
            }
          }
          rt.lastAngle = ang;
          
          const cwReady = rt.cwAccum >= ROTATE_TARGET_DEG;
          const cwFresh = (now - rt.lastCWTime) <= SPIN_GRACE_MS;
          rt.isFilled = cwReady && cwFresh;
        } else {
          rt.isHandInside = false;
          rt.isFilled = false;
          rt.cwAccum = 0;
          rt.lastAngle = null;
          rt.graceLeft = 0;
        }
      } else {
        const cwReady = rt.cwAccum >= ROTATE_TARGET_DEG;
        const cwFresh = (now - rt.lastCWTime) <= SPIN_GRACE_MS;
        rt.isFilled = cwReady && cwFresh;
        if (!cwFresh) {
          rt.isHandInside = false;
          rt.lastAngle = null;
          rt.cwAccum = 0;
          if (rt.gifAnim) try{ rt.gifAnim.pause(); } catch(e){}
        }
      }

      if (!rt.wasFilled && rt.isFilled) {
        if(rt.audioEl) {
           rt.audioEl.currentTime = rt._resumeTime || 0;
           rt.audioEl.play().catch(()=>{});
        }
        if(rt.gifAnim) try { rt.gifAnim.play(); } catch(e){}
      } else if (rt.wasFilled && !rt.isFilled) {
        if(rt.audioEl) {
          rt.audioEl.pause();
          rt._resumeTime = rt.audioEl.currentTime;
        }
        if(rt.gifAnim) try { rt.gifAnim.pause(); } catch(e){}
      }

      if (rt.isFilled) {
        rt.rotAngle = (rt.rotAngle + (ROT_SPEED_DEG_PER_SEC * Math.PI / 180) * 0.016) % (Math.PI * 2);
      }
      rt.wasFilled = rt.isFilled;
    });
  };

  const draw = (ctx: CanvasRenderingContext2D, width: number, height: number, landmarks: any, tip: Point | null) => {
    const bgImg = backgroundImageRef.current;
    const s = settingsRef.current;
    
    // 1. Draw Background (Color or Image)
    ctx.fillStyle = s.backgroundColor || '#0b0f14';
    ctx.fillRect(0, 0, width, height);

    if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, width, height);
    }
    
    // 2. Draw Camera Feed (if enabled)
    if (s.showCamera) {
      ctx.save();
      if (s.mirrorView) {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(feedCanvasRef.current, 0, 0, width, height);
      ctx.restore();
    }

    // 3. Draw Circles
    ctx.save();
    
    [...circlesRef.current].forEach(c => {
      const isEditing = c.id === editingIdRef.current;
      const rt = runtimeRef.current.get(c.id);
      if (!rt) return;

      if (rt.isHandInside && !rt.isFilled) {
        ctx.shadowBlur = 20;
        ctx.shadowColor = c.color;
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.beginPath();
      ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
      
      if (rt.isFilled) {
        const pulseScale = 1 + (pulseRef.current * 0.05);
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.scale(pulseScale, pulseScale);
        ctx.translate(-c.x, -c.y);
        
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fill();
        ctx.restore();
      } else {
        ctx.lineWidth = c.lineWidth;
        ctx.strokeStyle = c.color;
        ctx.stroke();
      }

      ctx.shadowBlur = 0;

      if (!rt.isFilled && rt.cwAccum > 5) {
         const progress = Math.min(rt.cwAccum / ROTATE_TARGET_DEG, 1);
         if (progress > 0) {
            ctx.beginPath();
            ctx.arc(c.x, c.y, c.radius, -Math.PI / 2, -Math.PI / 2 + (progress * Math.PI * 2));
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = c.lineWidth + 2;
            ctx.lineCap = 'round';
            ctx.stroke();
         }
      }

      if (rt.imgEl || rt.gifCanvas) {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(rt.rotAngle);
        ctx.beginPath();
        ctx.arc(0, 0, c.radius, 0, Math.PI * 2);
        ctx.clip();
        const drawSource = rt.gifCanvas || rt.imgEl;
        if (drawSource) {
           ctx.drawImage(drawSource, -c.radius, -c.radius, c.radius * 2, c.radius * 2);
        }
        ctx.restore();
      }

      if (isEditing) {
        ctx.strokeStyle = '#4cc9f0';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    ctx.restore();

    // 4. Draw Skeleton
    if (landmarks && s.drawSkeleton) {
        if (window.drawConnectors && window.drawLandmarks && window.Hands) {
            ctx.save();
            ctx.strokeStyle = '#4cc9f0';
            ctx.lineWidth = 2;
            ctx.fillStyle = '#00d1ff';
            ctx.globalAlpha = 0.9;
            
            const connections = window.Hands.HAND_CONNECTIONS;
            if (connections) {
                for(const conn of connections) {
                    const p1 = landmarks[conn[0]];
                    const p2 = landmarks[conn[1]];
                    ctx.beginPath();
                    ctx.moveTo(p1.x * width, p1.y * height);
                    ctx.lineTo(p2.x * width, p2.y * height);
                    ctx.stroke();
                }
            }
            for(const lm of landmarks) {
                ctx.beginPath();
                ctx.arc(lm.x * width, lm.y * height, 3, 0, 2 * Math.PI);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    // 5. Draw Tip Ring
    if (tip) {
        ctx.save();
        const rOuter = 14, rInner = 9;
        const g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, rOuter * 2);
        g.addColorStop(0, 'rgba(0,160,255,0.7)');
        g.addColorStop(0.7, 'rgba(0,160,255,0.24)');
        g.addColorStop(1, 'rgba(0,160,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, rOuter * 2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#4cc9f0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, rInner, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // 6. Mapping Editor Handles
    if (s.isMappingEdit) {
        const points = s.mappingPoints;
        
        ctx.save();
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        if (points.length > 0) {
            ctx.moveTo(points[0].x * width, points[0].y * height);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x * width, points[i].y * height);
            }
            ctx.closePath();
        }
        ctx.stroke();

        points.forEach((p, i) => {
            const px = p.x * width;
            const py = p.y * height;
            
            ctx.beginPath();
            ctx.arc(px, py, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#000';
            ctx.fill();
            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#fff';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText((i + 1).toString(), px, py - 12);
        });
        ctx.restore();
    }
  };

  // --------------- Initialization: MediaPipe & Camera ---------------- //

  useEffect(() => {
    let hands: any = null;
    let stream: MediaStream | null = null;
    let isMounted = true; 

    // Frame processing loop
    const frameLoop = async () => {
        if (!isMounted) return;
        const now = performance.now();
        const s = settingsRef.current;
        
        // 1. Process Video Frame
        if (videoRef.current && videoRef.current.readyState >= 2) {
            const video = videoRef.current;
            const feedCv = feedCanvasRef.current;
            const ctxFeed = feedCv.getContext('2d', { alpha: false })!;
            
            // Calculate Aspect Ratio logic
            let targetW = s.baseShortSide;
            let targetH = s.baseShortSide;
            const [aw, ah] = s.useCustomAspect ? s.aspect : s.aspect;
            
            if (aw > ah) { targetW = Math.round(targetH * (aw/ah)); } 
            else { targetH = Math.round(targetW * (ah/aw)); }

            // Resize offscreen canvas if needed
            if (feedCv.width !== targetW || feedCv.height !== targetH) {
               feedCv.width = targetW;
               feedCv.height = targetH;
               if(canvasRef.current) {
                   canvasRef.current.width = targetW;
                   canvasRef.current.height = targetH;
               }
            }

            // Draw Video transformed
            const vW = video.videoWidth;
            const vH = video.videoHeight;
            const scale = Math.max(targetW / vW, targetH / vH) * s.scale;
            const x = (targetW - vW * scale) / 2;
            const y = (targetH - vH * scale) / 2;

            ctxFeed.save();
            ctxFeed.clearRect(0,0,targetW,targetH);
            ctxFeed.translate(targetW/2, targetH/2);
            ctxFeed.rotate(s.rotationDeg * Math.PI / 180);
            ctxFeed.translate(-targetW/2, -targetH/2);
            ctxFeed.drawImage(video, x, y, vW * scale, vH * scale);
            ctxFeed.restore();

            // 2. AI Analysis Throttle
            if (hands && now >= nextAnalyzeDueRef.current) {
               lastAnalyzeRef.current = now;
               nextAnalyzeDueRef.current = now + (1000 / s.analysisFPS);

               // Downscale for analysis
               const anaCv = analysisCanvasRef.current;
               const anaShort = s.analysisShortSide;
               const scaleFactor = Math.min(1, anaShort / Math.min(targetW, targetH));
               const anaW = Math.round(targetW * scaleFactor);
               const anaH = Math.round(targetH * scaleFactor);
               
               if(anaCv.width !== anaW || anaCv.height !== anaH) {
                 anaCv.width = anaW; anaCv.height = anaH;
               }
               const anaCtx = anaCv.getContext('2d', { alpha: false, willReadFrequently: true })!;
               anaCtx.drawImage(feedCv, 0, 0, anaW, anaH);
               
               await hands.send({ image: anaCv });
            } 
            
            // 3. Draw UI (always, even if AI didn't run this frame)
            const ctx = canvasRef.current!.getContext('2d')!;
            updateCirclePhysics(prevTipRef.current, now); 
            
            const lmsToDraw = prevTipRef.current && holdLeftRef.current > 0 && prevLmsRef.current 
                ? prevLmsRef.current.map(p => ({x: p.x / targetW, y: p.y / targetH}))
                : null;

            draw(ctx, targetW, targetH, lmsToDraw, prevTipRef.current);

        } else {
             // If video not ready, just draw physics/UI
             if (canvasRef.current) {
                const ctx = canvasRef.current.getContext('2d')!;
                updateCirclePhysics(prevTipRef.current, now);
                draw(ctx, canvasRef.current.width, canvasRef.current.height, null, null);
             }
        }

        requestRef.current = requestAnimationFrame(frameLoop);
    };

    const onResults = (results: any) => {
      if (!isMounted) return;
      const width = canvasRef.current?.width || 800;
      const height = canvasRef.current?.height || 600;

      // Process Landmarks
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const rawLms = results.multiHandLandmarks[0].map((p: any) => ({x: p.x, y: p.y}));
        const pixelLms = rawLms.map((p: any) => ({x: p.x * width, y: p.y * height}));
        const smoothLms = smoothLandmarks(prevLmsRef.current, pixelLms, SMOOTH_ALPHA);
        prevLmsRef.current = smoothLms;
        
        const rawTip = smoothLms[INDEX_TIP];
        const tip = smoothPoint(prevTipRef.current, rawTip, 0.5);
        prevTipRef.current = tip;
        holdLeftRef.current = HOLD_FRAMES;
      } else if (holdLeftRef.current > 0 && prevTipRef.current) {
        holdLeftRef.current--;
      } else {
        prevTipRef.current = null;
        prevLmsRef.current = null;
      }
      
      const now = performance.now();
      const analyzeCost = now - lastAnalyzeRef.current;
      onStatsUpdate(`Display:${width}x${height} FPS:~${settingsRef.current.analysisFPS} Cost:${analyzeCost.toFixed(1)}ms`);
    };

    const setupCamera = async (retryCount = 0) => {
        if (!isMounted) return;
        
        try {
            // Stop existing tracks if any
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }

            const constraints = {
                video: {
                    deviceId: settingsRef.current.deviceId ? { exact: settingsRef.current.deviceId } : undefined,
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                },
                audio: false
            };
            
            console.log(`Requesting camera (Attempt ${retryCount + 1})...`);
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
                console.log("Camera started successfully");
                
                // Start Loop
                requestRef.current = requestAnimationFrame(frameLoop);
            }
        } catch (err: any) {
             console.warn(`Camera start failed (Attempt ${retryCount + 1}):`, err);
             
             const isDeviceBusy = err.name === 'NotReadableError' || err.name === 'NotAllowedError' || err.message?.includes('Device in use');

             if (isDeviceBusy && retryCount < 10) {
                 const delay = 1000 + (retryCount * 1000); 
                 console.log(`Retrying in ${delay}ms...`);
                 onStatsUpdate(`Camera Busy... Retry ${retryCount+1}/10`);
                 setTimeout(() => setupCamera(retryCount + 1), delay);
             } else {
                 onStatsUpdate("Error: Camera Busy/Blocked");
             }
        }
    };

    const init = async () => {
      if (!isMounted) return;

      if (!window.Hands) {
        console.error("MediaPipe Hands script not loaded");
        return;
      }

      // Init Hands
      try {
        hands = new window.Hands({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });
        hands.setOptions({
            maxNumHands: settingsRef.current.maxHands,
            modelComplexity: 1,
            minDetectionConfidence: 0.3,
            minTrackingConfidence: 0.3,
            selfieMode: settingsRef.current.mirrorView
        });
        hands.onResults(onResults);
      } catch (e) {
          console.error("Failed to initialize MediaPipe Hands", e);
      }

      // Init Camera
      setupCamera();
    };

    // Initial Delay extended to avoid React StrictMode conflicts
    const t = setTimeout(init, 800);

    return () => {
      isMounted = false;
      clearTimeout(t);
      cancelAnimationFrame(requestRef.current);
      
      if (hands) {
          try { hands.close(); } catch(e) {}
      }
      
      // Strict Stream Cleanup
      if (stream) {
         stream.getTracks().forEach(t => t.stop());
      }
      if (videoRef.current && videoRef.current.srcObject) {
         const s = videoRef.current.srcObject as MediaStream;
         s.getTracks().forEach(t => t.stop());
         videoRef.current.srcObject = null;
      }
      
      runtimeRef.current.forEach(rt => {
          if(rt.audioEl) rt.audioEl.pause();
          if(rt.gifAnim) try{ rt.gifAnim.stop(); }catch(e){}
      });
    };
  }, []); 

  // ... (Interaction handlers remain same)

  // Mouse Interaction Implementation
  const handleMouseDown = (e: React.MouseEvent) => {
    if(!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvasRef.current.width / rect.width);
    const y = (e.clientY - rect.top) * (canvasRef.current.height / rect.height);
    
    // 1. Check for Mapping Handle click
    if (settings.isMappingEdit) {
        const w = canvasRef.current.width;
        const h = canvasRef.current.height;
        const hitIdx = settings.mappingPoints.findIndex(p => {
             const px = p.x * w;
             const py = p.y * h;
             return Math.sqrt((x-px)**2 + (y-py)**2) < 20; // Hit radius
        });
        if (hitIdx !== -1) {
            setDraggingPointIndex(hitIdx);
            return;
        }
        return;
    }

    // 2. Check for Circle hit
    const hitId = circles.slice().reverse().find(c => {
        const dx = x - c.x;
        const dy = y - c.y;
        return Math.sqrt(dx*dx + dy*dy) <= c.radius;
    })?.id;

    if(hitId) {
       draggingRef.current = { active: true, offset: {x:0, y:0} };
       setEditingId(hitId);
       const c = circles.find(ci => ci.id === hitId)!;
       draggingRef.current.offset = { x: x - c.x, y: y - c.y };
    } else {
        setEditingId(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvasRef.current.width / rect.width);
    const y = (e.clientY - rect.top) * (canvasRef.current.height / rect.height);

    // 1. Handle Mapping Drag
    if (settings.isMappingEdit && draggingPointIndex !== null) {
        const w = canvasRef.current.width;
        const h = canvasRef.current.height;
        const nx = Math.max(0, Math.min(1, x / w));
        const ny = Math.max(0, Math.min(1, y / h));

        const event = new CustomEvent('updateMappingPoint', { detail: { index: draggingPointIndex, point: {x: nx, y: ny} } });
        window.dispatchEvent(event);
        return;
    }

    // 2. Handle Circle Drag
    if (!settings.isMappingEdit && draggingRef.current.active && editingId) {
        setCircles(prev => prev.map(c => {
            if (c.id === editingId) {
                return { ...c, x: x - draggingRef.current.offset.x, y: y - draggingRef.current.offset.y };
            }
            return c;
        }));
    }
  };

  const handleMouseUp = () => {
    draggingRef.current.active = false;
    setDraggingPointIndex(null);
  };

  const getClipPath = () => {
      if (!settings.mappingEnabled || settings.isMappingEdit || settings.mappingPoints.length === 0) return 'none';
      const coords = settings.mappingPoints.map(p => `${(p.x * 100).toFixed(2)}% ${(p.y * 100).toFixed(2)}%`).join(', ');
      return `polygon(${coords})`;
  };

  return (
    <div className="relative flex justify-center items-center h-full w-full bg-black">
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />
      <canvas 
        ref={canvasRef} 
        style={{
            borderRadius: `${settings.borderRadius}px`,
            clipPath: getClipPath(),
            transition: 'border-radius 0.2s ease-out'
        }}
        className="max-w-full max-h-full shadow-2xl cursor-crosshair touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      <div className="absolute bottom-4 left-4 text-cyan-200/50 text-xs pointer-events-none transition-opacity duration-300">
         {settings.isMappingEdit ? 'DRAG POINTS TO MAP PROJECTION' : 'Shift + [/] to resize • Drag to move'}
      </div>
    </div>
  );
};

export default CanvasLayer;