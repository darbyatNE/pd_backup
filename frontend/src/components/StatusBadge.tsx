import { useMemo } from 'react';

type StatusType = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface StatusBadgeProps {
  status: string;
  type?: StatusType;
  className?: string;
}

export default function StatusBadge({ status, type, className = '' }: StatusBadgeProps) {
  const badgeType = useMemo(() => {
    if (type) return type;
    
    const lowerStatus = status.toLowerCase();
    if (['accepted', 'active', 'completed', 'success'].includes(lowerStatus)) return 'success';
    if (['submitted', 'pending', 'processing', 'submitting'].includes(lowerStatus)) return 'warning';
    if (['rejected', 'error', 'failed', 'cancelled'].includes(lowerStatus)) return 'error';
    if (['info', 'new'].includes(lowerStatus)) return 'info';
    return 'neutral';
  }, [status, type]);

  const styles = {
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    error: 'bg-rose-100 text-rose-700',
    info: 'bg-blue-100 text-blue-700',
    neutral: 'bg-slate-100 text-slate-700',
  };

  return (
    <span
      className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-medium capitalize ${styles[badgeType]} ${className}`}
    >
      {status}
    </span>
  );
}
