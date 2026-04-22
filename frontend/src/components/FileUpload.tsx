import { useCallback, useState } from 'react';

interface FileUploadProps {
  accept?: string;
  maxSizeMB?: number;
  multiple?: boolean;
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  label?: string;
  helperText?: string;
}

export default function FileUpload({
  accept = '.pdf,.csv,.tsv',
  maxSizeMB = 10,
  multiple = false,
  onFilesSelected,
  disabled = false,
  label = 'Upload Files',
  helperText,
}: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');

  const validateFile = useCallback((file: File): string | null => {
    const maxSize = maxSizeMB * 1024 * 1024;
    if (file.size > maxSize) {
      return `File "${file.name}" exceeds ${maxSizeMB}MB limit`;
    }

    const acceptedTypes = accept.split(',').map((type) => type.trim());
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();

    if (acceptedTypes.length > 0 && !acceptedTypes.includes(fileExt)) {
      return `File "${file.name}" type not allowed. Accepted: ${accept}`;
    }

    return null;
  }, [accept, maxSizeMB]);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;

      setError('');
      const files = Array.from(fileList);

      // Validate all files
      for (const file of files) {
        const validationError = validateFile(file);
        if (validationError) {
          setError(validationError);
          return;
        }
      }

      onFilesSelected(files);
    },
    [onFilesSelected, validateFile]
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (disabled) return;

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [disabled, handleFiles]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      handleFiles(e.target.files);
    },
    [disabled, handleFiles]
  );

  return (
    <div className="w-full">
      <label className="block">
        {label && (
          <span className="block text-sm font-medium text-slate-700 mb-2">
            {label}
          </span>
        )}

        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`relative rounded-lg border-2 border-dashed p-6 text-center transition-colors ${dragActive
              ? 'border-indigo-500 bg-indigo-50'
              : 'border-slate-300 bg-slate-50 hover:border-slate-400'
            } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
        >
          <input
            type="file"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            accept={accept}
            multiple={multiple}
            onChange={handleChange}
            disabled={disabled}
          />

          <div className="space-y-2">
            <div className="flex justify-center">
              <svg
                className="h-10 w-10 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>

            <div className="text-sm text-slate-600">
              <span className="font-medium text-indigo-600 hover:text-indigo-500">
                Click to upload
              </span>{' '}
              or drag and drop
            </div>

            {helperText && (
              <p className="text-xs text-slate-500">{helperText}</p>
            )}

            <p className="text-xs text-slate-400">
              {accept.split(',').map((t) => t.trim().toUpperCase()).join(', ')} (max {maxSizeMB}MB)
            </p>
          </div>
        </div>
      </label>

      {error && (
        <p className="mt-2 text-sm text-rose-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
