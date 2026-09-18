import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import { FiUser, FiMail, FiSave } from 'react-icons/fi';

export default function Profile() {
  const { user, checkAuth } = useAuth();
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      await authAPI.updateProfile({ username, email });
      await checkAuth();
      setMessage({ type: 'success', text: 'Profile updated' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Update failed' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Profile</h2>
        <p className="text-gray-400 text-sm mt-1">Manage your admin account details</p>
      </div>

      {message.text && (
        <div className={`px-4 py-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-green-500/10 border border-green-500/20 text-green-400'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-brand-card border border-brand-border rounded-xl p-5">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-brand-dark border border-brand-border rounded-full flex items-center justify-center">
            <FiUser size={28} className="text-gray-400" />
          </div>
          <div>
            <div className="text-lg font-bold text-white">{user?.username}</div>
            <div className="text-sm text-gray-500">{user?.email}</div>
            <span className="inline-block mt-1 text-xs font-medium bg-brand-red/10 text-brand-red px-2 py-0.5 rounded">Administrator</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1 flex items-center gap-2">
              <FiUser size={13} /> Username
            </label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={30} className="w-full bg-brand-dark border border-brand-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-red transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1 flex items-center gap-2">
              <FiMail size={13} /> Email
            </label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full bg-brand-dark border border-brand-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-red transition-colors" />
          </div>
          <button type="submit" disabled={saving} className="flex items-center gap-2 bg-brand-red hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium px-6 py-3 rounded-lg transition-colors">
            <FiSave size={15} /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      <div className="bg-brand-card border border-brand-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Account Info</h3>
        <div className="text-sm text-gray-400 space-y-1.5">
          <div>Role: <span className="text-white">Admin</span></div>
          <div>Account created: <span className="text-white">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}</span></div>
        </div>
      </div>
    </div>
  );
}