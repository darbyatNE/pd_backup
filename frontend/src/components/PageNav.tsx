import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RiskAlerts } from './forecast'

// Cross-page links shown top-right on the Plan / Risk dashboards. "Contracts"
// is the unified contracts view (formerly "Transactions"). "Alerts" opens the
// risk-alerts popup rather than navigating.
const LINKS = [
  { label: 'Marketplace', path: '/projects' },
  { label: 'Contracts',   path: '/transactions' },
  { label: 'Documents',   path: '/documents' },
]

export default function PageNav() {
  const navigate = useNavigate()
  const [alertsOpen, setAlertsOpen] = useState(false)

  return (
    <>
      <nav className="flex items-center gap-1">
        {LINKS.map((link) => (
          <button
            key={link.path}
            onClick={() => navigate(link.path)}
            className="px-3 py-1.5 rounded-md text-sm font-medium text-slate-500 hover:text-teal-600 hover:bg-slate-50 transition-colors"
          >
            {link.label}
          </button>
        ))}
        <button
          onClick={() => setAlertsOpen(true)}
          className="px-3 py-1.5 rounded-md text-sm font-medium text-slate-500 hover:text-teal-600 hover:bg-slate-50 transition-colors"
        >
          Alerts
        </button>
      </nav>

      {alertsOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/40 backdrop-blur-sm p-4 sm:pt-16 overflow-y-auto"
          onClick={() => setAlertsOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end -mt-2 -mr-2 mb-1">
              <button
                onClick={() => setAlertsOpen(false)}
                aria-label="Close alerts"
                className="rounded-md px-2 py-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-lg leading-none"
              >
                ×
              </button>
            </div>
            <RiskAlerts />
          </div>
        </div>
      )}
    </>
  )
}
