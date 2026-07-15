import { MulterError } from 'multer';

// Map Multer error codes to client-facing HTTP statuses and messages so upload
// failures surface as actionable 4xx responses instead of a generic 500.
const MULTER_ERROR_STATUS = {
  LIMIT_FILE_SIZE: { status: 413, message: 'Uploaded file exceeds the maximum allowed size' },
  LIMIT_FILE_COUNT: { status: 400, message: 'Too many files uploaded' },
  LIMIT_UNEXPECTED_FILE: { status: 400, message: 'Unexpected file field in upload' },
};

export const errorHandler = (err, req, res, next) => {
  // If headers were already sent, delegate to the default Express handler
  // so we don't attempt to write a second response.
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof MulterError) {
    const mapped = MULTER_ERROR_STATUS[err.code] || { status: 400, message: err.message };
    console.error('Upload error:', err);
    return res.status(mapped.status).json({ error: mapped.message });
  }

  console.error('Error:', err);

  // Support both `statusCode` and `status` conventions used by various libraries.
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
