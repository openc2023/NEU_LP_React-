
import { Point } from './types';

export function normalizeUrl(url: string): string {
  if (!url) return '';
  
  // Fix for GitHub Blob URLs (convert to raw content)
  // Input: https://github.com/user/repo/blob/branch/file.mp3
  // Output: https://raw.githubusercontent.com/user/repo/branch/file.mp3
  if (url.includes('github.com') && url.includes('/blob/')) {
    return url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
  }
  
  return url;
}

export function smoothPoint(prev: Point | null, curr: Point, alpha: number): Point {
  if (!prev) return curr;
  return {
    x: prev.x * (1 - alpha) + curr.x * alpha,
    y: prev.y * (1 - alpha) + curr.y * alpha,
    depth: curr.depth // Pass through depth (usually doesn't need heavy smoothing or can be jumpy)
  };
}

export function smoothLandmarks(prev: Point[] | null, curr: Point[], alpha: number = 0.8): Point[] {
  if (!prev || prev.length !== curr.length) return curr;
  return curr.map((p, i) => ({
    x: prev[i].x * (1 - alpha) + p.x * alpha,
    y: prev[i].y * (1 - alpha) + p.y * alpha,
    depth: p.depth // Preserve depth if present
  }));
}

export function calculateAngle(cx: number, cy: number, px: number, py: number): number {
  return Math.atan2(py - cy, px - cx) * (180 / Math.PI);
}

export function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

// Media loading helpers
export const IMAGE_DIR = './img/';
export const AUDIO_DIR = './audio/';

export const isGif = (path: string) => /\.gif(\?.*)?$/i.test(path);

// Generates a rectangular distribution of points
// count: 4, 8, or 12
export function generateMeshPoints(count: number): Point[] {
  if (count === 4) {
    return [{x:0,y:0}, {x:1,y:0}, {x:1,y:1}, {x:0,y:1}];
  }
  
  const points: Point[] = [];
  const sideCount = count / 4; // points per side roughly
  
  // Top edge (Left to Right)
  for(let i=0; i<sideCount; i++) points.push({ x: i/sideCount, y: 0 });
  // Right edge (Top to Bottom)
  for(let i=0; i<sideCount; i++) points.push({ x: 1, y: i/sideCount });
  // Bottom edge (Right to Left)
  for(let i=0; i<sideCount; i++) points.push({ x: 1 - (i/sideCount), y: 1 });
  // Left edge (Bottom to Top)
  for(let i=0; i<sideCount; i++) points.push({ x: 0, y: 1 - (i/sideCount) });
  
  return points;
}
