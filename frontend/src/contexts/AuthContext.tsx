import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User, AppSession, AuthContextType } from '../types/index';
import { setUserId } from '../utils/errorReporter';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const TOKEN_KEY = 'pd_access_token';
const COGNITO_TOKEN_KEY = 'pd_cognito_access_token';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<AppSession | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(({ user: userData }) => {
        setUser(userData);
        setUserId(userData.id);
        setSession({
          access_token: token,
          cognito_access_token: localStorage.getItem(COGNITO_TOKEN_KEY) || '',
        });
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(COGNITO_TOKEN_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  const signIn = async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    const newSession: AppSession = {
      access_token: data.session.access_token,
      cognito_access_token: data.session.cognito_access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
    };

    localStorage.setItem(TOKEN_KEY, newSession.access_token);
    localStorage.setItem(COGNITO_TOKEN_KEY, newSession.cognito_access_token);

    setSession(newSession);
    setUser(data.user);
    setUserId(data.user.id);
  };

  const signOut = async () => {
    const cognitoToken = localStorage.getItem(COGNITO_TOKEN_KEY);

    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cognito_access_token: cognitoToken }),
    }).catch(() => {}); // best-effort

    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(COGNITO_TOKEN_KEY);
    setUser(null);
    setSession(null);
    setUserId(null);
  };

  const signUp = async (
    email: string,
    password: string,
    metadata?: { firstName: string; lastName: string; role: string; title?: string; company_name?: string }
  ): Promise<{ userId: string }> => {
    const contact_person = metadata
      ? `${metadata.firstName} ${metadata.lastName}`.trim()
      : undefined;

    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        role: metadata?.role || 'buyer',
        company_name: metadata?.company_name || null,
        contact_person: contact_person || null,
        title: metadata?.title || null,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Signup failed');

    return { userId: data.userId };
  };

  const value: AuthContextType = { user, session, loading, signIn, signOut, signUp };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
