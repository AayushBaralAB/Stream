import { useState, useEffect, useCallback } from 'react';
import { logAPI } from '../services/api';
import { FiRefreshCw, FiTrash2 } from 'react-icons/fi';

const LEVEL_COLORS = {
  info: 'bg-blue-500/20 text-blue-400',
  warn: 'bg-yellow-500/20 text-yellow-400',
  error: 'bg-red-500/20 text-red-400',
  debug: 'bg-gray-500/20 text-gray-400',
};

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [level, setLevel] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });

  const fetchLogs = useCallback(async () => {
    try {
      const params = {};
      if (level) params.level = level;
      const res = await logAPI.getAll(params);
      setLogs(res.data.logs);
      setTotal(res.data.total);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to load logs' });
    }
  }, [level]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleClear = async () => {
    if (!window.confirm('Clear all logs?')) return;
    try {
      await logAPI.clear();
      setMessage({ type: 'success', text: 'Logs cleared' });
      fetchLogs();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to clear logs' });
    }
  };

  const formatTime = (iso) => new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">System Logs</h2>
          <p className="text-gray-400 text-sm mt-1">Stream and system activity ({total} entries)</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={level} onChange={(e) => setLevel(e.target.value)} className="bg-brand-card border border-brand-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-red">
            <option value="">All levels</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="debug">Debug</option>
          </select>
          <button onClick={fetchLogs} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white text-sm font-medium px-4 py-2 rounded-lg border border-brand-border transition-colors">
            <FiRefreshCw size={14} /> Refresh
          </button>
          <button onClick={handleClear} className="flex items-center gap-2 bg-red-950 hover:bg-red-900 text-red-400 text-sm font-medium px-4 py-2 rounded-lg border border-red-900 transition-colors">
            <FiTrash2 size={14} /> Clear
          </button>
        </div>
      </div>

      {message.text && (
        <div className={`px-4 py-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-green-500/10 border border-green-500/20 text-green-400'}`}>
          {message.text}
        </div>
      )}

      {logs.length === 0 ? (
        <div className="bg-brand-card border border-brand-border rounded-xl p-8 text-center text-gray-500">
          No logs yet.
        </div>
      ) : (
        <div className="bg-brand-card border border-brand-border rounded-xl overflow-hidden">
          <div className="divide-y divide-brand-border/50">
            {logs.map(l => (
              <div key={l._id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-2">
                <div className="flex items-center gap-2 shrink-0 sm:w-44">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${LEVEL_COLORS[l.level] || LEVEL_COLORS.info}`}>{l.level}</span>
                  <span className="text-xs text-gray-500 font-medium">{l.source}</span>
                </div>
                <div className="text-sm text-gray-300 flex-1 break-words">{l.message}</div>
                <div className="text-xs text-gray-600 shrink-0">{formatTime(l.createdAt)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}