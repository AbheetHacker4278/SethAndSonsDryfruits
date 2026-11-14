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
    const oauthErr = searchParams.get('error');
    if (oauthErr) {
      setError('Google sign-in could not be completed. Please try again or use email & password.');
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
    <div className="min-h-screen bg-[#0d0805] text-[#ede4dc] pt-28 pb-24 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <ScrollReveal>
          <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-7 sm:p-10 shadow-2xl">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold uppercase tracking-[0.2em] mb-3">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Seth And Sons DryFruits</span>
              </div>
              <h1 className="font-serif text-3xl sm:text-4xl font-normal text-[#f9f6f2]">
                Patron Sign In
              </h1>
              <p className="text-xs sm:text-sm text-[#d5c4b4]/75 mt-2">
                Access your verified orders, shipment tracking, saved addresses, and exclusive Jammu harvest privileges.
              </p>
            </div>

            {error && (
              <div className="mb-6 p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-[#d5c4b4] mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#d5c4b4]/60 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2] placeholder-[#d5c4b4]/40 focus:outline-none focus:border-[#dfc471]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium uppercase tracking-wider text-[#d5c4b4]">
                    Password
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-xs text-[#dfc471] hover:underline"
                  >
                    Forgot Password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#d5c4b4]/60 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-11 py-3 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2] placeholder-[#d5c4b4]/40 focus:outline-none focus:border-[#dfc471]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#d5c4b4]/60 hover:text-[#dfc471] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-[#d5c4b4] cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="accent-[#dfc471]"
                />
                <span>Remember me for 30 days on this device</span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 rounded-full text-xs font-semibold tracking-wider uppercase bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] hover:brightness-110 shadow-xl transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2 mt-4"
              >
                <span>{submitting ? 'Signing In...' : 'Sign In'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {googleOAuthEnabled && (
              <div className="mt-5">
                <div className="relative flex items-center justify-center my-4">
                  <div className="border-t border-[#38281d] w-full" />
                  <span className="bg-[#150d09] px-3 text-[11px] uppercase tracking-wider text-[#d5c4b4]/50">
                    Or
                  </span>
                  <div className="border-t border-[#38281d] w-full" />
                </div>
                <a
                  href={toApiUrl('/api/auth/google')}
                  className="w-full py-3 rounded-full text-xs font-semibold tracking-wider uppercase bg-[#1c120c] hover:bg-[#251a13] text-[#f9f6f2] border border-[#38281d] hover:border-[#dfc471]/50 transition-colors flex items-center justify-center gap-2"
                >
                  <span>Continue with Google</span>
                </a>
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-[#38281d] flex items-center justify-center text-xs text-[#d5c4b4]/80">
              <span>
                New patron?{' '}
                <Link to="/register" className="text-[#dfc471] font-semibold hover:underline">
                  Create Account
                </Link>
              </span>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </div>
  );
}
