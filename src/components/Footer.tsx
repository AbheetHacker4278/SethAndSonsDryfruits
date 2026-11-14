import { Link, useNavigate } from 'react-router-dom';
import { MessageCircle, Mail, Phone, MapPin, Instagram, Facebook, ShieldCheck } from 'lucide-react';
import { BRAND_CONFIG } from '../data/products';
import { useAuth } from '../context/AuthContext';
import AnimatedLogo from './AnimatedLogo';

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const navigate = useNavigate();
  const { products, publicSettings } = useAuth();
  const web = publicSettings?.website;
  const brandName = web?.brandName || BRAND_CONFIG.name;
  const footerAbout =
    web?.footerAbout ||
    'Dedicated to sourcing authentic mountain dry fruits and rare Kashmiri Mongra saffron directly from Jammu & Kashmir orchards. Cured in traditional cellars for royal nutritional purity.';
  const whatsappNumber = web?.socialLinks?.whatsapp || BRAND_CONFIG.whatsappBusinessNumber;
  const dispatchLocation = web?.dispatchLocation || BRAND_CONFIG.dispatchLocation;
  const contactPhone = web?.contactPhone || BRAND_CONFIG.displayPhone;
  const contactEmail = web?.contactEmail || BRAND_CONFIG.supportEmail;
  const instagramUrl = (web?.socialLinks?.instagram || '').trim();
  const facebookUrl = (web?.socialLinks?.facebook || '').trim();

  return (
    <footer className="relative bg-[#0d0805] text-[#d5c4b4] border-t border-[#38281d] pt-20 pb-12 overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-px bg-gradient-to-r from-transparent via-[#dfc471] to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-12 pb-16 border-b border-[#251a13]">
          <div className="lg:col-span-4">
            <Link to="/">
              <AnimatedLogo size="lg" showSubtitle={true} />
            </Link>

            <p className="mt-5 text-sm text-[#d5c4b4]/80 leading-relaxed font-sans pr-4">
              {footerAbout}
            </p>

            <div className="mt-6">
              <a
                href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hello ${brandName}, I have an inquiry regarding your dry fruits sourced from Jammu.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold bg-[#251a13] hover:bg-[#dfc471] text-[#ede4dc] hover:text-[#0d0805] border border-[#dfc471]/30 transition-colors"
              >
                <MessageCircle className="w-4 h-4 text-emerald-400" />
                <span>Chat on WhatsApp</span>
              </a>
            </div>
          </div>

          <div className="lg:col-span-2">
            <h4 className="font-serif text-base text-[#f9f6f2] font-semibold tracking-wide uppercase mb-4 text-[13px]">
              Explore
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link to="/" className="hover:text-[#dfc471] transition-colors">Home</Link></li>
              <li><Link to="/catalog" className="hover:text-[#dfc471] transition-colors">Catalog</Link></li>
              <li><Link to="/orders" className="hover:text-[#dfc471] transition-colors">Orders &amp; Tracking</Link></li>
              <li><Link to="/account" className="hover:text-[#dfc471] transition-colors">My Account</Link></li>
              <li><Link to="/login" className="hover:text-[#dfc471] transition-colors">Patron Sign In</Link></li>
              <li><Link to="/register" className="hover:text-[#dfc471] transition-colors">Create Account</Link></li>
              <li>
                <Link to="/custom-order" className="text-[#dfc471] font-medium hover:underline">
                  Custom Demand &amp; Gifting
                </Link>
              </li>
              <li>
                <Link to="/customer-service" className="hover:text-[#dfc471] transition-colors">
                  Customer Service
                </Link>
              </li>
            </ul>
          </div>

          <div className="lg:col-span-3">
            <h4 className="font-serif text-base text-[#f9f6f2] font-semibold tracking-wide uppercase mb-4 text-[13px]">
              Signature Harvests
            </h4>
            <ul className="space-y-2.5 text-sm">
              {products.slice(0, 6).map(product => (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => navigate('/catalog')}
                    className="hover:text-[#dfc471] transition-colors cursor-pointer text-left flex items-center justify-between w-full pr-4"
                  >
                    <span>{product.name}</span>
                    <span className="text-xs text-[#dfc471]/70 font-sans tabular-nums">
                      ₹{product.price}/{product.weightLabel || (product.unit === 'gram' ? 'g' : product.unit === 'ml' ? '100ml' : product.unit === 'piece' ? 'piece' : 'kg')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-3">
            <h4 className="font-serif text-base text-[#f9f6f2] font-semibold tracking-wide uppercase mb-4 text-[13px]">
              Concierge
            </h4>
            <div className="space-y-3 text-sm text-[#d5c4b4]/85">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-[#dfc471] shrink-0 mt-0.5" />
                <span>{dispatchLocation}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-[#dfc471] shrink-0" />
                <span>{contactPhone}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-[#dfc471] shrink-0" />
                <span>{contactEmail}</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-[#d5c4b4]/60 pt-2">
                <ShieldCheck className="w-4 h-4 text-[#dfc471] shrink-0" />
                {/* <span>100% Genuine Jammu &amp; Kashmir Origin</span> */}
              </div>
            </div>

            {(instagramUrl || facebookUrl) && (
              <div className="mt-5 flex items-center gap-3">
                {instagramUrl && (
                  <a
                    href={instagramUrl}
                    target={instagramUrl.startsWith('http') ? '_blank' : undefined}
                    rel={instagramUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
                    aria-label="Visit Seth And Sons on Instagram"
                    className="w-11 h-11 rounded-full bg-[#1c120c] border border-[#38281d] flex items-center justify-center text-[#d5c4b4] hover:text-[#dfc471] hover:border-[#dfc471] transition-colors"
                  >
                    <Instagram className="w-4 h-4" />
                  </a>
                )}
                {facebookUrl && (
                  <a
                    href={facebookUrl}
                    target={facebookUrl.startsWith('http') ? '_blank' : undefined}
                    rel={facebookUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
                    aria-label="Visit Seth And Sons on Facebook"
                    className="w-11 h-11 rounded-full bg-[#1c120c] border border-[#38281d] flex items-center justify-center text-[#d5c4b4] hover:text-[#dfc471] hover:border-[#dfc471] transition-colors"
                  >
                    <Facebook className="w-4 h-4" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#d5c4b4]/60">
          <p>© {currentYear} {brandName}. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <span>Pure Mountain Harvest</span>
            <span>·</span>
            <span>Earthen Shade Cured</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
