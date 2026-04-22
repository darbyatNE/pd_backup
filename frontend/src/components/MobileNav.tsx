import { Dialog, DialogPanel, DialogBackdrop } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useNavigate, useLocation } from 'react-router-dom';

interface NavLink {
    path: string;
    label: string;
}

interface MobileNavProps {
    isOpen: boolean;
    onClose: () => void;
    navLinks: NavLink[];
    userRole?: string;
    onSignOut: () => void;
}

export default function MobileNav({
    isOpen,
    onClose,
    navLinks,
    userRole,
    onSignOut,
}: MobileNavProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const activePath = (location.pathname.replace(/\/$/, '') || '/dashboard') + location.search;

    const isLinkActive = (linkPath: string) => {
        if (linkPath.includes('?')) {
            return activePath === linkPath;
        }
        const pathWithoutQuery = activePath.split('?')[0];
        return pathWithoutQuery === linkPath && !activePath.includes('?tab=');
    };

    const handleNavigation = (path: string) => {
        navigate(path);
        onClose();
    };

    return (
        <Dialog open={isOpen} onClose={onClose} className="relative z-50 lg:hidden">
            <DialogBackdrop
                transition
                className="fixed inset-0 bg-slate-900/80 transition-opacity duration-300 ease-linear data-[closed]:opacity-0"
            />

            <div className="fixed inset-0 flex">
                <DialogPanel
                    transition
                    className="relative mr-16 flex w-full max-w-xs flex-1 flex-col bg-white pb-4 pt-5 shadow-xl transition duration-300 ease-in-out data-[closed]:-translate-x-full"
                >
                    <div className="absolute right-0 top-0 -mr-12 pt-2">
                        <button
                            type="button"
                            className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                            onClick={onClose}
                        >
                            <span className="sr-only">Close sidebar</span>
                            <XMarkIcon className="h-6 w-6 text-white" aria-hidden="true" />
                        </button>
                    </div>

                    <div className="flex flex-shrink-0 items-center px-4">
                        <img 
                            src="/logo.png" 
                            alt="Power Dime" 
                            className="h-8"
                        />
                    </div>

                    <div className="mt-8 h-full overflow-y-auto px-4">
                        <nav className="flex flex-col gap-2">
                            {navLinks.map((link) => (
                                <button
                                    key={link.path}
                                    onClick={() => handleNavigation(link.path)}
                                    className={`group flex w-full items-center rounded-md px-3 py-2 text-base font-medium transition-colors ${isLinkActive(link.path)
                                            ? 'bg-slate-900 text-white'
                                            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                                        }`}
                                >
                                    {link.label}
                                </button>
                            ))}
                        </nav>
                    </div>

                    <div className="border-t border-slate-200 px-4 pt-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium uppercase text-slate-500">
                                {userRole} Account
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    onSignOut();
                                    onClose();
                                }}
                                className="text-sm font-medium text-slate-600 hover:text-slate-900"
                            >
                                Sign Out
                            </button>
                        </div>
                    </div>
                </DialogPanel>
            </div>
        </Dialog>
    );
}
