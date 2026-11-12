import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
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
      setError('Password does not meet all strength requirements.');
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

  return (
    <div className="min-h-screen bg-[#0d0805] text-[#ede4dc] pt-28 pb-24 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <ScrollReveal>
          <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-8 sm:p-10 shadow-2xl space-y-6">
            <div className="text-center">
              <span className="text-[11px] uppercase tracking-[0.25em] text-[#dfc471] font-semibold">
                Security Update
              </span>
              <h1 className="font-serif text-3xl text-[#f9f6f2] mt-1">
                Create New Password
              </h1>
            </div>

            {tokenState === 'checking' && (
              <p className="text-center text-sm text-[#d5c4b4]/75">
                Validating your password reset link...
              </p>
            )}

            {tokenState === 'invalid' && (
              <div className="space-y-4 text-center">
                <div className="p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs sm:text-sm flex items-start gap-2.5 text-left">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <span>{tokenError}</span>
                </div>
                <Link
                  to="/forgot-password"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#dfc471] text-[#0d0805]"
                >
                  Request a New Reset Link
                </Link>
              </div>
            )}

            {tokenState === 'valid' && successMsg && (
              <div className="space-y-5 text-center">
                <div className="p-5 rounded-2xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-100 text-xs sm:text-sm space-y-2 text-left">
                  <div className="flex items-center gap-2 font-semibold text-emerald-300">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Password Changed</span>
                  </div>
                  <p>{successMsg}</p>
                </div>
                <Link
                  to="/login"
                  className="w-full py-3.5 rounded-full text-xs font-semibold tracking-wider uppercase bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] flex items-center justify-center gap-2"
                >
                  <span>Sign In with New Password</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}

            {tokenState === 'valid' && !successMsg && (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-[#d5c4b4] mb-1.5">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#d5c4b4]/60 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter new strong password"
                      className="w-full pl-10 pr-11 py-3 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2] focus:outline-none focus:border-[#dfc471]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#d5c4b4]/60 hover:text-[#dfc471] cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <PasswordStrengthMeter password={password} />
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-[#d5c4b4] mb-1.5">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#d5c4b4]/60 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2] focus:outline-none focus:border-[#dfc471]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 rounded-full text-xs font-semibold tracking-wider uppercase bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] hover:brightness-110 shadow-xl transition-all cursor-pointer disabled:opacity-60"
                >
                  {submitting ? 'Updating Password...' : 'Reset Password'}
                </button>
              </form>
            )}
          </div>
        </ScrollReveal>
      </div>
    </div>
  );
}

