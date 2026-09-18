import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FiHome, FiUpload, FiList, FiFilm, FiGlobe, FiFileText, FiMonitor, FiSettings, FiTerminal, FiUser, FiLogOut, FiMenu, FiX } from 'react-icons/fi';

const navItems = [
  { to: '/dashboard', icon: FiHome, label: 'Dashboard' },
  { to: '/upload', icon: FiUpload, label: 'Upload' },
  { to: '/playlist', icon: FiList, label: 'Playlist' },
  { to: '/videos', icon: FiFilm, label: 'Videos' },
  { to: '/destinations', icon: FiGlobe, label: 'Destinations' },
  { to: '/news', icon: FiFileText, label: 'News Ticker' },
  { to: '/preview', icon: FiMonitor, label: 'Live Preview' },
  { to: '/settings', icon: FiSettings, label: 'Settings' },
  { to: '/logs', icon: FiTerminal, label: 'Logs' },
  { to: '/profile', icon: FiUser, label: 'Profile' },
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-brand-darker flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-brand-dark border-r border-brand-border transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex items-center justify-between h-16 px-6 border-b border-brand-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-red rounded-lg flex items-center justify-center">
              <span className="font-bold text-white text-sm">AL</span>
            </div>
            <span className="text-lg font-bold text-white">Aayush Live</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-gray-400 hover:text-white">
            <FiX size={20} />
          </button>
        </div>

        <nav className="mt-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-red/10 text-brand-red'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-brand-border">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-8 h-8 bg-brand-card rounded-full flex items-center justify-center">
              <FiUser size={16} className="text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.username}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
            <button onClick={handleLogout} className="text-gray-400 hover:text-brand-red transition-colors" title="Logout">
              <FiLogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-brand-dark border-b border-brand-border flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-gray-400 hover:text-white">
              <FiMenu size={22} />
            </button>
            <h1 className="text-lg font-semibold text-white hidden sm:block">Aayush Live Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500 hidden md:block">stream.aayushbaral.com</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-6 scrollbar-thin">
          <Outlet />
        </main>
      </div>
    </div>
  );
}