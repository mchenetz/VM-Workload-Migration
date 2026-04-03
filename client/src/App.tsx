import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LoadingSpinner } from './components/shared/LoadingSpinner';
import { usePlatformStatus } from './hooks/usePlatformStatus';

const DashboardPage = lazy(() =>
  import('./components/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const CalculatorPage = lazy(() =>
  import('./components/calculator/CalculatorPage').then((m) => ({ default: m.CalculatorPage }))
);
const DiscoveryPage = lazy(() =>
  import('./components/discovery/DiscoveryPage').then((m) => ({ default: m.DiscoveryPage }))
);
const ConfigPage = lazy(() =>
  import('./components/config/ConfigPage').then((m) => ({ default: m.ConfigPage }))
);
const ExportPage = lazy(() =>
  import('./components/export/ExportPage').then((m) => ({ default: m.ExportPage }))
);
const SchedulePage = lazy(() =>
  import('./components/schedule/SchedulePage').then((m) => ({ default: m.SchedulePage }))
);

export function App() {
  usePlatformStatus();
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/calculator" element={<CalculatorPage />} />
          <Route path="/discovery" element={<DiscoveryPage />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="/export" element={<ExportPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
