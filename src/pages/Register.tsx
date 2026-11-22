import { useState, useEffect } from 'react';
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
  MapPin,
  Home,
  Building,
  Crown,
  Sparkles,
  Check,
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
  const [houseFlat, setHouseFlat] = useState('');
  const [streetArea, setStreetArea] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [country, setCountry] = useState('India');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(true);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!fullName.trim() || fullName.trim().length < 2) {
      setError('Please enter your full name (minimum 2 characters).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError('Please enter a valid email address (e.g. name@domain.com).');
      return;
    }
    const cleanDigits = mobileNumber.replace(/\D/g, '');
    if (cleanDigits.length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!houseFlat.trim()) {
      setError('House / Flat number is mandatory for courier shipping.');
      return;
    }
    if (!streetArea.trim()) {
      setError('Street / Area / Locality is mandatory for courier shipping.');
      return;
    }
    if (!city.trim() || city.trim().length < 2) {
      setError('City is mandatory for shipping delivery.');
      return;
    }
    if (!state.trim() || state.trim().length < 2) {
      setError('State is mandatory.');
      return;
    }
    const cleanPin = pincode.replace(/\D/g, '');
    if (!/^\d{6}$/.test(cleanPin)) {
      setError('Please enter a valid 6-digit postal PIN code.');
      return;
    }
    if (!country.trim()) {
      setError('Country is mandatory.');
      return;
    }
    const strength = evaluatePasswordStrength(password);
    if (!strength.valid) {
      setError('Please choose a stronger password meeting all 5 security requirements below.');
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
          houseFlat: houseFlat.trim(),
          streetArea: streetArea.trim(),
          city: city.trim(),
          state: state.trim(),
          pincode: cleanPin,
          country: country.trim() || 'India',
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

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <div className="relative min-h-screen bg-[#0c0704] text-[#ede4dc] pt-28 pb-24 flex items-center justify-center px-4 sm:px-6 overflow-hidden">
      {/* Ambient Luxury Lighting Orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-48 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(223,196,113,0.14)_0%,transparent_70%)] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-12 -right-24 w-[500px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(185,146,37,0.08)_0%,transparent_70%)] blur-2xl"
      />

      <div className="w-full max-w-2xl relative z-10">
        <ScrollReveal>
          {/* Grand Luxury Glassmorphic Card */}
          <div className="relative bg-gradient-to-b from-[#180f0a] via-[#140d09] to-[#110a07] border-2 border-[#dfc471]/35 rounded-3xl p-6 sm:p-10 shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_40px_rgba(212,175,55,0.08)] overflow-hidden">
            {/* Top Gold Foil Accent Bar */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#dfc471] to-transparent" />

            {/* Header Section */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-[#dfc471]/15 to-[#b99225]/15 border border-[#dfc471]/40 text-[#dfc471] text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.22em] mb-3.5 shadow-[0_0_15px_rgba(223,196,113,0.12)]">
                <Crown className="w-3.5 h-3.5 text-[#dfc471]" />
                <span>Patron Registration • Seth &amp; Sons</span>
              </div>
              <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal text-[#faf6f0] tracking-wide">
                Join The Royal Reserve
              </h1>
              <p className="text-xs sm:text-sm text-[#d5c4b4] mt-2.5 max-w-lg mx-auto leading-relaxed">
                Register as a distinguished patron for direct Jammu valley harvests, batch-tested saffron, live courier tracking, and seasonal member allocations.
              </p>
            </div>

            {/* Error Notification */}
            {error && (
              <div className="mb-6 p-4 rounded-2xl bg-red-950/80 border-2 border-red-500/50 text-red-200 text-xs sm:text-sm flex items-start gap-3 shadow-lg">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">{error}</span>
              </div>
            )}

            {/* Success Notification */}
            {successMsg && (
              <div className="mb-6 p-4 rounded-2xl bg-emerald-950/80 border-2 border-emerald-500/50 text-emerald-200 text-xs sm:text-sm flex items-start gap-3 shadow-lg">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">{successMsg} Redirecting to verification...</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-7">
              {/* SECTION 1: Personal Profile */}
              <div className="bg-[#170e0a]/80 border border-[#3e2b1e] rounded-2xl p-4 sm:p-6 space-y-4">
                <div className="flex items-center gap-2.5 pb-2 border-b border-[#342419]">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#dfc471]/20 border border-[#dfc471]/50 text-[11px] font-bold text-[#dfc471]">
                    1
                  </span>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-[#dfc471] flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    <span>Patron Identity &amp; Contact</span>
                  </h2>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#f5eed3] mb-1.5">
                    Full Name <span className="text-[#dfc471] font-bold">*</span>
                  </label>
                  <div className="relative group">
                    <User className="w-4 h-4 text-[#dfc471] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-[#f3dda2]" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="e.g. Aarav Mahajan"
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-[#231710] border-2 border-[#543d2c] hover:border-[#dfc471]/60 focus:border-[#dfc471] focus:ring-4 focus:ring-[#dfc471]/20 focus:bg-[#2a1a13] text-sm sm:text-base text-white placeholder:text-[#a89584] placeholder:font-normal focus:outline-none transition-all shadow-inner"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#f5eed3] mb-1.5">
                      Email Address <span className="text-[#dfc471] font-bold">*</span>
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

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#f5eed3] mb-1.5">
                      Mobile Number <span className="text-[#dfc471] font-bold">*</span>
                    </label>
                    <div className="relative group">
                      <Phone className="w-4 h-4 text-[#dfc471] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-[#f3dda2]" />
                      <input
                        type="tel"
                        required
                        value={mobileNumber}
                        onChange={e => setMobileNumber(e.target.value)}
                        placeholder="10-digit mobile number"
                        className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-[#231710] border-2 border-[#543d2c] hover:border-[#dfc471]/60 focus:border-[#dfc471] focus:ring-4 focus:ring-[#dfc471]/20 focus:bg-[#2a1a13] text-sm sm:text-base text-white placeholder:text-[#a89584] placeholder:font-normal focus:outline-none transition-all shadow-inner"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Mandatory Shipping Address */}
              <div className="bg-[#170e0a]/80 border border-[#3e2b1e] rounded-2xl p-4 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#342419]">
                  <div className="flex items-center gap-2.5">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#dfc471]/20 border border-[#dfc471]/50 text-[11px] font-bold text-[#dfc471]">
                      2
                    </span>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-[#dfc471] flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Mandatory Shipping Address</span>
                    </h2>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider font-semibold px-2.5 py-0.5 rounded-full bg-[#dfc471]/15 border border-[#dfc471]/35 text-[#dfc471]">
                    Required for Courier Delivery
                  </span>
                </div>

                <p className="text-xs text-[#d5c4b4]/90 -mt-1">
                  Ensure accurate address details for safe, temperature-aware courier dispatch from Jammu.
                </p>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#f5eed3] mb-1.5">
                    House / Flat / Villa / Suite <span className="text-[#dfc471] font-bold">*</span>
                  </label>
                  <div className="relative group">
                    <Home className="w-4 h-4 text-[#dfc471] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-[#f3dda2]" />
                    <input
                      type="text"
                      required
                      value={houseFlat}
                      onChange={e => setHouseFlat(e.target.value)}
                      placeholder="e.g. Flat 402, Royal Residency / House 12"
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-[#231710] border-2 border-[#543d2c] hover:border-[#dfc471]/60 focus:border-[#dfc471] focus:ring-4 focus:ring-[#dfc471]/20 focus:bg-[#2a1a13] text-sm sm:text-base text-white placeholder:text-[#a89584] placeholder:font-normal focus:outline-none transition-all shadow-inner"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#f5eed3] mb-1.5">
                    Street / Area / Locality / Landmark <span className="text-[#dfc471] font-bold">*</span>
                  </label>
                  <div className="relative group">
                    <Building className="w-4 h-4 text-[#dfc471] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-[#f3dda2]" />
                    <input
                      type="text"
                      required
                      value={streetArea}
                      onChange={e => setStreetArea(e.target.value)}
                      placeholder="e.g. VIP Road, Near City Center Landmark"
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-[#231710] border-2 border-[#543d2c] hover:border-[#dfc471]/60 focus:border-[#dfc471] focus:ring-4 focus:ring-[#dfc471]/20 focus:bg-[#2a1a13] text-sm sm:text-base text-white placeholder:text-[#a89584] placeholder:font-normal focus:outline-none transition-all shadow-inner"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#f5eed3] mb-1.5">
                      City <span className="text-[#dfc471] font-bold">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={city}
                      onChange={e => setCity(e.target.value)}
                      placeholder="e.g. Mumbai, Delhi, Surat"
                      className="w-full px-4 py-3.5 rounded-xl bg-[#231710] border-2 border-[#543d2c] hover:border-[#dfc471]/60 focus:border-[#dfc471] focus:ring-4 focus:ring-[#dfc471]/20 focus:bg-[#2a1a13] text-sm sm:text-base text-white placeholder:text-[#a89584] placeholder:font-normal focus:outline-none transition-all shadow-inner"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#f5eed3] mb-1.5">
                      State <span className="text-[#dfc471] font-bold">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={state}
                      onChange={e => setState(e.target.value)}
                      placeholder="e.g. Maharashtra, Gujarat"
                      className="w-full px-4 py-3.5 rounded-xl bg-[#231710] border-2 border-[#543d2c] hover:border-[#dfc471]/60 focus:border-[#dfc471] focus:ring-4 focus:ring-[#dfc471]/20 focus:bg-[#2a1a13] text-sm sm:text-base text-white placeholder:text-[#a89584] placeholder:font-normal focus:outline-none transition-all shadow-inner"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#f5eed3] mb-1.5">
                      PIN Code (6 digits) <span className="text-[#dfc471] font-bold">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={pincode}
                      onChange={e => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="e.g. 400001"
                      className="w-full px-4 py-3.5 rounded-xl bg-[#231710] border-2 border-[#543d2c] hover:border-[#dfc471]/60 focus:border-[#dfc471] focus:ring-4 focus:ring-[#dfc471]/20 focus:bg-[#2a1a13] text-sm sm:text-base text-white placeholder:text-[#a89584] placeholder:font-normal focus:outline-none transition-all tracking-wider shadow-inner"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#f5eed3] mb-1.5">
                      Country <span className="text-[#dfc471] font-bold">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={country}
                      onChange={e => setCountry(e.target.value)}
                      placeholder="India"
                      className="w-full px-4 py-3.5 rounded-xl bg-[#231710] border-2 border-[#543d2c] hover:border-[#dfc471]/60 focus:border-[#dfc471] focus:ring-4 focus:ring-[#dfc471]/20 focus:bg-[#2a1a13] text-sm sm:text-base text-white placeholder:text-[#a89584] placeholder:font-normal focus:outline-none transition-all shadow-inner"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 3: Account Security */}
              <div className="bg-[#170e0a]/80 border border-[#3e2b1e] rounded-2xl p-4 sm:p-6 space-y-4">
                <div className="flex items-center gap-2.5 pb-2 border-b border-[#342419]">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#dfc471]/20 border border-[#dfc471]/50 text-[11px] font-bold text-[#dfc471]">
                    3
                  </span>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-[#dfc471] flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Account Security</span>
                  </h2>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#f5eed3] mb-1.5">
                    Password <span className="text-[#dfc471] font-bold">*</span>
                  </label>
                  <div className="relative group">
                    <Lock className="w-4 h-4 text-[#dfc471] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors group-focus-within:text-[#f3dda2]" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Create a strong password (min 8 chars)"
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
                      Confirm Password <span className="text-[#dfc471] font-bold">*</span>
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
                      placeholder="Re-enter your password"
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
              </div>

              {/* SECTION 4: Patron Consents */}
              <div className="space-y-3 pt-1">
                <label className="flex items-start gap-3 p-3 rounded-xl bg-[#170e0a]/60 border border-[#38281d] hover:border-[#dfc471]/40 transition-colors cursor-pointer text-xs sm:text-sm text-[#ede4dc]">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={e => setAcceptTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-[#543d2c] accent-[#dfc471] cursor-pointer shrink-0"
                  />
                  <span className="leading-relaxed">
                    I accept the <strong className="text-[#f5eed3] font-semibold underline underline-offset-2 decoration-[#dfc471]/60">Terms &amp; Conditions</strong> and Privacy Policy of Seth And Sons DryFruits. <span className="text-[#dfc471] font-bold">*</span>
                  </span>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-xl bg-[#170e0a]/60 border border-[#38281d] hover:border-[#dfc471]/40 transition-colors cursor-pointer text-xs sm:text-sm text-[#d5c4b4]">
                  <input
                    type="checkbox"
                    checked={marketingConsent}
                    onChange={e => setMarketingConsent(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-[#543d2c] accent-[#dfc471] cursor-pointer shrink-0"
                  />
                  <span className="leading-relaxed">
                    Send me private notices on fresh valley harvests, festival reserve crates, and exclusive member discounts (unsubscribe anytime).
                  </span>
                </label>
              </div>

              {/* Submit CTA Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 px-6 rounded-full text-xs sm:text-sm font-bold tracking-[0.2em] uppercase bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] hover:brightness-110 active:scale-[0.99] shadow-[0_10px_30px_rgba(212,175,55,0.35)] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-5"
              >
                <Sparkles className="w-4 h-4" />
                <span>{submitting ? 'Creating Patron Account...' : 'Create Patron Account'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Bottom Navigation */}
            <div className="mt-8 pt-6 border-t border-[#342419] text-center text-xs sm:text-sm text-[#d5c4b4]">
              Already a registered patron?{' '}
              <Link
                to="/login"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="text-[#dfc471] font-bold hover:text-[#f3dda2] underline underline-offset-4 decoration-[#dfc471]/50 hover:decoration-[#dfc471] transition-colors ml-1"
              >
                Sign In To Your Account
              </Link>
            </div>

            {/* Trust Assurances Footer */}
            <div className="mt-6 pt-5 border-t border-[#291b12] flex flex-wrap items-center justify-center gap-4 text-[11px] text-[#a89584]">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#dfc471]" />
                256-Bit SSL Encryption
              </span>
              <span>•</span>
              <span>Direct Jammu Harvests</span>
              <span>•</span>
              <span>Verified Patron Data Protection</span>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </div>
  );
}
