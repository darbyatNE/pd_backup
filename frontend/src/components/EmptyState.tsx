import type { ComponentType, SVGProps } from 'react';
import { useNavigate } from 'react-router-dom';

interface EmptyStateProps {
    title: string;
    description: string;
    icon?: ComponentType<SVGProps<SVGSVGElement>>;
    actionLabel?: string;
    actionPath?: string;
    onAction?: () => void;
}

export default function EmptyState({
    title,
    description,
    icon: Icon,
    actionLabel,
    actionPath,
    onAction,
}: EmptyStateProps) {
    const navigate = useNavigate();

    const handleAction = () => {
        if (onAction) {
            onAction();
        } else if (actionPath) {
            navigate(actionPath);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center sm:p-12">
            {Icon && (
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 mb-4">
                    <Icon className="h-6 w-6 text-slate-400" aria-hidden="true" />
                </div>
            )}
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm text-slate-500 max-w-sm">{description}</p>
            {actionLabel && (
                <div className="mt-6">
                    <button
                        type="button"
                        onClick={handleAction}
                        className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
                    >
                        {actionLabel}
                    </button>
                </div>
            )}
        </div>
    );
}
