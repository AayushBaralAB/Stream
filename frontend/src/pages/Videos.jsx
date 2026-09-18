import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { videoAPI, streamAPI } from '../services/api';
import { FiTrash2, FiPlay, FiClock } from 'react-icons/fi';

export default function Videos() {
  const [videos, setVideos] = useState([]);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [nowPlaying, setNowPlaying] = useState({ index: 0, playlist: [] });
  const [running, setRunning] = useState(false);

  const fetchVideos = useCallback(async () => {
    try {
      const res = await videoAPI.getAll();
      setVideos(res.data.videos);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load videos' });
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await streamAPI.getStatus();
      setRunning(!!res.data.status?.running);
      setNowPlaying({
        index: res.data.status?.currentIndex || 0,
        playlist: res.data.stream?.playlist || [],
      });
    } catch {}
  }, []);

  useEffect(() => {
    fetchVideos();
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchVideos, fetchStatus]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this video permanently?')) return;
    try {
      await videoAPI.delete(id);
      setMessage({ type: 'success', text: 'Video deleted' });
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

  const liveNowId = running ? nowPlaying.playlist[nowPlaying.index]?._id : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Videos</h2>
          <p className="text-gray-400 text-sm mt-1">Your uploaded video library ({videos.length})</p>
        </div>
        <Link to="/upload" className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
          <FiPlay size={15} /> Upload Video
        </Link>
      </div>

      {message.text && (
        <div className={`px-4 py-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-green-500/10 border border-green-500/20 text-green-400'}`}>
          {message.text}
        </div>
      )}

      {videos.length === 0 ? (
        <div className="bg-brand-card border border-brand-border rounded-xl p-8 text-center">
          <p className="text-gray-500">No videos uploaded yet.</p>
          <Link to="/upload" className="inline-block mt-3 text-brand-red hover:text-red-400 text-sm font-medium">Upload your first video</Link>
        </div>
      ) : (
        <div className="bg-brand-card border border-brand-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-brand-dark border-b border-brand-border">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Name</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Size</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Duration</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Uploaded</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {videos.map(v => {
                  const isLive = liveNowId === v._id;
                  return (
                  <tr key={v._id} className={`border-b border-brand-border/50 hover:bg-white/5 ${isLive ? 'bg-green-500/10' : ''}`}>
                    <td className="px-4 py-3 text-sm truncate max-w-xs">
                      <div className="flex items-center gap-2">
                        {isLive && <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse shrink-0"></span>}
                        <span className={`truncate ${isLive ? 'text-green-400 font-medium' : 'text-white'}`}>{v.originalName}</span>
                        {isLive && (
                          <span className="text-[9px] font-bold bg-green-500 text-white px-1.5 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                            <span className="w-1 h-1 bg-white rounded-full animate-pulse"></span> LIVE NOW
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">{formatSize(v.size)}</td>
                    <td className="px-4 py-3 text-sm text-gray-400 flex items-center gap-1.5">
                      <FiClock size={13} /> {formatDuration(v.duration)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(v.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        <button onClick={() => handleDelete(v._id)} className="text-gray-400 hover:text-red-400 transition-colors p-1" title="Delete">
                          <FiTrash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}