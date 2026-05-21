const alerts = [
  { priority: 'High',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   text: 'Peak demand threshold exceeded — 105.3 MW at 12:00. Activate demand response protocol DR-3.' },
  { priority: 'Medium', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  text: 'Spot market price spike detected. Current rate $214/MWh exceeds 15-min average by 28%.' },
  { priority: 'Low',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   text: 'Solar generation underperforming by 8% vs forecast. Cloud cover event in grid zone B.' },
  { priority: 'Medium', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  text: 'Grid frequency deviation at 49.82 Hz. Frequency response reserve activated.' },
  { priority: 'Low',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   text: 'Procurement schedule updated. New contract slot confirmed for 14:00–16:00 window.' },
]

export function RiskAlerts() {
  return (
    <div className="flex flex-col h-full font-inter">
      <div className="flex items-center justify-between pb-5 mb-4" style={{ borderBottom: '1px solid rgba(134,133,133,0.33)' }}>
        <h2 style={{ fontWeight: 600, fontSize: '20px', color: '#000000' }} title="Monitor procurement risks and real-time alerts: Track market volatility, demand spikes, generation shortfalls, price anomalies, and operational risks that could impact your energy procurement strategy and require immediate attention or action.">
          Risk &amp; Alerts
        </h2>
        <span className="text-xs px-3 py-1 rounded-full font-black uppercase tracking-widest bg-red-50 text-red-600 border border-red-100 shadow-sm">{alerts.length} active</span>
      </div>
      <div className="flex flex-col flex-1">
        {alerts.map((alert, i) => (
          <div key={i} className="relative">
            <div className="py-6 hover:translate-x-1 transition-all" style={{ borderLeft: `4px solid ${alert.color}`, paddingLeft: '16px' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: alert.color }} />
                <span className="text-xs font-black uppercase tracking-widest" style={{ color: alert.color }}>{alert.priority}</span>
              </div>
              <p className="text-xs font-bold leading-relaxed text-slate-500">{alert.text}</p>
            </div>
            {i < alerts.length - 1 && <div className="w-full border-t border-slate-100" />}
          </div>
        ))}
      </div>
    </div>
  )
}
