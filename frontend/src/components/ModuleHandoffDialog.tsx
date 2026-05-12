import type { ReactNode } from 'react';

// ─── Kinds ───────────────────────────────────────────────────────────────────

export type HandoffKind =
  | 'rfq'
  | 'bra'
  | 'recs'
  | 'examine-fit'
  | 'capacity-risk'
  | 'contracting';

interface HandoffCopy {
  icon: string;
  title: string;
  sub: string;
  body: string;
  eta: string;
}

const DEFAULT_COPY: Record<HandoffKind, HandoffCopy> = {
  rfq: {
    icon: '🚧',
    title: 'Contracting Module — In Progress',
    sub: 'RFQ outbound + counterparty workflow not yet wired.',
    body:
      "You'll be able to solicit and manage RFQs for capacity, energy, and BTM resources directly from this page.",
    eta: 'August 2026',
  },
  bra: {
    icon: '📈',
    title: 'Base Residual Auction Pricing — coming soon',
    sub: 'PJM BRA cleared-price history feed not yet connected.',
    body:
      'Will surface DOM-zone BRA cleared prices by delivery year (DY 2024/25 onwards) so you can see the volatility this site has been carrying year-over-year.',
    eta: 'August 2026',
  },
  recs: {
    icon: '♻️',
    title: 'REC Procurement — coming soon',
    sub: 'REC registry integration and time-matching engine not yet wired.',
    body:
      'Will derive REC volumes from each site\'s coverage target and time-matching requirement, then surface scheme options (REC, AEPS, etc.) and short / long matching strategies.',
    eta: 'September 2026',
  },
  'examine-fit': {
    icon: '🔍',
    title: 'Project Fit & Contracting — coming soon',
    sub: 'Automated fit-check + term-sheet generation not yet wired.',
    body:
      "You'll be able to run automated fit analysis against your scope, generate a term-sheet preview, and hand off to the contracting module for execution.",
    eta: 'August 2026',
  },
  'capacity-risk': {
    icon: '⚡',
    title: 'Capacity Risk Forecast — coming soon',
    sub: 'BRA-forward forecast feed not yet connected.',
    body:
      'Will model P10 / P50 / P90 capacity-cost bands by delivery year using the BRA-forward forecast feed, including the value of multi-year fixed-term lock-in.',
    eta: 'August 2026',
  },
  contracting: {
    icon: '🚧',
    title: 'Contracting Module — In Progress',
    sub: 'Counterparty workflow + execution tracking not yet wired.',
    body:
      "You'll be able to manage counterparty negotiations, execute contracts, and track obligations directly from this page.",
    eta: 'August 2026',
  },
};

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ModuleHandoffDialogProps {
  kind: HandoffKind;
  onClose: () => void;
  /** Optional React node rendered as a payload preview box (e.g. site + MW). */
  payload?: ReactNode;
  /** Override any default copy fields. */
  overrides?: Partial<HandoffCopy>;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function ModuleHandoffDialog({
  kind,
  onClose,
  payload,
  overrides,
}: ModuleHandoffDialogProps) {
  const copy = { ...DEFAULT_COPY[kind], ...overrides };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-[92%] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 text-lg">
            {copy.icon}
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">{copy.title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{copy.sub}</p>
          </div>
        </div>

        <p className="text-sm text-slate-700 leading-relaxed">{copy.body}</p>

        {/* Payload preview */}
        {payload && (
          <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1.5">
              Hand-off context
            </p>
            <div className="text-sm text-slate-800">{payload}</div>
          </div>
        )}

        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mt-3">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
            Expected completion
          </p>
          <p className="text-sm font-semibold text-slate-900">{copy.eta}</p>
        </div>

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold px-4 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
