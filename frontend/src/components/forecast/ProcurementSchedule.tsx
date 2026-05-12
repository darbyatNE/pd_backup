const schedule = [
  { time: 'Today 08:00', action: 'Day-ahead bid (off-peak)', mw: 42.0, total: 62.0 },
  { time: 'Tmmr 09:00', action: 'Solar PPA delivery begins', mw: 18.5, total: 73.5 },
  { time: 'Tmmr 10:00', action: 'Peak Saving', mw: 35.0, total: 103.0 },
  { time: 'Tmmr 11:00', action: 'Spot hedge', mw: 22.0, total: 97.0 },
  { time: 'Tmmr 12:00', action: 'Base RES', mw: 45.0, total: 125.0 },
  { time: 'Tmmr 13:00', action: 'Contract', mw: 30.0, total: 110.0 },
  { time: 'Tmmr 14:00', action: 'Spot', mw: 15.0, total: 95.0 },
  { time: 'Tmmr 15:00', action: 'Base RES', mw: 38.0, total: 88.0 },
]

const actionColors: Record<string, string> = { 'Base RES': '#3b82f6', Spot: '#f59e0b', Contract: '#22c55e' }

export function ProcurementSchedule() {
  return (
    <div className="flex flex-col h-full font-inter">
      <h2 className="text-xl font-black text-slate-900 mb-6">Procurement Schedule</h2>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left py-3 px-4 font-black uppercase tracking-widest text-slate-400">Time</th>
              <th className="text-left py-3 px-4 font-black uppercase tracking-widest text-slate-400">Action</th>
              <th className="text-right py-3 px-4 font-black uppercase tracking-widest text-slate-400">Total MW</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((row, i) => (
              <tr key={i} className="border-b last:border-0 border-slate-100 hover:bg-slate-50/50">
                <td className="py-3 px-4 font-bold text-slate-500">{row.time}</td>
                <td className="py-3 px-4">
                  <span
                    className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm border"
                    style={{ background: `${actionColors[row.action] ?? '#64748b'}15`, color: actionColors[row.action] ?? '#64748b', borderColor: `${actionColors[row.action] ?? '#64748b'}30` }}
                  >
                    {row.action}
                  </span>
                </td>
                <td className="py-3 px-4 text-right font-black text-slate-900 bg-slate-50/30">{row.total.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
