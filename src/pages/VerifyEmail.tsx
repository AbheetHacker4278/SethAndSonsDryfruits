import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { MailCheck, AlertCircle, RefreshCw, CheckCircle2, ArrowRight, Mail } from 'lucide-react';
import ScrollReveal from '../components/ScrollReveal';
import { useAuth } from '../context/AuthContext';
import { apiRequest, ApiError, AuthUser } from '../services/api';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const { user, loading, refreshUser, setUser } = useAuth();

  const tokenParam = searchParams.get('token') || '';
  const emailParam = searchParams.get('email') || user?.pendingEmail || user?.email || '';

  const [emailInput, setEmailInput] = useState(emailParam);
  const [status, setStatus] = useState<'idle' | 'verifying' | 'verified' | 'error'>(
    tokenParam ? 'verifying' : 'idle'
  );
  const [verifiedOnVisit, setVerifiedOnVisit] = useState(false);
  const [message, setMessage] = useState('');
  const [resendMsg, setResendMsg] = useState('');
  const [resendErr, setResendErr] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  const port = typeof window !== 'undefined' ? window.location.port : '';
  const alreadyVerified = Boolean(user && user.emailVerified && !user.pendingEmail && !verifiedOnVisit);

  useEffect(() => {
    if (user?.pendingEmail) {
      setEmailInput(user.pendingEmail);
    } else if (emailParam) {
      setEmailInput(prev => prev || emailParam);
    }
  }, [user?.pendingEmail, emailParam]);

  useEffect(() => {
    const onFocus = () => {
      if (user && !verifiedOnVisit) {
        void refreshUser();
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [user, verifiedOnVisit, refreshUser]);

  useEffect(() => {
    if (loading || !tokenParam || alreadyVerified) return;
    let active = true;

    (async () => {
      setStatus('verifying');
      try {
        const res = await apiRequest<{ message: string; user?: AuthUser }>('/api/auth/verify-email', {
          method: 'POST',
          body: { token: tokenParam },
        });
        if (!active) return;
        setVerifiedOnVisit(true);
        if (res.user) setUser(res.user);
        setStatus('verified');
        setMessage(res.message);
      } catch (err) {
        if (!active) return;
        setStatus('error');
        setMessage(
          err instanceof ApiError
            ? err.message
            : 'Unable to verify this email link. It may have expired or been used.'
        );
      }
    })();

    return () => {
      active = false;
    };
  }, [loading, tokenParam, alreadyVerified, setUser]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0805] text-[#ede4dc] pt-36 text-center text-sm">
        Checking verification status...
      </div>
    );
  }

  if (alreadyVerified) {
    const adminAllowedHere = user?.role === 'admin' && port !== '3000';
    return <Navigate to={adminAllowedHere ? '/admin/dashboard' : '/account'} replace />;
  }

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendErr('');
    setResendMsg('');
    if (!emailInput.trim()) {
      setResendErr('Please enter your registered email address.');
      return;
    }

    setResending(true);
    try {
      const res = await apiRequest<{ message: string; cooldownSeconds?: number }>(
        '/api/auth/resend-verification',
        {
          method: 'POST',
          body: { email: emailInput.trim() },
        }
      );
      setResendMsg(res.message);
      setCooldown(res.cooldownSeconds || 60);
    } catch (err) {
      if (err instanceof ApiError && err.retryAfterSeconds) {
        setCooldown(err.retryAfterSeconds);
      }
      const errMsg = err instanceof ApiError ? err.message : 'Unable to resend verification email.';
      setResendErr(errMsg);
      if (/already verified/i.test(errMsg)) {
        await refreshUser();
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0805] text-[#ede4dc] pt-28 pb-24 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <ScrollReveal>
          <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-8 sm:p-10 shadow-2xl text-center space-y-6">
            {status === 'verifying' && (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center mx-auto text-emerald-300 animate-pulse">
                  <MailCheck className="w-8 h-8" />
                </div>
                <h1 className="font-serif text-3xl text-[#f9f6f2]">Verifying Your Email...</h1>
                <p className="text-sm text-[#d5c4b4]/75">
                  Confirming your single-use cryptographic verification token.
                </p>
              </>
            )}

            {status === 'verified' && (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-950 border border-emerald-400/50 flex items-center justify-center mx-auto text-emerald-300 shadow-lg">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-[0.25em] text-emerald-400 font-semibold">
                    Verification Complete
                  </span>
                  <h1 className="font-serif text-3xl text-[#f9f6f2] mt-1">
                    Your Email Is Verified
                  </h1>
                  <p className="text-sm text-[#d5c4b4]/80 mt-2">{message}</p>
                </div>

                <div className="space-y-3 pt-2">
                  <Link
                    to="/catalog"
                    className="w-full py-3.5 rounded-full text-xs font-semibold tracking-wider uppercase bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] hover:brightness-110 shadow-xl transition-all flex items-center justify-center gap-2"
                  >
                    <span>Proceed to Jammu Catalog</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link
                    to={user ? '/account' : '/login'}
                    className="w-full py-3.5 rounded-full text-xs font-semibold tracking-wider uppercase bg-[#251a13] hover:bg-[#38281d] text-[#ede4dc] border border-[#38281d] transition-colors flex items-center justify-center"
                  >
                    {user ? 'Open My Patron Account' : 'Sign In to Your Account'}
                  </Link>
                </div>
              </>
            )}

            {(status === 'idle' || status === 'error') && (
              <>
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto border ${
                    status === 'error'
                      ? 'bg-red-950/60 border-red-500/40 text-red-300'
                      : 'bg-emerald-950/60 border-[#dfc471]/40 text-[#dfc471]'
                  }`}
                >
                  {status === 'error' ? <AlertCircle className="w-8 h-8" /> : <MailCheck className="w-8 h-8" />}
                </div>

                <div>
                  <span className="text-[11px] uppercase tracking-[0.25em] text-[#dfc471] font-semibold">
                    {status === 'error' ? 'Verification Issue' : 'Check Your Inbox'}
                  </span>
                  <h1 className="font-serif text-3xl text-[#f9f6f2] mt-1">
                    {status === 'error' ? 'Verification Link Unavailable' : 'Verify Your Email Address'}
                  </h1>
                  <p className="text-xs sm:text-sm text-[#d5c4b4]/80 mt-2 leading-relaxed">
                    {status === 'error'
                      ? message
                      : 'We sent a single-use verification link (valid for 24 hours). You may continue browsing, and verify before completing checkout.'}
                  </p>
                </div>

                {resendMsg && (
                  <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 text-xs text-left">
                    {resendMsg}
                  </div>
                )}
                {resendErr && (
                  <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs text-left">
                    {resendErr}
                  </div>
                )}

                {status === 'error' && /already verified/i.test(message) ? (
                  <div className="space-y-3 pt-2">
                    <Link
                      to={user ? '/account' : '/login'}
                      className="w-full py-3.5 rounded-full text-xs font-semibold tracking-wider uppercase bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] hover:brightness-110 shadow-xl transition-all flex items-center justify-center gap-2"
                    >
                      <span>{user ? 'Open My Patron Account' : 'Sign In to Your Account'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                ) : (
                  <form onSubmit={handleResend} className="space-y-3 text-left pt-2">
                    <label className="block text-xs uppercase tracking-wider text-[#d5c4b4] font-medium">
                      Resend Verification Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[#d5c4b4]/60 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="email"
                        required
                        value={emailInput}
                        onChange={e => setEmailInput(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2] focus:outline-none focus:border-[#dfc471]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={resending || cooldown > 0}
                      className="w-full py-3.5 rounded-full text-xs font-semibold tracking-wider uppercase bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] hover:brightness-110 transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${resending ? 'animate-spin' : ''}`} />
                      <span>
                        {cooldown > 0
                          ? `Resend Available in ${cooldown}s`
                          : resending
                          ? 'Sending...'
                          : 'Resend Verification Link'}
                      </span>
                    </button>
                  </form>
                )}

                <div className="pt-3 border-t border-[#38281d] flex items-center justify-between text-xs text-[#d5c4b4]/70">
                  <Link to="/catalog" className="hover:text-[#dfc471]">
                    Browse Catalog
                  </Link>
                  <Link to="/login" className="hover:text-[#dfc471]">
                    Back to Sign In
                  </Link>
                </div>
              </>
            )}
          </div>
        </ScrollReveal>
      </div>
    </div>
  );
}

