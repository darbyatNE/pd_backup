import { createContext, useContext, useState, type ReactNode } from 'react';

export interface ScopeState {
  selectedSites: string[];         // site keys currently checked
  startYear: number;
  startMonth: number;              // 1–12
  endYear: number;
  endMonth: number;                // 1–12
}

interface ScopeContextValue extends ScopeState {
  toggleSite: (key: string) => void;
  setStartDate: (year: number, month: number) => void;
  setEndDate: (year: number, month: number) => void;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

const ALL_SITE_KEYS = ['ashburn-dc', 'manassas-industrial', 'sterling-hyperscale'];

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [selectedSites, setSelectedSites] = useState<string[]>(ALL_SITE_KEYS);
  const [startYear,  setStartYear]  = useState(2026);
  const [startMonth, setStartMonth] = useState(1);
  const [endYear,    setEndYear]    = useState(2028);
  const [endMonth,   setEndMonth]   = useState(12);

  const toggleSite = (key: string) => {
    setSelectedSites((prev) => {
      if (prev.includes(key)) {
        return prev.length > 1 ? prev.filter((k) => k !== key) : prev;
      }
      return [...prev, key];
    });
  };

  const setStartDate = (year: number, month: number) => {
    setStartYear(year);
    setStartMonth(month);
    // clamp end to stay >= start
    if (year > endYear || (year === endYear && month > endMonth)) {
      setEndYear(year);
      setEndMonth(month);
    }
  };

  const setEndDate = (year: number, month: number) => {
    setEndYear(year);
    setEndMonth(month);
    // clamp start to stay <= end
    if (year < startYear || (year === startYear && month < startMonth)) {
      setStartYear(year);
      setStartMonth(month);
    }
  };

  return (
    <ScopeContext.Provider value={{
      selectedSites, startYear, startMonth, endYear, endMonth,
      toggleSite, setStartDate, setEndDate,
    }}>
      {children}
    </ScopeContext.Provider>
  );
}

export function useScopeContext(): ScopeContextValue {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error('useScopeContext must be used inside <ScopeProvider>');
  return ctx;
}
