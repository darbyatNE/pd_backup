import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [showDemoAccounts, setShowDemoAccounts] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { signIn, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [authLoading, user, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await signIn(email, password);
      navigate('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to sign in';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <header className="text-center">
          <div className="flex justify-center mb-4">
            <img
              src="/logo.png"
              alt="Power Dime"
              className="h-12"
            />
          </div>
          <p className="mt-2 text-sm text-slate-600">Enterprise Energy Procurement Platform</p>
        </header>

        <div className="rounded-lg border border-slate-200 bg-white p-6 sm:p-8">
          {error && (
            <div
              role="alert"
              className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            >
              {error}
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Email
              </label>
              <input
                className="block w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="buyer1@techdc.com"
                autoComplete="email"
                disabled={isSubmitting || authLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Password
              </label>
              <input
                className="block w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 transition focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Your password"
                autoComplete="current-password"
                disabled={isSubmitting || authLoading}
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSubmitting || authLoading}
              aria-busy={isSubmitting || authLoading}
            >
              {isSubmitting || authLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          <div className="text-center mt-4">
            <button
              type="button"
              onClick={() => navigate('/onboarding')}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Don't have an account? Sign up
            </button>
          </div>
        </div>

        {/* Demo Credentials - Collapsed by default for production-ready look */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => setShowDemoAccounts(!showDemoAccounts)}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showDemoAccounts ? 'Hide demo accounts' : 'Show demo accounts'}
          </button>
        </div>

        {showDemoAccounts && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 animate-in fade-in duration-200">
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setEmail('buyer1@techdc.com');
                  setPassword('PowerDime2025!');
                }}
                className="w-full flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 transition-colors"
              >
                <div className="text-left">
                  <p className="font-medium text-slate-900">Buyer Account</p>
                  <p className="text-xs text-slate-500">buyer1@techdc.com</p>
                </div>
                <span className="text-xs text-slate-500 font-medium">Click to fill</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmail('seller1@solarpro.com');
                  setPassword('PowerDime2025!');
                }}
                className="w-full flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 transition-colors"
              >
                <div className="text-left">
                  <p className="font-medium text-slate-900">Seller Account</p>
                  <p className="text-xs text-slate-500">seller1@solarpro.com</p>
                </div>
                <span className="text-xs text-slate-500 font-medium">Click to fill</span>
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-400 text-center">
              Password: PowerDime2025!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
