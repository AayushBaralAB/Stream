export interface SessionData {
  user?: {
    isLoggedIn: boolean;
    username: string;
  };
}

const SESSION_KEY = 'streaming-app-session';

export function getClientSession(): SessionData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && (parsed.isLoggedIn || parsed.user?.isLoggedIn) ? parsed : null;
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  const session = getClientSession();
  return session?.user?.isLoggedIn === true || (session as { isLoggedIn?: boolean } | null)?.isLoggedIn === true;
}

export function createClientSession(username: string): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user: { isLoggedIn: true, username } }));
  } catch {
    /* ignore */
  }
}

export function destroyClientSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}