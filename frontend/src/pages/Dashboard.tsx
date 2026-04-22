import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  ChartBarIcon,
  DocumentCheckIcon,
  FolderOpenIcon,
  LifebuoyIcon,
  RocketLaunchIcon
} from '../components/Icons';
import { SkeletonDashboard } from '../components/Skeleton';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const role = user?.role ?? 'buyer';

  const quickActions = useMemo(
    () =>
      [
        {
          label: role === 'buyer' ? 'Browse Projects' : 'Portfolio Overview',
          description:
            role === 'buyer'
              ? 'Compare curated solar and wind PPAs ready for diligence.'
              : 'Review active listings and ensure project data is up to date.',
          action: () => navigate('/projects'),
          Icon: role === 'buyer' ? RocketLaunchIcon : ChartBarIcon,
        },
        {
          label: role === 'buyer' ? 'Review Transactions' : 'Review Interests',
          description:
            role === 'buyer'
              ? 'View and manage your project interest submissions.'
              : 'Assess buyer demand, accept or reject PPA requests.',
          action: () => navigate('/transactions'),
          Icon: role === 'buyer' ? DocumentCheckIcon : FolderOpenIcon,
        },
        {
          label: 'Need Support?',
          description: 'Power Dime team can assist with docs, models, and diligence.',
          action: () => {
            if (typeof window !== 'undefined') {
              window.location.href = 'mailto:support@powerdime.com';
            }
          },
          Icon: LifebuoyIcon,
        },
      ],
    [navigate, role]
  );

  if (!user) {
    return <SkeletonDashboard />;
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1 space-y-3 min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-slate-600 bg-slate-100 rounded-md">
                  {role === 'buyer' ? 'Buyer Portal' : role === 'seller' ? 'Seller Portal' : 'Portal'}
                </span>
              </div>
              <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl truncate">
                Welcome, {user?.contact_person || user?.company_name || 'User'}
              </h1>
              <p className="text-slate-600 max-w-2xl text-lg">
                {role === 'buyer'
                  ? 'Browse available energy projects and submit interest to start the PPA process.'
                  : 'Manage your energy projects and review buyer interest submissions.'}
              </p>
            </div>

            <div className="border border-slate-200 bg-slate-50 rounded-xl p-5 flex-shrink-0 lg:min-w-[300px]">
              <dl className="space-y-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 font-medium">Company</dt>
                  <dd className="font-semibold text-slate-900 truncate">{user?.company_name ?? '—'}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 font-medium">Role</dt>
                  <dd className="font-semibold text-slate-900 capitalize">{user?.role ?? '—'}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 font-medium">Email</dt>
                  <dd className="font-medium text-slate-900 truncate text-xs">{user?.email}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-xl font-semibold text-slate-900">Quick Actions</h2>

        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.action}
              className="group flex flex-col items-start rounded-xl border border-slate-200 bg-white p-6 text-left transition hover:border-slate-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-700 mb-5 transition group-hover:bg-slate-900 group-hover:text-white">
                <action.Icon className="w-6 h-6" />
              </div>
              <span className="text-lg font-semibold text-slate-900 mb-2">{action.label}</span>
              <span className="text-sm text-slate-600 leading-relaxed">{action.description}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
