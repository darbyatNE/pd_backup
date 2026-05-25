import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ScopeProvider } from './contexts/ScopeContext';
import { DashboardViewProvider } from './contexts/DashboardViewContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Transactions from './pages/Transactions';
import Documents from './pages/Documents';
import Onboarding from './pages/Onboarding';
import Forecast from './pages/Forecast';
import Planning from './pages/Planning';
import MapPage from './pages/Map';
import JamMetadata from './components/JamMetadata';

function App() {
  return (
    <AuthProvider>
      <ScopeProvider>
      <DashboardViewProvider>
      <JamMetadata />
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute fullWidth>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects"
            element={
              <ProtectedRoute>
                <Projects />
              </ProtectedRoute>
            }
          />
          <Route
            path="/transactions"
            element={
              <ProtectedRoute>
                <Transactions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/documents"
            element={
              <ProtectedRoute>
                <Documents />
              </ProtectedRoute>
            }
          />
          <Route
            path="/onboarding"
            element={<Onboarding />}
          />
          <Route
            path="/forecast"
            element={
              <ProtectedRoute>
                <Forecast />
              </ProtectedRoute>
            }
          />
          <Route
            path="/planning"
            element={
              <ProtectedRoute>
                <Planning />
              </ProtectedRoute>
            }
          />
          <Route
            path="/map"
            element={
              <ProtectedRoute fullWidth hideFooter>
                <MapPage />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
      </DashboardViewProvider>
      </ScopeProvider>
    </AuthProvider>
  );
}

export default App;
