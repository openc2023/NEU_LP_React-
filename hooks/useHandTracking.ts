
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
    
    // Fix: Use ref to track settings to avoid stale closures in the render loop
    const settingsRef = useRef(settings);
    useEffect(() => { settingsRef.current = settings; }, [settings]);

    // 1. Initialize MediaPipe Hands (Robust Loading with Retry)
    useEffect(() => {
        let isMounted = true;
        let retryInterval: number;

        const attemptInit = () => {
            if (handsRef.current) return; // Already initialized

            if (window.Hands) {
                try {
                    console.log("[MP] Attempting to initialize MediaPipe Hands...");
                    const hands = new window.Hands({
                        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
                    });
                    
                    // Initial options - Low confidence for better distance detection
                    hands.setOptions({
                        maxNumHands: settingsRef.current.maxHands,
                        modelComplexity: 1,
                        minDetectionConfidence: 0.3, // Lowered for distance
                        minTrackingConfidence: 0.3,  // Lowered for distance
                        selfieMode: settingsRef.current.mirrorView
                    });

                    hands.onResults((results: any) => {
                        if (!isMounted) return;
                        
                        const width = canvasRef.current?.width || 800;
                        const height = canvasRef.current?.height || 600;

                        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                            // Fix: Keep landmarks normalized (0-1) for the renderer
                            const rawLms = results.multiHandLandmarks[0].map((p: any) => ({x: p.x, y: p.y}));
                            
                            // Smooth normalized landmarks
                            const smoothLms = smoothLandmarks(prevLmsRef.current, rawLms, SMOOTH_ALPHA);
                            prevLmsRef.current = smoothLms;
                            
                            // Calculate Tip in PIXELS for Physics & Pointer Ring
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

        // Try immediately
        attemptInit();

        // Retry loop in case script is loading slowly from CDN
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
    }, []); // Run once on mount

    // 2. Handle Dynamic Options Updates
    useEffect(() => {
        if (handsRef.current) {
            handsRef.current.setOptions({
                selfieMode: settings.mirrorView,
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
        // Always use current settings from ref to avoid closure staleness
        const currentSettings = settingsRef.current;
        const width = canvasRef.current?.width || 800;
        const height = canvasRef.current?.height || 600;

        // --- MODE A: External Data (Professional Mode - Server Side AI) ---
        if (externalData && externalData.length > 0) {
            // We trust the backend data (usually 30fps+), but we still apply smoothing for UI
            const hand = externalData[0]; // TODO: Support multi-hand
            
            // Map Remote Landmarks. Assume remote sends Normalized (0-1).
            const rawLms = hand.landmarks.map((p) => ({
                x: p.x, 
                y: p.y,
                depth: p.depth_mm // Capture remote depth
            }));

            // Apply existing smoothing logic on normalized data
            const smoothLms = smoothLandmarks(prevLmsRef.current, rawLms, SMOOTH_ALPHA);
            prevLmsRef.current = smoothLms;

            // Calculate Tip in PIXELS
            const rawTipNorm = smoothLms[INDEX_TIP];
            const tipPixel = {
                x: rawTipNorm.x * width,
                y: rawTipNorm.y * height,
                depth: rawTipNorm.depth
            };

            const tip = smoothPoint(prevTipRef.current, tipPixel, 0.5);
            prevTipRef.current = tip;
            holdLeftRef.current = HOLD_FRAMES;
            
            // No need to send to MediaPipe, just return
            return;
        } 
        
        // --- MODE B: Local MediaPipe Fallback ---
        // If we are here, either:
        // 1. Standard Camera Mode
        // 2. Professional Mode BUT Backend sent empty hands (Hybrid Mode)

        // Basic throttle & lock check
        // Also check if handsRef is initialized
        if (!handsRef.current || isAnalyzingRef.current || now < nextAnalyzeDueRef.current) return;

        lastAnalyzeRef.current = now;
        nextAnalyzeDueRef.current = now + (1000 / currentSettings.analysisFPS);

        const anaCv = analysisCanvasRef.current;
        const anaShort = currentSettings.analysisShortSide;
        
        const srcW = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
        const srcH = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
        if (!srcW || !srcH) return;

        // Downscale logic
        const scaleFactor = Math.min(1, anaShort / Math.min(srcW, srcH));
        const anaW = Math.round(srcW * scaleFactor);
        const anaH = Math.round(srcH * scaleFactor);

        if (anaCv.width !== anaW || anaCv.height !== anaH) {
            anaCv.width = anaW; anaCv.height = anaH;
        }

        const ctx = anaCv.getContext('2d', { alpha: false, willReadFrequently: true });
        if(ctx) {
            ctx.drawImage(source, 0, 0, anaW, anaH);
            
            isAnalyzingRef.current = true;
            try {
                await handsRef.current.send({ image: anaCv });
            } catch(e) {
                console.warn("MP Send Error:", e);
            } finally {
                // Always release the lock
                isAnalyzingRef.current = false;
            }
        }
    };

    return {
        analyzeFrame,
        landmarksRef: prevLmsRef, // Return the REF object
        tipRef: prevTipRef,       // Return the REF object
        holdLeftRef: holdLeftRef  // Return the REF object
    };
};
