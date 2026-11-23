import { useState, useEffect } from 'react';
import { Product } from '../types/product';
import { formatINR } from '../utils/priceCalculator';
import { ArrowUpRight, Sparkles, Ban } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ProductCardProps {
  product: Product;
  onRequestPurchase: (productId: string) => void;
  index: number;
}

export default function ProductCard({ product, onRequestPurchase, index }: ProductCardProps) {
  const [imageError, setImageError] = useState(false);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);

  const primaryImg = product.image || '';
  const fallback = product.fallbackImage || '/assets/products/akhrot.jpg';
  const [imgSrc, setImgSrc] = useState(primaryImg || fallback);

  useEffect(() => {
    setImgSrc(product.image || fallback);
    setImageError(false);
    setFallbackAttempted(false);
  }, [product.image, fallback]);

  const handleImageError = () => {
    if (!fallbackAttempted && fallback && imgSrc !== fallback) {
      setFallbackAttempted(true);
      setImgSrc(fallback);
    } else {
      setImageError(true);
    }
  };

  const { user, isSurat } = useAuth();
  const isSuratUser = Boolean(user && isSurat);
  const isOutOfStock = Boolean(
    isSuratUser && (product.inStock === false || (typeof product.stock === 'number' && product.stock <= 0))
  );

  return (
    <article
      className="group relative flex flex-col justify-between bg-[#150d09]/70 rounded-2xl border border-[#38281d]/80 hover:border-[#dfc471]/50 transition-all duration-500 overflow-hidden shadow-xl hover:shadow-2xl hover:shadow-[#0d0805]/90 hover:-translate-y-1.5"
    >
      {/* Visual Header / Image Container */}
      <div className="relative aspect-square w-full overflow-hidden bg-[#1c120c]">
        {/* Subtle background glow */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#150d09] via-transparent to-transparent z-10 opacity-70 group-hover:opacity-40 transition-opacity pointer-events-none" />

        {/* Clean product image */}
        {!imageError && imgSrc ? (
          <picture className="w-full h-full block">
            {imgSrc.startsWith('/assets/') && imgSrc.endsWith('.jpg') && (
              <source srcSet={imgSrc.replace(/\.jpg$/, '.webp')} type="image/webp" />
            )}
            <img
              src={imgSrc}
              alt={product.name}
              width="400"
              height="400"
              referrerPolicy="no-referrer"
              onError={handleImageError}
              className="w-full h-full object-cover object-center transform transition-transform duration-700 ease-out group-hover:scale-108 will-change-transform"
              loading="lazy"
              decoding="async"
            />
          </picture>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#251a13] to-[#150d09] p-6 text-center">
            <Sparkles className="w-8 h-8 text-[#dfc471] mb-2" />
            <span className="font-serif text-lg text-[#ede4dc]">{product.name}</span>
            <span className="text-xs text-[#d5c4b4]/60 mt-1">{product.grade}</span>
          </div>
        )}

        {/* Out of Stock Overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-3 bg-black/45 backdrop-blur-[2px]">
            <div className="px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl bg-[#0d0805]/90 border border-[#dfc471]/60 shadow-[0_8px_30px_rgba(0,0,0,0.9),0_0_20px_rgba(223,196,113,0.18)] backdrop-blur-md text-center max-w-[210px] w-full flex flex-col items-center">
              <div className="relative inline-flex items-center justify-center mb-1">
                <svg className="w-8 h-8 text-[#dfc471]" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M24 7 L40 15 L24 23 L8 15 Z" />
                  <path d="M8 15 L8 33 L24 41 L24 23" />
                  <path d="M40 15 L40 33 L24 41" />
                  <path d="M24 15 L24 23" />
                  <circle cx="34" cy="34" r="8.5" className="fill-[#150d09] stroke-[#dfc471]" strokeWidth="2.5" />
                  <line x1="28" y1="28" x2="40" y2="40" className="stroke-[#dfc471]" strokeWidth="2.5" />
                </svg>
              </div>
              <span className="font-serif text-base font-semibold text-[#f9f6f2] tracking-tight">
                Out of Stock
              </span>
              <span className="text-[10px] text-[#d5c4b4]/90 font-serif italic mt-0.5">
                Currently unavailable
              </span>
            </div>
          </div>
        )}

        {/* Subtle Origin tag */}
        <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 pointer-events-none">
          <span className="text-[11px] font-sans font-medium tracking-wider uppercase text-[#ecdda7] bg-[#0d0805]/80 backdrop-blur-md px-3 py-1 rounded-full border border-[#38281d]">
            {product.origin}
          </span>
        </div>

        {/* Hindi traditional name subtly placed */}
        {product.hindiName && (
          <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 pointer-events-none">
            <span className="text-xs font-serif text-[#dfc471]/70 bg-[#0d0805]/60 backdrop-blur-md px-2.5 py-1 rounded-md">
              {product.hindiName}
            </span>
          </div>
        )}
      </div>

      {/* Card Content & Editorial Details */}
      <div className="p-4 sm:p-7 flex flex-col flex-grow justify-between">
        <div>
          {/* Subtitle / Grade */}
          <div className="text-[12px] font-sans font-medium tracking-wider uppercase text-[#d4af37] mb-1.5">
            {product.subtitle}
          </div>

          {/* Product Name */}
          <h3 className="font-serif text-xl sm:text-2xl font-semibold text-[#f9f6f2] group-hover:text-[#dfc471] transition-colors leading-snug">
            {product.name}
          </h3>

          {/* Description */}
          <p className="mt-2.5 text-sm text-[#d5c4b4]/80 leading-relaxed font-sans line-clamp-3">
            {product.description}
          </p>

          {/* Key Attribute Bullets as clean text */}
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#d5c4b4]/60 font-sans">
            {product.features.slice(0, 2).map((feat, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-[#dfc471]" />
                {feat}
              </span>
            ))}
          </div>
        </div>

        {/* Price & Action Module */}
        <div className="mt-5 pt-4 sm:mt-6 sm:pt-5 border-t border-[#38281d]/80 flex items-center justify-between gap-3 sm:gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#d5c4b4]/60 font-sans flex items-center gap-2">
              <span>Price / {product.unit}</span>
              {isOutOfStock && (
                <span className="text-rose-400 font-semibold">• Out of Stock</span>
              )}
            </div>
            <div className="font-sans font-bold text-lg sm:text-xl text-[#f9f6f2] tabular-nums tracking-tight">
              {formatINR(product.price)}{' '}
              <span className="text-xs font-normal text-[#d5c4b4]/70">
                / {product.unit}
              </span>
            </div>
          </div>

          {isOutOfStock ? (
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-full text-xs font-semibold tracking-wider uppercase bg-[#18120d] text-[#888B83] border border-[#38281d] cursor-not-allowed whitespace-nowrap shrink-0 shadow-none"
            >
              <Ban className="w-3.5 h-3.5 text-[#888B83]" />
              <span>Out of Stock</span>
            </button>
          ) : (
            <button
              onClick={() => onRequestPurchase(product.id)}
              className="inline-flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-full text-xs font-semibold tracking-wider uppercase bg-[#251a13] hover:bg-[#dfc471] text-[#ede4dc] hover:text-[#0d0805] border border-[#dfc471]/30 hover:border-transparent transition-all duration-300 cursor-pointer shadow-md group-hover:shadow-[#dfc471]/20 whitespace-nowrap shrink-0"
            >
              <span>Request<span className="hidden sm:inline"> to Purchase</span></span>
              <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
