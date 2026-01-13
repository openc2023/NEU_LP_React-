import React, { useRef, useState, useEffect } from 'react';
import { AppSettings, CircleConfig } from '../types';
import { generateId, generateMeshPoints } from '../utils';

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

// Reusable UI Components defined outside to prevent re-creation and fix type inference
const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">{children}</div>
);

const InputBaseClass = "w-full bg-black/40 border border-white/5 text-zinc-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all placeholder:text-zinc-700";
const ButtonBaseClass = "flex-1 py-1.5 px-3 rounded text-xs font-medium transition-all duration-200 border border-transparent";

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

  // Fetch video devices on mount
  useEffect(() => {
    const getDevices = async () => {
        try {
            // Attempt to enumerate devices without forcing a permission prompt here.
            // Labels will be empty until the main camera (CanvasLayer) gets permission.
            const devices = await navigator.mediaDevices.enumerateDevices();
            setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
        } catch (e) {
            console.warn("Device enumeration limited or failed:", e);
        }
    };

    getDevices();
    
    // Listen for device changes (e.g. when permission is granted by the main camera view)
    const handleDeviceChange = () => getDevices();
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    
    // Fallback check after a delay to ensure list is populated if permission comes late
    const t = setTimeout(getDevices, 3000);

    return () => {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
        clearTimeout(t);
    };
  }, []);

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
      name: `Circle ${circles.length + 1}`,
      x: 480, // Center-ish default
      y: 360,
      radius: 50,
      lineWidth: 3,
      color: '#4cc9f0',
      volume: 1.0
    };
    setCircles(prev => [...prev, newCircle]);
    setEditingId(newCircle.id);
  };

  const removeCircle = (id: string) => {
    setCircles(prev => prev.filter(c => c.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((e) => {
            console.error("Error attempting to enable fullscreen:", e);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
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

  const clearBackgroundImage = () => {
    setBackgroundImage(null);
    if(bgInputRef.current) bgInputRef.current.value = '';
  };

  const updateMeshPoints = (count: number) => {
      updateSetting('mappingPoints', generateMeshPoints(count));
      updateSetting('mappingEnabled', true);
  };

  return (
    <>
      {/* Performance Stats HUD */}
      <div className="fixed left-4 top-4 z-40 bg-black/40 backdrop-blur-md text-zinc-400 px-3 py-1.5 rounded-full font-mono text-[10px] border border-white/5 shadow-lg select-none pointer-events-none">
        {performanceStats}
      </div>

      {/* Top Right Controls Group */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
          {/* Fullscreen Button */}
          <button 
             onClick={toggleFullscreen}
             className="p-2 rounded-full bg-zinc-900/80 text-zinc-400 border border-white/10 hover:bg-zinc-800 hover:text-white hover:border-white/20 transition-all shadow-lg backdrop-blur-sm"
             title="Toggle Fullscreen"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>

          {/* Toggle Panel Button */}
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className={`p-2 rounded-full bg-zinc-900/80 text-zinc-400 border border-white/10 hover:bg-zinc-800 hover:text-white hover:border-white/20 transition-all shadow-lg backdrop-blur-sm ${isOpen ? 'rotate-180' : ''}`}
          >
            {isOpen ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
            )}
          </button>
      </div>

      {/* Main Panel Container */}
      <div 
        className={`fixed top-0 right-0 h-full w-80 bg-zinc-950/90 backdrop-blur-xl border-l border-white/5 shadow-2xl z-40 transform transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="h-full overflow-y-auto p-5 pt-20 scrollbar-thin">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                <h3 className="text-zinc-100 font-bold text-sm tracking-wide">CONFIGURATION</h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">V1.0</span>
            </div>
            
            {/* Global Settings Toggle Header */}
            <button 
                onClick={() => setShowGlobalSettings(!showGlobalSettings)}
                className="flex items-center justify-between w-full mb-4 px-2 py-1.5 bg-zinc-900/50 hover:bg-zinc-800 rounded border border-white/5 transition-colors group"
            >
                <span className="text-[10px] font-bold text-zinc-400 group-hover:text-zinc-200 tracking-wider">GLOBAL SETTINGS</span>
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 text-zinc-500 transition-transform ${showGlobalSettings ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Collapsible Global Settings Area */}
            {showGlobalSettings && (
                <div className="animate-fadeIn">
                    {/* Camera Settings */}
                    <div className="mb-6 pb-6 border-b border-white/5">
                        <SectionLabel>Input Source</SectionLabel>
                        
                        {/* Source Toggle */}
                        <div className="flex bg-black/40 p-1 rounded-lg border border-white/5 mb-3">
                            <button 
                                onClick={() => updateSetting('cameraType', 'standard')}
                                className={`flex-1 py-1.5 text-[10px] font-medium rounded transition-all ${settings.cameraType === 'standard' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                Standard
                            </button>
                            <button 
                                onClick={() => updateSetting('cameraType', 'professional')}
                                className={`flex-1 py-1.5 text-[10px] font-medium rounded transition-all ${settings.cameraType === 'professional' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                Professional
                            </button>
                        </div>

                        {settings.cameraType === 'standard' ? (
                            <div className="flex flex-col">
                                <select 
                                value={settings.deviceId}
                                onChange={(e) => updateSetting('deviceId', e.target.value)}
                                className={InputBaseClass}
                                >
                                    <option value="">Default Camera</option>
                                    {videoDevices.map(d => (
                                        <option key={d.deviceId} value={d.deviceId}>
                                            {d.label || `Camera ${d.deviceId.slice(0, 5)}...`}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div className="p-3 bg-zinc-900/50 rounded border border-cyan-900/30 text-center">
                                <p className="text-[10px] text-cyan-400 font-medium">Orbbec Femto Bolt</p>
                                <p className="text-[9px] text-zinc-500 mt-1">3D Depth Sensing ready</p>
                            </div>
                        )}
                    </div>

                    {/* Background Settings */}
                    <div className="mb-6 pb-6 border-b border-white/5">
                        <SectionLabel>Background</SectionLabel>
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-zinc-400">Solid Color</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono text-zinc-500">{settings.backgroundColor}</span>
                                    <div className="h-6 w-8 rounded overflow-hidden border border-white/10 relative">
                                        <input 
                                            type="color" 
                                            value={settings.backgroundColor} 
                                            onChange={(e) => updateSetting('backgroundColor', e.target.value)} 
                                            className="absolute -top-2 -left-2 w-[200%] h-[200%] cursor-pointer p-0 m-0"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button onClick={() => bgInputRef.current?.click()} className={`${ButtonBaseClass} bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-200`}>
                                    {backgroundImage ? 'Change Image' : 'Upload Image'}
                                </button>
                                {backgroundImage && (
                                    <button onClick={clearBackgroundImage} className="px-3 py-1.5 rounded text-xs font-medium bg-red-900/30 text-red-400 border border-red-500/20 hover:bg-red-900/50">
                                        ✕
                                    </button>
                                )}
                                <input type="file" ref={bgInputRef} hidden accept="image/*" onChange={(e) => handleFilePick(e, 'bg')} />
                            </div>
                        </div>
                    </div>

                    {/* Projection & Geometry Settings */}
                    <div className="mb-6 pb-6 border-b border-white/5">
                        <SectionLabel>Projection & Geometry</SectionLabel>
                        <div className="flex flex-col gap-4">
                            {/* Radius */}
                            <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-zinc-500">Corner Roundness</span>
                                    <span className="text-zinc-300">{settings.borderRadius}px</span>
                                </div>
                                <input 
                                    type="range" min="0" max="200" step="1"
                                    value={settings.borderRadius}
                                    onChange={(e) => updateSetting('borderRadius', Number(e.target.value))}
                                    className="w-full accent-cyan-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                            
                            {/* Mesh */}
                            <div className="bg-black/20 p-2 rounded border border-white/5">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[10px] font-semibold text-zinc-400">MAPPING MESH</span>
                                    <div className="flex items-center gap-1">
                                        <span className="text-[9px] text-zinc-500 uppercase">Points:</span>
                                        <div className="flex gap-0.5">
                                            {[4, 8, 12].map(num => (
                                                <button 
                                                    key={num}
                                                    onClick={() => updateMeshPoints(num)}
                                                    className={`px-1.5 py-0.5 text-[9px] border rounded transition-colors ${settings.mappingPoints.length === num ? 'bg-cyan-900/50 text-cyan-300 border-cyan-500/30' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}
                                                >
                                                    {num}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                
                                <button 
                                    onClick={() => updateSetting('isMappingEdit', !settings.isMappingEdit)}
                                    className={`w-full py-1.5 text-[10px] uppercase font-bold tracking-wide rounded border transition-all ${
                                        settings.isMappingEdit 
                                        ? 'bg-cyan-500 text-white border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.4)] animate-pulse' 
                                        : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
                                    }`}
                                >
                                    {settings.isMappingEdit ? 'Exit Mesh Editor' : 'Edit Projection Mesh'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Display Settings */}
                    <div className="mb-6">
                        <SectionLabel>Display</SectionLabel>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                            <div className="flex flex-col">
                                <select 
                                value={settings.rotationDeg}
                                onChange={(e) => updateSetting('rotationDeg', Number(e.target.value))}
                                className={InputBaseClass}
                                >
                                <option value={0}>0° Rotation</option>
                                <option value={90}>90° Rotation</option>
                                <option value={180}>180° Rotation</option>
                                <option value={270}>270° Rotation</option>
                                </select>
                            </div>

                            <div className="flex flex-col">
                                <select 
                                value={settings.useCustomAspect ? 'custom' : `${settings.aspect[0]}:${settings.aspect[1]}`}
                                onChange={(e) => {
                                    if (e.target.value === 'custom') {
                                    updateSetting('useCustomAspect', true);
                                    } else {
                                    const [w, h] = e.target.value.split(':').map(Number);
                                    updateSetting('useCustomAspect', false);
                                    updateSetting('aspect', [w, h]);
                                    }
                                }}
                                className={InputBaseClass}
                                >
                                <option value="4:3">4:3 Aspect</option>
                                <option value="16:9">16:9 Aspect</option>
                                <option value="9:16">9:16 Portrait</option>
                                <option value="1:1">1:1 Square</option>
                                <option value="custom">Custom</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <div className="flex justify-between mb-1">
                                <span className="text-[10px] text-zinc-500">Zoom Scale</span>
                                <span className="text-[10px] text-zinc-300">{settings.scale.toFixed(1)}x</span>
                            </div>
                            <input 
                                type="range" min="0.5" max="2.0" step="0.1"
                                value={settings.scale}
                                onChange={(e) => updateSetting('scale', Number(e.target.value))}
                                className="w-full accent-cyan-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    </div>

                    {/* Analysis Settings */}
                    <div className="mb-6 pb-6 border-b border-white/5">
                        <SectionLabel>Performance & Render</SectionLabel>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col">
                                <select 
                                value={settings.baseShortSide}
                                onChange={(e) => updateSetting('baseShortSide', Number(e.target.value))}
                                className={InputBaseClass}
                                >
                                    <option value={360}>360p</option>
                                    <option value={480}>480p</option>
                                    <option value={720}>720p</option>
                                    <option value={1080}>1080p</option>
                                </select>
                            </div>
                            <div className="flex flex-col">
                                <select 
                                value={settings.analysisFPS}
                                onChange={(e) => updateSetting('analysisFPS', Number(e.target.value))}
                                className={InputBaseClass}
                                >
                                    <option value={15}>15 FPS (Eco)</option>
                                    <option value={24}>24 FPS (Film)</option>
                                    <option value={30}>30 FPS (TV)</option>
                                    <option value={60}>60 FPS (Max)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Toggles */}
                    <div className="grid grid-cols-2 gap-y-3 gap-x-2 mb-6">
                        {[
                            { label: 'Show Camera Feed', key: 'showCamera' },
                            { label: 'Mirror View', key: 'mirrorView' },
                            { label: 'Draw Skeleton', key: 'drawSkeleton' },
                            { label: 'Single Hand Mode', key: 'maxHands', map: (v:any)=>v===1, set: (c:boolean)=>c?1:2 }
                        ].map((item: any) => (
                            <label key={item.label} className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative">
                                    <input 
                                        type="checkbox" 
                                        className="sr-only peer"
                                        checked={item.map ? item.map(settings[item.key as keyof AppSettings]) : settings[item.key as keyof AppSettings]} 
                                        onChange={(e) => updateSetting(item.key as keyof AppSettings, item.set ? item.set(e.target.checked) : e.target.checked)} 
                                    />
                                    <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-900 peer-checked:after:bg-cyan-400"></div>
                                </div>
                                <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">{item.label}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
            {/* End of Collapsible Global Settings */}

            {/* Global Actions */}
            <div className="flex flex-col gap-2 mb-8 border-t border-white/5 pt-6">
                <button 
                    onClick={addCircle}
                    disabled={circles.length >= 8}
                    className="w-full py-2 bg-gradient-to-r from-cyan-900 to-cyan-800 hover:from-cyan-800 hover:to-cyan-700 text-cyan-100 border border-cyan-500/20 rounded font-medium text-xs transition-all shadow-[0_0_10px_rgba(8,145,178,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    + ADD NEW CIRCLE
                </button>
                <div className="flex gap-2">
                    <button onClick={onSaveDefault} className={`${ButtonBaseClass} bg-teal-900/30 text-teal-300 border-teal-500/20 hover:bg-teal-900/50`}>
                        Save Default
                    </button>
                     <button onClick={onSaveLayout} className={`${ButtonBaseClass} bg-indigo-900/30 text-indigo-300 border-indigo-500/20 hover:bg-indigo-900/50`}>
                        Export
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className={`${ButtonBaseClass} bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700`}>
                        Import
                    </button>
                </div>
                <input type="file" ref={fileInputRef} hidden accept=".js,.json" onChange={(e) => handleFilePick(e, 'layout')} />
            </div>

            {/* Circle List */}
            <div className="space-y-3 pb-8">
                {circles.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-zinc-600 border border-dashed border-zinc-800 rounded-lg">
                        <span className="text-xs italic">No active circles</span>
                    </div>
                )}
                {circles.map((circle, index) => (
                    <div 
                    key={circle.id} 
                    onClick={() => setEditingId(circle.id)}
                    className={`group relative p-3 rounded-xl border transition-all duration-300 cursor-pointer overflow-hidden ${
                        editingId === circle.id 
                        ? 'bg-black/60 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.15)]' 
                        : 'bg-zinc-900/40 border-white/5 hover:bg-zinc-900/80 hover:border-white/10'
                    }`}
                    >
                        {/* Selected Indicator Bar */}
                        {editingId === circle.id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500"></div>}

                        <div className="flex justify-between items-center mb-3 pl-2">
                            {editingId === circle.id ? (
                                <input 
                                    type="text" 
                                    value={circle.name}
                                    onChange={(e) => updateCircle(circle.id, { name: e.target.value })}
                                    onClick={(e) => e.stopPropagation()}
                                    className="bg-transparent border-b border-cyan-500/50 text-cyan-400 text-xs font-bold tracking-wide focus:outline-none w-32 placeholder-cyan-700"
                                    placeholder="Enter Name"
                                />
                            ) : (
                                <span className={`text-xs font-bold tracking-wide ${editingId === circle.id ? 'text-cyan-400' : 'text-zinc-400 group-hover:text-zinc-200'}`}>
                                    {circle.name || `CIRCLE ${index + 1}`}
                                </span>
                            )}

                            <button onClick={(e) => { e.stopPropagation(); removeCircle(circle.id); }} className="text-zinc-600 hover:text-red-400 p-1 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>
                        
                        {editingId === circle.id && (
                            <div className="flex flex-col gap-4 pl-2 animate-fadeIn" onClick={e => e.stopPropagation()}>
                                
                                {/* Radius Control */}
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between items-center text-[10px]">
                                        <span className="text-zinc-500 font-semibold">RADIUS (R)</span>
                                        <input 
                                            type="number" 
                                            value={circle.radius} 
                                            onChange={e => updateCircle(circle.id, { radius: Number(e.target.value) })}
                                            className="w-12 bg-transparent text-right text-zinc-300 focus:outline-none focus:text-cyan-400 border-none p-0"
                                        />
                                    </div>
                                    <input 
                                        type="range" min="10" max="250" step="1"
                                        value={circle.radius}
                                        onChange={e => updateCircle(circle.id, { radius: Number(e.target.value) })}
                                        className="w-full accent-cyan-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>

                                {/* Width Control */}
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between items-center text-[10px]">
                                        <span className="text-zinc-500 font-semibold">WIDTH (W)</span>
                                        <input 
                                            type="number" 
                                            value={circle.lineWidth} 
                                            onChange={e => updateCircle(circle.id, { lineWidth: Number(e.target.value) })}
                                            className="w-12 bg-transparent text-right text-zinc-300 focus:outline-none focus:text-cyan-400 border-none p-0"
                                        />
                                    </div>
                                    <input 
                                        type="range" min="1" max="20" step="1"
                                        value={circle.lineWidth}
                                        onChange={e => updateCircle(circle.id, { lineWidth: Number(e.target.value) })}
                                        className="w-full accent-cyan-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>

                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[10px] text-zinc-500 w-10">Color</span>
                                    <div className="flex-1 h-6 rounded overflow-hidden border border-white/10 relative">
                                        <input type="color" value={circle.color} onChange={e => updateCircle(circle.id, { color: e.target.value })} className="absolute -top-2 -left-2 w-[150%] h-[200%] cursor-pointer p-0 m-0" />
                                    </div>
                                </div>
                                
                                {/* Media Inputs */}
                                <div className="col-span-2 space-y-3 mt-1 pt-3 border-t border-white/5">
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] text-zinc-500">VISUAL MEDIA</span>
                                        </div>
                                        <div className="flex gap-1">
                                            <input 
                                                type="text" 
                                                placeholder="https://..."
                                                value={circle.imgPath || ''} 
                                                onChange={e => updateCircle(circle.id, { imgPath: e.target.value })}
                                                className={InputBaseClass}
                                            />
                                            <label className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-white/5 rounded px-2 flex items-center justify-center cursor-pointer transition-colors">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                                <input 
                                                    type="file" 
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                        const f = e.target.files?.[0];
                                                        if(f) updateCircle(circle.id, { imgPath: URL.createObjectURL(f) });
                                                    }}
                                                />
                                            </label>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                             <span className="text-[10px] text-zinc-500">AUDIO & VOLUME</span>
                                        </div>
                                        <div className="flex gap-1 mb-2">
                                            <input 
                                                type="text" 
                                                placeholder="https://..."
                                                value={circle.audioPath || ''} 
                                                onChange={e => updateCircle(circle.id, { audioPath: e.target.value })}
                                                className={InputBaseClass}
                                            />
                                            <label className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-white/5 rounded px-2 flex items-center justify-center cursor-pointer transition-colors">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                                                <input 
                                                    type="file" 
                                                    accept="audio/*"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                        const f = e.target.files?.[0];
                                                        if(f) updateCircle(circle.id, { audioPath: URL.createObjectURL(f) });
                                                    }}
                                                />
                                            </label>
                                        </div>
                                        {/* Volume Control */}
                                        <div className="flex items-center gap-3 bg-black/20 p-1.5 rounded border border-white/5">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-zinc-500" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" />
                                            </svg>
                                            <input 
                                                type="range" 
                                                min="0" max="1" step="0.05"
                                                value={circle.volume ?? 1.0}
                                                onChange={e => updateCircle(circle.id, { volume: parseFloat(e.target.value) })}
                                                className="flex-1 accent-cyan-500 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                                            />
                                            <span className="text-[9px] w-6 text-right font-mono text-zinc-400">{Math.round((circle.volume ?? 1.0) * 100)}%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
      </div>
    </>
  );
};

export default ControlPanel;