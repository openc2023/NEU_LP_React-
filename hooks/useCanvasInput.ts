
import { useRef, useState } from 'react';
import { AppSettings, CircleConfig, Point } from '../types';

interface UseCanvasInputProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  settings: AppSettings;
  circles: CircleConfig[];
  setCircles: React.Dispatch<React.SetStateAction<CircleConfig[]>>;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
}

export const useCanvasInput = ({
  canvasRef, settings, circles, setCircles, editingId, setEditingId
}: UseCanvasInputProps) => {
  const draggingRef = useRef<{active: boolean, offset: Point}>({ active: false, offset: {x:0, y:0} });
  const [draggingPointIndex, setDraggingPointIndex] = useState<number | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if(!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvasRef.current.width / rect.width);
    const y = (e.clientY - rect.top) * (canvasRef.current.height / rect.height);
    
    // Mapping Edit Hit
    if (settings.isMappingEdit) {
        const w = canvasRef.current.width;
        const h = canvasRef.current.height;
        const hitIdx = settings.mappingPoints.findIndex(p => {
             const px = p.x * w;
             const py = p.y * h;
             return Math.sqrt((x-px)**2 + (y-py)**2) < 20; 
        });
        if (hitIdx !== -1) {
            setDraggingPointIndex(hitIdx);
            return;
        }
        return;
    }

    // Circle Hit
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

    if (settings.isMappingEdit && draggingPointIndex !== null) {
        const w = canvasRef.current.width;
        const h = canvasRef.current.height;
        const nx = Math.max(0, Math.min(1, x / w));
        const ny = Math.max(0, Math.min(1, y / h));

        const event = new CustomEvent('updateMappingPoint', { detail: { index: draggingPointIndex, point: {x: nx, y: ny} } });
        window.dispatchEvent(event);
        return;
    }

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

  return { handleMouseDown, handleMouseMove, handleMouseUp };
};
