import { useState } from 'react';
import { Product } from '../types/product';
import { formatINR } from '../utils/priceCalculator';
import { ArrowUpRight, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  onRequestPurchase: (productId: string) => void;
  index: number;
}

export default function ProductCard({ product, onRequestPurchase, index }: ProductCardProps) {
  const [imageError, setImageError] = useState(false);
  const gallery = (product.gallery && product.gallery.length > 0) ? product.gallery : [product.image];
  const [activeImgIndex, setActiveImgIndex] = useState(0);
  const activeImg = gallery[activeImgIndex] || product.image;

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveImgIndex(prev => (prev === 0 ? gallery.length - 1 : prev - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveImgIndex(prev => (prev === gallery.length - 1 ? 0 : prev + 1));
  };

  return (
    <article
      className="group relative flex flex-col justify-between bg-[#150d09]/70 rounded-2xl border border-[#38281d]/80 hover:border-[#dfc471]/50 transition-all duration-500 overflow-hidden shadow-xl hover:shadow-2xl hover:shadow-[#0d0805]/90 hover:-translate-y-1.5"
    >
      {/* Visual Header / Image Container */}
      <div className="relative aspect-square w-full overflow-hidden bg-[#1c120c]">
        {/* Subtle background glow */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#150d09] via-transparent to-transparent z-10 opacity-70 group-hover:opacity-40 transition-opacity pointer-events-none" />

        {/* Clean, authentic product image */}
        {!imageError ? (
          <img
            src={activeImg.endsWith('.jpg') ? activeImg.replace('.jpg', '.webp') : activeImg}
            alt={product.name}
            width="400"
            height="400"
            referrerPolicy="no-referrer"
            onError={() => {
              if (product.fallbackImage) {
                setImageError(true);
              }
            }}
            className="w-full h-full object-cover object-center transform transition-transform duration-700 ease-out group-hover:scale-108 will-change-transform"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#251a13] to-[#150d09] p-6 text-center">
            <Sparkles className="w-8 h-8 text-[#dfc471] mb-2" />
            <span className="font-serif text-lg text-[#ede4dc]">{product.name}</span>
            <span className="text-xs text-[#d5c4b4]/60 mt-1">{product.grade}</span>
          </div>
        )}

        {/* Subtle Origin tag */}
        <div className="absolute top-4 left-4 z-20 pointer-events-none">
          <span className="text-[11px] font-sans font-medium tracking-wider uppercase text-[#ecdda7] bg-[#0d0805]/80 backdrop-blur-md px-3 py-1 rounded-full border border-[#38281d]">
            {product.origin}
          </span>
        </div>

        {/* Hindi traditional name subtly placed */}
        {product.hindiName && (
          <div className="absolute top-4 right-4 z-20 pointer-events-none">
            <span className="text-xs font-serif text-[#dfc471]/70 bg-[#0d0805]/60 backdrop-blur-md px-2.5 py-1 rounded-md">
              {product.hindiName}
            </span>
          </div>
        )}

        {/* Side Navigation Buttons for Scrolling Through Images */}
        {gallery.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 z-25 w-11 h-11 sm:w-8 sm:h-8 rounded-full bg-[#0d0805]/80 hover:bg-[#dfc471] text-[#ede4dc] hover:text-[#0d0805] backdrop-blur-md border border-[#38281d] hover:border-[#dfc471] flex items-center justify-center transition-all duration-200 shadow-xl active:scale-90 cursor-pointer sm:opacity-85 sm:hover:opacity-100"
              title="Previous photo"
              aria-label="Previous photo"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleNext}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 z-25 w-11 h-11 sm:w-8 sm:h-8 rounded-full bg-[#0d0805]/80 hover:bg-[#dfc471] text-[#ede4dc] hover:text-[#0d0805] backdrop-blur-md border border-[#38281d] hover:border-[#dfc471] flex items-center justify-center transition-all duration-200 shadow-xl active:scale-90 cursor-pointer sm:opacity-85 sm:hover:opacity-100"
              title="Next photo"
              aria-label="Next photo"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Multi-Photo Gallery Dots */}
        {gallery.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-[#0d0805]/80 backdrop-blur-md px-2.5 py-1 rounded-full border border-[#38281d]">
            {gallery.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveImgIndex(i);
                }}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  activeImgIndex === i
                    ? 'w-4 bg-[#dfc471]'
                    : 'w-1.5 bg-[#d5c4b4]/40 hover:bg-[#d5c4b4]'
                }`}
                title={`View photo ${i + 1} of ${gallery.length}`}
                aria-label={`View photo ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Card Content & Editorial Details */}
      <div className="p-6 sm:p-7 flex flex-col flex-grow justify-between">
        <div>
          {/* Subtitle / Grade */}
          <div className="text-[12px] font-sans font-medium tracking-wider uppercase text-[#d4af37] mb-1.5">
            {product.subtitle}
          </div>

          {/* Product Name */}
          <h3 className="font-serif text-2xl font-semibold text-[#f9f6f2] group-hover:text-[#dfc471] transition-colors leading-snug">
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
        <div className="mt-6 pt-5 border-t border-[#38281d]/80 flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#d5c4b4]/60 font-sans">
              Price / {product.unit}
            </div>
            <div className="font-sans font-bold text-xl text-[#f9f6f2] tabular-nums tracking-tight">
              {formatINR(product.price)}{' '}
              <span className="text-xs font-normal text-[#d5c4b4]/70">
                / {product.unit}
              </span>
            </div>
          </div>

          <button
            onClick={() => onRequestPurchase(product.id)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-semibold tracking-wider uppercase bg-[#251a13] hover:bg-[#dfc471] text-[#ede4dc] hover:text-[#0d0805] border border-[#dfc471]/30 hover:border-transparent transition-all duration-300 cursor-pointer shadow-md group-hover:shadow-[#dfc471]/20"
          >
            <span>Request to Purchase</span>
            <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>
        </div>
      </div>
    </article>
  );
}
