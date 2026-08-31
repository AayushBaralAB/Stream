import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import EditStreamModal from './EditStreamModal';

dayjs.extend(relativeTime);

interface Stream {
  id: number;
  name: string;
  video_id: number;
  video_name: string;
  rtmp_url: string;
  quality: string;
  loop_enabled: boolean;
  status: 'running' | 'stopped' | 'error';
  started_at: string | null;
  error_message: string | null;
  created_at: string;
}

interface StreamStats {
  bitrate: number;
  fps: number;
  speed: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  errors: string[];
}

interface StreamCardProps {
  stream: Stream;
  onUpdate: () => void;
}

export default function StreamCard({ stream, onUpdate }: StreamCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [stats, setStats] = useState<StreamStats | null>(null);

  useEffect(() => {
    if (stream.status === 'running') {
      // Fetch initial stats
      fetchStats();
      
      // Set up interval to fetch stats every 2 seconds
      const interval = setInterval(fetchStats, 2000);
      
      return () => clearInterval(interval);
    }
  }, [stream.id, stream.status]);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`/api/streams/stats?streamId=${stream.id}`);
      setStats(response.data);
    } catch (error) {
      // Stats might not be available yet
      console.log('Stats not available for stream', stream.id);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete the stream "${stream.name}"?`)) {
      return;
    }

    setIsDeleting(true);

    try {
      await axios.delete(`/api/streams/${stream.id}/delete`);
      toast.success('Stream deleted successfully');
      onUpdate();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete stream');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggle = async () => {
    setIsLoading(true);

    try {
      if (stream.status === 'running') {
        await axios.post('/api/streams/stop', { streamId: stream.id });
        toast.success('Stream stopped');
      } else {
        await axios.post('/api/streams/start', {
          streamId: stream.id
        });
        toast.success('Stream started');
      }
      onUpdate();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to toggle stream');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = () => {
    switch (stream.status) {
      case 'running':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getUptime = () => {
    if (!stream.started_at || stream.status !== 'running') return null;
    return dayjs(stream.started_at).fromNow(true);
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{stream.name}</h3>
          <p className="text-sm text-muted-foreground">Video: {stream.video_name}</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
          <span className="text-sm text-muted-foreground capitalize">{stream.status}</span>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Quality:</span>{' '}
            <span className="text-foreground">{stream.quality}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Loop:</span>{' '}
            <span className="text-foreground">{stream.loop_enabled ? 'Enabled' : 'Disabled'}</span>
          </div>
        </div>
        
        {stream.status === 'running' && (
          <>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Uptime:</span>{' '}
                <span className="text-foreground">{getUptime()}</span>
              </div>
              {stats && (
                <div>
                  <span className="text-muted-foreground">Speed:</span>{' '}
                  <span className={`font-medium ${
                    stats.speed >= 0.95 && stats.speed <= 1.05 ? 'text-green-500' : 'text-orange-500'
                  }`}>
                    {stats.speed.toFixed(2)}x
                  </span>
                </div>
              )}
            </div>
            
            {stats && (
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Bitrate:</span>{' '}
                  <span className="text-foreground font-medium">{Math.round(stats.bitrate)} kbps</span>
                </div>
                <div>
                  <span className="text-muted-foreground">FPS:</span>{' '}
                  <span className="text-foreground font-medium">{stats.fps.toFixed(1)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Quality:</span>{' '}
                  <span className={`font-medium ${
                    stats.quality === 'excellent' ? 'text-green-500' :
                    stats.quality === 'good' ? 'text-blue-500' :
                    stats.quality === 'fair' ? 'text-yellow-500' : 'text-red-500'
                  }`}>
                    {stats.quality.charAt(0).toUpperCase() + stats.quality.slice(1)}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
        
        {stream.error_message && (
          <div className="text-sm text-destructive">
            Error: {stream.error_message}
          </div>
        )}
        
        {stats && stats.errors.length > 0 && (
          <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
            Recent errors: {stats.errors[stats.errors.length - 1]}
          </div>
        )}
      </div>

      <div className="flex space-x-2">
        <button
          onClick={handleToggle}
          disabled={isLoading || isDeleting}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded transition-colors
            ${stream.status === 'running'
              ? 'bg-amber-600 text-white hover:bg-amber-700'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isLoading ? 'Processing...' : stream.status === 'running' ? 'Stop Stream' : 'Start Stream'}
        </button>
        {stream.status !== 'running' && (
          <button
            onClick={() => setIsEditing(true)}
            disabled={isDeleting || isLoading}
            className="px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Edit
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={isDeleting || isLoading || stream.status === 'running'}
          className="px-4 py-2 text-sm font-medium bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
          title={stream.status === 'running' ? 'Stop stream before deleting' : 'Delete stream'}
        >
          {isDeleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>

      {isEditing && (
        <EditStreamModal
          stream={stream}
          onClose={() => setIsEditing(false)}
          onSuccess={() => {
            setIsEditing(false);
            onUpdate();
          }}
        />
      )}
    </div>
  );
}