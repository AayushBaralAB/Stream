import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Layout from '@/components/Layout';
import { useAuthGuard } from '@/lib/authGuard';

export default function SettingsPage() {
  const { checking } = useAuthGuard();
  const [appName, setAppName] = useState('QC Live');
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const res = await axios.get('/api/settings');
      const s = res.data?.settings;
      if (s) {
        setAppName(s.appName || 'QC Live');
        setLogoPath(s.logoPath || null);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const onLogoSelect = (file: File) => {
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append('appName', appName);
      if (logoFile) {
        formData.append('logo', logoFile);
      }
      await axios.post('/api/settings', formData);
      toast.success('Settings saved successfully!');
      setLogoFile(null);
      setLogoPreview(null);
      await loadSettings();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveLogo = async () => {
    // Removal isn't supported by the API directly; clear refs on UI.
    toast('Logo removal is not supported. Upload a new logo to replace it.');
  };

  if (checking) return null;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Settings</h1>
          <p className="text-muted-foreground">
            Customize your application logo and name
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Application Name
            </label>
            <input
              type="text"
              value={appName}
              maxLength={40}
              onChange={(e) => setAppName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
              placeholder="Enter app name"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Shown in the top navigation, footer, login screen and browser title.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Logo
            </label>
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 h-20 w-20 bg-secondary rounded-lg border border-border flex items-center justify-center overflow-hidden">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" className="h-full w-full object-contain" />
                ) : logoPath ? (
                  <img src={logoPath} alt="Current logo" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xs text-muted-foreground">No logo</span>
                )}
              </div>
              <div className="space-y-2">
                <label className="inline-flex items-center px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 cursor-pointer">
                  {logoPath ? 'Replace Logo' : 'Upload Logo'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onLogoSelect(f);
                    }}
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  PNG, JPG, SVG, WebP or GIF. Will be shown in the header and login screen.
                </p>
              </div>
            </div>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
