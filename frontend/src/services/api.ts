import { supabase } from './supabase';
import type {
  BuyerUploadParams,
  SellerUploadParams,
  GreenfieldFormData,
  ExampleDocument,
  PowerPlan,
  TechnicalDocument,
  FacilityType,
  BuyerDocumentCategory,
  SellerType,
  TechnologyType,
} from '../types';

export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Get auth token from Supabase session
 */
const getAuthToken = async (): Promise<string | null> => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Failed to retrieve auth session:', error);
      return null;
    }
    return session?.access_token || null;
  } catch (error) {
    console.error('Unexpected error retrieving auth session:', error);
    return null;
  }
};

/**
 * Upload files to the documents API
 * @param files - Array of File objects to upload
 * @param documentType - Type of document (ppa, nda, exclusivity, technical, other)
 * @param transactionId - Optional transaction ID
 * @returns Promise with upload response
 */
export const uploadDocuments = async (
  files: File[],
  documentType: string = 'other',
  transactionId?: string
): Promise<Record<string, unknown>> => {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append('files', file);
  });

  formData.append('document_type', documentType);
  if (transactionId) {
    formData.append('transaction_id', transactionId);
  }

  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/documents/upload`, {
    method: 'POST',
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Failed to upload documents');
  }

  return response.json();
};

/**
 * Upload technical documents to the API
 * @param files - Array of File objects to upload
 * @param projectId - Optional project ID
 * @returns Promise with upload response
 */
export const uploadTechnicalDocuments = async (
  files: File[],
  projectId?: string
): Promise<Record<string, unknown>> => {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append('files', file);
  });

  if (projectId) {
    formData.append('project_id', projectId);
  }

  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/technical-documents/upload`, {
    method: 'POST',
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Failed to upload technical documents');
  }

  return response.json();
};

/**
 * Upload power plan files to the API
 * @param files - Array of File objects to upload
 * @param planType - Type of plan (historical, forecast, custom)
 * @returns Promise with upload response
 */
export const uploadPowerPlans = async (
  files: File[],
  planType: string = 'historical'
): Promise<Record<string, unknown>> => {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append('files', file);
  });

  formData.append('plan_type', planType);

  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/power-plans/upload`, {
    method: 'POST',
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Failed to upload power plans');
  }

  return response.json();
};

/**
 * Get download URL for a document
 * @param documentId - Document ID
 * @returns Promise with document data including download URL
 */
export const getDocumentDownloadUrl = async (documentId: string): Promise<Record<string, unknown>> => {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/documents/${documentId}`, {
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to get document' }));
    throw new Error(error.error || 'Failed to retrieve document');
  }

  return response.json();
};

/**
 * Get download URL for a technical document
 * @param documentId - Technical document ID
 * @returns Promise with document data including download URL
 */
export const getTechnicalDocumentDownloadUrl = async (documentId: string): Promise<Record<string, unknown>> => {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/technical-documents/${documentId}`, {
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to get document' }));
    throw new Error(error.error || 'Failed to retrieve document');
  }

  return response.json();
};

/**
 * Get download URL for a power plan
 * @param planId - Power plan ID
 * @returns Promise with plan data including download URL
 */
export const getPowerPlanDownloadUrl = async (planId: string): Promise<Record<string, unknown>> => {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/power-plans/${planId}`, {
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to get power plan' }));
    throw new Error(error.error || 'Failed to retrieve power plan');
  }

  return response.json();
};

/**
 * Delete a document
 * @param documentId - Document ID
 */
export const deleteDocument = async (documentId: string): Promise<void> => {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/documents/${documentId}`, {
    method: 'DELETE',
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete document' }));
    throw new Error(error.error || 'Failed to delete document');
  }
};

/**
 * Delete a technical document
 * @param documentId - Technical document ID
 */
export const deleteTechnicalDocument = async (documentId: string): Promise<void> => {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/technical-documents/${documentId}`, {
    method: 'DELETE',
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete document' }));
    throw new Error(error.error || 'Failed to delete document');
  }
};

/**
 * Delete a power plan
 * @param planId - Power plan ID
 */
export const deletePowerPlan = async (planId: string): Promise<void> => {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/power-plans/${planId}`, {
    method: 'DELETE',
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete power plan' }));
    throw new Error(error.error || 'Failed to delete power plan');
  }
};

// ============================================================================
// Enhanced Upload APIs for Buyer/Seller Workflows
// ============================================================================

/**
 * Upload buyer documents (brownfield/greenfield)
 * @param params - Upload parameters including facility_type, document_category, files, and metadata
 * @returns Promise with upload response
 */
export const uploadBuyerDocument = async (params: BuyerUploadParams): Promise<Record<string, unknown>> => {
  const { files, facility_type, document_category, plan_type = 'historical', metadata } = params;

  const formData = new FormData();

  files.forEach((file) => {
    formData.append('files', file);
  });

  formData.append('facility_type', facility_type);
  formData.append('document_category', document_category);
  formData.append('plan_type', plan_type);

  if (metadata) {
    formData.append('metadata', JSON.stringify(metadata));
  }

  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/power-plans/upload`, {
    method: 'POST',
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Failed to upload buyer documents');
  }

  return response.json();
};

/**
 * Submit greenfield equipment form (no file upload)
 * @param formData - Greenfield form data
 * @returns Promise with submission response
 */
export const submitGreenfieldForm = async (formData: GreenfieldFormData): Promise<Record<string, unknown>> => {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/power-plans/greenfield-form`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(formData),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Submission failed' }));
    throw new Error(error.error || 'Failed to submit greenfield form');
  }

  return response.json();
};

/**
 * Upload seller documents (carbon-free/utility)
 * @param params - Upload parameters including seller_type, technology_type, files, and metadata
 * @returns Promise with upload response
 */
export const uploadSellerDocument = async (params: SellerUploadParams): Promise<Record<string, unknown>> => {
  const { files, seller_type, technology_type, contract_type, project_id, metadata } = params;

  const formData = new FormData();

  files.forEach((file) => {
    formData.append('files', file);
  });

  formData.append('seller_type', seller_type);

  if (seller_type === 'carbon_free' && technology_type) {
    formData.append('technology_type', technology_type);
  }

  if (seller_type === 'utility' && contract_type) {
    formData.append('contract_type', contract_type);
  }

  if (project_id) {
    formData.append('project_id', project_id);
  }

  if (metadata) {
    formData.append('metadata', JSON.stringify(metadata));
  }

  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/technical-documents/upload`, {
    method: 'POST',
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Failed to upload seller documents');
  }

  return response.json();
};

/**
 * Get example documents
 * @param category - Optional specific category to fetch
 * @param facilityType - Optional facility type filter (for buyers)
 * @param sellerType - Optional seller type filter (for sellers)
 * @returns Promise with example documents
 */
export const getExampleDocuments = async (
  category?: string,
  facilityType?: FacilityType,
  sellerType?: SellerType
): Promise<{ examples?: Record<string, ExampleDocument>; example?: ExampleDocument }> => {
  const token = await getAuthToken();

  const params = new URLSearchParams();
  if (facilityType) params.append('facility_type', facilityType);
  if (sellerType) params.append('seller_type', sellerType);
  if (category) params.append('category', category);

  const url = `${API_BASE_URL}/example-documents${params.toString() ? `?${params.toString()}` : ''}`;

  const response = await fetch(url, {
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch examples' }));
    throw new Error(error.error || 'Failed to retrieve example documents');
  }

  return response.json();
};

/**
 * Get power plans with filters
 * @param filters - Optional filters for plan_type, facility_type, document_category
 * @returns Promise with power plans list
 */
export const getPowerPlans = async (filters?: {
  plan_type?: string;
  facility_type?: FacilityType;
  document_category?: BuyerDocumentCategory;
}): Promise<{ plans: PowerPlan[] }> => {
  const token = await getAuthToken();

  const params = new URLSearchParams();
  if (filters?.plan_type) params.append('plan_type', filters.plan_type);
  if (filters?.facility_type) params.append('facility_type', filters.facility_type);
  if (filters?.document_category) params.append('document_category', filters.document_category);

  const url = `${API_BASE_URL}/power-plans${params.toString() ? `?${params.toString()}` : ''}`;

  const response = await fetch(url, {
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch power plans' }));
    throw new Error(error.error || 'Failed to retrieve power plans');
  }

  return response.json();
};

/**
 * Get technical documents with filters
 * @param filters - Optional filters for project_id, seller_type, technology_type
 * @returns Promise with technical documents list
 */
export const getTechnicalDocuments = async (filters?: {
  project_id?: string;
  file_type?: string;
  seller_type?: SellerType;
  technology_type?: TechnologyType;
}): Promise<{ documents: TechnicalDocument[] }> => {
  const token = await getAuthToken();

  const params = new URLSearchParams();
  if (filters?.project_id) params.append('project_id', filters.project_id);
  if (filters?.file_type) params.append('file_type', filters.file_type);
  if (filters?.seller_type) params.append('seller_type', filters.seller_type);
  if (filters?.technology_type) params.append('technology_type', filters.technology_type);

  const url = `${API_BASE_URL}/technical-documents${params.toString() ? `?${params.toString()}` : ''}`;

  const response = await fetch(url, {
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch documents' }));
    throw new Error(error.error || 'Failed to retrieve technical documents');
  }

  return response.json();
};

// ============================================================================
// Project APIs
// ============================================================================

/**
 * Get seller's own projects
 * @returns Promise with seller's projects
 */
export const getMyProjects = async (): Promise<{
  projects: Array<{
    id: string;
    name: string;
    generation_type: string;
    capacity_mw: number;
    status: string;
  }>
}> => {
  const token = await getAuthToken();
  console.log('API: getMyProjects called');
  console.log('API: Token exists?', !!token);
  console.log('API: URL:', `${API_BASE_URL}/projects/my-projects`);

  const response = await fetch(`${API_BASE_URL}/projects/my-projects`, {
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  console.log('API: Response status:', response.status);
  console.log('API: Response ok?', response.ok);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch projects' }));
    console.error('API: Error response:', error);
    throw new Error(error.error || 'Failed to retrieve your projects');
  }

  const data = await response.json();
  console.log('API: Response data:', data);
  return data;
};
