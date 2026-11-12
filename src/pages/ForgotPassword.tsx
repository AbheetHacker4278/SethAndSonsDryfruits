import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
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
      setError('Please enter your email address.');
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
    <div className="min-h-screen bg-[#0d0805] text-[#ede4dc] pt-28 pb-24 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <ScrollReveal>
          <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-8 sm:p-10 shadow-2xl space-y-6">
            <div className="text-center">
              <span className="text-[11px] uppercase tracking-[0.25em] text-[#dfc471] font-semibold">
                Account Recovery
              </span>
              <h1 className="font-serif text-3xl text-[#f9f6f2] mt-1">
                Forgot Your Password?
              </h1>
              <p className="text-xs sm:text-sm text-[#d5c4b4]/75 mt-2">
                Enter your registered email address and we will send you a single-use password reset link valid for 30 minutes.
              </p>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {submittedMsg ? (
              <div className="p-5 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-100 text-xs sm:text-sm space-y-2">
                <div className="flex items-center gap-2 font-semibold text-emerald-300">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Reset Request Processed</span>
                </div>
                <p className="leading-relaxed">{submittedMsg}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-[#d5c4b4] mb-1.5">
                    Registered Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#d5c4b4]/60 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2] focus:outline-none focus:border-[#dfc471]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 rounded-full text-xs font-semibold tracking-wider uppercase bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] hover:brightness-110 shadow-xl transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <span>{submitting ? 'Sending Link...' : 'Send Reset Link'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            <div className="pt-4 border-t border-[#38281d] flex items-center justify-between text-xs text-[#d5c4b4]/75">
              <Link to="/login" className="inline-flex items-center gap-1.5 hover:text-[#dfc471]">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </Link>
              <Link to="/register" className="hover:text-[#dfc471]">
                Create Account
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </div>
  );
}

