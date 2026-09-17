import { useState, useEffect } from 'react';
import { newsAPI } from '../services/api';
import { FiPlus, FiTrash2, FiEdit2, FiToggleLeft, FiToggleRight } from 'react-icons/fi';

const EMPTY_FORM = { text: '', active: true, priority: 0 };

export default function News() {
  const [news, setNews] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);

  const fetchNews = async () => {
    try {
      const res = await newsAPI.getAll();
      setNews(res.data.news);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to load news' });
    }
  };

  useEffect(() => { fetchNews(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.text.trim()) {
      setMessage({ type: 'error', text: 'News text is required' });
      return;
    }
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      if (editingId) {
        await newsAPI.update(editingId, form);
        setMessage({ type: 'success', text: 'News updated' });
      } else {
        await newsAPI.create(form);
        setMessage({ type: 'success', text: 'News added' });
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      fetchNews();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save news' });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (n) => {
    setEditingId(n._id);
    setForm({ text: n.text, active: n.active, priority: n.priority });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this news item?')) return;
    try {
      await newsAPI.delete(id);
      setMessage({ type: 'success', text: 'News deleted' });
      fetchNews();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Delete failed' });
    }
  };

  const handleToggle = async (id) => {
    try {
      await newsAPI.toggle(id);
      fetchNews();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Toggle failed' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">News Ticker Management</h2>
        <p className="text-gray-400 text-sm mt-1">Add and manage breaking news shown in the ticker</p>
      </div>

      {message.text && (
        <div className={`px-4 py-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-green-500/10 border border-green-500/20 text-green-400'}`}>
          {message.text}
        </div>
      )}

      {/* FORM */}
      <div className="bg-brand-card border border-brand-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">{editingId ? 'Edit News' : 'Add News'}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">News Text</label>
            <textarea
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              rows={3}
              maxLength={500}
              className="w-full bg-brand-dark border border-brand-border rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-red transition-colors resize-none"
              placeholder="Enter breaking news text..."
            />
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-300 mb-1">Priority (higher first)</label>
              <input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} className="w-full sm:w-40 bg-brand-dark border border-brand-border rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-brand-red transition-colors" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="accent-brand-red w-4 h-4" />
              <span className="text-sm text-gray-300">Active</span>
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={loading} className="bg-brand-red hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2">
                <FiPlus size={14} /> {loading ? 'Saving...' : editingId ? 'Update' : 'Add News'}
              </button>
              {editingId && (
                <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }} className="bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-medium px-6 py-2.5 rounded-lg transition-colors">
                  Cancel
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* LIST */}
      {news.length === 0 ? (
        <div className="bg-brand-card border border-brand-border rounded-xl p-8 text-center text-gray-500">
          No news items yet. Add your first breaking news above.
        </div>
      ) : (
        <div className="space-y-3">
          {news.map(n => (
            <div key={n._id} className={`bg-brand-card border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4 ${n.active ? 'border-brand-border' : 'border-brand-border/40 opacity-60'}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">{n.text}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span>Priority: {n.priority}</span>
                  <span>{new Date(n.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => handleToggle(n._id)} className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${n.active ? 'text-green-400' : 'text-gray-500'}`}>
                  {n.active ? <FiToggleRight size={16} /> : <FiToggleLeft size={16} />}
                  {n.active ? 'Active' : 'Inactive'}
                </button>
                <button onClick={() => handleEdit(n)} className="text-gray-400 hover:text-white p-1.5 rounded-lg transition-colors" title="Edit"><FiEdit2 size={15} /></button>
                <button onClick={() => handleDelete(n._id)} className="text-gray-400 hover:text-red-400 p-1.5 rounded-lg transition-colors" title="Delete"><FiTrash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-center text-xs text-gray-600">Architecture is ready to render the ticker directly into the FFmpeg broadcast output.</p>
    </div>
  );
}