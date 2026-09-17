import { useState, useEffect } from 'react';
import { destinationAPI } from '../services/api';
import { FiTrash2, FiEdit2, FiToggleLeft, FiToggleRight } from 'react-icons/fi';

const EMPTY_FORM = { name: '', platform: 'custom', rtmpUrl: '', streamKey: '', enabled: true };

export default function Destinations() {
  const [destinations, setDestinations] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);

  const fetchDestinations = async () => {
    try {
      const res = await destinationAPI.getAll();
      setDestinations(res.data.destinations);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to load destinations' });
    }
  };

  useEffect(() => {
    fetchDestinations();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    if (!form.name || !form.rtmpUrl || !form.streamKey) {
      setMessage({ type: 'error', text: 'All fields are required' });
      setLoading(false);
      return;
    }

    if (form.rtmpUrl.startsWith('rtmp://') === false) {
      setMessage({ type: 'error', text: 'Invalid RTMP URL. Must start with rtmp://' });
      setLoading(false);
      return;
    }

    try {
      if (editingId) {
        await destinationAPI.update(editingId, form);
        setMessage({ type: 'success', text: 'Destination updated' });
      } else {
        await destinationAPI.create(form);
        setMessage({ type: 'success', text: 'Destination created' });
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      fetchDestinations();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save destination' });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (d) => {
    setEditingId(d._id);
    setForm({ name: d.name, platform: d.platform, rtmpUrl: d.rtmpUrl, streamKey: '', enabled: d.enabled });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this destination?')) return;
    try {
      await destinationAPI.delete(id);
      setMessage({ type: 'success', text: 'Destination deleted' });
      fetchDestinations();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Delete failed' });
    }
  };

  const handleToggle = async (id) => {
    try {
      await destinationAPI.toggle(id);
      fetchDestinations();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Toggle failed' });
    }
  };

  const platformColor = (platform) => {
    switch (platform) {
      case 'youtube': return 'bg-red-500/20 text-red-400';
      case 'facebook': return 'bg-blue-500/20 text-blue-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Stream Destinations</h2>
        <p className="text-gray-400 text-sm mt-1">Manage where your stream is sent (YouTube, Facebook, custom RTMP)</p>
      </div>

      {message.text && (
        <div className={`px-4 py-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-green-500/10 border border-green-500/20 text-green-400'}`}>
          {message.text}
        </div>
      )}

      {/* FORM */}
      <div className="bg-brand-card border border-brand-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">{editingId ? 'Edit Destination' : 'Add Destination'}</h3>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Platform</label>
            <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="w-full bg-brand-dark border border-brand-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-red transition-colors">
              <option value="youtube">YouTube</option>
              <option value="facebook">Facebook</option>
              <option value="custom">Custom RTMP</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Main YouTube Channel" className="w-full bg-brand-dark border border-brand-border rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-red transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">RTMP URL</label>
            <input type="text" value={form.rtmpUrl} onChange={(e) => setForm({ ...form, rtmpUrl: e.target.value })} placeholder="rtmp://a.rtmp.youtube.com/live2" className="w-full bg-brand-dark border border-brand-border rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-red transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Stream Key</label>
            <input type="password" value={form.streamKey} onChange={(e) => setForm({ ...form, streamKey: e.target.value })} placeholder={editingId ? 'Leave blank to keep current key' : 'Enter stream key'} className="w-full bg-brand-dark border border-brand-border rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-red transition-colors" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="accent-brand-red w-4 h-4" />
              <span className="text-sm text-gray-300">Enabled</span>
            </label>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" disabled={loading} className="bg-brand-red hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium px-6 py-3 rounded-lg transition-colors">
              {loading ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }} className="bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-medium px-6 py-3 rounded-lg transition-colors">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* LIST */}
      {destinations.length === 0 ? (
        <div className="bg-brand-card border border-brand-border rounded-xl p-8 text-center">
          <p className="text-gray-500">Destination not configured. Add your first destination above.</p>
        </div>
      ) : (
        <div className="bg-brand-card border border-brand-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-brand-dark border-b border-brand-border">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Platform</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Name</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">RTMP URL</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Stream Key</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {destinations.map(d => (
                  <tr key={d._id} className="border-b border-brand-border/50 hover:bg-white/5">
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded ${platformColor(d.platform)}`}>{d.platform}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-white">{d.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-400 font-mono text-xs">{d.rtmpUrl}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">{d.streamKey}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleToggle(d._id)} className={`flex items-center gap-2 text-xs font-medium ${d.enabled ? 'text-green-400' : 'text-gray-500'}`}>
                        {d.enabled ? <FiToggleRight size={18} /> : <FiToggleLeft size={18} />}
                        {d.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleEdit(d)} className="text-gray-400 hover:text-white transition-colors" title="Edit"><FiEdit2 size={15} /></button>
                        <button onClick={() => handleDelete(d._id)} className="text-gray-400 hover:text-red-400 transition-colors" title="Delete"><FiTrash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-center text-xs text-gray-600">Stream keys are encrypted at rest and never exposed in full after saving.</p>
    </div>
  );
}