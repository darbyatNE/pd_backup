import type { SummaryStats } from './types';

interface TryOnSummaryCardsProps {
  stats: SummaryStats;
}

export function TryOnSummaryCards({ stats }: TryOnSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-slate-50 rounded-md p-3 text-center">
        <p className="text-[9px] font-medium text-slate-500 uppercase tracking-wide mb-1">Pre Try-On — % of Load Hedged</p>
        <div className="flex items-center justify-center gap-4">
          <div>
            <p className="text-2xl font-bold text-teal-600 leading-none">{stats.preBase}%</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Baseload</p>
          </div>
          <div className="w-px h-8 bg-slate-200" />
          <div>
            <p className="text-2xl font-bold text-teal-600 leading-none">{stats.prePeak}%</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Peak</p>
          </div>
        </div>
      </div>
      <div className="bg-slate-50 rounded-md p-3 text-center">
        <p className="text-[9px] font-medium text-slate-500 uppercase tracking-wide mb-1">Post Try-On — % of Load Hedged</p>
        <div className="flex items-center justify-center gap-4">
          <div>
            <p className="text-2xl font-bold text-indigo-600 leading-none">{stats.postBase}%</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Baseload</p>
          </div>
          <div className="w-px h-8 bg-slate-200" />
          <div>
            <p className="text-2xl font-bold text-indigo-600 leading-none">{stats.postPeak}%</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Peak</p>
          </div>
        </div>
      </div>
    </div>
  );
}
