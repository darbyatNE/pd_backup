
interface SkeletonProps {
    className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
    return (
        <div className={`animate-pulse bg-slate-200 rounded ${className}`} />
    );
}

export function SkeletonCard() {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <div className="mt-6 grid grid-cols-3 gap-4">
                <div className="space-y-2">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-5 w-16" />
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-5 w-16" />
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-5 w-16" />
                </div>
            </div>
            <div className="mt-6 pt-6 border-t border-slate-100 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="space-y-1">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-3 w-16" />
                    </div>
                </div>
                <Skeleton className="h-9 w-24 rounded-lg" />
            </div>
        </div>
    );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
    return (
        <div className="overflow-hidden bg-white border border-slate-200 shadow-sm rounded-xl">
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
                <div className="flex gap-4">
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-4 w-1/6" />
                    <Skeleton className="h-4 w-1/6" />
                    <Skeleton className="h-4 w-1/6" />
                    <Skeleton className="h-4 w-1/6" />
                </div>
            </div>
            <div className="divide-y divide-slate-200">
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="px-6 py-4 flex gap-4 items-center">
                        <div className="w-1/4 flex items-center gap-3">
                            <Skeleton className="h-5 w-5" />
                            <Skeleton className="h-4 w-3/4" />
                        </div>
                        <Skeleton className="h-6 w-1/6 rounded-full" />
                        <Skeleton className="h-4 w-1/6" />
                        <Skeleton className="h-4 w-1/6" />
                        <div className="w-1/6 flex justify-end gap-2">
                            <Skeleton className="h-5 w-5" />
                            <Skeleton className="h-5 w-5" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function SkeletonDashboard() {
    return (
        <div className="space-y-8">
            <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex-1 space-y-4">
                        <Skeleton className="h-6 w-24 rounded-md" />
                        <Skeleton className="h-8 w-3/4 sm:w-1/2" />
                        <Skeleton className="h-6 w-full max-w-2xl" />
                    </div>
                    <div className="border border-slate-200 bg-slate-50 rounded-xl p-5 lg:min-w-[300px] space-y-4">
                        <div className="flex justify-between">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-4 w-24" />
                        </div>
                        <div className="flex justify-between">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-4 w-20" />
                        </div>
                        <div className="flex justify-between">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-4 w-32" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <Skeleton className="h-7 w-48" />
                <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="rounded-xl border border-slate-200 bg-white p-6">
                            <Skeleton className="h-12 w-12 rounded-xl mb-5" />
                            <Skeleton className="h-6 w-32 mb-2" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-3/4 mt-1" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function SkeletonMetrics() {
    return (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
                    <Skeleton className="h-3 w-12 mb-2" />
                    <Skeleton className="h-6 w-16" />
                </div>
            ))}
        </div>
    );
}

export function SkeletonFilters({ variant = 'card' }: { variant?: 'card' | 'plain' }) {
    const content = (
        <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
                <Skeleton className="h-9 w-16 rounded-lg" />
                <Skeleton className="h-9 w-16 rounded-lg" />
                <Skeleton className="h-9 w-16 rounded-lg" />
            </div>
            <div className="w-full sm:w-64">
                <Skeleton className="h-9 w-full rounded-lg" />
            </div>
        </div>
    );

    if (variant === 'plain') {
        return content;
    }

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
            {content}
        </div>
    );
}

export function SkeletonTransactionCard() {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex flex-col gap-5 sm:gap-6 lg:flex-row">
                <div className="flex-1 space-y-4 sm:space-y-5 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-2">
                            <Skeleton className="h-6 w-48" />
                            <Skeleton className="h-4 w-32" />
                        </div>
                        <Skeleton className="h-6 w-24 rounded-full" />
                    </div>

                    <div className="grid gap-4 sm:gap-5 grid-cols-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="space-y-2">
                                <Skeleton className="h-3 w-16" />
                                <Skeleton className="h-6 w-24" />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="w-full lg:w-72 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5 flex-shrink-0 space-y-3">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-3 w-32" />
                    <div className="pt-2">
                        <Skeleton className="h-10 w-full rounded-lg" />
                    </div>
                </div>
            </div>
        </div>
    );
}

export function SkeletonMarketplaceTable({ rows = 5 }: { rows?: number }) {
    return (
        <div className="overflow-hidden bg-white border border-slate-200 shadow-sm rounded-xl">
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
                <div className="flex gap-4">
                    <Skeleton className="h-4 w-1/6" />
                    <Skeleton className="h-4 w-1/6" />
                    <Skeleton className="h-4 w-1/6" />
                    <Skeleton className="h-4 w-1/6" />
                    <Skeleton className="h-4 w-1/6" />
                    <Skeleton className="h-4 w-12 ml-auto" />
                </div>
            </div>
            <div className="divide-y divide-slate-200">
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="px-6 py-4 flex gap-4 items-center">
                        <div className="w-1/6">
                            <Skeleton className="h-5 w-32" />
                        </div>
                        <div className="w-1/6">
                            <Skeleton className="h-6 w-20 rounded-full" />
                        </div>
                        <div className="w-1/6">
                            <Skeleton className="h-5 w-24" />
                        </div>
                        <div className="w-1/6 hidden sm:block">
                            <Skeleton className="h-5 w-32" />
                        </div>
                        <div className="w-1/6 hidden md:block">
                            <Skeleton className="h-5 w-40" />
                        </div>
                        <div className="flex-1 flex justify-end">
                            <Skeleton className="h-9 w-16 rounded-lg" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function SkeletonDocumentsTable({ rows = 5 }: { rows?: number }) {
    return (
        <div className="overflow-hidden bg-white border border-slate-200 shadow-sm rounded-xl">
            <table className="min-w-full divide-y divide-slate-300">
                <thead className="bg-slate-50">
                    <tr>
                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-slate-900 sm:pl-6">
                            <Skeleton className="h-4 w-24" />
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">
                            <Skeleton className="h-4 w-20" />
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">
                            <Skeleton className="h-4 w-16" />
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">
                            <Skeleton className="h-4 w-16" />
                        </th>
                        <th scope="col" className="py-3.5 pl-3 pr-4 text-right text-sm font-semibold text-slate-900 sm:pr-6 w-[130px]">
                            <Skeleton className="ml-auto h-4 w-16" />
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                    {Array.from({ length: rows }).map((_, i) => (
                        <tr key={i}>
                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-slate-900 sm:pl-6">
                                <div className="flex items-center gap-3">
                                    <Skeleton className="h-5 w-5" />
                                    <Skeleton className="h-4 w-48" />
                                </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">
                                <Skeleton className="h-6 w-24 rounded-md" />
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">
                                <Skeleton className="h-4 w-24" />
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">
                                <Skeleton className="h-4 w-24" />
                            </td>
                            <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                <div className="flex justify-end gap-2">
                                    <Skeleton className="h-9 w-9 rounded-md" />
                                    <Skeleton className="h-9 w-9 rounded-md" />
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
