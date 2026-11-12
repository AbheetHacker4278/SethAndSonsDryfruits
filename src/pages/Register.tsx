import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  User,
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import ScrollReveal from '../components/ScrollReveal';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import { useAuth } from '../context/AuthContext';
import { apiRequest, ApiError, AuthUser } from '../services/api';
import { evaluatePasswordStrength } from '../utils/passwordStrength';

export default function Register() {
  const navigate = useNavigate();
  const { setUser } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(true);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!fullName.trim() || fullName.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    const cleanDigits = mobileNumber.replace(/\D/g, '');
    if (cleanDigits.length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }
    const strength = evaluatePasswordStrength(password);
    if (!strength.valid) {
      setError('Please choose a stronger password meeting all security requirements.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Password and Confirm Password do not match.');
      return;
    }
    if (!acceptTerms) {
      setError('Please accept the Terms & Conditions to create your patron account.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{
        message: string;
        user: AuthUser;
      }>('/api/auth/register', {
        method: 'POST',
        body: {
          fullName: fullName.trim(),
          email: email.trim(),
          mobileNumber: mobileNumber.trim(),
          password,
          confirmPassword,
          acceptTerms: true,
          marketingConsent,
        },
      });

      setSuccessMsg(res.message);
      setUser(res.user);
      navigate(`/verify-email?email=${encodeURIComponent(res.user.email)}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to complete registration.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0805] text-[#ede4dc] pt-28 pb-24 flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <ScrollReveal>
          <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-7 sm:p-10 shadow-2xl">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold uppercase tracking-[0.2em] mb-3">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Patron Registration</span>
              </div>
              <h1 className="font-serif text-3xl sm:text-4xl font-normal text-[#f9f6f2]">
                Create Your Patron Account
              </h1>
              <p className="text-xs sm:text-sm text-[#d5c4b4]/75 mt-2">
                Join Seth And Sons DryFruits for verified Jammu harvests, live order tracking, and seasonal reserve alerts.
              </p>
            </div>

            {error && (
              <div className="mb-6 p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="mb-6 p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 text-xs flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{successMsg} Redirecting to verification...</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-[#d5c4b4] mb-1.5">
                  Full Name *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#d5c4b4]/60 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="e.g. Aarav Mahajan"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2] placeholder-[#d5c4b4]/40 focus:outline-none focus:border-[#dfc471]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-[#d5c4b4] mb-1.5">
                    Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#d5c4b4]/60 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2] placeholder-[#d5c4b4]/40 focus:outline-none focus:border-[#dfc471]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-[#d5c4b4] mb-1.5">
                    Mobile Number *
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-[#d5c4b4]/60 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="tel"
                      required
                      value={mobileNumber}
                      onChange={e => setMobileNumber(e.target.value)}
                      placeholder="9876543210"
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2] placeholder-[#d5c4b4]/40 focus:outline-none focus:border-[#dfc471]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-[#d5c4b4] mb-1.5">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#d5c4b4]/60 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Create a strong password"
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
                <PasswordStrengthMeter password={password} />
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-[#d5c4b4] mb-1.5">
                  Confirm Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#d5c4b4]/60 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className="w-full pl-10 pr-11 py-3 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2] placeholder-[#d5c4b4]/40 focus:outline-none focus:border-[#dfc471]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(p => !p)}
                    aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#d5c4b4]/60 hover:text-[#dfc471] cursor-pointer"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2.5 pt-2">
                <label className="flex items-start gap-2.5 text-xs text-[#d5c4b4] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={e => setAcceptTerms(e.target.checked)}
                    className="mt-0.5 accent-[#dfc471]"
                  />
                  <span>
                    I accept the <strong className="text-[#f9f6f2]">Terms &amp; Conditions</strong> and Privacy Policy of Seth And Sons DryFruits. *
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-[#d5c4b4]/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={marketingConsent}
                    onChange={e => setMarketingConsent(e.target.checked)}
                    className="mt-0.5 accent-[#dfc471]"
                  />
                  <span>
                    Send me new harvest arrivals, festival sale offers, and exclusive patron coupons (you can unsubscribe anytime).
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 rounded-full text-xs font-semibold tracking-wider uppercase bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] hover:brightness-110 shadow-xl transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2 mt-4"
              >
                <span>{submitting ? 'Creating Account...' : 'Create Patron Account'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-[#38281d] text-center text-xs text-[#d5c4b4]/80">
              Already have an account?{' '}
              <Link to="/login" className="text-[#dfc471] font-semibold hover:underline">
                Sign In Here
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </div>
  );
}

