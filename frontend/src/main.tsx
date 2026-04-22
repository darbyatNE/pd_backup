import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { setupErrorReporting } from './utils/errorReporter'

// ==========================================
// Optional: Error Reporting
// To disable, comment out this line or set VITE_ENABLE_ERROR_REPORTING=false
// ==========================================
setupErrorReporting()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
