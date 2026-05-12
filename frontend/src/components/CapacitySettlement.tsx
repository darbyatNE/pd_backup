// Shared capacity-settlement model + UI used by both:
//   Procurement Planning → Capacity tab  (decision view: options table)
//   Risk Report → Capacity tab           (risk view: exposure summary)

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LOAD_PROFILE_MAP, getSiteCapacityForYear, type SiteLoadProfile } from '../data/loadProfile';
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

// Default load-growth assumption — kept in sync with the Forecast page
export const PLANNING_GROWTH = 0.05;

// ─── Capacity option model ───────────────────────────────────────────────────

export interface CapacityOption {
  path: string;
  description: string;
  termNote: string;
  costBand: string;
  status: string;
  eligible: boolean;
  ineligibleReason?: string;
  cta: string;
}

export function buildCapacityOptions(forecastMw: number, state: string): CapacityOption[] {
  const competitiveEligible = state === 'VA' && forecastMw > 5;
  return [
    {
      path: 'Utility Queue (DOM via PJM BRA)',
      description: 'Pass-through of PJM Base Residual Auction clear at the DOM zone — re-priced annually',
      termNote: 'Annual — exposed to BRA volatility',
      costBand: '$220–290 / MW-day (DY 2026/27 cleared $269.92)',
      status: 'Default path',
      eligible: true,
      cta: 'View document',
    },
    {
      path: 'Competitive Supplier · multi-year fixed',
      description: 'Retail supplier locks the BRA pass-through at a fixed $/MW-day for a 1, 3, or 5-yr term',
      termNote: '1 / 3 / 5-yr fixed — supplier absorbs auction risk',
      costBand: '$235–275 / MW-day (3-yr) · $245–290 (5-yr)',
      status: competitiveEligible ? '4 suppliers in DOM' : '—',
      eligible: competitiveEligible,
      ineligibleReason: state !== 'VA'
        ? 'Only available for VA sites'
        : 'Forecast must exceed 5 MW (VA threshold)',
      cta: 'Solicit RFQ',
    },
    {
      path: 'BTM BESS (4-hr)',
      description: 'Battery system sited at the load — clears capacity through PJM as a self-supply resource',
      termNote: '~15-yr asset life · capex amortized',
      costBand: '$1.2M–1.5M / MW capex · ~$30/kW-yr O&M',
      status: '3 installers in region',
      eligible: true,
      cta: 'Solicit RFQ',
    },
    {
      path: 'BTM Mini-NG (5–25 MW)',
      description: 'Behind-the-meter NG peaker — capacity self-supply + occasional energy dispatch',
      termNote: '~20-yr asset life',
      costBand: '$0.8M–1.1M / MW capex · 8–12 MMBtu/MWh heat rate',
      status: '2 installers in region',
      eligible: true,
      cta: 'Solicit RFQ',
    },
  ];
}

// ─── Per-site card (decision view) ───────────────────────────────────────────

export function SiteCapacityCard({
  profile,
  endYear,
}: {
  profile: SiteLoadProfile;
  endYear: number;
}) {
  const meta = SITE_CAPACITY_META[profile.siteKey] ?? { projectType: 'greenfield' as const, state: 'VA' };
  const yearsOfGrowth = Math.max(0, endYear - 2026);
  // Prefer the documented capacity for end-of-scope year; fall back to default growth ramp.
  const documented = profile.capacityByYear && Object.keys(profile.capacityByYear).length > 0;
  const forecastMw = documented
    ? getSiteCapacityForYear(profile, endYear)
    : Math.round(profile.capacityMw * Math.pow(1 + PLANNING_GROWTH, yearsOfGrowth));
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
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide text-[10px]">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Path</th>
                  <th className="text-left px-3 py-2 font-semibold">Term</th>
                  <th className="text-left px-3 py-2 font-semibold">Cost band</th>
                  <th className="text-left px-3 py-2 font-semibold">Availability</th>
                  <th className="text-right px-3 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {buildCapacityOptions(forecastMw, meta.state).map((opt) => (
                  <tr key={opt.path} className={opt.eligible ? '' : 'opacity-50'}>
                    <td className="px-3 py-3 align-top">
                      <p className="font-semibold text-slate-800">{opt.path}</p>
                      <p className="text-slate-500 text-[11px] leading-snug">{opt.description}</p>
                    </td>
                    <td className="px-3 py-3 align-top text-slate-700 whitespace-nowrap">{opt.termNote}</td>
                    <td className="px-3 py-3 align-top text-slate-700">{opt.costBand}</td>
                    <td className="px-3 py-3 align-top text-slate-500">
                      {opt.eligible ? opt.status : (
                        <span className="italic">Ineligible — {opt.ineligibleReason}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top text-right">
                      <button
                        type="button"
                        disabled={!opt.eligible}
                        onClick={() => {
                          if (!opt.eligible) return;
                          if (opt.cta === 'Solicit RFQ') setDialogKind('rfq');
                          else if (opt.cta === 'View document') setTariffOpen(true);
                        }}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                          opt.eligible
                            ? 'bg-slate-900 text-white hover:bg-slate-800'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        {opt.cta}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  const yearsOfGrowth = Math.max(0, endYear - 2026);
  const profiles = selectedSites.map((k) => LOAD_PROFILE_MAP[k]).filter(Boolean);
  const totalForecastMw = profiles.reduce(
    (s, p) => s + Math.round(p.capacityMw * Math.pow(1 + PLANNING_GROWTH, yearsOfGrowth)),
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
