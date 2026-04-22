import { useEffect } from 'react';
import { jam } from '@jam.dev/sdk';
import { useAuth } from '../contexts/AuthContext';

/**
 * JamMetadata – attaches live user context to every Jam capture.
 * Team ID is configured in index.html via <meta name="jam:team">.
 * Place inside AuthProvider so useAuth() has access to the current user.
 *
 * Docs: https://jam.dev/docs/debug-a-jam/devtools/jam.metadata
 */
export default function JamMetadata() {
  const { user, session } = useAuth();

  useEffect(() => {
    jam.metadata(() => ({
      userId: user?.id ?? null,
      email: user?.email ?? null,
      role: user?.role ?? null,
      companyName: user?.company_name ?? null,
      isAuthenticated: Boolean(session),
      currentPath: window.location.pathname,
      timeSincePageLoad: performance.now(),
    }));
  }, [user, session]);

  return null;
}
