import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import transactionRoutes from './routes/transactions.js';
import documentRoutes from './routes/documents.js';
import technicalDocumentRoutes from './routes/technicalDocuments.js';
import powerPlanRoutes from './routes/powerPlans.js';
import exampleDocumentRoutes from './routes/exampleDocuments.js';
import { errorHandler } from './middleware/errorHandler.js';
import clientErrorLogger from './middleware/clientErrorLogger.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS: restrict to an explicit allowlist. Set CORS_ALLOWED_ORIGINS to a
// comma-separated list of origins (e.g. "https://app.example.com").
// Falls back to common local dev origins when unset.
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ||
  'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow same-origin / non-browser requests (no Origin header).
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Power Dime API is running' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/technical-documents', technicalDocumentRoutes);
app.use('/api/power-plans', powerPlanRoutes);
app.use('/api/example-documents', exampleDocumentRoutes);

// ==========================================
// Optional: Client Error Reporting
// To disable, comment out this line or set ENABLE_CLIENT_ERROR_LOGGING=false
// ==========================================
app.post('/api/client-errors', clientErrorLogger.middleware());

// Error handling middleware (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
