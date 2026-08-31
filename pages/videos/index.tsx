import { useState, useEffect } from 'react';
import axios from 'axios';
import VideoUpload from '@/components/VideoUpload';
import VideoLibrary from '@/components/VideoLibrary';
import Layout from '@/components/Layout';
import { useAuthGuard } from '@/lib/authGuard';

export default function VideosPage() {
  const { checking } = useAuthGuard();
  const [videos, setVideos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchVideos = async () => {
    try {
      const response = await axios.get('/api/videos/list');
      setVideos(response.data.videos);
    } catch (error) {
      console.error('Failed to fetch videos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  if (checking) return null;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Video Library</h1>
          <p className="text-muted-foreground">Upload and manage your videos</p>
        </div>

        <div className="space-y-8">
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">Upload Video</h2>
            <VideoUpload onUploadComplete={fetchVideos} />
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">Your Videos</h2>
            {isLoading ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Loading videos...</p>
              </div>
            ) : (
              <VideoLibrary videos={videos} onRefresh={fetchVideos} />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}