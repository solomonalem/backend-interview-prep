import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Target, ShieldCheck, Gauge } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { ApiRequestError } from '../../api/client';
import { Button, Input, Label } from '../../components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('dev@assessiq.local');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between bg-brand-gradient p-12 text-white relative overflow-hidden">
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 -left-24 h-80 w-80 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <span className="h-9 w-9 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
            <Sparkles size={19} />
          </span>
          <span className="font-bold text-lg">AssessIQ</span>
        </div>
        <div className="relative">
          <h2 className="text-3xl font-bold leading-tight max-w-sm">
            Proctored, rubric-scored technical assessments.
          </h2>
          <p className="mt-4 text-white/80 max-w-sm">
            Score how <em>senior</em> a candidate thinks — not just whether they got it right.
          </p>
          <div className="mt-8 space-y-3 text-sm">
            <Feature icon={<Target size={16} />} text="Senior-signal & trap rubric on every question" />
            <Feature icon={<ShieldCheck size={16} />} text="Passive proctoring, surfaced as context" />
            <Feature icon={<Gauge size={16} />} text="Percentage scoring across four components" />
          </div>
        </div>
        <p className="relative text-xs text-white/50">© AssessIQ — Phase 0 preview</p>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <span className="h-8 w-8 rounded-lg bg-brand-gradient flex items-center justify-center">
              <Sparkles size={17} className="text-white" />
            </span>
            <span className="font-bold text-slate-800">AssessIQ</span>
          </div>

          <h1 className="text-2xl font-bold text-slate-800">Welcome back</h1>
          <p className="text-sm text-slate-500 mb-6">Sign in to your interviewer account.</p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" disabled={busy} className="w-full">
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
            <div className="flex-1 h-px bg-slate-200" /> or <div className="flex-1 h-px bg-slate-200" />
          </div>

          <button
            disabled
            title="Requires GOOGLE_CLIENT_ID / SECRET — not configured in local dev"
            className="w-full rounded-lg border border-slate-200 text-slate-400 text-sm font-medium py-2.5 cursor-not-allowed"
          >
            Continue with Google
          </button>

          <div className="mt-6 rounded-lg bg-brand-50 border border-brand-100 px-3 py-2.5">
            <p className="text-xs text-brand-700">
              <span className="font-semibold">Dev account</span> is pre-filled —{' '}
              <code className="font-mono">dev@assessiq.local</code> / <code className="font-mono">password123</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-white/90">
      <span className="h-7 w-7 rounded-lg bg-white/15 flex items-center justify-center shrink-0">{icon}</span>
      {text}
    </div>
  );
}
