import { Link } from 'react-router-dom';
import { useHLS } from '../hooks/useHLS';
import { FiArrowLeft, FiRefreshCw } from 'react-icons/fi';
import { useState, useEffect } from 'react';
import { streamAPI } from '../services/api';

export default function Preview() {
  const { videoRef, status, error, reload } = useHLS('/live/stream.m3u8');
  const [streamInfo, setStreamInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        const res = await streamAPI.getStatus();
        if (!cancelled) setStreamInfo(res.data);
      } catch {}
    };
    fetch();
    const interval = setInterval(fetch, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const statusLabel = {
    idle: 'Connecting to stream...',
    loading: 'Loading stream...',
    playing: 'Streaming live',
    error: 'Playback error detected',
    offline: 'Stream is offline',
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="text-gray-400 hover:text-white transition-colors"><FiArrowLeft size={20} /></Link>
          <div>
            <h2 className="text-xl font-bold text-white">Live Preview</h2>
            <p className="text-sm text-gray-500">HLS stream at /live/stream.m3u8</p>
          </div>
        </div>
        <button onClick={reload} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white text-sm font-medium px-4 py-2 rounded-lg border border-brand-border transition-colors">
          <FiRefreshCw size={14} /> Retry
        </button>
      </div>

      <div className="bg-black rounded-xl overflow-hidden border border-brand-border">
        <div className="relative aspect-video flex items-center justify-center bg-black">
          <video ref={videoRef} className="w-full h-full object-contain" muted controls playsInline />
          {(status === 'playing' || streamInfo?.status?.running) && (
            <div className="absolute top-4 left-4 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded flex items-center gap-1.5">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span> LIVE
            </div>
          )}
          {(status === 'offline' || (error && status === 'error')) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
              <div className="w-16 h-16 border-4 border-brand-border rounded-full mb-4 flex items-center justify-center">
                <span className="text-2xl text-gray-600">OFF</span>
              </div>
              <p className="text-gray-400 text-sm">Stream is currently offline</p>
              <button onClick={reload} className="mt-4 text-xs text-brand-red hover:text-red-400 font-medium">Reconnect</button>
            </div>
          )}
          {status === 'loading' && !streamInfo?.status?.running && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
              <div className="w-12 h-12 border-4 border-brand-red border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-gray-400 text-sm">{statusLabel[status]}</p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-brand-card border border-brand-border rounded-lg p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">Status</div>
          <div className={`text-sm font-bold ${streamInfo?.status?.running ? 'text-green-400' : 'text-gray-500'}`}>
            {streamInfo?.status?.running ? 'LIVE' : 'OFFLINE'}
          </div>
        </div>
        <div className="bg-brand-card border border-brand-border rounded-lg p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">Player</div>
          <div className="text-sm font-bold text-white">{status.toUpperCase()}</div>
        </div>
        <div className="bg-brand-card border border-brand-border rounded-lg p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">PID</div>
          <div className="text-sm font-mono font-bold text-white">{streamInfo?.status?.pid || 'N/A'}</div>
        </div>
        <div className="bg-brand-card border border-brand-border rounded-lg p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">Uptime (s)</div>
          <div className="text-sm font-mono font-bold text-white">{streamInfo?.status?.uptime || 0}</div>
        </div>
      </div>

      <p className="text-center text-xs text-gray-600">Only authenticated admins can view preview. Stream URL: /live/stream.m3u8</p>
    </div>
  );
}