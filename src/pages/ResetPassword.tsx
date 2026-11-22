import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, ArrowRight, Crown, ShieldCheck, Check } from 'lucide-react';
import ScrollReveal from '../components/ScrollReveal';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import { useAuth } from '../context/AuthContext';
import { apiRequest, ApiError } from '../services/api';
import { evaluatePasswordStrength } from '../utils/passwordStrength';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const { setUser } = useAuth();
  const token = searchParams.get('token') || '';

  const [tokenState, setTokenState] = useState<'checking' | 'valid' | 'invalid'>(
    token ? 'checking' : 'invalid'
  );
  const [tokenError, setTokenError] = useState(
    token ? '' : 'Missing password reset token.'
  );

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!token) return;
    let active = true;

    apiRequest<{ valid: boolean; error?: string }>(
      `/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`
    )
      .then(res => {
        if (!active) return;
        if (res.valid) {
          setTokenState('valid');
        } else {
          setTokenState('invalid');
          setTokenError(res.error || 'This password reset link is invalid or expired.');
        }
      })
      .catch(() => {
        if (!active) return;
        setTokenState('invalid');
        setTokenError('Unable to validate reset link.');
      });

    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!evaluatePasswordStrength(password).valid) {
      setError('Password does not meet all 5 security requirements.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: { token, password, confirmPassword },
      });
      setUser(null);
      setSuccessMsg(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <div className="relative min-h-screen bg-[#0c0704] text-[#ede4dc] pt-28 pb-24 flex items-center justify-center px-4 sm:px-6 overflow-hidden">
      {/* Ambient Luxury Lighting Orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-48 left-1/2 -translate-x-1/2 w-[650px] h-[380px] bg-[radial-gradient(ellipse_at_center,rgba(223,196,113,0.14)_0%,transparent_70%)] blur-3xl"
      />

      <div className="w-full max-w-lg relative z-10">
        <ScrollReveal>
          {/* Grand Luxury Glassmorphic Card */}
          <div className="relative bg-gradient-to-b from-[#180f0a] via-[#140d09] to-[#110a07] border-2 border-[#dfc471]/35 rounded-3xl p-6 sm:p-10 shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_40px_rgba(212,175,55,0.08)] overflow-hidden space-y-6">
            {/* Top Gold Foil Accent Bar */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#dfc471] to-transparent" />

            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-[#dfc471]/15 to-[#b99225]/15 border border-[#dfc471]/40 text-[#dfc471] text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.22em] mb-3 shadow-[0_0_15px_rgba(223,196,113,0.12)]">
                <Crown className="w-3.5 h-3.5 text-[#dfc471]" />
                <span>Security Update • Seth &amp; Sons</span>
              </div>
              <h1 className="font-serif text-3xl sm:text-4xl font-normal text-[#faf6f0] tracking-wide mt-1">
                Create New Password
              </h1>
              <p className="text-xs sm:text-sm text-[#d5c4b4] mt-2 max-w-sm mx-auto leading-relaxed">
                Choose a strong royal shield password to secure your patron account.
              </p>
            </div>

            {tokenState === 'checking' && (
              <div className="py-8 text-center text-sm text-[#d5c4b4] flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-[#dfc471] border-t-transparent rounded-full animate-spin" />
                <span>Validating your secure reset link...</span>
              </div>
            )}

            {tokenState === 'invalid' && (
              <div className="space-y-5 text-center">
                <div className="p-4 rounded-2xl bg-red-950/80 border-2 border-red-500/50 text-red-200 text-xs sm:text-sm flex items-start gap-3 text-left shadow-lg">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-medium">{tokenError}</span>
                </div>
                <Link
                  to="/forgot-password"
                  className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] hover:brightness-110 shadow-lg transition-all"
                >
                  Request A New Reset Link
                </Link>
              </div>
            )}

            {tokenState === 'valid' && successMsg && (
              <div className="space-y-5 text-center">
                <div className="p-5 rounded-2xl bg-emerald-950/80 border-2 border-emerald-500/50 text-emerald-100 text-xs sm:text-sm space-y-2.5 text-left shadow-lg">
                  <div className="flex items-center gap-2 font-bold text-emerald-300">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span>Password Successfully Updated</span>
                  </div>
                  <p className="leading-relaxed text-[#ede4dc]">{successMsg}</p>
                </div>
                <Link
                  to="/login"
                  className="w-full py-4 px-6 rounded-full text-xs sm:text-sm font-bold tracking-[0.2em] uppercase bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] hover:brightness-110 shadow-[0_10px_30px_rgba(212,175,55,0.35)] transition-all flex items-center justify-center gap-2"
                >
                  <span>Sign In with New Password</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}

            {tokenState === 'valid' && !successMsg && (
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="p-4 rounded-2xl bg-red-950/80 border-2 border-red-500/50 text-red-200 text-xs sm:text-sm flex items-start gap-3 shadow-lg">
                    <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <span className="leading-relaxed font-medium">{error}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#f5eed3] mb-1.5">
                    New Password <span className="text-[#dfc471] font-bold">*</span>
                  </label>
                  <div className="relative group">
                    <Lock className="w-4 h-4 text-[#dfc471] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-[#f3dda2]" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter new strong password"
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
                  <PasswordStrengthMeter password={password} />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-[#f5eed3]">
                      Confirm New Password <span className="text-[#dfc471] font-bold">*</span>
                    </label>
                    {passwordsMatch && (
                      <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Passwords match
                      </span>
                    )}
                    {passwordsMismatch && (
                      <span className="text-[11px] font-semibold text-amber-400">
                        Passwords do not match
                      </span>
                    )}
                  </div>
                  <div className="relative group">
                    <Lock className="w-4 h-4 text-[#dfc471] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-[#f3dda2]" />
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className={`w-full pl-11 pr-12 py-3.5 rounded-xl bg-[#231710] border-2 ${
                        passwordsMismatch
                          ? 'border-amber-500/70 focus:border-amber-400'
                          : passwordsMatch
                          ? 'border-emerald-500/70 focus:border-emerald-400'
                          : 'border-[#543d2c] hover:border-[#dfc471]/60 focus:border-[#dfc471]'
                      } focus:ring-4 focus:ring-[#dfc471]/20 focus:bg-[#2a1a13] text-sm sm:text-base text-white placeholder:text-[#a89584] placeholder:font-normal focus:outline-none transition-all shadow-inner`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(p => !p)}
                      aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#d5c4b4] hover:text-[#dfc471] cursor-pointer p-1 transition-colors"
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-4 px-6 rounded-full text-xs sm:text-sm font-bold tracking-[0.2em] uppercase bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] hover:brightness-110 active:scale-[0.99] shadow-[0_10px_30px_rgba(212,175,55,0.35)] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
                >
                  <span>{submitting ? 'Updating Password...' : 'Reset Password'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            <div className="pt-4 border-t border-[#291b12] flex items-center justify-center gap-2 text-[11px] text-[#a89584]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#dfc471]" />
              <span>Encrypted Authentication Gateway</span>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </div>
  );
}
