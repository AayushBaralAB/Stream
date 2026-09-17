import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { streamAPI, destinationAPI, newsAPI, videoAPI } from '../services/api';
import { useNepalTime } from '../hooks/useNepalTime';
import { useHLS } from '../hooks/useHLS';
import { FiPlay, FiSquare, FiUpload, FiSettings, FiRadio, FiGlobe, FiClock } from 'react-icons/fi';

export default function Dashboard() {
  const { time, date } = useNepalTime();
  const [streamStatus, setStreamStatus] = useState({ running: false, pid: null, startedAt: null, uptime: 0 });
  const [activeStream, setActiveStream] = useState(null);
  const [destinations, setDestinations] = useState([]);
  const [news, setNews] = useState([]);
  const [actionLoading, setActionLoading] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const { videoRef } = useHLS('/live/stream.m3u8');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await streamAPI.getStatus();
      setStreamStatus(res.data.status);
      setActiveStream(res.data.stream);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    destinationAPI.getAll().then(r => setDestinations(r.data.destinations)).catch(() => {});
    newsAPI.getActive().then(r => setNews(r.data.news)).catch(() => {});
  }, []);

  const formatUptime = (seconds) => {
    if (!seconds) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleStartStream = async () => {
    setActionLoading('start');
    setMessage({ type: '', text: '' });
    try {
      const enabledDests = destinations.filter(d => d.enabled);
      if (enabledDests.length === 0) {
        setMessage({ type: 'error', text: 'Destination not configured. Add an enabled destination in the Destinations page first.' });
        setActionLoading('');
        return;
      }
      const videosRes = await videoAPI.getAll();
      const videos = videosRes.data.videos;
      if (videos.length === 0) {
        setMessage({ type: 'error', text: 'No video source configured. Upload a video in the Upload page first.' });
        setActionLoading('');
        return;
      }
      await streamAPI.start({
        sourceType: 'upload',
        videoId: videos[0]._id,
        sourceUrl: '',
        destinationIds: enabledDests.map(d => d._id),
      });
      setMessage({ type: 'success', text: 'Stream started successfully' });
      fetchStatus();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to start stream' });
    } finally {
      setActionLoading('');
    }
  };

  const handleStopStream = async () => {
    setActionLoading('stop');
    setMessage({ type: '', text: '' });
    try {
      await streamAPI.stop();
      setMessage({ type: 'success', text: 'Stream stopped' });
      fetchStatus();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to stop stream' });
    } finally {
      setActionLoading('');
    }
  };

  return (
    <div className="space-y-6">
      {message.text && (
        <div className={`px-4 py-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-green-500/10 border border-green-500/20 text-green-400'}`}>
          {message.text}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Dashboard</h2>
          <p className="text-gray-400 text-sm mt-1">Monitor and control your live stream</p>
        </div>
        <div className="bg-brand-card border border-brand-border rounded-xl px-5 py-3 text-center">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1"><FiClock size={12} /> Nepal Time</div>
          <div className="text-2xl font-mono font-bold text-white">{time}</div>
          <div className="text-xs text-gray-500">{date}</div>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Stream Status" icon={<FiRadio size={16} className={streamStatus.running ? 'text-green-400' : 'text-gray-500'} />}>
          {streamStatus.running ? (
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              <span className="text-green-400 font-bold text-lg">LIVE</span>
            </div>
          ) : (
            <span className="text-gray-500 font-bold text-lg">OFFLINE</span>
          )}
        </StatCard>

        <StatCard label="Uptime" icon={<FiClock size={16} className="text-gray-500" />}>
          <div className="text-2xl font-mono font-bold text-white">{formatUptime(streamStatus.uptime)}</div>
        </StatCard>

        <StatCard label="Destinations" icon={<FiGlobe size={16} className="text-gray-500" />}>
          <div className="text-2xl font-bold text-white">{destinations.filter(d => d.enabled).length}</div>
          <div className="text-xs text-gray-500 mt-1">of {destinations.length} total</div>
        </StatCard>

        <StatCard label="Source" icon={<FiRadio size={16} className="text-gray-500" />}>
          <div className="text-lg font-bold text-white truncate">
            {activeStream?.videoId?.originalName || activeStream?.sourceType || 'Not configured'}
          </div>
          <div className="text-xs text-gray-500 mt-1">{activeStream?.sourceType || 'Select a source in Upload'}</div>
        </StatCard>
      </div>

      {/* PLAYER */}
      <div className="bg-brand-card border border-brand-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand-red animate-pulse-live"></span>
            <span className="text-sm font-medium text-white">Live Preview</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/preview" className="text-xs text-gray-400 hover:text-white transition-colors">Full Preview</Link>
          </div>
        </div>
        <div className="bg-black">
          <div className="relative aspect-video w-full max-h-[420px] flex items-center justify-center overflow-hidden bg-black">
            <video ref={videoRef} className="w-full h-full object-contain" muted controls playsInline />
            {streamStatus.running && (
              <div className="absolute top-3 left-3 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span> LIVE
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ACTION BUTTONS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={handleStartStream}
          disabled={actionLoading === 'start' || streamStatus.running}
          className="flex items-center justify-center gap-2 bg-brand-red hover:bg-red-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors"
        >
          <FiPlay size={18} /> {actionLoading === 'start' ? 'Starting...' : 'Start Stream'}
        </button>
        <button
          onClick={handleStopStream}
          disabled={actionLoading === 'stop' || !streamStatus.running}
          className="flex items-center justify-center gap-2 bg-red-950 hover:bg-red-900 disabled:opacity-50 text-red-400 font-medium py-3 rounded-xl transition-colors border border-red-900"
        >
          <FiSquare size={18} /> {actionLoading === 'stop' ? 'Stopping...' : 'Stop Stream'}
        </button>
        <Link to="/upload" className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white font-medium py-3 rounded-xl transition-colors border border-brand-border">
          <FiUpload size={18} /> Upload Video
        </Link>
        <Link to="/settings" className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white font-medium py-3 rounded-xl transition-colors border border-brand-border">
          <FiSettings size={18} /> Streaming Settings
        </Link>
      </div>

      {/* ACTIVE DESTINATIONS */}
      <div className="bg-brand-card border border-brand-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Active Destinations</h3>
        {destinations.filter(d => d.enabled).length === 0 ? (
          <div className="text-sm text-gray-400">
            Destination not configured. <Link to="/destinations" className="text-brand-red hover:text-red-400">Add a destination</Link> first.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {destinations.filter(d => d.enabled).map(d => (
              <div key={d._id} className="bg-brand-dark border border-brand-border rounded-lg px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-white">{d.name}</div>
                  <div className="text-xs text-gray-500 capitalize">{d.platform}</div>
                </div>
                {streamStatus.running ? (
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                ) : (
                  <span className="w-2 h-2 bg-gray-600 rounded-full"></span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* NEWS TICKER */}
      {news.length > 0 && (
        <div className="bg-brand-card border border-brand-border rounded-xl overflow-hidden">
          <div className="flex">
            <div className="bg-brand-red px-4 py-2.5 flex items-center gap-1.5 shrink-0">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
              <span className="text-white text-xs font-bold uppercase tracking-wide">Breaking</span>
            </div>
            <div className="ticker-wrap flex-1 flex items-center bg-brand-darker/40">
              <div className="ticker-content flex items-center h-full">
                {[...news, ...news].map((n, i) => (
                  <span key={i} className="text-sm text-white px-8 py-2.5">{n.text}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-xs text-gray-600">stream.aayushbaral.com | Aayush Live</p>
    </div>
  );
}

function StatCard({ label, icon, children }) {
  return (
    <div className="bg-brand-card border border-brand-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-gray-400 text-sm font-medium">{label}</span>
        {icon}
      </div>
      {children}
    </div>
  );
}