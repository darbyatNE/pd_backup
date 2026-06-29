import { Fragment, useState, useEffect, useCallback } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, CloudArrowUpIcon, DocumentTextIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { API_BASE_URL, uploadBuyerDocument, uploadSellerDocument, getExampleDocuments } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { BuyerDocumentCategory, SellerType, TechnologyType, ExampleDocument } from '../types';

interface UploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUploadSuccess: () => void;
    userRole: 'buyer' | 'seller';
}

interface Instruction {
    name: string;
    description: string;
    helpText: string;
    fileTypes?: string[];
}

interface BuyerProject {
    id: string;
    name: string;
    project_type: string;
}

interface SellerProject {
    id: string;
    name: string;
    generation_type: string;
}

// Document category metadata with descriptions
const BUYER_CATEGORIES: Record<string, Instruction> = {
    historical_invoice: {
        name: 'Historical Invoices',
        description: 'Past utility bills showing electricity consumption and costs',
        fileTypes: ['PDF'],
        helpText: 'Upload your recent utility bills (last 12-24 months recommended) to help us understand your energy usage patterns and costs.',
    },
    utility_contract: {
        name: 'Utility Contracts',
        description: 'Current or past agreements with utility providers',
        fileTypes: ['PDF'],
        helpText: 'Provide your current or recent utility service agreements to help us understand your rate structure and contract terms.',
    },
    meter_reading: {
        name: 'Meter Reading Data',
        description: 'Time-series data from energy meters',
        fileTypes: ['CSV', 'TSV'],
        helpText: 'Upload interval meter data (15-min, 30-min, or hourly readings) in CSV or TSV format for detailed consumption analysis.',
    },
    grid_data: {
        name: 'Grid Consumption Data',
        description: 'Third-party verified grid offtake data for cross-verification',
        fileTypes: ['PDF', 'CSV', 'TSV'],
        helpText: 'Provide independent grid operator data to verify and cross-reference your consumption patterns.',
    },
    equipment_config: {
        name: 'Equipment Configuration',
        description: 'Documentation of current equipment setup and specifications',
        fileTypes: ['PDF'],
        helpText: 'Share documentation of your current equipment (servers, cooling systems, UPS, etc.) to help us assess your power requirements.',
    },
    equipment_spec: {
        name: 'Equipment Specifications',
        description: 'Technical specifications for planned equipment',
        fileTypes: ['PDF'],
        helpText: 'Upload optional equipment specification sheets for your greenfield project.',
    },
};

const SELLER_TECH_TYPES: Record<string, Instruction> = {
    solar: {
        name: 'Solar',
        description: 'Photovoltaic solar generation projects',
        helpText: 'Upload technical specifications, performance data, interconnection agreements, and site documentation for your solar project.',
    },
    wind: {
        name: 'Wind',
        description: 'Wind turbine generation projects',
        helpText: 'Provide turbine specifications, wind resource assessments, performance data, and interconnection documentation.',
    },
    nuclear: {
        name: 'Nuclear',
        description: 'Nuclear power generation facilities',
        helpText: 'Share facility specifications, capacity data, regulatory compliance documents, and operational reports.',
    },
    green_hydrogen: {
        name: 'Green Hydrogen',
        description: 'Green hydrogen production facilities',
        helpText: 'Upload electrolyzer specifications, hydrogen production data, renewable energy source documentation, and facility capacity information.',
    },
    battery: {
        name: 'Battery Storage',
        description: 'Energy storage systems',
        helpText: 'Upload battery system specifications, capacity details, charge/discharge profiles, and performance guarantees.',
    },
    utility_contract: {
        name: 'Utility Contract',
        description: 'Utility contract and interconnection agreements',
        helpText: 'Provide utility contracts, power purchase agreements, and interconnection documentation.',
    },
};

export default function UploadModal({
    isOpen,
    onClose,
    onUploadSuccess,
    userRole,
}: UploadModalProps) {
    const { user } = useAuth();
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Buyer State
    const [buyerCategory, setBuyerCategory] = useState<BuyerDocumentCategory>('historical_invoice');
    const [buyerProjects, setBuyerProjects] = useState<BuyerProject[]>([]);
    const [selectedBuyerProject, setSelectedBuyerProject] = useState<string>('');

    // Seller State
    const [sellerType, setSellerType] = useState<SellerType>('carbon_free');
    const [techType, setTechType] = useState<TechnologyType>('solar');
    const [contractType, setContractType] = useState('');
    const [sellerProjects, setSellerProjects] = useState<SellerProject[]>([]);
    const [selectedSellerProject, setSelectedSellerProject] = useState<string>('');

    const [exampleDoc, setExampleDoc] = useState<ExampleDocument | null>(null);

    // Fetch buyer projects
    const fetchBuyerProjects = useCallback(async () => {
        try {
            const token = localStorage.getItem('pd_access_token');
            const res = await fetch(`${API_BASE_URL}/projects/buyer/my-projects`, {
                headers: { ...(token && { Authorization: `Bearer ${token}` }) },
            });
            if (!res.ok) throw new Error('Failed to fetch buyer projects');
            const { projects } = (await res.json()) as { projects: BuyerProject[] };
            setBuyerProjects(projects || []);
        } catch (err) {
            console.error('Failed to fetch buyer projects', err);
        }
    }, [user]);

    const fetchSellerProjects = useCallback(async () => {
        try {
            const token = localStorage.getItem('pd_access_token');
            const res = await fetch(`${API_BASE_URL}/projects/my-projects`, {
                headers: { ...(token && { Authorization: `Bearer ${token}` }) },
            });
            if (!res.ok) throw new Error('Failed to fetch seller projects');
            const { projects } = (await res.json()) as { projects: SellerProject[] };
            setSellerProjects(projects || []);
        } catch (err) {
            console.error('Failed to fetch seller projects', err);
        }
    }, [user]);

    // Fetch buyer projects
    useEffect(() => {
        if (isOpen && userRole === 'buyer' && user) {
            fetchBuyerProjects();
        }
    }, [isOpen, userRole, user, fetchBuyerProjects]);

    // Fetch seller projects
    useEffect(() => {
        if (isOpen && userRole === 'seller' && user) {
            fetchSellerProjects();
        }
    }, [isOpen, userRole, user, fetchSellerProjects]);

    // Get current category metadata
    // Get current category metadata
    const getCurrentInstructions = (): Instruction | null => {
        if (userRole === 'buyer') {
            return BUYER_CATEGORIES[buyerCategory] || null;
        } else {
            if (sellerType === 'carbon_free') {
                return SELLER_TECH_TYPES[techType] || null;
            } else {
                return SELLER_TECH_TYPES['utility_contract'] || null;
            }
        }
    };

    const currentInstructions = getCurrentInstructions();

    const fetchExample = useCallback(async () => {
        try {
            let category = '';
            if (userRole === 'buyer') {
                category = buyerCategory;
            } else {
                category = sellerType === 'carbon_free' ? techType : 'utility_contract_seller';
            }

            if (category) {
                const { example } = await getExampleDocuments(category);
                setExampleDoc(example || null);
            }
        } catch (err) {
            console.error('Failed to fetch example', err);
        }
    }, [userRole, buyerCategory, sellerType, techType]);

    useEffect(() => {
        if (!isOpen) {
            setFiles([]);
            setError(null);
            setUploading(false);
            setSelectedBuyerProject('');
            setSelectedSellerProject('');
        } else {
            fetchExample();
        }
    }, [isOpen, fetchExample]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(Array.from(e.target.files));
        }
    };

    const handleUpload = async () => {
        if (files.length === 0) {
            setError('Please select at least one file.');
            return;
        }

        setUploading(true);
        setError(null);

        try {
            if (userRole === 'buyer') {
                // Determine facility type from selected project
                let facilityType: 'brownfield' | 'greenfield' = 'brownfield';
                if (selectedBuyerProject) {
                    const project = buyerProjects.find(p => p.id === selectedBuyerProject);
                    if (project) {
                        facilityType = project.project_type as 'brownfield' | 'greenfield';
                    }
                }

                await uploadBuyerDocument({
                    files,
                    facility_type: facilityType,
                    document_category: buyerCategory,
                    plan_type: 'historical',
                    metadata: selectedBuyerProject ? { project_id: selectedBuyerProject } : undefined,
                });
            } else {
                await uploadSellerDocument({
                    files,
                    seller_type: sellerType,
                    technology_type: sellerType === 'carbon_free' ? techType : undefined,
                    contract_type: sellerType === 'utility' ? contractType : undefined,
                    project_id: selectedSellerProject || undefined,
                });
            }
            onUploadSuccess();
            onClose();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Upload failed';
            setError(message);
        } finally {
            setUploading(false);
        }
    };

    // Get available categories based on selected buyer project
    const getAvailableBuyerCategories = () => {
        if (!selectedBuyerProject) {
            return Object.keys(BUYER_CATEGORIES);
        }

        const project = buyerProjects.find(p => p.id === selectedBuyerProject);
        if (!project) return Object.keys(BUYER_CATEGORIES);

        if (project.project_type === 'brownfield') {
            return ['historical_invoice', 'utility_contract', 'meter_reading', 'grid_data', 'equipment_config'];
        } else {
            return ['equipment_spec'];
        }
    };

    const availableBuyerCategories = getAvailableBuyerCategories();

    return (
        <Transition appear show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={() => {}}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/25" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                                <div className="flex justify-between items-center mb-4">
                                    <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                                        Upload Document
                                    </Dialog.Title>
                                    <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                                        <XMarkIcon className="h-6 w-6" />
                                    </button>
                                </div>

                                <div className="mt-2 space-y-4 max-h-[70vh] overflow-y-auto pr-4">
                                    {/* Role Specific Fields */}
                                    {userRole === 'buyer' ? (
                                        <>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Project (Optional)</label>
                                                <select
                                                    value={selectedBuyerProject}
                                                    onChange={(e) => {
                                                        setSelectedBuyerProject(e.target.value);
                                                        // Reset category when project changes
                                                        if (e.target.value) {
                                                            const project = buyerProjects.find(p => p.id === e.target.value);
                                                            if (project?.project_type === 'greenfield') {
                                                                setBuyerCategory('equipment_spec');
                                                            } else {
                                                                setBuyerCategory('historical_invoice');
                                                            }
                                                        }
                                                    }}
                                                    className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                >
                                                    <option value="">General Document</option>
                                                    {buyerProjects.map(project => (
                                                        <option key={project.id} value={project.id}>
                                                            {project.name} ({project.project_type})
                                                        </option>
                                                    ))}
                                                </select>
                                                <p className="mt-1 text-xs text-gray-500">
                                                    Link this document to a specific project or upload as a general document
                                                </p>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Document Category</label>
                                                <select
                                                    value={buyerCategory}
                                                    onChange={(e) => setBuyerCategory(e.target.value as BuyerDocumentCategory)}
                                                    className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                >
                                                    {availableBuyerCategories.map(cat => (
                                                        <option key={cat} value={cat}>
                                                            {BUYER_CATEGORIES[cat as BuyerDocumentCategory].name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Project (Optional)</label>
                                                <select
                                                    value={selectedSellerProject}
                                                    onChange={(e) => setSelectedSellerProject(e.target.value)}
                                                    className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                >
                                                    <option value="">General Company Documents</option>
                                                    {sellerProjects.map(project => (
                                                        <option key={project.id} value={project.id}>
                                                            {project.name} ({project.generation_type})
                                                        </option>
                                                    ))}
                                                </select>
                                                <p className="mt-1 text-xs text-gray-500">
                                                    Link this document to a specific project or upload as a general company document
                                                </p>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Seller Type</label>
                                                <select
                                                    value={sellerType}
                                                    onChange={(e) => setSellerType(e.target.value as SellerType)}
                                                    className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                >
                                                    <option value="carbon_free">Carbon-Free Energy</option>
                                                    <option value="utility">Utility Contract</option>
                                                </select>
                                            </div>
                                            {sellerType === 'carbon_free' && !selectedSellerProject && (
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700">Technology</label>
                                                    <select
                                                        value={techType}
                                                        onChange={(e) => setTechType(e.target.value as TechnologyType)}
                                                        className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                    >
                                                        <option value="solar">Solar</option>
                                                        <option value="wind">Wind</option>
                                                        <option value="nuclear">Nuclear</option>
                                                        <option value="battery">Battery Storage</option>
                                                    </select>
                                                </div>
                                            )}
                                            {sellerType === 'utility' && (
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700">Contract Type</label>
                                                    <input
                                                        type="text"
                                                        value={contractType}
                                                        onChange={(e) => setContractType(e.target.value)}
                                                        className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm"
                                                        placeholder="e.g. Fixed Rate"
                                                    />
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {/* Dynamic Instructions Panel */}
                                    {currentInstructions && (
                                        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                                            <div className="flex items-start gap-3">
                                                <InformationCircleIcon className="h-5 w-5 text-slate-600 flex-shrink-0 mt-0.5" />
                                                <div className="flex-1">
                                                    <h4 className="text-sm font-semibold text-slate-900 mb-1">
                                                        {currentInstructions.name}
                                                    </h4>
                                                    <p className="text-sm text-slate-700 mb-2">
                                                        {currentInstructions.description}
                                                    </p>
                                                    <p className="text-sm text-slate-600">
                                                        {currentInstructions.helpText}
                                                    </p>
                                                    {currentInstructions.fileTypes && (
                                                        <p className="text-xs text-slate-500 mt-2">
                                                            <span className="font-medium">Accepted formats:</span> {currentInstructions.fileTypes.join(', ')}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Example Hint */}
                                    {exampleDoc && (
                                        <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-700">
                                            <div className="flex items-start">
                                                <DocumentTextIcon className="h-5 w-5 mr-2 flex-shrink-0" />
                                                <div>
                                                    <p className="font-medium">What to upload:</p>
                                                    <p>{exampleDoc.description}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* File Drop Area */}
                                    <div className="mt-4 flex justify-center rounded-lg border border-dashed border-gray-900/25 px-6 py-10">
                                        <div className="text-center">
                                            <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-300" aria-hidden="true" />
                                            <div className="mt-4 flex text-sm leading-6 text-gray-600">
                                                <label
                                                    htmlFor="file-upload"
                                                    className="relative cursor-pointer rounded-md bg-white font-semibold text-indigo-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-600 focus-within:ring-offset-2 hover:text-indigo-500"
                                                >
                                                    <span>Upload a file</span>
                                                    <input
                                                        id="file-upload"
                                                        name="file-upload"
                                                        type="file"
                                                        className="sr-only"
                                                        multiple
                                                        onChange={handleFileChange}
                                                    />
                                                </label>
                                                <p className="pl-1">or drag and drop</p>
                                            </div>
                                            <p className="text-xs leading-5 text-gray-600">PDF, CSV, TSV up to 25MB</p>
                                        </div>
                                    </div>

                                    {/* Selected Files */}
                                    {files.length > 0 && (
                                        <div className="mt-2">
                                            <h4 className="text-sm font-medium text-gray-900">Selected files:</h4>
                                            <ul className="mt-1 text-sm text-gray-500">
                                                {files.map((file, idx) => (
                                                    <li key={idx}>{file.name}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {error && <p className="text-sm text-red-600">{error}</p>}

                                    <div className="mt-6 flex justify-end gap-3">
                                        <button
                                            type="button"
                                            className="inline-flex justify-center rounded-md border border-transparent bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
                                            onClick={onClose}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            className="inline-flex justify-center rounded-md border border-transparent bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 disabled:opacity-50"
                                            onClick={handleUpload}
                                            disabled={uploading}
                                        >
                                            {uploading ? 'Uploading...' : 'Upload'}
                                        </button>
                                    </div>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
}
