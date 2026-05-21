import { useMemo } from 'react';

type StatusType = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface StatusBadgeProps {
  status: string;
  /** Optional display override — renders this text instead of `status` while keeping the original
   *  value for tone/type detection. */
  label?: string;
  type?: StatusType;
  className?: string;
}

// Helper to get generation type icon SVG
function getGenerationIcon(type: string): string | null {
  switch (type) {
    case 'Wind':
      return `<svg viewBox="0 0 24 24" width="12" height="12" style="display:block;"><g transform="translate(12,12)"><circle r="1.5" fill="#0ea5e9"/><path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(45)"/><path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(135)"/><path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(225)"/><path d="M0,-1.5 Q-2,-4 -1,-8 Q0,-10 0,-12 Q0,-10 1,-8 Q2,-4 0,-1.5" fill="#0ea5e9" transform="rotate(315)"/></g></svg>`;
    case 'Nuclear':
      return `<svg viewBox="0 0 24 24" width="12" height="12" style="display:block;"><g transform="translate(12,12)"><circle r="2" fill="#8b5cf6"/><ellipse cx="0" cy="-6" rx="3" ry="1" fill="#8b5cf6" transform="rotate(0)"/><ellipse cx="0" cy="-6" rx="3" ry="1" fill="#8b5cf6" transform="rotate(60)"/><ellipse cx="0" cy="-6" rx="3" ry="1" fill="#8b5cf6" transform="rotate(120)"/></g></svg>`;
    case 'Solar':
      return `<svg viewBox="0 0 24 24" width="12" height="12" style="display:block;"><g transform="translate(12,12)"><circle r="4" fill="#f59e0b"/><g stroke="#f59e0b" stroke-width="2" stroke-linecap="round"><line x1="0" y1="-8" x2="0" y2="-6"/><line x1="5.66" y1="-5.66" x2="4.24" y2="-4.24"/><line x1="8" y1="0" x2="6" y2="0"/><line x1="5.66" y1="5.66" x2="4.24" y2="4.24"/><line x1="0" y1="8" x2="0" y2="6"/><line x1="-5.66" y1="5.66" x2="-4.24" y2="4.24"/><line x1="-8" y1="0" x2="-6" y2="0"/><line x1="-5.66" y1="-5.66" x2="-4.24" y2="-4.24"/></g></g></svg>`;
    case 'Combined Cycle':
      return `<svg viewBox="0 0 24 24" width="12" height="12" style="display:block;"><g transform="translate(12,12)"><rect x="-2" y="-8" width="4" height="12" rx="1" fill="#64748b"/><rect x="-6" y="2" width="12" height="4" rx="1" fill="#64748b"/><path d="M-2,-8 L-6,2 M2,-8 L6,2 M-2,4 L-6,2 M2,4 L6,2" stroke="#64748b" stroke-width="1" fill="none"/></g></svg>`;
    case 'Battery':
      return `<svg viewBox="0 0 24 24" width="12" height="12" style="display:block;"><g transform="translate(12,12)"><rect x="-8" y="-4" width="16" height="8" rx="1" fill="#10b981"/><rect x="8" y="-2" width="2" height="4" fill="#10b981"/><rect x="-6" y="-2" width="3" height="4" fill="white"/><rect x="-1.5" y="-2" width="3" height="4" fill="white"/><rect x="3" y="-2" width="2" height="4" fill="white"/></g></svg>`;
    case 'Hybrid':
      return `<svg viewBox="0 0 24 24" width="12" height="12" style="display:block;"><g transform="translate(12,12)"><path d="M0,-8 L3,-2 L8,-3 L2,2 L4,8 L-2,2 L-8,3 L-3,-2 Z" fill="#06b6d4"/><circle r="2" fill="white"/></g></svg>`;
    case 'Peaker':
      return `<svg viewBox="0 0 24 24" width="12" height="12" style="display:block;"><g transform="translate(12,12)"><path d="M-6,6 L0,-8 L6,6 Z" fill="#ef4444"/><rect x="-2" y="2" width="4" height="4" fill="#dc2626"/></g></svg>`;
    case 'Hydro':
      return `<svg viewBox="0 0 24 24" width="12" height="12" style="display:block;"><g transform="translate(12,12)"><path d="M-8,4 L-3,4 L-3,-2 L3,-2 L3,4 L8,4 L8,8 L-8,8 Z" fill="#06b6d4"/><path d="M-6,10 Q-3,12 0,10 Q3,12 6,10" fill="none" stroke="#06b6d4" stroke-width="1.5"/><path d="M-6,12 Q-3,14 0,12 Q3,14 6,12" fill="none" stroke="#06b6d4" stroke-width="1.5"/></g></svg>`;
    default:
      return null;
  }
}

export default function StatusBadge({ status, label, type, className = '' }: StatusBadgeProps) {
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

  // Check if this is a generation type
  const isGenerationType = ['Wind', 'Nuclear', 'Solar', 'Combined Cycle', 'Battery', 'Hybrid', 'Peaker', 'Hydro'].includes(status);
  const iconSvg = isGenerationType ? getGenerationIcon(status) : null;

  return (
    <span
      className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-medium capitalize ${styles[badgeType]} ${className}`}
    >
      {iconSvg && (
        <span 
          dangerouslySetInnerHTML={{ __html: iconSvg }}
          className="mr-1.5 flex-shrink-0"
        />
      )}
      {label ?? status}
    </span>
  );
}
