
import { useEffect, useRef, useState } from 'react';
import { RemoteHand } from '../types';

interface UseWebSocketFeedProps {
  url: string;
  isActive: boolean;
  onStats: (msg: string) => void;
  targetIp?: string;
  streamMode?: 'color' | 'depth'; 
}

export const useWebSocketFeed = ({ url, isActive, onStats, targetIp, streamMode = 'color' }: UseWebSocketFeedProps) => {
  // Use a persistent canvas that doesn't get recreated
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = 1; 
      canvasRef.current.height = 1;
  }
  
  const depthRef = useRef<number>(0);
  const handsRef = useRef<RemoteHand[] | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const lastFrameTimeRef = useRef<number>(0);
  
  // Watchdog ref to track if we are receiving data
  const [retryKey, setRetryKey] = useState(0);

  // Map UI mode to Python Backend `vision_source`
  const getVisionSource = (mode: string) => {
      if (mode === 'depth') return 'depth_vis';
      return 'color';
  };

  // Separate effect to handle live config updates without reconnecting
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log("[WS] Sending config update...", { streamMode });
        wsRef.current.send(JSON.stringify({
            command: 'set_config',
            config: { 
                target_ip: targetIp || null,
                vision_source: getVisionSource(streamMode)
            }
        }));
    }
  }, [targetIp, streamMode, isConnected]); 

  useEffect(() => {
    if (!isActive) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    let normalizedUrl = url;
    if (normalizedUrl.startsWith('https://')) normalizedUrl = normalizedUrl.replace('https://', 'wss://');
    else if (normalizedUrl.startsWith('http://')) normalizedUrl = normalizedUrl.replace('http://', 'ws://');

    const ws = new WebSocket(normalizedUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      onStats("WS_LINK_ESTABLISHED");
      console.log("[WS] Connected. Initializing...");
      
      ws.send(JSON.stringify({
         command: 'set_config',
         config: { 
             target_ip: targetIp || null,
             vision_source: getVisionSource(streamMode)
         }
      }));
      
      lastFrameTimeRef.current = performance.now();
    };

    ws.onclose = () => {
      setIsConnected(false);
      onStats("WS_LINK_CLOSED");
    };

    ws.onerror = () => {
      onStats("WS_LINK_ERROR");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // 1. Center Depth
        if (data.center_depth_mm !== undefined) {
          depthRef.current = data.center_depth_mm;
        }

        // 2. Structured Hand Data
        if (data.hands) {
            handsRef.current = data.hands;
        } else {
            // If backend sends gesture type but no hands, clear it
            if (data.type === 'gesture' && (!data.hands || data.hands.length === 0)) {
                handsRef.current = [];
            }
        }

        // 3. Image Data
        if (data.image) {
          const img = new Image();
          img.onload = () => {
            const cv = canvasRef.current;
            if (cv) {
                if (cv.width !== img.width || cv.height !== img.height) {
                  cv.width = img.width;
                  cv.height = img.height;
                }
                const ctx = cv.getContext('2d', { alpha: false });
                if (ctx) {
                  ctx.drawImage(img, 0, 0);
                  lastFrameTimeRef.current = performance.now();
                }
            }
          };
          img.src = "data:image/jpeg;base64," + data.image;
        } else if (data.type === 'gesture') {
           // Keep alive if only data is sent
           lastFrameTimeRef.current = performance.now();
        }

      } catch (e) {
         // silent
      }
    };

    const wdInterval = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            const timeSinceLastFrame = performance.now() - lastFrameTimeRef.current;
            if (timeSinceLastFrame > 2500) {
                console.warn("[WS Watchdog] Stream frozen (>2.5s). Reconnecting...");
                onStats("WS_FROZEN_RETRYING...");
                ws.close(); 
                setRetryKey(k => k + 1);
            }
        }
    }, 1000);

    return () => {
      window.clearInterval(wdInterval);
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [url, isActive, retryKey]);

  return {
    feedCanvas: canvasRef.current,
    depthMm: depthRef.current,
    hands: handsRef.current,
    isConnected,
    lastFrameTime: lastFrameTimeRef.current
  };
};
