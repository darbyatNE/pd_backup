import './loadEnv.js';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import transactionRoutes from './routes/transactions.js';
import documentRoutes from './routes/documents.js';
import technicalDocumentRoutes from './routes/technicalDocuments.js';
import powerPlanRoutes from './routes/powerPlans.js';
import exampleDocumentRoutes from './routes/exampleDocuments.js';
import onBoardingRoutes from './routes/onBoarding.js';
import datacenterRoutes from './routes/datacenters.js';
import facilitiesRoutes from './routes/facilities.js';
import datacentersForecastRoutes from './routes/datacentersForecast.js';

import { errorHandler } from './middleware/errorHandler.js';
import clientErrorLogger from './middleware/clientErrorLogger.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Debug: log every raw HTTP request before any middleware touches it
app.use((req, _res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url} — body-type: ${req.headers['content-type'] || 'none'}`);
  next();
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));

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
app.use('/api/onboarding', onBoardingRoutes);
app.use('/api/datacenters', datacenterRoutes);
app.use('/api/facilities', facilitiesRoutes);
app.use('/api/datacenters-forecast', datacentersForecastRoutes);

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
