// Shared capacity-settlement model + UI used by both:
//   Procurement Planning → Capacity tab  (decision view: options table)
//   Risk Report → Capacity tab           (risk view: exposure summary)

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LOAD_PROFILE_MAP, getForecastCapacityForYear, type SiteLoadProfile } from '../data/loadProfile';
import { getTariffLink, clearTariffLink, type TariffLink } from '../utils/tariffContracts';
import ModuleHandoffDialog, { type HandoffKind } from './ModuleHandoffDialog';


// ─── Tariff dialog (linked contract view OR link-prompt) ─────────────────────

function TariffDialog({
  siteKey,
  siteName,
  onClose,
  onUnlinked,
}: {
  siteKey: string;
  siteName: string;
  onClose: () => void;
  onUnlinked: () => void; // called after unlink so card can re-render
}) {
  const navigate = useNavigate();
  const link: TariffLink | null = getTariffLink(siteKey);

  const goLink = () => {
    onClose();
    navigate(`/documents?linkFor=${encodeURIComponent(siteKey)}&siteName=${encodeURIComponent(siteName)}&kind=tariff`);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-[92%] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-lg">
            📄
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Utility Tariff Filing</h3>
            <p className="text-xs text-slate-500 mt-0.5">For {siteName}</p>
          </div>
        </div>

        {link ? (
          <>
            <div className="bg-emerald-50/40 border border-emerald-100 rounded-lg px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Linked tariff filing</p>
              <p className="text-sm font-semibold text-slate-900 break-words">{link.docName}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Linked {new Date(link.linkedAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex justify-between items-center mt-4 gap-2">
              <button
                type="button"
                onClick={() => {
                  clearTariffLink(siteKey);
                  onUnlinked();
                  onClose();
                }}
                className="text-xs font-medium px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Unlink
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="text-xs font-medium px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => { onClose(); navigate('/documents'); }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800"
                >
                  Open in Documents
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-700 leading-relaxed">
              No utility tariff filing is linked to this site yet.
            </p>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Link a filing you've already uploaded to Documents, or upload one first and come back.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-medium px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={goLink}
                className="text-xs font-semibold px-3 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800"
              >
                Link tariff filing
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Site procurement metadata ───────────────────────────────────────────────

export interface SiteCapacityMeta {
  projectType: 'brownfield' | 'greenfield';
  state: string;
  // For brownfield sites currently taking utility BRA pass-through
  capacityChannel?: 'utility-bra' | 'competitive-fixed' | 'btm';
  currentDeliveryYear?: string;
  currentClearedPerMwDay?: number;
  nextAuction?: string;
}

export const SITE_CAPACITY_META: Record<string, SiteCapacityMeta> = {
  'ashburn-dc': {
    projectType: 'brownfield',
    state: 'VA',
    capacityChannel: 'utility-bra',
    currentDeliveryYear: '2026/27',
    currentClearedPerMwDay: 269.92,
    nextAuction: 'Dec 2026 (DY 2027/28)',
  },
  'manassas-industrial': {
    projectType: 'brownfield',
    state: 'VA',
    capacityChannel: 'utility-bra',
    currentDeliveryYear: '2026/27',
    currentClearedPerMwDay: 269.92,
    nextAuction: 'Dec 2026 (DY 2027/28)',
  },
  'sterling-hyperscale': {
    projectType: 'greenfield',
    state: 'VA',
  },
};

// ─── Per-site card (decision view) ───────────────────────────────────────────
//
// Behind-the-meter options (BESS / Mini-NG) and the retired Utility Queue /
// Competitive Supplier paths used to live here as a per-site options table. BTM
// options are now a global panel (transactable against any site); the legacy
// utility paths are entered directly as New Projects with a capacity component.

export function SiteCapacityCard({
  profile,
  endYear,
}: {
  profile: SiteLoadProfile;
  endYear: number;
}) {
  const meta = SITE_CAPACITY_META[profile.siteKey] ?? { projectType: 'greenfield' as const, state: 'VA' };
  // Use unified forecast calculation (documented capacity or 5% growth from 2026)
  const forecastMw = getForecastCapacityForYear(profile, endYear);
  const isBrownfield = meta.projectType === 'brownfield';
  const [dialogKind, setDialogKind] = useState<HandoffKind | null>(null);
  const [tariffOpen, setTariffOpen] = useState(false);
  // bump on link/unlink so the dialog re-reads localStorage (cheap re-render hook)
  const [, setLinkVersion] = useState(0);

  const handoffPayload = (
    <div className="space-y-1">
      <p><span className="text-slate-500">Site:</span> <span className="font-medium">{profile.name}</span></p>
      <p><span className="text-slate-500">Forecast capacity:</span> <span className="font-medium">{forecastMw} MW</span> ({endYear})</p>
      <p><span className="text-slate-500">Zone:</span> <span className="font-medium">{profile.settlementZone}, {meta.state}</span></p>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      {dialogKind && (
        <ModuleHandoffDialog
          kind={dialogKind}
          onClose={() => setDialogKind(null)}
          payload={handoffPayload}
        />
      )}
      {tariffOpen && (
        <TariffDialog
          siteKey={profile.siteKey}
          siteName={profile.name}
          onClose={() => setTariffOpen(false)}
          onUnlinked={() => setLinkVersion((v) => v + 1)}
        />
      )}
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-base font-bold text-slate-900">{profile.name}</h3>
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider rounded-full px-2.5 py-1 ${
            isBrownfield ? 'bg-slate-100 text-slate-700' : 'bg-indigo-50 text-indigo-700'
          }`}
        >
          {meta.projectType}
        </span>
      </div>
      <p className="text-xs text-slate-500 mt-0.5 mb-4 -mt-3">
        {profile.capacityMw} MW current ·{' '}
        <span className="text-indigo-600 font-semibold">{forecastMw} MW forecast ({endYear})</span> ·{' '}
        {profile.settlementZone}, {meta.state}
      </p>

      {isBrownfield ? (
        <div className="bg-emerald-50/40 border border-emerald-100 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-emerald-600 text-base">✓</span>
            <span className="text-sm font-semibold text-slate-800">
              Currently taking utility capacity (PJM BRA pass-through)
            </span>
          </div>
          <div className="flex items-start gap-4">
            <dl className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs flex-1">
              <div>
                <dt className="text-slate-400 uppercase tracking-wide text-[10px] font-semibold">Channel</dt>
                <dd className="text-slate-800 font-medium">DOM zone · annual</dd>
              </div>
              <div>
                <dt className="text-slate-400 uppercase tracking-wide text-[10px] font-semibold">Volume</dt>
                <dd className="text-slate-800 font-medium">{profile.capacityMw} MW</dd>
              </div>
              <div>
                <dt className="text-slate-400 uppercase tracking-wide text-[10px] font-semibold">Cleared price</dt>
                <dd className="text-slate-800 font-medium">${meta.currentClearedPerMwDay?.toFixed(2)} / MW-day</dd>
              </div>
              <div>
                <dt className="text-slate-400 uppercase tracking-wide text-[10px] font-semibold">Delivery year</dt>
                <dd className="text-slate-800 font-medium">{meta.currentDeliveryYear}</dd>
              </div>
              <div>
                <dt className="text-slate-400 uppercase tracking-wide text-[10px] font-semibold">Next reset</dt>
                <dd className="text-slate-800 font-medium">{meta.nextAuction}</dd>
              </div>
            </dl>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setDialogKind('bra')}
                className="text-xs font-medium px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                View BRA history
              </button>
              <button
                type="button"
                onClick={() => setDialogKind('rfq')}
                className="text-xs font-semibold px-3 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800 whitespace-nowrap"
              >
                Solicit fixed-term RFQ
              </button>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 italic mt-2">
            Capacity prices reset annually at the BRA — exposure to clearing-price volatility.
            Consider a multi-year fixed offer from a competitive supplier to lock in.
          </p>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-amber-500 text-base">⚡</span>
            <span className="text-sm font-semibold text-slate-800">Capacity not yet settled</span>
            {forecastMw > 5 && meta.state === 'VA' && (
              <span className="text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 bg-amber-50 text-amber-700">
                Forecast &gt; 5 MW · competitive bundling eligible
              </span>
            )}
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-600 leading-relaxed">
            No capacity settlement details on file for this site. Attach the current channel, volume,
            cleared price and delivery year when the site is profiled, and they'll show here.
            <div className="mt-1.5 text-slate-500">
              To cover this site's forecast ({forecastMw} MW), use the{' '}
              <span className="font-semibold text-slate-700">Behind-the-Meter Capacity Options</span> above,
              or add a supply contract directly as a New Project with a capacity component.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Roll-up summary header ──────────────────────────────────────────────────

export function CapacityRollup({
  selectedSites,
  endYear,
}: {
  selectedSites: string[];
  endYear: number;
}) {
  const profiles = selectedSites.map((k) => LOAD_PROFILE_MAP[k]).filter(Boolean);
  const totalForecastMw = profiles.reduce(
    (s, p) => s + getForecastCapacityForYear(p, endYear),
    0,
  );
  const settledCount = profiles.filter((p) => SITE_CAPACITY_META[p.siteKey]?.projectType === 'brownfield').length;
  const openCount = profiles.length - settledCount;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-wrap items-center gap-6">
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Sites in scope</p>
        <p className="text-2xl font-extrabold text-slate-900 leading-none mt-0.5">{profiles.length}</p>
      </div>
      <span className="w-px h-10 bg-slate-100" />
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Total Forecast Capacity</p>
        <p className="text-2xl font-extrabold text-indigo-600 leading-none mt-0.5">{totalForecastMw} MW</p>
        <p className="text-xs text-slate-400">by Dec {endYear}</p>
      </div>
      <span className="w-px h-10 bg-slate-100" />
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-emerald-700 bg-emerald-50 rounded-md px-2 py-1">
          {settledCount} settled
        </span>
        <span className="text-xs font-medium text-amber-700 bg-amber-50 rounded-md px-2 py-1">
          {openCount} open
        </span>
      </div>
    </div>
  );
}
