import { useState, useEffect, useRef, useCallback } from 'react';
import { videoAPI, streamAPI, destinationAPI } from '../services/api';
import { FiUpload, FiTrash2, FiPlay, FiClock, FiRepeat, FiSquare } from 'react-icons/fi';
import { FaYoutube, FaFacebook, FaTiktok } from 'react-icons/fa';

const SOURCES = [
  { key: 'upload', label: 'Upload Video', desc: 'Video file or playlist', icon: FiUpload },
  { key: 'youtube', label: 'YouTube', desc: 'Live or video URL', icon: FaYoutube },
  { key: 'facebook', label: 'Facebook', desc: 'Live or video URL', icon: FaFacebook },
  { key: 'tiktok', label: 'TikTok', desc: 'Live or video URL', icon: FaTiktok },
];

const PLACEHOLDERS = {
  youtube: 'https://www.youtube.com/watch?v=... or live stream link',
  facebook: 'https://www.facebook.com/.../videos/... or live link',
  tiktok: 'https://www.tiktok.com/@user/video/... or live link',
};

export default function Upload() {
  const [videos, setVideos] = useState([]);
  const [sourceType, setSourceType] = useState('upload');
  const [selectedVideos, setSelectedVideos] = useState([]);
  const [loop, setLoop] = useState(true);
  const [urlInput, setUrlInput] = useState('');
  const [platformUrls, setPlatformUrls] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [destinationIds, setDestinationIds] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [running, setRunning] = useState(false);
  const [nowPlaying, setNowPlaying] = useState({ index: 0, playlist: [] });
  const fileInputRef = useRef(null);

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
      });
    } catch {}
  }, []);

  useEffect(() => {
    fetchVideos();
    fetchStatus();
    destinationAPI.getAll().then(r => setDestinations(r.data.destinations)).catch(() => {});
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchVideos, fetchStatus]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const validTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
    if (!validTypes.includes(file.type)) {
      setMessage({ type: 'error', text: 'Invalid file type. Must be MP4, WebM, OGG, MOV, AVI or MKV.' });
      return;
    }

    const formData = new FormData();
    formData.append('video', file);

    setUploading(true);
    setUploadProgress(0);
    setMessage({ type: '', text: '' });

    try {
      const res = await videoAPI.upload(formData, (event) => {
        const percent = event.total ? Math.round((event.loaded / event.total) * 100) : 0;
        setUploadProgress(percent);
      });
      const newId = res.data.video?._id;
      setSelectedVideos(prev => (newId && !prev.includes(newId)) ? [...prev, newId] : prev);
      setMessage({ type: 'success', text: 'Video uploaded and added to playlist' });
      fetchVideos();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Upload failed' });
    } finally {
      setUploading(false);
      setUploadProgress(0);
      e.target.value = '';
    }
  };

  const handleDeleteVideo = async (id) => {
    try {
      await videoAPI.delete(id);
      setMessage({ type: 'success', text: 'Video deleted' });
      fetchVideos();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Delete failed' });
    }
  };

  const handleStart = async () => {
    setMessage({ type: '', text: '' });
    let payload = { destinationIds, loop };

    if (sourceType === 'upload' && selectedVideos.length === 0) {
      setMessage({ type: 'error', text: 'Select at least one video' });
      return;
    }
    if (sourceType !== 'upload' && platformUrls.length === 0) {
      setMessage({ type: 'error', text: `Add at least one ${SOURCES.find(s => s.key === sourceType)?.label} URL` });
      return;
    }

    if (sourceType === 'upload') payload.videoIds = selectedVideos;
    else {
      payload.sourceUrls = platformUrls;
      payload.sourceUrl = platformUrls[0];
    }
    payload.sourceType = sourceType;

    try {
      const res = await streamAPI.start(payload);
      setMessage({ type: 'success', text: res.data.message || 'Stream started' });
      fetchStatus();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to start stream' });
    }
  };

  const handleStop = async () => {
    setMessage({ type: '', text: '' });
    try {
      await streamAPI.stop();
      setMessage({ type: 'success', text: 'Stream stopped' });
      fetchStatus();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to stop stream' });
    }
  };

  const toggleVideo = (id) => {
    setSelectedVideos(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleDest = (id) => {
    setDestinationIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const addUrl = () => {
    const value = urlInput.trim();
    if (!value) return;
    if (!/^https?:\/\//i.test(value)) {
      setMessage({ type: 'error', text: 'Enter a valid http(s) URL' });
      return;
    }
    setPlatformUrls(prev => [...prev, value]);
    setUrlInput('');
  };

  const removeUrl = (index) => {
    setPlatformUrls(prev => prev.filter((_, i) => i !== index));
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
  const liveUrlIndex = running && nowPlaying.sourceType === sourceType && nowPlaying.sourceUrls.length > 0
    ? Math.min(nowPlaying.index, nowPlaying.sourceUrls.length - 1)
    : -1;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Upload & Start</h2>
        <p className="text-gray-400 text-sm mt-1">Set your stream source and send it live</p>
      </div>

      {message.text && (
        <div className={`px-4 py-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-green-500/10 border border-green-500/20 text-green-400'}`}>
          {message.text}
        </div>
      )}

      {/* SOURCE TYPE */}
      <div className="bg-brand-card border border-brand-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Stream Source</h3>
        {running && (
          <div className="mb-4 flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 text-sm px-4 py-2.5 rounded-lg">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            Stream is live — stop it before changing source.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {SOURCES.map(src => {
            const Icon = src.icon;
            const active = sourceType === src.key;
            return (
              <button key={src.key} onClick={() => setSourceType(src.key)} disabled={running} className={`flex items-center gap-3 p-4 rounded-lg border transition-colors text-left disabled:opacity-50 ${active ? 'bg-brand-red/10 border-brand-red' : 'bg-brand-dark border-brand-border hover:bg-white/5'}`}>
                <Icon size={18} className={active ? 'text-brand-red' : 'text-gray-500'} />
                <div>
                  <div className="text-sm font-medium text-white">{src.label}</div>
                  <div className="text-xs text-gray-500">{src.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

        {sourceType === 'upload' && (
          <div className="mt-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div>
                <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileUpload} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex items-center gap-2 bg-brand-red hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
                  <FiUpload size={16} /> {uploading ? `Uploading ${uploadProgress}%` : 'Upload Video'}
                </button>
                {uploading && (
                  <div className="mt-3 w-full sm:w-80 bg-brand-dark rounded-full h-2 overflow-hidden">
                    <div className="bg-brand-red h-full transition-all" style={{ width: `${uploadProgress}%` }}></div>
                  </div>
                )}
              </div>
              <label className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors ${loop ? 'bg-brand-red/10 border-brand-red' : 'bg-brand-dark border-brand-border'}`}>
                <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} className="accent-brand-red w-4 h-4" />
                <FiRepeat size={15} className={loop ? 'text-brand-red' : 'text-gray-500'} />
                <span className="text-sm text-gray-300">Loop playlist / video</span>
              </label>
            </div>

            {videos.length === 0 ? (
              <div className="text-sm text-gray-500 bg-brand-dark border border-dashed border-brand-border rounded-lg p-6 text-center">
                No videos uploaded yet. Upload a video file to use as your stream source.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Select videos (playlist order = click order)</h4>
                  <span className="text-xs text-gray-500">{selectedVideos.length} selected</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {videos.map(v => {
                    const isSelected = selectedVideos.includes(v._id);
                    const isLiveNow = liveNowId === v._id;
                    return (
                      <div
                        key={v._id}
                        onClick={() => toggleVideo(v._id)}
                        className={`relative bg-brand-dark border rounded-lg p-4 cursor-pointer transition-colors ${isLiveNow ? 'border-green-400 bg-green-500/10' : isSelected ? 'border-brand-red bg-brand-red/5' : 'border-brand-border hover:border-gray-500'}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-white truncate">{v.originalName}</span>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteVideo(v._id); }} className="text-gray-500 hover:text-red-400 transition-colors shrink-0 ml-2" title="Delete">
                            <FiTrash2 size={14} />
                          </button>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>{formatSize(v.size)}</span>
                          <span className="flex items-center gap-1"><FiClock size={12} /> {formatDuration(v.duration)}</span>
                        </div>
                        {isLiveNow && (
                          <span className="absolute -top-2 -right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span> LIVE NOW
                          </span>
                        )}
                        {isSelected && !isLiveNow && (
                          <span className="absolute top-2 right-2 w-2 h-2 bg-brand-red rounded-full"></span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {sourceType !== 'upload' && (
          <div className="mt-5 space-y-3">
            <label className="block text-sm font-medium text-gray-300">
              {SOURCES.find(s => s.key === sourceType)?.label} URLs
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }}
                placeholder={PLACEHOLDERS[sourceType]}
                className="flex-1 bg-brand-dark border border-brand-border rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-red transition-colors"
              />
              <button
                onClick={addUrl}
                disabled={!urlInput.trim()}
                className="bg-brand-dark hover:bg-white/5 disabled:opacity-40 border border-brand-border text-sm font-medium text-white px-4 py-3 rounded-lg transition-colors"
              >
                Add URL
              </button>
            </div>

            {platformUrls.length > 0 && (
              <ul className="space-y-2">
                {platformUrls.map((url, i) => {
                  const isLiveNow = liveUrlIndex === i;
                  return (
                    <li key={i} className={`flex items-center gap-3 bg-brand-dark border rounded-lg px-3 py-2.5 ${isLiveNow ? 'border-green-400 bg-green-500/10' : 'border-brand-border'}`}>
                      <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isLiveNow ? 'bg-green-500 text-white' : 'bg-white/5 text-gray-400'}`}>
                        {i + 1}
                      </span>
                      <a href={url} target="_blank" rel="noreferrer" className="text-sm text-gray-300 truncate flex-1 hover:text-white" title={url}>{url}</a>
                      {isLiveNow && (
                        <span className="text-[10px] font-bold bg-green-500 text-white px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span> LIVE NOW
                        </span>
                      )}
                      <button onClick={() => removeUrl(i)} className="text-gray-500 hover:text-red-400 transition-colors shrink-0" title="Remove">
                        <FiTrash2 size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="text-xs text-gray-500">
              Add one or more YouTube, Facebook or TikTok video / live-stream links. They play one by one (playlist), resolved with yt-dlp and broadcast live.
            </p>
          </div>
        )}
      </div>

      {/* DESTINATIONS */}
      <div className="bg-brand-card border border-brand-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Stream Destinations</h3>
        {destinations.length === 0 ? (
          <p className="text-sm text-gray-500">No destinations configured. Add them in the Destinations page. You can also start a stream with only the HLS preview (no destinations).</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {destinations.filter(d => d.enabled).map(d => (
                <label key={d._id} className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${destinationIds.includes(d._id) ? 'bg-brand-red/10 border-brand-red' : 'bg-brand-dark border-brand-border'}`}>
                  <input type="checkbox" checked={destinationIds.includes(d._id)} onChange={() => toggleDest(d._id)} className="accent-brand-red w-4 h-4" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{d.name}</div>
                    <div className="text-xs text-gray-500 capitalize">{d.platform}</div>
                  </div>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-3">Leave all unchecked to stream only to the HLS preview.</p>
          </>
        )}
      </div>

      {/* ACTIONS */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={handleStart} disabled={running} className="flex items-center justify-center gap-2 bg-brand-red hover:bg-red-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors flex-1">
          <FiPlay size={18} /> {running ? 'Stream Running' : 'Start Stream'}
        </button>
        <button onClick={handleStop} disabled={!running} className="flex items-center justify-center gap-2 bg-red-950 hover:bg-red-900 text-red-400 font-medium py-3 rounded-xl transition-colors border border-red-900 flex-1">
          <FiSquare size={18} /> Stop Stream
        </button>
      </div>
    </div>
  );
}