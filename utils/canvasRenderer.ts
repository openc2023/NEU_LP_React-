
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
    const isProfessional = s.cameraType === 'professional';

    // 1. Background Layer
    if (backgroundImage) {
        ctx.drawImage(backgroundImage, 0, 0, width, height);
    } else {
        ctx.fillStyle = s.backgroundColor || '#0b0f14';
        ctx.fillRect(0, 0, width, height);
    }
    
    // 2. Camera Feed Layer (Fixed Aspect Ratio)
    if (s.showCamera && sourceCanvas) {
        ctx.save();
        
        // Handle Mirroring
        if (s.mirrorView) {
            ctx.translate(width, 0);
            ctx.scale(-1, 1);
        }

        const srcW = sourceCanvas instanceof HTMLVideoElement ? sourceCanvas.videoWidth : sourceCanvas.width;
        const srcH = sourceCanvas instanceof HTMLVideoElement ? sourceCanvas.videoHeight : sourceCanvas.height;

        if (srcW && srcH) {
            // "Cover" Logic: Calculate scale to fill canvas while maintaining aspect ratio
            const scaleW = width / srcW;
            const scaleH = height / srcH;
            // Use max scale to ensure coverage (like CSS object-fit: cover)
            const baseScale = Math.max(scaleW, scaleH);
            const finalScale = baseScale * s.scale; // Apply global zoom setting

            const drawW = srcW * finalScale;
            const drawH = srcH * finalScale;
            
            // Center the image
            const offsetX = (width - drawW) / 2;
            const offsetY = (height - drawH) / 2;

            // Rotation (around center)
            if (s.rotationDeg !== 0) {
                ctx.translate(width / 2, height / 2);
                ctx.rotate(s.rotationDeg * Math.PI / 180);
                ctx.translate(-width / 2, -height / 2);
            }

            ctx.drawImage(sourceCanvas, offsetX, offsetY, drawW, drawH);
        }

        ctx.restore();
    } else if (s.showCamera && !sourceCanvas) {
         // Camera Placeholder / Error
         ctx.fillStyle = '#18181b'; // Zinc-900
         ctx.fillRect(0, 0, width, height);
         
         if (cameraError) {
             ctx.save();
             ctx.fillStyle = '#ef4444'; // Red-500
             ctx.font = '14px Inter, sans-serif';
             ctx.textAlign = 'center';
             ctx.textBaseline = 'middle';
             ctx.fillText(cameraError, width/2, height/2);
             ctx.restore();
         }
    }

    // 3. Circles Layer
    ctx.save();
    circles.forEach(c => {
      const isEditing = c.id === editingId;
      const rt = runtimeMap.get(c.id);
      if (!rt) return;

      // Glow
      if (rt.isHandInside && !rt.isFilled) {
        ctx.shadowBlur = 20;
        ctx.shadowColor = c.color;
      } else {
        ctx.shadowBlur = 0;
      }

      // Base Shape
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

      ctx.shadowBlur = 0;

      // Progress Arc
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

      // Media (Images/GIFs)
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

      // Selection Ring
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

    // 4. Skeleton Layer
    // Uses hardcoded connections to ensure skeleton appears even if MediaPipe globals are missing
    if (landmarks && s.drawSkeleton) {
         ctx.save();
         ctx.strokeStyle = '#4cc9f0';
         ctx.lineWidth = 2;
         ctx.fillStyle = '#00d1ff';
         ctx.globalAlpha = 0.9;
         
         const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17],[5,9],[9,13],[13,17]];
         
         for(const conn of connections) {
             const p1 = landmarks[conn[0]];
             const p2 = landmarks[conn[1]];
             if(p1 && p2) {
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

    // 5. Tip Pointer & Depth
    if (tip) {
        ctx.save();
        const rOuter = 14, rInner = 9;
        
        let activeColor = '0,160,255'; 
        if (isProfessional) {
            const depth = depthMm || 0;
            if (depth > 0) {
               activeColor = depth < s.depthTriggerMm ? '255,50,50' : '255,200,0';
            }
        }

        const g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, rOuter * 2);
        g.addColorStop(0, `rgba(${activeColor},0.7)`);
        g.addColorStop(0.7, `rgba(${activeColor},0.24)`);
        g.addColorStop(1, `rgba(${activeColor},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, rOuter * 2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = `rgb(${activeColor})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, rInner, 0, Math.PI * 2);
        ctx.stroke();

        if (isProfessional && depthMm) {
            ctx.fillStyle = '#fff';
            ctx.font = '10px "Rajdhani"';
            ctx.fillText(`${depthMm}mm`, tip.x + 20, tip.y);
        }
        ctx.restore();
    }

    // 6. Mapping Mesh
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
}
