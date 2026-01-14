import React, { useState, useEffect } from 'react';
import CanvasLayer from './components/CanvasLayer';
import ControlPanel from './components/ControlPanel';
import { BridgeManager } from './components/BridgeManager';
import { AppSettings, CircleConfig, DEFAULT_SETTINGS } from './types';

const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [circles, setCircles] = useState<CircleConfig[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);
  const [perfStats, setPerfStats] = useState("-");
  
  // Lifted state for Bridge Manager to control CanvasLayer pausing
  const [showBridge, setShowBridge] = useState(false);

  // Load from LocalStorage on Mount
  useEffect(() => {
    const savedConfig = localStorage.getItem('NEU_DEFAULT_CONFIG');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        if (parsed.settings) setSettings(parsed.settings);
        if (parsed.circles) {
            // Migration: Ensure 'name' exists
            const migratedCircles = parsed.circles.map((c: any, i: number) => ({
                ...c,
                name: c.name || `Circle ${i + 1}`
            }));
            setCircles(migratedCircles);
        }
      } catch (e) {
        console.error("Failed to load saved config", e);
      }
    }
  }, []);

  // Listen for mapping updates from CanvasLayer interaction
  useEffect(() => {
    const handleUpdate = (e: any) => {
        const { index, point } = e.detail;
        setSettings(prev => {
            const newPoints = [...prev.mappingPoints];
            newPoints[index] = point;
            return { ...prev, mappingPoints: newPoints };
        });
    };
    window.addEventListener('updateMappingPoint', handleUpdate);
    return () => window.removeEventListener('updateMappingPoint', handleUpdate);
  }, []);

  // Keyboard Shortcuts for resizing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!editingId) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;

      const isLeftBracket = e.key === '[' || e.key === '【';
      const isRightBracket = e.key === ']' || e.key === '】';

      if (e.shiftKey && (isLeftBracket || isRightBracket)) {
        e.preventDefault();
        setCircles(prev => prev.map(c => {
          if (c.id !== editingId) return c;
          const step = e.altKey ? 20 : 5;
          const change = isRightBracket ? step : -step;
          return { ...c, radius: Math.max(10, c.radius + change) };
        }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingId]);

  const saveLayout = () => {
    const data = {
        version: 'react-1.0',
        circles,
        settings,
        hasBackground: !!backgroundImage
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neu-layout-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const loadLayout = (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
          try {
             const json = JSON.parse(e.target?.result as string);
             if(json.circles) {
                 const migrated = json.circles.map((c: any, i: number) => ({
                     ...c,
                     name: c.name || `Circle ${i + 1}`
                 }));
                 setCircles(migrated);
             }
             if(json.settings) setSettings(prev => ({...prev, ...json.settings}));
             setEditingId(null);
          } catch(err) {
              alert("Failed to load layout JSON");
          }
      }
      reader.readAsText(file);
  }

  const saveDefault = () => {
     try {
       const data = { settings, circles };
       localStorage.setItem('NEU_DEFAULT_CONFIG', JSON.stringify(data));
       console.log("Configuration saved as default");
       alert("Current settings saved as default startup configuration.");
     } catch(e) {
       console.error("Failed to save to local storage", e);
       alert("Failed to save settings to browser storage.");
     }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0b0f14] relative">
      <CanvasLayer 
        settings={settings}
        circles={circles}
        setCircles={setCircles}
        editingId={editingId}
        setEditingId={setEditingId}
        backgroundImage={backgroundImage}
        onStatsUpdate={setPerfStats}
        isPaused={showBridge} // Pause camera when bridge is open to prevent WS conflict
      />
      
      <ControlPanel 
        settings={settings}
        setSettings={setSettings}
        circles={circles}
        setCircles={setCircles}
        editingId={editingId}
        setEditingId={setEditingId}
        onSaveLayout={saveLayout}
        onLoadLayout={loadLayout}
        onSaveDefault={saveDefault}
        backgroundImage={backgroundImage}
        setBackgroundImage={setBackgroundImage}
        performanceStats={perfStats}
        onOpenBridge={() => setShowBridge(true)}
      />

      <BridgeManager 
        isOpen={showBridge} 
        onClose={() => setShowBridge(false)} 
        wsUrl={settings.wsUrl}
      />
    </div>
  );
};

export default App;