import { useState } from 'react';
import FacilityProfile from './profile/facilityProfile';
import LoadForcast from './profile/loadForecast';

type ProfileTab = 'facility' | 'load-forecast';

const TABS: { id: ProfileTab; label: string }[] = [
  { id: 'facility', label: 'Facility Profile' },
  { id: 'load-forecast', label: 'Load Forecast' },
];

export default function Profile() {
  const [activeTab, setActiveTab] = useState<ProfileTab>('facility');
  const [focusFacilityId, setFocusFacilityId] = useState<string | null>(null);

  const handleFacilitySaved = (facilityId: string) => {
    setFocusFacilityId(facilityId);
    setActiveTab('load-forecast');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="border-b border-slate-200 mb-6">
        <nav className="-mb-px flex gap-6" aria-label="Profile sections">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap border-b-2 px-1 pb-3 pt-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === 'facility' && (
        <FacilityProfile onSaved={handleFacilitySaved} initialFacilityId={focusFacilityId} />
      )}
      {activeTab === 'load-forecast' && (
        <LoadForcast initialFacilityId={focusFacilityId} onFacilityChange={setFocusFacilityId} />
      )}
    </div>
  );
}
