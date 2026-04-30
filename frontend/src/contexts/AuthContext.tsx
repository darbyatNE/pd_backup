import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import type { User, AuthContextType } from '../types/index';
import { setUserId } from '../utils/errorReporter';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserData = async (userId: string) => {
    try {
      if (import.meta.env.DEV) {
        console.debug('[Auth] Fetching user record', { userId });
      }
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setUser(data);
      // Track user ID for error reporting
      setUserId(userId);
      if (import.meta.env.DEV) {
        console.debug('[Auth] User record loaded', { userId, role: data?.role });
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      setUser(null);
      setUserId(null);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    if (import.meta.env.DEV) {
      console.debug('[Auth] Starting sign-in', { email });
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('[Auth] Sign-in failed', { email, error });
      throw error;
    }

    if (import.meta.env.DEV) {
      console.debug('[Auth] Sign-in success', {
        email,
        hasSession: Boolean(data.session),
        hasUser: Boolean(data.user),
      });
    }

    // Fetch user data after successful login
    if (data.user) {
      await fetchUserData(data.user.id);
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setSession(null);
    // Clear user ID for error reporting
    setUserId(null);
  };

  const signUp = async (email: string, password: string, metadata?: { firstName: string; lastName: string; role: string; title?: string }) => {
    if (import.meta.env.DEV) {
      console.debug('[Auth] Starting sign-up', { email });
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: metadata?.firstName,
          last_name: metadata?.lastName,
          role: metadata?.role,
          title: metadata?.title,
        },
      },
    });

    if (error) {
      console.error('[Auth] Sign-up failed', { email, error });
      throw error;
    }

    if (import.meta.env.DEV) {
      console.debug('[Auth] Sign-up success', {
        email,
        hasSession: Boolean(data.session),
        hasUser: Boolean(data.user),
      });
    }

    if (data.user && metadata) {
      // If we have a user and metadata, ensure we fetch the updated record
      // This is helpful if there's a trigger that populates the users table
      await fetchUserData(data.user.id);
    }

    return { data, error };
  };

  const value = {
    user,
    session,
    loading,
    signIn,
    signOut,
    signUp
  };

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
