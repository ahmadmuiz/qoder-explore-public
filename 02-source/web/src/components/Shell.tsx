import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  ChevronDown,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Play,
  Landmark,
  ReceiptText,
  ScrollText,
  SlidersHorizontal,
  UploadCloud,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatTime } from '../lib/format';
import type { ExceptionSummary } from '../lib/types';
import { Avatar, Badge, Button, Logo, useToast } from './ui';

const TITLES: Record<string, string> = {
  '/': 'Overview',
  '/exceptions': 'Exception queue',
  '/imports': 'Reconciliation imports',
  '/ledger': 'Ledger explorer',
  '/treasury': 'Treasury & financing',
  '/invoices': 'Invoice register',
  '/reports': 'Close & controls',
  '/audit': 'Audit trail',
  '/settings': 'Controls',
};

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { user, logout } = useAuth();
  const { data: summary } = useQuery({
    queryKey: ['exceptions-summary'],
    queryFn: () => api.get<ExceptionSummary>('/api/exceptions/summary'),
    refetchInterval: 60_000,
  });
  const openCount = summary?.totals.open ?? 0;
  const reviewCount = summary?.totals.inReview ?? 0;

  const link = (to: string, label: string, icon: React.ReactNode, badge?: number) => (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}
      onClick={onNavigate}
    >
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {badge !== undefined && badge > 0 && <span className="nav-badge">{badge}</span>}
    </NavLink>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <Logo />
        <div className="bank-chip">
          <span className="bank-chip-dot" />
          Bank Cakrawala Nusantara
        </div>
      </div>

      <nav className="nav">
        <div className="nav-group">
          <div className="nav-heading">Workspace</div>
          {link('/', 'Overview', <LayoutDashboard size={17} />)}
          {link('/exceptions', 'Exception queue', <Inbox size={17} />, openCount + reviewCount)}
          {link('/imports', 'Imports', <UploadCloud size={17} />)}
          {link('/ledger', 'Ledger', <ArrowLeftRight size={17} />)}
          {link('/treasury', 'Treasury', <Landmark size={17} />)}
          {link('/invoices', 'Invoices', <ReceiptText size={17} />)}
        </div>
        <div className="nav-group">
          <div className="nav-heading">Controls</div>
          {link('/reports', 'Reports & close', <BarChart3 size={17} />)}
          {link('/audit', 'Audit trail', <ScrollText size={17} />)}
          {user?.role !== 'AUDITOR' && link('/settings', 'Controls', <SlidersHorizontal size={17} />)}
        </div>
      </nav>

      <div className="sidebar-foot">
        <div className="pilot-card">
          <div className="pilot-card-top">
            <span className="live-dot" />
            <span>Pilot environment</span>
            <Badge tone="mint">IDR</Badge>
          </div>
          <p>Vendor settlement · corporate payment operations</p>
        </div>
        {user && (
          <div className="sidebar-user">
            <Avatar name={user.name} size={34} />
            <div className="sidebar-user-meta">
              <strong>{user.name}</strong>
              <span>{user.role === 'SUPERVISOR' ? 'Operations supervisor' : user.role === 'ANALYST' ? 'Reconciliation analyst' : 'Internal auditor'}</span>
            </div>
            <button type="button" className="icon-btn icon-btn-dark" onClick={logout} aria-label="Sign out" title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

export function Shell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const title = TITLES[location.pathname] ?? (location.pathname.startsWith('/invoices/') ? 'Invoice detail' : 'Laras');

  const { data: summary } = useQuery({
    queryKey: ['exceptions-summary'],
    queryFn: () => api.get<ExceptionSummary>('/api/exceptions/summary'),
  });

  const { data: runs } = useQuery({
    queryKey: ['runs', 'latest'],
    queryFn: () => api.get<{ items: Array<{ id: string; status: string; finishedAt: string | null; startedAt: string }> }>('/api/runs'),
    refetchInterval: 120_000,
  });
  const lastRun = runs?.items[0];

  const runReconciliation = useMutation({
    mutationFn: () => api.post<{ ok: boolean; stats: { exactMatches: number; exceptionsOpen: number; matchedRate: number } }>('/api/reconciliation/run'),
    onSuccess: async (result) => {
      toast.push({
        title: 'Reconciliation complete',
        message: `${result.stats.exactMatches} exact matches · ${result.stats.exceptionsOpen} open exceptions · ${result.stats.matchedRate.toFixed(1)}% coverage.`,
        tone: 'success',
      });
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.push({ title: 'Run failed', message: error.message, tone: 'error' }),
  });

  return (
    <div className="app-shell">
      <div className={`sidebar-wrap ${mobileOpen ? 'is-open' : ''}`}>
        <Sidebar onNavigate={() => setMobileOpen(false)} />
        <button type="button" className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />
      </div>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button type="button" className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <Menu size={20} />
            </button>
            <div className="breadcrumb">
              <span className="breadcrumb-root">Operations</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">{title}</span>
            </div>
          </div>
          <div className="topbar-right">
            <div className="run-status">
              <span className={`live-dot ${lastRun?.status === 'COMPLETED' ? '' : 'is-idle'}`} />
              <span>
                {lastRun?.finishedAt ? `Last run ${formatTime(lastRun.finishedAt)}` : 'No run yet'}
              </span>
            </div>
            <NavLink to="/exceptions" className="icon-btn topbar-bell" aria-label="Open exception queue">
              <Bell size={17} />
              {(summary?.totals.open ?? 0) > 0 && <span className="bell-dot" />}
            </NavLink>
            {can(['ANALYST', 'SUPERVISOR']) && (
              <Button
                size="sm"
                icon={<Play size={14} />}
                loading={runReconciliation.isPending}
                onClick={() => runReconciliation.mutate()}
              >
                Run reconciliation
              </Button>
            )}
            {user && (
              <details className="user-menu">
                <summary>
                  <Avatar name={user.name} size={30} />
                  <span className="user-menu-name">{user.name.split(' ')[0]}</span>
                  <ChevronDown size={13} />
                </summary>
                <div className="user-menu-popover">
                  <div className="user-menu-head">
                    <strong>{user.name}</strong>
                    <span>{user.email}</span>
                    <Badge tone={user.role === 'SUPERVISOR' ? 'success' : user.role === 'AUDITOR' ? 'info' : 'neutral'}>{user.role}</Badge>
                  </div>
                  <button type="button" onClick={() => navigate('/settings')} className="user-menu-item">
                    <SlidersHorizontal size={15} /> Reconciliation controls
                  </button>
                  <button type="button" onClick={() => queryClient.invalidateQueries()} className="user-menu-item">
                    <Bell size={15} /> Refresh data
                  </button>
                  <button type="button" onClick={() => window.location.reload()} className="user-menu-item">
                    <X size={15} /> Reload session
                  </button>
                </div>
              </details>
            )}
          </div>
        </header>

        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
