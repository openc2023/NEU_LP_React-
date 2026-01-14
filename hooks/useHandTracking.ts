
import { useRef, useEffect } from 'react';
import { AppSettings, Point, RemoteHand } from '../types';
import { smoothLandmarks, smoothPoint } from '../utils';

const SMOOTH_ALPHA = 0.35;
const INDEX_TIP = 8;
const HOLD_FRAMES = 6;

// Return types now include MutableRefObjects
export const useHandTracking = (
    onStats: (msg: string) => void,
    settings: AppSettings,
    canvasRef: React.RefObject<HTMLCanvasElement>
) => {
    const handsRef = useRef<any>(null);
    const prevLmsRef = useRef<Point[] | null>(null);
    const prevTipRef = useRef<Point | null>(null);
    const holdLeftRef = useRef<number>(0);
    const lastAnalyzeRef = useRef<number>(0);
    const nextAnalyzeDueRef = useRef<number>(0);
    const isAnalyzingRef = useRef<boolean>(false);
    const analysisCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
    
    // Track source video dimensions to calculate aspect ratio correction
    const sourceStatsRef = useRef<{width: number, height: number}>({width: 640, height: 480});
    
    // Fix: Use ref to track settings to avoid stale closures in the render loop
    const settingsRef = useRef(settings);
    useEffect(() => { settingsRef.current = settings; }, [settings]);

    // Helper: Transform MediaPipe (0-1 video space) to Canvas (0-1 canvas space)
    // Applies transformations in the specific order of the Renderer:
    // 1. Zoom/Cover (Local Coords) -> 2. Rotation (Context) -> 3. Mirror (Context)
    const transformCoords = (rawX: number, rawY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: rawX, y: rawY };

        const cw = canvas.width;
        const ch = canvas.height;
        const vw = sourceStatsRef.current.width || 640;
        const vh = sourceStatsRef.current.height || 480;
        const s = settingsRef.current;

        // 1. Calculate the "Cover" scale & Offset (Local Drawing Coordinates)
        const scaleW = cw / vw;
        const scaleH = ch / vh;
        const baseScale = Math.max(scaleW, scaleH);
        const finalScale = baseScale * s.scale; // Global Zoom

        const projectedW = vw * finalScale;
        const projectedH = vh * finalScale;
        const offsetX = (cw - projectedW) / 2;
        const offsetY = (ch - projectedH) / 2;

        // Map normalized video coordinate (0-1) to Drawing Space
        // Note: We use rawX directly (non-mirrored) because we handle mirror last
        let px = rawX * projectedW + offsetX;
        let py = rawY * projectedH + offsetY;

        // 2. Apply Rotation (around center)
        if (s.rotationDeg !== 0) {
            const cx = cw / 2;
            const cy = ch / 2;
            const rad = s.rotationDeg * (Math.PI / 180);
            
            // Standard 2D Rotation around Pivot
            const dx = px - cx;
            const dy = py - cy;

            const rotatedX = dx * Math.cos(rad) - dy * Math.sin(rad);
            const rotatedY = dx * Math.sin(rad) + dy * Math.cos(rad);

            px = rotatedX + cx;
            py = rotatedY + cy;
        }

        // 3. Apply Mirror (Flip X around Center/Width)
        if (s.mirrorView) {
            // In CanvasRenderer: ctx.translate(width, 0); ctx.scale(-1, 1);
            // This maps x to (width - x)
            px = cw - px;
        }

        // 4. Normalize back to 0-1
        return {
            x: px / cw,
            y: py / ch
        };
    };

    // 1. Initialize MediaPipe Hands
    useEffect(() => {
        let isMounted = true;
        let retryInterval: number;

        const attemptInit = () => {
            if (handsRef.current) return;

            if (window.Hands) {
                try {
                    console.log("[MP] Attempting to initialize MediaPipe Hands...");
                    const hands = new window.Hands({
                        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
                    });
                    
                    hands.setOptions({
                        maxNumHands: settingsRef.current.maxHands,
                        modelComplexity: 1,
                        minDetectionConfidence: 0.3,
                        minTrackingConfidence: 0.3,
                        selfieMode: false // CRITICAL: We handle mirroring manually in transformCoords
                    });

                    hands.onResults((results: any) => {
                        if (!isMounted) return;
                        
                        const width = canvasRef.current?.width || 800;
                        const height = canvasRef.current?.height || 600;
                        const s = settingsRef.current;

                        let validHand = null;

                        // Find first visible hand (Filter out hands cropped by zoom)
                        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                            for (const rawLms of results.multiHandLandmarks) {
                                const rawTip = rawLms[INDEX_TIP];
                                const tTip = transformCoords(rawTip.x, rawTip.y);

                                // Visibility Check: Must be strictly inside canvas (0-1)
                                // This prevents interacting with elements using "off-screen" cropped hands
                                if (tTip.x >= 0 && tTip.x <= 1 && tTip.y >= 0 && tTip.y <= 1) {
                                    validHand = rawLms;
                                    break;
                                }
                            }
                        }

                        if (validHand) {
                            const transformedLms = validHand.map((p: any) => {
                                const t = transformCoords(p.x, p.y);
                                return { x: t.x, y: t.y };
                            });
                            
                            const smoothLms = smoothLandmarks(prevLmsRef.current, transformedLms, SMOOTH_ALPHA);
                            prevLmsRef.current = smoothLms;
                            
                            const rawTipNorm = smoothLms[INDEX_TIP];
                            const rawTipPixel = { 
                                x: rawTipNorm.x * width, 
                                y: rawTipNorm.y * height 
                            };
                            
                            const tip = smoothPoint(prevTipRef.current, rawTipPixel, 0.5);
                            prevTipRef.current = tip;
                            holdLeftRef.current = HOLD_FRAMES;
                        } else if (holdLeftRef.current > 0 && prevTipRef.current) {
                            holdLeftRef.current--;
                        } else {
                            prevTipRef.current = null;
                            prevLmsRef.current = null;
                        }

                        // Calculate stats
                        const now = performance.now();
                        const analyzeCost = now - lastAnalyzeRef.current;
                        onStats(`AI_LATENCY:${analyzeCost.toFixed(0)}ms (Local)`);
                    });
                    
                    handsRef.current = hands;
                    console.log("[MP] MediaPipe Hands Initialized Successfully");
                } catch (e) {
                    console.error("[MP] Init Error", e);
                }
            }
        };

        attemptInit();

        retryInterval = window.setInterval(() => {
            if (!handsRef.current) {
                attemptInit();
            } else {
                clearInterval(retryInterval);
            }
        }, 500);

        return () => {
            isMounted = false;
            clearInterval(retryInterval);
            if (handsRef.current) {
                try { handsRef.current.close(); } catch(e){}
                handsRef.current = null;
            }
        };
    }, []);

    // 2. Handle Dynamic Options Updates
    useEffect(() => {
        if (handsRef.current) {
            handsRef.current.setOptions({
                selfieMode: false, // Always false, handled manually
                maxNumHands: settings.maxHands
            });
        }
    }, [settings.mirrorView, settings.maxHands]);

    // 3. Analysis Loop
    const analyzeFrame = async (
        source: HTMLVideoElement | HTMLCanvasElement, 
        now: number,
        externalData?: RemoteHand[] | null
    ) => {
        const currentSettings = settingsRef.current;
        const width = canvasRef.current?.width || 800;
        const height = canvasRef.current?.height || 600;

        const srcW = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
        const srcH = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
        
        if (srcW && srcH) {
            sourceStatsRef.current = { width: srcW, height: srcH };
        }

        // --- MODE A: External Data ---
        if (externalData && externalData.length > 0) {
            let validHand = null;
            for (const hand of externalData) {
                const rawTip = hand.landmarks[INDEX_TIP];
                const tTip = transformCoords(rawTip.x, rawTip.y);
                if (tTip.x >= 0 && tTip.x <= 1 && tTip.y >= 0 && tTip.y <= 1) {
                    validHand = hand;
                    break;
                }
            }

            if (validHand) {
                const rawLms = validHand.landmarks.map((p) => {
                    const t = transformCoords(p.x, p.y);
                    return {
                        x: t.x, 
                        y: t.y,
                        depth: p.depth_mm
                    };
                });

                const smoothLms = smoothLandmarks(prevLmsRef.current, rawLms, SMOOTH_ALPHA);
                prevLmsRef.current = smoothLms;

                const rawTipNorm = smoothLms[INDEX_TIP];
                const tipPixel = {
                    x: rawTipNorm.x * width,
                    y: rawTipNorm.y * height,
                    depth: rawTipNorm.depth
                };

                const tip = smoothPoint(prevTipRef.current, tipPixel, 0.5);
                prevTipRef.current = tip;
                holdLeftRef.current = HOLD_FRAMES;
            } else {
                 if (holdLeftRef.current > 0 && prevTipRef.current) {
                    holdLeftRef.current--;
                 } else {
                    prevTipRef.current = null;
                    prevLmsRef.current = null;
                 }
            }
            return;
        } 
        
        // --- MODE B: Local MediaPipe ---
        
        if (!srcW || !srcH) return;
        if (!handsRef.current || isAnalyzingRef.current || now < nextAnalyzeDueRef.current) return;

        lastAnalyzeRef.current = now;
        nextAnalyzeDueRef.current = now + (1000 / currentSettings.analysisFPS);

        const anaCv = analysisCanvasRef.current;
        const anaShort = currentSettings.analysisShortSide;
        
        const scaleFactor = Math.min(1, anaShort / Math.min(srcW, srcH));
        const anaW = Math.round(srcW * scaleFactor);
        const anaH = Math.round(srcH * scaleFactor);

        if (anaCv.width !== anaW || anaCv.height !== anaH) {
            anaCv.width = anaW; anaCv.height = anaH;
        }

        const ctx = anaCv.getContext('2d', { alpha: false, willReadFrequently: true });
        if(ctx) {
            // Draw raw source (no mirror, no rotation) for AI
            ctx.drawImage(source, 0, 0, anaW, anaH);
            
            isAnalyzingRef.current = true;
            try {
                await handsRef.current.send({ image: anaCv });
            } catch(e) {
                console.warn("MP Send Error:", e);
            } finally {
                isAnalyzingRef.current = false;
            }
        }
    };

    return {
        analyzeFrame,
        landmarksRef: prevLmsRef,
        tipRef: prevTipRef,
        holdLeftRef: holdLeftRef
    };
};
