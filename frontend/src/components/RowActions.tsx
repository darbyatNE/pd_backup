import type { ElementType, MouseEvent, ReactNode } from 'react';

export type RowActionTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

interface RowActionButtonProps {
  label: string;
  icon: ElementType;
  tone: RowActionTone;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  ariaLabel?: string;
  iconOnly?: boolean;
  title?: string;
  disabled?: boolean;
}

interface RowActionGroupProps {
  children: ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<RowActionTone, string> = {
  neutral:
    'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-slate-400',
  primary:
    'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 focus-visible:ring-indigo-400',
  success:
    'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 focus-visible:ring-emerald-400',
  warning:
    'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 focus-visible:ring-amber-400',
  danger: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 focus-visible:ring-red-400',
};

export function RowActionButton({
  label,
  icon: Icon,
  tone,
  onClick,
  ariaLabel,
  iconOnly = false,
  title,
  disabled = false,
}: RowActionButtonProps) {
  const baseClasses =
    'inline-flex h-9 items-center justify-center rounded-md border text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50';
  const layoutClasses = iconOnly ? 'w-9 px-0' : 'gap-1.5 px-2.5';
  const toneClasses = TONE_CLASSES[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClasses} ${layoutClasses} ${toneClasses}`}
      aria-label={ariaLabel ?? label}
      title={title ?? label}
      disabled={disabled}
    >
      <Icon className="h-4 w-4" />
      {iconOnly ? <span className="sr-only">{label}</span> : label}
    </button>
  );
}

export function RowActionGroup({ children, className }: RowActionGroupProps) {
  const baseClasses = 'inline-flex items-center justify-end gap-2 whitespace-nowrap';
  return <div className={className ? `${baseClasses} ${className}` : baseClasses}>{children}</div>;
}
