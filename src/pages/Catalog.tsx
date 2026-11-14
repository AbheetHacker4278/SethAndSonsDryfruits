import { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  CatalogProduct,
  BRAND_CONFIG,
  calculateOrderShippingCharge,
  isKesarProduct,
  isSuratCity,
  SURAT_SHIPPING_FEE,
  OTHER_CITY_SHIPPING_FEE,
  type ProductWeightVariant,
} from '../data/products';
import {
  formatINR,
  getProductPackOptions,
  parseWeightGrams,
} from '../utils/priceCalculator';
import { generateWhatsAppUrl } from '../utils/whatsapp';
import { useAuth } from '../context/AuthContext';
import {
  AddressItem,
  apiRequest,
  ApiError,
  PersistedOrder,
} from '../services/api';
import ScrollReveal from '../components/ScrollReveal';
import confetti from 'canvas-confetti';
import {
  Search,
  ShoppingBag,
  Plus,
  Minus,
  Check,
  Sparkles,
  SlidersHorizontal,
  X,
  Trash2,
  Send,
  MessageCircle,
  Gift,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MapPin,
  Film,
  Volume2,
  VolumeX,
  Heart,
  Truck,
  Tag,
  Lock,
  LayoutGrid,
  List,
  RotateCcw,
  Eye,
  Package,
} from 'lucide-react';

interface CatalogProps {
  cartItems: Record<string, number>;
  onUpdateQuantity: (cartKey: string, quantity: number) => void;
  onClearCart: () => void;
  openCartSignal?: number;
}

const DEFAULT_FALLBACK_IMG =
  '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg';

const PRICE_PRESETS = [
  { id: 'all', label: 'All Prices', min: null, max: null },
  { id: 'under-500', label: 'Under ₹500', min: 0, max: 500 },
  { id: '500-1000', label: '₹500 – ₹1,000', min: 500, max: 1000 },
  { id: '1000-1500', label: '₹1,000 – ₹1,500', min: 1000, max: 1500 },
  { id: '1500-plus', label: '₹1,500+', min: 1500, max: null },
] as const;

const GRADE_FILTERS = [
  { id: 'in-shell', label: 'In-Shell Walnuts' },
  { id: 'kernels', label: 'Kernels / Giri' },
  { id: 'organic', label: 'Organic & Wild' },
  { id: 'snow-white', label: 'Snow / Milky White' },
  { id: 'star-reserve', label: 'Star Reserve (3★–7★)' },
] as const;

function getEffectivePackPrice(pack: ProductWeightVariant): number {
  if (
    pack.discountPrice &&
    pack.discountPrice > 0 &&
    pack.discountPrice < pack.sellingPrice
  ) {
    return pack.discountPrice;
  }
  return pack.sellingPrice;
}

function getDefaultPack(
  product: CatalogProduct,
  packs: ProductWeightVariant[],
  preferredLabel?: string
): ProductWeightVariant {
  if (preferredLabel && preferredLabel !== 'all') {
    const matched = packs.find(
      p => p.weightLabel.toLowerCase() === preferredLabel.toLowerCase()
    );
    if (matched) return matched;
  }
  if (product.unit === 'kg') {
    return (
      packs.find(p => parseWeightGrams(p.weightLabel) === 1000) ||
      packs[packs.length - 1]
    );
  }
  return packs[0];
}

function parseCartKey(cartKey: string): { productId: string; variantId: string | null } {
  const sepIdx = cartKey.indexOf('::');
  if (sepIdx === -1) return { productId: cartKey, variantId: null };
  return {
    productId: cartKey.slice(0, sepIdx),
    variantId: cartKey.slice(sepIdx + 2) || null,
  };
}

function matchesOriginRegion(productOrigin: string, region: string): boolean {
  if (region === 'all') return true;
  return productOrigin.toLowerCase().includes(region.toLowerCase());
}

function matchesGradeType(product: CatalogProduct, gradeId: string): boolean {
  const hay = `${product.name} ${product.subtitle} ${product.grade} ${product.description}`.toLowerCase();
  switch (gradeId) {
    case 'in-shell':
      return hay.includes('in-shell') || hay.includes('साबुत');
    case 'kernels':
      return hay.includes('kernel') || hay.includes('giri') || hay.includes('halves') || hay.includes('pieces');
    case 'organic':
      return hay.includes('organic') || hay.includes('wild');
    case 'snow-white':
      return hay.includes('milky') || hay.includes('snow');
    case 'star-reserve':
      return /\b[3457][-\s]?star\b/i.test(hay);
    default:
      return true;
  }
}

export default function Catalog({
  cartItems,
  onUpdateQuantity,
  onClearCart,
  openCartSignal,
}: CatalogProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, products, categories: adminCategories, publicSettings } = useAuth();

  // Sidebar & Toolbar Filter States
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedPackFilter, setSelectedPackFilter] = useState<string>('all');
  const [pricePreset, setPricePreset] = useState<string>('all');
  const [minPriceInput, setMinPriceInput] = useState<string>('');
  const [maxPriceInput, setMaxPriceInput] = useState<string>('');
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [selectedOrigin, setSelectedOrigin] = useState<string>('all');
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [featuredOnly, setFeaturedOnly] = useState<boolean>(false);
  const [reelOnly, setReelOnly] = useState<boolean>(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc' | 'name'>('featured');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Accordion states inside filter sidebar
  const [openSections, setOpenSections] = useState({
    categories: true,
    packSize: true,
    price: true,
    grade: true,
    origin: true,
    availability: true,
  });

  // Pack selection & Pack Quantity state per product
  const [selectedPackIdByProduct, setSelectedPackIdByProduct] = useState<Record<string, string>>({});
  const [draftPackCount, setDraftPackCount] = useState<Record<string, number>>({});
  const [addedAnimationKey, setAddedAnimationKey] = useState<string | null>(null);
  const [productImageIndex, setProductImageIndex] = useState<Record<string, number>>({});
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
  const [savedAddresses, setSavedAddresses] = useState<AddressItem[]>([]);

  // Detail Modal State
  const [detailProduct, setDetailProduct] = useState<CatalogProduct | null>(null);
  const [detailActiveImgIndex, setDetailActiveImgIndex] = useState<number>(0);
  const [detailMediaTab, setDetailMediaTab] = useState<'photos' | 'video'>('photos');
  const [isDetailVideoMuted, setIsDetailVideoMuted] = useState<boolean>(true);
  const detailVideoRef = useRef<HTMLVideoElement | null>(null);

  // Checkout Drawer & Order State
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);

  useEffect(() => {
    if (openCartSignal && openCartSignal > 0) {
      setIsCartDrawerOpen(true);
    }
  }, [openCartSignal]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('cart') === 'open') {
      setIsCartDrawerOpen(true);
      params.delete('cart');
      const nextSearch = params.toString();
      navigate(
        { pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' },
        { replace: true }
      );
    }
  }, [location.pathname, location.search, navigate]);
  const [submittedOrder, setSubmittedOrder] = useState<PersistedOrder | null>(null);
  const [checkoutError, setCheckoutError] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [resendVerificationMsg, setResendVerificationMsg] = useState('');

  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountAmount: number;
    title: string;
  } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Concierge Invoice / COD');

  const [customer, setCustomer] = useState({
    fullName: user?.name || '',
    mobileNumber: user?.phone || '',
    deliveryAddress: '',
    city: '',
    state: '',
    pincode: '',
    instructions: '',
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (detailProduct) setDetailProduct(null);
        else if (mobileFiltersOpen) setMobileFiltersOpen(false);
        else if (submittedOrder) setSubmittedOrder(null);
        else if (isCartDrawerOpen) setIsCartDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [detailProduct, mobileFiltersOpen, submittedOrder, isCartDrawerOpen]);

  useEffect(() => {
    if (!user) {
      setWishlistIds(new Set());
      setSavedAddresses([]);
      return;
    }

    setCustomer(prev => ({
      ...prev,
      fullName: prev.fullName || user.name,
      mobileNumber: prev.mobileNumber || user.phone,
    }));

    apiRequest<{ items: Array<{ product: { id: string } }> }>('/api/account/wishlist')
      .then(res => setWishlistIds(new Set(res.items.map(i => i.product.id))))
      .catch(() => {});

    apiRequest<{ addresses: AddressItem[] }>('/api/account/addresses')
      .then(res => {
        setSavedAddresses(res.addresses);
        const def = res.addresses.find(a => a.isDefault) || res.addresses[0];
        if (def) {
          setCustomer(prev => ({
            ...prev,
            fullName: prev.fullName || def.fullName,
            mobileNumber: prev.mobileNumber || def.phone,
            deliveryAddress: prev.deliveryAddress || def.addressLine,
            city: def.city,
            state: def.state,
            pincode: def.pincode,
          }));
        }
      })
      .catch(() => {});
  }, [user]);

  // Build pack options map for every product
  const packOptionsByProduct = useMemo(() => {
    const map: Record<string, ProductWeightVariant[]> = {};
    for (const p of products) {
      map[p.id] = getProductPackOptions(p);
    }
    return map;
  }, [products]);

  const getSelectedPackForProduct = (product: CatalogProduct): ProductWeightVariant => {
    const packs = packOptionsByProduct[product.id] || getProductPackOptions(product);
    const chosenId = selectedPackIdByProduct[product.id];
    if (chosenId) {
      const found = packs.find(v => v.id === chosenId);
      if (found) return found;
    }
    return getDefaultPack(
      product,
      packs,
      selectedPackFilter !== 'all' ? selectedPackFilter : undefined
    );
  };

  // Dynamic Categories list combining Admin Categories + fallback broad categories (hiding empty 0-product categories)
  const sidebarCategories = useMemo(() => {
    if (adminCategories.length > 0) {
      return adminCategories
        .map(cat => ({
          id: cat.id,
          label: cat.name,
          count: products.filter(p => p.categoryId === cat.id).length,
        }))
        .filter(c => c.count > 0);
    }
    return [
      { id: 'nuts', label: 'Himalayan Nuts', count: products.filter(p => p.category === 'nuts').length },
      { id: 'saffron', label: 'Pure Kashmiri Saffron', count: products.filter(p => p.category === 'saffron').length },
      { id: 'dried-fruits', label: 'Sun-Dried Fruits', count: products.filter(p => p.category === 'dried-fruits').length },
    ].filter(c => c.count > 0);
  }, [adminCategories, products]);

  // Dynamic Pack Size labels across all products (including Admin custom packs)
  const availablePackLabels = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of products) {
      const packs = packOptionsByProduct[p.id] || [];
      for (const v of packs) {
        const label = v.weightLabel.trim();
        if (!seen.has(label)) {
          seen.set(label, parseWeightGrams(label) ?? Number.MAX_SAFE_INTEGER);
        }
      }
    }
    return Array.from(seen.entries())
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .map(([label]) => label);
  }, [products, packOptionsByProduct]);

  // Curated Origin regions derived dynamically
  const originRegions = useMemo(() => {
    const candidates = ['Jammu', 'Kishtwar', 'Chenab', 'Kashmir', 'Pampore', 'Afghanistan'];
    return candidates
      .map(region => ({
        id: region,
        label: region === 'Chenab' ? 'Chenab Valley' : region,
        count: products.filter(p => matchesOriginRegion(p.origin, region)).length,
      }))
      .filter(r => r.count > 0);
  }, [products]);

  const effectiveMinPrice =
    minPriceInput.trim() !== '' && !Number.isNaN(Number(minPriceInput))
      ? Number(minPriceInput)
      : PRICE_PRESETS.find(pr => pr.id === pricePreset)?.min ?? null;

  const effectiveMaxPrice =
    maxPriceInput.trim() !== '' && !Number.isNaN(Number(maxPriceInput))
      ? Number(maxPriceInput)
      : PRICE_PRESETS.find(pr => pr.id === pricePreset)?.max ?? null;

  // Filtered & Sorted Products
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products
      .filter(p => {
        if (selectedCategoryId !== 'all') {
          const matchesAdminCat = p.categoryId === selectedCategoryId;
          const matchesBroadCat = p.category === selectedCategoryId;
          if (!matchesAdminCat && !matchesBroadCat) return false;
        }

        const packs = packOptionsByProduct[p.id] || [];
        if (selectedPackFilter !== 'all') {
          const hasPack = packs.some(
            v => v.weightLabel.toLowerCase() === selectedPackFilter.toLowerCase()
          );
          if (!hasPack) return false;
        }

        const activePack = getSelectedPackForProduct(p);
        const displayPrice = getEffectivePackPrice(activePack);
        if (effectiveMinPrice !== null && displayPrice < effectiveMinPrice) return false;
        if (effectiveMaxPrice !== null && displayPrice > effectiveMaxPrice) return false;

        if (selectedGrades.length > 0) {
          const matchesAny = selectedGrades.some(g => matchesGradeType(p, g));
          if (!matchesAny) return false;
        }

        if (!matchesOriginRegion(p.origin, selectedOrigin)) return false;

        if (inStockOnly && (!p.inStock || (typeof p.stock === 'number' && p.stock <= 0))) {
          return false;
        }
        if (featuredOnly && !(p as any).featured) return false;
        if (reelOnly && !p.videoUrl) return false;

        if (q) {
          const hay = `${p.name} ${p.subtitle} ${p.origin} ${p.grade} ${p.description} ${p.sku || ''} ${p.categoryName || ''}`.toLowerCase();
          const hindiMatch = p.hindiName && p.hindiName.includes(searchQuery.trim());
          if (!hay.includes(q) && !hindiMatch) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const priceA = getEffectivePackPrice(getSelectedPackForProduct(a));
        const priceB = getEffectivePackPrice(getSelectedPackForProduct(b));
        if (sortBy === 'price-asc') return priceA - priceB;
        if (sortBy === 'price-desc') return priceB - priceA;
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        // Featured first, preserving seed order otherwise
        const fa = (a as any).featured ? 0 : 1;
        const fb = (b as any).featured ? 0 : 1;
        return fa - fb;
      });
  }, [
    products,
    selectedCategoryId,
    selectedPackFilter,
    effectiveMinPrice,
    effectiveMaxPrice,
    selectedGrades,
    selectedOrigin,
    inStockOnly,
    featuredOnly,
    reelOnly,
    searchQuery,
    sortBy,
    packOptionsByProduct,
    selectedPackIdByProduct,
  ]);

  // Active filter chips for quick visibility & removal
  const activeFilterCount =
    (selectedCategoryId !== 'all' ? 1 : 0) +
    (selectedPackFilter !== 'all' ? 1 : 0) +
    (effectiveMinPrice !== null || effectiveMaxPrice !== null ? 1 : 0) +
    selectedGrades.length +
    (selectedOrigin !== 'all' ? 1 : 0) +
    (inStockOnly ? 1 : 0) +
    (featuredOnly ? 1 : 0) +
    (reelOnly ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0);

  const resetAllFilters = () => {
    setSelectedCategoryId('all');
    setSelectedPackFilter('all');
    setPricePreset('all');
    setMinPriceInput('');
    setMaxPriceInput('');
    setSelectedGrades([]);
    setSelectedOrigin('all');
    setInStockOnly(false);
    setFeaturedOnly(false);
    setReelOnly(false);
    setSearchQuery('');
  };

  // Cart Resolution (handles both `${productId}::${variantId}` and legacy plain `productId`)
  const activeOrderItems = useMemo(() => {
    return Object.entries(cartItems)
      .filter(([, qty]) => qty > 0)
      .map(([cartKey, quantity]) => {
        const { productId, variantId } = parseCartKey(cartKey);
        const product = products.find(p => p.id === productId);
        if (!product) return null;
        const packs = packOptionsByProduct[product.id] || getProductPackOptions(product);
        const pack = variantId
          ? packs.find(v => v.id === variantId) || getDefaultPack(product, packs)
          : null;
        const unitPrice = pack ? getEffectivePackPrice(pack) : product.price;
        const weightLabel = pack ? pack.weightLabel : null;
        const subtotal = Math.round(unitPrice * quantity);
        return {
          cartKey,
          product,
          pack,
          variantId: pack ? pack.id : null,
          weightLabel,
          unitPrice,
          quantity,
          subtotal,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [cartItems, products, packOptionsByProduct]);

  const bizRules = publicSettings?.business;
  const gstRatePct = typeof bizRules?.defaultGstRate === 'number' ? bizRules.defaultGstRate : 5;

  const subtotal = activeOrderItems.reduce((sum, it) => sum + it.subtotal, 0);
  const discountAmount = appliedCoupon ? Math.min(appliedCoupon.discountAmount, subtotal) : 0;
  const netAfterDiscount = Math.max(0, subtotal - discountAmount);

  const effectiveShippingCity = (customer.city || user?.shippingAddress?.city || '').trim();
  const isSurat = isSuratCity(effectiveShippingCity);
  const shippingCharge = activeOrderItems.length > 0
    ? (effectiveShippingCity
        ? (isSurat ? SURAT_SHIPPING_FEE : OTHER_CITY_SHIPPING_FEE)
        : (user?.shippingAddress?.city
            ? (isSuratCity(user.shippingAddress.city) ? SURAT_SHIPPING_FEE : OTHER_CITY_SHIPPING_FEE)
            : OTHER_CITY_SHIPPING_FEE))
    : 0;

  const taxAmount = Math.round(netAfterDiscount * (gstRatePct / 100));
  const finalTotal = netAfterDiscount + shippingCharge + taxAmount;

  const getPackDraftKey = (productId: string, packId: string) => `${productId}::${packId}`;

  const getDraftQty = (productId: string, packId: string) => {
    const key = getPackDraftKey(productId, packId);
    if (draftPackCount[key] !== undefined) return draftPackCount[key];
    if (cartItems[key] && cartItems[key] > 0) return cartItems[key];
    return 1;
  };

  const handleDraftPackCountChange = (productId: string, packId: string, delta: number) => {
    const key = getPackDraftKey(productId, packId);
    setDraftPackCount(prev => {
      const current = prev[key] ?? (cartItems[key] > 0 ? cartItems[key] : 1);
      const next = Math.max(1, current + delta);
      return { ...prev, [key]: next };
    });
  };

  const handleAddPackToCart = (product: CatalogProduct, pack: ProductWeightVariant) => {
    const key = getPackDraftKey(product.id, pack.id);
    const qtyToAdd = getDraftQty(product.id, pack.id);
    onUpdateQuantity(key, qtyToAdd);
    setAddedAnimationKey(key);
    setTimeout(() => setAddedAnimationKey(null), 1600);
  };

  const handleToggleWishlist = async (productId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      navigate('/login?redirect=/catalog');
      return;
    }
    const isSaved = wishlistIds.has(productId);
    try {
      if (isSaved) {
        await apiRequest(`/api/account/wishlist/${productId}`, { method: 'DELETE' });
        setWishlistIds(prev => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
      } else {
        await apiRequest('/api/account/wishlist', { method: 'POST', body: { productId } });
        setWishlistIds(prev => new Set(prev).add(productId));
      }
    } catch {
      // non-fatal wishlist sync failure
    }
  };

  const handleApplyCoupon = async () => {
    setCouponError('');
    if (!couponCode.trim()) return;
    try {
      const res = await apiRequest<{
        coupon: { code: string; title: string };
        discountAmount: number;
      }>('/api/coupons/validate', {
        method: 'POST',
        body: { code: couponCode.trim(), subtotal },
      });
      setAppliedCoupon({
        code: res.coupon.code,
        title: res.coupon.title,
        discountAmount: res.discountAmount,
      });
    } catch (err) {
      setAppliedCoupon(null);
      setCouponError(err instanceof ApiError ? err.message : 'Invalid coupon code.');
    }
  };

  const handleResendVerify = async () => {
    if (!user) return;
    setResendVerificationMsg('');
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/resend-verification', {
        method: 'POST',
        body: { email: user.email },
      });
      setResendVerificationMsg(res.message);
    } catch (err) {
      setResendVerificationMsg(err instanceof ApiError ? err.message : 'Unable to resend link.');
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError('');

    if (!user) {
      setCheckoutError('Please sign in to place your order.');
      return;
    }
    if (!user.emailVerified) {
      setCheckoutError('Please verify your email address before completing checkout.');
      return;
    }
    if (activeOrderItems.length === 0) {
      setCheckoutError('Please select at least one product.');
      return;
    }

    const effectiveCity = (customer.city || user.shippingAddress?.city || '').trim();
    const effectiveState = (customer.state || user.shippingAddress?.state || '').trim();
    const effectivePincode = (customer.pincode || user.shippingAddress?.pincode || '').trim();
    const effectiveHouseFlat = (user.shippingAddress?.houseFlat || '').trim();
    const effectiveStreetArea = (user.shippingAddress?.streetArea || '').trim();
    const effectiveDeliveryAddress = (
      customer.deliveryAddress ||
      user.shippingAddress?.addressLine ||
      [effectiveHouseFlat, effectiveStreetArea].filter(Boolean).join(', ')
    ).trim();

    if (!effectiveCity || !effectiveState || !/^\d{6}$/.test(effectivePincode) || !effectiveDeliveryAddress) {
      setCheckoutError(
        'A complete shipping address (Address, City, State, 6-digit PIN) is mandatory before placing an order. Please update your shipping details.'
      );
      return;
    }

    setSubmittingOrder(true);
    try {
      const res = await apiRequest<{ order: PersistedOrder }>('/api/orders', {
        method: 'POST',
        body: {
          orderType: 'standard',
          items: activeOrderItems.map(it => ({
            productId: it.product.id,
            quantity: it.quantity,
            variantId: it.variantId || undefined,
            weightLabel: it.weightLabel || undefined,
          })),
          couponCode: appliedCoupon?.code || null,
          paymentMethod,
          deliveryAddress: {
            fullName: (customer.fullName || user.shippingAddress?.fullName || user.name).trim(),
            mobileNumber: (customer.mobileNumber || user.shippingAddress?.phone || user.phone).trim(),
            houseFlat: effectiveHouseFlat,
            streetArea: effectiveStreetArea,
            deliveryAddress: effectiveDeliveryAddress,
            city: effectiveCity,
            state: effectiveState,
            pincode: effectivePincode,
            country: user.shippingAddress?.country || 'India',
          },
          instructions: customer.instructions.trim(),
        },
      });

      try {
        confetti({
          particleCount: 65,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#dfc471', '#d4af37', '#f9f6f2', '#b99225'],
        });
      } catch {}

      setSubmittedOrder(res.order);
      onClearCart();
    } catch (err) {
      setCheckoutError(err instanceof ApiError ? err.message : 'Order submission failed.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const toggleGrade = (gradeId: string) => {
    setSelectedGrades(prev =>
      prev.includes(gradeId) ? prev.filter(g => g !== gradeId) : [...prev, gradeId]
    );
  };

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const totalCartCount = activeOrderItems.length;

  // Shared Filter Sidebar Panel (rendered in desktop sticky aside + mobile drawer)
  const renderFilterPanel = (idPrefix: string) => (
    <div className="space-y-5 text-sm">
      <div className="flex items-center justify-between pb-3 border-b border-[#38281d]">
        <div className="flex items-center gap-2 text-[#dfc471] font-semibold tracking-wider uppercase text-xs">
          <SlidersHorizontal className="w-4 h-4" />
          <span>Filter Harvests</span>
        </div>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={resetAllFilters}
            className="inline-flex items-center gap-1 text-xs text-[#dfc471] hover:text-white underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-[#dfc471] rounded px-1.5 py-0.5 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset ({activeFilterCount})</span>
          </button>
        )}
      </div>

      {/* Categories */}
      <div className="border-b border-[#251a13] pb-4">
        <button
          type="button"
          onClick={() => toggleSection('categories')}
          aria-expanded={openSections.categories}
          className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#f9f6f2] py-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#dfc471] rounded"
        >
          <span>Categories</span>
          <ChevronDown
            className={`w-4 h-4 text-[#dfc471] transition-transform ${
              openSections.categories ? 'rotate-180' : ''
            }`}
          />
        </button>
        {openSections.categories && (
          <div className="mt-3 space-y-1.5" role="group" aria-label="Filter by category">
            <button
              type="button"
              onClick={() => setSelectedCategoryId('all')}
              aria-pressed={selectedCategoryId === 'all'}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#dfc471] ${
                selectedCategoryId === 'all'
                  ? 'bg-[#dfc471] text-[#0d0805] font-semibold'
                  : 'text-[#e5d8cc] hover:bg-[#251a13]'
              }`}
            >
              <span>All Harvests</span>
              <span className="text-[11px] opacity-80 tabular-nums">{products.length}</span>
            </button>
            {sidebarCategories.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryId(cat.id)}
                aria-pressed={selectedCategoryId === cat.id}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#dfc471] ${
                  selectedCategoryId === cat.id
                    ? 'bg-[#dfc471] text-[#0d0805] font-semibold'
                    : 'text-[#e5d8cc] hover:bg-[#251a13]'
                }`}
              >
                <span className="truncate pr-2">{cat.label}</span>
                <span className="text-[11px] opacity-80 tabular-nums">{cat.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pack Size Filter */}
      <div className="border-b border-[#251a13] pb-4">
        <button
          type="button"
          onClick={() => toggleSection('packSize')}
          aria-expanded={openSections.packSize}
          className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#f9f6f2] py-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#dfc471] rounded"
        >
          <span>Pack Size</span>
          <ChevronDown
            className={`w-4 h-4 text-[#dfc471] transition-transform ${
              openSections.packSize ? 'rotate-180' : ''
            }`}
          />
        </button>
        {openSections.packSize && (
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by pack size">
            <button
              type="button"
              onClick={() => setSelectedPackFilter('all')}
              aria-pressed={selectedPackFilter === 'all'}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#dfc471] ${
                selectedPackFilter === 'all'
                  ? 'bg-[#dfc471] text-[#0d0805] border-[#dfc471] font-semibold'
                  : 'bg-[#1c120c] text-[#e5d8cc] border-[#38281d] hover:border-[#dfc471]/60'
              }`}
            >
              All Packs
            </button>
            {availablePackLabels.map(label => (
              <button
                key={label}
                type="button"
                onClick={() =>
                  setSelectedPackFilter(prev => (prev === label ? 'all' : label))
                }
                aria-pressed={selectedPackFilter === label}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#dfc471] ${
                  selectedPackFilter === label
                    ? 'bg-[#dfc471] text-[#0d0805] border-[#dfc471] font-semibold'
                    : 'bg-[#1c120c] text-[#e5d8cc] border-[#38281d] hover:border-[#dfc471]/60'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Price Range */}
      <div className="border-b border-[#251a13] pb-4">
        <button
          type="button"
          onClick={() => toggleSection('price')}
          aria-expanded={openSections.price}
          className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#f9f6f2] py-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#dfc471] rounded"
        >
          <span>Price Range</span>
          <ChevronDown
            className={`w-4 h-4 text-[#dfc471] transition-transform ${
              openSections.price ? 'rotate-180' : ''
            }`}
          />
        </button>
        {openSections.price && (
          <div className="mt-3 space-y-3">
            <div className="space-y-1.5" role="group" aria-label="Price presets">
              {PRICE_PRESETS.map(preset => {
                const active =
                  pricePreset === preset.id &&
                  minPriceInput === '' &&
                  maxPriceInput === '';
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setPricePreset(preset.id);
                      setMinPriceInput('');
                      setMaxPriceInput('');
                    }}
                    aria-pressed={active}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#dfc471] ${
                      active
                        ? 'bg-[#251a13] text-[#dfc471] border border-[#dfc471]/60 font-semibold'
                        : 'text-[#e5d8cc] hover:bg-[#1c120c]'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label
                  htmlFor={`${idPrefix}-min-price`}
                  className="block text-[11px] text-[#d5c4b4] mb-1"
                >
                  Min (₹)
                </label>
                <input
                  id={`${idPrefix}-min-price`}
                  type="number"
                  min={0}
                  value={minPriceInput}
                  onChange={e => {
                    setMinPriceInput(e.target.value);
                    setPricePreset('custom');
                  }}
                  placeholder="0"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2] focus:outline-none focus:border-[#dfc471]"
                />
              </div>
              <div>
                <label
                  htmlFor={`${idPrefix}-max-price`}
                  className="block text-[11px] text-[#d5c4b4] mb-1"
                >
                  Max (₹)
                </label>
                <input
                  id={`${idPrefix}-max-price`}
                  type="number"
                  min={0}
                  value={maxPriceInput}
                  onChange={e => {
                    setMaxPriceInput(e.target.value);
                    setPricePreset('custom');
                  }}
                  placeholder="2500"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2] focus:outline-none focus:border-[#dfc471]"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Variety & Grade */}
      <div className="border-b border-[#251a13] pb-4">
        <button
          type="button"
          onClick={() => toggleSection('grade')}
          aria-expanded={openSections.grade}
          className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#f9f6f2] py-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#dfc471] rounded"
        >
          <span>Harvest Type &amp; Grade</span>
          <ChevronDown
            className={`w-4 h-4 text-[#dfc471] transition-transform ${
              openSections.grade ? 'rotate-180' : ''
            }`}
          />
        </button>
        {openSections.grade && (
          <div className="mt-3 space-y-2">
            {GRADE_FILTERS.map(g => (
              <label
                key={g.id}
                className="flex items-center gap-2.5 text-xs text-[#e5d8cc] hover:text-white cursor-pointer py-0.5"
              >
                <input
                  type="checkbox"
                  checked={selectedGrades.includes(g.id)}
                  onChange={() => toggleGrade(g.id)}
                  className="w-4 h-4 rounded border-[#38281d] bg-[#1c120c] accent-[#dfc471] cursor-pointer"
                />
                <span>{g.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Origin */}
      {originRegions.length > 0 && (
        <div className="border-b border-[#251a13] pb-4">
          <button
            type="button"
            onClick={() => toggleSection('origin')}
            aria-expanded={openSections.origin}
            className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#f9f6f2] py-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#dfc471] rounded"
          >
            <span>Provenance Region</span>
            <ChevronDown
              className={`w-4 h-4 text-[#dfc471] transition-transform ${
                openSections.origin ? 'rotate-180' : ''
              }`}
            />
          </button>
          {openSections.origin && (
            <div className="mt-3 space-y-1.5" role="group" aria-label="Filter by origin">
              <button
                type="button"
                onClick={() => setSelectedOrigin('all')}
                aria-pressed={selectedOrigin === 'all'}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  selectedOrigin === 'all'
                    ? 'bg-[#251a13] text-[#dfc471] border border-[#dfc471]/60 font-semibold'
                    : 'text-[#e5d8cc] hover:bg-[#1c120c]'
                }`}
              >
                All Regions
              </button>
              {originRegions.map(reg => (
                <button
                  key={reg.id}
                  type="button"
                  onClick={() => setSelectedOrigin(reg.id)}
                  aria-pressed={selectedOrigin === reg.id}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                    selectedOrigin === reg.id
                      ? 'bg-[#251a13] text-[#dfc471] border border-[#dfc471]/60 font-semibold'
                      : 'text-[#e5d8cc] hover:bg-[#1c120c]'
                  }`}
                >
                  <span>{reg.label}</span>
                  <span className="text-[11px] opacity-80 tabular-nums">{reg.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Availability & Specials */}
      <div className="pb-2">
        <button
          type="button"
          onClick={() => toggleSection('availability')}
          aria-expanded={openSections.availability}
          className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#f9f6f2] py-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#dfc471] rounded"
        >
          <span>Availability &amp; Specials</span>
          <ChevronDown
            className={`w-4 h-4 text-[#dfc471] transition-transform ${
              openSections.availability ? 'rotate-180' : ''
            }`}
          />
        </button>
        {openSections.availability && (
          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-2.5 text-xs text-[#e5d8cc] hover:text-white cursor-pointer">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={e => setInStockOnly(e.target.checked)}
                className="w-4 h-4 rounded border-[#38281d] bg-[#1c120c] accent-[#dfc471] cursor-pointer"
              />
              <span>In Stock Only</span>
            </label>
            <label className="flex items-center gap-2.5 text-xs text-[#e5d8cc] hover:text-white cursor-pointer">
              <input
                type="checkbox"
                checked={featuredOnly}
                onChange={e => setFeaturedOnly(e.target.checked)}
                className="w-4 h-4 rounded border-[#38281d] bg-[#1c120c] accent-[#dfc471] cursor-pointer"
              />
              <span>Featured Royal Picks</span>
            </label>
            <label className="flex items-center gap-2.5 text-xs text-[#e5d8cc] hover:text-white cursor-pointer">
              <input
                type="checkbox"
                checked={reelOnly}
                onChange={e => setReelOnly(e.target.checked)}
                className="w-4 h-4 rounded border-[#38281d] bg-[#1c120c] accent-[#dfc471] cursor-pointer"
              />
              <span>1080p Harvest Reel Available</span>
            </label>
          </div>
        )}
      </div>

      {/* Mini Bag Summary inside Sidebar */}
      <div className="p-4 rounded-2xl bg-[#1c120c] border border-[#dfc471]/30 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[#dfc471] uppercase tracking-wider flex items-center gap-1.5">
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Your Bag</span>
          </span>
          <span className="text-[#e5d8cc] tabular-nums">
            {totalCartCount} {totalCartCount === 1 ? 'item' : 'items'}
          </span>
        </div>
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-[#d5c4b4]">Subtotal</span>
          <span className="font-bold text-base text-[#f9f6f2] tabular-nums">
            {formatINR(subtotal)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setMobileFiltersOpen(false);
            setIsCartDrawerOpen(true);
          }}
          className="w-full py-2.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] hover:brightness-110 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
        >
          Open Checkout Bag
        </button>
      </div>
    </div>
  );

  const detailPacks = detailProduct
    ? packOptionsByProduct[detailProduct.id] || getProductPackOptions(detailProduct)
    : [];
  const detailSelectedPack = detailProduct
    ? getSelectedPackForProduct(detailProduct)
    : null;

  return (
    <div className="min-h-screen bg-[#0d0805] text-[#ede4dc] pt-28 pb-24">
      <a
        href="#catalog-products"
        className="sr-only focus:not-sr-only focus:fixed focus:top-20 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-full focus:bg-[#dfc471] focus:text-[#0d0805] focus:font-semibold focus:text-xs"
      >
        Skip to product catalog
      </a>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 pb-7 border-b border-[#38281d]">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-sans font-medium tracking-[0.25em] uppercase text-[#dfc471] mb-2.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Seth And Sons DryFruits • Direct Harvest Selection</span>
              </div>
              <h1 className="font-serif text-3xl sm:text-5xl font-normal text-[#f9f6f2] tracking-tight">
                Authentic Jammu Dry Fruits Catalog
              </h1>
              <p className="mt-2 text-sm sm:text-base text-[#d5c4b4] font-sans max-w-2xl">
                Choose your preferred pack size (250g, 500g, 1kg, or custom Admin packs), filter by category or origin, and order direct from Jammu.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/custom-order')}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-xs font-semibold tracking-wider uppercase bg-[#251a13] hover:bg-[#38281d] text-[#dfc471] border border-[#dfc471]/40 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#dfc471]"
              >
                <Gift className="w-3.5 h-3.5" />
                <span>Bespoke Custom Demand</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCartDrawerOpen(true)}
                className="inline-flex items-center gap-2.5 px-6 py-3 rounded-full text-xs font-semibold tracking-wider uppercase bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] hover:brightness-110 shadow-xl shadow-[#dfc471]/20 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Checkout Bag {totalCartCount > 0 ? `(${totalCartCount})` : ''}</span>
              </button>
            </div>
          </div>
        </ScrollReveal>

        {/* Quick Category Jump Strip */}
        <div
          className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none"
          role="region"
          aria-label="Quick category navigation"
        >
          <button
            type="button"
            onClick={() => setSelectedCategoryId('all')}
            aria-pressed={selectedCategoryId === 'all'}
            className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-[#dfc471] ${
              selectedCategoryId === 'all'
                ? 'bg-[#dfc471] text-[#0d0805] font-semibold shadow-md'
                : 'bg-[#150d09] text-[#e5d8cc] hover:text-white border border-[#38281d]'
            }`}
          >
            All Harvests ({products.length})
          </button>
          {sidebarCategories.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategoryId(cat.id)}
              aria-pressed={selectedCategoryId === cat.id}
              className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-[#dfc471] ${
                selectedCategoryId === cat.id
                  ? 'bg-[#dfc471] text-[#0d0805] font-semibold shadow-md'
                  : 'bg-[#150d09] text-[#e5d8cc] hover:text-white border border-[#38281d]'
              }`}
            >
              {cat.label} ({cat.count})
            </button>
          ))}
        </div>

        {/* Main 2-Column Layout: Sticky Left Filter Sidebar + Catalog Grid */}
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Desktop Sticky Sidebar */}
          <aside
            aria-label="Product Filters"
            className="hidden lg:block w-72 shrink-0 sticky top-24 bg-[#150d09] border border-[#38281d] rounded-2xl p-5 shadow-xl max-h-[calc(100vh-7rem)] overflow-y-auto"
          >
            {renderFilterPanel('desktop')}
          </aside>

          {/* Right Product Area */}
          <section
            id="catalog-products"
            aria-label="Harvest Catalog"
            className="flex-1 min-w-0 w-full"
          >
            {/* Top Search, Sort, View Toggle & Mobile Filter Trigger */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5 bg-[#150d09] border border-[#38281d] rounded-2xl p-3.5">
              <div className="flex items-center gap-2.5 flex-1">
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(true)}
                  className="lg:hidden inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#251a13] border border-[#dfc471]/40 text-xs font-semibold text-[#dfc471] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#dfc471]"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
                </button>

                <div className="relative flex-1">
                  <label htmlFor="catalog-search" className="sr-only">
                    Search dry fruits catalog
                  </label>
                  <Search className="w-4 h-4 text-[#d5c4b4]/70 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="catalog-search"
                    type="search"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search walnuts, kernels, SKU, origin..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2] placeholder-[#d5c4b4]/60 focus:outline-none focus:border-[#dfc471]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2.5 justify-between sm:justify-end">
                <div className="relative flex-1 sm:flex-initial sm:w-48">
                  <label htmlFor="catalog-sort" className="sr-only">
                    Sort products
                  </label>
                  <select
                    id="catalog-sort"
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2] focus:outline-none focus:border-[#dfc471] cursor-pointer"
                  >
                    <option value="featured">Sort: Featured</option>
                    <option value="price-asc">Price: Low to High</option>
                    <option value="price-desc">Price: High to Low</option>
                    <option value="name">Name: A to Z</option>
                  </select>
                </div>

                <div
                  className="inline-flex items-center bg-[#1c120c] border border-[#38281d] rounded-xl p-1"
                  role="group"
                  aria-label="Layout view mode"
                >
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    aria-pressed={viewMode === 'grid'}
                    aria-label="Grid view"
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      viewMode === 'grid'
                        ? 'bg-[#dfc471] text-[#0d0805]'
                        : 'text-[#d5c4b4] hover:text-white'
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    aria-pressed={viewMode === 'list'}
                    aria-label="List view"
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      viewMode === 'list'
                        ? 'bg-[#dfc471] text-[#0d0805]'
                        : 'text-[#d5c4b4] hover:text-white'
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Live Status & Active Filter Chips */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
              <p
                aria-live="polite"
                className="text-xs text-[#d5c4b4] font-medium"
              >
                Showing <span className="text-[#dfc471] font-semibold">{filteredProducts.length}</span> of{' '}
                {products.length} harvests
                {selectedPackFilter !== 'all' && (
                  <span> • Previewing <strong className="text-[#f9f6f2]">{selectedPackFilter}</strong> packs</span>
                )}
              </p>

              {activeFilterCount > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {selectedCategoryId !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryId('all')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] bg-[#251a13] text-[#dfc471] border border-[#dfc471]/40 cursor-pointer"
                    >
                      <span>
                        {sidebarCategories.find(c => c.id === selectedCategoryId)?.label ||
                          selectedCategoryId}
                      </span>
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  {selectedPackFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setSelectedPackFilter('all')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] bg-[#251a13] text-[#dfc471] border border-[#dfc471]/40 cursor-pointer"
                    >
                      <span>Pack: {selectedPackFilter}</span>
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  {(effectiveMinPrice !== null || effectiveMaxPrice !== null) && (
                    <button
                      type="button"
                      onClick={() => {
                        setPricePreset('all');
                        setMinPriceInput('');
                        setMaxPriceInput('');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] bg-[#251a13] text-[#dfc471] border border-[#dfc471]/40 cursor-pointer"
                    >
                      <span>
                        Price: {effectiveMinPrice ?? 0}–{effectiveMaxPrice ?? '∞'}
                      </span>
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  {selectedGrades.map(gid => (
                    <button
                      key={gid}
                      type="button"
                      onClick={() => toggleGrade(gid)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] bg-[#251a13] text-[#dfc471] border border-[#dfc471]/40 cursor-pointer"
                    >
                      <span>{GRADE_FILTERS.find(g => g.id === gid)?.label || gid}</span>
                      <X className="w-3 h-3" />
                    </button>
                  ))}
                  {selectedOrigin !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setSelectedOrigin('all')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] bg-[#251a13] text-[#dfc471] border border-[#dfc471]/40 cursor-pointer"
                    >
                      <span>Origin: {selectedOrigin}</span>
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Empty Filter State */}
            {filteredProducts.length === 0 ? (
              <div className="p-12 text-center bg-[#150d09] border border-[#38281d] rounded-3xl space-y-4">
                <Package className="w-10 h-10 text-[#dfc471] mx-auto opacity-80" />
                <h2 className="font-serif text-2xl text-[#f9f6f2]">
                  No Harvests Match Your Filters
                </h2>
                <p className="text-xs sm:text-sm text-[#d5c4b4] max-w-md mx-auto">
                  Try widening your price range, clearing selected pack weights, or resetting all filters.
                </p>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#dfc471] text-[#0d0805] cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Show All Harvests</span>
                </button>
              </div>
            ) : (
              <div
                className={
                  viewMode === 'grid'
                    ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'
                    : 'space-y-5'
                }
              >
                {filteredProducts.map((product, idx) => {
                  const packs = packOptionsByProduct[product.id] || getProductPackOptions(product);
                  const selectedPack = getSelectedPackForProduct(product);
                  const packPrice = getEffectivePackPrice(selectedPack);
                  const hasPackDiscount =
                    Boolean(selectedPack.discountPrice) &&
                    Number(selectedPack.discountPrice) > 0 &&
                    Number(selectedPack.discountPrice) < selectedPack.sellingPrice;

                  const draftKey = getPackDraftKey(product.id, selectedPack.id);
                  const draftQty = getDraftQty(product.id, selectedPack.id);
                  const inCartQty = cartItems[draftKey] || 0;
                  const isJustAdded = addedAnimationKey === draftKey;
                  const isWishlisted = wishlistIds.has(product.id);

                  const gallery =
                    product.gallery && product.gallery.length > 0
                      ? product.gallery
                      : [product.image];
                  const currentImgIdx = productImageIndex[product.id] || 0;
                  const currentImg = gallery[currentImgIdx] || product.image;

                  const openDetails = () => {
                    setDetailProduct(product);
                    setDetailActiveImgIndex(productImageIndex[product.id] || 0);
                    setDetailMediaTab('photos');
                  };

                  return (
                    <ScrollReveal key={product.id} delay={(idx % 3) * 0.05}>
                      <article
                        aria-label={product.name}
                        className={`h-full flex ${
                          viewMode === 'list'
                            ? 'flex-col sm:flex-row'
                            : 'flex-col justify-between'
                        } bg-[#150d09] border border-[#38281d] hover:border-[#dfc471]/60 rounded-2xl overflow-hidden transition-all duration-300 shadow-xl`}
                      >
                        {/* Image Container */}
                        <div
                          className={`relative overflow-hidden bg-[#1c120c] shrink-0 group/img ${
                            viewMode === 'list'
                              ? 'sm:w-60 aspect-square sm:aspect-auto sm:min-h-[260px]'
                              : 'aspect-square w-full'
                          }`}
                        >
                          <img
                            src={currentImg}
                            alt={product.name}
                            referrerPolicy="no-referrer"
                            onError={e => {
                              const img = e.currentTarget;
                              if (img.dataset.fallbackApplied) return;
                              img.dataset.fallbackApplied = '1';
                              img.src = product.fallbackImage || DEFAULT_FALLBACK_IMG;
                            }}
                            onClick={openDetails}
                            className="w-full h-full object-cover transform transition-transform duration-700 group-hover/img:scale-105 cursor-pointer"
                          />

                          <div className="absolute top-3 left-3 z-20 pointer-events-none flex flex-wrap gap-1.5 max-w-[75%]">
                            <span className="text-[10px] tracking-wider uppercase font-medium bg-[#0d0805]/90 backdrop-blur-md text-[#dfc471] px-2.5 py-1 rounded-full border border-[#38281d]">
                              {product.origin}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={e => handleToggleWishlist(product.id, e)}
                            aria-label={
                              isWishlisted
                                ? `Remove ${product.name} from wishlist`
                                : `Save ${product.name} to wishlist`
                            }
                            aria-pressed={isWishlisted}
                            className={`absolute top-3 right-3 z-20 w-8 h-8 rounded-full backdrop-blur-md border flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#dfc471] ${
                              isWishlisted
                                ? 'bg-red-950/90 border-red-400/60 text-red-400'
                                : 'bg-[#0d0805]/85 border-[#38281d] text-[#e5d8cc] hover:text-[#dfc471]'
                            }`}
                          >
                            <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-current' : ''}`} />
                          </button>

                          <button
                            type="button"
                            onClick={openDetails}
                            aria-label={`View full details for ${product.name}`}
                            className="absolute bottom-3 right-3 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0d0805]/90 hover:bg-[#dfc471] text-[#f9f6f2] hover:text-[#0d0805] border border-[#38281d] text-[11px] font-medium backdrop-blur-md transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#dfc471]"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Details</span>
                          </button>

                          {gallery.length > 1 && (
                            <>
                              <button
                                type="button"
                                aria-label={`Previous image of ${product.name}`}
                                onClick={e => {
                                  e.stopPropagation();
                                  setProductImageIndex(prev => ({
                                    ...prev,
                                    [product.id]:
                                      currentImgIdx === 0 ? gallery.length - 1 : currentImgIdx - 1,
                                  }));
                                }}
                                className="absolute left-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-[#0d0805]/85 hover:bg-[#dfc471] text-[#ede4dc] hover:text-[#0d0805] border border-[#38281d] flex items-center justify-center cursor-pointer"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Next image of ${product.name}`}
                                onClick={e => {
                                  e.stopPropagation();
                                  setProductImageIndex(prev => ({
                                    ...prev,
                                    [product.id]:
                                      currentImgIdx === gallery.length - 1 ? 0 : currentImgIdx + 1,
                                  }));
                                }}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-[#0d0805]/85 hover:bg-[#dfc471] text-[#ede4dc] hover:text-[#0d0805] border border-[#38281d] flex items-center justify-center cursor-pointer"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>

                        {/* Product Content */}
                        <div className="flex-1 flex flex-col justify-between p-5">
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] font-sans text-[#d4af37] uppercase tracking-wider font-semibold">
                                  {product.grade}
                                </span>
                                {product.videoUrl && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDetailProduct(product);
                                      setDetailActiveImgIndex(0);
                                      setDetailMediaTab('video');
                                    }}
                                    className="inline-flex items-center gap-1 text-[10px] text-[#dfc471] bg-[#251a13] px-2 py-0.5 rounded-full border border-[#dfc471]/30 cursor-pointer"
                                  >
                                    <Film className="w-2.5 h-2.5" />
                                    <span>1080p Reel</span>
                                  </button>
                                )}
                              </div>
                              {product.hindiName && (
                                <span className="text-xs font-serif text-[#dfc471]/90 shrink-0">
                                  {product.hindiName}
                                </span>
                              )}
                            </div>

                            <h3 className="font-serif text-xl sm:text-2xl font-semibold text-[#f9f6f2] mt-1 leading-snug">
                              <button
                                type="button"
                                onClick={openDetails}
                                className="text-left hover:text-[#dfc471] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#dfc471] rounded"
                              >
                                {product.name}
                              </button>
                            </h3>
                            <p className="mt-1.5 text-xs sm:text-sm text-[#d5c4b4]/90 line-clamp-2">
                              {product.description}
                            </p>

                            {/* Price & Stock */}
                            <div className="mt-4 flex items-baseline justify-between pt-3 border-t border-[#251a13]">
                              <div>
                                <div className="text-[10px] uppercase tracking-wider text-[#d5c4b4]/75">
                                  {selectedPack.weightLabel} Pack Price
                                </div>
                                <div className="flex items-baseline gap-2">
                                  <span className="font-sans font-bold text-xl text-[#f9f6f2] tabular-nums">
                                    {formatINR(packPrice)}
                                  </span>
                                  {hasPackDiscount && (
                                    <span className="text-xs line-through text-[#d5c4b4]/60 tabular-nums">
                                      {formatINR(selectedPack.sellingPrice)}
                                    </span>
                                  )}
                                  <span className="text-xs font-normal text-[#d5c4b4]/80">
                                    / {selectedPack.weightLabel}
                                  </span>
                                </div>
                              </div>
                              <span
                                className={`text-[11px] font-medium ${
                                  product.inStock ? 'text-emerald-400' : 'text-amber-400'
                                }`}
                              >
                                {product.inStock ? '✓ In Stock' : 'Limited Stock'}
                              </span>
                            </div>

                            {/* Pack Size Selector Pills (250g, 500g, 1kg, or Admin-created packs) */}
                            <div className="mt-3.5">
                              <span className="block text-[11px] uppercase tracking-wider text-[#d5c4b4]/80 mb-1.5">
                                Select Pack Size
                              </span>
                              <div
                                className="flex flex-wrap gap-1.5"
                                role="group"
                                aria-label={`Pack options for ${product.name}`}
                              >
                                {packs.map(pack => {
                                  const isSelected = pack.id === selectedPack.id;
                                  const pPrice = getEffectivePackPrice(pack);
                                  return (
                                    <button
                                      key={pack.id}
                                      type="button"
                                      onClick={() =>
                                        setSelectedPackIdByProduct(prev => ({
                                          ...prev,
                                          [product.id]: pack.id,
                                        }))
                                      }
                                      aria-pressed={isSelected}
                                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-[#dfc471] ${
                                        isSelected
                                          ? 'bg-[#dfc471] text-[#0d0805] border-[#dfc471] font-semibold shadow-sm'
                                          : 'bg-[#1c120c] text-[#e5d8cc] border-[#38281d] hover:border-[#dfc471]/60'
                                      }`}
                                    >
                                      <span>{pack.weightLabel}</span>
                                      <span className="ml-1 opacity-80 tabular-nums">
                                        ({formatINR(pPrice)})
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {/* Pack Quantity Stepper & Add CTA */}
                          <div className="pt-4 mt-4 border-t border-[#251a13]">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-xs text-[#d5c4b4]">Packs:</span>
                              <div className="inline-flex items-center bg-[#251a13] border border-[#38281d] rounded-lg p-0.5">
                                <button
                                  type="button"
                                  aria-label={`Decrease packs of ${product.name} (${selectedPack.weightLabel})`}
                                  onClick={() =>
                                    handleDraftPackCountChange(product.id, selectedPack.id, -1)
                                  }
                                  className="w-7 h-7 flex items-center justify-center text-[#d5c4b4] hover:text-white cursor-pointer"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="w-16 text-center text-xs font-semibold text-[#f9f6f2] tabular-nums">
                                  {draftQty} × {selectedPack.weightLabel}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Increase packs of ${product.name} (${selectedPack.weightLabel})`}
                                  onClick={() =>
                                    handleDraftPackCountChange(product.id, selectedPack.id, 1)
                                  }
                                  className="w-7 h-7 flex items-center justify-center text-[#dfc471] hover:text-white cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                              <span className="text-xs font-bold text-[#dfc471] tabular-nums ml-auto">
                                = {formatINR(Math.round(packPrice * draftQty))}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                handleAddPackToCart(product, selectedPack);
                                setIsCartDrawerOpen(true);
                              }}
                              className={`w-full py-3 rounded-full text-xs font-semibold tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-white ${
                                isJustAdded
                                  ? 'bg-emerald-600 text-white'
                                  : inCartQty > 0
                                  ? 'bg-[#251a13] text-[#dfc471] border border-[#dfc471]/60 hover:bg-[#dfc471] hover:text-[#0d0805]'
                                  : 'bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] hover:brightness-110 shadow-lg'
                              }`}
                            >
                              {isJustAdded ? (
                                <Check className="w-4 h-4" />
                              ) : (
                                <ShoppingBag className="w-4 h-4" />
                              )}
                              <span>
                                {inCartQty > 0
                                  ? `Update ${selectedPack.weightLabel} & Checkout`
                                  : `Add ${selectedPack.weightLabel} Pack & Checkout`}
                              </span>
                            </button>
                          </div>
                        </div>
                      </article>
                    </ScrollReveal>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Mobile Slide-Over Filter Drawer */}
      {mobileFiltersOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#0d0805]/80 backdrop-blur-sm flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-filter-title"
          onClick={() => setMobileFiltersOpen(false)}
        >
          <div
            className="w-full max-w-xs bg-[#150d09] border-r border-[#38281d] h-full overflow-y-auto p-5 space-y-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#38281d]">
              <h2 id="mobile-filter-title" className="font-serif text-xl text-[#f9f6f2]">
                Filters
              </h2>
              <button
                type="button"
                aria-label="Close filters"
                onClick={() => setMobileFiltersOpen(false)}
                className="p-2 rounded-lg text-[#d5c4b4] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderFilterPanel('mobile')}
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(false)}
              className="w-full py-3 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#dfc471] text-[#0d0805] cursor-pointer"
            >
              Show {filteredProducts.length} Harvests
            </button>
          </div>
        </div>
      )}

      {/* Checkout Drawer */}
      {isCartDrawerOpen && (
        <div
          className="fixed inset-0 z-50 overflow-hidden bg-[#0d0805]/80 backdrop-blur-sm flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-drawer-title"
          onClick={() => setIsCartDrawerOpen(false)}
        >
          <div
            className="relative w-full max-w-xl bg-[#150d09] border-l border-[#38281d] h-full overflow-y-auto shadow-2xl p-6 sm:p-8 space-y-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-[#38281d]">
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-5 h-5 text-[#dfc471]" />
                <h2 id="checkout-drawer-title" className="font-serif text-2xl text-[#f9f6f2]">
                  Verified Checkout
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close checkout drawer"
                onClick={() => setIsCartDrawerOpen(false)}
                className="p-2 rounded-lg text-[#d5c4b4] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selected Items */}
            <div>
              <span className="text-xs uppercase tracking-wider text-[#dfc471] font-semibold block mb-2">
                Selected Products ({activeOrderItems.length})
              </span>
              {activeOrderItems.length === 0 ? (
                <div className="p-5 text-center text-xs text-[#d5c4b4]/75 border border-dashed border-[#38281d] rounded-2xl">
                  Your bag is empty. Select a pack size from the catalog to proceed.
                </div>
              ) : (
                <div className="divide-y divide-[#251a13] max-h-56 overflow-y-auto pr-1">
                  {activeOrderItems.map(item => (
                    <div
                      key={item.cartKey}
                      className="py-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={item.product.image}
                          alt={item.product.name}
                          referrerPolicy="no-referrer"
                          onError={e => {
                            const img = e.currentTarget;
                            if (img.dataset.fallbackApplied) return;
                            img.dataset.fallbackApplied = '1';
                            img.src = item.product.fallbackImage || DEFAULT_FALLBACK_IMG;
                          }}
                          className="w-11 h-11 rounded-lg object-cover shrink-0 bg-[#1c120c]"
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-[#ede4dc] truncate">
                            {item.product.name}
                          </div>
                          <div className="text-[#d5c4b4]/80 flex items-center gap-1.5 flex-wrap">
                            {item.weightLabel && (
                              <span className="px-1.5 py-0.5 rounded bg-[#251a13] text-[#dfc471] border border-[#dfc471]/30 text-[10px] font-semibold">
                                {item.weightLabel} Pack
                              </span>
                            )}
                            <span>
                              {item.quantity} × {formatINR(item.unitPrice)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="inline-flex items-center bg-[#1c120c] border border-[#38281d] rounded-lg">
                          <button
                            type="button"
                            aria-label={`Decrease quantity for ${item.product.name}`}
                            onClick={() =>
                              onUpdateQuantity(
                                item.cartKey,
                                item.quantity <= 1 ? 0 : item.quantity - 1
                              )
                            }
                            className="w-6 h-6 flex items-center justify-center text-[#d5c4b4] hover:text-white cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-[11px] font-semibold text-[#f9f6f2] tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label={`Increase quantity for ${item.product.name}`}
                            onClick={() => onUpdateQuantity(item.cartKey, item.quantity + 1)}
                            className="w-6 h-6 flex items-center justify-center text-[#dfc471] hover:text-white cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="font-bold text-[#dfc471] tabular-nums min-w-[3.5rem] text-right">
                          {formatINR(item.subtotal)}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${item.product.name} from bag`}
                          onClick={() => onUpdateQuantity(item.cartKey, 0)}
                          className="text-[#d5c4b4]/60 hover:text-red-400 cursor-pointer p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Coupon Input */}
            <div className="space-y-2 pt-2 border-t border-[#251a13]">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <label htmlFor="checkout-coupon" className="sr-only">
                    Coupon code
                  </label>
                  <Tag className="w-3.5 h-3.5 text-[#dfc471] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="checkout-coupon"
                    type="text"
                    value={couponCode}
                    onChange={e => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="Coupon code (e.g. JAMMU10)"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2]"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#251a13] hover:bg-[#dfc471] text-[#dfc471] hover:text-[#0d0805] border border-[#dfc471]/40 cursor-pointer"
                >
                  Apply
                </button>
              </div>
              {couponError && <p className="text-[11px] text-red-400">{couponError}</p>}
              {appliedCoupon && (
                <p className="text-[11px] text-emerald-300">
                  Applied {appliedCoupon.code} ({appliedCoupon.title}): -
                  {formatINR(appliedCoupon.discountAmount)}
                </p>
              )}
            </div>

            {/* Order Totals Breakdown */}
            <div className="p-4 rounded-2xl bg-[#1c120c] border border-[#38281d] space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-[#d5c4b4]/80">Product Subtotal</span>
                <span className="font-medium text-[#f9f6f2]">{formatINR(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between items-center text-emerald-300">
                  <span>Discount ({appliedCoupon?.code})</span>
                  <span>-{formatINR(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-[#d5c4b4]/80">
                  {effectiveShippingCity
                    ? (isSurat ? 'Shipping Charges (Surat — Free Delivery)' : `Shipping Charges (${effectiveShippingCity} Courier)`)
                    : (user?.shippingAddress?.city
                        ? (isSuratCity(user.shippingAddress.city) ? 'Shipping Charges (Surat — Free Delivery)' : 'Shipping Charges (Standard Courier)')
                        : 'Shipping Charges')}
                </span>
                <span className={shippingCharge === 0 ? 'text-emerald-400 font-semibold' : 'text-[#f9f6f2] font-medium'}>
                  {shippingCharge === 0 ? '₹0 (Free Shipping)' : formatINR(shippingCharge)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#d5c4b4]/80">GST ({gstRatePct}%)</span>
                <span>{formatINR(taxAmount)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-[#251a13] font-bold text-base text-[#dfc471]">
                <span>Total Order Amount</span>
                <span>{formatINR(finalTotal)}</span>
              </div>
            </div>

            {/* Auth / Email Verification Gate */}
            {!user ? (
              <div className="p-5 rounded-2xl bg-amber-950/50 border border-amber-500/40 space-y-3 text-xs">
                <div className="flex items-center gap-2 font-semibold text-amber-200">
                  <Lock className="w-4 h-4" />
                  <span>Sign In Required to Complete Checkout</span>
                </div>
                <p className="text-[#ede4dc]/85">
                  Please sign in or register with a verified email so you receive order confirmation, AWB shipment tracking, and delivery updates.
                </p>
                <div className="flex gap-2">
                  <Link
                    to="/login?redirect=/catalog"
                    className="flex-1 py-2.5 rounded-full text-center font-semibold bg-[#dfc471] text-[#0d0805]"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/register"
                    className="flex-1 py-2.5 rounded-full text-center font-semibold bg-[#251a13] text-[#ede4dc] border border-[#38281d]"
                  >
                    Register
                  </Link>
                </div>
              </div>
            ) : !user.emailVerified ? (
              <div className="p-5 rounded-2xl bg-amber-950/60 border border-amber-500/50 space-y-3 text-xs">
                <div className="flex items-center gap-2 font-semibold text-amber-200">
                  <AlertCircle className="w-4 h-4" />
                  <span>Email Verification Required Before Checkout</span>
                </div>
                <p className="text-[#ede4dc]/85">
                  Your account ({user.email}) is unverified. You can browse freely, and checkout unlocks immediately once your email is verified.
                </p>
                {resendVerificationMsg && (
                  <div className="p-2.5 rounded-xl bg-emerald-950/70 text-emerald-200">
                    {resendVerificationMsg}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleResendVerify}
                    className="px-4 py-2 rounded-full font-semibold bg-[#dfc471] text-[#0d0805] cursor-pointer"
                  >
                    Resend Verification Email
                  </button>
                  <Link
                    to={`/verify-email?email=${encodeURIComponent(user.email)}`}
                    className="px-4 py-2 rounded-full bg-[#251a13] text-[#ede4dc] border border-[#38281d]"
                  >
                    Open Verification Page
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handlePlaceOrder} className="space-y-3.5 pt-2 border-t border-[#38281d]">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider text-[#dfc471] font-semibold block">
                    Delivery &amp; Payment Details
                  </span>
                  {user.shippingAddress?.city && (
                    <span className="text-[10px] text-emerald-400/80 font-medium">
                      Delivering to: {user.shippingAddress.city}
                    </span>
                  )}
                </div>

                {!user.shippingAddress && (!customer.city || !customer.pincode) && (
                  <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-amber-500/40 text-xs space-y-2">
                    <div className="flex items-center gap-2 text-amber-300 font-semibold">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span>Mandatory Shipping Address</span>
                    </div>
                    <p className="text-[#d5c4b4]/85 leading-relaxed">
                      Completing your shipping address is mandatory before placing an order. Please update your delivery details to proceed.
                    </p>
                    <Link
                      to="/account?tab=addresses"
                      className="inline-block text-[11px] font-semibold text-[#dfc471] hover:underline"
                    >
                      Complete Shipping Address in Profile &rarr;
                    </Link>
                  </div>
                )}

                {checkoutError && (
                  <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs">
                    {checkoutError}
                  </div>
                )}

                {savedAddresses.length > 0 && (
                  <select
                    aria-label="Choose saved delivery address"
                    onChange={e => {
                      const found = savedAddresses.find(a => a.id === e.target.value);
                      if (found) {
                        setCustomer(prev => ({
                          ...prev,
                          fullName: found.fullName,
                          mobileNumber: found.phone,
                          deliveryAddress: found.addressLine,
                          city: found.city,
                          state: found.state,
                          pincode: found.pincode,
                        }));
                      }
                    }}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#dfc471]"
                  >
                    <option value="">Choose a saved delivery address...</option>
                    {savedAddresses.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.label} — {a.addressLine}, {a.city}
                      </option>
                    ))}
                  </select>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    aria-label="Full Name"
                    value={customer.fullName}
                    onChange={e => setCustomer({ ...customer, fullName: e.target.value })}
                    placeholder="Full Name *"
                    className="px-3.5 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2]"
                  />
                  <input
                    type="tel"
                    required
                    aria-label="Mobile Number"
                    value={customer.mobileNumber}
                    onChange={e => setCustomer({ ...customer, mobileNumber: e.target.value })}
                    placeholder="Mobile Number *"
                    className="px-3.5 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2]"
                  />
                </div>

                <textarea
                  rows={2}
                  required
                  aria-label="Delivery Address"
                  value={customer.deliveryAddress}
                  onChange={e => setCustomer({ ...customer, deliveryAddress: e.target.value })}
                  placeholder="Delivery Address *"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2]"
                />

                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    required
                    aria-label="City"
                    value={customer.city}
                    onChange={e => setCustomer({ ...customer, city: e.target.value })}
                    placeholder="City *"
                    className="px-3 py-2 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2]"
                  />
                  <input
                    type="text"
                    required
                    aria-label="State"
                    value={customer.state}
                    onChange={e => setCustomer({ ...customer, state: e.target.value })}
                    placeholder="State *"
                    className="px-3 py-2 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2]"
                  />
                  <input
                    type="text"
                    required
                    aria-label="PIN Code"
                    value={customer.pincode}
                    onChange={e => setCustomer({ ...customer, pincode: e.target.value })}
                    placeholder="PIN *"
                    className="px-3 py-2 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2]"
                  />
                </div>

                <select
                  aria-label="Payment method"
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2]"
                >
                  <option value="Concierge Invoice / COD">Cash on Delivery / Concierge Invoice</option>
                  <option value="UPI / Bank Transfer on Confirmation">
                    UPI / Bank Transfer upon Order Confirmation
                  </option>
                </select>

                <input
                  type="text"
                  aria-label="Optional packing notes"
                  value={customer.instructions}
                  onChange={e => setCustomer({ ...customer, instructions: e.target.value })}
                  placeholder="Optional packing notes (e.g. Vacuum tin seal)"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2]"
                />

                <button
                  type="submit"
                  disabled={activeOrderItems.length === 0 || submittingOrder}
                  className="w-full py-3.5 rounded-full text-xs font-semibold tracking-wider uppercase bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {submittingOrder
                      ? 'Placing Order...'
                      : `Place Verified Order (${formatINR(finalTotal)})`}
                  </span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {submittedOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0d0805]/85 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-confirm-title"
        >
          <div className="relative w-full max-w-lg bg-[#150d09] border border-[#dfc471]/40 rounded-3xl p-6 sm:p-8 shadow-2xl text-[#ede4dc] space-y-5">
            <div className="text-center">
              <span className="text-[11px] tracking-[0.25em] text-[#dfc471] uppercase font-semibold">
                Order #{submittedOrder.orderNumber}
              </span>
              <h2 id="order-confirm-title" className="font-serif text-3xl text-[#f9f6f2] mt-1">
                Order Placed Successfully
              </h2>
              <p className="text-xs text-emerald-300 mt-1">
                Confirmation email sent to {submittedOrder.customerObj.email}.
              </p>
            </div>

            <div className="py-4 border-y border-[#38281d] space-y-2 text-xs">
              {submittedOrder.items.map(it => (
                <div key={it.id} className="flex justify-between">
                  <span>
                    {it.productName} (
                    {it.weightLabel
                      ? `${it.quantity} × ${it.weightLabel}`
                      : `${it.quantity} ${it.unit === 'gram' ? 'g' : it.unit === 'ml' ? 'ml' : it.unit === 'piece' ? 'pc' : 'kg'}`}
                    )
                  </span>
                  <span className="font-bold text-[#dfc471]">{formatINR(it.subtotal)}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-[#251a13] flex justify-between font-bold text-sm">
                <span>Final Total:</span>
                <span className="text-[#dfc471] text-base">
                  {formatINR(submittedOrder.totalAmount)}
                </span>
              </div>
            </div>

            <div className="space-y-2.5">
              <Link
                to={`/account/orders/${submittedOrder.orderNumber}`}
                onClick={() => {
                  setSubmittedOrder(null);
                  setIsCartDrawerOpen(false);
                }}
                className="w-full py-3.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#064e3b] text-[#dfc471] border border-[#dfc471]/40 flex items-center justify-center gap-2"
              >
                <Truck className="w-4 h-4" />
                <span>Track My Order</span>
              </Link>

              <a
                href={generateWhatsAppUrl({
                  id: submittedOrder.orderNumber,
                  createdAt: submittedOrder.createdAt,
                  items: submittedOrder.items.map(it => {
                    const matchedProd =
                      products.find(p => p.id === it.productId) || products[0];
                    return {
                      product: {
                        ...matchedProd,
                        name: it.weightLabel
                          ? `${matchedProd.name} (${it.weightLabel} Pack)`
                          : matchedProd.name,
                        price: it.unitPrice,
                      },
                      quantity: it.quantity,
                      subtotal: it.subtotal,
                    };
                  }),
                  totalEstimatedAmount: submittedOrder.totalAmount,
                  customer: {
                    fullName: submittedOrder.deliveryAddressObj.fullName || '',
                    mobileNumber: submittedOrder.deliveryAddressObj.mobileNumber || '',
                    whatsappNumber: submittedOrder.deliveryAddressObj.mobileNumber || '',
                    sameAsMobile: true,
                    email: submittedOrder.customerObj.email || '',
                    deliveryAddress: submittedOrder.deliveryAddressObj.deliveryAddress || '',
                    city: submittedOrder.deliveryAddressObj.city || '',
                    state: submittedOrder.deliveryAddressObj.state || '',
                    pincode: submittedOrder.deliveryAddressObj.pincode || '',
                    instructions: submittedOrder.instructions || '',
                  },
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#25D366] text-white"
              >
                <MessageCircle className="w-4 h-4 fill-current" />
                <span>Share via WhatsApp Concierge</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  setSubmittedOrder(null);
                  setIsCartDrawerOpen(false);
                }}
                className="w-full py-3 rounded-full text-xs font-semibold uppercase bg-[#251a13] text-[#ede4dc] cursor-pointer"
              >
                Continue Browsing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Detail Modal with Pack Size & Quantity Selector */}
      {detailProduct && detailSelectedPack && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-[#0d0805]/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-modal-title"
          onClick={() => setDetailProduct(null)}
        >
          <div
            className="relative w-full max-w-4xl bg-[#150d09] border border-[#dfc471]/40 rounded-3xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col my-auto"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close product details"
              onClick={() => setDetailProduct(null)}
              className="absolute top-4 right-4 z-30 p-2.5 rounded-full bg-[#0d0805]/85 text-[#d5c4b4] hover:text-[#dfc471] border border-[#38281d] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="overflow-y-auto p-5 sm:p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div className="space-y-3">
                  {detailProduct.videoUrl && (
                    <div className="flex items-center gap-1.5 p-1 bg-[#1c120c] rounded-xl border border-[#38281d] w-fit">
                      <button
                        type="button"
                        onClick={() => setDetailMediaTab('photos')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                          detailMediaTab === 'photos'
                            ? 'bg-[#dfc471] text-[#0d0805]'
                            : 'text-[#d5c4b4]/75'
                        }`}
                      >
                        Photos
                      </button>
                      <button
                        type="button"
                        onClick={() => setDetailMediaTab('video')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                          detailMediaTab === 'video'
                            ? 'bg-[#dfc471] text-[#0d0805]'
                            : 'text-[#d5c4b4]/75'
                        }`}
                      >
                        Harvest Reel
                      </button>
                    </div>
                  )}

                  {detailMediaTab === 'photos' || !detailProduct.videoUrl ? (
                    <div className="space-y-2.5">
                      <div className="relative aspect-square rounded-2xl overflow-hidden bg-[#1c120c] border border-[#38281d]">
                        <img
                          src={
                            (detailProduct.gallery &&
                              detailProduct.gallery[detailActiveImgIndex]) ||
                            detailProduct.image
                          }
                          alt={detailProduct.name}
                          referrerPolicy="no-referrer"
                          onError={e => {
                            const img = e.currentTarget;
                            if (img.dataset.fallbackApplied) return;
                            img.dataset.fallbackApplied = '1';
                            img.src = detailProduct.fallbackImage || DEFAULT_FALLBACK_IMG;
                          }}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      {detailProduct.gallery && detailProduct.gallery.length > 1 && (
                        <div className="flex items-center gap-2">
                          {detailProduct.gallery.map((imgUrl, idx) => (
                            <button
                              key={idx}
                              type="button"
                              aria-label={`View image ${idx + 1} of ${detailProduct.name}`}
                              onClick={() => setDetailActiveImgIndex(idx)}
                              className={`w-14 h-14 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                                detailActiveImgIndex === idx
                                  ? 'border-[#dfc471]'
                                  : 'border-[#38281d] opacity-70 hover:opacity-100'
                              }`}
                            >
                              <img
                                src={imgUrl}
                                alt=""
                                referrerPolicy="no-referrer"
                                onError={e => {
                                  const img = e.currentTarget;
                                  if (img.dataset.fallbackApplied) return;
                                  img.dataset.fallbackApplied = '1';
                                  img.src =
                                    detailProduct.fallbackImage || DEFAULT_FALLBACK_IMG;
                                }}
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="relative aspect-square rounded-2xl overflow-hidden bg-black border border-[#dfc471]/40">
                      <video
                        ref={detailVideoRef}
                        src={detailProduct.videoUrl}
                        autoPlay
                        loop
                        muted={isDetailVideoMuted}
                        playsInline
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        aria-label={isDetailVideoMuted ? 'Unmute video' : 'Mute video'}
                        onClick={() => setIsDetailVideoMuted(m => !m)}
                        className="absolute bottom-3 right-3 p-2.5 rounded-full bg-[#0d0805]/85 text-[#ede4dc] cursor-pointer"
                      >
                        {isDetailVideoMuted ? (
                          <VolumeX className="w-4 h-4" />
                        ) : (
                          <Volume2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="text-xs uppercase tracking-wider text-[#dfc471]">
                    {detailProduct.grade} • {detailProduct.origin}
                  </div>
                  <h2 id="detail-modal-title" className="font-serif text-3xl text-[#f9f6f2]">
                    {detailProduct.name}
                  </h2>
                  <p className="text-sm text-[#d5c4b4]/90">{detailProduct.description}</p>

                  {/* Pack Selection inside Modal */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="uppercase tracking-wider text-[#dfc471] font-semibold">
                        Select Pack Weight
                      </span>
                      <span className="text-[11px] text-[#d5c4b4]/75">
                        SKU: {detailSelectedPack.sku}
                      </span>
                    </div>
                    <div
                      className="grid grid-cols-3 gap-2"
                      role="group"
                      aria-label={`Select pack weight for ${detailProduct.name}`}
                    >
                      {detailPacks.map(pack => {
                        const isSelected = pack.id === detailSelectedPack.id;
                        const pPrice = getEffectivePackPrice(pack);
                        return (
                          <button
                            key={pack.id}
                            type="button"
                            onClick={() =>
                              setSelectedPackIdByProduct(prev => ({
                                ...prev,
                                [detailProduct.id]: pack.id,
                              }))
                            }
                            aria-pressed={isSelected}
                            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-[#dfc471] ${
                              isSelected
                                ? 'bg-[#dfc471] text-[#0d0805] border-[#dfc471] shadow-md'
                                : 'bg-[#1c120c] text-[#ede4dc] border-[#38281d] hover:border-[#dfc471]/60'
                            }`}
                          >
                            <div className="text-xs font-bold">{pack.weightLabel}</div>
                            <div
                              className={`text-[11px] tabular-nums ${
                                isSelected ? 'text-[#0d0805]/90' : 'text-[#dfc471]'
                              }`}
                            >
                              {formatINR(pPrice)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Active Pack Price + Qty Stepper */}
                  <div className="p-4 rounded-2xl bg-[#1c120c] border border-[#38281d] flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-[11px] text-[#d5c4b4]/75 block">
                        Selected: {detailSelectedPack.weightLabel} Pack
                      </span>
                      <span className="font-bold text-2xl text-[#dfc471] tabular-nums">
                        {formatINR(
                          getEffectivePackPrice(detailSelectedPack) *
                            getDraftQty(detailProduct.id, detailSelectedPack.id)
                        )}
                      </span>
                    </div>

                    <div className="inline-flex items-center bg-[#251a13] border border-[#38281d] rounded-xl p-1">
                      <button
                        type="button"
                        aria-label="Decrease pack quantity"
                        onClick={() =>
                          handleDraftPackCountChange(
                            detailProduct.id,
                            detailSelectedPack.id,
                            -1
                          )
                        }
                        className="w-8 h-8 flex items-center justify-center text-[#d5c4b4] hover:text-white cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-16 text-center text-xs font-semibold text-[#f9f6f2] tabular-nums">
                        {getDraftQty(detailProduct.id, detailSelectedPack.id)} pack
                        {getDraftQty(detailProduct.id, detailSelectedPack.id) > 1 ? 's' : ''}
                      </span>
                      <button
                        type="button"
                        aria-label="Increase pack quantity"
                        onClick={() =>
                          handleDraftPackCountChange(
                            detailProduct.id,
                            detailSelectedPack.id,
                            1
                          )
                        }
                        className="w-8 h-8 flex items-center justify-center text-[#dfc471] hover:text-white cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      handleAddPackToCart(detailProduct, detailSelectedPack);
                      setDetailProduct(null);
                      setIsCartDrawerOpen(true);
                    }}
                    className="w-full py-3.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] hover:brightness-110 cursor-pointer"
                  >
                    Add {detailSelectedPack.weightLabel} Pack to Bag &amp; Checkout
                  </button>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#1c120c] border border-[#38281d] space-y-2 text-xs">
                <div className="flex items-center gap-2 text-[#dfc471] font-semibold uppercase">
                  <MapPin className="w-4 h-4" />
                  <span>Jammu Provenance Story</span>
                </div>
                <p className="text-[#ede4dc]/90 leading-relaxed">{detailProduct.jammuStory}</p>
              </div>

              {detailProduct.nutrition?.calories && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-[#1c120c] border border-[#38281d]">
                    <span className="text-[#d5c4b4]/70 block">Energy</span>
                    <span className="font-bold text-[#f9f6f2]">
                      {detailProduct.nutrition.calories}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#1c120c] border border-[#38281d]">
                    <span className="text-[#d5c4b4]/70 block">Protein</span>
                    <span className="font-bold text-[#f9f6f2]">
                      {detailProduct.nutrition.protein}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#1c120c] border border-[#38281d] col-span-2">
                    <span className="text-[#d5c4b4]/70 block">Key Bioactive</span>
                    <span className="font-semibold text-[#dfc471]">
                      {detailProduct.nutrition.keyNutrient}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
