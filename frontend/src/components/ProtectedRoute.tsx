import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Layout from './Layout';

interface ProtectedRouteProps {
  children: ReactNode;
  fullWidth?: boolean;
  hideFooter?: boolean;
  requireOnboarding?: boolean;
}

export default function ProtectedRoute({ children, fullWidth = false, hideFooter = false, requireOnboarding = false }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100">
        <span className="inline-flex h-12 w-12 animate-spin items-center justify-center rounded-full border-4 border-indigo-200 border-t-indigo-500" />
        <p className="text-sm font-medium text-slate-600" aria-live="polite">
          Preparing your Power Dime workspace…
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireOnboarding && !user.onboarding_completed) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Layout fullWidth={fullWidth} hideFooter={hideFooter}>{children}</Layout>;
}
