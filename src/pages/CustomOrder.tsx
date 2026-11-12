import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BRAND_CONFIG,
  type CatalogProduct,
  type ProductWeightVariant,
} from '../data/products';
import { useAuth } from '../context/AuthContext';
import { apiRequest, ApiError, PersistedOrder } from '../services/api';
import {
  formatINR,
  getProductPackOptions,
  parseWeightGrams,
} from '../utils/priceCalculator';
import ScrollReveal from '../components/ScrollReveal';
import {
  Gift,
  Check,
  Send,
  ArrowLeft,
  MessageCircle,
  AlertCircle,
  Calendar,
  PackageCheck,
  Truck,
  Search,
  X,
  Plus,
  Minus,
  Trash2,
  Sparkles,
  SlidersHorizontal,
  ShieldCheck,
  Box,
  User,
  Phone,
  Mail,
  MapPin,
  Building2,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface CuratedSelectionItem {
  variantId: string;
  weightLabel: string;
  quantity: number;
}

const FALLBACK_PRODUCT_IMG =
  '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg';

const PACKAGING_OPTIONS = [
  {
    id: 'velvet-box',
    label: 'Royal Handcrafted Velvet Box',
    desc: 'Partitioned deep-emerald or obsidian velvet with embossed gold-foil crest.',
    badge: 'Most Popular',
  },
  {
    id: 'brass-tin',
    label: 'Artisanal Engraved Brass Tins',
    desc: 'Airtight heirloom metal caddies that lock crispness and roast aroma.',
    badge: 'Keepsake',
  },
  {
    id: 'wooden-chest',
    label: 'Kashmiri Walnut Wood Chest',
    desc: 'Hand-carved heritage walnut timber box finished with antique brass clasp.',
    badge: 'Collector Grade',
  },
  {
    id: 'bulk-vacuum',
    label: 'Bulk Nitrogen-Flushed Wholesale',
    desc: 'Direct 5 kg – 50 kg nitrogen-flushed master cartons for events & institutions.',
    badge: 'Institutional',
  },
];

const OCCASIONS = [
  'Festive & Corporate Gifting',
  'Royal Wedding Trousseau / Favor',
  'Executive Connoisseur Hampers',
  'Institutional / Hotel Bulk Supply',
  'Personal Bespoke Reserve',
];

const VOLUME_PRESETS = [
  '5 - 15 Gift Boxes',
  '15 - 50 Gift Boxes',
  '50 - 200+ Corporate Boxes',
  '5 kg - 25 kg Loose Bulk',
  '25 kg - 100+ kg Wholesale',
];

const CURATED_PRESETS = [
  {
    id: 'royal-trio',
    label: 'Royal Kashmiri Reserve',
    desc: 'Badam + Kesar + Akhrot',
    productIds: ['badam', 'kesar', 'akhrot'],
  },
  {
    id: 'wedding-hamper',
    label: 'Grand Wedding Hamper',
    desc: 'Kaju + Pista + Anjeer + Dates',
    productIds: ['kaju-super-jumbo', 'pista-premium', 'anjeer-juicy-jumbo', 'dates-ajwa'],
  },
  {
    id: 'wellness-sugarfree',
    label: 'Sugar-Free Wellness Edit',
    desc: 'Kahwa + Shilajit + Mix Seeds',
    productIds: ['sup-sugar-free-kahwa', 'himalayan-shilajit-resin', 'sup-mix-seeds-berries'],
  },
];

function getDefaultPackForProduct(product: CatalogProduct): ProductWeightVariant {
  const packs = getProductPackOptions(product);
  if (product.unit === 'kg') {
    return packs.find(p => parseWeightGrams(p.weightLabel) === 1000) || packs[packs.length - 1];
  }
  return packs[0];
}

function getEffectiveUnitLabel(product: CatalogProduct): string {
  if (product.weightLabel) return product.weightLabel;
  if (product.unit === 'gram') return 'g';
  if (product.unit === 'ml') return '100ml';
  if (product.unit === 'piece') return 'piece';
  return 'kg';
}

export default function CustomOrder() {
  const { user, products, categories } = useAuth();
  const errorBannerRef = useRef<HTMLDivElement | null>(null);

  const [selectedMap, setSelectedMap] = useState<Record<string, CuratedSelectionItem>>({
    badam: { variantId: 'pack_badam_1kg', weightLabel: '1kg', quantity: 1 },
    kesar: { variantId: 'pack_kesar_1g', weightLabel: '1g', quantity: 1 },
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(12);

  const [packagingType, setPackagingType] = useState<string>(PACKAGING_OPTIONS[0].label);
  const [occasion, setOccasion] = useState<string>(OCCASIONS[0]);
  const [estimatedQuantity, setEstimatedQuantity] = useState<string>(VOLUME_PRESETS[1]);
  const [targetDate, setTargetDate] = useState<string>('');
  const [customMessage, setCustomMessage] = useState<string>('');

  const [fullName, setFullName] = useState(user?.name || '');
  const [mobileNumber, setMobileNumber] = useState(user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [organization, setOrganization] = useState('');
  const [city, setCity] = useState('Jammu');
  const [specificDemands, setSpecificDemands] = useState('');

  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<PersistedOrder | null>(null);
  const [liveStatusAnnouncement, setLiveStatusAnnouncement] = useState('');

  // Keep user contact details synced if user session finishes loading after mount
  useEffect(() => {
    if (!user) return;
    setFullName(prev => prev || user.name || '');
    setMobileNumber(prev => prev || user.phone || '');
    setEmail(prev => prev || user.email || '');
  }, [user]);

  // Reconcile initial seed selection pack IDs once live DB products/variants load
  useEffect(() => {
    if (products.length === 0) return;
    setSelectedMap(prev => {
      let changed = false;
      const next: Record<string, CuratedSelectionItem> = {};
      for (const [prodId, sel] of Object.entries(prev)) {
        const prod = products.find(p => p.id === prodId);
        if (!prod) continue;
        const packs = getProductPackOptions(prod);
        const exactMatch =
          packs.find(pk => pk.id === sel.variantId) ||
          packs.find(pk => pk.weightLabel.toLowerCase() === sel.weightLabel.toLowerCase());
        const resolved = exactMatch || getDefaultPackForProduct(prod);
        if (resolved.id !== sel.variantId || resolved.weightLabel !== sel.weightLabel) {
          changed = true;
        }
        next[prodId] = {
          variantId: resolved.id,
          weightLabel: resolved.weightLabel,
          quantity: sel.quantity,
        };
      }
      return changed ? next : prev;
    });
  }, [products]);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of products) {
      const cid = p.categoryId || 'cat_other';
      map[cid] = (map[cid] || 0) + 1;
    }
    return map;
  }, [products]);

  const visibleCategories = useMemo(() => {
    return categories.filter(cat => (categoryCounts[cat.id] || 0) > 0);
  }, [categories, categoryCounts]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter(p => {
      const isSelected = Boolean(selectedMap[p.id]);
      if (showSelectedOnly && !isSelected) return false;
      if (selectedCategoryFilter !== 'all' && (p.categoryId || 'cat_other') !== selectedCategoryFilter) {
        return false;
      }
      if (!q) return true;
      const hay = `${p.name} ${p.hindiName || ''} ${p.subtitle} ${p.sku || ''} ${p.origin} ${p.grade} ${p.categoryName || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [products, selectedMap, showSelectedOnly, selectedCategoryFilter, searchQuery]);

  const isFiltering =
    Boolean(searchQuery.trim()) || selectedCategoryFilter !== 'all' || showSelectedOnly;

  const displayedProducts = isFiltering
    ? filteredProducts
    : filteredProducts.slice(0, visibleLimit);

  const selectedEntries = useMemo(() => {
    return Object.entries(selectedMap)
      .map(([productId, item]) => {
        const product = products.find(p => p.id === productId);
        if (!product) return null;
        const packs = getProductPackOptions(product);
        const pack =
          packs.find(pk => pk.id === item.variantId) ||
          packs.find(pk => pk.weightLabel === item.weightLabel) ||
          getDefaultPackForProduct(product);
        const unitPrice =
          pack.discountPrice && pack.discountPrice > 0 && pack.discountPrice < pack.sellingPrice
            ? pack.discountPrice
            : pack.sellingPrice;
        return {
          product,
          packs,
          pack,
          quantity: item.quantity,
          unitPrice,
          lineTotal: Math.round(unitPrice * item.quantity),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }, [selectedMap, products]);

  const estimatedGoodsTotal = useMemo(
    () => selectedEntries.reduce((sum, entry) => sum + entry.lineTotal, 0),
    [selectedEntries]
  );

  const totalPackCount = useMemo(
    () => selectedEntries.reduce((sum, entry) => sum + entry.quantity, 0),
    [selectedEntries]
  );

  const toggleProduct = (product: CatalogProduct) => {
    setSelectedMap(prev => {
      const next = { ...prev };
      if (next[product.id]) {
        delete next[product.id];
        setLiveStatusAnnouncement(`Removed ${product.name} from bespoke selection.`);
      } else {
        const defaultPack = getDefaultPackForProduct(product);
        next[product.id] = {
          variantId: defaultPack.id,
          weightLabel: defaultPack.weightLabel,
          quantity: 1,
        };
        setLiveStatusAnnouncement(
          `Added ${product.name} (${defaultPack.weightLabel}) to bespoke selection.`
        );
      }
      return next;
    });
  };

  const updateProductPack = (productId: string, pack: ProductWeightVariant) => {
    setSelectedMap(prev => {
      const existing = prev[productId];
      if (!existing) return prev;
      return {
        ...prev,
        [productId]: {
          ...existing,
          variantId: pack.id,
          weightLabel: pack.weightLabel,
        },
      };
    });
  };

  const updateProductQty = (productId: string, delta: number) => {
    setSelectedMap(prev => {
      const existing = prev[productId];
      if (!existing) return prev;
      const nextQty = existing.quantity + delta;
      if (nextQty <= 0) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return {
        ...prev,
        [productId]: {
          ...existing,
          quantity: Math.min(500, nextQty),
        },
      };
    });
  };

  const applyCuratedPreset = (presetIds: string[], presetLabel: string) => {
    const matched = products.filter(p => presetIds.includes(p.id));
    if (matched.length === 0) return;
    const next: Record<string, CuratedSelectionItem> = {};
    for (const prod of matched) {
      const def = getDefaultPackForProduct(prod);
      next[prod.id] = {
        variantId: def.id,
        weightLabel: def.weightLabel,
        quantity: 1,
      };
    }
    setSelectedMap(next);
    setShowSelectedOnly(false);
    setLiveStatusAnnouncement(`Loaded "${presetLabel}" with ${matched.length} curated items.`);
  };

  const clearSelection = () => {
    setSelectedMap({});
    setShowSelectedOnly(false);
    setLiveStatusAnnouncement('Cleared all selected products.');
  };

  const showValidationError = (msg: string) => {
    setFormError(msg);
    requestAnimationFrame(() => {
      errorBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      errorBannerRef.current?.focus();
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      showValidationError(
        'Please sign in and verify your email address before submitting a bespoke order.'
      );
      return;
    }
    if (!user.emailVerified) {
      showValidationError('Please verify your email address before completing checkout.');
      return;
    }
    if (selectedEntries.length === 0) {
      showValidationError('Please select at least one dry fruit, spice, or reserve product.');
      return;
    }
    if (!fullName.trim() || !mobileNumber.trim()) {
      showValidationError('Please provide your full name and mobile number.');
      return;
    }

    setFormError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ order: PersistedOrder }>('/api/orders', {
        method: 'POST',
        body: {
          orderType: 'custom',
          items: selectedEntries.map(entry => ({
            productId: entry.product.id,
            variantId: entry.pack.id,
            weightLabel: entry.pack.weightLabel,
            quantity: entry.quantity,
          })),
          paymentMethod: 'Concierge Invoice / Custom Quotation',
          deliveryAddress: {
            fullName: fullName.trim(),
            mobileNumber: mobileNumber.trim(),
            deliveryAddress: `Custom Demand: ${packagingType} for ${occasion}${
              organization.trim() ? ` (${organization.trim()})` : ''
            }`,
            city: city.trim() || 'Jammu',
            state: 'Jammu & Kashmir',
            pincode: '180001',
          },
          instructions: `Volume: ${estimatedQuantity}. Demands: ${
            specificDemands.trim() || 'Standard bespoke grading'
          }. Timeline: ${targetDate.trim() || 'Flexible'}. Gift note: ${
            customMessage.trim() || 'None'
          }`,
        },
      });

      try {
        confetti({
          particleCount: 70,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#dfc471', '#d4af37', '#f9f6f2', '#b99225'],
        });
      } catch {
        // ignore confetti error in headless environments
      }

      setSubmittedOrder(res.order);
    } catch (err) {
      showValidationError(
        err instanceof ApiError ? err.message : 'Unable to submit custom demand order.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const buildCustomWhatsAppUrl = () => {
    const lines = [
      `*BESPOKE CUSTOM ORDER INQUIRY${submittedOrder ? `: #${submittedOrder.orderNumber}` : ''}*`,
      `_Seth And Sons DryFruits — Jammu Provenance_`,
      ``,
      `*Client Details:*`,
      `• Name: ${fullName || 'Guest'}`,
      `• Mobile: ${mobileNumber || 'N/A'}`,
      organization ? `• Organization: ${organization}` : null,
      `• City: ${city || 'Jammu'}`,
      ``,
      `*Selected Products & Packs:*`,
      ...selectedEntries.map(
        entry =>
          `• ${entry.product.name} — ${entry.quantity} × ${entry.pack.weightLabel} (${formatINR(
            entry.lineTotal
          )})`
      ),
      `• Estimated Sample Total: ${formatINR(estimatedGoodsTotal)}`,
      ``,
      `*Custom Specifications:*`,
      `• Packaging: ${packagingType}`,
      `• Occasion: ${occasion}`,
      `• Approximate Volume: ${estimatedQuantity}`,
      targetDate ? `• Timeline: ${targetDate}` : null,
      specificDemands ? `• Custom Requirements: ${specificDemands}` : null,
      customMessage ? `• Gift Card Note: "${customMessage}"` : null,
    ].filter(Boolean) as string[];

    const phone = BRAND_CONFIG.whatsappBusinessNumber.replace(/[^0-9]/g, '');
    return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
  };

  return (
    <div className="min-h-screen bg-[#0d0805] text-[#ede4dc] pt-24 pb-28">
      {/* Screen-reader Skip Link */}
      <a
        href="#custom-order-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-5 focus:py-3 focus:rounded-full focus:bg-[#dfc471] focus:text-[#0d0805] focus:font-bold focus:text-sm focus:shadow-2xl"
      >
        Skip to custom order builder
      </a>

      {/* Live region for screen reader selection feedback */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveStatusAnnouncement}
      </div>

      <main id="custom-order-main" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Breadcrumb Navigation */}
        <nav
          aria-label="Breadcrumb"
          className="mb-8 flex flex-wrap items-center justify-between gap-3 pt-4"
        >
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#e5d5c6] hover:text-[#dfc471] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471] rounded-lg px-2 py-1.5 -ml-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Return to Home</span>
          </Link>

          <Link
            to="/catalog"
            className="inline-flex items-center gap-1.5 text-xs text-[#dfc471] hover:underline font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471] rounded-lg px-2.5 py-1.5"
          >
            <span>Need standard single packs? Browse Full Catalog →</span>
          </Link>
        </nav>

        {/* Hero Header */}
        <ScrollReveal>
          <header className="max-w-4xl mb-10">
            <div className="inline-flex items-center gap-2 text-xs font-sans font-semibold tracking-[0.22em] uppercase text-[#dfc471] mb-3">
              <Gift className="w-4 h-4" aria-hidden="true" />
              <span>Bespoke Gifting &amp; Wholesale Demands</span>
            </div>
            <h1 className="font-serif text-3xl sm:text-5xl font-normal text-[#f9f6f2] tracking-tight leading-tight">
              Create Your Custom Demand Order
            </h1>
            <p className="mt-3 text-base text-[#e5d5c6]/90 leading-relaxed font-sans max-w-3xl">
              Tailor multi-nut assortments, select exact pack sizes, choose handcrafted velvet chests or heirloom walnut wood boxes, and coordinate bulk delivery directly with the Seth family in Jammu.
            </p>

            {/* Accessible Step Jump Links */}
            {!submittedOrder && (
              <nav aria-label="Custom order steps" className="mt-6 flex flex-wrap gap-2.5">
                {[
                  { href: '#step-products', num: '1', label: 'Select Harvests & Packs' },
                  { href: '#step-packaging', num: '2', label: 'Packaging & Occasion' },
                  { href: '#step-contact', num: '3', label: 'Concierge Details' },
                ].map(step => (
                  <a
                    key={step.href}
                    href={step.href}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium bg-[#1a110b] border border-[#4a3628] text-[#f9f6f2] hover:border-[#dfc471] hover:text-[#dfc471] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471] transition-colors"
                  >
                    <span className="w-5 h-5 rounded-full bg-[#dfc471]/20 text-[#dfc471] font-bold flex items-center justify-center text-[11px]">
                      {step.num}
                    </span>
                    <span>{step.label}</span>
                  </a>
                ))}
              </nav>
            )}
          </header>
        </ScrollReveal>

        {submittedOrder ? (
          <section
            aria-labelledby="submitted-order-heading"
            className="bg-[#150d09] border border-[#dfc471]/50 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-8 max-w-3xl mx-auto"
          >
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-950 border border-emerald-400/50 flex items-center justify-center mx-auto text-emerald-300">
                <PackageCheck className="w-8 h-8" aria-hidden="true" />
              </div>
              <span className="inline-block text-xs font-sans tracking-[0.22em] uppercase text-[#dfc471] font-semibold">
                Order Reference: #{submittedOrder.orderNumber}
              </span>
              <h2
                id="submitted-order-heading"
                className="font-serif text-2xl sm:text-4xl font-medium text-[#f9f6f2]"
              >
                Custom Demand Order Received
              </h2>
              <p className="text-sm text-emerald-300">
                A confirmation email has been queued to <span className="font-semibold">{email || user?.email}</span>.
              </p>
            </div>

            <div className="rounded-2xl bg-[#1c120c] border border-[#38281d] p-5 space-y-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2 pb-3 border-b border-[#38281d]">
                <span className="text-[#d5c4b4]">Packaging &amp; Occasion</span>
                <span className="font-semibold text-[#f9f6f2]">{packagingType} · {occasion}</span>
              </div>
              <div className="space-y-2">
                {submittedOrder.items.map(it => (
                  <div key={it.id} className="flex justify-between gap-3">
                    <span className="text-[#ede4dc]">
                      {it.productName} ({it.weightLabel ? `${it.quantity} × ${it.weightLabel}` : `${it.quantity} ${it.unit}`})
                    </span>
                    <span className="font-semibold text-[#dfc471] tabular-nums">
                      {formatINR(it.subtotal)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t border-[#38281d] flex justify-between font-bold text-base">
                <span className="text-[#f9f6f2]">Estimated Order Total</span>
                <span className="text-[#dfc471] tabular-nums">{formatINR(submittedOrder.totalAmount)}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to={`/account/orders/${submittedOrder.orderNumber}`}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#064e3b] text-[#dfc471] border border-[#dfc471]/50 hover:bg-[#08634b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471]"
              >
                <Truck className="w-4 h-4" aria-hidden="true" />
                <span>Track Order</span>
              </Link>
              <a
                href={buildCustomWhatsAppUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#15803d] hover:bg-[#166534] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <MessageCircle className="w-4 h-4" aria-hidden="true" />
                <span>Send Brief via WhatsApp</span>
              </a>
              <button
                type="button"
                onClick={() => setSubmittedOrder(null)}
                className="w-full sm:w-auto px-6 py-3.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#251a13] hover:bg-[#33241b] text-[#f9f6f2] border border-[#4a3628] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471]"
              >
                New Custom Inquiry
              </button>
            </div>
          </section>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            {/* Account & Email Verification Callouts */}
            {!user && (
              <div
                role="region"
                aria-label="Sign in notice"
                className="p-4 sm:p-5 rounded-2xl bg-amber-950/60 border border-amber-400/50 flex flex-wrap items-center justify-between gap-3 text-sm text-amber-100"
              >
                <span>Sign in with a verified email account to submit and track bespoke demand orders.</span>
                <Link
                  to="/login?redirect=/custom-order"
                  className="px-5 py-2.5 rounded-full bg-[#dfc471] text-[#0d0805] font-semibold text-xs uppercase tracking-wider hover:bg-[#f0d98d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Sign In / Register
                </Link>
              </div>
            )}

            {user && !user.emailVerified && (
              <div
                role="region"
                aria-label="Email verification notice"
                className="p-4 sm:p-5 rounded-2xl bg-amber-950/60 border border-amber-400/50 flex flex-wrap items-center justify-between gap-3 text-sm text-amber-100"
              >
                <span>Your email ({user.email}) must be verified before placing custom orders.</span>
                <Link
                  to={`/verify-email?email=${encodeURIComponent(user.email)}`}
                  className="px-5 py-2.5 rounded-full bg-[#dfc471] text-[#0d0805] font-semibold text-xs uppercase tracking-wider hover:bg-[#f0d98d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Verify Email
                </Link>
              </div>
            )}

            {formError && (
              <div
                id="custom-order-error"
                ref={errorBannerRef}
                tabIndex={-1}
                role="alert"
                aria-live="assertive"
                className="p-4 rounded-2xl bg-red-950/80 border border-red-400/60 text-red-100 text-sm flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-red-300"
              >
                <AlertCircle className="w-5 h-5 text-red-300 shrink-0" aria-hidden="true" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Main Guided Builder Column */}
              <div className="lg:col-span-8 space-y-8">
                {/* STEP 1: PRODUCT & PACK SELECTION */}
                <section
                  id="step-products"
                  aria-labelledby="step-products-heading"
                  className="p-5 sm:p-8 rounded-3xl bg-[#150d09] border border-[#38281d] space-y-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#251a13]">
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#dfc471]">
                        Step 1 of 3
                      </span>
                      <h2
                        id="step-products-heading"
                        className="font-serif text-2xl sm:text-3xl text-[#f9f6f2] mt-0.5"
                      >
                        Select Products &amp; Pack Sizes
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-3.5 py-1.5 rounded-full bg-[#1c120c] border border-[#dfc471]/40 text-xs font-semibold text-[#dfc471]">
                        {selectedEntries.length} Item{selectedEntries.length === 1 ? '' : 's'} ({totalPackCount} Pack{totalPackCount === 1 ? '' : 's'})
                      </span>
                      {selectedEntries.length > 0 && (
                        <button
                          type="button"
                          onClick={clearSelection}
                          className="text-xs text-[#e5d5c6] hover:text-red-300 underline px-2 py-1 rounded cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471]"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick Curated Hamper Presets */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#d5c4b4]">
                      <Sparkles className="w-3.5 h-3.5 text-[#dfc471]" aria-hidden="true" />
                      <span>Quick Hamper Presets</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {CURATED_PRESETS.map(preset => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => applyCuratedPreset(preset.productIds, preset.label)}
                          className="text-left p-3 rounded-2xl bg-[#1c120c] border border-[#38281d] hover:border-[#dfc471]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471] transition-colors cursor-pointer"
                        >
                          <div className="text-xs font-semibold text-[#dfc471]">{preset.label}</div>
                          <div className="text-[11px] text-[#e5d5c6]/85 mt-0.5">{preset.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Search & Filter Toolbar */}
                  <div className="space-y-3 pt-1">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <label htmlFor="custom-product-search" className="sr-only">
                          Search products by name, origin, or SKU
                        </label>
                        <Search
                          className="w-4 h-4 text-[#dfc471] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                          aria-hidden="true"
                        />
                        <input
                          id="custom-product-search"
                          type="search"
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          placeholder="Search almonds, kaju, kesar, shilajit, tea, SKU..."
                          className="w-full pl-10 pr-9 py-3 rounded-xl bg-[#1c120c] border border-[#4a3628] text-sm text-[#f9f6f2] placeholder:text-[#b8a596] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471] focus-visible:border-[#dfc471]"
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            aria-label="Clear product search"
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-[#d5c4b4] hover:text-[#f9f6f2] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471]"
                          >
                            <X className="w-4 h-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        aria-pressed={showSelectedOnly}
                        onClick={() => setShowSelectedOnly(v => !v)}
                        className={`inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471] ${
                          showSelectedOnly
                            ? 'bg-[#dfc471] text-[#0d0805] border-[#dfc471]'
                            : 'bg-[#1c120c] text-[#f9f6f2] border-[#4a3628] hover:border-[#dfc471]'
                        }`}
                      >
                        <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
                        <span>Selected Only ({selectedEntries.length})</span>
                      </button>
                    </div>

                    {/* Accessible Category Pills */}
                    <div
                      role="group"
                      aria-label="Filter products by category"
                      className="flex flex-wrap gap-2"
                    >
                      <button
                        type="button"
                        aria-pressed={selectedCategoryFilter === 'all'}
                        onClick={() => {
                          setSelectedCategoryFilter('all');
                          setShowSelectedOnly(false);
                        }}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471] ${
                          selectedCategoryFilter === 'all' && !showSelectedOnly
                            ? 'bg-[#dfc471] text-[#0d0805] border-[#dfc471] font-semibold'
                            : 'bg-[#1c120c] text-[#e5d5c6] border-[#38281d] hover:border-[#dfc471]/60'
                        }`}
                      >
                        All ({products.length})
                      </button>
                      {visibleCategories.map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          aria-pressed={selectedCategoryFilter === cat.id}
                          onClick={() => {
                            setSelectedCategoryFilter(cat.id);
                            setShowSelectedOnly(false);
                          }}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471] ${
                            selectedCategoryFilter === cat.id
                              ? 'bg-[#dfc471] text-[#0d0805] border-[#dfc471] font-semibold'
                              : 'bg-[#1c120c] text-[#e5d5c6] border-[#38281d] hover:border-[#dfc471]/60'
                          }`}
                        >
                          {cat.name} ({categoryCounts[cat.id] || 0})
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Product Grid */}
                  {displayedProducts.length === 0 ? (
                    <div className="py-12 px-4 rounded-2xl bg-[#120c08] border border-[#38281d] text-center space-y-3">
                      <p className="text-sm text-[#e5d5c6]">
                        No harvests match your current filter or search.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedCategoryFilter('all');
                          setShowSelectedOnly(false);
                        }}
                        className="px-5 py-2 rounded-full bg-[#dfc471] text-[#0d0805] text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      >
                        Reset Filters
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {displayedProducts.map(product => {
                          const selectedEntry = selectedMap[product.id];
                          const isSelected = Boolean(selectedEntry);
                          const packs = getProductPackOptions(product);
                          const activePack = selectedEntry
                            ? packs.find(pk => pk.id === selectedEntry.variantId) ||
                              packs.find(pk => pk.weightLabel === selectedEntry.weightLabel) ||
                              packs[0]
                            : packs[0];

                          return (
                            <div
                              key={product.id}
                              className={`rounded-2xl border transition-all flex flex-col justify-between p-4 gap-3 ${
                                isSelected
                                  ? 'bg-[#1c120c] border-[#dfc471] shadow-lg shadow-black/30'
                                  : 'bg-[#120c08] border-[#38281d] hover:border-[#6a503a]'
                              }`}
                            >
                              <button
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => toggleProduct(product)}
                                className="flex items-start gap-3.5 text-left w-full cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471]"
                              >
                                <img
                                  src={product.image}
                                  alt={product.name}
                                  loading="lazy"
                                  onError={e => {
                                    const target = e.currentTarget;
                                    if (target.dataset.fbApplied === '1') return;
                                    target.dataset.fbApplied = '1';
                                    target.src = product.fallbackImage || FALLBACK_PRODUCT_IMG;
                                  }}
                                  className="w-14 h-14 rounded-xl object-cover shrink-0 border border-[#38281d] bg-[#1a110b]"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <h3 className="font-serif text-base text-[#f9f6f2] leading-snug">
                                      {product.name}
                                    </h3>
                                    <span
                                      aria-hidden="true"
                                      className={`w-6 h-6 rounded-full flex items-center justify-center border shrink-0 mt-0.5 transition-colors ${
                                        isSelected
                                          ? 'bg-[#dfc471] text-[#0d0805] border-[#dfc471]'
                                          : 'border-[#5a4231] bg-[#1a110b]'
                                      }`}
                                    >
                                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                                    </span>
                                  </div>
                                  <p className="text-xs text-[#d5c4b4] mt-0.5 truncate">
                                    {product.categoryName || product.grade}
                                  </p>
                                  <div className="text-xs font-semibold text-[#dfc471] mt-1 tabular-nums">
                                    From {formatINR(product.price)} / {getEffectiveUnitLabel(product)}
                                  </div>
                                </div>
                              </button>

                              {/* Inline Pack & Quantity Selector when Selected */}
                              {isSelected && selectedEntry && (
                                <div className="pt-3 border-t border-[#38281d] space-y-2.5">
                                  <div>
                                    <span className="text-[11px] font-medium text-[#e5d5c6] block mb-1.5">
                                      Pack Size:
                                    </span>
                                    <div
                                      role="group"
                                      aria-label={`Select pack size for ${product.name}`}
                                      className="flex flex-wrap gap-1.5"
                                    >
                                      {packs.map(pk => {
                                        const isPackActive = pk.id === activePack.id;
                                        return (
                                          <button
                                            key={pk.id}
                                            type="button"
                                            aria-pressed={isPackActive}
                                            onClick={() => updateProductPack(product.id, pk)}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471] ${
                                              isPackActive
                                                ? 'bg-[#dfc471] text-[#0d0805] border-[#dfc471] font-semibold'
                                                : 'bg-[#150d09] text-[#e5d5c6] border-[#4a3628] hover:border-[#dfc471]'
                                            }`}
                                          >
                                            {pk.weightLabel} · {formatINR(pk.sellingPrice)}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs text-[#e5d5c6]">Packs / Boxes:</span>
                                    <div className="inline-flex items-center gap-1.5 bg-[#150d09] border border-[#4a3628] rounded-xl p-1">
                                      <button
                                        type="button"
                                        onClick={() => updateProductQty(product.id, -1)}
                                        aria-label={`Decrease quantity for ${product.name}`}
                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#f9f6f2] hover:bg-[#2a1d15] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471]"
                                      >
                                        <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                                      </button>
                                      <span
                                        aria-label={`Quantity: ${selectedEntry.quantity}`}
                                        className="min-w-[2rem] text-center text-xs font-bold text-[#f9f6f2] tabular-nums"
                                      >
                                        {selectedEntry.quantity}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => updateProductQty(product.id, 1)}
                                        aria-label={`Increase quantity for ${product.name}`}
                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#f9f6f2] hover:bg-[#2a1d15] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471]"
                                      >
                                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {!isFiltering && filteredProducts.length > visibleLimit && (
                        <div className="pt-2 text-center">
                          <button
                            type="button"
                            onClick={() => setVisibleLimit(v => v + 24)}
                            className="px-6 py-3 rounded-full bg-[#1c120c] border border-[#4a3628] hover:border-[#dfc471] text-xs font-semibold uppercase tracking-wider text-[#dfc471] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471] transition-colors"
                          >
                            Load More Products ({filteredProducts.length - visibleLimit} remaining)
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </section>

                {/* STEP 2: PACKAGING & SPECIFICATIONS */}
                <section
                  id="step-packaging"
                  aria-labelledby="step-packaging-heading"
                  className="p-5 sm:p-8 rounded-3xl bg-[#150d09] border border-[#38281d] space-y-6"
                >
                  <div className="pb-4 border-b border-[#251a13]">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#dfc471]">
                      Step 2 of 3
                    </span>
                    <h2
                      id="step-packaging-heading"
                      className="font-serif text-2xl sm:text-3xl text-[#f9f6f2] mt-0.5"
                    >
                      Packaging &amp; Bespoke Specifications
                    </h2>
                  </div>

                  <fieldset className="space-y-3">
                    <legend className="text-sm font-medium text-[#f9f6f2] flex items-center gap-2 mb-2">
                      <Box className="w-4 h-4 text-[#dfc471]" aria-hidden="true" />
                      <span>Presentation Packaging Style</span>
                    </legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {PACKAGING_OPTIONS.map(opt => {
                        const checked = packagingType === opt.label;
                        return (
                          <label
                            key={opt.id}
                            className={`p-4 rounded-2xl border cursor-pointer flex items-start gap-3 transition-colors focus-within:ring-2 focus-within:ring-[#dfc471] ${
                              checked
                                ? 'bg-[#1c120c] border-[#dfc471]'
                                : 'bg-[#120c08] border-[#38281d] hover:border-[#6a503a]'
                            }`}
                          >
                            <input
                              type="radio"
                              name="packagingType"
                              checked={checked}
                              onChange={() => setPackagingType(opt.label)}
                              className="mt-1 w-4 h-4 accent-[#dfc471] shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-1.5">
                                <span className="text-sm font-semibold text-[#f9f6f2]">
                                  {opt.label}
                                </span>
                                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#dfc471]/15 text-[#dfc471] font-semibold">
                                  {opt.badge}
                                </span>
                              </div>
                              <span className="text-xs text-[#d5c4b4] mt-1 block leading-relaxed">
                                {opt.desc}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="custom-occasion"
                        className="block text-xs font-semibold uppercase tracking-wider text-[#e5d5c6] mb-1.5"
                      >
                        Occasion / Purpose
                      </label>
                      <select
                        id="custom-occasion"
                        value={occasion}
                        onChange={e => setOccasion(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-[#1c120c] border border-[#4a3628] text-sm text-[#f9f6f2] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471] focus-visible:border-[#dfc471]"
                      >
                        {OCCASIONS.map(occ => (
                          <option key={occ} value={occ}>
                            {occ}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="custom-volume"
                        className="block text-xs font-semibold uppercase tracking-wider text-[#e5d5c6] mb-1.5"
                      >
                        Approximate Order Volume
                      </label>
                      <input
                        id="custom-volume"
                        type="text"
                        value={estimatedQuantity}
                        onChange={e => setEstimatedQuantity(e.target.value)}
                        placeholder="e.g. 25 Velvet Boxes / 20 kg bulk"
                        className="w-full px-4 py-3 rounded-xl bg-[#1c120c] border border-[#4a3628] text-sm text-[#f9f6f2] placeholder:text-[#b8a596] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471] focus-visible:border-[#dfc471]"
                      />
                    </div>
                  </div>

                  {/* Quick Volume Preset Chips */}
                  <div className="flex flex-wrap items-center gap-2" aria-label="Volume presets">
                    <span className="text-xs text-[#d5c4b4]">Quick volume:</span>
                    {VOLUME_PRESETS.map(vol => (
                      <button
                        key={vol}
                        type="button"
                        onClick={() => setEstimatedQuantity(vol)}
                        className={`px-3 py-1 rounded-full text-xs border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471] ${
                          estimatedQuantity === vol
                            ? 'bg-[#dfc471]/20 border-[#dfc471] text-[#dfc471] font-semibold'
                            : 'bg-[#1c120c] border-[#38281d] text-[#d5c4b4] hover:border-[#dfc471]/60'
                        }`}
                      >
                        {vol}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label
                      htmlFor="custom-demands"
                      className="block text-xs font-semibold uppercase tracking-wider text-[#e5d5c6] mb-1.5"
                    >
                      Custom Ratios, Monogramming &amp; Special Requests
                    </label>
                    <textarea
                      id="custom-demands"
                      rows={3}
                      value={specificDemands}
                      onChange={e => setSpecificDemands(e.target.value)}
                      placeholder="Specify nut/spice split ratios, company ribbon logo printing, roasting preference, or dietary notes..."
                      className="w-full px-4 py-3 rounded-xl bg-[#1c120c] border border-[#4a3628] text-sm text-[#f9f6f2] placeholder:text-[#b8a596] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471] focus-visible:border-[#dfc471]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="custom-target-date"
                        className="block text-xs font-semibold uppercase tracking-wider text-[#e5d5c6] mb-1.5"
                      >
                        Target Delivery Date / Festival
                      </label>
                      <div className="relative">
                        <Calendar
                          className="w-4 h-4 text-[#dfc471] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                          aria-hidden="true"
                        />
                        <input
                          id="custom-target-date"
                          type="text"
                          value={targetDate}
                          onChange={e => setTargetDate(e.target.value)}
                          placeholder="e.g. 25 Nov or Diwali Week"
                          className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#1c120c] border border-[#4a3628] text-sm text-[#f9f6f2] placeholder:text-[#b8a596] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471] focus-visible:border-[#dfc471]"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="custom-gift-note"
                        className="block text-xs font-semibold uppercase tracking-wider text-[#e5d5c6] mb-1.5"
                      >
                        Printed Gift Card Message (Optional)
                      </label>
                      <input
                        id="custom-gift-note"
                        type="text"
                        value={customMessage}
                        onChange={e => setCustomMessage(e.target.value)}
                        placeholder="Warm wishes from our family to yours..."
                        className="w-full px-4 py-3 rounded-xl bg-[#1c120c] border border-[#4a3628] text-sm text-[#f9f6f2] placeholder:text-[#b8a596] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471] focus-visible:border-[#dfc471]"
                      />
                    </div>
                  </div>
                </section>

                {/* STEP 3: CONTACT & DELIVERY DETAILS */}
                <section
                  id="step-contact"
                  aria-labelledby="step-contact-heading"
                  className="p-5 sm:p-8 rounded-3xl bg-[#150d09] border border-[#38281d] space-y-6"
                >
                  <div className="pb-4 border-b border-[#251a13]">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#dfc471]">
                      Step 3 of 3
                    </span>
                    <h2
                      id="step-contact-heading"
                      className="font-serif text-2xl sm:text-3xl text-[#f9f6f2] mt-0.5"
                    >
                      Contact &amp; Dispatch Details
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="custom-full-name"
                        className="block text-xs font-semibold uppercase tracking-wider text-[#e5d5c6] mb-1.5"
                      >
                        Full Name <span className="text-[#dfc471]" aria-hidden="true">*</span>
                      </label>
                      <div className="relative">
                        <User
                          className="w-4 h-4 text-[#dfc471] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                          aria-hidden="true"
                        />
                        <input
                          id="custom-full-name"
                          type="text"
                          required
                          aria-required="true"
                          autoComplete="name"
                          value={fullName}
                          onChange={e => setFullName(e.target.value)}
                          placeholder="Your full name"
                          className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#1c120c] border border-[#4a3628] text-sm text-[#f9f6f2] placeholder:text-[#b8a596] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471] focus-visible:border-[#dfc471]"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="custom-mobile"
                        className="block text-xs font-semibold uppercase tracking-wider text-[#e5d5c6] mb-1.5"
                      >
                        Mobile / WhatsApp Number <span className="text-[#dfc471]" aria-hidden="true">*</span>
                      </label>
                      <div className="relative">
                        <Phone
                          className="w-4 h-4 text-[#dfc471] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                          aria-hidden="true"
                        />
                        <input
                          id="custom-mobile"
                          type="tel"
                          required
                          aria-required="true"
                          autoComplete="tel"
                          value={mobileNumber}
                          onChange={e => setMobileNumber(e.target.value)}
                          placeholder="+91 98765 43210"
                          className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#1c120c] border border-[#4a3628] text-sm text-[#f9f6f2] placeholder:text-[#b8a596] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471] focus-visible:border-[#dfc471]"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="custom-email"
                        className="block text-xs font-semibold uppercase tracking-wider text-[#e5d5c6] mb-1.5"
                      >
                        Email Address
                      </label>
                      <div className="relative">
                        <Mail
                          className="w-4 h-4 text-[#dfc471] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                          aria-hidden="true"
                        />
                        <input
                          id="custom-email"
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          placeholder="name@company.com"
                          className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#1c120c] border border-[#4a3628] text-sm text-[#f9f6f2] placeholder:text-[#b8a596] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471] focus-visible:border-[#dfc471]"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="custom-organization"
                        className="block text-xs font-semibold uppercase tracking-wider text-[#e5d5c6] mb-1.5"
                      >
                        Company / Family Name (Optional)
                      </label>
                      <div className="relative">
                        <Building2
                          className="w-4 h-4 text-[#dfc471] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                          aria-hidden="true"
                        />
                        <input
                          id="custom-organization"
                          type="text"
                          autoComplete="organization"
                          value={organization}
                          onChange={e => setOrganization(e.target.value)}
                          placeholder="Organization or wedding family name"
                          className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#1c120c] border border-[#4a3628] text-sm text-[#f9f6f2] placeholder:text-[#b8a596] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471] focus-visible:border-[#dfc471]"
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label
                        htmlFor="custom-city"
                        className="block text-xs font-semibold uppercase tracking-wider text-[#e5d5c6] mb-1.5"
                      >
                        Delivery City <span className="text-[#dfc471]" aria-hidden="true">*</span>
                      </label>
                      <div className="relative">
                        <MapPin
                          className="w-4 h-4 text-[#dfc471] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                          aria-hidden="true"
                        />
                        <input
                          id="custom-city"
                          type="text"
                          required
                          aria-required="true"
                          value={city}
                          onChange={e => setCity(e.target.value)}
                          placeholder="Jammu, Delhi NCR, Mumbai, Bengaluru..."
                          className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#1c120c] border border-[#4a3628] text-sm text-[#f9f6f2] placeholder:text-[#b8a596] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471] focus-visible:border-[#dfc471]"
                        />
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* Sticky Right Summary & Live Quote Panel */}
              <aside
                aria-label="Live bespoke quote summary"
                className="lg:col-span-4 lg:sticky lg:top-28 space-y-4"
              >
                <div className="p-5 sm:p-6 rounded-3xl bg-[#150d09] border border-[#4a3628] shadow-2xl space-y-5">
                  <div className="flex items-center justify-between border-b border-[#251a13] pb-3.5">
                    <h2 className="font-serif text-xl text-[#f9f6f2]">Bespoke Summary</h2>
                    <span className="text-xs font-semibold text-[#dfc471] tabular-nums">
                      {selectedEntries.length} Item{selectedEntries.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {selectedEntries.length === 0 ? (
                    <div className="py-6 text-center rounded-2xl bg-[#120c08] border border-dashed border-[#38281d] px-4">
                      <p className="text-xs text-[#d5c4b4]">
                        Select harvests from Step 1 to build your custom hamper or wholesale quotation.
                      </p>
                    </div>
                  ) : (
                    <ul className="space-y-3 max-h-72 overflow-y-auto pr-1" aria-label="Selected products summary">
                      {selectedEntries.map(entry => (
                        <li
                          key={entry.product.id}
                          className="flex items-start justify-between gap-2.5 p-3 rounded-2xl bg-[#1c120c] border border-[#38281d]"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-serif text-[#f9f6f2] truncate">
                              {entry.product.name}
                            </div>
                            <div className="text-xs text-[#d5c4b4] mt-0.5">
                              {entry.quantity} × {entry.pack.weightLabel} @ {formatINR(entry.unitPrice)}
                            </div>
                          </div>
                          <div className="text-right shrink-0 flex flex-col items-end gap-1">
                            <span className="text-xs font-bold text-[#dfc471] tabular-nums">
                              {formatINR(entry.lineTotal)}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleProduct(entry.product)}
                              aria-label={`Remove ${entry.product.name}`}
                              className="p-1 text-[#d5c4b4] hover:text-red-300 rounded cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfc471]"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <dl className="space-y-2 text-xs border-t border-[#251a13] pt-4">
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#d5c4b4]">Packaging</dt>
                      <dd className="text-[#f9f6f2] font-medium text-right">{packagingType}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#d5c4b4]">Occasion</dt>
                      <dd className="text-[#f9f6f2] font-medium text-right">{occasion}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#d5c4b4]">Target Volume</dt>
                      <dd className="text-[#f9f6f2] font-medium text-right">{estimatedQuantity}</dd>
                    </div>
                    <div className="flex justify-between gap-2 pt-2 border-t border-[#251a13] text-sm">
                      <dt className="font-semibold text-[#f9f6f2]">Estimated Sample Total</dt>
                      <dd className="font-bold text-[#dfc471] tabular-nums text-base">
                        {formatINR(estimatedGoodsTotal)}
                      </dd>
                    </div>
                  </dl>

                  <p className="text-[11px] text-[#d5c4b4] leading-relaxed bg-[#120c08] rounded-xl p-3 border border-[#251a13] flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#dfc471] shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      Direct Jammu grading &amp; volume tier discounts are finalized with our family concierge before invoicing.
                    </span>
                  </p>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3.5 px-5 rounded-full text-xs sm:text-sm font-semibold tracking-wider uppercase bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] hover:brightness-105 disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white shadow-lg"
                  >
                    <Send className="w-4 h-4" aria-hidden="true" />
                    <span>{submitting ? 'Submitting Custom Order...' : 'Submit Custom Demand Order'}</span>
                  </button>
                </div>
              </aside>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
