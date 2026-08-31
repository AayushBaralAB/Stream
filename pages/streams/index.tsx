import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Layout from '@/components/Layout';
import StreamCard from '@/components/StreamCard';
import StreamForm from '@/components/StreamForm';
import { useAuthGuard } from '@/lib/authGuard';

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

export default function StreamsPage() {
  const { checking } = useAuthGuard();
  const [streams, setStreams] = useState<Stream[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStreams = async () => {
    try {
      const response = await axios.get('/api/streams/list');
      setStreams(response.data.streams);
    } catch (error) {
      console.error('Failed to fetch streams:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStreams();
    const interval = setInterval(fetchStreams, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  if (checking) return null;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Stream Management</h1>
              <p className="text-muted-foreground">Create and manage your 24/7 live streams</p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={async () => {
                  try {
                    const response = await axios.post('/api/streams/sync-status', {});
                    toast.success('Stream status synchronized');
                    fetchStreams();
                  } catch (error) {
                    toast.error('Failed to sync status');
                  }
                }}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/90 text-sm"
                title="Sync database status with actual running streams"
              >
                Sync Status
              </button>
              <button
                onClick={async () => {
                  try {
                    const response = await axios.post('/api/streams/cleanup', {});
                    toast.success(response.data.message);
                    fetchStreams();
                  } catch (error) {
                    toast.error('Failed to cleanup duplicates');
                  }
                }}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/90 text-sm"
              >
                Clean Duplicates
              </button>
              <button
                onClick={async () => {
                  if (confirm('Force stop ALL streams? This will kill all FFmpeg processes.')) {
                    try {
                      await axios.post('/api/streams/force-stop', {});
                      toast.success('All streams stopped');
                      fetchStreams();
                    } catch (error) {
                      toast.error('Failed to force stop');
                    }
                  }
                }}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 text-sm"
              >
                Force Stop All
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-xl font-semibold text-foreground mb-4">Create New Stream</h2>
              <StreamForm onSuccess={fetchStreams} />
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-xl font-semibold text-foreground mb-4">Your Streams</h2>
              {isLoading ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Loading streams...</p>
                </div>
              ) : streams.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No streams created yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {streams.map((stream) => (
                    <StreamCard key={stream.id} stream={stream} onUpdate={fetchStreams} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}