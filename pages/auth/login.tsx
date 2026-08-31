import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [appName, setAppName] = useState('QC Live');
  const [logoPath, setLogoPath] = useState<string | null>(null);

  useEffect(() => {
    axios
      .get('/api/settings')
      .then((res) => {
        const s = res.data?.settings;
        if (s) {
          setAppName(s.appName || 'QC Live');
          setLogoPath(s.logoPath || null);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await axios.post('/api/auth/login', { username, password });
      toast.success('Login successful!');
      router.push('/dashboard');
    } catch (error) {
      toast.error('Invalid credentials');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center mb-4">
            {logoPath ? (
              <img src={logoPath} alt={appName} className="h-16 w-16 object-contain" />
            ) : null}
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-foreground">
            {appName}
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Sign in to manage your streams
          </p>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Demo login — Username: <span className="text-primary">admin</span> · Password: <span className="text-primary">admin</span>
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="username" className="sr-only">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-border placeholder-muted-foreground text-foreground rounded-t-md focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm bg-input"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-border placeholder-muted-foreground text-foreground rounded-b-md focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm bg-input"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
      
      <div className="mt-auto py-4 text-center">
        <p className="text-xs text-muted-foreground">
          Designed by <span className="text-primary">Aayush Baral</span>
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          © {new Date().getFullYear()} {appName} • Dev Edition
        </p>
      </div>
    </div>
  );
}