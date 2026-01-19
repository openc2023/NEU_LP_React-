
import React, { useRef, useEffect } from 'react';
import { AppSettings, Point, RemoteHand } from '../types';
import { smoothLandmarks, smoothPoint } from '../utils';

const SMOOTH_ALPHA = 0.35;
const INDEX_TIP = 8;
const HOLD_FRAMES = 0; 

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
    const sourceStatsRef = useRef<{width: number, height: number}>({width: 640, height: 480});
    
    const analysisCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
    
    const settingsRef = useRef(settings);
    useEffect(() => { settingsRef.current = settings; }, [settings]);

    /**
     * 由于分析画布 (analysisCanvas) 现在只包含可见区域，
     * MediaPipe 返回的坐标已经对应了视口。
     * 我们只需要处理 UI 层的旋转和镜像。
     */
    const transformCoords = (rawX: number, rawY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: rawX, y: rawY };

        const cw = canvas.width;
        const ch = canvas.height;
        const s = settingsRef.current;

        // AI 返回的是 0-1 坐标，相对于送入的“已裁剪图片”
        let px = rawX * cw;
        let py = rawY * ch;

        // 1. 处理镜像 (视觉镜像对齐)
        if (s.mirrorView) {
            px = cw - px;
        }

        // 2. 处理旋转 (相对于 Canvas 中心)
        if (s.rotationDeg !== 0) {
            const cx = cw / 2;
            const cy = ch / 2;
            const rad = s.rotationDeg * (Math.PI / 180);
            const dx = px - cx;
            const dy = py - cy;
            const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
            const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
            px = rx + cx;
            py = ry + cy;
        }

        return { x: px / cw, y: py / ch };
    };

    useEffect(() => {
        let isMounted = true;
        let retryInterval: number;

        const attemptInit = () => {
            if (handsRef.current) return;
            if (window.Hands) {
                try {
                    const hands = new window.Hands({
                        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
                    });
                    
                    hands.setOptions({
                        maxNumHands: settingsRef.current.maxHands,
                        modelComplexity: 1,
                        minDetectionConfidence: 0.5,
                        minTrackingConfidence: 0.5,
                        selfieMode: false 
                    });

                    hands.onResults((results: any) => {
                        if (!isMounted) return;
                        isAnalyzingRef.current = false;
                        
                        const width = canvasRef.current?.width || 800;
                        const height = canvasRef.current?.height || 600;

                        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                            const rawHand = results.multiHandLandmarks[0];
                            const transformedLms = rawHand.map((p: any) => transformCoords(p.x, p.y));
                            
                            const smoothLms = smoothLandmarks(prevLmsRef.current, transformedLms, SMOOTH_ALPHA);
                            prevLmsRef.current = smoothLms;
                            
                            const tipPixel = { 
                                x: smoothLms[INDEX_TIP].x * width, 
                                y: smoothLms[INDEX_TIP].y * height 
                            };
                            
                            prevTipRef.current = smoothPoint(prevTipRef.current, tipPixel, 0.5);
                            holdLeftRef.current = HOLD_FRAMES;
                        } else if (holdLeftRef.current > 0 && prevTipRef.current) {
                            holdLeftRef.current--;
                        } else {
                            prevTipRef.current = null;
                            prevLmsRef.current = null;
                        }

                        onStats(`AI_COST:${(performance.now() - lastAnalyzeRef.current).toFixed(0)}ms`);
                    });
                    
                    handsRef.current = hands;
                } catch (e) { console.error("[MP] Init Error", e); }
            }
        };

        attemptInit();
        retryInterval = window.setInterval(() => {
            if (!handsRef.current) attemptInit();
            else clearInterval(retryInterval);
        }, 500);

        return () => {
            isMounted = false;
            clearInterval(retryInterval);
            if (handsRef.current) try { handsRef.current.close(); } catch(e){}
        };
    }, []);

    /**
     * 关键函数：物理裁剪采样。
     * 只将当前可见的画面区域提取出来并送入 AI。
     */
    const analyzeFrame = async (source: HTMLVideoElement | HTMLCanvasElement, now: number, extData?: RemoteHand[] | null) => {
        const s = settingsRef.current;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const srcW = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
        const srcH = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
        if (!srcW || !srcH) return;
        sourceStatsRef.current = { width: srcW, height: srcH };

        // 外部深度相机逻辑
        if (extData && extData.length > 0) {
            const h = extData[0];
            const transformedLms = h.landmarks.map(p => transformCoords(p.x, p.y));
            prevLmsRef.current = smoothLandmarks(prevLmsRef.current, transformedLms, SMOOTH_ALPHA);
            const width = canvas.width;
            const height = canvas.height;
            const tp = { 
                x: prevLmsRef.current[INDEX_TIP].x * width, 
                y: prevLmsRef.current[INDEX_TIP].y * height, 
                depth: h.landmarks[INDEX_TIP].depth_mm 
            };
            prevTipRef.current = smoothPoint(prevTipRef.current, tp, 0.5);
            holdLeftRef.current = HOLD_FRAMES;
            return;
        }

        if (!handsRef.current || isAnalyzingRef.current || now < nextAnalyzeDueRef.current) return;

        lastAnalyzeRef.current = now;
        nextAnalyzeDueRef.current = now + (1000 / s.analysisFPS);

        // --- 核心物理裁剪逻辑 ---
        const anaCv = analysisCanvasRef.current;
        const targetW = canvas.width;
        const targetH = canvas.height;
        
        // 1. 设置分析画布的大小（保持显示宽高比，但低分辨率以提速）
        const anaShort = s.analysisShortSide;
        const ratio = targetW / targetH;
        if (targetW > targetH) {
            anaCv.width = Math.round(anaShort * ratio);
            anaCv.height = anaShort;
        } else {
            anaCv.width = anaShort;
            anaCv.height = Math.round(anaShort / ratio);
        }

        const ctx = anaCv.getContext('2d', { alpha: false, willReadFrequently: true });
        if(ctx) {
            // 2. 计算在原始视频中的采样区域 (Cover 逻辑的逆运算)
            const scaleW = targetW / srcW;
            const scaleH = targetH / srcH;
            const baseScale = Math.max(scaleW, scaleH);
            const finalScale = baseScale * s.scale;

            // 在原始图像中，视口占据的大小
            const sampleW = targetW / finalScale;
            const sampleH = targetH / finalScale;
            
            // 采样起点 (居中采样)
            const sx = (srcW - sampleW) / 2;
            const sy = (srcH - sampleH) / 2;

            ctx.save();
            // 处理旋转 (如果 AI 输入也需要同步旋转的话)
            if (s.rotationDeg !== 0) {
                ctx.translate(anaCv.width/2, anaCv.height/2);
                ctx.rotate(s.rotationDeg * Math.PI / 180);
                ctx.translate(-anaCv.width/2, -anaCv.height/2);
            }
            
            // 执行物理裁剪绘制：只取原始画面中可见的那一块
            ctx.drawImage(source, sx, sy, sampleW, sampleH, 0, 0, anaCv.width, anaCv.height);
            ctx.restore();

            isAnalyzingRef.current = true;
            try { 
                await handsRef.current.send({ image: anaCv }); 
            } catch(e) { 
                isAnalyzingRef.current = false; 
            }
        }
    };

    return { analyzeFrame, landmarksRef: prevLmsRef, tipRef: prevTipRef };
};
