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
import { API_BASE_URL, apiRequest, buildFormData, buildQueryString } from './http';

export { API_BASE_URL };

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
): Promise<Record<string, unknown>> =>
  apiRequest('/documents/upload', 'Failed to upload documents', {
    method: 'POST',
    body: buildFormData(files, {
      document_type: documentType,
      transaction_id: transactionId,
    }),
  });

/**
 * Upload technical documents to the API
 * @param files - Array of File objects to upload
 * @param projectId - Optional project ID
 * @returns Promise with upload response
 */
export const uploadTechnicalDocuments = async (
  files: File[],
  projectId?: string
): Promise<Record<string, unknown>> =>
  apiRequest('/technical-documents/upload', 'Failed to upload technical documents', {
    method: 'POST',
    body: buildFormData(files, { project_id: projectId }),
  });

/**
 * Upload power plan files to the API
 * @param files - Array of File objects to upload
 * @param planType - Type of plan (historical, forecast, custom)
 * @returns Promise with upload response
 */
export const uploadPowerPlans = async (
  files: File[],
  planType: string = 'historical'
): Promise<Record<string, unknown>> =>
  apiRequest('/power-plans/upload', 'Failed to upload power plans', {
    method: 'POST',
    body: buildFormData(files, { plan_type: planType }),
  });

/**
 * Get download URL for a document
 * @param documentId - Document ID
 * @returns Promise with document data including download URL
 */
export const getDocumentDownloadUrl = async (documentId: string): Promise<Record<string, unknown>> =>
  apiRequest(`/documents/${documentId}`, 'Failed to retrieve document');

/**
 * Get download URL for a technical document
 * @param documentId - Technical document ID
 * @returns Promise with document data including download URL
 */
export const getTechnicalDocumentDownloadUrl = async (documentId: string): Promise<Record<string, unknown>> =>
  apiRequest(`/technical-documents/${documentId}`, 'Failed to retrieve document');

/**
 * Get download URL for a power plan
 * @param planId - Power plan ID
 * @returns Promise with plan data including download URL
 */
export const getPowerPlanDownloadUrl = async (planId: string): Promise<Record<string, unknown>> =>
  apiRequest(`/power-plans/${planId}`, 'Failed to retrieve power plan');

/**
 * Delete a document
 * @param documentId - Document ID
 */
export const deleteDocument = async (documentId: string): Promise<void> => {
  await apiRequest(`/documents/${documentId}`, 'Failed to delete document', { method: 'DELETE' });
};

/**
 * Delete a technical document
 * @param documentId - Technical document ID
 */
export const deleteTechnicalDocument = async (documentId: string): Promise<void> => {
  await apiRequest(`/technical-documents/${documentId}`, 'Failed to delete document', { method: 'DELETE' });
};

/**
 * Delete a power plan
 * @param planId - Power plan ID
 */
export const deletePowerPlan = async (planId: string): Promise<void> => {
  await apiRequest(`/power-plans/${planId}`, 'Failed to delete power plan', { method: 'DELETE' });
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

  return apiRequest('/power-plans/upload', 'Failed to upload buyer documents', {
    method: 'POST',
    body: buildFormData(files, {
      facility_type,
      document_category,
      plan_type,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    }),
  });
};

/**
 * Submit greenfield equipment form (no file upload)
 * @param formData - Greenfield form data
 * @returns Promise with submission response
 */
export const submitGreenfieldForm = async (formData: GreenfieldFormData): Promise<Record<string, unknown>> =>
  apiRequest('/power-plans/greenfield-form', 'Failed to submit greenfield form', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData),
  });

/**
 * Upload seller documents (carbon-free/utility)
 * @param params - Upload parameters including seller_type, technology_type, files, and metadata
 * @returns Promise with upload response
 */
export const uploadSellerDocument = async (params: SellerUploadParams): Promise<Record<string, unknown>> => {
  const { files, seller_type, technology_type, contract_type, project_id, metadata } = params;

  return apiRequest('/technical-documents/upload', 'Failed to upload seller documents', {
    method: 'POST',
    body: buildFormData(files, {
      seller_type,
      technology_type: seller_type === 'carbon_free' ? technology_type : undefined,
      contract_type: seller_type === 'utility' ? contract_type : undefined,
      project_id,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    }),
  });
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
  const query = buildQueryString({
    facility_type: facilityType,
    seller_type: sellerType,
    category,
  });

  return apiRequest(`/example-documents${query}`, 'Failed to retrieve example documents');
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
  const query = buildQueryString({
    plan_type: filters?.plan_type,
    facility_type: filters?.facility_type,
    document_category: filters?.document_category,
  });

  return apiRequest(`/power-plans${query}`, 'Failed to retrieve power plans');
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
  const query = buildQueryString({
    project_id: filters?.project_id,
    file_type: filters?.file_type,
    seller_type: filters?.seller_type,
    technology_type: filters?.technology_type,
  });

  return apiRequest(`/technical-documents${query}`, 'Failed to retrieve technical documents');
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
}> => apiRequest('/projects/my-projects', 'Failed to retrieve your projects');
