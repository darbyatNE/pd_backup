import type { SummaryStats } from './types';

interface TryOnSummaryCardsProps {
  stats: SummaryStats;
}

export function TryOnSummaryCards({ stats }: TryOnSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="bg-slate-50 rounded-md px-3 py-2 text-center">
        <p className="text-[9px] font-medium text-slate-500 uppercase tracking-wide">Pre Try-On — % of Load Hedged</p>
        <div className="flex items-center justify-center gap-4">
          <div>
            <p className="text-xl font-bold text-teal-600 leading-none">{stats.preBase}%</p>
            <p className="text-[9px] text-slate-500">Baseload</p>
          </div>
          <div className="w-px h-6 bg-slate-200" />
          <div>
            <p className="text-xl font-bold text-teal-600 leading-none">{stats.prePeak}%</p>
            <p className="text-[9px] text-slate-500">Peak</p>
          </div>
        </div>
      </div>
      <div className="bg-slate-50 rounded-md px-3 py-2 text-center">
        <p className="text-[9px] font-medium text-slate-500 uppercase tracking-wide">Post Try-On — % of Load Hedged</p>
        <div className="flex items-center justify-center gap-4">
          <div>
            <p className="text-xl font-bold text-indigo-600 leading-none">{stats.postBase}%</p>
            <p className="text-[9px] text-slate-500">Baseload</p>
          </div>
          <div className="w-px h-6 bg-slate-200" />
          <div>
            <p className="text-xl font-bold text-indigo-600 leading-none">{stats.postPeak}%</p>
            <p className="text-[9px] text-slate-500">Peak</p>
          </div>
        </div>
      </div>
    </div>
  );
}
