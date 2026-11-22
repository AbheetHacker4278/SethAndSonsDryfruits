import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, ArrowRight, CheckCircle2, AlertCircle, Crown, ShieldCheck } from 'lucide-react';
import ScrollReveal from '../components/ScrollReveal';
import { apiRequest, ApiError } from '../services/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedMsg, setSubmittedMsg] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmittedMsg('');

    if (!email.trim()) {
      setError('Please enter your registered email address.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: { email: email.trim() },
      });
      setSubmittedMsg(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to submit reset request.');
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

      <div className="w-full max-w-lg relative z-10">
        <ScrollReveal>
          {/* Grand Luxury Glassmorphic Card */}
          <div className="relative bg-gradient-to-b from-[#180f0a] via-[#140d09] to-[#110a07] border-2 border-[#dfc471]/35 rounded-3xl p-6 sm:p-10 shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_40px_rgba(212,175,55,0.08)] overflow-hidden space-y-6">
            {/* Top Gold Foil Accent Bar */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#dfc471] to-transparent" />

            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-[#dfc471]/15 to-[#b99225]/15 border border-[#dfc471]/40 text-[#dfc471] text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.22em] mb-3 shadow-[0_0_15px_rgba(223,196,113,0.12)]">
                <Crown className="w-3.5 h-3.5 text-[#dfc471]" />
                <span>Account Recovery • Seth &amp; Sons</span>
              </div>
              <h1 className="font-serif text-3xl sm:text-4xl font-normal text-[#faf6f0] tracking-wide mt-1">
                Forgot Your Password?
              </h1>
              <p className="text-xs sm:text-sm text-[#d5c4b4] mt-2.5 max-w-sm mx-auto leading-relaxed">
                Enter your registered email address and we will generate a secure single-use password reset link valid for 30 minutes.
              </p>
            </div>

            {error && (
              <div className="p-4 rounded-2xl bg-red-950/80 border-2 border-red-500/50 text-red-200 text-xs sm:text-sm flex items-start gap-3 shadow-lg">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">{error}</span>
              </div>
            )}

            {submittedMsg ? (
              <div className="p-5 rounded-2xl bg-emerald-950/80 border-2 border-emerald-500/50 text-emerald-100 text-xs sm:text-sm space-y-2.5 shadow-lg">
                <div className="flex items-center gap-2 font-bold text-emerald-300">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>Reset Instructions Dispatched</span>
                </div>
                <p className="leading-relaxed text-[#ede4dc]">{submittedMsg}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#f5eed3] mb-1.5">
                    Registered Email Address <span className="text-[#dfc471] font-bold">*</span>
                  </label>
                  <div className="relative group">
                    <Mail className="w-4 h-4 text-[#dfc471] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-[#f3dda2]" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@domain.com"
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-[#231710] border-2 border-[#543d2c] hover:border-[#dfc471]/60 focus:border-[#dfc471] focus:ring-4 focus:ring-[#dfc471]/20 focus:bg-[#2a1a13] text-sm sm:text-base text-white placeholder:text-[#a89584] placeholder:font-normal focus:outline-none transition-all shadow-inner"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-4 px-6 rounded-full text-xs sm:text-sm font-bold tracking-[0.2em] uppercase bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] hover:brightness-110 active:scale-[0.99] shadow-[0_10px_30px_rgba(212,175,55,0.35)] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
                >
                  <span>{submitting ? 'Sending Link...' : 'Send Reset Link'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            <div className="pt-5 border-t border-[#342419] flex items-center justify-between text-xs text-[#d5c4b4]">
              <Link
                to="/login"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="inline-flex items-center gap-1.5 text-[#dfc471] font-semibold hover:text-[#f3dda2] transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </Link>
              <Link
                to="/register"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="text-[#d5c4b4] hover:text-[#dfc471] font-medium transition-colors"
              >
                Create Account
              </Link>
            </div>

            <div className="pt-4 border-t border-[#291b12] flex items-center justify-center gap-2 text-[11px] text-[#a89584]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#dfc471]" />
              <span>Encrypted Single-Use Verification Link</span>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </div>
  );
}
