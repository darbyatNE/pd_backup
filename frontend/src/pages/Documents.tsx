import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';

import {
  getPowerPlans,
  getTechnicalDocuments,
  getPowerPlanDownloadUrl,
  getTechnicalDocumentDownloadUrl,
  deletePowerPlan,
  deleteTechnicalDocument,
} from '../services/api';
import UploadModal from '../components/UploadModal';
import EmptyState from '../components/EmptyState';
import { RowActionButton, RowActionGroup } from '../components/RowActions';
import {
  DocumentTextIcon,
  ArrowDownTrayIcon,
  TrashIcon,
} from '../components/Icons';
import { SkeletonDocumentsTable } from '../components/Skeleton';
import {
  FunnelIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  FolderIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import type { PowerPlan, TechnicalDocument } from '../types';

type DocumentItem = (PowerPlan | TechnicalDocument) & {
  type: 'buyer' | 'seller';
  displayCategory: string;
  displayDate: string;
  stage: 'Origination' | 'Due Diligence' | 'Contract' | 'Operations';
  linkedProjectId?: string;
};

interface ProjectFolder {
  id: string;
  name: string;
  type?: string;
}

export default function Documents() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStage, setFilterStage] = useState<string>('All');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [projectFolders, setProjectFolders] = useState<ProjectFolder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['general']));



  const fetchProjectFolders = useCallback(async () => {
    if (!user) return;
    try {
      if (user.role === 'buyer') {
        const { data } = await supabase
          .from('buyer_projects')
          .select('id, name, project_type')
          .eq('buyer_id', user.id)
          .order('created_at', { ascending: false });
        setProjectFolders((data || []).map(p => ({ id: p.id, name: p.name, type: p.project_type })));
      } else {
        const { data } = await supabase
          .from('projects')
          .select('id, name, generation_type')
          .eq('seller_id', user.id)
          .order('created_at', { ascending: false });
        setProjectFolders((data || []).map(p => ({ id: p.id, name: p.name, type: p.generation_type })));
      }
    } catch {
      // Non-critical — folders just won't show project names
    }
  }, [user]);

  const fetchDocuments = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      let allDocs: DocumentItem[] = [];

      if (user.role === 'buyer') {
        const { plans } = await getPowerPlans();
        const buyerDocs: DocumentItem[] = plans.map((plan) => ({
          ...plan,
          type: 'buyer' as const,
          displayCategory: formatCategory(plan.document_category),
          displayDate: plan.created_at || '',
          stage: mapCategoryToStage(plan.document_category),
          linkedProjectId: (plan.metadata as Record<string, unknown>)?.project_id as string | undefined,
        }));
        allDocs = [...allDocs, ...buyerDocs];
      } else {
        const { documents: techDocs } = await getTechnicalDocuments();
        const sellerDocs: DocumentItem[] = techDocs.map((doc) => ({
          ...doc,
          type: 'seller' as const,
          displayCategory: doc.technology_type || doc.contract_type || 'Document',
          displayDate: doc.uploaded_at || '',
          stage: 'Origination',
          linkedProjectId: doc.project_id || undefined,
        }));
        allDocs = [...allDocs, ...sellerDocs];
      }

      // Sort by date (newest first)
      allDocs.sort((a, b) => new Date(b.displayDate).getTime() - new Date(a.displayDate).getTime());
      setDocuments(allDocs);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load documents';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchDocuments();
      fetchProjectFolders();
    }
  }, [user, fetchDocuments, fetchProjectFolders]);

  const mapCategoryToStage = (category?: string): DocumentItem['stage'] => {
    switch (category) {
      case 'historical_invoice':
      case 'utility_contract':
        return 'Origination';
      case 'meter_reading':
      case 'grid_data':
        return 'Due Diligence';
      case 'equipment_config':
      case 'equipment_spec':
        return 'Contract';
      default:
        return 'Origination';
    }
  };

  const formatCategory = (category?: string) => {
    if (!category) return 'Document';
    return category
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const handleDownload = async (doc: DocumentItem) => {
    try {
      let downloadUrl: string;
      if (doc.type === 'buyer') {
        const result = await getPowerPlanDownloadUrl(doc.id);
        downloadUrl = result.download_url as string;
      } else {
        const result = await getTechnicalDocumentDownloadUrl(doc.id);
        downloadUrl = result.download_url as string;
      }
      window.open(downloadUrl, '_blank');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to download';
      setError(message);
    }
  };

  const handleDelete = async (doc: DocumentItem) => {
    if (!confirm(`Delete "${doc.file_name || 'this document'}"?`)) return;
    try {
      if (doc.type === 'buyer') {
        await deletePowerPlan(doc.id);
      } else {
        await deleteTechnicalDocument(doc.id);
      }
      fetchDocuments();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete';
      setError(message);
    }
  };

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch =
      doc.file_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.displayCategory.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStage = filterStage === 'All' || doc.stage === filterStage;
    return matchesSearch && matchesStage;
  });

  const stages = ['All', 'Origination', 'Due Diligence', 'Contract', 'Operations'];

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const groupedDocs = useMemo(() => {
    const groups: { folderId: string; folderName: string; folderType?: string; docs: DocumentItem[] }[] = [];
    const projectMap = new Map<string, DocumentItem[]>();
    const generalDocs: DocumentItem[] = [];

    filteredDocs.forEach(doc => {
      if (doc.linkedProjectId) {
        const existing = projectMap.get(doc.linkedProjectId) || [];
        existing.push(doc);
        projectMap.set(doc.linkedProjectId, existing);
      } else {
        generalDocs.push(doc);
      }
    });

    // Add project folders (even if empty, to show folder structure)
    projectFolders.forEach(folder => {
      groups.push({
        folderId: folder.id,
        folderName: folder.name,
        folderType: folder.type,
        docs: projectMap.get(folder.id) || [],
      });
      projectMap.delete(folder.id);
    });

    // Add any remaining project-linked docs whose project wasn't in our folder list
    projectMap.forEach((docs, projectId) => {
      groups.push({
        folderId: projectId,
        folderName: 'Unknown Project',
        docs,
      });
    });

    // General docs always last
    if (generalDocs.length > 0 || groups.length === 0) {
      groups.push({
        folderId: 'general',
        folderName: 'General Documents',
        docs: generalDocs,
      });
    }

    return groups;
  }, [filteredDocs, projectFolders]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Documents Hub</h1>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">
            Manage your PPA documentation across all deal stages.
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            <PlusIcon className="h-5 w-5" />
            Upload Document
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <MagnifyingGlassIcon className="h-5 w-5 text-slate-400" aria-hidden="true" />
          </div>
          <input
            type="text"
            className="block w-full rounded-lg border border-slate-300 py-2 pl-10 text-slate-900 bg-white placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 sm:text-sm"
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="sm:w-64">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <FunnelIcon className="h-5 w-5 text-slate-400" aria-hidden="true" />
            </div>
            <select
              value={filterStage}
              onChange={(e) => setFilterStage(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 py-2 pl-10 text-slate-900 bg-white focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 sm:text-sm"
            >
              {stages.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error loading documents</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content — Folder-based view */}
      <div>
        {loading ? (
          <SkeletonDocumentsTable rows={5} />
        ) : filteredDocs.length === 0 && groupedDocs.every(g => g.docs.length === 0) ? (
          <EmptyState
            icon={DocumentTextIcon}
            title="No documents found"
            description={
              searchTerm || filterStage !== 'All'
                ? 'Try adjusting your filters to see more results.'
                : 'Upload your first document to get started with your PPA journey.'
            }
            actionLabel={searchTerm || filterStage !== 'All' ? 'Clear Filters' : 'Upload Document'}
            onAction={
              searchTerm || filterStage !== 'All'
                ? () => {
                  setSearchTerm('');
                  setFilterStage('All');
                }
                : () => setIsUploadModalOpen(true)
            }
          />
        ) : (
          <div className="space-y-3">
            {groupedDocs.map((group) => (
              <div key={group.folderId} className="overflow-hidden bg-white border border-slate-200 shadow-sm rounded-xl">
                <button
                  type="button"
                  onClick={() => toggleFolder(group.folderId)}
                  className="w-full flex items-center gap-3 px-4 sm:px-6 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                >
                  {expandedFolders.has(group.folderId) ? (
                    <ChevronDownIcon className="h-4 w-4 text-slate-500 flex-shrink-0" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4 text-slate-500 flex-shrink-0" />
                  )}
                  <FolderIcon className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  <span className="text-sm font-semibold text-slate-900">{group.folderName}</span>
                  {group.folderType && (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 capitalize">
                      {group.folderType}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-slate-500">
                    {group.docs.length} {group.docs.length === 1 ? 'document' : 'documents'}
                  </span>
                </button>

                {expandedFolders.has(group.folderId) && (
                  group.docs.length === 0 ? (
                    <div className="px-4 sm:px-6 py-6 text-center text-sm text-slate-500">
                      No documents in this folder yet.
                    </div>
                  ) : (
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-white">
                        <tr>
                          <th scope="col" className="py-2.5 pl-4 pr-3 text-left text-xs font-medium text-slate-500 sm:pl-6">
                            Name
                          </th>
                          <th scope="col" className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">
                            Category
                          </th>
                          <th scope="col" className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">
                            Stage
                          </th>
                          <th scope="col" className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">
                            Date
                          </th>
                          <th scope="col" className="py-2.5 pl-3 pr-4 text-right text-xs font-medium text-slate-500 sm:pr-6 w-[130px]">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {group.docs.map((doc) => (
                          <tr key={doc.id} className="hover:bg-slate-50">
                            <td className="whitespace-nowrap py-3 pl-4 pr-3 text-sm font-medium text-slate-900 sm:pl-6">
                              <div className="flex items-center gap-3">
                                <DocumentTextIcon className="h-5 w-5 text-slate-400" />
                                {doc.file_name || 'Untitled Document'}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-500">
                              <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                                {doc.displayCategory}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-500">{doc.stage}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-500">
                              {new Date(doc.displayDate).toLocaleDateString()}
                            </td>
                            <td className="relative whitespace-nowrap py-3 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                              <RowActionGroup>
                                <RowActionButton
                                  label="Download"
                                  icon={ArrowDownTrayIcon}
                                  tone="primary"
                                  iconOnly
                                  ariaLabel={`Download ${doc.file_name || 'document'}`}
                                  onClick={() => handleDownload(doc)}
                                />
                                <RowActionButton
                                  label="Delete"
                                  icon={TrashIcon}
                                  tone="danger"
                                  iconOnly
                                  ariaLabel={`Delete ${doc.file_name || 'document'}`}
                                  onClick={() => handleDelete(doc)}
                                />
                              </RowActionGroup>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadSuccess={fetchDocuments}
        userRole={user?.role as 'buyer' | 'seller'}
      />
    </div>
  );
}
