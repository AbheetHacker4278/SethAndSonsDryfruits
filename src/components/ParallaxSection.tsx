import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Sparkles, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { PRODUCTS } from '../data/products';

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

  const [cardImageIndex, setCardImageIndex] = useState<Record<number, number>>({ 0: 0, 1: 0, 2: 0 });

  const cycleCardImage = (cardIdx: number, len: number, direction: 'prev' | 'next', e: React.MouseEvent) => {
    e.stopPropagation();
    setCardImageIndex(prev => {
      const curr = prev[cardIdx] || 0;
      const next = direction === 'next'
        ? (curr === len - 1 ? 0 : curr + 1)
        : (curr === 0 ? len - 1 : curr - 1);
      return { ...prev, [cardIdx]: next };
    });
  };

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

  const featured = [
    PRODUCTS.find(p => p.id === 'kaju')!,
    PRODUCTS.find(p => p.id === 'kesar')!,
    PRODUCTS.find(p => p.id === 'pista')!
  ];

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
            Top Selling Product
          </h2>

          <p className="mt-4 text-base sm:text-lg text-[#d5c4b4]/80 font-sans leading-relaxed">
            Experience our most celebrated selections, where extraordinary terroir meets artisanal curing.
          </p>
        </div>

        {/* 3 Floating Parallax Cards with staggered depth */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-10 pt-8 pb-12">
          {featured.map((prod, cardIdx) => {
            const cardRef = cardIdx === 0 ? card1Ref : cardIdx === 1 ? card2Ref : card3Ref;
            const cardGallery = (prod.gallery && prod.gallery.length > 0) ? prod.gallery : [prod.image];
            const currentImgIdx = cardImageIndex[cardIdx] || 0;
            const currentImg = cardGallery[currentImgIdx] || prod.image;
            const isCenter = cardIdx === 1;

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
                    src={currentImg.endsWith('.jpg') ? currentImg.replace('.jpg', '.webp') : currentImg}
                    alt={prod.name}
                    width="400"
                    height="300"
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-108 will-change-transform"
                  />

                  {/* Side Navigation Buttons */}
                  {cardGallery.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => cycleCardImage(cardIdx, cardGallery.length, 'prev', e)}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 z-25 w-11 h-11 sm:w-8 sm:h-8 rounded-full bg-[#0d0805]/80 hover:bg-[#dfc471] text-[#ede4dc] hover:text-[#0d0805] backdrop-blur-md border border-[#38281d] hover:border-[#dfc471] flex items-center justify-center transition-all duration-200 shadow-xl active:scale-90 cursor-pointer sm:opacity-85 sm:hover:opacity-100"
                        title="Previous photo"
                        aria-label="Previous photo"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => cycleCardImage(cardIdx, cardGallery.length, 'next', e)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 z-25 w-11 h-11 sm:w-8 sm:h-8 rounded-full bg-[#0d0805]/80 hover:bg-[#dfc471] text-[#ede4dc] hover:text-[#0d0805] backdrop-blur-md border border-[#38281d] hover:border-[#dfc471] flex items-center justify-center transition-all duration-200 shadow-xl active:scale-90 cursor-pointer sm:opacity-85 sm:hover:opacity-100"
                        title="Next photo"
                        aria-label="Next photo"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>

                      {/* Dots */}
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-[#0d0805]/80 backdrop-blur-md px-2.5 py-1 rounded-full border border-[#38281d]">
                        {cardGallery.map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCardImageIndex(prev => ({ ...prev, [cardIdx]: i }));
                            }}
                            className={`h-1.5 rounded-full transition-all cursor-pointer ${
                              currentImgIdx === i
                                ? 'w-4 bg-[#dfc471]'
                                : 'w-1.5 bg-[#d5c4b4]/40 hover:bg-[#d5c4b4]'
                            }`}
                            title={`View photo ${i + 1} of ${cardGallery.length}`}
                            aria-label={`View photo ${i + 1}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="p-6">
                  <span className="text-[11px] font-sans tracking-wider uppercase text-[#dfc471] block mb-1">
                    {prod.origin}
                  </span>
                  <h3 className="font-serif text-2xl font-medium text-[#f9f6f2]">{prod.name}</h3>
                  <p className="text-xs text-[#d5c4b4]/80 mt-2 line-clamp-2">{prod.description}</p>
                  <div className="mt-5 flex items-center justify-between pt-4 border-t border-[#38281d]">
                    <span className="text-base font-bold text-[#dfc471] tabular-nums">
                      ₹{prod.price} / {prod.unit}
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
