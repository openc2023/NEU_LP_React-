

export interface Point {
  x: number;
  y: number;
  depth?: number; // Depth in mm, optional
}

export interface RemoteHand {
    landmarks: { x: number; y: number; z: number; depth_mm?: number }[];
    gesture?: string;
    score?: number;
}

export interface CircleConfig {
  id: string;
  name: string; // User-editable name
  x: number;
  y: number;
  radius: number;
  lineWidth: number;
  color: string;
  imgPath?: string;
  audioPath?: string;
  volume?: number; // 0.0 to 1.0
  isGif?: boolean;
}

// Runtime state that changes every frame (physics)
export interface CircleRuntime {
  isFilled: boolean;
  wasFilled: boolean; // For edge detection
  graceLeft: number;
  lastAngle: number | null;
  cwAccum: number; // Clockwise accumulation
  rotAngle: number; // Visual rotation for media
  lastCWTime: number;
  isHandInside: boolean;
  
  // Media Elements
  imgEl: HTMLImageElement | null;
  audioEl: HTMLAudioElement | null;
  gifAnim: any | null; // Gifler instance
  gifCanvas: HTMLCanvasElement | null;
  _resumeTime?: number;
}

export interface AppSettings {
  rotationDeg: number;
  aspect: [number, number];
  baseShortSide: number; // Display resolution short side
  analysisShortSide: number; // Analysis resolution short side
  scale: number;
  analysisFPS: number;
  showCamera: boolean;
  mirrorView: boolean;
  drawSkeleton: boolean;
  maxHands: number;
  useCustomAspect: boolean;
  // Camera Selection
  cameraType: 'standard' | 'professional';
  deviceId: string;
  // Professional / WebSocket
  wsUrl: string;
  cameraIp: string; // For Femto Mega Ethernet
  depthTriggerMm: number; // Z-axis threshold in mm
  streamMode: 'color' | 'depth'; // NEW: Stream visualization mode
  // Visuals
  backgroundColor: string;
  // Projection / Geometry
  borderRadius: number;
  mappingEnabled: boolean;
  isMappingEdit: boolean;
  mappingPoints: Point[]; // Normalized 0-1
}

export const DEFAULT_SETTINGS: AppSettings = {
  rotationDeg: 0,
  aspect: [4, 3],
  baseShortSide: 720,
  analysisShortSide: 480,
  scale: 1.0,
  analysisFPS: 30,
  showCamera: false,
  mirrorView: true,
  drawSkeleton: true,
  maxHands: 1,
  useCustomAspect: false,
  cameraType: 'standard',
  deviceId: '',
  wsUrl: 'ws://localhost:8765',
  cameraIp: '', // Empty means USB mode
  depthTriggerMm: 1800, // Trigger when hand is closer than 1.8m (Increased for distance)
  streamMode: 'color', // Default to color stream
  backgroundColor: '#0b0f14',
  borderRadius: 16,
  mappingEnabled: false,
  isMappingEdit: false,
  // Default 4 corners (TL, TR, BR, BL)
  mappingPoints: [
    {x: 0, y: 0}, 
    {x: 1, y: 0}, 
    {x: 1, y: 1}, 
    {x: 0, y: 1}
  ]
};

// Global declarations for external libraries loaded via CDN
declare global {
  interface Window {
    Hands: any;
    Camera: any;
    drawConnectors: any;
    drawLandmarks: any;
    gifler: any;
  }
}
