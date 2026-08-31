import { useState } from 'react';
import { Video } from '@/types/video';
import { withBase } from '@/lib/basePath';

interface VideoPreviewProps {
  video: Video;
  onClose: () => void;
}

export default function VideoPreview({ video, onClose }: VideoPreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const localSource = video.file_path || '';
  const videoUrl =
    localSource.startsWith('blob:') ||
    localSource.startsWith('data:') ||
    localSource.startsWith('http') ||
    localSource.startsWith('/')
      ? localSource
      : withBase(`/uploads/${video.filename}`);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-card border border-border rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h3 className="text-lg font-semibold text-foreground truncate">
            {video.original_name}
          </h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="relative bg-black aspect-video">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-muted-foreground">Loading video...</div>
            </div>
          )}
          <video
            src={videoUrl}
            controls
            className="w-full h-full"
            onLoadedData={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              console.error('Failed to load video:', videoUrl);
            }}
          >
            Your browser does not support the video tag.
          </video>
        </div>
        
        <div className="p-4 border-t border-border">
          <div className="text-sm text-muted-foreground space-y-1">
            <p>File size: {(video.file_size / 1024 / 1024).toFixed(2)} MB</p>
            <p>Uploaded: {new Date(video.created_at).toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}