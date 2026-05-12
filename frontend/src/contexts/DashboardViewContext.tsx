import { createContext, useContext, useState, type ReactNode } from 'react';

// Internal view ids match the underlying route components; only the user-facing
// labels were renamed (Forecast → Planning, Planning → Risk).
export type DashboardView = 'forecast' | 'map' | 'planning';

export const DASHBOARD_VIEWS: { id: DashboardView; label: string }[] = [
  { id: 'forecast', label: 'Plan'     }, // procurement planning (capacity / energy / RECs)
  { id: 'map',      label: 'Map'      },
  { id: 'planning', label: 'Evaluate' }, // risk evaluation (basis / hedge / exposure)
];

// Sub-tab applies to the Planning and Risk views (Map ignores it).
// Shared so toggling between Planning ↔ Risk keeps the same topic open.
export type DashboardSubTab = 'capacity' | 'energy' | 'recs';

export const DASHBOARD_SUBTABS: { id: DashboardSubTab; label: string }[] = [
  { id: 'capacity', label: 'Capacity' },
  { id: 'energy',   label: 'Energy'   },
  { id: 'recs',     label: 'RECs'     },
];

interface DashboardViewContextValue {
  view: DashboardView;
  setView: (v: DashboardView) => void;
  subTab: DashboardSubTab;
  setSubTab: (s: DashboardSubTab) => void;
}

const DashboardViewContext = createContext<DashboardViewContextValue | null>(null);

export function DashboardViewProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<DashboardView>('forecast');
  const [subTab, setSubTab] = useState<DashboardSubTab>('energy');
  return (
    <DashboardViewContext.Provider value={{ view, setView, subTab, setSubTab }}>
      {children}
    </DashboardViewContext.Provider>
  );
}

export function useDashboardView(): DashboardViewContextValue {
  const ctx = useContext(DashboardViewContext);
  if (!ctx) throw new Error('useDashboardView must be used inside <DashboardViewProvider>');
  return ctx;
}
