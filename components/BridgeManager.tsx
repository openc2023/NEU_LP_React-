import React, { useEffect, useRef, useState } from 'react';
import { Button } from './UI';

interface BridgeManagerProps {
  isOpen: boolean;
  onClose: () => void;
  wsUrl: string;
}

interface LogEntry {
  time: string;
  type: 'info' | 'error' | 'rx' | 'tx';
  msg: string;
}

export const BridgeManager: React.FC<BridgeManagerProps> = ({ isOpen, onClose, wsUrl }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<'disconnected' | 'waiting' | 'connecting' | 'connected'>('disconnected');
  const [serverStats, setServerStats] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  // Connection Logic
  useEffect(() => {
    if (!isOpen) {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        setLogs([]); // Clear logs on close/re-open to keep it fresh
        return;
    }

    let connectTimer: any = null;
    let pingTimer: any = null;

    const connect = () => {
        let normalizedUrl = wsUrl;
        if (normalizedUrl.startsWith('https://')) normalizedUrl = normalizedUrl.replace('https://', 'wss://');
        else if (normalizedUrl.startsWith('http://')) normalizedUrl = normalizedUrl.replace('http://', 'ws://');

        addLog('info', `Connecting to ${normalizedUrl}...`);
        setStatus('connecting');
        
        try {
            const ws = new WebSocket(normalizedUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                setStatus('connected');
                addLog('info', 'Bridge Connected.');
                // Request initial status immediately
                ws.send(JSON.stringify({ command: 'get_status' }));

                // Start Heartbeat
                pingTimer = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ command: 'ping' }));
                    }
                }, 5000);
            };

            ws.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);
                    
                    // Filter out video frames to prevent log spam
                    if (data.image) return;

                    // Handle System Messages
                    if (data.type === 'status') {
                        setServerStats(data.payload);
                        addLog('rx', 'Status Updated');
                    } else if (data.type === 'pong') {
                        // ignore pong logs to keep clean, or log it
                    } else if (data.type === 'log') {
                        addLog('rx', `[SERVER] ${data.msg}`);
                    } else {
                        addLog('rx', JSON.stringify(data).slice(0, 50) + '...');
                    }
                } catch (err) {
                    // Ignore parsing errors
                }
            };

            ws.onclose = (e) => {
                setStatus('disconnected');
                addLog('error', `Connection closed (Code: ${e.code})`);
                setServerStats(null);
                if (pingTimer) clearInterval(pingTimer);
            };

            ws.onerror = () => {
                setStatus('disconnected');
                addLog('error', 'Connection Error.');
            };

        } catch (e) {
            addLog('error', `Invalid URL: ${normalizedUrl}`);
        }
    };

    // Add a delay before connecting to allow the background CanvasLayer 
    // to fully release the WebSocket/Camera resource.
    setStatus('waiting');
    addLog('info', 'Initializing bridge session...');
    connectTimer = setTimeout(connect, 1500); // Increased to 1.5s for safety

    return () => {
        clearTimeout(connectTimer);
        if (pingTimer) clearInterval(pingTimer);
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
    };
  }, [isOpen, wsUrl]);

  const addLog = (type: LogEntry['type'], msg: string) => {
    const time = new Date().toLocaleTimeString().split(' ')[0];
    setLogs(prev => [...prev.slice(-49), { time, type, msg }]);
  };

  const sendCommand = (cmd: string) => {
      // Check both ref and state to be safe
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          try {
              wsRef.current.send(JSON.stringify({ command: cmd }));
              addLog('tx', `CMD: ${cmd}`);
          } catch (e) {
              setStatus('disconnected');
              addLog('error', 'Send Failed');
          }
      } else {
          // If we think we are connected but socket is dead, update state immediately
          if (status === 'connected') setStatus('disconnected');
          addLog('error', 'Cannot send: Disconnected');
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-[600px] h-[500px] bg-zinc-900 border border-cyan-500/30 rounded-lg shadow-2xl flex flex-col overflow-hidden animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-950 border-b border-white/10">
            <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : status === 'waiting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`} />
                <h3 className="font-tech text-lg text-cyan-400 tracking-wider">MIDDLEWARE TERMINAL</h3>
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-white">✕</button>
        </div>

        {/* Status Bar */}
        <div className="grid grid-cols-3 gap-px bg-white/10 text-[10px] font-mono text-zinc-300">
            <div className="bg-zinc-900 p-2 text-center">
                <span className="text-zinc-500 block">DEVICE</span>
                {serverStats?.device_name || (status === 'connected' ? 'Identifying...' : '---')}
            </div>
            <div className="bg-zinc-900 p-2 text-center">
                <span className="text-zinc-500 block">RESOLUTION</span>
                {serverStats ? `${serverStats.res_w}x${serverStats.res_h}` : '-'}
            </div>
            <div className="bg-zinc-900 p-2 text-center">
                <span className="text-zinc-500 block">D2C ALIGN</span>
                {serverStats?.align_mode ? 'ON (HW)' : 'OFF'}
            </div>
        </div>

        {/* Terminal Output */}
        <div 
            ref={scrollRef}
            className="flex-1 bg-[#050505] p-4 overflow-y-auto font-mono text-xs space-y-1"
        >
            {logs.map((l, i) => (
                <div key={i} className="flex gap-2">
                    <span className="text-zinc-600">[{l.time}]</span>
                    <span className={`
                        ${l.type === 'error' ? 'text-red-400' : ''}
                        ${l.type === 'tx' ? 'text-cyan-600' : ''}
                        ${l.type === 'rx' ? 'text-green-600' : ''}
                        ${l.type === 'info' ? 'text-zinc-400' : ''}
                    `}>
                        {l.type === 'tx' && '> '}
                        {l.msg}
                    </span>
                </div>
            ))}
            {status === 'waiting' && <span className="text-zinc-600 italic">Waiting for hardware release...</span>}
        </div>

        {/* Controls */}
        <div className="p-3 bg-zinc-900 border-t border-white/10 flex gap-2">
            <Button 
                variant="secondary" 
                className="flex-1 !py-1" 
                onClick={() => sendCommand('get_status')}
                disabled={status !== 'connected'}
            >
                Refresh Status
            </Button>
            <Button 
                variant="danger" 
                className="flex-1 !py-1" 
                onClick={() => sendCommand('restart_camera')}
                disabled={status !== 'connected'}
            >
                Restart Camera
            </Button>
            <Button 
                variant="primary" 
                className="flex-1 !py-1" 
                onClick={() => sendCommand('ping')}
                disabled={status !== 'connected'}
            >
                Ping
            </Button>
        </div>
      </div>
    </div>
  );
};
