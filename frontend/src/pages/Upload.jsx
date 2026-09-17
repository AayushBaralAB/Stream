import { useState, useEffect, useRef, useCallback } from 'react';
import { videoAPI, streamAPI, destinationAPI } from '../services/api';
import { FiUpload, FiTrash2, FiPlay, FiLink, FiMonitor } from 'react-icons/fi';

export default function Upload() {
  const [videos, setVideos] = useState([]);
  const [sourceType, setSourceType] = useState('upload');
  const [selectedVideo, setSelectedVideo] = useState('');
  const [directUrl, setDirectUrl] = useState('');
  const [rtmpUrl, setRtmpUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [destinationIds, setDestinationIds] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const fileInputRef = useRef(null);

  const fetchVideos = useCallback(async () => {
    try {
      const res = await videoAPI.getAll();
      setVideos(res.data.videos);
    } catch {}
  }, []);

  useEffect(() => {
    fetchVideos();
    destinationAPI.getAll().then(r => setDestinations(r.data.destinations)).catch(() => {});
  }, [fetchVideos]);

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
      await videoAPI.upload(formData, (event) => {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
      });
      setMessage({ type: 'success', text: 'Video uploaded successfully' });
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
    let payload = { destinationIds };

    if (sourceType === 'upload' && !selectedVideo) {
      setMessage({ type: 'error', text: 'Select a video first' });
      return;
    }
    if (sourceType === 'url' && !directUrl.trim()) {
      setMessage({ type: 'error', text: 'Enter a direct video URL' });
      return;
    }
    if (sourceType === 'rtmp_input' && !rtmpUrl.trim()) {
      setMessage({ type: 'error', text: 'Enter an RTMP input URL' });
      return;
    }
    if (destinationIds.length === 0) {
      setMessage({ type: 'error', text: 'Select at least one destination' });
      return;
    }

    if (sourceType === 'upload') payload.videoId = selectedVideo;
    if (sourceType !== 'upload') payload.sourceUrl = sourceType === 'url' ? directUrl.trim() : rtmpUrl.trim();
    payload.sourceType = sourceType;

    try {
      const res = await streamAPI.start(payload);
      setMessage({ type: 'success', text: res.data.message || 'Stream started' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to start stream' });
    }
  };

  const handleStop = async () => {
    setMessage({ type: '', text: '' });
    try {
      await streamAPI.stop();
      setMessage({ type: 'success', text: 'Stream stopped' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to stop stream' });
    }
  };

  const toggleDest = (id) => {
    setDestinationIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  };

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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button onClick={() => setSourceType('upload')} className={`flex items-center gap-3 p-4 rounded-lg border transition-colors text-left ${sourceType === 'upload' ? 'bg-brand-red/10 border-brand-red' : 'bg-brand-dark border-brand-border hover:bg-white/5'}`}>
            <FiUpload size={18} className={sourceType === 'upload' ? 'text-brand-red' : 'text-gray-500'} />
            <div>
              <div className="text-sm font-medium text-white">Upload Video</div>
              <div className="text-xs text-gray-500">Use a local file</div>
            </div>
          </button>
          <button onClick={() => setSourceType('url')} className={`flex items-center gap-3 p-4 rounded-lg border transition-colors text-left ${sourceType === 'url' ? 'bg-brand-red/10 border-brand-red' : 'bg-brand-dark border-brand-border hover:bg-white/5'}`}>
            <FiLink size={18} className={sourceType === 'url' ? 'text-brand-red' : 'text-gray-500'} />
            <div>
              <div className="text-sm font-medium text-white">Direct URL</div>
              <div className="text-xs text-gray-500">Direct media URL</div>
            </div>
          </button>
          <button onClick={() => setSourceType('rtmp_input')} className={`flex items-center gap-3 p-4 rounded-lg border transition-colors text-left ${sourceType === 'rtmp_input' ? 'bg-brand-red/10 border-brand-red' : 'bg-brand-dark border-brand-border hover:bg-white/5'}`}>
            <FiMonitor size={18} className={sourceType === 'rtmp_input' ? 'text-brand-red' : 'text-gray-500'} />
            <div>
              <div className="text-sm font-medium text-white">RTMP Input</div>
              <div className="text-xs text-gray-500">Stream in from another source</div>
            </div>
          </button>
        </div>

        {sourceType === 'upload' && (
          <div className="mt-5 space-y-4">
            <div>
              <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileUpload} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex items-center gap-2 bg-brand-red hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
                <FiUpload size={16} /> {uploading ? `Uploading ${uploadProgress}%` : 'Upload Video'}
              </button>
              {uploading && (
                <div className="mt-3 w-full bg-brand-dark rounded-full h-2 overflow-hidden">
                  <div className="bg-brand-red h-full transition-all" style={{ width: `${uploadProgress}%` }}></div>
                </div>
              )}
            </div>

            {videos.length === 0 ? (
              <div className="text-sm text-gray-500 bg-brand-dark border border-dashed border-brand-border rounded-lg p-6 text-center">
                No videos uploaded yet. Upload a video file to use as your stream source.
              </div>
            ) : (
              <>
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Select a video</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {videos.map(v => (
                    <div
                      key={v._id}
                      onClick={() => setSelectedVideo(v._id)}
                      className={`relative bg-brand-dark border rounded-lg p-4 cursor-pointer transition-colors ${selectedVideo === v._id ? 'border-brand-red bg-brand-red/5' : 'border-brand-border hover:border-gray-500'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-white truncate">{v.originalName}</span>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteVideo(v._id); }} className="text-gray-500 hover:text-red-400 transition-colors shrink-0 ml-2">
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                      <div className="text-xs text-gray-500">{formatSize(v.size)}</div>
                      {selectedVideo === v._id && (
                        <span className="absolute top-2 right-2 w-2 h-2 bg-brand-red rounded-full"></span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {sourceType === 'url' && (
          <div className="mt-5">
            <label className="block text-sm font-medium text-gray-300 mb-2">Direct Media URL</label>
            <input
              type="url"
              value={directUrl}
              onChange={(e) => setDirectUrl(e.target.value)}
              placeholder="https://example.com/video.mp4"
              className="w-full bg-brand-dark border border-brand-border rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-red transition-colors"
            />
            <p className="text-xs text-gray-500 mt-2">Supports direct .mp4, .webm, .mkv and streaming URLs</p>
          </div>
        )}

        {sourceType === 'rtmp_input' && (
          <div className="mt-5">
            <label className="block text-sm font-medium text-gray-300 mb-2">RTMP Input URL</label>
            <input
              type="text"
              value={rtmpUrl}
              onChange={(e) => setRtmpUrl(e.target.value)}
              placeholder="rtmp://localhost/live/input"
              className="w-full bg-brand-dark border border-brand-border rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-red transition-colors"
            />
            <p className="text-xs text-gray-500 mt-2">Pull a stream from another RTMP source like OBS or another platform</p>
          </div>
        )}
      </div>

      {/* DESTINATIONS */}
      <div className="bg-brand-card border border-brand-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Destination Destinations</h3>
        {destinations.length === 0 ? (
          <p className="text-sm text-gray-500">Destination not configured. Add destinations in the Destinations page first.</p>
        ) : (
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
        )}
      </div>

      {/* ACTIONS */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={handleStart} className="flex items-center justify-center gap-2 bg-brand-red hover:bg-red-700 text-white font-medium py-3 rounded-xl transition-colors flex-1">
          <FiPlay size={18} /> Start Stream
        </button>
        <button onClick={handleStop} className="flex items-center justify-center gap-2 bg-red-950 hover:bg-red-900 text-red-400 font-medium py-3 rounded-xl transition-colors border border-red-900 flex-1">
          <FiMonitor size={18} /> Stop Stream
        </button>
      </div>
    </div>
  );
}