import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { videoAPI, streamAPI } from '../services/api';
import { FiPlay, FiSquare, FiRepeat, FiClock, FiTrash2, FiRadio } from 'react-icons/fi';

export default function Playlist() {
  const [videos, setVideos] = useState([]);
  const [selectedVideos, setSelectedVideos] = useState([]);
  const [loop, setLoop] = useState(true);
  const [running, setRunning] = useState(false);
  const [nowPlaying, setNowPlaying] = useState({ index: 0, playlist: [], sourceUrls: [], sourceType: '', uptime: 0 });
  const [actionLoading, setActionLoading] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });

  const fetchVideos = useCallback(async () => {
    try {
      const res = await videoAPI.getAll();
      setVideos(res.data.videos);
      setSelectedVideos(prev => prev.filter(id => res.data.videos.some(v => v._id === id)));
    } catch {}
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await streamAPI.getStatus();
      setRunning(!!res.data.status?.running);
      setNowPlaying({
        index: res.data.status?.currentIndex || 0,
        playlist: res.data.stream?.playlist || [],
        sourceUrls: res.data.stream?.sourceUrls || [],
        sourceType: res.data.stream?.sourceType || '',
        uptime: res.data.status?.uptime || 0,
      });
    } catch {}
  }, []);

  useEffect(() => {
    fetchVideos();
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchVideos, fetchStatus]);

  const handleStart = async () => {
    setMessage({ type: '', text: '' });
    if (selectedVideos.length === 0) {
      setMessage({ type: 'error', text: 'Select at least one video' });
      return;
    }
    setActionLoading('start');
    try {
      await streamAPI.start({
        sourceType: 'upload',
        videoIds: selectedVideos,
        loop,
        destinationIds: [],
      });
      setMessage({ type: 'success', text: 'Stream started (HLS preview only — pick destinations on the Upload page)' });
      fetchStatus();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to start stream' });
    } finally {
      setActionLoading('');
    }
  };

  const handleStop = async () => {
    setMessage({ type: '', text: '' });
    setActionLoading('stop');
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

  const toggleVideo = (id) => {
    setSelectedVideos(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleDelete = async (id) => {
    try {
      await videoAPI.delete(id);
      fetchVideos();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Delete failed' });
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  };

  const formatDuration = (seconds) => {
    if (!seconds || seconds <= 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  const formatUptime = (seconds) => {
    if (!seconds) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const liveNowId = running ? nowPlaying.playlist[nowPlaying.index]?._id : null;
  const hasUrlSource = running && nowPlaying.sourceUrls.length > 0;
  const playlistOrder = running
    ? (hasUrlSource ? [] : nowPlaying.playlist)
    : selectedVideos.map(id => videos.find(v => v._id === id)).filter(Boolean);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Playlist</h2>
        <p className="text-gray-400 text-sm mt-1">Build your queue from uploaded videos — the live item is highlighted</p>
      </div>

      {message.text && (
        <div className={`px-4 py-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-green-500/10 border border-green-500/20 text-green-400'}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* VIDEO LIBRARY / PLAYLIST */}
        <div className="xl:col-span-2 bg-brand-card border border-brand-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Video Library (playlist order = click order)</h3>
            <span className="text-xs text-gray-500">{selectedVideos.length} selected</span>
          </div>

          {videos.length === 0 ? (
            <div className="text-sm text-gray-500 bg-brand-dark border border-dashed border-brand-border rounded-lg p-6 text-center">
              No videos uploaded yet. <Link to="/upload" className="text-brand-red hover:text-red-400">Upload a video</Link> to build your playlist.
            </div>
          ) : (
            <div className="space-y-2">
              {videos.map((v, i) => {
                const isSelected = selectedVideos.includes(v._id);
                const isLive = liveNowId === v._id;
                return (
                  <div
                    key={v._id}
                    onClick={() => toggleVideo(v._id)}
                    className={`flex items-center gap-3 bg-brand-dark border rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${isLive ? 'border-green-400 bg-green-500/10' : isSelected ? 'border-brand-red bg-brand-red/5' : 'border-brand-border hover:border-gray-500'}`}
                  >
                    <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isLive ? 'bg-green-500 text-white' : isSelected ? 'bg-brand-red text-white' : 'bg-white/5 text-gray-400'}`}>
                      {!isLive && isSelected ? i + 1 : isLive ? '▶' : '—'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${isLive ? 'text-green-400' : 'text-white'}`}>{v.originalName}</div>
                      <div className="text-xs text-gray-500">{formatSize(v.size)} · {new Date(v.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-300 flex items-center gap-1"><FiClock size={12} /> {formatDuration(v.duration)}</span>
                      {isLive && (
                        <span className="text-[10px] font-bold bg-green-500 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span> LIVE NOW
                        </span>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(v._id); }} className="text-gray-500 hover:text-red-400 transition-colors" title="Delete">
                        <FiTrash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* NOW PLAYING */}
        <div className="bg-brand-card border border-brand-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <FiRadio size={15} className={running ? 'text-green-400' : 'text-gray-500'} /> Now Playing
            </h3>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${running ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-400'}`}>
              {running && <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>}
              {running ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>

          {running ? (
            <div className="space-y-4">
              <div className={`rounded-lg border px-4 py-3 ${hasUrlSource ? 'border-green-400 bg-green-500/10' : 'border-brand-border bg-brand-dark'}`}>
                <div className="text-xs text-gray-500 mb-1">
                  {hasUrlSource ? `URL source · ${nowPlaying.sourceType}` : 'Playing video'}
                </div>
                <div className="text-sm font-medium text-white truncate">
                  {hasUrlSource
                    ? `URL ${Math.min(nowPlaying.index + 1, nowPlaying.sourceUrls.length)} of ${nowPlaying.sourceUrls.length}`
                    : (nowPlaying.playlist[nowPlaying.index]?.originalName || 'Streaming…')}
                </div>
                {!hasUrlSource && nowPlaying.playlist.length > 0 && (
                  <div className="text-xs text-gray-500 mt-1">
                    Item {nowPlaying.index + 1} of {nowPlaying.playlist.length}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-brand-dark border border-brand-border rounded-lg px-3 py-2">
                  <div className="text-xs text-gray-500">Uptime</div>
                  <div className="text-sm font-mono font-bold text-white">{formatUptime(nowPlaying.uptime)}</div>
                </div>
              </div>

              {playlistOrder.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Queue</div>
                  <div className="space-y-1">
                    {playlistOrder.map((item, i) => (
                      <div key={item._id} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-md ${i === nowPlaying.index ? 'bg-green-500/10 text-green-400' : 'text-gray-400'}`}>
                        <span className="text-xs w-4">{i + 1}</span>
                        <span className="truncate">{item.originalName}</span>
                        <span className="ml-auto text-xs shrink-0 flex items-center gap-1"><FiClock size={10} /> {formatDuration(item.duration)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-500 bg-brand-dark border border-dashed border-brand-border rounded-lg p-5 text-center">
              Not streaming. Select videos on the left and press <span className="text-white font-medium">Start Stream</span>.
            </div>
          )}

          <label className={`mt-4 flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors ${loop ? 'bg-brand-red/10 border-brand-red' : 'bg-brand-dark border-brand-border'}`}>
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} className="accent-brand-red w-4 h-4" />
            <FiRepeat size={15} className={loop ? 'text-brand-red' : 'text-gray-500'} />
            <span className="text-sm text-gray-300">Loop playlist</span>
          </label>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button onClick={handleStart} disabled={running || actionLoading === 'start'} className="flex items-center justify-center gap-2 bg-brand-red hover:bg-red-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors">
              <FiPlay size={16} /> {actionLoading === 'start' ? 'Starting…' : running ? 'Stream Running' : 'Start Stream'}
            </button>
            <button onClick={handleStop} disabled={!running || actionLoading === 'stop'} className="flex items-center justify-center gap-2 bg-red-950 hover:bg-red-900 disabled:opacity-50 text-red-400 font-medium py-3 rounded-lg transition-colors border border-red-900">
              <FiSquare size={16} /> {actionLoading === 'stop' ? 'Stopping…' : 'Stop Stream'}
            </button>
          </div>

          <p className="text-xs text-gray-500 mt-4">
            Quick start broadcasts to the HLS preview only. To send to YouTube / Facebook / TikTok simultaneously, choose destinations on the <Link to="/upload" className="text-brand-red hover:text-red-400">Upload</Link> page.
          </p>
        </div>
      </div>
    </div>
  );
}