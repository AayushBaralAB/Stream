import { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';

export function useHLS(src) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [status, setStatus] = useState('idle'); // idle, loading, playing, error, offline
  const [error, setError] = useState(null);

  const loadSource = useCallback(() => {
    if (!src || !videoRef.current) return;

    const video = videoRef.current;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 6,
        enableWorker: true,
      });
      hlsRef.current = hls;

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStatus('loading');
        video.play().then(() => {
          setStatus('playing');
        }).catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setError('Network error - stream may be offline');
              setStatus('error');
              setTimeout(() => {
                if (hlsRef.current) hlsRef.current.startLoad();
              }, 5000);
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setError('Fatal playback error');
              setStatus('error');
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('loadedmetadata', () => {
        setStatus('loading');
        video.play().then(() => {
          setStatus('playing');
        }).catch(() => {});
      });
      video.addEventListener('error', () => {
        setError('Playback error');
        setStatus('error');
      });
    } else {
      setError('HLS not supported in this browser');
      setStatus('error');
    }
  }, [src]);

  useEffect(() => {
    loadSource();
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [loadSource]);

  return { videoRef, status, error, setStatus, setError, reload: loadSource };
}
