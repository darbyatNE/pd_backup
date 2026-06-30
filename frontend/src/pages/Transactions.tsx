import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { API_BASE_URL } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { Transaction, TransactionStatus } from '../types/index';
import StatusBadge from '../components/StatusBadge';
import ContractsLedger from '../components/ContractsLedger';
import EmptyState from '../components/EmptyState';
import { DocumentCheckIcon } from '../components/Icons';
import {
  SkeletonMetrics,
  SkeletonFilters,
  SkeletonTransactionCard
} from '../components/Skeleton';
import { LOAD_PROFILES } from '../data/loadProfile';
import {
  getAllocation,
  setAllocation,
  defaultAllocation,
  normalize,
  type AllocationMap,
} from '../utils/transactionAllocations';

const SITE_LABEL: Record<string, string> = Object.fromEntries(
  LOAD_PROFILES.map((p) => [p.siteKey, p.name]),
);

// ─── Per-transaction allocation panel + edit dialog ─────────────────────────

function AllocationPanel({
  txnId,
  energyMwh,
  onEdit,
  refreshKey,
}: {
  txnId: string;
  energyMwh: number;
  onEdit: () => void;
  refreshKey: number;
}) {
  // refreshKey just forces a re-read after the editor saves
  const allocation = useMemo<AllocationMap>(() => {
    return getAllocation(txnId)
      ?? defaultAllocation(LOAD_PROFILES.map((p) => p.siteKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txnId, refreshKey]);

  const entries = Object.entries(allocation).filter(([, pct]) => pct > 0);
  const isSplit = entries.length > 1;

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          Allocated to {isSplit ? `(${entries.length} sites · split)` : ''}
        </p>
        <button
          type="button"
          onClick={onEdit}
          className="text-[11px] font-medium text-teal-700 hover:text-teal-900"
        >
          {isSplit ? 'Edit split' : 'Split…'}
        </button>
      </div>
      <ul className="space-y-1">
        {entries.map(([siteKey, pct]) => {
          const mw = Math.round((energyMwh * pct) / 100);
          return (
            <li key={siteKey} className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-slate-800 truncate">
                {SITE_LABEL[siteKey] ?? siteKey}
              </span>
              <span className="flex-shrink-0 text-slate-500">
                {pct.toFixed(1)}% · <span className="text-slate-700 font-semibold">{mw.toLocaleString()} MWh</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AllocationEditor({
  txnId,
  projectName,
  energyMwh,
  initial,
  onClose,
  onSaved,
}: {
  txnId: string;
  projectName: string;
  energyMwh: number;
  initial: AllocationMap;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Local edit state — keyed by every site, defaulting to current alloc or 0
  const [draft, setDraft] = useState<AllocationMap>(() => {
    const seed: AllocationMap = {};
    LOAD_PROFILES.forEach((p) => { seed[p.siteKey] = initial[p.siteKey] ?? 0; });
    return seed;
  });

  const total = Object.values(draft).reduce((s, v) => s + v, 0);
  const isValid = total > 0;

  const update = (siteKey: string, raw: string) => {
    const v = Math.max(0, Math.min(100, Number(raw) || 0));
    setDraft({ ...draft, [siteKey]: v });
  };

  const save = () => {
    const cleaned: AllocationMap = {};
    Object.entries(draft).forEach(([k, v]) => { if (v > 0) cleaned[k] = v; });
    const final = Math.abs(total - 100) > 0.5 ? normalize(cleaned) : cleaned;
    setAllocation(txnId, final);
    onSaved();
    onClose();
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
        <h3 className="text-base font-bold text-slate-900 mb-1">Split contract allocation</h3>
        <p className="text-xs text-slate-500 mb-4">
          {projectName} · {energyMwh.toLocaleString()} MWh · distribute across the buyer sites that this contract covers.
        </p>

        <div className="space-y-2.5">
          {LOAD_PROFILES.map((p) => {
            const pct = draft[p.siteKey] ?? 0;
            const mw = Math.round((energyMwh * pct) / 100);
            return (
              <div key={p.siteKey} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                  <p className="text-[11px] text-slate-400">{p.location} · {p.settlementZone}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={pct}
                    onChange={(e) => update(p.siteKey, e.target.value)}
                    className="w-16 rounded-md border border-slate-200 px-2 py-1 text-sm text-right outline-none focus:border-teal-400"
                  />
                  <span className="text-xs text-slate-400">%</span>
                  <span className="text-[11px] text-slate-500 w-20 text-right">
                    {mw.toLocaleString()} MWh
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className={`mt-4 rounded-md px-3 py-2 text-xs ${
          Math.abs(total - 100) < 0.5
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-amber-50 text-amber-700 border border-amber-200'
        }`}>
          Total: <strong>{total.toFixed(1)}%</strong>
          {Math.abs(total - 100) >= 0.5 && (
            <span className="ml-2">— will be normalized to 100% on save.</span>
          )}
        </div>

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
            disabled={!isValid}
            onClick={save}
            className={`text-xs font-semibold px-3 py-1.5 rounded-md ${
              isValid ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            Save split
          </button>
        </div>
      </div>
    </div>
  );
}

type StatusFilter = 'all' | TransactionStatus;
type ActionKind = 'success' | 'error';

interface ActionMessage {
  kind: ActionKind;
  text: string;
}

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString();
};

export default function Transactions() {
  const { user } = useAuth();
  const userRole = user?.role ?? 'buyer';

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editingAllocationFor, setEditingAllocationFor] = useState<Transaction | null>(null);
  const [allocationVersion, setAllocationVersion] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<ActionMessage | null>(null);

  // Refs to prevent flashing from duplicate fetches
  const hasFetchedRef = useRef(false);
  const isFetchingRef = useRef(false);
  const hasDataRef = useRef(false);

  const fetchTransactions = useCallback(async (showSkeleton = false) => {
    if (!user) return;

    // Prevent concurrent fetches
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    // Only show skeleton on first load when we have no data yet
    // This prevents flashing on StrictMode remounts and refreshes
    if (showSkeleton && !hasDataRef.current && !hasFetchedRef.current) {
      setLoading(true);
    }
    setError('');

    try {
      // The backend scopes by role (buyer/seller) and joins project/buyer/seller
      // via row_to_json, returning the same shape the Supabase query did.
      const token = localStorage.getItem('pd_access_token');
      const res = await fetch(`${API_BASE_URL}/transactions`, {
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
      });
      if (!res.ok) throw new Error('Unable to load transactions right now.');
      const { transactions } = (await res.json()) as { transactions: Transaction[] };

      setTransactions(transactions ?? []);
      hasDataRef.current = (transactions?.length ?? 0) > 0;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to load transactions right now.';
      setError(message);
    } finally {
      setLoading(false);
      hasFetchedRef.current = true;
      isFetchingRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (user && !hasFetchedRef.current) {
      fetchTransactions(true);
    }
  }, [user, fetchTransactions]);

  const metrics = useMemo(() => {
    const base: Record<TransactionStatus, number> = {
      submitted: 0,
      accepted: 0,
      rejected: 0,
    };

    for (const transaction of transactions) {
      base[transaction.status] += 1;
    }

    return {
      total: transactions.length,
      ...base,
    };
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return transactions
      .filter((transaction) => (statusFilter === 'all' ? true : transaction.status === statusFilter))
      .filter((transaction) => {
        if (!term) return true;
        const projectName = transaction.project?.name?.toLowerCase() ?? '';
        const counterpart =
          userRole === 'buyer'
            ? transaction.seller?.company_name?.toLowerCase() ?? ''
            : transaction.buyer?.company_name?.toLowerCase() ?? '';
        return projectName.includes(term) || counterpart.includes(term);
      });
  }, [transactions, statusFilter, searchTerm, userRole]);

  const handleStatusUpdate = async (transactionId: string, newStatus: Extract<TransactionStatus, 'accepted' | 'rejected'>) => {
    setUpdatingId(transactionId);
    setActionMessage(null);

    try {
      const token = localStorage.getItem('pd_access_token');
      const res = await fetch(`${API_BASE_URL}/transactions/${transactionId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Unable to update transaction status.');

      await fetchTransactions();

      setActionMessage({
        kind: 'success',
        text: `Transaction ${newStatus === 'accepted' ? 'accepted' : 'rejected'}.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to update transaction status.';
      setActionMessage({
        kind: 'error',
        text: message,
      });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl truncate">Transactions</h1>
          <p className="mt-1.5 text-sm sm:text-base text-slate-600">
            {userRole === 'buyer'
              ? 'View and manage your project interest submissions.'
              : 'Review and respond to buyer interest submissions.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchTransactions()}
          className="rounded-lg border border-slate-300 bg-white px-4 sm:px-5 py-2 sm:py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 flex-shrink-0 transition-colors"
        >
          Refresh
        </button>
      </header>

      {/* Committed contracts (Examine-Fit) + existing onboarded contracts —
          accept (→ permanent, charted) or reject (→ archive). */}
      <ContractsLedger />

      {loading ? (
        <div className="space-y-6">
          <SkeletonMetrics />
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 lg:p-6 shadow-sm">
            <SkeletonFilters variant="plain" />
            <div className="mt-5 sm:mt-6 lg:mt-8 space-y-4 sm:space-y-5">
              {[1, 2, 3].map((i) => (
                <SkeletonTransactionCard key={i} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-4 sm:p-5 text-sm sm:text-base text-rose-700 shadow-sm"
            >
              {error}
            </div>
          )}

          {actionMessage && (
            <div
              role="status"
              className={`rounded-xl border px-5 py-4 text-sm sm:text-base font-semibold shadow-sm ${actionMessage.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}
            >
              {actionMessage.text}
            </div>
          )}

          <section className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500">Total</p>
              <p className="mt-1 text-xl sm:text-2xl font-semibold text-slate-900">{metrics.total}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
              <p className="text-xs font-medium text-amber-600">In Progress</p>
              <p className="mt-1 text-xl sm:text-2xl font-semibold text-slate-900">{metrics.submitted}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
              <p className="text-xs font-medium text-emerald-600">Accepted</p>
              <p className="mt-1 text-xl sm:text-2xl font-semibold text-slate-900">{metrics.accepted}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
              <p className="text-xs font-medium text-rose-600">Rejected</p>
              <p className="mt-1 text-xl sm:text-2xl font-semibold text-slate-900">{metrics.rejected}</p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm mt-4 sm:mt-6">
            <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
                {(['all', 'submitted', 'accepted', 'rejected'] as StatusFilter[]).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setStatusFilter(filter)}
                    className={`rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium capitalize transition whitespace-nowrap ${statusFilter === filter
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                  >
                    {filter === 'submitted' ? 'In Progress' : filter}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search transactions..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 sm:px-4 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </div>

            {filteredTransactions.length === 0 ? (
              <div className="mt-4 sm:mt-6">
                <EmptyState
                  title={transactions.length === 0 ? 'No transactions yet' : 'No transactions found'}
                  description={
                    transactions.length === 0
                      ? userRole === 'buyer'
                        ? 'Submit interest on a project from the Projects page to get started.'
                        : 'Buyer submissions will appear here once they submit interest in your projects.'
                      : 'Try adjusting your filters to see more results.'
                  }
                  icon={DocumentCheckIcon}
                  actionLabel={transactions.length === 0 && userRole === 'buyer' ? 'Browse Projects' : undefined}
                  actionPath={transactions.length === 0 && userRole === 'buyer' ? '/projects' : undefined}
                />
              </div>
            ) : (
              <div className="mt-4 sm:mt-6 space-y-4">
                {filteredTransactions.map((transaction) => {
                  const counterpartName =
                    userRole === 'buyer'
                      ? transaction.seller?.company_name ?? 'Unknown seller'
                      : transaction.buyer?.company_name ?? 'Unknown buyer';

                  return (
                    <div
                      key={transaction.id}
                      className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex flex-col gap-5 sm:gap-6 lg:flex-row">
                        <div className="flex-1 space-y-4 sm:space-y-5 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <h3 className="text-lg font-semibold text-slate-900 truncate">
                                {transaction.project?.name ?? 'Untitled project'}
                              </h3>
                              <p className="mt-1 text-sm sm:text-base text-slate-600 truncate">
                                {transaction.project?.generation_type} • {transaction.project?.location}
                              </p>
                            </div>
                            <StatusBadge
                              status={transaction.status}
                              label={transaction.status === 'submitted' ? 'In Progress' : undefined}
                            />
                          </div>

                          <div className="grid gap-4 sm:gap-5 grid-cols-3">
                            <div>
                              <p className="text-xs sm:text-sm font-medium text-slate-500 uppercase tracking-wide">Energy</p>
                              <p className="mt-1.5 text-base sm:text-lg font-semibold text-slate-900 truncate">
                                {transaction.energy_amount_mwh} MWh
                              </p>
                            </div>
                            <div>
                              <p className="text-xs sm:text-sm font-medium text-slate-500 uppercase tracking-wide">Duration</p>
                              <p className="mt-1.5 text-base sm:text-lg font-semibold text-slate-900">
                                {transaction.contract_duration_years} yrs
                              </p>
                            </div>
                            <div>
                              <p className="text-xs sm:text-sm font-medium text-slate-500 uppercase tracking-wide">Start</p>
                              <p className="mt-1.5 text-base sm:text-lg font-semibold text-slate-900 truncate">
                                {formatDate(transaction.start_date)}
                              </p>
                            </div>
                          </div>

                          {transaction.generation_preference?.trim() && (
                            <div>
                              <p className="text-xs sm:text-sm font-medium text-slate-500 uppercase tracking-wide">Notes</p>
                              <p className="mt-1.5 text-sm sm:text-base text-slate-700 line-clamp-2">
                                {transaction.generation_preference}
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="w-full lg:w-72 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5 flex-shrink-0">
                          <p className="text-xs sm:text-sm font-medium text-slate-500 uppercase tracking-wide">
                            {userRole === 'buyer' ? 'Seller' : 'Buyer'}
                          </p>
                          <p className="mt-1.5 text-base font-semibold text-slate-900 truncate">{counterpartName}</p>
                          <p className="mt-3 text-xs sm:text-sm text-slate-500">
                            Created: {formatDate(transaction.created_at)}
                          </p>

                          {/* Site allocation — only meaningful for accepted contracts */}
                          {transaction.status === 'accepted' && (
                            <AllocationPanel
                              txnId={transaction.id}
                              energyMwh={transaction.energy_amount_mwh}
                              onEdit={() => setEditingAllocationFor(transaction)}
                              refreshKey={allocationVersion}
                            />
                          )}

                          {userRole === 'seller' && transaction.status === 'submitted' && (
                            <div className="mt-4 sm:mt-5 space-y-2.5">
                              <button
                                type="button"
                                onClick={() => handleStatusUpdate(transaction.id, 'accepted')}
                                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm transition-all"
                                disabled={updatingId === transaction.id}
                              >
                                {updatingId === transaction.id ? 'Updating...' : 'Accept'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStatusUpdate(transaction.id, 'rejected')}
                                className="w-full rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50 shadow-sm transition-all"
                                disabled={updatingId === transaction.id}
                              >
                                {updatingId === transaction.id ? 'Updating...' : 'Reject'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {editingAllocationFor && (
        <AllocationEditor
          txnId={editingAllocationFor.id}
          projectName={editingAllocationFor.project?.name ?? 'Untitled project'}
          energyMwh={editingAllocationFor.energy_amount_mwh}
          initial={
            getAllocation(editingAllocationFor.id)
              ?? defaultAllocation(LOAD_PROFILES.map((p) => p.siteKey))
          }
          onClose={() => setEditingAllocationFor(null)}
          onSaved={() => setAllocationVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}
