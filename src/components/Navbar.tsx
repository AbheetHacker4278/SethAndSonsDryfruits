import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, ShoppingBag, User, Clock } from 'lucide-react';
import AnimatedLogo from './AnimatedLogo';
import { useAuth } from '../context/AuthContext';

export type NavPage = 'home' | 'catalog' | 'custom-order' | 'orders' | 'login' | 'account';

interface NavbarProps {
  selectedCount: number;
  onOpenCart?: () => void;
}

export default function Navbar({ selectedCount, onOpenCart }: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
          ? 'bg-[#0d0805]/98 backdrop-blur-2xl border-b border-[#dfc471]/35 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.95)]'
          : 'bg-[#0d0805]/90 backdrop-blur-xl border-b border-[#dfc471]/25 py-3.5 sm:py-4 shadow-[0_8px_32px_rgba(0,0,0,0.85)]'
      }`}
    >
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#dfc471]/35 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-6">
        <Link to="/" onClick={() => setIsMobileMenuOpen(false)} aria-label="Go to homepage">
          <AnimatedLogo size="md" showSubtitle={false} />
        </Link>

        <nav className="hidden lg:flex items-center gap-5 xl:gap-7 text-xs sm:text-sm font-medium tracking-wide">
          <Link
            to="/"
            className={`whitespace-nowrap transition-colors hover:text-[#dfc471] ${
              location.pathname === '/' ? 'text-[#dfc471] font-semibold' : 'text-[#ede4dc]'
            }`}
          >
            Home
          </Link>
          <Link
            to="/catalog"
            className={`whitespace-nowrap transition-colors hover:text-[#dfc471] ${
              location.pathname === '/catalog' ? 'text-[#dfc471] font-semibold' : 'text-[#d5c4b4]/90'
            }`}
          >
            Catalog
          </Link>
          <Link
            to="/custom-order"
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
            Our Story
          </button>
          <Link
            to="/orders"
            className={`whitespace-nowrap transition-colors hover:text-[#dfc471] flex items-center gap-1.5 ${
              location.pathname === '/orders' ? 'text-[#dfc471] font-semibold' : 'text-[#d5c4b4]/90'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Orders</span>
          </Link>
          <Link
            to="/customer-service"
            className={`whitespace-nowrap transition-colors hover:text-[#dfc471] ${
              location.pathname === '/customer-service' ? 'text-[#dfc471] font-semibold' : 'text-[#d5c4b4]/90'
            }`}
          >
            Customer Service
          </Link>
        </nav>

        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <Link
            to={user ? '/account' : '/login'}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border transition-colors ${
              user || location.pathname === '/login' || location.pathname === '/account'
                ? 'bg-[#251a13] text-[#dfc471] border-[#dfc471]/50'
                : 'bg-[#150d09]/70 text-[#d5c4b4] border-[#38281d] hover:border-[#dfc471]/40 hover:text-[#ede4dc]'
            }`}
          >
            <User className="w-3.5 h-3.5 text-[#dfc471]" />
            <span className="hidden sm:inline whitespace-nowrap">
              {user ? user.name.split(' ')[0] : 'Sign In'}
            </span>
          </Link>

          <button
            type="button"
            onClick={() => {
              if (onOpenCart) onOpenCart();
              else navigate('/catalog?cart=open');
            }}
            className="relative inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full text-xs font-semibold tracking-wide border border-[#dfc471]/60 bg-[#1c120c] text-[#dfc471] hover:bg-[#dfc471] hover:text-[#0d0805] hover:border-[#dfc471] transition-all duration-200 active:scale-95 shadow-md shadow-black/40 cursor-pointer whitespace-nowrap"
            aria-label={`View Cart with ${selectedCount} items`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>View Cart</span>
            {selectedCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-[#dfc471] text-[#0d0805] text-[10px] font-bold flex items-center justify-center">
                {selectedCount}
              </span>
            )}
          </button>

          <Link
            to="/catalog"
            className="relative hidden md:inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-full text-xs font-semibold tracking-wider uppercase transition-all duration-300 bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] hover:brightness-110 shadow-lg shadow-[#b99225]/20 active:scale-95 whitespace-nowrap"
          >
            <span>Order Now</span>
          </Link>

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-2.5 rounded-lg text-[#d5c4b4] hover:text-[#ede4dc] hover:bg-[#251a13] transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Toggle navigation menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="lg:hidden bg-[#150d09] border-b border-[#38281d] px-6 py-5 shadow-2xl space-y-3 text-sm font-medium">
          <button
            type="button"
            onClick={() => {
              setIsMobileMenuOpen(false);
              if (onOpenCart) onOpenCart();
              else navigate('/catalog?cart=open');
            }}
            className="w-full flex items-center justify-between py-2.5 px-3 rounded-xl bg-[#251a13] border border-[#dfc471]/50 text-[#dfc471] font-semibold text-sm cursor-pointer mb-2 shadow-sm"
          >
            <span className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-[#dfc471]" />
              <span>View Cart</span>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[#dfc471] text-[#0d0805] text-xs font-bold">
              {selectedCount} {selectedCount === 1 ? 'item' : 'items'}
            </span>
          </button>
          <Link to="/" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 border-b border-[#251a13] text-[#ede4dc]">
            Home
          </Link>
          <Link to="/catalog" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 border-b border-[#251a13] text-[#d5c4b4]">
            Jammu Catalog {selectedCount > 0 && `(${selectedCount})`}
          </Link>
          <Link to="/custom-order" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 border-b border-[#251a13] text-[#dfc471]">
            Custom Demand &amp; Gifting
          </Link>
          <button type="button" onClick={handleStoryClick} className="block w-full text-left py-2 border-b border-[#251a13] text-[#d5c4b4]">
            Our Story
          </button>
          <Link to="/orders" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 border-b border-[#251a13] text-[#d5c4b4]">
            Orders &amp; Tracking
          </Link>
          <Link to="/customer-service" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 border-b border-[#251a13] text-[#d5c4b4]">
            Customer Service
          </Link>
          <Link
            to={user ? '/account' : '/login'}
            onClick={() => setIsMobileMenuOpen(false)}
            className="block py-2 text-[#dfc471]"
          >
            {user ? `Account (${user.name})` : 'Sign In / Register'}
          </Link>
        </div>
      )}
    </header>
  );
}
