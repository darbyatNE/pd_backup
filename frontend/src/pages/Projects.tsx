import { useState, useEffect, useMemo, useCallback } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useDashboardView } from '../contexts/DashboardViewContext';
import { useProjectProductSummaries } from '../data/projectProductsApi';
import { pnum, projectStatus, projectTerm, energyRange } from '../data/projectDisplay';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../services/api';
import type { Project, Metadata } from '../types/index';
import type { PriceCurrency, SettlementType, EACScheme } from '../types/ppa';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import CreateProjectModal from '../components/CreateProjectModal';
import ConfirmDialog from '../components/ConfirmDialog';
import { RowActionButton, RowActionGroup } from '../components/RowActions';
import { RocketLaunchIcon } from '../components/Icons';
import { SkeletonTable, SkeletonMetrics, SkeletonFilters, SkeletonMarketplaceTable } from '../components/Skeleton';
import {
  ArrowDownOnSquareIcon,
  ArrowUpOnSquareIcon,
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

// Attach the Cognito-issued bearer token to backend API requests.
const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('pd_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

type GenerationFilter = 'all' | string;
type SubmissionState = 'idle' | 'submitting' | 'success' | 'error';
type TabType = 'marketplace' | 'my-projects';

// Sortable columns of the marketplace projects table.
type SortKey = 'name' | 'generation_type' | 'capacity_mw';

// Comparable value for a project on a given sort key (string lower-cased, number as-is).
const projectSortValue = (p: Project, key: SortKey): string | number => {
  switch (key) {
    case 'capacity_mw': return Number(p.capacity_mw) || 0;
    default: return (p[key] ?? '').toString().toLowerCase();
  }
};


interface InterestFormState {
  energy_amount_mwh: string;
  start_date: string;
  contract_duration_years: number;
  shape: string;
  net_neutral_target: boolean;
  generation_preference: string;
}

const SHAPE_OPTIONS = [
  'Flat (7×24)',
  'On-Peak (5×16)',
  'Off-Peak',
  'As-Generated',
  'Block (custom)',
] as const;

// Wholesale-market deals are capped at 7 years for terms-pricing reasons —
// supplier balance-sheet exposure beyond that requires a different product.
const MAX_CONTRACT_YEARS = 7;

interface BuyerProject {
  id: string;
  buyer_id: string;
  project_type: 'brownfield' | 'greenfield';
  name: string;
  location: string;
  metadata: Metadata;
  created_at: string;
  target_capacity_mw?: number;
  target_annual_quantity_mwh?: number;
  preferred_term_years?: number;
  target_cod?: string;
  max_fixed_price_per_mwh?: number;
  price_currency?: PriceCurrency;
  preferred_settlement_type?: SettlementType;
  settlement_zone?: string;
  preferred_generation_types?: string[];
  required_eac_scheme?: EACScheme;
  renewable_percentage_target?: number;
  net_neutral_target_year?: number;
}

const defaultFormState: InterestFormState = {
  energy_amount_mwh: '',
  start_date: '',
  contract_duration_years: 3,
  shape: 'Flat (7×24)',
  net_neutral_target: true,
  generation_preference: '',
};

export default function Projects() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabType | null;
  const [activeTab, setActiveTab] = useState<TabType>(tabParam || 'marketplace');

  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam);
    } else {
      setActiveTab('marketplace');
    }
  }, [tabParam]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [buyerProjects, setBuyerProjects] = useState<BuyerProject[]>([]);
  const [sellerProjects, setSellerProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generationFilter, setGenerationFilter] = useState<GenerationFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();
  const { setView, setSubTab } = useDashboardView();
  const { byIso: productSummaries } = useProjectProductSummaries();
  // "Examine" → open the Examine-Fit chart (Plan view) with this project selected.
  const examineProject = (p: Project) => {
    setView('forecast');
    setSubTab('energy');
    navigate(`/dashboard?examine=${p.id}`);
  };
  // Marketplace table column sort.
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const toggleSort = (key: SortKey) =>
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  // Clickable, sort-aware table header cell for the marketplace table.
  const SortTh = ({ label, col, className, rowSpan }: { label: string; col: SortKey; className?: string; rowSpan?: number }) => (
    <th
      rowSpan={rowSpan}
      className={`px-2 py-1.5 cursor-pointer select-none hover:text-slate-900 ${className ?? ''}`}
      onClick={() => toggleSort(col)}
      aria-sort={sort.key === col ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={sort.key === col ? 'text-slate-700' : 'text-slate-300'}>
          {sort.key === col ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </span>
    </th>
  );
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [formState, setFormState] = useState<InterestFormState>(defaultFormState);
  const [submissionState, setSubmissionState] = useState<SubmissionState>('idle');
  const [submissionMessage, setSubmissionMessage] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<BuyerProject | null>(null);
  const [viewingBuyerProject, setViewingBuyerProject] = useState<BuyerProject | null>(null);
  const [editingSellerProject, setEditingSellerProject] = useState<Project | null>(null);
  const [viewingSellerProject, setViewingSellerProject] = useState<Project | null>(null);

  const fetchMarketplaceProjects = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/projects`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Unable to load marketplace projects.');
      const { projects } = (await res.json()) as { projects: Project[] };
      setProjects(projects ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to load marketplace projects.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBuyerProjects = useCallback(async () => {
    if (user?.role !== 'buyer') return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/projects/buyer/my-projects`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Unable to load your projects.');
      const { projects } = (await res.json()) as { projects: BuyerProject[] };
      setBuyerProjects(projects ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to load your projects.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchSellerProjects = useCallback(async () => {
    if (user?.role !== 'seller') return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/projects/my-projects`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Unable to load your projects.');
      const { projects } = (await res.json()) as { projects: Project[] };
      setSellerProjects(projects ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to load your projects.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (activeTab === 'marketplace') {
      fetchMarketplaceProjects();
    }
  }, [activeTab, fetchMarketplaceProjects]);

  useEffect(() => {
    if (activeTab === 'my-projects' && user?.role === 'buyer') {
      fetchBuyerProjects();
    } else if (activeTab === 'my-projects' && user?.role === 'seller') {
      fetchSellerProjects();
    }
  }, [activeTab, user, fetchBuyerProjects, fetchSellerProjects]);

  useEffect(() => {
    if (activeProject) {
      setFormState({
        energy_amount_mwh: '',
        start_date: '',
        contract_duration_years: 3,
        shape: 'Flat (7×24)',
        net_neutral_target: true,
        generation_preference: activeProject.generation_type,
      });
      setSubmissionState('idle');
      setSubmissionMessage('');
    }
  }, [activeProject]);

  // Lock body scroll when any custom modal is open
  useEffect(() => {
    const isModalOpen = !!activeProject || !!viewingBuyerProject || !!viewingSellerProject;
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [activeProject, viewingBuyerProject, viewingSellerProject]);

  const handlePublish = async (projectId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/publish`, {
        method: 'PUT',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed');
      fetchSellerProjects();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      alert('Failed to publish project: ' + message);
    }
  };

  const handleUnpublish = async (projectId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/unpublish`, {
        method: 'PUT',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed');
      fetchSellerProjects();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      alert('Failed to unpublish project: ' + message);
    }
  };

  const handleEdit = (event: React.MouseEvent, project: BuyerProject) => {
    event.stopPropagation();
    event.preventDefault();
    setEditingProject(project);
    setCreateModalOpen(true);
  };

  const handleEditSeller = (event: React.MouseEvent, project: Project) => {
    event.stopPropagation();
    event.preventDefault();
    setEditingSellerProject(project);
    setCreateModalOpen(true);
  };

  const handleDelete = (event: React.MouseEvent, projectId: string) => {
    event.stopPropagation();
    event.preventDefault();

    setProjectToDelete(projectId);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!projectToDelete) return;

    try {
      const path = user?.role === 'buyer'
        ? `/projects/buyer/${projectToDelete}`
        : `/projects/${projectToDelete}`;
      const res = await fetch(`${API_BASE_URL}${path}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed');

      // Refresh appropriate project list based on user role
      if (user?.role === 'seller') {
        fetchSellerProjects();
      } else if (user?.role === 'buyer') {
        fetchBuyerProjects();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      alert('Failed to delete project: ' + message);
    } finally {
      setDeleteConfirmOpen(false);
      setProjectToDelete(null);
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmOpen(false);
    setProjectToDelete(null);
  };

  const filteredProjects = useMemo(() => {
    const displayProjects = activeTab === 'marketplace' ? projects : sellerProjects;
    return displayProjects
      .filter((project) =>
        generationFilter === 'all' ? true : project.generation_type === generationFilter
      )
      .filter((project) => {
        if (!searchTerm.trim()) return true;
        const term = searchTerm.toLowerCase();
        return (
          project.name.toLowerCase().includes(term) ||
          project.location.toLowerCase().includes(term) ||
          project.generation_type.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        const av = projectSortValue(a, sort.key);
        const bv = projectSortValue(b, sort.key);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sort.dir === 'asc' ? cmp : -cmp;
      });
  }, [projects, sellerProjects, generationFilter, searchTerm, activeTab, sort]);

  // Build the generation-type tab list dynamically from whatever's actually
  // in the visible deal list — always lead with "all", then each unique
  // generation_type, sorted alphabetically for stable ordering.
  const availableGenFilters = useMemo<GenerationFilter[]>(() => {
    const displayProjects = activeTab === 'marketplace' ? projects : sellerProjects;
    const types = Array.from(new Set(displayProjects.map((p) => p.generation_type))).sort();
    return ['all', ...types];
  }, [projects, sellerProjects, activeTab]);

  // Project count per gen-type filter (and total for 'all'), shown on each chip.
  const genCounts = useMemo<Record<string, number>>(() => {
    const displayProjects = activeTab === 'marketplace' ? projects : sellerProjects;
    const counts: Record<string, number> = { all: displayProjects.length };
    for (const p of displayProjects) counts[p.generation_type] = (counts[p.generation_type] ?? 0) + 1;
    return counts;
  }, [projects, sellerProjects, activeTab]);

  // Reset filter to "all" when the active filter is no longer in the list
  // (e.g., user toggled tabs and the prior gen type isn't represented).
  useEffect(() => {
    if (!availableGenFilters.includes(generationFilter)) {
      setGenerationFilter('all');
    }
  }, [availableGenFilters, generationFilter]);

  const filteredSellerProjects = useMemo(() => {
    if (activeTab === 'my-projects') {
      return sellerProjects;
    }
    return [];
  }, [sellerProjects, activeTab]);

  const handleInterestChange = (field: keyof InterestFormState, value: string | number | boolean) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const closeModal = () => {
    setActiveProject(null);
    setSubmissionState('idle');
    setSubmissionMessage('');
    setFormState(defaultFormState);
  };

  const handleSubmitInterest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || user.role !== 'buyer' || !activeProject) return;

    if (!formState.energy_amount_mwh || !formState.start_date) {
      setSubmissionState('error');
      setSubmissionMessage('Please provide both energy amount and a desired start date.');
      return;
    }

    setSubmissionState('submitting');
    setSubmissionMessage('');

    try {
      const cappedYears = Math.min(MAX_CONTRACT_YEARS, Math.max(1, Number(formState.contract_duration_years)));
      const payload = {
        project_id: activeProject.id,
        energy_amount_mwh: Number(formState.energy_amount_mwh),
        start_date: formState.start_date,
        contract_duration_years: cappedYears,
        shape: formState.shape,
        net_neutral_target: formState.net_neutral_target,
        generation_preference: formState.generation_preference,
      };

      const token = localStorage.getItem('pd_access_token');
      const response = await fetch(`${API_BASE_URL}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit interest');
      }

      setSubmissionState('success');
      setSubmissionMessage(
        'Interest submitted. A Power Dime specialist will follow up with diligence materials.'
      );

      setFormState({
        energy_amount_mwh: '',
        start_date: '',
        contract_duration_years: 3,
        shape: 'Flat (7×24)',
        net_neutral_target: true,
        generation_preference: activeProject.generation_type,
      });
    } catch (err: unknown) {
      setSubmissionState('error');
      const message = err instanceof Error ? err.message : 'Unable to submit interest right now.';
      setSubmissionMessage(message);
    }
  };

  const handleCreateSuccess = () => {
    setCreateModalOpen(false);
    setEditingProject(null);
    if (user?.role === 'buyer') {
      setActiveTab('my-projects');
      fetchBuyerProjects();
    } else {
      setActiveTab('my-projects');
      fetchSellerProjects();
      setEditingSellerProject(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl truncate">
            {user?.role === 'buyer'
              ? 'Projects'
              : activeTab === 'marketplace'
                ? 'Project Marketplace'
                : 'My Projects'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {activeTab === 'marketplace'
              ? 'Browse available energy projects and submit interest.'
              : user?.role === 'buyer'
                ? 'Manage your data center sites and energy requirements.'
                : 'Manage your generation projects.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateModalOpen(true)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 flex-shrink-0"
        >
          Add Project
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => setActiveTab('marketplace')}
            className={`border-b-2 py-2 px-1 text-sm font-medium transition ${activeTab === 'marketplace'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
          >
            Marketplace
          </button>
          {/*{user?.role === 'buyer' && (
            <button
              onClick={() => setActiveTab('my-projects')}
              className={`border-b-2 py-2 px-1 text-sm font-medium transition ${activeTab === 'my-projects'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
            >
              My Data Center Sites
            </button>
          )}*/}
          {user?.role === 'seller' && (
            <button
              onClick={() => setActiveTab('my-projects')}
              className={`border-b-2 py-2 px-1 text-sm font-medium transition ${activeTab === 'my-projects'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
            >
              My Projects
            </button>
          )}
        </nav>
      </div>

      {loading ? (
        activeTab === 'marketplace' ? (
          <div className="space-y-6">
            <SkeletonMetrics />
            <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
              <SkeletonFilters variant="plain" />
              <div className="mt-4 sm:mt-6">
                <SkeletonMarketplaceTable rows={6} />
              </div>
            </div>
          </div>
        ) : (
          <SkeletonTable rows={5} />
        )
      ) : (
        <>
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
            >
              {error}
            </div>
          )}

          {/* Buyer Projects View */}
          {activeTab === 'my-projects' && user?.role === 'buyer' && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              {buyerProjects.length === 0 ? (
                <EmptyState
                  title="No projects yet"
                  description="Create your first data center site to get started."
                  icon={RocketLaunchIcon}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50 text-left text-xs font-medium text-slate-700">
                      <tr>
                        <th className="px-6 py-2">Project Name</th>
                        <th className="px-6 py-2">Type</th>
                        <th className="px-6 py-2">Location</th>
                        <th className="px-6 py-2">Created</th>
                        <th className="px-6 py-2 text-right w-[170px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white text-sm">
                      {buyerProjects.map((project) => (
                        <tr key={project.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setViewingBuyerProject(project)}>
                          <td className="px-6 py-2.5 font-medium text-slate-900">{project.name}</td>
                          <td className="px-6 py-2.5">
                            <StatusBadge
                              status={project.project_type === 'brownfield' ? 'Brownfield' : 'Greenfield'}
                              type="info"
                            />
                          </td>
                          <td className="px-6 py-2.5 text-slate-700">{project.location}</td>
                          <td className="px-6 py-2.5 text-slate-700">
                            {new Date(project.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-2.5 text-right">
                            <RowActionGroup>
                              <RowActionButton
                                label="Edit"
                                icon={PencilSquareIcon}
                                tone="primary"
                                ariaLabel={`Edit ${project.name}`}
                                onClick={(e) => handleEdit(e, project)}
                              />
                              <RowActionButton
                                label="Delete"
                                icon={TrashIcon}
                                tone="danger"
                                iconOnly
                                ariaLabel={`Delete ${project.name}`}
                                onClick={(e) => handleDelete(e, project.id)}
                              />
                            </RowActionGroup>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Seller Projects View */}
          {activeTab === 'my-projects' && user?.role === 'seller' && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              {filteredSellerProjects.length === 0 ? (
                <EmptyState
                  title="No projects yet"
                  description="Create a generation project to get started."
                  icon={RocketLaunchIcon}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50 text-left text-xs font-medium text-slate-700">
                      <tr>
                        <th className="px-6 py-2">Project Name</th>
                        <th className="px-6 py-2">Type</th>
                        <th className="px-6 py-2">Capacity</th>
                        <th className="px-6 py-2">Location</th>
                        <th className="px-6 py-2">ISO</th>
                        <th className="px-6 py-2">Zone</th>
                        <th className="px-6 py-2">Status</th>
                        <th className="px-6 py-2 text-right w-[240px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white text-sm">
                      {filteredSellerProjects.map((project) => (
                        <tr key={project.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setViewingSellerProject(project)}>
                          <td className="px-6 py-2.5 font-medium text-slate-900">{project.name}</td>
                          <td className="px-6 py-2.5">
                            <StatusBadge status={project.generation_type} type="info" />
                          </td>
                          <td className="px-6 py-2.5 text-slate-900">{project.capacity_mw} MW</td>
                          <td className="px-6 py-2.5 text-slate-700">{project.location}</td>
                          <td className="px-6 py-2.5 text-slate-700">{project.iso || '—'}</td>
                          <td className="px-6 py-2.5 text-slate-700">{project.zone || '—'}</td>
                          <td className="px-6 py-2.5">
                            <StatusBadge
                              status={project.status === 'draft' ? 'Draft' : project.status === 'unpublished' ? 'Unpublished' : 'Published'}
                              type={project.status === 'published' ? 'success' : 'warning'}
                            />
                          </td>
                          <td className="px-6 py-2.5 text-right">
                            <RowActionGroup>
                              {(project.status === 'draft' || project.status === 'unpublished') && (
                                <RowActionButton
                                  label="Publish"
                                  icon={ArrowUpOnSquareIcon}
                                  tone="success"
                                  ariaLabel={`Publish ${project.name}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    handlePublish(project.id);
                                  }}
                                />
                              )}
                              {project.status === 'published' && (
                                <RowActionButton
                                  label="Unpublish"
                                  icon={ArrowDownOnSquareIcon}
                                  tone="warning"
                                  ariaLabel={`Unpublish ${project.name}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    handleUnpublish(project.id);
                                  }}
                                />
                              )}
                              <RowActionButton
                                label="Edit"
                                icon={PencilSquareIcon}
                                tone="primary"
                                iconOnly
                                ariaLabel={`Edit ${project.name}`}
                                onClick={(e) => handleEditSeller(e, project)}
                              />
                              <RowActionButton
                                label="Delete"
                                icon={TrashIcon}
                                tone="danger"
                                iconOnly
                                ariaLabel={`Delete ${project.name}`}
                                onClick={(e) => handleDelete(e, project.id)}
                              />
                            </RowActionGroup>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Marketplace View */}
          {activeTab === 'marketplace' && (
            <div className="relative z-0">
              <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm overflow-hidden">
                <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
                    {availableGenFilters.map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setGenerationFilter(filter)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition whitespace-nowrap ${generationFilter === filter
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                      >
                        {filter === 'all' ? 'All' : filter}
                        <span
                          className={`inline-flex items-center justify-center min-w-[1.25rem] rounded-full px-1.5 text-[10px] font-semibold ${generationFilter === filter
                            ? 'bg-white/20 text-white'
                            : 'bg-white text-slate-500'
                            }`}
                        >
                          {genCounts[filter] ?? 0}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="relative w-full sm:w-64">
                    <input
                      type="search"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Search projects..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 sm:px-4 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                </div>

                {filteredProjects.length === 0 ? (
                  <div className="mt-4 sm:mt-6">
                    <EmptyState
                      title={projects.length === 0 ? 'No projects available' : 'No projects match your filters'}
                      description={
                        projects.length === 0
                          ? 'Check back soon for new energy projects.'
                          : 'Try adjusting your filters or refresh to see new projects.'
                      }
                      icon={RocketLaunchIcon}
                    />
                  </div>
                ) : (
                  <div className="mt-4 sm:mt-6 rounded-lg border border-slate-200 overflow-hidden">
                    <table className="w-full table-fixed text-[11px] leading-tight">
                      <colgroup>
                        <col style={{ width: '9%' }} />{/* Status */}
                        <col style={{ width: '15%' }} />{/* Project */}
                        <col style={{ width: '8%' }} />{/* Type */}
                        <col style={{ width: '7%' }} />{/* Cap MW */}
                        <col style={{ width: '8%' }} />{/* Cap LDA */}
                        <col style={{ width: '8%' }} />{/* Egy MWh */}
                        <col style={{ width: '8%' }} />{/* Egy Zone */}
                        <col style={{ width: '6%' }} />{/* REC % */}
                        <col style={{ width: '10%' }} />{/* REC Tracking */}
                        <col style={{ width: '7%' }} />{/* Start */}
                        <col style={{ width: '7%' }} />{/* Stop */}
                        <col style={{ width: '7%' }} />{/* Examine */}
                      </colgroup>
                      <thead className="bg-slate-50 text-left text-slate-600">
                        {/* Group row */}
                        <tr className="border-b border-slate-200">
                          <th rowSpan={2} className="px-2 py-1.5 align-bottom font-semibold">Status</th>
                          <SortTh label="Project" col="name" rowSpan={2} className="align-bottom font-semibold" />
                          <SortTh label="Type" col="generation_type" rowSpan={2} className="align-bottom font-semibold" />
                          <th colSpan={2} className="px-2 py-1 text-center font-semibold text-teal-700 border-l border-slate-200 bg-teal-50/40">Capacity</th>
                          <th colSpan={2} className="px-2 py-1 text-center font-semibold text-amber-700 border-l border-slate-200 bg-amber-50/40">Energy</th>
                          <th colSpan={2} className="px-2 py-1 text-center font-semibold text-indigo-700 border-l border-slate-200 bg-indigo-50/40">RECs</th>
                          <th colSpan={2} className="px-2 py-1 text-center font-semibold border-l border-slate-200">Term</th>
                          <th rowSpan={2} className="px-2 py-1.5 align-bottom text-right font-semibold border-l border-slate-200">Examine</th>
                        </tr>
                        {/* Leaf row */}
                        <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400">
                          <SortTh label="MW" col="capacity_mw" className="border-l border-slate-200 font-medium" />
                          <th className="px-2 py-1 font-medium">LDA</th>
                          <th className="px-2 py-1 border-l border-slate-200 font-medium">MWh</th>
                          <th className="px-2 py-1 font-medium">Zone</th>
                          <th className="px-2 py-1 border-l border-slate-200 font-medium">%</th>
                          <th className="px-2 py-1 font-medium">Tracking</th>
                          <th className="px-2 py-1 border-l border-slate-200 font-medium">Start</th>
                          <th className="px-2 py-1 font-medium">Stop</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                        {filteredProjects.map((project) => {
                          const s = productSummaries[project.id];
                          const st = projectStatus(project);
                          const tm = projectTerm(project);
                          const lda = s?.eda || project.zone || '—';
                          const zone = s?.zone || project.zone || '—';
                          const recPct = s?.has_rec && pnum(s.rec_pct) != null ? `${pnum(s.rec_pct)}%` : '—';
                          const tracking = s?.has_rec && s.retiring_agency ? s.retiring_agency : '—';
                          const dim = (v: string) => (v === '—' ? 'text-slate-300' : '');
                          return (
                            <tr key={project.id} className={`hover:bg-slate-50 ${project.seller_id === user?.id ? 'bg-indigo-50/30' : ''}`}>
                              <td className="px-2 py-1.5">
                                <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${st.available ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                  {st.label}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 font-medium text-slate-900 truncate" title={project.name}>
                                {project.seller_id === user?.id && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-indigo-500 align-middle" title="Your project" />}
                                {project.name}
                              </td>
                              <td className="px-2 py-1.5 truncate" title={project.generation_type}>{project.generation_type}</td>
                              {/* Capacity */}
                              <td className="px-2 py-1.5 border-l border-slate-100 text-slate-900 whitespace-nowrap">{pnum(project.capacity_mw) ?? '—'}</td>
                              <td className={`px-2 py-1.5 truncate ${dim(lda)}`} title={lda}>{lda}</td>
                              {/* Energy */}
                              <td className={`px-2 py-1.5 border-l border-slate-100 whitespace-nowrap ${dim(energyRange(s))}`}>{energyRange(s)}</td>
                              <td className={`px-2 py-1.5 truncate ${dim(zone)}`} title={zone}>{zone}</td>
                              {/* RECs */}
                              <td className={`px-2 py-1.5 border-l border-slate-100 whitespace-nowrap ${dim(recPct)}`}>{recPct}</td>
                              <td className={`px-2 py-1.5 truncate ${dim(tracking)}`} title={tracking}>{tracking}</td>
                              {/* Term */}
                              <td className={`px-2 py-1.5 border-l border-slate-100 whitespace-nowrap ${dim(tm.start)}`}>{tm.start}</td>
                              <td className={`px-2 py-1.5 whitespace-nowrap ${dim(tm.stop)}`}>{tm.stop}</td>
                              {/* Examine */}
                              <td className="px-2 py-1.5 text-right border-l border-slate-100">
                                <button
                                  type="button"
                                  onClick={() => examineProject(project)}
                                  className="rounded bg-teal-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-teal-700"
                                  aria-label={`Examine ${project.name}`}
                                >
                                  Examine
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-3 sm:mt-4 text-xs text-slate-500">
                  Showing {filteredProjects.length} of {projects.length} projects
                </div>
              </section>
            </div>
          )}
        </>
      )}

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setEditingProject(null);
          setEditingSellerProject(null);
        }}
        onSuccess={handleCreateSuccess}
        editProject={editingProject || (editingSellerProject ? {
          id: editingSellerProject.id,
          name: editingSellerProject.name,
          project_type: 'generation' as const,
          location: editingSellerProject.location,
          metadata: (editingSellerProject.metadata || {}) as Record<string, unknown>,
          generation_type: editingSellerProject.generation_type,
          capacity_mw: editingSellerProject.capacity_mw,
          status: editingSellerProject.status,
          fixed_price_per_mwh: editingSellerProject.fixed_price_per_mwh,
          eac_price_per_mwh: editingSellerProject.eac_price_per_mwh,
          price_currency: editingSellerProject.price_currency as PriceCurrency | undefined,
          annual_escalator_percent: editingSellerProject.annual_escalator_percent,
          expected_cod: editingSellerProject.expected_cod,
          guaranteed_cod: editingSellerProject.guaranteed_cod,
          delivery_term_years: editingSellerProject.delivery_term_years,
          guaranteed_availability_year1_percent: editingSellerProject.guaranteed_availability_year1_percent,
          guaranteed_availability_ongoing_percent: editingSellerProject.guaranteed_availability_ongoing_percent,
          eac_scheme: editingSellerProject.eac_scheme as EACScheme | '' | undefined,
          settlement_point: editingSellerProject.settlement_point,
          connection_point: editingSellerProject.connection_point,
          iso: editingSellerProject.iso,
          zone: editingSellerProject.zone,
        } : null)}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="Delete Project"
        message="Are you sure you want to delete this project? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />

      {/* Project Details Modal (for marketplace) */}
      {activeProject && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 p-4">
          <div
            className="absolute inset-0"
            role="presentation"
            onClick={closeModal}
            aria-hidden="true"
          />

          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 py-2 sm:py-4">
              <h2 className="text-lg sm:text-xl font-semibold text-slate-900 truncate pr-4">{activeProject.name}</h2>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 text-xl flex-shrink-0"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="p-4 sm:p-6">
              <div className="mb-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Type</p>
                    <p className="mt-1 text-sm text-slate-900">{activeProject.generation_type}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Location</p>
                    <p className="mt-1 text-sm text-slate-900">{activeProject.location}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">ISO</p>
                    <p className="mt-1 text-sm text-slate-900">{activeProject.iso || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Zone</p>
                    <p className="mt-1 text-sm text-slate-900">{activeProject.zone || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Capacity</p>
                    <p className="mt-1 text-sm text-slate-900">{activeProject.capacity_mw} MW</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Fixed Price</p>
                    <p className="mt-1 text-sm text-slate-900">
                      {activeProject.fixed_price_per_mwh != null
                        ? `$${activeProject.fixed_price_per_mwh}/MWh (${activeProject.price_currency || 'USD'})`
                        : '—'}
                    </p>
                  </div>
                  {activeProject.eac_price_per_mwh != null && (
                    <div>
                      <p className="text-xs font-medium text-slate-500">EAC Price</p>
                      <p className="mt-1 text-sm text-slate-900">${activeProject.eac_price_per_mwh}/MWh</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                {user?.role === 'buyer' ? (
                  <>
                    <h3 className="text-base font-semibold text-slate-900 mb-3">Submit Interest</h3>

                    {submissionMessage && (
                      <div
                        className={`mb-4 rounded-lg border px-4 py-3 text-sm ${submissionState === 'success'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-rose-200 bg-rose-50 text-rose-700'
                          }`}
                      >
                        {submissionMessage}
                      </div>
                    )}

                    <form className="space-y-4" onSubmit={handleSubmitInterest}>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Energy Amount (MWh) *
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={formState.energy_amount_mwh}
                          onChange={(event) =>
                            handleInterestChange('energy_amount_mwh', event.target.value)
                          }
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                          required
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Start Date *
                          </label>
                          <input
                            type="date"
                            value={formState.start_date}
                            onChange={(event) =>
                              handleInterestChange('start_date', event.target.value)
                            }
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Contract Duration (years)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={MAX_CONTRACT_YEARS}
                            value={formState.contract_duration_years}
                            onChange={(event) =>
                              handleInterestChange(
                                'contract_duration_years',
                                Math.min(MAX_CONTRACT_YEARS, Number(event.target.value))
                              )
                            }
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                          />
                          <p className="mt-1 text-[11px] text-slate-400">Max {MAX_CONTRACT_YEARS} years</p>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Shape *
                        </label>
                        <select
                          value={formState.shape}
                          onChange={(event) => handleInterestChange('shape', event.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                          required
                        >
                          {SHAPE_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <p className="mt-1 text-[11px] text-slate-400">
                          Delivery profile: <strong>Flat</strong> = 7×24 firm · <strong>5×16</strong> = on-peak weekdays · <strong>As-Generated</strong> = matches the asset's output
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Additional Notes
                        </label>
                        <textarea
                          rows={3}
                          value={formState.generation_preference}
                          onChange={(event) =>
                            handleInterestChange('generation_preference', event.target.value)
                          }
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                          placeholder="Optional: Add any preferences or requirements"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={submissionState === 'submitting'}
                      >
                        {submissionState === 'submitting' ? 'Submitting...' : 'Submit Interest'}
                      </button>
                    </form>
                  </>
                ) : (
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 mb-2">
                      Seller View
                    </h3>
                    <p className="text-sm text-slate-600">
                      Buyers can submit interest in this project. You'll be able to review and respond to submissions in the Transactions page.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Buyer Project Summary Modal (read-only) */}
      {viewingBuyerProject && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 p-4">
          <div
            className="absolute inset-0"
            role="presentation"
            onClick={() => setViewingBuyerProject(null)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 py-2 sm:py-4">
              <h2 className="text-lg sm:text-xl font-semibold text-slate-900 truncate pr-4">{viewingBuyerProject.name}</h2>
              <button
                type="button"
                onClick={() => setViewingBuyerProject(null)}
                className="text-slate-400 hover:text-slate-600 text-xl flex-shrink-0"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="p-4 sm:p-6">
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">Site Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-slate-500">Type</p>
                      <p className="mt-1 text-sm text-slate-900 capitalize">{viewingBuyerProject.project_type}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Location</p>
                      <p className="mt-1 text-sm text-slate-900">{viewingBuyerProject.location || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Created</p>
                      <p className="mt-1 text-sm text-slate-900">{new Date(viewingBuyerProject.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>

                {(viewingBuyerProject.target_capacity_mw || viewingBuyerProject.target_annual_quantity_mwh || viewingBuyerProject.preferred_term_years) && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Procurement Requirements</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {viewingBuyerProject.target_capacity_mw && (
                        <div>
                          <p className="text-xs font-medium text-slate-500">Target Capacity</p>
                          <p className="mt-1 text-sm text-slate-900">{viewingBuyerProject.target_capacity_mw} MW</p>
                        </div>
                      )}
                      {viewingBuyerProject.target_annual_quantity_mwh && (
                        <div>
                          <p className="text-xs font-medium text-slate-500">Annual Quantity</p>
                          <p className="mt-1 text-sm text-slate-900">{viewingBuyerProject.target_annual_quantity_mwh.toLocaleString()} MWh</p>
                        </div>
                      )}
                      {viewingBuyerProject.preferred_term_years && (
                        <div>
                          <p className="text-xs font-medium text-slate-500">Preferred Term</p>
                          <p className="mt-1 text-sm text-slate-900">{viewingBuyerProject.preferred_term_years} years</p>
                        </div>
                      )}
                      {viewingBuyerProject.target_cod && (
                        <div>
                          <p className="text-xs font-medium text-slate-500">Target COD</p>
                          <p className="mt-1 text-sm text-slate-900">{new Date(viewingBuyerProject.target_cod).toLocaleDateString()}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(viewingBuyerProject.max_fixed_price_per_mwh || viewingBuyerProject.preferred_settlement_type) && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Pricing & Settlement</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {viewingBuyerProject.max_fixed_price_per_mwh && (
                        <div>
                          <p className="text-xs font-medium text-slate-500">Max Price</p>
                          <p className="mt-1 text-sm text-slate-900">
                            ${viewingBuyerProject.max_fixed_price_per_mwh}/MWh ({viewingBuyerProject.price_currency || 'USD'})
                          </p>
                        </div>
                      )}
                      {viewingBuyerProject.preferred_settlement_type && (
                        <div>
                          <p className="text-xs font-medium text-slate-500">Settlement Type</p>
                          <p className="mt-1 text-sm text-slate-900 capitalize">{viewingBuyerProject.preferred_settlement_type.replace(/_/g, ' ')}</p>
                        </div>
                      )}
                      {viewingBuyerProject.settlement_zone && (
                        <div>
                          <p className="text-xs font-medium text-slate-500">Settlement Zone</p>
                          <p className="mt-1 text-sm text-slate-900">{viewingBuyerProject.settlement_zone}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(viewingBuyerProject.preferred_generation_types?.length || viewingBuyerProject.renewable_percentage_target || viewingBuyerProject.net_neutral_target_year) && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Environmental</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {viewingBuyerProject.preferred_generation_types && viewingBuyerProject.preferred_generation_types.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-slate-500">Preferred Generation</p>
                          <p className="mt-1 text-sm text-slate-900">{viewingBuyerProject.preferred_generation_types.join(', ')}</p>
                        </div>
                      )}
                      {viewingBuyerProject.renewable_percentage_target && (
                        <div>
                          <p className="text-xs font-medium text-slate-500">Renewable Target</p>
                          <p className="mt-1 text-sm text-slate-900">{viewingBuyerProject.renewable_percentage_target}%</p>
                        </div>
                      )}
                      {viewingBuyerProject.net_neutral_target_year && (
                        <div>
                          <p className="text-xs font-medium text-slate-500">Net Neutral Target</p>
                          <p className="mt-1 text-sm text-slate-900">{viewingBuyerProject.net_neutral_target_year}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setViewingBuyerProject(null)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    setViewingBuyerProject(null);
                    handleEdit(e as unknown as React.MouseEvent<HTMLButtonElement>, viewingBuyerProject);
                  }}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Seller Project Summary Modal (read-only) */}
      {viewingSellerProject && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 p-4">
          <div
            className="absolute inset-0"
            role="presentation"
            onClick={() => setViewingSellerProject(null)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 py-2 sm:py-4">
              <h2 className="text-lg sm:text-xl font-semibold text-slate-900 truncate pr-4">{viewingSellerProject.name}</h2>
              <button
                type="button"
                onClick={() => setViewingSellerProject(null)}
                className="text-slate-400 hover:text-slate-600 text-xl flex-shrink-0"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="p-4 sm:p-6">
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">Load Project / Offer Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-slate-500">Technology</p>
                      <p className="mt-1 text-sm text-slate-900">{viewingSellerProject.generation_type}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Location</p>
                      <p className="mt-1 text-sm text-slate-900">{viewingSellerProject.location || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">ISO</p>
                      <p className="mt-1 text-sm text-slate-900">{viewingSellerProject.iso || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Zone</p>
                      <p className="mt-1 text-sm text-slate-900">{viewingSellerProject.zone || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Capacity</p>
                      <p className="mt-1 text-sm text-slate-900">{viewingSellerProject.capacity_mw} MW</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Status</p>
                      <p className="mt-1 text-sm text-slate-900 capitalize">{viewingSellerProject.status}</p>
                    </div>
                    {viewingSellerProject.created_at && (
                      <div>
                        <p className="text-xs font-medium text-slate-500">Created</p>
                        <p className="mt-1 text-sm text-slate-900">{new Date(viewingSellerProject.created_at).toLocaleDateString()}</p>
                      </div>
                    )}
                    {!!(viewingSellerProject.metadata as Record<string, unknown>)?.description && (
                      <div className="col-span-2">
                        <p className="text-xs font-medium text-slate-500">Description</p>
                        <p className="mt-1 text-sm text-slate-900">{String((viewingSellerProject.metadata as Record<string, unknown>).description)}</p>
                      </div>
                    )}
                  </div>
                </div>

                {(viewingSellerProject.fixed_price_per_mwh || viewingSellerProject.eac_price_per_mwh || viewingSellerProject.annual_escalator_percent) && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">VPPA Pricing</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {viewingSellerProject.fixed_price_per_mwh != null && (
                        <div>
                          <p className="text-xs font-medium text-slate-500">Fixed Price</p>
                          <p className="mt-1 text-sm text-slate-900">
                            ${viewingSellerProject.fixed_price_per_mwh}/MWh ({viewingSellerProject.price_currency || 'USD'})
                          </p>
                        </div>
                      )}
                      {viewingSellerProject.eac_price_per_mwh != null && (
                        <div>
                          <p className="text-xs font-medium text-slate-500">EAC Price</p>
                          <p className="mt-1 text-sm text-slate-900">${viewingSellerProject.eac_price_per_mwh}/MWh</p>
                        </div>
                      )}
                      {viewingSellerProject.annual_escalator_percent != null && (
                        <div>
                          <p className="text-xs font-medium text-slate-500">Annual Escalator</p>
                          <p className="mt-1 text-sm text-slate-900">{viewingSellerProject.annual_escalator_percent}%</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(viewingSellerProject.expected_cod || viewingSellerProject.guaranteed_cod || viewingSellerProject.delivery_term_years) && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Timeline</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {viewingSellerProject.expected_cod && (
                        <div>
                          <p className="text-xs font-medium text-slate-500">Expected COD</p>
                          <p className="mt-1 text-sm text-slate-900">{new Date(viewingSellerProject.expected_cod).toLocaleDateString()}</p>
                        </div>
                      )}
                      {viewingSellerProject.guaranteed_cod && (
                        <div>
                          <p className="text-xs font-medium text-slate-500">Guaranteed COD</p>
                          <p className="mt-1 text-sm text-slate-900">{new Date(viewingSellerProject.guaranteed_cod).toLocaleDateString()}</p>
                        </div>
                      )}
                      {viewingSellerProject.delivery_term_years && (
                        <div>
                          <p className="text-xs font-medium text-slate-500">Delivery Term</p>
                          <p className="mt-1 text-sm text-slate-900">{viewingSellerProject.delivery_term_years} years</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(viewingSellerProject.guaranteed_availability_year1_percent || viewingSellerProject.guaranteed_availability_ongoing_percent) && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Availability</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {viewingSellerProject.guaranteed_availability_year1_percent != null && (
                        <div>
                          <p className="text-xs font-medium text-slate-500">Year 1 Availability</p>
                          <p className="mt-1 text-sm text-slate-900">{viewingSellerProject.guaranteed_availability_year1_percent}%</p>
                        </div>
                      )}
                      {viewingSellerProject.guaranteed_availability_ongoing_percent != null && (
                        <div>
                          <p className="text-xs font-medium text-slate-500">Ongoing Availability</p>
                          <p className="mt-1 text-sm text-slate-900">{viewingSellerProject.guaranteed_availability_ongoing_percent}%</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(viewingSellerProject.eac_scheme || viewingSellerProject.settlement_point || viewingSellerProject.connection_point) && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Settlement & Environmental</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {viewingSellerProject.eac_scheme && (
                        <div>
                          <p className="text-xs font-medium text-slate-500">EAC Scheme</p>
                          <p className="mt-1 text-sm text-slate-900">{viewingSellerProject.eac_scheme}</p>
                        </div>
                      )}
                      {viewingSellerProject.settlement_point && (
                        <div>
                          <p className="text-xs font-medium text-slate-500">Settlement Point</p>
                          <p className="mt-1 text-sm text-slate-900">{viewingSellerProject.settlement_point}</p>
                        </div>
                      )}
                      {viewingSellerProject.connection_point && (
                        <div>
                          <p className="text-xs font-medium text-slate-500">Connection Point</p>
                          <p className="mt-1 text-sm text-slate-900">{viewingSellerProject.connection_point}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setViewingSellerProject(null)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    setViewingSellerProject(null);
                    handleEditSeller(e as unknown as React.MouseEvent<HTMLButtonElement>, viewingSellerProject);
                  }}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
