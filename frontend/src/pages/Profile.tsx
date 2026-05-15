import { useState } from 'react';
import { useScopeContext } from '../contexts/ScopeContext';
import { useAuth } from '../contexts/AuthContext';

/**
 * ============================================================================
 * DEVELOPER HANDOFF: Profile Feature Integration Point
 * ============================================================================
 *
 * This component is the PROFILE tab in the main dashboard. It's integrated
 * into the navigation via DashboardViewContext.tsx (added 'profile' to
 * DASHBOARD_VIEWS) and Dashboard.tsx (renders this component).
 *
 * Available Contexts:
 * - useAuth(): { user: { name, email, role, organization, company_name } }
 * - useScopeContext(): { selectedSites, addSite, removeSite }
 *
 * Current Implementation:
 * - Basic user info display (read-only)
 * - Site management (add/remove - functional placeholder)
 *
 * YOUR INTEGRATION POINTS (marked below):
 * 1. [PROFILE_DEV_SECTION_1] - Replace basic user card with your component
 * 2. [PROFILE_DEV_SECTION_2] - Replace site management with your component
 * 3. [PROFILE_DEV_SECTION_3] - Replace blank area with your component
 *
 * File Structure Recommendation:
 * - Create folder: src/components/profile/
 * - Your components: UserProfileCard.tsx, SiteManager.tsx, etc.
 *
 * Contact: [Your Name] for questions about existing scope/auth integration
 * ============================================================================
 */

const SHORT_NAMES: Record<string, string> = {
  'ashburn-dc': 'Ashburn DC',
  'manassas-industrial': 'Manassas Ind.',
  'sterling-hyperscale': 'Sterling HC',
};

// ============================================================================
// [HANDOFF_MARKER] Main Profile Component - Integration Surface
// ============================================================================
export default function Profile() {
  const { user } = useAuth();
  const { selectedSites, addSite, removeSite } = useScopeContext();
  
  // [PROFILE_DEV_SECTION_1_START] ===========================================
  // Current: Basic user info display
  // Replace this section with your User Profile component
  // Available: user object from useAuth()
  // =========================================================================
  
  // [PROFILE_DEV_SECTION_1_END] =============================================

  // [PROFILE_DEV_SECTION_2_START] ===========================================
  // Current: Site management placeholder
  // Replace this section with your Site Management component
  // Available: selectedSites, addSite, removeSite from useScopeContext()
  // =========================================================================
  const [newSiteName, setNewSiteName] = useState('');
  const [message, setMessage] = useState('');

  const handleAddSite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiteName.trim()) return;
    
    const siteKey = newSiteName.toLowerCase().replace(/\s+/g, '-');
    addSite(siteKey);
    setMessage(`Site "${newSiteName}" added to scope.`);
    setNewSiteName('');
    setTimeout(() => setMessage(''), 3000);
  };
  // [PROFILE_DEV_SECTION_2_END] ===============================================

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      
      {/* [PROFILE_DEV_SECTION_1_UI] ======================================== */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4">User Profile</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
              Name
            </label>
            <p className="text-sm font-medium text-slate-700">{user?.name || '—'}</p>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
              Email
            </label>
            <p className="text-sm font-medium text-slate-700">{user?.email || '—'}</p>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
              Role
            </label>
            <p className="text-sm font-medium text-slate-700 capitalize">{user?.role || '—'}</p>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
              Organization
            </label>
            <p className="text-sm font-medium text-slate-700">{user?.organization || '—'}</p>
          </div>
        </div>
      </div>
      {/* [PROFILE_DEV_SECTION_1_UI_END] ==================================== */}

      {/* [PROFILE_DEV_SECTION_2_UI] ======================================== */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Site Management</h2>
        
        <form onSubmit={handleAddSite} className="flex items-center gap-3 mb-6">
          <input
            type="text"
            value={newSiteName}
            onChange={(e) => setNewSiteName(e.target.value)}
            placeholder="Enter new site name..."
            className="flex-1 max-w-xs border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-500"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
          >
            <span>+</span> Add Site
          </button>
        </form>

        {message && (
          <div className="mb-4 p-3 bg-teal-50 border border-teal-200 rounded-lg text-sm text-teal-700">
            {message}
          </div>
        )}

        <div>
          <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Sites in Scope
          </h3>
          <div className="flex flex-wrap gap-2">
            {selectedSites.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No sites selected</p>
            ) : (
              selectedSites.map((siteKey) => (
                <span
                  key={siteKey}
                  className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700"
                >
                  {SHORT_NAMES[siteKey] || siteKey}
                  <button
                    onClick={() => removeSite(siteKey)}
                    className="text-teal-600 hover:text-teal-800"
                    title="Remove site"
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
        </div>
      </div>
      {/* [PROFILE_DEV_SECTION_2_UI_END] ==================================== */}

      {/* [PROFILE_DEV_SECTION_3_START] ===================================== */}
      {/* Placeholder for additional profile components */}
      {/* Replace this with your component(s) */}
      <div className="mt-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
        <p className="text-sm text-slate-400">Developer Handoff Area - Add your components here</p>
        <p className="text-xs text-slate-300 mt-2">See comments above for integration points</p>
      </div>
      {/* [PROFILE_DEV_SECTION_3_END] ===================================== */}

    </div>
  );
}
