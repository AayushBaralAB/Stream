import { Link } from 'react-router-dom';
import { useHLS } from '../hooks/useHLS';
import { useNepalTime } from '../hooks/useNepalTime';
import { FiArrowLeft, FiRefreshCw, FiRadio } from 'react-icons/fi';
import { useState, useEffect } from 'react';
import { streamAPI } from '../services/api';

export default function Preview() {
  const { videoRef, status, error, reload } = useHLS('/live/stream.m3u8');
  const { time, date } = useNepalTime();
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

  const isLive = !!streamInfo?.status?.running;
  const isOffline = !isLive && (status === 'offline' || (error && status === 'error'));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="text-gray-400 hover:text-white transition-colors"><FiArrowLeft size={20} /></Link>
          <div>
            <h2 className="text-xl font-bold text-white">Live TV Preview</h2>
            <p className="text-sm text-gray-500">Monitor the broadcast exactly as viewers see it</p>
          </div>
        </div>
        <button onClick={reload} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white text-sm font-medium px-4 py-2 rounded-lg border border-brand-border transition-colors">
          <FiRefreshCw size={14} /> Retry
        </button>
      </div>

      {/* TV */}
      <div className="rounded-[1.75rem] bg-gradient-to-b from-brand-dark to-brand-darker border border-brand-border p-5 sm:p-7 shadow-2xl">
        <div className="rounded-2xl bg-black border border-brand-border/70 overflow-hidden ring-1 ring-black">
          {/* screen header bar (channel name + status + nepal time) */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-black border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full ${isLive ? 'bg-red-500 animate-pulse' : 'bg-gray-700'}`}></span>
              <span className="text-xs sm:text-sm font-bold tracking-[0.2em] text-white/90">AAYUSH LIVE</span>
              {isLive && (
                <span className="text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span> LIVE
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-gray-500 hidden sm:inline">{date}</span>
              <span className="text-xs text-white/80 font-mono">{time}</span>
            </div>
          </div>

          {/* TV screen */}
          <div className="relative aspect-video flex items-center justify-center bg-black">
            <video ref={videoRef} className="w-full h-full object-contain" muted controls playsInline />

            {isLive && (
              <div className="absolute top-3 left-3 bg-red-600 text-white text-[11px] font-bold px-2 py-1 rounded flex items-center gap-1.5">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span> LIVE BROADCAST
              </div>
            )}

            {isOffline && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                <div className="w-20 h-20 rounded-full border-2 border-brand-border flex items-center justify-center mb-5">
                  <FiRadio size={28} className="text-gray-600" />
                </div>
                <p className="text-white/80 text-sm font-medium tracking-widest">OFF AIR</p>
                <p className="text-gray-500 text-xs mt-1">Stream is currently offline</p>
                <button onClick={reload} className="mt-5 text-xs text-brand-red hover:text-red-400 font-medium">Reconnect</button>
              </div>
            )}

            {status === 'loading' && !isLive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
                <div className="w-12 h-12 border-4 border-brand-red border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-gray-400 text-sm">Loading stream...</p>
              </div>
            )}
          </div>
        </div>

        {/* TV stand */}
        <div className="flex flex-col items-center mt-6">
          <div className="w-24 h-3 rounded-t-lg bg-brand-card border border-brand-border/60"></div>
          <div className="w-40 h-1.5 rounded-b bg-brand-card/70"></div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-brand-card border border-brand-border rounded-xl p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">Status</div>
          <div className={`text-sm font-bold ${isLive ? 'text-green-400' : 'text-gray-500'}`}>
            {isLive ? 'LIVE' : 'OFFLINE'}
          </div>
        </div>
        <div className="bg-brand-card border border-brand-border rounded-xl p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">Player</div>
          <div className="text-sm font-bold text-white">{status.toUpperCase()}</div>
        </div>
        <div className="bg-brand-card border border-brand-border rounded-xl p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">PID</div>
          <div className="text-sm font-mono font-bold text-white">{streamInfo?.status?.pid || 'N/A'}</div>
        </div>
        <div className="bg-brand-card border border-brand-border rounded-xl p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">Uptime</div>
          <div className="text-sm font-mono font-bold text-white">{streamInfo?.status?.uptime || 0}s</div>
        </div>
      </div>

      <p className="text-center text-xs text-gray-600">
        The logo and news ticker are burned into the broadcast — viewers see the same. Stream URL: /live/stream.m3u8
      </p>
    </div>
  );
}