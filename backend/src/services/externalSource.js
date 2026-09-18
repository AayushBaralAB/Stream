const { execFile } = require('child_process');
const path = require('path');

// Resolve a public platform URL (YouTube / Facebook / TikTok live or video)
// into a directly playable media URL using yt-dlp. Returns { ok, url, error }.
function getYtDlpCommand() {
  if (process.env.YTDLP_PATH && process.env.YTDLP_PATH.trim()) {
    return { cmd: process.env.YTDLP_PATH, args: [] };
  }
  const local = path.join(__dirname, '../bin/yt-dlp.exe');
  try {
    const fs = require('fs');
    if (fs.existsSync(local)) return { cmd: local, args: [] };
  } catch (e) {}
  // python -m yt_dlp is a reliable fallback on machines where pip installed it.
  return { cmd: 'python', args: ['-m', 'yt_dlp'] };
}

function resolveExternalSource(sourceUrl) {
  return new Promise((resolve) => {
    const { cmd, args } = getYtDlpCommand();
    const base = [
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      '--geo-bypass',
      '-f', 'bv*+ba/b',
      '-g',
    ];
    execFile(cmd, [...args, ...base, sourceUrl], { timeout: 90000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        resolve({
          ok: false,
          error: `yt-dlp could not resolve the ${sourceUrl} source: ${(stderr || '').trim().split('\n').pop() || err.message}`,
        });
        return;
      }
      const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        resolve({ ok: false, error: 'yt-dlp returned no playable URL for the given source' });
        return;
      }
      // yt-dlp -g prints one URL per stream. With -f 'bv*+ba/b' a combined
      // format yields a single line (video+audio), otherwise two lines:
      // line 1 = video-only URL, line 2 = audio-only URL. Keep them separate so
      // the caller can feed ffmpeg both inputs (critical for RTMP output, which
      // requires an audio track).
      resolve({
        ok: true,
        videoUrl: lines[0],
        audioUrl: lines.length > 1 ? lines[1] : null,
      });
    });
  });
}

module.exports = { resolveExternalSource, getYtDlpCommand };