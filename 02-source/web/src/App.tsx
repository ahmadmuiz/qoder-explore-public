import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './lib/auth';
import { Shell } from './components/Shell';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { ExceptionsPage } from './pages/Exceptions';
import { InvoicesPage } from './pages/Invoices';
import { InvoiceDetailPage } from './pages/InvoiceDetail';
import { LedgerPage } from './pages/Ledger';
import { TreasuryPage } from './pages/Treasury';
import { ImportsPage } from './pages/Imports';
import { ReportsPage } from './pages/Reports';
import { AuditPage } from './pages/Audit';
import { SettingsPage } from './pages/Settings';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/exceptions" element={<ExceptionsPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/:invoiceNumber" element={<InvoiceDetailPage />} />
        <Route path="/ledger" element={<LedgerPage />} />
        <Route path="/treasury" element={<TreasuryPage />} />
        <Route path="/imports" element={<ImportsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
