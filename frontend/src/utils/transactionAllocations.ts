// Per-transaction allocation: which buyer sites the contract covers, and at
// what percentage split. Persisted in localStorage as a placeholder until the
// contracting / settlement module owns this server-side.
//
// Shape: { [txnId]: { [siteKey]: percent } }   percent values sum to ~100.

const KEY = 'pd:txn-allocations:v1';

export type AllocationMap = Record<string, number>; // siteKey → percent

type Store = Record<string, AllocationMap>;

function read(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function getAllocation(txnId: string): AllocationMap | null {
  return read()[txnId] ?? null;
}

export function setAllocation(txnId: string, allocation: AllocationMap): void {
  const store = read();
  store[txnId] = allocation;
  write(store);
}

export function clearAllocation(txnId: string): void {
  const store = read();
  delete store[txnId];
  write(store);
}

/** Default allocation: 100% to the first selected site (or first available). */
export function defaultAllocation(siteKeys: string[]): AllocationMap {
  if (siteKeys.length === 0) return {};
  return { [siteKeys[0]]: 100 };
}

/** Normalize so percentages sum to 100. */
export function normalize(allocation: AllocationMap): AllocationMap {
  const sum = Object.values(allocation).reduce((s, v) => s + v, 0);
  if (sum === 0) return allocation;
  const out: AllocationMap = {};
  for (const [k, v] of Object.entries(allocation)) {
    out[k] = Math.round((v / sum) * 1000) / 10; // one decimal
  }
  return out;
}
