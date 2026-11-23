import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Button, LogoMark } from '../components/ui';

const DEMO_ACCOUNTS = [
  { email: 'rani@bcn.co.id', name: 'Rani Prameswari', role: 'Analyst', note: 'Triage queue' },
  { email: 'dimas@bcn.co.id', name: 'Dimas Adiwangsa', role: 'Supervisor', note: 'Controls & approval' },
  { email: 'ayu@bcn.co.id', name: 'Ayu Lestari', role: 'Auditor', note: 'Read-only evidence' },
];

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('rani@bcn.co.id');
  const [password, setPassword] = useState('laras2026');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in.');
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-brand">
        <div className="login-brand-inner">
          <div className="login-logo">
            <LogoMark size={34} />
            <div>
              <div className="login-wordmark">Laras</div>
              <div className="login-tagline">Payment reconciliation control room</div>
            </div>
          </div>

          <div className="login-editorial">
            <div className="login-kicker">
              <span className="live-dot" />
              Bank Cakrawala Nusantara · Payment operations
            </div>
            <h1>
              Every rupiah,
              <br />
              <em>accounted for.</em>
            </h1>
            <p>
              Match payment references and amounts across invoice registers, incoming transfers and vendor
              kuitansi. Surface missing settlements, queue duplicates, and re-import statements without
              creating a single duplicate.
            </p>
          </div>

          <div className="login-proof">
            <div>
              <span className="proof-index">01</span>
              <strong>Match ID × amount</strong>
              <span>Exact, tolerance and provisional matching with an explicit evidence trail.</span>
            </div>
            <div>
              <span className="proof-index">02</span>
              <strong>Kuitansi-grade evidence</strong>
              <span>Nominal integrity checks link receipts, invoices and supporting documents.</span>
            </div>
            <div>
              <span className="proof-index">03</span>
              <strong>Idempotent imports</strong>
              <span>Checksums and row hashes skip duplicate statements on every re-import.</span>
            </div>
          </div>

          <div className="login-seal">
            <ShieldCheck size={16} />
            <span>Pilot · synthetic data only · six-eyes approvals on high-value adjustments</span>
          </div>
        </div>
        <div className="login-ornament" aria-hidden="true">
          <span className="ornament-line" />
          <span className="ornament-label">LEDGER / KUITANSI / INVOICE</span>
          <span className="ornament-line" />
        </div>
      </section>

      <section className="login-form-side">
        <div className="login-form-wrap">
          <div className="login-form-head">
            <div className="eyebrow">Secure sign-in</div>
            <h2>Welcome back.</h2>
            <p>Use a demo role to enter the reconciliation workspace.</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <label className="field">
              <span className="field-label">Work email</span>
              <div className="input-shell">
                <Mail size={16} />
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@bcn.co.id"
                  required
                />
              </div>
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <div className="input-shell">
                <LockKeyhole size={16} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  className="input-affix"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {error && <div className="form-error" role="alert">{error}</div>}

            <Button type="submit" size="lg" loading={submitting} className="login-submit">
              {submitting ? 'Signing in…' : 'Enter workspace'}
              {!submitting && <ArrowRight size={16} />}
            </Button>
          </form>

          <div className="demo-block">
            <div className="demo-head">
              <span>Demo accounts</span>
              <span className="demo-password">password · laras2026</span>
            </div>
            <div className="demo-list">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  className={`demo-account ${email === account.email ? 'is-selected' : ''}`}
                  onClick={() => {
                    setEmail(account.email);
                    setPassword('laras2026');
                    setError(null);
                  }}
                >
                  <span className="demo-avatar">{account.name.split(' ').map((part) => part[0]).join('')}</span>
                  <span className="demo-meta">
                    <strong>{account.name}</strong>
                    <span>{account.email}</span>
                  </span>
                  <span className="demo-role">{account.role}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="login-fineprint">
            Access is logged to the audit trail. All invoice, ledger and receipt data in this pilot is
            synthetic and generated for demonstration.
          </p>
        </div>
      </section>
    </div>
  );
}
