import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  ShieldCheck,
  Crown,
  Sparkles,
} from 'lucide-react';
import ScrollReveal from '../components/ScrollReveal';
import { useAuth } from '../context/AuthContext';
import { apiRequest, ApiError, AuthUser, toApiUrl } from '../services/api';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, loading, setUser, googleOAuthEnabled } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const redirectParam = searchParams.get('redirect');
  const fromState = (location.state as { from?: string } | null)?.from;
  const targetRedirect = redirectParam || fromState || '/account';

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const oauthErr = searchParams.get('error');
    if (oauthErr) {
      setError('Google sign-in could not be completed. Please try again or sign in with your email & password.');
    }
  }, [searchParams]);

  useEffect(() => {
    if (!loading && user) {
      navigate(targetRedirect, { replace: true });
    }
  }, [loading, user, navigate, targetRedirect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter your email address and password.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{ user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: {
          email: email.trim(),
          password,
          rememberMe,
        },
      });
      setUser(res.user);
      navigate(targetRedirect, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#0c0704] text-[#ede4dc] pt-28 pb-24 flex items-center justify-center px-4 sm:px-6 overflow-hidden">
      {/* Ambient Luxury Lighting Orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-48 left-1/2 -translate-x-1/2 w-[650px] h-[380px] bg-[radial-gradient(ellipse_at_center,rgba(223,196,113,0.14)_0%,transparent_70%)] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-12 -left-24 w-[450px] h-[350px] bg-[radial-gradient(ellipse_at_center,rgba(185,146,37,0.08)_0%,transparent_70%)] blur-2xl"
      />

      <div className="w-full max-w-lg relative z-10">
        <ScrollReveal>
          {/* Grand Luxury Glassmorphic Card */}
          <div className="relative bg-gradient-to-b from-[#180f0a] via-[#140d09] to-[#110a07] border-2 border-[#dfc471]/35 rounded-3xl p-6 sm:p-10 shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_40px_rgba(212,175,55,0.08)] overflow-hidden">
            {/* Top Gold Foil Accent Bar */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#dfc471] to-transparent" />

            {/* Header Section */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-[#dfc471]/15 to-[#b99225]/15 border border-[#dfc471]/40 text-[#dfc471] text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.22em] mb-3.5 shadow-[0_0_15px_rgba(223,196,113,0.12)]">
                <Crown className="w-3.5 h-3.5 text-[#dfc471]" />
                <span>Patron Portal • Seth &amp; Sons</span>
              </div>
              <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal text-[#faf6f0] tracking-wide">
                Patron Sign In
              </h1>
              <p className="text-xs sm:text-sm text-[#d5c4b4] mt-2.5 max-w-md mx-auto leading-relaxed">
                Access your verified orders, real-time Jammu courier tracking, and exclusive reserve privileges.
              </p>
            </div>

            {/* Error Notification */}
            {error && (
              <div className="mb-6 p-4 rounded-2xl bg-red-950/80 border-2 border-red-500/50 text-red-200 text-xs sm:text-sm flex items-start gap-3 shadow-lg">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Address */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#f5eed3] mb-1.5">
                  Email Address <span className="text-[#dfc471] font-bold">*</span>
                </label>
                <div className="relative group">
                  <Mail className="w-4 h-4 text-[#dfc471] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-[#f3dda2]" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-[#231710] border-2 border-[#543d2c] hover:border-[#dfc471]/60 focus:border-[#dfc471] focus:ring-4 focus:ring-[#dfc471]/20 focus:bg-[#2a1a13] text-sm sm:text-base text-white placeholder:text-[#a89584] placeholder:font-normal focus:outline-none transition-all shadow-inner"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[#f5eed3]">
                    Password <span className="text-[#dfc471] font-bold">*</span>
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-xs text-[#dfc471] hover:text-[#f3dda2] underline underline-offset-4 decoration-[#dfc471]/50 hover:decoration-[#dfc471] transition-colors font-medium"
                  >
                    Forgot Password?
                  </Link>
                </div>
                <div className="relative group">
                  <Lock className="w-4 h-4 text-[#dfc471] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-[#f3dda2]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-11 pr-12 py-3.5 rounded-xl bg-[#231710] border-2 border-[#543d2c] hover:border-[#dfc471]/60 focus:border-[#dfc471] focus:ring-4 focus:ring-[#dfc471]/20 focus:bg-[#2a1a13] text-sm sm:text-base text-white placeholder:text-[#a89584] placeholder:font-normal focus:outline-none transition-all shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#d5c4b4] hover:text-[#dfc471] cursor-pointer p-1 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <div className="pt-1">
                <label className="flex items-center gap-3 p-2.5 rounded-xl bg-[#170e0a]/60 border border-[#38281d] hover:border-[#dfc471]/40 transition-colors cursor-pointer text-xs sm:text-sm text-[#ede4dc]">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-[#543d2c] accent-[#dfc471] cursor-pointer shrink-0"
                  />
                  <span>Remember me for 30 days on this device</span>
                </label>
              </div>

              {/* Sign In CTA */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 px-6 rounded-full text-xs sm:text-sm font-bold tracking-[0.2em] uppercase bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] hover:brightness-110 active:scale-[0.99] shadow-[0_10px_30px_rgba(212,175,55,0.35)] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>{submitting ? 'Signing In...' : 'Sign In To Account'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Google OAuth Option */}
            {googleOAuthEnabled && (
              <div className="mt-6">
                <div className="relative flex items-center justify-center my-5">
                  <div className="border-t border-[#3d2a1d] w-full" />
                  <span className="bg-[#140d09] px-3.5 text-[11px] uppercase tracking-[0.2em] text-[#d5c4b4]/70 font-semibold shrink-0">
                    Or Continue With
                  </span>
                  <div className="border-t border-[#3d2a1d] w-full" />
                </div>
                <a
                  href={toApiUrl('/api/auth/google')}
                  className="w-full py-3.5 px-6 rounded-full text-xs font-bold tracking-wider uppercase bg-[#231710] hover:bg-[#2b1c13] text-[#faf6f0] border-2 border-[#543d2c] hover:border-[#dfc471]/70 transition-all flex items-center justify-center gap-3 shadow-sm hover:shadow-[0_0_20px_rgba(223,196,113,0.15)]"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#EA4335"
                      d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9c-.2-.7-.4-1.5-.4-2.3z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2-6.4-4.8L1.9 16.4C3.7 20.1 7.5 23 12 23z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </a>
              </div>
            )}

            {/* Bottom Navigation */}
            <div className="mt-8 pt-6 border-t border-[#342419] text-center text-xs sm:text-sm text-[#d5c4b4]">
              New to Seth &amp; Sons?{' '}
              <Link
                to="/register"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="text-[#dfc471] font-bold hover:text-[#f3dda2] underline underline-offset-4 decoration-[#dfc471]/50 hover:decoration-[#dfc471] transition-colors ml-1"
              >
                Create A Patron Account
              </Link>
            </div>

            {/* Trust Assurances Footer */}
            <div className="mt-6 pt-5 border-t border-[#291b12] flex flex-wrap items-center justify-center gap-4 text-[11px] text-[#a89584]">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#dfc471]" />
                256-Bit SSL Protection
              </span>
              <span>•</span>
              <span>Direct Jammu Harvests</span>
              <span>•</span>
              <span>Verified Patron Network</span>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </div>
  );
}
