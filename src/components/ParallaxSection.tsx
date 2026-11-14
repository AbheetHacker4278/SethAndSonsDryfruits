import { useEffect, useRef, useMemo } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Sparkles, ArrowRight } from 'lucide-react';
import { PRODUCTS } from '../data/products';
import { useAuth } from '../context/AuthContext';
import { formatINR } from '../utils/priceCalculator';

// Register GSAP plugins
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

interface ParallaxSectionProps {
  onRequestPurchase: (productId: string) => void;
}

export default function ParallaxSection({ onRequestPurchase }: ParallaxSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const bgTextRef = useRef<HTMLDivElement>(null);
  const card1Ref = useRef<HTMLDivElement>(null);
  const card2Ref = useRef<HTMLDivElement>(null);
  const card3Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Large subtle background typography drift
      if (bgTextRef.current) {
        gsap.to(bgTextRef.current, {
          xPercent: -15,
          ease: 'none',
          scrollTrigger: {
            trigger: containerRef.current,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1.2
          }
        });
      }

      // Parallax card depth offsets
      if (card1Ref.current) {
        gsap.to(card1Ref.current, {
          y: -50,
          scale: 1.03,
          ease: 'none',
          scrollTrigger: {
            trigger: containerRef.current,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1.5
          }
        });
      }

      if (card2Ref.current) {
        gsap.to(card2Ref.current, {
          y: -90,
          scale: 1.05,
          ease: 'none',
          scrollTrigger: {
            trigger: containerRef.current,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 2
          }
        });
      }

      if (card3Ref.current) {
        gsap.to(card3Ref.current, {
          y: -40,
          scale: 1.02,
          ease: 'none',
          scrollTrigger: {
            trigger: containerRef.current,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1.1
          }
        });
      }
    }, containerRef);

    return () => ctx.revert();
  }, []);

  const { products } = useAuth();

  const featured = useMemo(() => {
    const catalog = products && products.length > 0 ? products : PRODUCTS;
    const published = catalog.filter(p => !p.status || p.status === 'published');
    const sorted = [...published].sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));

    // 1st Product: Walnut with highest selling price
    const highestWalnut =
      [...published]
        .filter(p => {
          const n = (p.name || '').toLowerCase();
          const c = (p.category || '').toLowerCase();
          const id = (p.id || '').toLowerCase();
          return (
            (n.includes('walnut') || n.includes('akhrot') || c.includes('walnut') || id.includes('akhrot') || id.includes('walnut')) &&
            !n.includes('cracker') &&
            !n.includes('oil')
          );
        })
        .sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0))[0] ||
      catalog.find(p => p.id === 'akhrot-7star-kernels') ||
      sorted[1] ||
      sorted[0];

    // 3rd Product: Cashew with highest selling price
    const highestCashew =
      [...published]
        .filter(p => {
          const n = (p.name || '').toLowerCase();
          const c = (p.category || '').toLowerCase();
          const id = (p.id || '').toLowerCase();
          return (
            n.includes('cashew') || n.includes('kaju') || c.includes('cashew') || id.includes('kaju') || id.includes('cashew')
          );
        })
        .sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0))[0] ||
      catalog.find(p => p.id === 'kaju-super-jumbo') ||
      sorted[2] ||
      sorted[0];

    // Center Product: Overall highest selling price product from catalog (distinct from walnut and cashew)
    const centerProduct = sorted.find(p => p.id !== highestWalnut?.id && p.id !== highestCashew?.id) || sorted[0];

    // Order: 1st = Walnut, 2nd (Center) = Top Selling Product, 3rd = Cashew
    const list = [highestWalnut, centerProduct, highestCashew].filter(Boolean);
    if (list.length >= 3) return list;
    return sorted.slice(0, 3);
  }, [products]);

  return (
    <section
      ref={containerRef}
      className="relative py-28 sm:py-36 bg-[#0d0805] text-[#ede4dc] overflow-hidden border-t border-[#38281d]/50"
    >
      {/* Floating subtle background watermark typography */}
      <div
        ref={bgTextRef}
        aria-hidden="true"
        className="absolute top-12 left-0 whitespace-nowrap text-[12vw] font-display font-black text-[#ede4dc]/[0.025] select-none pointer-events-none will-change-transform"
      >
        SETH AND SONS DRYFRUITS • TOP SELLING • NATURE’S FINEST
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
          <div className="inline-flex items-center gap-2 text-xs font-sans font-medium tracking-[0.25em] uppercase text-[#dfc471] mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Customer Favorites</span>
          </div>

          <h2
            ref={headlineRef}
            className="font-serif text-3xl sm:text-5xl lg:text-6xl font-normal text-[#f9f6f2] tracking-tight leading-tight"
          >
            Top Selling Products
          </h2>

          <p className="mt-4 text-base sm:text-lg text-[#d5c4b4]/80 font-sans leading-relaxed">
            Experience our most celebrated selections, where extraordinary terroir meets artisanal curing.
          </p>
        </div>

        {/* 3 Floating Parallax Cards with staggered depth */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-10 pt-8 pb-12">
          {featured.map((prod, cardIdx) => {
            const cardRef = cardIdx === 0 ? card1Ref : cardIdx === 1 ? card2Ref : card3Ref;
            const isCenter = cardIdx === 1;
            const imgUrl =
              prod.image.startsWith('/assets/') && prod.image.endsWith('.jpg')
                ? prod.image.replace('.jpg', '.webp')
                : prod.image;

            return (
              <div
                key={prod.id}
                ref={cardRef}
                className={`relative rounded-2xl overflow-hidden shadow-2xl group transition-all duration-500 will-change-transform ${
                  isCenter
                    ? 'bg-[#1c120c] border border-[#dfc471]/50 md:-translate-y-6'
                    : 'bg-[#150d09]/80 border border-[#38281d]'
                }`}
              >
                {isCenter && (
                  <div className="absolute top-3 right-3 z-10 px-3 py-1 rounded-full bg-[#dfc471] text-[#0d0805] text-[10px] font-bold uppercase tracking-wider">
                    Rare Reserve
                  </div>
                )}

                <div className={`aspect-[4/3] w-full overflow-hidden relative ${isCenter ? 'bg-[#251a13]' : 'bg-[#1c120c]'}`}>
                  <img
                    src={imgUrl}
                    alt={prod.name}
                    width="400"
                    height="300"
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-108 will-change-transform"
                  />
                </div>

                <div className="p-6">
                  <span className="text-[11px] font-sans tracking-wider uppercase text-[#dfc471] block mb-1">
                    {prod.origin}
                  </span>
                  <h3 className="font-serif text-2xl font-medium text-[#f9f6f2]">{prod.name}</h3>
                  <p className="text-xs text-[#d5c4b4]/80 mt-2 line-clamp-2">{prod.description}</p>
                  <div className="mt-5 flex items-center justify-between pt-4 border-t border-[#38281d]">
                    <span className="text-base font-bold text-[#dfc471] tabular-nums">
                      {formatINR(prod.price)} / {prod.unit}
                    </span>
                    <button
                      onClick={() => onRequestPurchase(prod.id)}
                      className={`text-xs uppercase tracking-wider font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                        isCenter
                          ? 'text-[#0d0805] bg-[#dfc471] hover:bg-[#ecdda7] px-3.5 py-1.5 rounded-full'
                          : 'text-[#ede4dc] hover:text-[#dfc471]'
                      }`}
                    >
                      <span>Request</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
