import { useState, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { Video } from '@/types/video';
import VideoPreview from './VideoPreview';

interface VideoLibraryProps {
  videos: Video[];
  onRefresh: () => void;
}

export default function VideoLibrary({ videos, onRefresh }: VideoLibraryProps) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [previewVideo, setPreviewVideo] = useState<Video | null>(null);
  const [sortedVideos, setSortedVideos] = useState<Video[]>(videos);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Keep local order in sync when the parent list changes
  const prevVideosRef = useRef<Video[]>(videos);
  if (prevVideosRef.current !== videos) {
    prevVideosRef.current = videos;
    setSortedVideos(videos);
  }

  const totalSize = sortedVideos.reduce((acc, video) => acc + video.file_size, 0);
  const totalVideos = sortedVideos.length;

  const formatFileSize = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  const handleDragStart = (id: number) => {
    setDragId(id);
  };

  const handleDragEnter = (index: number) => {
    setOverIndex(index);
  };

  const handleDrop = async () => {
    if (dragId == null || overIndex == null) return;

    const fromIndex = sortedVideos.findIndex((v) => v.id === dragId);
    if (fromIndex < 0) return;

    const next = [...sortedVideos];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(overIndex, 0, moved);

    setSortedVideos(next);

    // Persist the new order
    const order = next.map((v) => v.id);
    try {
      await axios.post('/api/videos/reorder', { ids: order });
      toast.success('Video order updated');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to reorder videos');
      onRefresh();
    }

    setDragId(null);
    setOverIndex(null);
  };

  const handleDelete = async (video: Video) => {
    if (!confirm(`Are you sure you want to delete "${video.original_name}"?`)) {
      return;
    }

    setDeletingId(video.id);

    try {
      await axios.delete(`/api/videos/${video.id}/delete`);
      toast.success('Video deleted successfully');
      onRefresh();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete video');
    } finally {
      setDeletingId(null);
    }
  };

  if (sortedVideos.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No videos uploaded yet</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 text-sm text-muted-foreground">
        <span>{totalVideos} {totalVideos === 1 ? 'video' : 'videos'}</span>
        <span className="mx-2">•</span>
        <span>Total size: {formatFileSize(totalSize)}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {sortedVideos.map((video, index) => (
        <div
          key={video.id}
          draggable
          onDragStart={() => handleDragStart(video.id)}
          onDragEnter={() => handleDragEnter(index)}
          onDragOver={(e) => e.preventDefault()}
          onDragEnd={() => {
            setDragId(null);
            setOverIndex(null);
          }}
          onDrop={handleDrop}
          className={`bg-card border rounded-lg p-4 space-y-3 cursor-grab active:cursor-grabbing transition-colors ${
            dragId === video.id ? 'border-primary opacity-60' : 'border-border'
          }`}
          data-video-id={video.id}
        >
          <div 
            className="aspect-video bg-secondary rounded overflow-hidden cursor-pointer hover:opacity-90 transition-opacity group relative"
            onClick={() => setPreviewVideo(video)}
          >
            {video.thumbnail_path ? (
              <img
                src={`/api/thumbnails/${video.filename.replace(/\.[^/.]+$/, '')}_thumb.jpg`}
                alt={video.original_name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : null}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
              <svg
                className="w-12 h-12 text-white drop-shadow-lg"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
          
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <h3 className="font-medium text-foreground truncate" title={video.original_name}>
                {video.original_name}
              </h3>
              <div className="text-sm text-muted-foreground space-y-1 mt-1">
                <p>{formatFileSize(video.file_size)}</p>
                <p>{dayjs(video.created_at).format('MMM D, YYYY h:mm A')}</p>
              </div>
            </div>
            <svg
              className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9h8M8 15h8" />
            </svg>
          </div>

          <div className="flex space-x-2">
            <button
              onClick={() => setPreviewVideo(video)}
              className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              Preview
            </button>
            <button
              onClick={() => handleDelete(video)}
              disabled={deletingId === video.id}
              className="flex-1 px-3 py-2 text-sm bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deletingId === video.id ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      ))}
      
      {previewVideo && (
        <VideoPreview
          video={previewVideo}
          onClose={() => setPreviewVideo(null)}
        />
      )}
      </div>
    </div>
  );
}
