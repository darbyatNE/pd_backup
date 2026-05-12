// Per-site mapping of utility-tariff documents. Stored in localStorage as a
// placeholder until the contracting module persists this server-side.

const KEY = 'pd:tariff-contracts:v1';

export interface TariffLink {
  docId: string;
  docName: string;
  linkedAt: string; // ISO timestamp
}

type TariffLinkMap = Record<string, TariffLink>;

function read(): TariffLinkMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TariffLinkMap) : {};
  } catch {
    return {};
  }
}

function write(map: TariffLinkMap): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore quota/serialization errors */
  }
}

export function getTariffLink(siteKey: string): TariffLink | null {
  return read()[siteKey] ?? null;
}

export function setTariffLink(siteKey: string, link: Omit<TariffLink, 'linkedAt'>): void {
  const map = read();
  map[siteKey] = { ...link, linkedAt: new Date().toISOString() };
  write(map);
}

export function clearTariffLink(siteKey: string): void {
  const map = read();
  delete map[siteKey];
  write(map);
}
