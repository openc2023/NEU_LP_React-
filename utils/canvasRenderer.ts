
import { AppSettings, CircleConfig, CircleRuntime, Point } from '../types';

const ROTATE_TARGET_DEG = 90;

interface DrawSceneParams {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    settings: AppSettings;
    circles: CircleConfig[];
    runtimeMap: Map<string, CircleRuntime>;
    editingId: string | null;
    backgroundImage: HTMLImageElement | null;
    sourceCanvas: HTMLCanvasElement | HTMLVideoElement | null;
    landmarks: any;
    tip: Point | null;
    depthMm: number | null;
    pulseVal: number;
    cameraError?: string | null;
}

export const drawScene = ({
    ctx, width, height, settings, circles, runtimeMap, 
    editingId, backgroundImage, sourceCanvas, landmarks, tip, depthMm, pulseVal, cameraError
}: DrawSceneParams) => {
    const s = settings;
    
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    
    if (s.borderRadius > 0) {
        ctx.beginPath();
        const r = Math.min(s.borderRadius, width / 2, height / 2);
        if (typeof (ctx as any).roundRect === 'function') {
            (ctx as any).roundRect(0, 0, width, height, r);
        } else {
            ctx.moveTo(r, 0);
            ctx.lineTo(width - r, 0);
            ctx.quadraticCurveTo(width, 0, width, r);
            ctx.lineTo(width, height - r);
            ctx.quadraticCurveTo(width, height, width - r, height);
            ctx.lineTo(r, height);
            ctx.quadraticCurveTo(0, height, 0, height - r);
            ctx.lineTo(0, r);
            ctx.quadraticCurveTo(0, 0, r, 0);
        }
        ctx.clip();
    }

    if (backgroundImage) {
        ctx.drawImage(backgroundImage, 0, 0, width, height);
    } else {
        ctx.fillStyle = s.backgroundColor || '#0b0f14';
        ctx.fillRect(0, 0, width, height);
    }
    
    if (s.showCamera && sourceCanvas) {
        ctx.save();
        
        if (s.mirrorView) {
            ctx.translate(width, 0);
            ctx.scale(-1, 1);
        }

        const srcW = sourceCanvas instanceof HTMLVideoElement ? sourceCanvas.videoWidth : sourceCanvas.width;
        const srcH = sourceCanvas instanceof HTMLVideoElement ? sourceCanvas.videoHeight : sourceCanvas.height;

        if (srcW && srcH) {
            const scaleW = width / srcW;
            const scaleH = height / srcH;
            const baseScale = Math.max(scaleW, scaleH);
            const finalScale = baseScale * s.scale; 

            const drawW = srcW * finalScale;
            const drawH = srcH * finalScale;
            
            const offsetX = (width - drawW) / 2;
            const offsetY = (height - drawH) / 2;

            if (s.rotationDeg !== 0) {
                ctx.translate(width / 2, height / 2);
                ctx.rotate(s.rotationDeg * Math.PI / 180);
                ctx.translate(-width / 2, -height / 2);
            }

            ctx.drawImage(sourceCanvas, offsetX, offsetY, drawW, drawH);
        }
        ctx.restore();
    }

    // --- Interaction Rendering ---
    circles.forEach(c => {
      const isEditing = c.id === editingId;
      const rt = runtimeMap.get(c.id);
      if (!rt) return;

      if (rt.isHandInside && !rt.isFilled) {
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = c.color;
      }

      ctx.beginPath();
      ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
      
      if (rt.isFilled) {
        const pulseScale = 1 + (pulseVal * 0.05);
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

      if (rt.isHandInside && !rt.isFilled) ctx.restore();

      if (!rt.isFilled && rt.cwAccum > 5) {
         const progress = Math.min(rt.cwAccum / ROTATE_TARGET_DEG, 1);
         ctx.beginPath();
         ctx.arc(c.x, c.y, c.radius, -Math.PI / 2, -Math.PI / 2 + (progress * Math.PI * 2));
         ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
         ctx.lineWidth = c.lineWidth + 2;
         ctx.lineCap = 'round';
         ctx.stroke();
      }

      if (rt.imgEl || rt.gifCanvas) {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(rt.rotAngle);
        ctx.beginPath();
        ctx.arc(0, 0, c.radius, 0, Math.PI * 2);
        ctx.clip();
        const ds = rt.gifCanvas || rt.imgEl;
        if (ds) ctx.drawImage(ds, -c.radius, -c.radius, c.radius * 2, c.radius * 2);
        ctx.restore();
      }

      if (isEditing) {
        ctx.save();
        ctx.strokeStyle = '#4cc9f0';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    });

    if (landmarks && s.drawSkeleton) {
         ctx.save();
         ctx.strokeStyle = '#00d1ff';
         ctx.fillStyle = '#00d1ff';
         ctx.lineWidth = 1.5;
         const conns = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
         for(const [a,b] of conns) {
             const p1 = landmarks[a], p2 = landmarks[b];
             if(p1 && p2) {
                 ctx.beginPath();
                 ctx.moveTo(p1.x * width, p1.y * height);
                 ctx.lineTo(p2.x * width, p2.y * height);
                 ctx.stroke();
             }
         }
         for(const lm of landmarks) {
             ctx.beginPath();
             ctx.arc(lm.x * width, lm.y * height, 2, 0, 2*Math.PI);
             ctx.fill();
         }
         ctx.restore();
    }

    if (tip && tip.x >= 0 && tip.x <= width && tip.y >= 0 && tip.y <= height) {
        ctx.save();
        let color = '0,160,255'; 
        if (s.cameraType === 'professional' && depthMm) {
           color = depthMm < s.depthTriggerMm ? '255,50,50' : '255,200,0';
        }
        const g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 20);
        g.addColorStop(0, `rgba(${color},0.6)`);
        g.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    ctx.restore(); 
}
