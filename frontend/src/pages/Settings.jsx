import { useState, useEffect } from 'react';
import { settingsAPI } from '../services/api';
import { FiUpload, FiImage } from 'react-icons/fi';

export default function Settings() {
  const [settings, setSettings] = useState({
    logoEnabled: false,
    logoWidth: 150,
    logoMargin: 20,
    logoOpacity: 1.0,
    tickerEnabled: true,
    tickerSpeed: 30,
    hasLogo: false,
  });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    settingsAPI.get().then(r => {
      setSettings(s => ({
        ...s,
        ...r.data.settings,
      }));
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await settingsAPI.update({
        logoEnabled: settings.logoEnabled,
        logoWidth: Number(settings.logoWidth),
        logoMargin: Number(settings.logoMargin),
        logoOpacity: Number(settings.logoOpacity),
        tickerEnabled: settings.tickerEnabled,
        tickerSpeed: Number(settings.tickerSpeed),
      });
      if (res.data.live?.restarted) {
        setMessage({ type: 'success', text: 'Settings saved — applied to the live stream' });
      } else {
        setMessage({ type: 'success', text: 'Settings saved' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'image/png') {
      setMessage({ type: 'error', text: 'Only PNG logos are allowed' });
      return;
    }
    const formData = new FormData();
    formData.append('logo', file);
    setUploadingLogo(true);
    setMessage({ type: '', text: '' });
    try {
      await settingsAPI.uploadLogo(formData);
      setSettings(s => ({ ...s, hasLogo: true }));
      setMessage({ type: 'success', text: 'Logo uploaded' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Logo upload failed' });
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const logoUrl = settings.hasLogo ? `/api/settings/logo-file?t=${Date.now()}` : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Streaming Settings</h2>
        <p className="text-gray-400 text-sm mt-1">Configure logo overlay, ticker and broadcast options</p>
      </div>

      {message.text && (
        <div className={`px-4 py-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-green-500/10 border border-green-500/20 text-green-400'}`}>
          {message.text}
        </div>
      )}

      {/* LOGO OVERLAY */}
      <div className="bg-brand-card border border-brand-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Logo Overlay</h3>

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="w-24 h-20 bg-brand-dark border border-dashed border-brand-border rounded-lg overflow-hidden flex items-center justify-center shrink-0">
              {settings.hasLogo && logoUrl ? (
                <img src={logoUrl} alt="Channel Logo" className="max-w-full max-h-full object-contain p-2" onError={(e) => { e.target.style.display = 'none'; }} />
              ) : (
                <div className="text-center text-gray-600">
                  <FiImage size={24} className="mx-auto mb-1" />
                  <span className="text-[10px]">No logo</span>
                </div>
              )}
            </div>
            <div className="flex-1 space-y-3">
              <label className="inline-flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg cursor-pointer transition-colors">
                <FiUpload size={16} /> {uploadingLogo ? 'Uploading...' : settings.hasLogo ? 'Change Logo' : 'Upload PNG Logo'}
                <input type="file" accept="image/png" onChange={handleLogoUpload} className="hidden" />
              </label>
              <p className="text-xs text-gray-500">PNG only, max 5 MB. Transparent backgrounds work best.</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={settings.logoEnabled} onChange={(e) => setSettings({ ...settings, logoEnabled: e.target.checked })} className="accent-brand-red w-4 h-4" />
                <span className="text-sm text-gray-300">Overlay logo on stream</span>
              </label>
            </div>
          </div>

          {settings.hasLogo && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Logo Width (px)</label>
                <input type="number" min="50" max="500" value={settings.logoWidth} onChange={(e) => setSettings({ ...settings, logoWidth: e.target.value })} className="w-full bg-brand-dark border border-brand-border rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-brand-red transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Margin (px)</label>
                <input type="number" min="0" max="100" value={settings.logoMargin} onChange={(e) => setSettings({ ...settings, logoMargin: e.target.value })} className="w-full bg-brand-dark border border-brand-border rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-brand-red transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Opacity (0-1)</label>
                <input type="number" min="0" max="1" step="0.1" value={settings.logoOpacity} onChange={(e) => setSettings({ ...settings, logoOpacity: e.target.value })} className="w-full bg-brand-dark border border-brand-border rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-brand-red transition-colors" />
              </div>
            </div>
          )}
          <p className="text-xs text-gray-600">Default logo position: top-right. Overlay applies to the FFmpeg broadcast output (HLS preview, YouTube, Facebook, custom RTMP).</p>
        </div>
      </div>

      {/* NEWS TICKER */}
      <div className="bg-brand-card border border-brand-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">News Ticker</h3>
        <div className="space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={settings.tickerEnabled} onChange={(e) => setSettings({ ...settings, tickerEnabled: e.target.checked })} className="accent-brand-red w-4 h-4" />
            <span className="text-sm text-gray-300">Show breaking news ticker</span>
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Ticker Speed (seconds per cycle)</label>
            <input type="number" min="10" max="120" value={settings.tickerSpeed} onChange={(e) => setSettings({ ...settings, tickerSpeed: e.target.value })} className="w-full bg-brand-dark border border-brand-border rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-brand-red transition-colors" />
          </div>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} className="bg-brand-red hover:bg-red-700 disabled:opacity-50 text-white font-medium py-3 px-8 rounded-xl transition-colors">
        {saving ? 'Saving...' : 'Save Settings'}
      </button>

      <p className="text-xs text-gray-600">All settings are stored securely in MongoDB. Stream keys are AES-256-GCM encrypted.</p>
    </div>
  );
}