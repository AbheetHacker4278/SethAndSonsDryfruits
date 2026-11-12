import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail,
  KeyRound,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Loader2,
  RotateCcw,
  Activity,
  Database,
  Cloud,
  Server,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  apiRequest,
  ApiError,
  AuthUser,
  fetchAdminPreflight,
  type PreflightCheckItem,
  type SystemPreflightReport,
} from '../../services/api';

function PreflightServiceIcon({ k }: { k: PreflightCheckItem['key'] }) {
  switch (k) {
    case 'mongodb':
      return <Database className="w-3.5 h-3.5" />;
    case 'email':
      return <Mail className="w-3.5 h-3.5" />;
    case 'cloudinary':
      return <Cloud className="w-3.5 h-3.5" />;
    case 'queue':
      return <Activity className="w-3.5 h-3.5" />;
    default:
      return <Server className="w-3.5 h-3.5" />;
  }
}

export default function AdminLogin() {
  const navigate = useNavigate();
  const { user, loading, setUser } = useAuth();
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const [preflight, setPreflight] = useState<SystemPreflightReport | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(true);
  const [preflightExpanded, setPreflightExpanded] = useState(false);

  const runPreflight = useCallback(async (fresh = false) => {
    setPreflightLoading(true);
    try {
      const report = await fetchAdminPreflight(fresh);
      setPreflight(report);
      if (!report.overallOk) {
        setPreflightExpanded(true);
      }
    } finally {
      setPreflightLoading(false);
    }
  }, []);

  useEffect(() => {
    void runPreflight(false);
  }, [runPreflight]);

  useEffect(() => {
    if (!loading && user?.role === 'admin') {
      navigate('/admin/dashboard', { replace: true });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setInterval(() => {
      setCooldown(prev => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(t);
  }, [cooldown]);

  if (loading || user?.role === 'admin') {
    return (
      <div className="min-h-screen bg-[#F8F6F0] flex items-center justify-center text-sm font-medium text-[#183D32]">
        Verifying administrator session...
      </div>
    );
  }

  const mongoCheck = preflight?.checks.find(c => c.key === 'mongodb');
  const dbBlocked = Boolean(preflight && mongoCheck && !mongoCheck.ok);

  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setInfoMsg('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Please enter your administrator email address.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/admin-otp/request', {
        method: 'POST',
        body: { email: cleanEmail },
      });
      setStep('otp');
      setOtp('');
      setCooldown(30);
      setInfoMsg(
        res.message ||
          `A 6-digit login OTP has been dispatched to ${cleanEmail} (valid for 10 minutes).`
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to send OTP right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleanOtp = otp.replace(/\D/g, '').slice(0, 6);
    if (cleanOtp.length !== 6) {
      setError('Please enter the 6-digit verification code from your email.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{ user: AuthUser }>('/api/auth/admin-otp/verify', {
        method: 'POST',
        body: {
          email: email.trim().toLowerCase(),
          otp: cleanOtp,
          rememberMe,
        },
      });
      setUser(res.user);
      navigate('/admin/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'OTP verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const storefrontUrl =
    typeof window !== 'undefined' && window.location.port === '8000'
      ? `${window.location.protocol}//${window.location.hostname}:3000/`
      : '/';

  return (
    <div className="min-h-screen bg-[#F8F6F0] font-admin-sans grid grid-cols-1 lg:grid-cols-2">
      {/* Left Brand Presentation */}
      <div className="relative bg-[#183D32] text-[#F8F6F0] p-8 sm:p-14 flex flex-col justify-between overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <img
            src="/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg"
            alt="Seth And Sons DryFruits Harvest"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#183D32] via-[#183D32]/85 to-[#0E271F]" />
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <img
            src="/assets/seth_and_sons_logo.jpg"
            alt="Seth And Sons DryFruits"
            className="h-16 w-16 rounded-full object-cover border-2 border-[#C8A96B]/60 shadow-xl"
          />
        </div>

        <div className="relative z-10 max-w-lg space-y-5 my-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#245746] border border-[#C8A96B]/40 text-[#C8A96B] text-[11px] uppercase tracking-[0.2em] font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Passwordless OTP Authentication</span>
          </div>

          <h1 className="font-admin-serif text-4xl sm:text-5xl font-semibold leading-tight text-white">
            Seth And Sons DryFruits
          </h1>
          <p className="font-admin-serif italic text-xl text-[#C8A96B]">
            "A Legacy of Quality &amp; Taste"
          </p>
          <p className="text-sm text-[#D6E3DC] leading-relaxed">
            Central command for inventory batches, Jammu harvest catalog pricing, verified order fulfillment, supplier procurement, financial accounting, and automated patron communications.
          </p>
        </div>

        <div className="relative z-10 flex items-center justify-between text-xs text-[#A8C2B7] border-t border-[#245746] pt-6">
          <span>Heritage Dry Fruit Mandi, Jammu (J&amp;K)</span>
          <span>Email OTP Protected Portal</span>
        </div>
      </div>

      {/* Right OTP Login Card */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-[#F8F6F0]">
        <div className="w-full max-w-md bg-white border border-[#E9E4D9] rounded-2xl p-8 sm:p-10 shadow-[0_8px_32px_rgba(24,61,50,0.06)] space-y-6">
          <div>
            <h2 className="font-admin-serif text-3xl font-semibold text-[#183D32]">
              {step === 'email' ? 'Welcome Back' : 'Verify One-Time Code'}
            </h2>
            <p className="text-sm text-[#888B83] mt-1">
              {step === 'email'
                ? 'Enter your authorized administrator email to receive a 6-digit OTP.'
                : `Enter the 6-digit verification code sent to ${email.trim().toLowerCase()}.`}
            </p>
          </div>

          {/* Automatic Pre-Login Live Connection Preflight */}
          <div
            className={`rounded-xl border p-3.5 text-xs transition-colors ${
              preflightLoading && !preflight
                ? 'bg-[#F8F6F0] border-[#E9E4D9] text-[#5C6058]'
                : preflight?.overallOk
                ? 'bg-[#E7F3EE]/80 border-[#B8DEC9] text-[#183D32]'
                : 'bg-[#FCECEB] border-[#F2C3BE] text-[#9E3D33]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {preflightLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0 text-[#183D32]" />
                ) : preflight?.overallOk ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[#245746]" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-[#C65B50]" />
                )}
                <div className="min-w-0">
                  <div className="font-semibold truncate">
                    {preflightLoading && !preflight
                      ? 'Checking system connections...'
                      : preflight?.overallOk
                      ? `All Systems Active (${preflight.checks.length}/${preflight.checks.length} verified)`
                      : 'Service Connection Issue Detected'}
                  </div>
                  {preflight && (
                    <div className="text-[11px] opacity-80">
                      MongoDB, Email, Cloudinary &amp; APIs checked in {preflight.totalDurationMs}ms
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void runPreflight(true)}
                  disabled={preflightLoading}
                  title="Re-verify all connections"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/80 hover:bg-white border border-black/10 text-[11px] font-medium cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${preflightLoading ? 'animate-spin' : ''}`} />
                  <span>Re-check</span>
                </button>
                {preflight && (
                  <button
                    type="button"
                    onClick={() => setPreflightExpanded(v => !v)}
                    aria-label="Toggle connection details"
                    className="p-1 rounded-lg bg-white/70 hover:bg-white border border-black/10 cursor-pointer"
                  >
                    {preflightExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {preflightExpanded && preflight && (
              <div className="mt-3 pt-2.5 border-t border-black/10 space-y-2">
                {preflight.checks.map(chk => (
                  <div
                    key={chk.key}
                    className="flex items-start justify-between gap-2 text-[11px] bg-white/80 rounded-lg px-2.5 py-1.5 border border-black/5"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <span
                        className={`mt-0.5 shrink-0 ${
                          chk.ok ? 'text-[#245746]' : chk.status === 'waiting' ? 'text-[#8F6C2B]' : 'text-[#C65B50]'
                        }`}
                      >
                        <PreflightServiceIcon k={chk.key} />
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-[#252923]">{chk.label}</div>
                        <div className="text-[#5C6058] break-words">{chk.detail}</div>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold uppercase ${
                        chk.ok
                          ? 'bg-[#E7F3EE] text-[#183D32]'
                          : chk.status === 'waiting'
                          ? 'bg-[#FAF3E3] text-[#8F6C2B]'
                          : 'bg-[#FCECEB] text-[#C65B50]'
                      }`}
                    >
                      {chk.ok ? `OK · ${chk.latencyMs}ms` : chk.status}
                    </span>
                  </div>
                ))}

                {(preflight.browserProxyChecks || preflight.endpoints).length > 0 && (
                  <div className="pt-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[#5C6058] mb-1">
                      Live API Endpoints
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(preflight.browserProxyChecks || preflight.endpoints).map(ep => (
                        <span
                          key={ep.path}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                            ep.ok
                              ? 'bg-white text-[#183D32] border-[#B8DEC9]'
                              : 'bg-[#FCECEB] text-[#C65B50] border-[#F2C3BE]'
                          }`}
                        >
                          {ep.path.replace('/api', '')} ({ep.status})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {user && (
            <div className="p-3.5 rounded-xl bg-[#FAF3E3] border border-[#C8A96B]/50 text-[#8F6C2B] text-xs">
              Signed in as customer ({user.email}). Customer credentials cannot access administrator routes.
            </div>
          )}

          {infoMsg && !error && (
            <div className="p-3.5 rounded-xl bg-[#E7F3EE] border border-[#B8DEC9] text-[#183D32] text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#245746]" />
              <span>{infoMsg}</span>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-[#FCECEB] border border-[#F2C3BE] text-[#C65B50] text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === 'email' ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#252923] mb-1.5">
                  Administrator Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#888B83] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="aseth9588@gmail.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-sm text-[#252923] focus:outline-none focus:border-[#183D32]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || dbBlocked}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-[#183D32] hover:bg-[#245746] text-white shadow-md transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending OTP...</span>
                  </>
                ) : (
                  <>
                    <span>Send Login OTP</span>
                    <ArrowRight className="w-4 h-4 text-[#C8A96B]" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-[#252923]">6-Digit Email OTP</label>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('email');
                      setOtp('');
                      setError('');
                      setInfoMsg('');
                    }}
                    className="text-xs text-[#245746] hover:underline font-medium cursor-pointer"
                  >
                    Change Email
                  </button>
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-[#888B83] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    autoFocus
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-center font-mono text-lg tracking-[0.45em] text-[#183D32] focus:outline-none focus:border-[#183D32]"
                  />
                </div>
                <p className="text-[11px] text-[#888B83] mt-1.5">
                  Single-use verification code expires in 10 minutes.
                </p>
              </div>

              <label className="flex items-center gap-2 text-xs text-[#5C6058] cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="accent-[#183D32]"
                />
                <span>Remember Me on this trusted workstation</span>
              </label>

              <button
                type="submit"
                disabled={submitting || otp.length !== 6}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-[#183D32] hover:bg-[#245746] text-white shadow-md transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  <>
                    <span>Verify &amp; Sign In</span>
                    <ArrowRight className="w-4 h-4 text-[#C8A96B]" />
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={submitting || cooldown > 0}
                onClick={() => void handleRequestOtp()}
                className="w-full py-2.5 rounded-xl text-xs font-medium border border-[#E9E4D9] text-[#183D32] hover:bg-[#F8F6F0] transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend Verification OTP'}</span>
              </button>
            </form>
          )}

          <div className="pt-4 border-t border-[#E9E4D9] flex items-center justify-between text-xs text-[#888B83]">
            <a href={storefrontUrl} className="hover:text-[#183D32]">
              ← Open Storefront
            </a>
            <span>Dedicated Admin Portal (Port 8000)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
