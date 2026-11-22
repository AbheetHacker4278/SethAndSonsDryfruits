import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu,
  X,
  ShoppingBag,
  User,
  Clock,
  LogOut,
  ChevronDown,
  Home,
  LayoutGrid,
  Gift,
  ShieldCheck,
  Package,
  Headphones,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type NavPage = 'home' | 'catalog' | 'custom-order' | 'orders' | 'login' | 'account';

interface NavbarProps {
  selectedCount: number;
  onOpenCart?: () => void;
}

export default function Navbar({ selectedCount, onOpenCart }: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    if (isProfileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isProfileMenuOpen]);

  // Close menus on route change
  useEffect(() => {
    setIsProfileMenuOpen(false);
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    setIsProfileMenuOpen(false);
    setIsMobileMenuOpen(false);
    try {
      await logout();
    } finally {
      navigate('/login');
    }
  };

  const isHome = location.pathname === '/';

  const handleStoryClick = () => {
    setIsMobileMenuOpen(false);
    if (!isHome) {
      navigate('/');
      setTimeout(() => {
        document.getElementById('story')?.scrollIntoView({ behavior: 'smooth' });
      }, 120);
    } else {
      document.getElementById('story')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled || !isHome
          ? 'bg-[#0d0805]/98 backdrop-blur-2xl border-b border-[#dfc471]/35 py-2.5 sm:py-3 shadow-[0_12px_40px_rgba(0,0,0,0.95)]'
          : 'bg-[#0d0805]/90 backdrop-blur-xl border-b border-[#dfc471]/25 py-3 sm:py-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.85)]'
      }`}
    >
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#dfc471]/35 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 lg:gap-4 xl:gap-6">
        {/* Brand / Logo with Botanical Lotus Crest */}
        <Link
          to="/"
          onClick={() => {
            setIsMobileMenuOpen(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          aria-label="Seth And Sons Dryfruits Homepage"
          className="flex items-center gap-2.5 group shrink-0"
        >
          <div className="flex flex-col items-center justify-center text-center">
            {/* Royal Lotus Emblem */}
            <svg
              className="w-7 h-5 text-[#dfc471] drop-shadow-[0_1px_4px_rgba(223,196,113,0.35)]"
              viewBox="0 0 32 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M16 2C16 2 13 8 13 14C13 17 14.5 19 16 19C17.5 19 19 17 19 14C19 8 16 2 16 2Z" />
              <path d="M13 7C10 9 8 13 8 16C8 19 10 20 13 19.5" />
              <path d="M19 7C22 9 24 13 24 16C24 19 22 20 19 19.5" />
              <path d="M9 13C6 14.5 4 17 4 19.5C4 21.5 6.5 22 10.5 21" />
              <path d="M23 13C26 14.5 28 17 28 19.5C28 21.5 25.5 22 21.5 21" />
              <path d="M11 22.5C14 23.5 18 23.5 21 22.5" />
            </svg>
            <span className="font-serif font-bold text-[17px] sm:text-xl tracking-wide leading-none text-transparent bg-clip-text bg-gradient-to-r from-[#fffcf5] via-[#faeaad] to-[#dfc471] group-hover:brightness-110 transition-all">
              Seth And Sons
            </span>
            <span className="font-serif text-[10px] tracking-[0.22em] text-[#dfc471] mt-0.5 leading-none">
              — Dryfruits —
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-3 xl:gap-5 2xl:gap-7 text-xs xl:text-sm font-medium tracking-wide">
          <Link
            to="/"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className={`whitespace-nowrap transition-colors hover:text-[#dfc471] ${
              location.pathname === '/' ? 'text-[#dfc471] font-semibold' : 'text-[#ede4dc]'
            }`}
          >
            Home
          </Link>
          <Link
            to="/catalog"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className={`whitespace-nowrap transition-colors hover:text-[#dfc471] ${
              location.pathname === '/catalog' ? 'text-[#dfc471] font-semibold' : 'text-[#d5c4b4]/90'
            }`}
          >
            Catalog
          </Link>
          <Link
            to="/custom-order"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className={`whitespace-nowrap transition-colors hover:text-[#dfc471] ${
              location.pathname === '/custom-order' ? 'text-[#dfc471] font-semibold' : 'text-[#d5c4b4]/90'
            }`}
          >
            Custom Demand
          </Link>
          <button
            type="button"
            onClick={handleStoryClick}
            className="cursor-pointer whitespace-nowrap text-[#d5c4b4]/90 hover:text-[#dfc471] transition-colors"
          >
            Ownership &amp; Legal Declaration
          </button>
          <Link
            to="/orders"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className={`whitespace-nowrap transition-colors hover:text-[#dfc471] flex items-center gap-1.5 ${
              location.pathname === '/orders' ? 'text-[#dfc471] font-semibold' : 'text-[#d5c4b4]/90'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Orders</span>
          </Link>
          <Link
            to="/customer-service"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className={`whitespace-nowrap transition-colors hover:text-[#dfc471] ${
              location.pathname === '/customer-service' ? 'text-[#dfc471] font-semibold' : 'text-[#d5c4b4]/90'
            }`}
          >
            Customer Service
          </Link>
        </nav>

        {/* Right Controls: Desktop + Mobile */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* User Profile or Login Pill */}
          {user ? (
            <div className="relative shrink-0" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen(prev => !prev)}
                className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer shrink-0 ${
                  isProfileMenuOpen || location.pathname === '/account'
                    ? 'bg-[#251a13] text-[#dfc471] border-[#dfc471]'
                    : 'bg-[#1c120c] text-[#dfc471] border-[#dfc471]/50 hover:border-[#dfc471]'
                }`}
                aria-expanded={isProfileMenuOpen}
                aria-haspopup="true"
                aria-label="User profile menu"
              >
                {user.profilePicture ? (
                  <img
                    src={user.profilePicture}
                    alt={user.name}
                    className="w-5 h-5 rounded-full object-cover border border-[#dfc471]/60 shrink-0"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-[#dfc471]/25 border border-[#dfc471]/60 flex items-center justify-center text-[10px] font-serif font-bold text-[#dfc471] shrink-0">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="whitespace-nowrap max-w-[50px] xs:max-w-[75px] sm:max-w-[110px] truncate text-xs text-[#ede4dc] font-medium">
                  {user.name.split(' ')[0]}
                </span>
                <ChevronDown
                  className={`w-3 h-3 text-[#dfc471]/80 transition-transform duration-200 shrink-0 ${
                    isProfileMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isProfileMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-48 sm:w-56 rounded-2xl bg-[#150d09] border border-[#dfc471]/40 shadow-[0_12px_40px_rgba(0,0,0,0.95)] backdrop-blur-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
                >
                  <div className="px-3 py-2 border-b border-[#251a13] flex items-center gap-2.5">
                    {user.profilePicture ? (
                      <img
                        src={user.profilePicture}
                        alt={user.name}
                        className="w-8 h-8 rounded-full object-cover border border-[#dfc471]/50 shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#dfc471]/20 border border-[#dfc471]/50 flex items-center justify-center text-xs font-serif font-bold text-[#dfc471] shrink-0">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[#f9f6f2] truncate">{user.name}</p>
                      <p className="text-[11px] text-[#d5c4b4]/70 truncate">{user.email}</p>
                    </div>
                  </div>

                  <div className="pt-1 space-y-0.5">
                    <Link
                      to="/account"
                      role="menuitem"
                      onClick={() => setIsProfileMenuOpen(false)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-[#ede4dc] hover:text-[#dfc471] hover:bg-[#251a13] transition-colors"
                    >
                      <User className="w-4 h-4 text-[#dfc471]" />
                      <span>Profile</span>
                    </Link>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-950/40 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Logout</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              to="/login"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors shrink-0 ${
                location.pathname === '/login'
                  ? 'bg-[#251a13] text-[#dfc471] border-[#dfc471]'
                  : 'bg-[#1c120c]/90 text-[#ede4dc] border-[#dfc471]/60 hover:border-[#dfc471] hover:text-[#dfc471]'
              }`}
            >
              <User className="w-3.5 h-3.5 text-[#dfc471]" />
              <span className="whitespace-nowrap text-xs font-medium">Login</span>
            </Link>
          )}

          {/* Thin Vertical Separator */}
          <div className="h-5 w-[1px] bg-[#dfc471]/35 mx-0.5" />

          {/* Cart Button: Square-Rounded Luxury Style */}
          <button
            type="button"
            onClick={() => {
              if (onOpenCart) onOpenCart();
              else navigate('/catalog?cart=open');
            }}
            className="rounded-xl border border-[#dfc471]/60 p-2 text-[#dfc471] bg-[#1c120c]/90 hover:bg-[#dfc471] hover:text-[#0d0805] hover:border-[#dfc471] transition-all duration-200 active:scale-95 shadow-sm cursor-pointer relative flex items-center justify-center shrink-0"
            aria-label={`View Cart with ${selectedCount} items`}
          >
            <ShoppingBag className="w-4 h-4" />
            {selectedCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#dfc471] text-[#0d0805] text-[10px] font-bold flex items-center justify-center shadow">
                {selectedCount}
              </span>
            )}
          </button>

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-1.5 rounded-lg text-[#ede4dc] hover:text-[#dfc471] transition-colors cursor-pointer flex items-center justify-center shrink-0"
            aria-label="Toggle navigation menu"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* MOBILE DROPDOWN MENU AS PER IMAGE 2 */}
      {isMobileMenuOpen && (
        <div className="lg:hidden relative bg-gradient-to-b from-[#140b07] via-[#0d0704] to-[#080402] border-b border-[#dfc471]/30 px-4 pt-3.5 pb-8 space-y-2.5 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Subtle Ambient Gold Bottom Glow Curves matching Image 2 */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-16 -right-16 w-64 h-64 bg-[radial-gradient(ellipse_at_center,rgba(223,196,113,0.12)_0%,transparent_70%)] blur-2xl"
          />
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 right-0 w-48 h-32 opacity-25 text-[#dfc471]"
            viewBox="0 0 200 120"
            fill="none"
            stroke="currentColor"
          >
            <path d="M0 120 C60 100 120 70 200 10" strokeWidth="1" />
            <path d="M40 120 C90 105 140 85 200 40" strokeWidth="0.75" />
          </svg>

          {/* 1. View Cart Large Pill Card */}
          <button
            type="button"
            onClick={() => {
              setIsMobileMenuOpen(false);
              if (onOpenCart) onOpenCart();
              else navigate('/catalog?cart=open');
            }}
            className="w-full flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-[#20140c] via-[#26170e] to-[#20140c] border border-[#dfc471]/60 shadow-[0_4px_20px_rgba(0,0,0,0.5),0_0_15px_rgba(223,196,113,0.1)] cursor-pointer hover:border-[#dfc471] active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-3">
              <ShoppingBag className="w-5 h-5 text-[#dfc471]" strokeWidth={1.6} />
              <span className="text-white font-medium text-base tracking-wide">View Cart</span>
            </div>
            <span className="px-3.5 py-1 rounded-full bg-[#f3dda2] text-[#0d0805] text-xs font-bold shadow-sm">
              {selectedCount} {selectedCount === 1 ? 'Item' : 'Items'}
            </span>
          </button>

          {/* 2. Home Pill */}
          <Link
            to="/"
            onClick={() => {
              setIsMobileMenuOpen(false);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`w-full flex items-center gap-3.5 py-3.5 px-4 rounded-2xl border transition-all shadow-sm ${
              location.pathname === '/'
                ? 'bg-[#221610] border-[#dfc471] text-[#dfc471]'
                : 'bg-[#180f0a]/90 border-[#38261a] hover:border-[#dfc471]/50 hover:bg-[#221610] text-[#ede4dc]'
            }`}
          >
            <Home className="w-5 h-5 text-[#dfc471] shrink-0" strokeWidth={1.6} />
            <span className="text-sm sm:text-base font-normal tracking-wide">Home</span>
          </Link>

          {/* 3. Catalog Pill */}
          <Link
            to="/catalog"
            onClick={() => {
              setIsMobileMenuOpen(false);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`w-full flex items-center gap-3.5 py-3.5 px-4 rounded-2xl border transition-all shadow-sm ${
              location.pathname === '/catalog'
                ? 'bg-[#221610] border-[#dfc471] text-[#dfc471]'
                : 'bg-[#180f0a]/90 border-[#38261a] hover:border-[#dfc471]/50 hover:bg-[#221610] text-[#ede4dc]'
            }`}
          >
            <LayoutGrid className="w-5 h-5 text-[#dfc471] shrink-0" strokeWidth={1.6} />
            <span className="text-sm sm:text-base font-normal tracking-wide">Catalog</span>
          </Link>

          {/* 4. Custom Demand & Gifting Pill */}
          <Link
            to="/custom-order"
            onClick={() => {
              setIsMobileMenuOpen(false);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`w-full flex items-center gap-3.5 py-3.5 px-4 rounded-2xl border transition-all shadow-sm ${
              location.pathname === '/custom-order'
                ? 'bg-[#221610] border-[#dfc471] text-[#dfc471]'
                : 'bg-[#180f0a]/90 border-[#38261a] hover:border-[#dfc471]/50 hover:bg-[#221610] text-[#ede4dc]'
            }`}
          >
            <Gift className="w-5 h-5 text-[#dfc471] shrink-0" strokeWidth={1.6} />
            <span className="text-sm sm:text-base font-normal tracking-wide">Custom Demand &amp; Gifting</span>
          </Link>

          {/* 5. Ownership & Legal Declaration Pill */}
          <button
            type="button"
            onClick={handleStoryClick}
            className="w-full flex items-center gap-3.5 py-3.5 px-4 rounded-2xl bg-[#180f0a]/90 border border-[#38261a] hover:border-[#dfc471]/50 hover:bg-[#221610] text-[#ede4dc] text-sm sm:text-base font-normal text-left tracking-wide transition-all shadow-sm cursor-pointer"
          >
            <ShieldCheck className="w-5 h-5 text-[#dfc471] shrink-0" strokeWidth={1.6} />
            <span>Ownership &amp; Legal Declaration</span>
          </button>

          {/* 6. Orders & Tracking Pill */}
          <Link
            to="/orders"
            onClick={() => {
              setIsMobileMenuOpen(false);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`w-full flex items-center gap-3.5 py-3.5 px-4 rounded-2xl border transition-all shadow-sm ${
              location.pathname === '/orders'
                ? 'bg-[#221610] border-[#dfc471] text-[#dfc471]'
                : 'bg-[#180f0a]/90 border-[#38261a] hover:border-[#dfc471]/50 hover:bg-[#221610] text-[#ede4dc]'
            }`}
          >
            <Package className="w-5 h-5 text-[#dfc471] shrink-0" strokeWidth={1.6} />
            <span className="text-sm sm:text-base font-normal tracking-wide">Orders &amp; Tracking</span>
          </Link>

          {/* 7. Customer Service Pill */}
          <Link
            to="/customer-service"
            onClick={() => {
              setIsMobileMenuOpen(false);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`w-full flex items-center gap-3.5 py-3.5 px-4 rounded-2xl border transition-all shadow-sm ${
              location.pathname === '/customer-service'
                ? 'bg-[#221610] border-[#dfc471] text-[#dfc471]'
                : 'bg-[#180f0a]/90 border-[#38261a] hover:border-[#dfc471]/50 hover:bg-[#221610] text-[#ede4dc]'
            }`}
          >
            <Headphones className="w-5 h-5 text-[#dfc471] shrink-0" strokeWidth={1.6} />
            <span className="text-sm sm:text-base font-normal tracking-wide">Customer Service</span>
          </Link>

          {/* 8. Login / Register Pill OR Profile + Logout */}
          {user ? (
            <div className="pt-1 space-y-2.5">
              <Link
                to="/account"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`w-full flex items-center gap-3.5 py-3.5 px-4 rounded-2xl border transition-all shadow-sm ${
                  location.pathname === '/account'
                    ? 'bg-[#221610] border-[#dfc471] text-[#dfc471]'
                    : 'bg-[#180f0a]/90 border-[#38261a] hover:border-[#dfc471]/50 hover:bg-[#221610] text-[#ede4dc]'
                }`}
              >
                <User className="w-5 h-5 text-[#dfc471] shrink-0" strokeWidth={1.6} />
                <span className="text-sm sm:text-base font-normal tracking-wide">
                  Profile ({user.name.split(' ')[0]})
                </span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-3.5 py-3.5 px-4 rounded-2xl bg-[#180f0a]/90 border border-red-500/30 hover:border-red-500/60 hover:bg-red-950/20 text-red-400 text-sm sm:text-base font-normal tracking-wide transition-all shadow-sm cursor-pointer"
              >
                <LogOut className="w-5 h-5 text-red-400 shrink-0" strokeWidth={1.6} />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              onClick={() => {
                setIsMobileMenuOpen(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`w-full flex items-center gap-3.5 py-3.5 px-4 rounded-2xl border transition-all shadow-sm ${
                location.pathname === '/login'
                  ? 'bg-[#221610] border-[#dfc471] text-[#dfc471]'
                  : 'bg-[#180f0a]/90 border-[#38261a] hover:border-[#dfc471]/50 hover:bg-[#221610] text-[#dfc471]'
              }`}
            >
              <User className="w-5 h-5 text-[#dfc471] shrink-0" strokeWidth={1.6} />
              <span className="text-sm sm:text-base font-medium tracking-wide">Login / Register</span>
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
