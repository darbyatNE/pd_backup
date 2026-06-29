import { useAuth } from '../contexts/AuthContext';
import { SkeletonDashboard } from '../components/Skeleton';
import { useDashboardView } from '../contexts/DashboardViewContext';
import Forecast from './Forecast';
import MapPage from './Map';
import Planning from './Planning';
import Profile from './Profile';
import AdminPortfolio from './AdminPortfolio';

export default function Dashboard() {
  const { view } = useDashboardView();
  const { user } = useAuth();

  if (!user) return <SkeletonDashboard />;

  return (
    <div>
      {view === 'profile' && <Profile />}

      {view === 'forecast' && <Forecast />}

      {view === 'planning' && <Planning />}

      {view === 'admin' && user.role === 'admin' && <AdminPortfolio />}

      {view === 'map' && (
        // Header = 64px nav + 40px ScopeBar = 104px; Layout py-6 top = 24px → 128px total.
        // (Map view doesn't render the sub-tab row, so no extra offset.)
        <div
          className="-mx-4 sm:-mx-6 lg:-mx-8 -mb-6"
          style={{ height: 'calc(100vh - 128px)' }}
        >
          <MapPage inline />
        </div>
      )}
    </div>
  );
}
