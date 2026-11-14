import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  User,
  Package,
  Truck,
  MapPin,
  Heart,
  Bell,
  Ticket,
  KeyRound,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Upload,
  Plus,
  Trash2,
  ArrowRight,
  MailCheck,
  ShieldCheck,
  Copy,
  MailX,
  Edit2,
  Home,
  Building,
  Check,
  Sparkles,
} from 'lucide-react';
import { isSuratCity } from '../data/products';
import { useAuth } from '../context/AuthContext';
import {
  AddressItem,
  apiRequest,
  ApiError,
  apiUpload,
  AuthUser,
  CouponItem,
  NotificationItem,
  PersistedOrder,
} from '../services/api';
import { formatINR } from '../utils/priceCalculator';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter';
import { evaluatePasswordStrength } from '../utils/passwordStrength';

type AccountTab =
  | 'overview'
  | 'profile'
  | 'orders'
  | 'track'
  | 'addresses'
  | 'wishlist'
  | 'notifications'
  | 'preferences'
  | 'coupons'
  | 'password';

interface AccountProps {
  onReorder: (items: { productId: string; quantity: number }[]) => void;
}

export default function Account({ onReorder }: AccountProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, setUser, logout } = useAuth();

  const initialTab = (searchParams.get('tab') as AccountTab) || 'overview';
  const [activeTab, setActiveTab] = useState<AccountTab>(initialTab);

  const [orders, setOrders] = useState<PersistedOrder[]>([]);
  const [addresses, setAddresses] = useState<AddressItem[]>([]);
  const [wishlist, setWishlist] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [overviewStats, setOverviewStats] = useState({
    totalOrders: 0,
    loyaltyPoints: 0,
    unreadNotifications: 0,
    availableCouponsCount: 0,
  });

  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [trackSearch, setTrackSearch] = useState('');

  // Profile form
  const [nameInput, setNameInput] = useState(user?.name || '');
  const [phoneInput, setPhoneInput] = useState(user?.phone || '');
  const [newEmailInput, setNewEmailInput] = useState('');
  const [emailChangePassword, setEmailChangePassword] = useState('');

  // Address form
  const [addrForm, setAddrForm] = useState({
    label: 'Home',
    fullName: user?.name || '',
    phone: user?.phone || '',
    houseFlat: user?.shippingAddress?.houseFlat || '',
    streetArea: user?.shippingAddress?.streetArea || '',
    city: user?.shippingAddress?.city || '',
    state: user?.shippingAddress?.state || '',
    pincode: user?.shippingAddress?.pincode || '',
    country: user?.shippingAddress?.country || 'India',
    isDefault: true,
  });
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Email preferences state
  const [mktPrefs, setMktPrefs] = useState({
    newProductAnnouncements: Boolean(user?.emailPreferences?.marketing?.newProductAnnouncements),
    festivalOffers: Boolean(user?.emailPreferences?.marketing?.festivalOffers),
    promotionalDiscounts: Boolean(user?.emailPreferences?.marketing?.promotionalDiscounts),
    specialCampaigns: Boolean(user?.emailPreferences?.marketing?.specialCampaigns),
    newsletter: Boolean(user?.emailPreferences?.marketing?.newsletter),
  });

  const [copiedCode, setCopiedCode] = useState('');

  const loadAccountData = async () => {
    try {
      const [ov, ordRes, addrRes, wishRes, notifRes] = await Promise.all([
        apiRequest<any>('/api/account/overview'),
        apiRequest<{ orders: PersistedOrder[] }>('/api/orders'),
        apiRequest<{ addresses: AddressItem[] }>('/api/account/addresses'),
        apiRequest<{ items: any[] }>('/api/account/wishlist'),
        apiRequest<{ notifications: NotificationItem[] }>('/api/account/notifications'),
      ]);
      setUser(ov.user);
      setOverviewStats(ov.stats);
      setCoupons(ov.availableCoupons || []);
      setOrders(ordRes.orders || []);
      setAddresses(addrRes.addresses || []);
      setWishlist(wishRes.items || []);
      setNotifications(notifRes.notifications || []);
      setNameInput(ov.user.name);
      setPhoneInput(ov.user.phone);
      setMktPrefs({
        newProductAnnouncements: Boolean(ov.user.emailPreferences?.marketing?.newProductAnnouncements),
        festivalOffers: Boolean(ov.user.emailPreferences?.marketing?.festivalOffers),
        promotionalDiscounts: Boolean(ov.user.emailPreferences?.marketing?.promotionalDiscounts),
        specialCampaigns: Boolean(ov.user.emailPreferences?.marketing?.specialCampaigns),
        newsletter: Boolean(ov.user.emailPreferences?.marketing?.newsletter),
      });
    } catch {
      // handled by route guard
    }
  };

  useEffect(() => {
    if (user) {
      void loadAccountData();
    }
  }, [user?.id]);

  const switchTab = (tab: AccountTab) => {
    setActiveTab(tab);
    setFeedback(null);
    setSearchParams({ tab });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiRequest<{ message: string; user: AuthUser }>('/api/account/profile', {
        method: 'PUT',
        body: { name: nameInput, phone: phoneInput },
      });
      setUser(res.user);
      setFeedback({ type: 'ok', text: res.message });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof ApiError ? err.message : 'Update failed.' });
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeedback(null);

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setFeedback({ type: 'err', text: 'Please select a PNG, JPG, or WEBP image.' });
      e.target.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFeedback({ type: 'err', text: 'Profile image must be 2 MB or smaller.' });
      e.target.value = '';
      return;
    }

    const fd = new FormData();
    fd.append('avatar', file);
    try {
      const res = await apiUpload<{ message: string; user: AuthUser }>('/api/account/avatar', fd);
      setUser(res.user);
      setFeedback({ type: 'ok', text: res.message });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setFeedback({ type: 'err', text: 'Your session has expired. Please sign in again.' });
        return;
      }
      setFeedback({ type: 'err', text: err instanceof ApiError ? err.message : 'Avatar upload failed.' });
    } finally {
      e.target.value = '';
    }
  };

  const handleRequestEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiRequest<{ message: string; user: AuthUser }>('/api/account/change-email', {
        method: 'POST',
        body: { newEmail: newEmailInput, currentPassword: emailChangePassword },
      });
      setUser(res.user);
      setNewEmailInput('');
      setEmailChangePassword('');
      setFeedback({ type: 'ok', text: res.message });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof ApiError ? err.message : 'Could not change email.' });
    }
  };

  const handleResendVerification = async () => {
    if (!user) return;
    setFeedback(null);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/resend-verification', {
        method: 'POST',
        body: { email: user.email },
      });
      setFeedback({ type: 'ok', text: res.message });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof ApiError ? err.message : 'Unable to resend.' });
    }
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const cleanPhone = addrForm.phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setFeedback({ type: 'err', text: 'Please enter a valid 10-digit mobile number.' });
      return;
    }
    if (!addrForm.houseFlat.trim()) {
      setFeedback({ type: 'err', text: 'House Number / Flat Number is required.' });
      return;
    }
    if (!addrForm.streetArea.trim()) {
      setFeedback({ type: 'err', text: 'Street / Area / Locality is required.' });
      return;
    }
    if (!addrForm.city.trim()) {
      setFeedback({ type: 'err', text: 'City is required.' });
      return;
    }
    if (!addrForm.state.trim()) {
      setFeedback({ type: 'err', text: 'State is required.' });
      return;
    }
    const cleanPin = addrForm.pincode.replace(/\D/g, '');
    if (!/^\d{6}$/.test(cleanPin)) {
      setFeedback({ type: 'err', text: 'Please enter a valid 6-digit PIN code.' });
      return;
    }

    try {
      const payload = {
        label: addrForm.label.trim() || 'Home',
        fullName: addrForm.fullName.trim(),
        phone: cleanPhone,
        houseFlat: addrForm.houseFlat.trim(),
        streetArea: addrForm.streetArea.trim(),
        city: addrForm.city.trim(),
        state: addrForm.state.trim(),
        pincode: cleanPin,
        country: addrForm.country.trim() || 'India',
        isDefault: Boolean(addrForm.isDefault),
      };

      if (editingAddressId) {
        const res = await apiRequest<{ address: AddressItem; user?: AuthUser }>(`/api/account/addresses/${editingAddressId}`, {
          method: 'PUT',
          body: payload,
        });
        if (res.user) setUser(res.user);
        setEditingAddressId(null);
        setFeedback({ type: 'ok', text: `Shipping address updated successfully.` });
      } else {
        const res = await apiRequest<{ address: AddressItem; user?: AuthUser }>('/api/account/addresses', {
          method: 'POST',
          body: payload,
        });
        if (res.user) setUser(res.user);
        setFeedback({ type: 'ok', text: `Shipping address saved successfully.` });
      }

      setAddrForm({
        label: 'Home',
        fullName: user?.name || '',
        phone: user?.phone || '',
        houseFlat: '',
        streetArea: '',
        city: '',
        state: '',
        pincode: '',
        country: 'India',
        isDefault: false,
      });
      await loadAccountData();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof ApiError ? err.message : 'Failed to save address.' });
    }
  };

  const handleStartEditAddress = (a: AddressItem) => {
    setEditingAddressId(a.id);
    const parts = (a.addressLine || '').split(',');
    setAddrForm({
      label: a.label || 'Home',
      fullName: a.fullName || '',
      phone: a.phone || '',
      houseFlat: a.houseFlat || parts[0]?.trim() || '',
      streetArea: a.streetArea || parts.slice(1).join(', ')?.trim() || '',
      city: a.city || '',
      state: a.state || '',
      pincode: a.pincode || '',
      country: a.country || 'India',
      isDefault: Boolean(a.isDefault),
    });
    setFeedback({ type: 'ok', text: `Editing "${a.label}". Update details in the form below.` });
  };

  const handleSetDefaultAddress = async (a: AddressItem) => {
    setFeedback(null);
    try {
      const res = await apiRequest<{ address: AddressItem; user?: AuthUser }>(`/api/account/addresses/${a.id}`, {
        method: 'PUT',
        body: { ...a, isDefault: true },
      });
      if (res.user) setUser(res.user);
      await loadAccountData();
      setFeedback({ type: 'ok', text: `Primary delivery address updated to ${a.city}.` });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof ApiError ? err.message : 'Unable to update address.' });
    }
  };

  const handleDeleteAddress = async (id: string) => {
    setFeedback(null);
    try {
      const res = await apiRequest<{ message: string; user?: AuthUser }>(`/api/account/addresses/${id}`, { method: 'DELETE' });
      if (res.user) setUser(res.user);
      if (editingAddressId === id) setEditingAddressId(null);
      await loadAccountData();
      setFeedback({ type: 'ok', text: 'Address removed.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof ApiError ? err.message : 'Unable to delete address.' });
    }
  };

  const handleRemoveWishlist = async (productId: string) => {
    setFeedback(null);
    try {
      await apiRequest(`/api/account/wishlist/${productId}`, { method: 'DELETE' });
      await loadAccountData();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof ApiError ? err.message : 'Unable to update wishlist.' });
    }
  };

  const handleMarkNotificationsRead = async (id?: string) => {
    try {
      await apiRequest('/api/account/notifications/read', { method: 'POST', body: id ? { id } : {} });
      await loadAccountData();
    } catch {
      // non-fatal notification update
    }
  };

  const handleSavePreferences = async (unsubscribeAll = false) => {
    setFeedback(null);
    try {
      const res = await apiRequest<{ message: string; user: AuthUser }>('/api/account/preferences', {
        method: 'PUT',
        body: { marketing: mktPrefs, unsubscribeAll },
      });
      setUser(res.user);
      setMktPrefs({
        newProductAnnouncements: Boolean(res.user.emailPreferences?.marketing?.newProductAnnouncements),
        festivalOffers: Boolean(res.user.emailPreferences?.marketing?.festivalOffers),
        promotionalDiscounts: Boolean(res.user.emailPreferences?.marketing?.promotionalDiscounts),
        specialCampaigns: Boolean(res.user.emailPreferences?.marketing?.specialCampaigns),
        newsletter: Boolean(res.user.emailPreferences?.marketing?.newsletter),
      });
      setFeedback({ type: 'ok', text: res.message });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof ApiError ? err.message : 'Failed to update preferences.' });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!evaluatePasswordStrength(newPassword).valid) {
      setFeedback({ type: 'err', text: 'New password does not meet strength requirements.' });
      return;
    }
    try {
      const res = await apiRequest<{ message: string }>('/api/account/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword, confirmPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setFeedback({ type: 'ok', text: res.message });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof ApiError ? err.message : 'Password change failed.' });
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  if (!user) return null;

  const navItems: Array<{ id: AccountTab; label: string; icon: any; badge?: number }> = [
    { id: 'overview', label: 'Account Overview', icon: User },
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'orders', label: 'My Orders', icon: Package, badge: orders.length },
    { id: 'track', label: 'Track My Order', icon: Truck },
    { id: 'addresses', label: 'Saved Addresses', icon: MapPin },
    { id: 'wishlist', label: 'Wishlist', icon: Heart, badge: wishlist.length },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: overviewStats.unreadNotifications },
    { id: 'preferences', label: 'Email Preferences', icon: MailCheck },
    { id: 'coupons', label: 'Coupons & Offers', icon: Ticket, badge: coupons.length },
    { id: 'password', label: 'Change Password', icon: KeyRound },
  ];

  return (
    <div className="min-h-screen bg-[#0d0805] text-[#ede4dc] pt-28 pb-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar */}
        <aside className="lg:col-span-3 space-y-4">
          <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-6 text-center space-y-3">
            <div className="w-20 h-20 rounded-full mx-auto overflow-hidden bg-[#251a13] border-2 border-[#dfc471]/60 flex items-center justify-center text-[#dfc471] text-2xl font-serif">
              {user.profilePicture ? (
                <img src={user.profilePicture} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <h2 className="font-serif text-xl text-[#f9f6f2]">{user.name}</h2>
              <p className="text-xs text-[#d5c4b4]/70 break-all">{user.email}</p>
            </div>
            <div className="flex justify-center">
              {user.emailVerified ? (
                <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-emerald-300">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Verified Patron</span>
                </span>
              ) : (
                <button
                  onClick={handleResendVerification}
                  className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-amber-950/70 border border-amber-500/40 text-amber-200 cursor-pointer"
                >
                  <AlertCircle className="w-3 h-3" />
                  <span>Unverified — Resend Link</span>
                </button>
              )}
            </div>
          </div>

          <nav className="bg-[#150d09] border border-[#38281d] rounded-3xl p-3 space-y-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => switchTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${active
                    ? 'bg-[#064e3b] text-[#dfc471] border border-[#dfc471]/40'
                    : 'text-[#d5c4b4] hover:bg-[#1c120c] hover:text-[#f9f6f2]'
                    }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#251a13] text-[#dfc471]">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}

            <Link
              to="/customer-service"
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-medium text-[#dfc471] hover:bg-[#1c120c] transition-colors mt-1"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Track Complaints / Support</span>
            </Link>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-medium text-red-300 hover:bg-red-950/40 transition-colors cursor-pointer mt-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="lg:col-span-9 space-y-6">
          {!user.emailVerified && (
            <div className="p-4 rounded-2xl bg-amber-950/50 border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="text-xs sm:text-sm text-amber-100">
                <strong>Email Verification Required for Checkout:</strong> Please verify {user.email} to place orders.
              </div>
              <button
                onClick={handleResendVerification}
                className="shrink-0 px-4 py-2 rounded-full text-xs font-semibold bg-[#dfc471] text-[#0d0805] cursor-pointer"
              >
                Resend Verification Email
              </button>
            </div>
          )}

          {feedback && (
            <div
              className={`p-4 rounded-2xl text-xs sm:text-sm flex items-center gap-2.5 border ${feedback.type === 'ok'
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                : 'bg-red-950/60 border-red-500/40 text-red-200'
                }`}
            >
              {feedback.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{feedback.text}</span>
            </div>
          )}

          {/* 1. OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-[#150d09] border border-[#38281d] rounded-2xl p-5">
                  <div className="text-[11px] uppercase tracking-wider text-[#d5c4b4]/60">Total Orders</div>
                  <div className="text-3xl font-bold text-[#dfc471] mt-1">{overviewStats.totalOrders}</div>
                </div>
                <div className="bg-[#150d09] border border-[#38281d] rounded-2xl p-5">
                  <div className="text-[11px] uppercase tracking-wider text-[#d5c4b4]/60">Loyalty Points</div>
                  <div className="text-3xl font-bold text-emerald-400 mt-1">{overviewStats.loyaltyPoints}</div>
                </div>
                <div className="bg-[#150d09] border border-[#38281d] rounded-2xl p-5">
                  <div className="text-[11px] uppercase tracking-wider text-[#d5c4b4]/60">Available Coupons</div>
                  <div className="text-3xl font-bold text-[#f9f6f2] mt-1">{overviewStats.availableCouponsCount}</div>
                </div>
                <div className="bg-[#150d09] border border-[#38281d] rounded-2xl p-5">
                  <div className="text-[11px] uppercase tracking-wider text-[#d5c4b4]/60">Mobile</div>
                  <div className="text-sm font-semibold text-[#ede4dc] mt-2">{user.phone || 'Not set'}</div>
                </div>
              </div>

              <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-6 sm:p-8 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-2xl text-[#f9f6f2]">Recent Orders</h3>
                  <button
                    onClick={() => switchTab('orders')}
                    className="text-xs text-[#dfc471] hover:underline cursor-pointer"
                  >
                    View All Orders →
                  </button>
                </div>

                {orders.length === 0 ? (
                  <p className="text-xs text-[#d5c4b4]/70">No orders placed yet. Explore our Jammu catalog!</p>
                ) : (
                  <div className="divide-y divide-[#251a13]">
                    {orders.slice(0, 4).map(ord => (
                      <div key={ord.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-sm text-[#f9f6f2]">#{ord.orderNumber}</div>
                          <div className="text-xs text-[#d5c4b4]/65">
                            {new Date(ord.createdAt).toLocaleDateString('en-IN')} • {ord.items.length} item(s)
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 capitalize">
                            {ord.status.replace(/_/g, ' ')}
                          </span>
                          <span className="font-bold text-sm text-[#dfc471]">{formatINR(ord.totalAmount)}</span>
                          <Link
                            to={`/account/orders/${ord.orderNumber}`}
                            className="text-xs px-3 py-1.5 rounded-full bg-[#251a13] hover:bg-[#dfc471] text-[#ede4dc] hover:text-[#0d0805]"
                          >
                            Track
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. MY PROFILE */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-6 sm:p-8 space-y-6">
                <h2 className="font-serif text-2xl text-[#f9f6f2]">Personal Details &amp; Avatar</h2>

                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-[#251a13] border border-[#dfc471]/50 flex items-center justify-center text-xl font-serif text-[#dfc471]">
                    {user.profilePicture ? (
                      <img src={user.profilePicture} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      user.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <label className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-[#251a13] hover:bg-[#38281d] border border-[#38281d] cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-[#dfc471]" />
                    <span>Upload Profile Picture</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleAvatarUpload} />
                  </label>
                </div>

                <form onSubmit={handleSaveProfile} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-[#d5c4b4] mb-1.5">Full Name</label>
                    <input
                      type="text"
                      required
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-[#d5c4b4] mb-1.5">Mobile Number</label>
                    <input
                      type="tel"
                      required
                      value={phoneInput}
                      onChange={e => setPhoneInput(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      className="px-6 py-3 rounded-full text-xs font-semibold uppercase tracking-wider bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] cursor-pointer"
                    >
                      Save Profile Changes
                    </button>
                  </div>
                </form>
              </div>

              <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-6 sm:p-8 space-y-4">
                <h3 className="font-serif text-xl text-[#f9f6f2]">Change Email Address</h3>
                <p className="text-xs text-[#d5c4b4]/75">
                  Current Email: <strong className="text-[#f9f6f2]">{user.email}</strong>
                  {user.pendingEmail && (
                    <span className="ml-2 text-amber-300">(Pending verification: {user.pendingEmail})</span>
                  )}
                </p>
                <form onSubmit={handleRequestEmailChange} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    type="email"
                    required
                    value={newEmailInput}
                    onChange={e => setNewEmailInput(e.target.value)}
                    placeholder="New Email Address"
                    className="px-4 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2]"
                  />
                  <input
                    type="password"
                    required
                    value={emailChangePassword}
                    onChange={e => setEmailChangePassword(e.target.value)}
                    placeholder="Current Password to Confirm"
                    className="px-4 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2]"
                  />
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      className="px-6 py-2.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#064e3b] text-[#dfc471] border border-[#dfc471]/40 cursor-pointer"
                    >
                      Send Verification to New Email
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* 3. MY ORDERS */}
          {activeTab === 'orders' && (
            <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-6 sm:p-8 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl text-[#f9f6f2]">My Orders</h2>
                <Link to="/catalog" className="text-xs text-[#dfc471] hover:underline">
                  Browse Catalog →
                </Link>
              </div>
              {orders.length === 0 ? (
                <p className="text-sm text-[#d5c4b4]/70">You have not placed any orders yet.</p>
              ) : (
                <div className="space-y-4">
                  {orders.map(ord => (
                    <div key={ord.id} className="p-5 rounded-2xl bg-[#1c120c] border border-[#38281d] space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-bold text-base text-[#f9f6f2]">#{ord.orderNumber}</span>
                          <span className="ml-3 text-xs px-2.5 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/30 text-emerald-300 capitalize">
                            {ord.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="font-bold text-lg text-[#dfc471]">{formatINR(ord.totalAmount)}</div>
                      </div>
                      <div className="text-xs text-[#d5c4b4]/75">
                        {ord.items.map(i => `${i.productName} (${i.weightLabel ? `${i.quantity} × ${i.weightLabel}` : `${i.quantity} ${i.unit === 'gram' ? 'g' : i.unit === 'ml' ? 'ml' : i.unit === 'piece' ? 'pc' : 'kg'}`})`).join(', ')}
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Link
                          to={`/account/orders/${ord.orderNumber}`}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold bg-[#064e3b] text-[#dfc471] border border-[#dfc471]/40"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>Track My Order</span>
                        </Link>
                        <button
                          onClick={() => {
                            onReorder(ord.items.map(it => ({ productId: it.productId, quantity: it.quantity })));
                            navigate('/catalog');
                          }}
                          className="px-4 py-2 rounded-full text-xs font-semibold bg-[#251a13] hover:bg-[#dfc471] text-[#ede4dc] hover:text-[#0d0805] cursor-pointer"
                        >
                          Reorder Items
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. TRACK MY ORDER */}
          {activeTab === 'track' && (
            <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-6 sm:p-8 space-y-5">
              <h2 className="font-serif text-2xl text-[#f9f6f2]">Track My Order</h2>
              <form
                onSubmit={e => {
                  e.preventDefault();
                  if (trackSearch.trim()) {
                    navigate(`/account/orders/${encodeURIComponent(trackSearch.trim())}`);
                  }
                }}
                className="flex gap-3"
              >
                <input
                  type="text"
                  value={trackSearch}
                  onChange={e => setTrackSearch(e.target.value)}
                  placeholder="Enter Order ID (e.g. AS-ORD-2026-XXXXXX)"
                  className="flex-1 px-4 py-3 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2]"
                />
                <button
                  type="submit"
                  className="px-6 py-3 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#dfc471] text-[#0d0805] cursor-pointer"
                >
                  Track
                </button>
              </form>

              <div className="space-y-2 pt-2">
                {orders.map(ord => (
                  <Link
                    key={ord.id}
                    to={`/account/orders/${ord.orderNumber}`}
                    className="flex items-center justify-between p-4 rounded-xl bg-[#1c120c] border border-[#38281d] hover:border-[#dfc471]/50"
                  >
                    <div>
                      <div className="font-semibold text-sm text-[#f9f6f2]">#{ord.orderNumber}</div>
                      <div className="text-xs text-[#d5c4b4]/70 capitalize">
                        Current Stage: {ord.status.replace(/_/g, ' ')}
                        {ord.shipment ? ` • ${ord.shipment.courierPartner} (${ord.shipment.trackingNumber})` : ''}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#dfc471]" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 5. SAVED ADDRESSES */}
          {activeTab === 'addresses' && (
            <div className="space-y-6">
              {/* Mandatory Shipping Address Prompt if missing */}
              {!user.shippingAddress?.city && (
                <div className="p-4 sm:p-5 rounded-2xl bg-amber-950/40 border border-amber-500/30 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-sm text-[#f9f6f2]">Mandatory Shipping Address</h3>
                    <p className="text-xs text-[#d5c4b4]/80 mt-0.5">
                      A complete shipping address is mandatory before placing an order. Please add your primary delivery address below.
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-6 sm:p-8 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="font-serif text-2xl text-[#f9f6f2]">Saved Shipping Addresses</h2>
                  <span className="text-xs text-[#d5c4b4]/60">Manage your saved delivery destinations</span>
                </div>

                {addresses.length === 0 ? (
                  <p className="text-xs text-[#d5c4b4]/70">No saved addresses found. Please complete the form below.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {addresses.map(a => {
                      const isSurat = isSuratCity(a.city);
                      const displayAddr = a.houseFlat && a.streetArea ? `${a.houseFlat}, ${a.streetArea}` : a.addressLine;
                      return (
                        <div
                          key={a.id}
                          className={`p-4 sm:p-5 rounded-2xl bg-[#1c120c] border transition-all ${Boolean(a.isDefault) ? 'border-[#dfc471] ring-1 ring-[#dfc471]/30' : 'border-[#38281d] hover:border-[#38281d]/80'
                            } space-y-2.5 text-xs`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[#dfc471] uppercase tracking-wider">{a.label || 'Home'}</span>
                              {Boolean(a.isDefault) && (
                                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                                  <Check className="w-3 h-3" />
                                  Default
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleStartEditAddress(a)}
                                className="p-1 rounded-lg hover:bg-[#2a1a12] text-[#d5c4b4]/70 hover:text-[#dfc471] cursor-pointer"
                                title="Edit address"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteAddress(a.id)}
                                className="p-1 rounded-lg hover:bg-red-950/40 text-red-400/70 hover:text-red-400 cursor-pointer"
                                title="Delete address"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="font-medium text-[#f9f6f2]">{a.fullName} ({a.phone})</div>
                          <div className="text-[#d5c4b4]/85 leading-relaxed">
                            {displayAddr}
                            <br />
                            {a.city}, {a.state} - <span className="font-mono text-[#f9f6f2]">{a.pincode}</span>, {a.country || 'India'}
                          </div>

                          <div className="pt-2 border-t border-[#38281d]/60 flex items-center justify-between gap-2">
                            <span className="text-[11px] text-[#d5c4b4]/60 font-medium">
                              {Boolean(a.isDefault) ? 'Primary Delivery Address' : `${a.city}, ${a.state}`}
                            </span>

                            {!Boolean(a.isDefault) && (
                              <button
                                type="button"
                                onClick={() => handleSetDefaultAddress(a)}
                                className="text-[10px] font-semibold text-[#dfc471] hover:underline cursor-pointer"
                              >
                                Set as Default
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Add / Edit Form */}
              <form onSubmit={handleSaveAddress} className="bg-[#150d09] border border-[#38281d] rounded-3xl p-6 sm:p-8 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-serif text-xl text-[#f9f6f2] flex items-center gap-2">
                    {editingAddressId ? <Edit2 className="w-4 h-4 text-[#dfc471]" /> : <Plus className="w-4 h-4 text-[#dfc471]" />}
                    <span>{editingAddressId ? 'Edit Shipping Address' : 'Add New Shipping Address'}</span>
                  </h3>
                  {editingAddressId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAddressId(null);
                        setAddrForm({
                          label: 'Home',
                          fullName: user?.name || '',
                          phone: user?.phone || '',
                          houseFlat: '',
                          streetArea: '',
                          city: '',
                          state: '',
                          pincode: '',
                          country: 'India',
                          isDefault: false,
                        });
                      }}
                      className="text-xs text-[#d5c4b4]/60 hover:text-[#f9f6f2] underline cursor-pointer"
                    >
                      Cancel Editing
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[#d5c4b4]/70 mb-1">Address Label *</label>
                    <input
                      type="text"
                      required
                      value={addrForm.label}
                      onChange={e => setAddrForm({ ...addrForm, label: e.target.value })}
                      placeholder="Home / Office / Other"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[#d5c4b4]/70 mb-1">Recipient Full Name *</label>
                    <input
                      type="text"
                      required
                      value={addrForm.fullName}
                      onChange={e => setAddrForm({ ...addrForm, fullName: e.target.value })}
                      placeholder="Full Name"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[#d5c4b4]/70 mb-1">Mobile Number (10 digits) *</label>
                    <input
                      type="tel"
                      required
                      value={addrForm.phone}
                      onChange={e => setAddrForm({ ...addrForm, phone: e.target.value })}
                      placeholder="9876543210"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[#d5c4b4]/70 mb-1">House Number / Flat Number *</label>
                    <input
                      type="text"
                      required
                      value={addrForm.houseFlat}
                      onChange={e => setAddrForm({ ...addrForm, houseFlat: e.target.value })}
                      placeholder="Flat 402, Krishna Tower / Plot 45"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[#d5c4b4]/70 mb-1">Street / Area / Locality *</label>
                    <input
                      type="text"
                      required
                      value={addrForm.streetArea}
                      onChange={e => setAddrForm({ ...addrForm, streetArea: e.target.value })}
                      placeholder="Vesu Main Road, Near City Mall"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[#d5c4b4]/70 mb-1">City *</label>
                    <input
                      type="text"
                      required
                      value={addrForm.city}
                      onChange={e => setAddrForm({ ...addrForm, city: e.target.value })}
                      placeholder="Surat"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[#d5c4b4]/70 mb-1">State *</label>
                    <input
                      type="text"
                      required
                      value={addrForm.state}
                      onChange={e => setAddrForm({ ...addrForm, state: e.target.value })}
                      placeholder="Gujarat"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[#d5c4b4]/70 mb-1">PIN Code (6 digits) *</label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={addrForm.pincode}
                      onChange={e => setAddrForm({ ...addrForm, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                      placeholder="395007"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-[#d5c4b4]/70 mb-1">Country *</label>
                    <input
                      type="text"
                      required
                      value={addrForm.country}
                      onChange={e => setAddrForm({ ...addrForm, country: e.target.value })}
                      placeholder="India"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2]"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between flex-wrap gap-3">
                  <label className="flex items-center gap-2 text-xs text-[#d5c4b4] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addrForm.isDefault}
                      onChange={e => setAddrForm({ ...addrForm, isDefault: e.target.checked })}
                      className="accent-[#dfc471]"
                    />
                    <span>Set as primary default shipping address</span>
                  </label>

                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#dfc471] text-[#0d0805] hover:brightness-110 cursor-pointer transition-all shadow-md"
                  >
                    {editingAddressId ? 'Update Shipping Address' : 'Save Shipping Address'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 6. WISHLIST */}
          {activeTab === 'wishlist' && (
            <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-6 sm:p-8 space-y-5">
              <h2 className="font-serif text-2xl text-[#f9f6f2]">Saved Wishlist</h2>
              {wishlist.length === 0 ? (
                <p className="text-sm text-[#d5c4b4]/70">
                  Your wishlist is empty. Tap the heart icon on any product in the Catalog to save it here.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {wishlist.map(w => (
                    <div key={w.wishlistId} className="p-4 rounded-2xl bg-[#1c120c] border border-[#38281d] flex items-center gap-4">
                      <img src={w.product.image} alt={w.product.name} className="w-16 h-16 rounded-xl object-cover" />
                      <div className="flex-1">
                        <div className="font-serif text-lg text-[#f9f6f2]">{w.product.name}</div>
                        <div className="text-xs text-[#dfc471]">
                          {formatINR(w.product.price)} / {w.product.unit}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Link
                            to="/catalog"
                            className="text-[11px] px-3 py-1 rounded-full bg-[#dfc471] text-[#0d0805] font-semibold"
                          >
                            Order
                          </Link>
                          <button
                            onClick={() => handleRemoveWishlist(w.product.id)}
                            className="text-[11px] px-3 py-1 rounded-full bg-[#251a13] text-red-300 cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 7. NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-6 sm:p-8 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl text-[#f9f6f2]">Notifications</h2>
                <button
                  onClick={() => handleMarkNotificationsRead()}
                  className="text-xs text-[#dfc471] hover:underline cursor-pointer"
                >
                  Mark all as read
                </button>
              </div>
              {notifications.length === 0 ? (
                <p className="text-sm text-[#d5c4b4]/70">No notifications yet.</p>
              ) : (
                <div className="space-y-3">
                  {notifications.map(n => (
                    <div
                      key={n.id}
                      onClick={() => !n.isRead && handleMarkNotificationsRead(n.id)}
                      className={`p-4 rounded-2xl border transition-colors ${n.isRead
                        ? 'bg-[#1c120c]/60 border-[#251a13]'
                        : 'bg-emerald-950/30 border-emerald-500/40 cursor-pointer'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-[#f9f6f2]">{n.title}</span>
                        <span className="text-[11px] text-[#d5c4b4]/60">
                          {new Date(n.createdAt).toLocaleDateString('en-IN')}
                        </span>
                      </div>
                      <p className="text-xs text-[#d5c4b4]/85 mt-1">{n.message}</p>
                      {n.relatedOrderId && (
                        <Link
                          to={`/account/orders/${n.relatedOrderId}`}
                          className="inline-block mt-2 text-[11px] text-[#dfc471] hover:underline"
                        >
                          View Order #{n.relatedOrderId} →
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 8. EMAIL PREFERENCES (Part 9) */}
          {activeTab === 'preferences' && (
            <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-6 sm:p-8 space-y-6">
              <div>
                <h2 className="font-serif text-2xl text-[#f9f6f2]">Email Communication Preferences</h2>
                <p className="text-xs text-[#d5c4b4]/75 mt-1">
                  Manage transactional safeguards and marketing communications. Consent status:{' '}
                  <strong className={user.marketingConsent && !user.unsubscribedAt ? 'text-emerald-400' : 'text-amber-300'}>
                    {user.marketingConsent && !user.unsubscribedAt ? 'Opted In' : 'Unsubscribed'}
                  </strong>
                  {user.marketingConsentAt && ` (Consented: ${new Date(user.marketingConsentAt).toLocaleDateString('en-IN')})`}
                  {user.unsubscribedAt && ` (Unsubscribed: ${new Date(user.unsubscribedAt).toLocaleDateString('en-IN')})`}
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#1c120c] border border-[#38281d] space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Essential Transactional Emails (Always Active)</span>
                </div>
                <p className="text-xs text-[#d5c4b4]/75">
                  Order confirmations, shipment &amp; AWB tracking updates, delivery notices, cancellation &amp; refund alerts, and account security notifications remain active for your protection.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#dfc471]">
                  Marketing &amp; Promotional Emails
                </h3>
                {[
                  { key: 'newProductAnnouncements', label: 'New product & harvest announcements' },
                  { key: 'festivalOffers', label: 'Festival sale offers (Diwali, Rakhi, Holi, Eid, etc.)' },
                  { key: 'promotionalDiscounts', label: 'Promotional discount codes & coupon drops' },
                  { key: 'specialCampaigns', label: 'Special curated reserve campaigns' },
                  { key: 'newsletter', label: 'Jammu provenance newsletter & recipes' },
                ].map(item => (
                  <label
                    key={item.key}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-[#1c120c] border border-[#38281d] cursor-pointer"
                  >
                    <span className="text-xs sm:text-sm text-[#ede4dc]">{item.label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean((mktPrefs as Record<string, boolean>)[item.key])}
                      onChange={e => setMktPrefs({ ...mktPrefs, [item.key]: e.target.checked })}
                      className="accent-[#dfc471] w-4 h-4"
                    />
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => handleSavePreferences(false)}
                  className="px-6 py-3 rounded-full text-xs font-semibold uppercase tracking-wider bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] cursor-pointer"
                >
                  Save Preferences
                </button>
                <button
                  onClick={() => handleSavePreferences(true)}
                  className="inline-flex items-center gap-1.5 px-5 py-3 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#251a13] hover:bg-red-950/60 text-red-300 border border-red-500/30 cursor-pointer"
                >
                  <MailX className="w-3.5 h-3.5" />
                  <span>Unsubscribe from All Marketing</span>
                </button>
              </div>
            </div>
          )}

          {/* 9. COUPONS */}
          {activeTab === 'coupons' && (
            <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-6 sm:p-8 space-y-5">
              <h2 className="font-serif text-2xl text-[#f9f6f2]">Available Coupons &amp; Offers</h2>
              {coupons.length === 0 ? (
                <p className="text-sm text-[#d5c4b4]/70">No active coupons right now.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {coupons.map(c => (
                    <div key={c.id} className="p-5 rounded-2xl bg-[#1c120c] border border-[#dfc471]/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-base text-[#dfc471]">{c.code}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(c.code);
                            setCopiedCode(c.code);
                            setTimeout(() => setCopiedCode(''), 2000);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-[#251a13] text-[#ede4dc] cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{copiedCode === c.code ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <div className="font-semibold text-sm text-[#f9f6f2]">{c.title}</div>
                      <p className="text-xs text-[#d5c4b4]/75">{c.description}</p>
                      <div className="text-[11px] text-emerald-300">
                        Min order: {formatINR(c.minOrderValue)}
                        {c.endDate ? ` • Valid until ${new Date(c.endDate).toLocaleDateString('en-IN')}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 10. CHANGE PASSWORD */}
          {activeTab === 'password' && (
            <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-6 sm:p-8 space-y-5">
              <h2 className="font-serif text-2xl text-[#f9f6f2]">Change Account Password</h2>
              <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-[#d5c4b4] mb-1.5">
                    Current Password
                  </label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2]"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-[#d5c4b4] mb-1.5">
                    New Password
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2]"
                  />
                  <PasswordStrengthMeter password={newPassword} />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-[#d5c4b4] mb-1.5">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2]"
                  />
                </div>
                <button
                  type="submit"
                  className="px-6 py-3 rounded-full text-xs font-semibold uppercase tracking-wider bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] cursor-pointer"
                >
                  Update Password
                </button>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

