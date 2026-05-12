import { Fragment, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bars3Icon } from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import { UserCircleIcon } from './Icons';
import MobileNav from './MobileNav';
import { Menu, Transition } from '@headlessui/react';
import ScopeBar from './ScopeBar';
import { useDashboardView, DASHBOARD_VIEWS, DASHBOARD_SUBTABS } from '../contexts/DashboardViewContext';

interface LayoutProps {
  children: ReactNode;
  fullWidth?: boolean;
}

const getNavLinks = (_role?: string) => [];

export default function Layout({ children, fullWidth = false }: LayoutProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const activePath = (location.pathname.replace(/\/$/, '') || '/dashboard') + location.search;

  const isLinkActive = (linkPath: string) => {
    if (linkPath.includes('?')) {
      return activePath === linkPath;
    }
    // For paths without query params, match only if activePath has no query string
    const pathWithoutQuery = activePath.split('?')[0];
    return pathWithoutQuery === linkPath && !activePath.includes('?tab=');
  };

  const navLinks = getNavLinks(user?.role);

  // Dashboard view toggle (Planning / Map / Risk) lives in the global header
  // so the same ribbon is visible from any of the three views.
  const { view, setView, subTab, setSubTab } = useDashboardView();
  const onDashboard = location.pathname.replace(/\/$/, '') === '/dashboard';
  // Sub-tabs only meaningful on Planning and Risk (not Map)
  const showSubTabs = onDashboard && (view === 'forecast' || view === 'planning');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Navigation Header */}
      <header className="sticky top-0 z-[60] w-full border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className={`mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8 ${fullWidth ? 'max-w-full' : 'max-w-7xl'}`}>
          {/* Logo */}
          <Link to="/" className="flex items-center group">
            <img
              src="/logo.png"
              alt="Power Dime"
              className="h-8 transition-transform group-hover:scale-105"
            />
          </Link>

          {/* Centered Desktop Navigation */}
          <nav className="hidden md:flex md:gap-1 flex-1 justify-center mx-4 items-center">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 whitespace-nowrap ${isLinkActive(link.path)
                  ? 'bg-slate-100 text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
              >
                {link.label}
              </Link>
            ))}
            {/* Dashboard view toggle — only on /dashboard */}
            {onDashboard ? (
              <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
                {DASHBOARD_VIEWS.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setView(v.id)}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      view === v.id
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            ) : (
              /* Off-dashboard pages (Projects / Transactions / Documents) get a
                 visible Dashboard link in the same slot to return home. */
              <Link
                to="/dashboard"
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                <span aria-hidden>←</span>
                Dashboard
              </Link>
            )}
          </nav>

          {/* User Profile */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {/* User Profile Dropdown */}
            <Menu as="div" className="relative ml-3 hidden md:block">
              {({ open }) => (
                <>
                  <div>
                    <Menu.Button
                      className={`flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-sm shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 ${open ? 'border-slate-300' : 'border-transparent hover:border-slate-200'
                        }`}
                    >
                      <span className="sr-only">Open user menu</span>
                      <div className="hidden lg:flex flex-col items-end mr-1 max-w-[160px]">
                        <span className="w-full truncate text-right text-sm font-medium text-slate-700">{user?.company_name || user?.email}</span>
                        <span className="text-xs capitalize text-slate-500">{user?.role} Account</span>
                      </div>
                      <UserCircleIcon className="h-8 w-8 flex-shrink-0 text-slate-400" aria-hidden="true" />
                    </Menu.Button>
                  </div>
                  <Transition
                    as={Fragment}
                    enter="transition ease-out duration-100"
                    enterFrom="transform opacity-0 scale-95"
                    enterTo="transform opacity-100 scale-100"
                    leave="transition ease-in duration-75"
                    leaveFrom="transform opacity-100 scale-100"
                    leaveTo="transform opacity-0 scale-95"
                  >
                    <Menu.Items className="absolute right-0 z-20 mt-2 w-56 origin-top-right rounded-lg border border-slate-200 bg-white p-1 shadow-lg focus:outline-none">
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            type="button"
                            onClick={handleSignOut}
                            className={`block w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${active ? 'bg-slate-50 text-slate-900' : 'text-slate-700'
                              }`}
                          >
                            Sign out
                          </button>
                        )}
                      </Menu.Item>
                    </Menu.Items>
                  </Transition>
                </>
              )}
            </Menu>

            {/* Mobile menu button */}
            <div className="flex md:hidden">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-slate-700"
              >
                <span className="sr-only">Open main menu</span>
                <Bars3Icon className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
        {/* Sub-tab row — Capacity / Energy / RECs, shown only on Planning & Risk views */}
        {showSubTabs && (
          <div className="border-t border-slate-100 bg-slate-50/60">
            <div className={`mx-auto flex h-10 items-center gap-3 px-4 sm:px-6 lg:px-8 ${fullWidth ? 'max-w-full' : 'max-w-7xl'}`}>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest flex-shrink-0">
                Topic
              </span>
              <div className="flex items-center gap-1 text-xs">
                {DASHBOARD_SUBTABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSubTab(t.id)}
                    className={`px-3 py-1 rounded-md font-medium transition-colors ${
                      subTab === t.id
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Scope bar — site checkboxes + date range, synced across all pages */}
        <ScopeBar fullWidth={fullWidth} />
      </header>

      {/* Mobile Navigation Drawer */}
      <MobileNav
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        navLinks={navLinks}
        userRole={user?.role}
        onSignOut={handleSignOut}
      />

      {/* Main Content */}
      <main className={`relative mx-auto flex w-full flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 ${fullWidth ? 'max-w-full' : 'max-w-7xl'}`}>
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-slate-500">
            &copy; {new Date().getFullYear()} Power Dime. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
