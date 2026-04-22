import { useState } from 'react';
import {
    DocumentTextIcon,
    CloudArrowUpIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
    ArrowPathIcon,
    EyeIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    SparklesIcon
} from '@heroicons/react/24/outline';
// Document processing status (local type for this component)
type DocProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Document types that can be processed
export type DocumentType = 'ppa_contract' | 'rfp_term_sheet' | 'technical_specs' | 'financial_model' | 'other';

interface ExtractedField {
    field_name: string;
    display_name: string;
    value: string | number | boolean | null;
    confidence: number; // 0-1
    source_page?: number;
    source_text?: string;
}

interface ExtractedData {
    document_type: DocumentType;
    extracted_at: string;
    fields: ExtractedField[];
    summary?: string;
}

interface DocumentProcessorProps {
    projectId: string;
    projectType: 'seller' | 'buyer';
    onDataExtracted?: (data: ExtractedData) => void;
    onApplyExtractedData?: (data: ExtractedData) => void;
}

interface ProcessingDocument {
    id: string;
    filename: string;
    file_type: string;
    size_bytes: number;
    upload_status: 'uploading' | 'uploaded' | 'failed';
    processing_status: DocProcessingStatus;
    document_type?: DocumentType;
    extracted_data?: ExtractedData;
    error_message?: string;
    created_at: string;
}

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
    ppa_contract: 'PPA/VPPA Contract',
    rfp_term_sheet: 'RFP Term Sheet',
    technical_specs: 'Technical Specifications',
    financial_model: 'Financial Model',
    other: 'Other Document'
};

const STATUS_CONFIG: Record<DocProcessingStatus, { color: string; bgColor: string; icon: typeof CheckCircleIcon; label: string }> = {
    pending: { color: 'text-gray-600', bgColor: 'bg-gray-100', icon: DocumentTextIcon, label: 'Pending' },
    processing: { color: 'text-blue-600', bgColor: 'bg-blue-100', icon: ArrowPathIcon, label: 'Processing' },
    completed: { color: 'text-green-600', bgColor: 'bg-green-100', icon: CheckCircleIcon, label: 'Completed' },
    failed: { color: 'text-red-600', bgColor: 'bg-red-100', icon: ExclamationCircleIcon, label: 'Failed' }
};

export default function DocumentProcessor({
    projectId: _projectId,
    projectType: _projectType,
    onDataExtracted,
    onApplyExtractedData
}: DocumentProcessorProps) {
    // Note: _projectId and _projectType will be used for API calls in production
    void _projectId;
    void _projectType;
    const [documents, setDocuments] = useState<ProcessingDocument[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
    const [selectedDocType, setSelectedDocType] = useState<DocumentType>('ppa_contract');

    // Handle file drop
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        
        const files = Array.from(e.dataTransfer.files);
        handleFiles(files);
    };

    // Handle file selection
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            handleFiles(files);
        }
    };

    // Process uploaded files
    const handleFiles = async (files: File[]) => {
        for (const file of files) {
            // Create document entry
            const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const newDoc: ProcessingDocument = {
                id: docId,
                filename: file.name,
                file_type: file.type || 'application/octet-stream',
                size_bytes: file.size,
                upload_status: 'uploading',
                processing_status: 'pending',
                document_type: selectedDocType,
                created_at: new Date().toISOString()
            };
            
            setDocuments(prev => [newDoc, ...prev]);
            
            // Simulate upload (in real app, this would be an API call)
            setTimeout(() => {
                setDocuments(prev => prev.map(d => 
                    d.id === docId ? { ...d, upload_status: 'uploaded' as const, processing_status: 'processing' as const } : d
                ));
                
                // Simulate processing
                simulateProcessing(docId, file.name, selectedDocType);
            }, 1000);
        }
    };

    // Simulate document processing (in real app, this would poll an API)
    const simulateProcessing = (docId: string, filename: string, docType: DocumentType) => {
        setTimeout(() => {
            const extractedData = generateMockExtractedData(docType, filename);
            
            setDocuments(prev => prev.map(d => 
                d.id === docId ? { 
                    ...d, 
                    processing_status: 'completed' as const,
                    extracted_data: extractedData
                } : d
            ));
            
            if (onDataExtracted) {
                onDataExtracted(extractedData);
            }
        }, 3000 + Math.random() * 2000); // 3-5 seconds
    };

    // Generate mock extracted data based on document type
    const generateMockExtractedData = (docType: DocumentType, filename: string): ExtractedData => {
        const baseFields: ExtractedField[] = [];
        
        if (docType === 'ppa_contract') {
            baseFields.push(
                { field_name: 'project_name', display_name: 'Project Name', value: 'Solar Farm Alpha', confidence: 0.95, source_page: 1 },
                { field_name: 'capacity_mw', display_name: 'Capacity (MW)', value: 150, confidence: 0.98, source_page: 2 },
                { field_name: 'fixed_price_per_mwh', display_name: 'Fixed Price ($/MWh)', value: 45.50, confidence: 0.92, source_page: 3 },
                { field_name: 'eac_price_per_mwh', display_name: 'EAC Price ($/MWh)', value: 5.00, confidence: 0.88, source_page: 3 },
                { field_name: 'delivery_term_years', display_name: 'Delivery Term', value: 15, confidence: 0.99, source_page: 2 },
                { field_name: 'guaranteed_cod', display_name: 'Guaranteed COD', value: '2027-06-01', confidence: 0.94, source_page: 4 },
                { field_name: 'annual_escalator_percent', display_name: 'Annual Escalator (%)', value: 2.0, confidence: 0.91, source_page: 3 },
                { field_name: 'settlement_point', display_name: 'Settlement Point', value: 'PJM - PECO Zone', confidence: 0.87, source_page: 5 },
                { field_name: 'eac_scheme', display_name: 'EAC Scheme', value: 'REC', confidence: 0.93, source_page: 6 }
            );
        } else if (docType === 'rfp_term_sheet') {
            baseFields.push(
                { field_name: 'buyer_name', display_name: 'Buyer Name', value: 'TechCorp Inc.', confidence: 0.96, source_page: 1 },
                { field_name: 'target_capacity_mw', display_name: 'Target Capacity (MW)', value: 100, confidence: 0.94, source_page: 1 },
                { field_name: 'target_annual_quantity_mwh', display_name: 'Target Annual Quantity (MWh)', value: 250000, confidence: 0.89, source_page: 2 },
                { field_name: 'preferred_term_years', display_name: 'Preferred Term', value: 15, confidence: 0.97, source_page: 2 },
                { field_name: 'max_fixed_price_per_mwh', display_name: 'Max Price ($/MWh)', value: 50.00, confidence: 0.85, source_page: 3 },
                { field_name: 'target_cod', display_name: 'Target COD', value: '2026-12-31', confidence: 0.91, source_page: 2 },
                { field_name: 'preferred_settlement_type', display_name: 'Settlement Type', value: 'financial', confidence: 0.88, source_page: 4 },
                { field_name: 'renewable_percentage_target', display_name: 'Renewable Target (%)', value: 100, confidence: 0.99, source_page: 1 }
            );
        } else if (docType === 'technical_specs') {
            baseFields.push(
                { field_name: 'technology_type', display_name: 'Technology', value: 'Solar PV', confidence: 0.99, source_page: 1 },
                { field_name: 'panel_manufacturer', display_name: 'Panel Manufacturer', value: 'First Solar', confidence: 0.92, source_page: 3 },
                { field_name: 'inverter_type', display_name: 'Inverter Type', value: 'String Inverter', confidence: 0.90, source_page: 4 },
                { field_name: 'dc_ac_ratio', display_name: 'DC/AC Ratio', value: 1.3, confidence: 0.88, source_page: 5 },
                { field_name: 'degradation_rate', display_name: 'Annual Degradation (%)', value: 0.5, confidence: 0.85, source_page: 6 }
            );
        } else {
            baseFields.push(
                { field_name: 'document_title', display_name: 'Document Title', value: filename, confidence: 0.99, source_page: 1 },
                { field_name: 'document_date', display_name: 'Document Date', value: new Date().toISOString().split('T')[0], confidence: 0.80, source_page: 1 }
            );
        }
        
        return {
            document_type: docType,
            extracted_at: new Date().toISOString(),
            fields: baseFields,
            summary: `Successfully extracted ${baseFields.length} fields from ${filename}`
        };
    };

    // Format file size
    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    // Get confidence color
    const getConfidenceColor = (confidence: number) => {
        if (confidence >= 0.9) return 'text-green-600 bg-green-50';
        if (confidence >= 0.7) return 'text-yellow-600 bg-yellow-50';
        return 'text-red-600 bg-red-50';
    };

    return (
        <div className="space-y-4">
            {/* Document Type Selector */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Document Type
                </label>
                <select
                    value={selectedDocType}
                    onChange={(e) => setSelectedDocType(e.target.value as DocumentType)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                >
                    {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                    ))}
                </select>
            </div>

            {/* Upload Zone */}
            <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`
                    border-2 border-dashed rounded-lg p-8 text-center transition-colors
                    ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-gray-400'}
                `}
            >
                <CloudArrowUpIcon className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                <p className="text-sm text-gray-600 mb-2">
                    Drag and drop your document here, or{' '}
                    <label className="text-indigo-600 hover:text-indigo-800 cursor-pointer font-medium">
                        browse
                        <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.doc,.docx,.xlsx,.xls"
                            onChange={handleFileSelect}
                            multiple
                        />
                    </label>
                </p>
                <p className="text-xs text-gray-500">
                    Supported: PDF, Word, Excel (max 25MB)
                </p>
            </div>

            {/* Document List */}
            {documents.length > 0 && (
                <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-gray-900">Uploaded Documents</h4>
                    
                    {documents.map((doc) => {
                        const statusConfig = STATUS_CONFIG[doc.processing_status];
                        const StatusIcon = statusConfig.icon;
                        const isExpanded = expandedDoc === doc.id;
                        
                        return (
                            <div key={doc.id} className="border rounded-lg overflow-hidden">
                                {/* Document Header */}
                                <div className="p-3 bg-white flex items-center justify-between">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <DocumentTextIcon className="h-8 w-8 text-gray-400 flex-shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-gray-900 truncate">
                                                {doc.filename}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {formatFileSize(doc.size_bytes)} • {doc.document_type && DOCUMENT_TYPE_LABELS[doc.document_type]}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        {/* Status Badge */}
                                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
                                            <StatusIcon className={`h-3.5 w-3.5 ${doc.processing_status === 'processing' ? 'animate-spin' : ''}`} />
                                            {statusConfig.label}
                                        </span>
                                        
                                        {/* Expand/Collapse for completed docs */}
                                        {doc.processing_status === 'completed' && doc.extracted_data && (
                                            <button
                                                type="button"
                                                onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}
                                                className="p-1 text-gray-400 hover:text-gray-600"
                                            >
                                                {isExpanded ? (
                                                    <ChevronUpIcon className="h-5 w-5" />
                                                ) : (
                                                    <ChevronDownIcon className="h-5 w-5" />
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                
                                {/* Extracted Data Panel */}
                                {isExpanded && doc.extracted_data && (
                                    <div className="border-t bg-gray-50 p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <SparklesIcon className="h-5 w-5 text-indigo-600" />
                                                <span className="text-sm font-semibold text-gray-900">
                                                    Extracted Data
                                                </span>
                                            </div>
                                            {onApplyExtractedData && (
                                                <button
                                                    type="button"
                                                    onClick={() => onApplyExtractedData(doc.extracted_data!)}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-xs font-medium"
                                                >
                                                    <EyeIcon className="h-4 w-4" />
                                                    Apply to Form
                                                </button>
                                            )}
                                        </div>
                                        
                                        {/* Summary */}
                                        {doc.extracted_data.summary && (
                                            <p className="text-sm text-gray-600 mb-3 italic">
                                                {doc.extracted_data.summary}
                                            </p>
                                        )}
                                        
                                        {/* Extracted Fields Table */}
                                        <div className="bg-white rounded-lg border overflow-hidden">
                                            <table className="min-w-full divide-y divide-gray-200">
                                                <thead className="bg-gray-100">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                                            Field
                                                        </th>
                                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                                            Extracted Value
                                                        </th>
                                                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                                                            Confidence
                                                        </th>
                                                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                                                            Page
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200">
                                                    {doc.extracted_data.fields.map((field, idx) => (
                                                        <tr key={idx} className="hover:bg-gray-50">
                                                            <td className="px-3 py-2 text-sm text-gray-700">
                                                                {field.display_name}
                                                            </td>
                                                            <td className="px-3 py-2 text-sm font-medium text-gray-900">
                                                                {String(field.value)}
                                                            </td>
                                                            <td className="px-3 py-2 text-center">
                                                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getConfidenceColor(field.confidence)}`}>
                                                                    {Math.round(field.confidence * 100)}%
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2 text-center text-sm text-gray-500">
                                                                {field.source_page || '-'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                                
                                {/* Error Message */}
                                {doc.processing_status === 'failed' && doc.error_message && (
                                    <div className="border-t bg-red-50 p-3">
                                        <p className="text-sm text-red-700">
                                            {doc.error_message}
                                        </p>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Empty State */}
            {documents.length === 0 && (
                <div className="text-center py-6 text-gray-500">
                    <DocumentTextIcon className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No documents uploaded yet</p>
                    <p className="text-xs mt-1">Upload PPA contracts or RFP documents to auto-extract key terms</p>
                </div>
            )}
        </div>
    );
}
