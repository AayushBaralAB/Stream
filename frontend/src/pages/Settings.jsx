import { useState, useEffect } from 'react';
import { settingsAPI } from '../services/api';

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
      await settingsAPI.update({
        logoEnabled: settings.logoEnabled,
        logoWidth: Number(settings.logoWidth),
        logoMargin: Number(settings.logoMargin),
        logoOpacity: Number(settings.logoOpacity),
        tickerEnabled: settings.tickerEnabled,
        tickerSpeed: Number(settings.tickerSpeed),
      });
      setMessage({ type: 'success', text: 'Settings saved' });
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300">Channel Logo</label>
              <p className="text-xs text-gray-500 mt-1">{settings.hasLogo ? 'Logo uploaded (stored at /data/logos)' : 'No logo uploaded yet'}</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={settings.logoEnabled} onChange={(e) => setSettings({ ...settings, logoEnabled: e.target.checked })} className="accent-brand-red w-4 h-4" />
              <span className="text-sm text-gray-300">Overlay logo on stream</span>
            </label>
          </div>

          {settings.hasLogo && (
            <div className="flex items-center gap-3">
              <img src="/api/settings/logo-file" alt="Channel Logo" className="w-16 h-16 object-contain bg-brand-dark border border-brand-border rounded-lg p-1" />
              <label className="bg-white/5 hover:bg-white/10 text-white text-sm font-medium px-4 py-2.5 rounded-lg cursor-pointer border border-brand-border transition-colors">
                <span className="flex items-center gap-2">{uploadingLogo ? 'Uploading...' : 'Change Logo'}</span>
                <input type="file" accept="image/png" onChange={handleLogoUpload} className="hidden" />
              </label>
            </div>
          )}

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
          <p className="text-xs text-gray-600">Default logo position: top-right. Overlay applies to the FFmpeg broadcast output.</p>
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