
import { AppSettings, CircleConfig, CircleRuntime, Point } from '../types';
import { calculateAngle, angleDiff } from '../utils';

// Constants
const ROTATE_TARGET_DEG = 90;
const STILL_EPS_DEG = 2;
const LEAVE_MARGIN_RATIO = 0.18;
const MIN_LEAVE_MARGIN_PX = 8;
const LEAVE_GRACE_FRAMES = 10;
const SPIN_GRACE_MS = 2000;
const ROT_SPEED_DEG_PER_SEC = 45;

export const updateCirclePhysics = (
  circles: CircleConfig[],
  runtimeMap: Map<string, CircleRuntime>,
  tip: Point | null,
  settings: AppSettings,
  globalDepthMm: number | null,
  now: number
) => {
  if (settings.isMappingEdit) return;

  const isProfessional = settings.cameraType === 'professional';
  const depthThreshold = settings.depthTriggerMm;

  // Determine effective depth: Tip specific > Global Center > 0
  let effectiveDepth = 0;
  if (isProfessional) {
      if (tip && tip.depth !== undefined && tip.depth > 0) {
          effectiveDepth = tip.depth;
      } else if (globalDepthMm) {
          effectiveDepth = globalDepthMm;
      }
  }

  circles.forEach(c => {
    const rt = runtimeMap.get(c.id);
    if (!rt) return;

    if (tip) {
      const dx = tip.x - c.x;
      const dy = tip.y - c.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const margin = Math.max(MIN_LEAVE_MARGIN_PX, c.radius * LEAVE_MARGIN_RATIO);
      
      let visualInside = false;
      if (dist <= c.radius) {
        visualInside = true;
      } else if (rt.isHandInside && dist <= c.radius + margin) {
        visualInside = true; // Hysteresis
      }

      let isActivated = false;
      if (isProfessional) {
          // Professional Mode: Visual Intersection + Physical Depth Push
          if (effectiveDepth > 0) {
              // Standard operation: must be closer than threshold
              isActivated = visualInside && effectiveDepth < depthThreshold;
          } else {
              // Fallback: If depth is 0/missing (e.g. far away, AI detected but depth failed), 
              // trust the 2D visual intersection to ensure usability.
              isActivated = visualInside;
          }
      } else {
          // Standard Mode: Dwell time based
          if (visualInside) {
              rt.graceLeft = LEAVE_GRACE_FRAMES;
              isActivated = true;
          } else if (rt.isHandInside && rt.graceLeft > 0) {
              rt.graceLeft--;
              isActivated = true;
          }
      }

      if (!rt.isHandInside && isActivated) {
         rt.isHandInside = true;
         rt.lastAngle = null;
      }

      if (isActivated) {
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
      // No hand detected
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

    // State Transitions (Audio/Animation triggers)
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
