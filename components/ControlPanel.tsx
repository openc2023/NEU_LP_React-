import React, { useRef, useState, useEffect } from 'react';
import { AppSettings, CircleConfig } from '../types';
import { generateId, generateMeshPoints } from '../utils';
import { 
  SectionLabel, PanelHeader, Slider, TextInput, Select, 
  Toggle, Button, ColorPicker, FileButton 
} from './UI';

interface ControlPanelProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  circles: CircleConfig[];
  setCircles: React.Dispatch<React.SetStateAction<CircleConfig[]>>;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onSaveLayout: () => void;
  onLoadLayout: (file: File) => void;
  onSaveDefault: () => void;
  backgroundImage: HTMLImageElement | null;
  setBackgroundImage: (img: HTMLImageElement | null) => void;
  performanceStats: string;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  settings,
  setSettings,
  circles,
  setCircles,
  editingId,
  setEditingId,
  onSaveLayout,
  onLoadLayout,
  onSaveDefault,
  setBackgroundImage,
  backgroundImage,
  performanceStats
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [showGlobalSettings, setShowGlobalSettings] = useState(true);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  // --- Logic: Device Enumeration ---
  useEffect(() => {
    const getDevices = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
        } catch (e) {
            console.warn("Device enumeration limited:", e);
        }
    };
    getDevices();
    const handleDeviceChange = () => getDevices();
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    const t = setTimeout(getDevices, 3000);
    return () => {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
        clearTimeout(t);
    };
  }, []);

  // --- Logic: Helpers ---
  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const updateCircle = (id: string, updates: Partial<CircleConfig>) => {
    setCircles(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const addCircle = () => {
    if (circles.length >= 8) return;
    const newCircle: CircleConfig = {
      id: generateId(),
      name: `Link ${circles.length + 1}`,
      x: 480, y: 360, radius: 50, lineWidth: 3, color: '#4cc9f0', volume: 1.0
    };
    setCircles(prev => [...prev, newCircle]);
    setEditingId(newCircle.id);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((e) => console.error(e));
    } else if (document.exitFullscreen) {
        document.exitFullscreen();
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>, type: 'layout' | 'bg') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (type === 'layout') {
      onLoadLayout(file);
    } else {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => setBackgroundImage(img);
      img.src = url;
    }
    e.target.value = '';
  };

  const updateMeshPoints = (count: number) => {
      updateSetting('mappingPoints', generateMeshPoints(count));
      updateSetting('mappingEnabled', true);
  };

  // --- Render ---

  return (
    <>
      {/* HUD Stats */}
      <div className="fixed left-4 top-4 z-40 bg-zinc-950/60 backdrop-blur-md text-cyan-400 px-4 py-2 rounded-sm font-tech text-xs border-l-2 border-cyan-500 shadow-lg select-none pointer-events-none">
        {performanceStats}
      </div>

      {/* Top Right Controls */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-3">
          <Button onClick={toggleFullscreen} variant="secondary" className="!rounded-full !px-3 !py-3 shadow-lg bg-zinc-900/90 backdrop-blur">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </Button>

          <Button 
            onClick={() => setIsOpen(!isOpen)} 
            variant="secondary" 
            className={`!rounded-full !px-3 !py-3 shadow-lg bg-zinc-900/90 backdrop-blur transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
             </svg>
          </Button>
      </div>

      {/* Main Drawer Panel */}
      <div 
        className={`fixed top-0 right-0 h-full w-80 bg-black/80 backdrop-blur-2xl border-l border-white/10 shadow-2xl z-40 transform transition-transform duration-500 cubic-bezier(0.19, 1, 0.22, 1) ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="h-full overflow-y-auto p-6 pt-20 scrollbar-thin">
            <PanelHeader title="SYSTEM CORE" version="V2.1" />
            
            {/* Global Settings Toggle */}
            <div className="mb-4">
                <Button 
                    variant="ghost" 
                    onClick={() => setShowGlobalSettings(!showGlobalSettings)}
                    className="w-full flex justify-between bg-zinc-900/30 border border-white/5"
                >
                    <span className="font-tech tracking-wider text-xs font-bold text-zinc-300">GLOBAL PARAMETERS</span>
                    <span className={`text-[10px] transform transition-transform ${showGlobalSettings ? 'rotate-180' : ''}`}>▼</span>
                </Button>
            </div>

            {/* Collapsible Global Area */}
            {showGlobalSettings && (
                <div className="space-y-6 animate-fadeIn">
                    
                    {/* Source Input */}
                    <div>
                        <SectionLabel>Input Source</SectionLabel>
                        <div className="flex bg-black/40 p-1 rounded-md border border-white/5 mb-3">
                            <button 
                                onClick={() => updateSetting('cameraType', 'standard')}
                                className={`flex-1 py-1.5 text-[10px] font-medium rounded transition-all ${settings.cameraType === 'standard' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                Standard
                            </button>
                            <button 
                                onClick={() => updateSetting('cameraType', 'professional')}
                                className={`flex-1 py-1.5 text-[10px] font-medium rounded transition-all ${settings.cameraType === 'professional' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                Femto Bolt
                            </button>
                        </div>
                        {settings.cameraType === 'standard' && (
                            <Select 
                                value={settings.deviceId}
                                onChange={(e) => updateSetting('deviceId', e.target.value)}
                            >
                                <option value="">Default Webcam</option>
                                {videoDevices.map(d => (
                                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0,5)}...`}</option>
                                ))}
                            </Select>
                        )}
                    </div>

                    {/* Environment */}
                    <div>
                        <SectionLabel>Environment</SectionLabel>
                        <ColorPicker label="Solid BG" value={settings.backgroundColor} onChange={(v) => updateSetting('backgroundColor', v)} />
                        <div className="mt-3 flex gap-2">
                             <Button onClick={() => bgInputRef.current?.click()} className="flex-1 text-[10px]" icon={
                                 <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                             }>
                                 {backgroundImage ? 'Replace Image' : 'Load Image'}
                             </Button>
                             {backgroundImage && <Button variant="danger" onClick={() => { setBackgroundImage(null); if(bgInputRef.current) bgInputRef.current.value = ''; }}>✕</Button>}
                             <input type="file" ref={bgInputRef} hidden accept="image/*" onChange={(e) => handleFilePick(e, 'bg')} />
                        </div>
                    </div>

                    {/* Display & Geometry */}
                    <div>
                        <SectionLabel>Display Configuration</SectionLabel>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                            <Select value={settings.rotationDeg} onChange={(e) => updateSetting('rotationDeg', Number(e.target.value))}>
                                <option value={0}>0° Rotation</option>
                                <option value={90}>90° CW</option>
                                <option value={180}>180°</option>
                                <option value={270}>270° CW</option>
                            </Select>
                            <Select value={settings.useCustomAspect ? 'custom' : `${settings.aspect[0]}:${settings.aspect[1]}`} onChange={(e) => {
                                if (e.target.value === 'custom') updateSetting('useCustomAspect', true);
                                else {
                                    const [w, h] = e.target.value.split(':').map(Number);
                                    updateSetting('useCustomAspect', false);
                                    updateSetting('aspect', [w, h]);
                                }
                            }}>
                                <option value="4:3">4:3 Aspect</option>
                                <option value="16:9">16:9 Aspect</option>
                                <option value="9:16">9:16 Vertical</option>
                                <option value="1:1">1:1 Square</option>
                            </Select>
                        </div>
                        <Slider label="Border Radius" rightLabel={`${settings.borderRadius}px`} min="0" max="200" value={settings.borderRadius} onChange={(e) => updateSetting('borderRadius', Number(e.target.value))} />
                        <Slider label="Global Zoom" rightLabel={`${settings.scale.toFixed(1)}x`} min="0.5" max="2.0" step="0.1" value={settings.scale} onChange={(e) => updateSetting('scale', Number(e.target.value))} />
                    </div>

                    {/* Mapping */}
                    <div className="bg-zinc-900/40 border border-white/5 p-3 rounded-lg">
                        <div className="flex justify-between items-center mb-3">
                            <span className="font-tech text-xs text-zinc-400">PROJECTION MESH</span>
                            <div className="flex gap-1">
                                {[4, 8, 12].map(num => (
                                    <button 
                                        key={num}
                                        onClick={() => updateMeshPoints(num)}
                                        className={`px-2 py-0.5 text-[9px] border rounded transition-colors ${settings.mappingPoints.length === num ? 'bg-cyan-900 text-cyan-300 border-cyan-500/50' : 'text-zinc-500 border-zinc-800 hover:text-zinc-300'}`}
                                    >
                                        {num}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <Button 
                            variant={settings.isMappingEdit ? 'primary' : 'secondary'}
                            onClick={() => updateSetting('isMappingEdit', !settings.isMappingEdit)}
                            className="w-full text-[10px] uppercase"
                        >
                            {settings.isMappingEdit ? 'Exit Edit Mode' : 'Edit Mesh Points'}
                        </Button>
                    </div>

                    {/* Toggles */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                         <Toggle label="Camera Feed" checked={settings.showCamera} onChange={(v) => updateSetting('showCamera', v)} />
                         <Toggle label="Mirror View" checked={settings.mirrorView} onChange={(v) => updateSetting('mirrorView', v)} />
                         <Toggle label="Skeleton" checked={settings.drawSkeleton} onChange={(v) => updateSetting('drawSkeleton', v)} />
                         <Toggle label="Dual Hands" checked={settings.maxHands === 2} onChange={(v) => updateSetting('maxHands', v ? 2 : 1)} />
                    </div>
                </div>
            )}
            
            <div className="my-6 border-t border-white/10" />

            {/* Interaction Zones Header */}
            <div className="flex items-center justify-between mb-4">
                 <PanelHeader title="ZONES" />
                 <Button variant="primary" onClick={addCircle} disabled={circles.length >= 8} className="!py-1 !px-2 !text-[10px]">
                    + ADD
                 </Button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 mb-6">
                <Button onClick={onSaveDefault} className="flex-1 text-[10px]">Save Default</Button>
                <Button onClick={onSaveLayout} className="flex-1 text-[10px]">Export</Button>
                <Button onClick={() => fileInputRef.current?.click()} className="flex-1 text-[10px]">Import</Button>
                <input type="file" ref={fileInputRef} hidden accept=".js,.json" onChange={(e) => handleFilePick(e, 'layout')} />
            </div>

            {/* Zones List */}
            <div className="space-y-3 pb-12">
                {circles.length === 0 && (
                    <div className="py-8 text-center border-2 border-dashed border-zinc-800 rounded-xl">
                        <p className="text-zinc-600 font-mono text-xs">NO ACTIVE ZONES</p>
                    </div>
                )}
                
                {circles.map((circle, index) => {
                    const isEditing = editingId === circle.id;
                    return (
                        <div 
                            key={circle.id}
                            onClick={() => setEditingId(circle.id)}
                            className={`relative rounded-xl border transition-all duration-300 overflow-hidden ${
                                isEditing 
                                ? 'bg-zinc-900 border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.1)]' 
                                : 'bg-zinc-900/30 border-white/5 hover:bg-zinc-900/60'
                            }`}
                        >
                             {/* Header */}
                             <div className="flex items-center justify-between p-3">
                                 <div className="flex items-center gap-2">
                                     <div className="w-2 h-2 rounded-full" style={{ backgroundColor: circle.color }}></div>
                                     {isEditing ? (
                                         <input 
                                             type="text" 
                                             value={circle.name}
                                             onChange={(e) => updateCircle(circle.id, { name: e.target.value })}
                                             onClick={(e) => e.stopPropagation()}
                                             className="bg-transparent text-cyan-400 font-bold text-xs border-b border-cyan-500/30 focus:outline-none w-32"
                                         />
                                     ) : (
                                         <span className="text-xs font-bold text-zinc-400">{circle.name}</span>
                                     )}
                                 </div>
                                 <button 
                                     onClick={(e) => { e.stopPropagation(); const c = circles.filter(i => i.id !== circle.id); setCircles(c); if(editingId===circle.id) setEditingId(null); }}
                                     className="text-zinc-600 hover:text-red-400 transition-colors"
                                 >
                                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                 </button>
                             </div>

                             {/* Details (Expanded) */}
                             {isEditing && (
                                 <div className="px-3 pb-4 space-y-4 bg-black/20 border-t border-white/5 pt-3 animate-fadeIn">
                                     
                                     {/* Geometry */}
                                     <div className="space-y-2">
                                         <Slider label="Radius" rightLabel={circle.radius.toString()} min="10" max="250" value={circle.radius} onChange={(e) => updateCircle(circle.id, { radius: Number(e.target.value) })} />
                                         <Slider label="Stroke" rightLabel={circle.lineWidth.toString()} min="1" max="20" value={circle.lineWidth} onChange={(e) => updateCircle(circle.id, { lineWidth: Number(e.target.value) })} />
                                         <ColorPicker label="Color" value={circle.color} onChange={(v) => updateCircle(circle.id, { color: v })} />
                                     </div>

                                     {/* Media */}
                                     <div className="pt-2 border-t border-white/5 space-y-3">
                                         <div>
                                            <div className="flex justify-between mb-1"><span className="text-[10px] text-zinc-500 font-semibold">VISUAL</span></div>
                                            <div className="flex gap-2">
                                                <TextInput placeholder="Image URL..." value={circle.imgPath || ''} onChange={(e) => updateCircle(circle.id, { imgPath: e.target.value })} />
                                                <FileButton accept="image/*" onFileSelect={(f) => updateCircle(circle.id, { imgPath: URL.createObjectURL(f) })} />
                                            </div>
                                         </div>

                                         <div>
                                            <div className="flex justify-between mb-1"><span className="text-[10px] text-zinc-500 font-semibold">AUDIO</span></div>
                                            <div className="flex gap-2 mb-2">
                                                <TextInput placeholder="Audio URL..." value={circle.audioPath || ''} onChange={(e) => updateCircle(circle.id, { audioPath: e.target.value })} />
                                                <FileButton accept="audio/*" onFileSelect={(f) => updateCircle(circle.id, { audioPath: URL.createObjectURL(f) })} />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <svg className="w-3 h-3 text-zinc-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414z"/></svg>
                                                <input 
                                                    type="range" min="0" max="1" step="0.05" 
                                                    value={circle.volume ?? 1.0} 
                                                    onChange={(e) => updateCircle(circle.id, { volume: parseFloat(e.target.value) })}
                                                    className="flex-1 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                                                />
                                            </div>
                                         </div>
                                     </div>
                                 </div>
                             )}
                        </div>
                    );
                })}
            </div>
        </div>
      </div>
    </>
  );
};

export default ControlPanel;