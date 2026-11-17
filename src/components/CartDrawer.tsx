import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  CatalogProduct,
  isSuratCity,
  SURAT_SHIPPING_FEE,
  BASE_SHIPPING_RATE_PER_500G,
  OTHER_CITY_SHIPPING_FEE,
  NON_SURAT_FREE_SHIPPING_THRESHOLD,
  isOilProduct,
  calculateOrderWeightGrams,
  calculateOrderShippingCharge,
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
import confetti from 'canvas-confetti';
import {
  ShoppingBag,
  Plus,
  Minus,
  X,
  Trash2,
  Send,
  MessageCircle,
  AlertCircle,
  MapPin,
  Truck,
  Tag,
  Lock,
} from 'lucide-react';

export interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: Record<string, number>;
  products: CatalogProduct[];
  onUpdateQuantity: (cartKey: string, quantity: number) => void;
  onClearCart: () => void;
}

const DEFAULT_FALLBACK_IMG =
  '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg';

function parseCartKey(cartKey: string): { productId: string; variantId: string | null } {
  const sepIdx = cartKey.indexOf('::');
  if (sepIdx === -1) {
    return { productId: cartKey, variantId: null };
  }
  return {
    productId: cartKey.slice(0, sepIdx),
    variantId: cartKey.slice(sepIdx + 2),
  };
}

function getDefaultPack(product: CatalogProduct, packs: ProductWeightVariant[]): ProductWeightVariant {
  const g1000 = packs.find(p => parseWeightGrams(p.weightLabel) === 1000);
  if (g1000) return g1000;
  const g500 = packs.find(p => parseWeightGrams(p.weightLabel) === 500);
  if (g500) return g500;
  const g250 = packs.find(p => parseWeightGrams(p.weightLabel) === 250);
  if (g250) return g250;
  return packs[0];
}

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

export default function CartDrawer({
  isOpen,
  onClose,
  cartItems,
  products,
  onUpdateQuantity,
  onClearCart,
}: CartDrawerProps) {
  const { user } = useAuth();

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

  const [savedAddresses, setSavedAddresses] = useState<AddressItem[]>([]);
  const [publicSettings, setPublicSettings] = useState<any>(null);

  const [customer, setCustomer] = useState({
    fullName: user?.name || '',
    mobileNumber: user?.phone || '',
    deliveryAddress: '',
    city: '',
    state: '',
    pincode: '',
    instructions: '',
  });

  // Body scroll lock when drawer or confirmation is open
  useEffect(() => {
    if (isOpen || submittedOrder) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, submittedOrder]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen && !submittedOrder) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (submittedOrder) setSubmittedOrder(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submittedOrder, onClose]);

  // Load public settings for GST calculation
  useEffect(() => {
    apiRequest<{ settings?: any }>('/api/settings/public')
      .then(res => {
        if (res.settings) setPublicSettings(res.settings);
      })
      .catch(() => {});
  }, []);

  // Sync user info and saved addresses
  useEffect(() => {
    if (!user) {
      setSavedAddresses([]);
      return;
    }

    if (user.shippingAddress) {
      const sa = user.shippingAddress;
      const addrLine = sa.addressLine || [sa.houseFlat, sa.streetArea].filter(Boolean).join(', ');
      setCustomer(prev => ({
        ...prev,
        fullName: sa.fullName || user.name || prev.fullName,
        mobileNumber: sa.phone || user.phone || prev.mobileNumber,
        deliveryAddress: addrLine || prev.deliveryAddress,
        city: sa.city || prev.city,
        state: sa.state || prev.state,
        pincode: sa.pincode || prev.pincode,
      }));
    }

    apiRequest<{ addresses: AddressItem[] }>('/api/account/addresses')
      .then(res => {
        const list = res.addresses || [];
        setSavedAddresses(list);
        const def = list.find(a => a.isDefault) || list[0];
        if (def) {
          const displayAddr = def.houseFlat && def.streetArea ? `${def.houseFlat}, ${def.streetArea}` : def.addressLine;
          setCustomer(prev => ({
            ...prev,
            fullName: def.fullName || user.name || prev.fullName,
            mobileNumber: def.phone || user.phone || prev.mobileNumber,
            deliveryAddress: displayAddr || def.addressLine,
            city: def.city,
            state: def.state,
            pincode: def.pincode,
          }));
        }
      })
      .catch(() => {});
  }, [user, isOpen]);

  // Pack options cache
  const packOptionsByProduct = useMemo(() => {
    const map: Record<string, ProductWeightVariant[]> = {};
    for (const p of products) {
      map[p.id] = getProductPackOptions(p);
    }
    return map;
  }, [products]);

  // Active items in the cart
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
  const gstRatePct = typeof bizRules?.defaultGstRate === 'number' ? bizRules.defaultGstRate : 0;

  const subtotal = activeOrderItems.reduce((sum, it) => sum + it.subtotal, 0);
  const discountAmount = appliedCoupon ? Math.min(appliedCoupon.discountAmount, subtotal) : 0;
  const netAfterDiscount = Math.max(0, subtotal - discountAmount);

  const effectiveShippingCity = (customer.city || user?.shippingAddress?.city || '').trim();
  const isSurat = isSuratCity(effectiveShippingCity);
  const hasSavedAddress = Boolean(
    (customer.city && customer.pincode) ||
    (user?.shippingAddress?.city && user?.shippingAddress?.pincode) ||
    savedAddresses.length > 0
  );
  const isFreeNonSurat = netAfterDiscount > NON_SURAT_FREE_SHIPPING_THRESHOLD;

  const eligibleItemsForWeight = useMemo(() => {
    return activeOrderItems.map(it => ({
      productId: it.product.id,
      id: it.product.id,
      categoryId: (it.product as any).categoryId || it.product.category,
      category: it.product.category,
      unit: it.product.unit,
      productName: it.product.name,
      name: it.product.name,
      weightLabel: it.weightLabel,
      quantity: it.quantity,
    }));
  }, [activeOrderItems]);

  const billableWeightGrams = useMemo(() => {
    return calculateOrderWeightGrams(eligibleItemsForWeight);
  }, [eligibleItemsForWeight]);

  const shippingCharge = activeOrderItems.length > 0
    ? calculateOrderShippingCharge(eligibleItemsForWeight, netAfterDiscount, {
        shippingCity: effectiveShippingCity,
        weightGrams: billableWeightGrams,
      })
    : 0;

  const taxAmount = Math.round(netAfterDiscount * (gstRatePct / 100));
  const finalTotal = netAfterDiscount + shippingCharge + taxAmount;

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

    setCheckoutError('');
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
            fullName: (customer.fullName || user.shippingAddress?.fullName || user.name || '').trim() || undefined,
            mobileNumber: (customer.mobileNumber || user.shippingAddress?.phone || user.phone || '').trim() || undefined,
            houseFlat: effectiveHouseFlat,
            streetArea: effectiveStreetArea,
            deliveryAddress: effectiveDeliveryAddress,
            city: effectiveCity,
            state: effectiveState,
            pincode: effectivePincode,
            country: user.shippingAddress?.country || 'India',
          },
          instructions: (customer.instructions || '').trim(),
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

  if (!isOpen && !submittedOrder) return null;

  return (
    <>
      {/* Checkout Drawer */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 overflow-hidden bg-[#0d0805]/80 backdrop-blur-sm flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-drawer-title"
          onClick={onClose}
        >
          <div
            className="relative w-full max-w-xl bg-[#150d09] border-l border-[#38281d] h-full overflow-y-auto shadow-2xl p-4 sm:p-8 space-y-5 sm:space-y-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-[#38281d] gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <ShoppingBag className="w-5 h-5 text-[#dfc471]" />
                  <h2 id="checkout-drawer-title" className="font-serif text-2xl text-[#f9f6f2]">
                    Verified Checkout
                  </h2>
                </div>
                {!isSurat && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-500/40">
                    <Truck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Above ₹5,000 No Shipping Charges</span>
                  </span>
                )}
              </div>
              <button
                type="button"
                aria-label="Close checkout drawer"
                onClick={onClose}
                className="p-2 rounded-lg text-[#d5c4b4] hover:text-white cursor-pointer shrink-0"
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
                    ? (isSurat
                        ? 'Shipping Charges (Surat — Free Delivery)'
                        : isFreeNonSurat
                          ? `Shipping Charges (${effectiveShippingCity} — Free over ₹5,000)`
                          : billableWeightGrams === 0
                            ? `Shipping Charges (${effectiveShippingCity} — Oil Items Free Delivery)`
                            : `Shipping Charges (${effectiveShippingCity} Courier — ${(billableWeightGrams / 1000).toFixed(billableWeightGrams % 1000 === 0 ? 0 : 2)}kg)`)
                    : (user?.shippingAddress?.city
                        ? (isSuratCity(user.shippingAddress.city)
                            ? 'Shipping Charges (Surat — Free Delivery)'
                            : isFreeNonSurat
                              ? `Shipping Charges (${user.shippingAddress.city} — Free over ₹5,000)`
                              : billableWeightGrams === 0
                                ? `Shipping Charges (${user.shippingAddress.city} — Oil Items Free Delivery)`
                                : `Shipping Charges (${user.shippingAddress.city} Courier — ${(billableWeightGrams / 1000).toFixed(billableWeightGrams % 1000 === 0 ? 0 : 2)}kg)`)
                        : (isSurat
                            ? 'Shipping Charges (Surat — Free Delivery)'
                            : isFreeNonSurat
                              ? 'Shipping Charges (Free over ₹5,000)'
                              : billableWeightGrams === 0
                                ? 'Shipping Charges (Oil Items Free Delivery)'
                                : `Shipping Charges (Standard Courier — ${(billableWeightGrams / 1000).toFixed(billableWeightGrams % 1000 === 0 ? 0 : 2)}kg)`))}
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
                    to="/login"
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-full text-center font-semibold bg-[#dfc471] text-[#0d0805]"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/register"
                    onClick={onClose}
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
                    onClick={onClose}
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

                {!hasSavedAddress ? (
                  <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-amber-500/40 text-xs space-y-2">
                    <div className="flex items-center gap-2 text-amber-300 font-semibold">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span>Mandatory Shipping Address</span>
                    </div>
                    <p className="text-[#d5c4b4]/85 leading-relaxed">
                      Completing your shipping address is mandatory before placing an order. Under our Single Address Policy, please add your shipping address in your profile to proceed.
                    </p>
                    <Link
                      to="/account?tab=addresses"
                      onClick={onClose}
                      className="inline-block text-[11px] font-semibold text-[#dfc471] hover:underline"
                    >
                      Complete Shipping Address in Profile &rarr;
                    </Link>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-[#1c120c] border border-[#38281d] space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#dfc471] uppercase tracking-wider text-[11px]">
                          Delivery Address
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                          <Lock className="w-3 h-3" />
                          Default (Selected)
                        </span>
                      </div>
                      <Link
                        to="/account?tab=addresses"
                        onClick={onClose}
                        className="text-[10px] font-semibold text-[#dfc471] hover:underline"
                        title="Manage delivery address in Profile"
                      >
                        Manage in Profile &rarr;
                      </Link>
                    </div>

                    <div className="font-medium text-[#f9f6f2]">
                      {customer.fullName || user.shippingAddress?.fullName || user.name}{' '}
                      <span className="text-[#d5c4b4]/70">({customer.mobileNumber || user.shippingAddress?.phone || user.phone})</span>
                    </div>

                    <div className="text-[#d5c4b4]/85 leading-relaxed">
                      {customer.deliveryAddress || user.shippingAddress?.addressLine || [user.shippingAddress?.houseFlat, user.shippingAddress?.streetArea].filter(Boolean).join(', ')}
                      <br />
                      {customer.city || user.shippingAddress?.city}, {customer.state || user.shippingAddress?.state} -{' '}
                      <span className="font-mono text-[#f9f6f2]">{customer.pincode || user.shippingAddress?.pincode}</span>
                    </div>

                    <p className="text-[10px] text-[#d5c4b4]/60 pt-1 border-t border-[#38281d]/50">
                      Under Single Address Policy, address cannot be changed at checkout. To update, delete existing address in Profile first.
                    </p>
                  </div>
                )}

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

                {checkoutError && (
                  <div
                    role="alert"
                    className="p-3 text-xs text-red-300 bg-red-950/60 border border-red-500/40 rounded-xl"
                  >
                    {checkoutError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!hasSavedAddress || activeOrderItems.length === 0 || submittingOrder}
                  className="w-full py-3.5 rounded-full text-xs font-semibold tracking-wider uppercase bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {submittingOrder
                      ? 'Placing Order...'
                      : !hasSavedAddress
                      ? 'Add Shipping Address in Profile to Checkout'
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
                  onClose();
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
                  onClose();
                }}
                className="w-full py-3 rounded-full text-xs font-semibold uppercase bg-[#251a13] text-[#ede4dc] cursor-pointer"
              >
                Continue Browsing
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
