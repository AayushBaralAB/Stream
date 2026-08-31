import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

interface Video {
  id: number;
  original_name: string;
}

interface Stream {
  id: number;
  name: string;
  video_id: number;
  rtmp_url: string;
  quality: string;
  loop_enabled: boolean;
}

interface EditStreamModalProps {
  stream: Stream;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditStreamModal({ stream, onClose, onSuccess }: EditStreamModalProps) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [platform, setPlatform] = useState<'youtube' | 'custom'>('custom');
  const [streamKey, setStreamKey] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [formData, setFormData] = useState({
    name: stream.name,
    videoId: stream.video_id.toString(),
    rtmpUrl: stream.rtmp_url,
    quality: stream.quality,
    loopEnabled: stream.loop_enabled,
  });

  useEffect(() => {
    fetchVideos();
    
    // Detect if it's a YouTube URL
    if (stream.rtmp_url.includes('youtube.com')) {
      setPlatform('youtube');
      // Extract stream key from URL
      const keyMatch = stream.rtmp_url.match(/\/([^/?]+)(\?.*)?$/);
      if (keyMatch) {
        setStreamKey(keyMatch[1]);
      }
      // Check if it's backup server
      setUseBackup(stream.rtmp_url.includes('backup=1'));
    }
  }, [stream.rtmp_url]);

  useEffect(() => {
    if (platform === 'youtube' && streamKey) {
      const baseUrl = useBackup 
        ? 'rtmp://b.rtmp.youtube.com/live2?backup=1'
        : 'rtmp://a.rtmp.youtube.com/live2';
      setFormData(prev => ({ ...prev, rtmpUrl: `${baseUrl}/${streamKey}` }));
    }
  }, [platform, streamKey, useBackup]);

  const fetchVideos = async () => {
    try {
      const response = await axios.get('/api/videos/list');
      setVideos(response.data.videos);
    } catch (error) {
      toast.error('Failed to load videos');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.videoId || !formData.rtmpUrl) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsLoading(true);

    try {
      await axios.put(`/api/streams/${stream.id}/update`, formData);
      toast.success('Stream updated successfully');
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update stream');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-foreground">Edit Stream</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1">
              Stream Name
            </label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <div>
            <label htmlFor="video" className="block text-sm font-medium text-foreground mb-1">
              Select Video
            </label>
            <select
              id="video"
              value={formData.videoId}
              onChange={(e) => setFormData({ ...formData, videoId: e.target.value })}
              className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              required
            >
              {videos.map((video) => (
                <option key={video.id} value={video.id}>
                  {video.original_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Streaming Platform
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPlatform('youtube')}
                className={`flex items-center p-3 border rounded-md cursor-pointer transition-all ${
                  platform === 'youtube' 
                    ? 'border-primary bg-primary/10' 
                    : 'border-border hover:bg-secondary/10'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                  <span className="text-sm font-medium">YouTube</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setPlatform('custom')}
                className={`flex items-center p-3 border rounded-md cursor-pointer transition-all ${
                  platform === 'custom' 
                    ? 'border-primary bg-primary/10' 
                    : 'border-border hover:bg-secondary/10'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm font-medium">Custom</span>
                </div>
              </button>
            </div>
          </div>

          {platform === 'youtube' ? (
            <>
              <div>
                <label htmlFor="streamKey" className="block text-sm font-medium text-foreground mb-1">
                  YouTube Stream Key
                </label>
                <input
                  type="text"
                  id="streamKey"
                  value={streamKey}
                  onChange={(e) => setStreamKey(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                    streamKey 
                      ? 'bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-800' 
                      : 'bg-input border-border'
                  }`}
                  placeholder="xxxx-xxxx-xxxx-xxxx"
                  required
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="useBackup"
                  checked={useBackup}
                  onChange={(e) => setUseBackup(e.target.checked)}
                  className="h-4 w-4 text-primary focus:ring-primary border-border rounded"
                />
                <label htmlFor="useBackup" className="ml-2 block text-sm text-foreground">
                  Use backup ingestion server
                </label>
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="rtmpUrl" className="block text-sm font-medium text-foreground mb-1">
                Custom RTMP URL
              </label>
              <input
                type="text"
                id="rtmpUrl"
                value={formData.rtmpUrl}
                onChange={(e) => setFormData({ ...formData, rtmpUrl: e.target.value })}
                className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="rtmp://your.server/live/stream_key"
                required
              />
            </div>
          )}

          <div>
            <label htmlFor="quality" className="block text-sm font-medium text-foreground mb-1">
              Stream Quality
            </label>
            <select
              id="quality"
              value={formData.quality}
              onChange={(e) => setFormData({ ...formData, quality: e.target.value })}
              className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="720p">720p (2 Mbps)</option>
              <option value="1080p">1080p (3.5 Mbps)</option>
            </select>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="loop"
              checked={formData.loopEnabled}
              onChange={(e) => setFormData({ ...formData, loopEnabled: e.target.checked })}
              className="h-4 w-4 text-primary focus:ring-primary border-border rounded"
            />
            <label htmlFor="loop" className="ml-2 block text-sm text-foreground">
              Loop video continuously (24/7 streaming)
            </label>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Updating...' : 'Update Stream'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}