import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Calculator,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Copy,
  FileQuestion,
  Files,
  Info,
  Loader2,
  Scale,
  SearchX,
  X,
} from 'lucide-react';
import { initials, STATUS_LABELS, TYPE_LABELS } from '../lib/format';

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="logo-mark">
      <rect width="40" height="40" rx="11" fill="currentColor" />
      <path d="M11 29V11h5.8c6.1 0 9.8 3.1 9.8 8.4S22.9 29 16.8 29H11Zm5.2-4.4h.5c3.1 0 4.8-1.5 4.8-5.2 0-3.6-1.7-5.1-4.8-5.1h-.5v10.3Z" fill="#D9ED9B" />
      <path d="M26.5 29h3.7" stroke="#D9ED9B" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="logo">
      <span className="logo-mark-wrap">
        <LogoMark size={compact ? 30 : 36} />
      </span>
      <div className="logo-text">
        <span className="wordmark">LARAS</span>
        {!compact && <span className="wordmark-sub">Payment reconciliation</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  block,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant} btn-${size} ${block ? 'btn-block' : ''} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="spin" /> : icon}
      {children && <span>{children}</span>}
      {iconRight}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button className={`icon-btn ${className}`} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------
export function Badge({
  children,
  tone = 'neutral',
  dot = false,
  className = '',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'mint';
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={`badge badge-${tone} ${className}`}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'mint'> = {
    OPEN: 'danger',
    IN_REVIEW: 'warning',
    RESOLVED: 'success',
    IGNORED: 'neutral',
    PAID: 'success',
    OVERDUE: 'danger',
    EXCEPTION: 'warning',
    PARTIAL: 'warning',
    MATCHED: 'success',
    UNMATCHED: 'neutral',
    DUPLICATE: 'danger',
    COMPLETED: 'success',
    DUPLICATE_FILE: 'info',
    REJECTED: 'danger',
    EXACT: 'success',
    TOLERANCE: 'mint',
    PROVISIONAL: 'warning',
  };
  return (
    <Badge tone={tone[status] ?? 'neutral'} dot>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function SeverityBadge({ severity, showLabel = true }: { severity: string; showLabel?: boolean }) {
  const tone: Record<string, 'danger' | 'warning' | 'info' | 'neutral'> = {
    CRITICAL: 'danger',
    HIGH: 'warning',
    MEDIUM: 'info',
    LOW: 'neutral',
  };
  return (
    <span className={`severity severity-${severity.toLowerCase()}`}>
      <span className="severity-dot" />
      {showLabel && <span>{severity.charAt(0) + severity.slice(1).toLowerCase()}</span>}
    </span>
  );
}

const TYPE_ICONS: Record<string, ReactNode> = {
  DUPLICATE_PAYMENT: <Copy size={13} />,
  AMOUNT_MISMATCH: <Scale size={13} />,
  MISSING_PAYMENT: <SearchX size={13} />,
  UNALLOCATED_PAYMENT: <CircleDashed size={13} />,
  NOMINAL_VARIANCE: <Calculator size={13} />,
  ORPHAN_RECEIPT: <FileQuestion size={13} />,
  DUPLICATE_RECEIPT: <Files size={13} />,
};

export function TypeChip({ type, short = false }: { type: string; short?: boolean }) {
  return (
    <span className={`type-chip type-${type.toLowerCase()}`}>
      {TYPE_ICONS[type]}
      <span>{short ? TYPE_LABELS[type]?.replace(' payment', '').replace(' receipt', '') : TYPE_LABELS[type] ?? type}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------
export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <section className={`card ${padded ? 'card-padded' : ''} ${className}`}>{children}</section>;
}

export function CardHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2 className="card-title">{title}</h2>
        {subtitle && <p className="card-subtitle">{subtitle}</p>}
      </div>
      {action && <div className="card-action">{action}</div>}
    </div>
  );
}

export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }} title={name}>
      {initials(name)}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon ?? <Check size={22} />}</div>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ width = '100%', height = 14 }: { width?: string; height?: number }) {
  return <span className="skeleton" style={{ width, height }} />;
}

export function LoadingBlock({ rows = 5 }: { rows?: number }) {
  return (
    <div className="loading-block">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton-row">
          <Skeleton width="22%" height={14} />
          <Skeleton width="34%" height={14} />
          <Skeleton width="16%" height={14} />
          <Skeleton width="12%" height={14} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------
export function Field({
  label,
  hint,
  error,
  children,
  className = '',
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`field ${className}`}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: Array<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={`segmented segmented-${size}`} role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={`segmented-item ${value === option.value ? 'is-active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && <span className="segmented-count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="checkbox-box">{checked && <Check size={12} />}</span>
      {label && <span>{label}</span>}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
export function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="pagination">
      <span className="pagination-label">
        Page {page} of {Math.max(1, totalPages)} · {total.toLocaleString('en-US')} records
      </span>
      <div className="pagination-actions">
        <IconButton label="Previous page" onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1}>
          <ChevronLeft size={16} />
        </IconButton>
        <IconButton label="Next page" onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
          <ChevronRight size={16} />
        </IconButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------
export function Drawer({
  open,
  onClose,
  children,
  width = 620,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  label: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="drawer-root" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" className="drawer-scrim" onClick={onClose} aria-label="Close panel" />
      <aside className="drawer" style={{ maxWidth: width }}>
        <button type="button" className="drawer-close" onClick={onClose} aria-label="Close panel">
          <X size={18} />
        </button>
        {children}
      </aside>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
interface ToastItem {
  id: number;
  title: string;
  message?: string;
  tone: 'success' | 'error' | 'info';
}

interface ToastContextValue {
  push: (toast: { title: string; message?: string; tone?: ToastItem['tone'] }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((input: { title: string; message?: string; tone?: ToastItem['tone'] }) => {
    const id = Date.now() + Math.random();
    const toast: ToastItem = { id, title: input.title, message: input.message, tone: input.tone ?? 'info' };
    setToasts((current) => [...current, toast]);
    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 6200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            <span className="toast-icon">
              {toast.tone === 'success' ? <Check size={16} /> : toast.tone === 'error' ? <AlertTriangle size={16} /> : <Info size={16} />}
            </span>
            <div>
              <strong>{toast.title}</strong>
              {toast.message && <p>{toast.message}</p>}
            </div>
            <button type="button" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
