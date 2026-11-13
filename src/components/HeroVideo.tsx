import { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ChevronDown, ArrowRight, LifeBuoy } from 'lucide-react';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

interface HeroVideoProps {
  onExplore: () => void;
  onRequestOrder: () => void;
}

export default function HeroVideo({ onExplore, onRequestOrder }: HeroVideoProps) {
  const containerRef = useRef<HTMLElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const heroContentRef = useRef<HTMLDivElement>(null);
  const actTwoRef = useRef<HTMLDivElement>(null);
  const actThreeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let ctx: gsap.Context | null = null;

    ctx = gsap.context(() => {
      // Master GSAP ScrollTrigger Timeline
      // Pins the hero container so narrative texts transition smoothly on scroll
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: container,
          start: 'top top',
          end: '+=180%',
          pin: true,
          scrub: 0.8,
          anticipatePin: 1,
        },
      });

      // 1. Subtle camera depth zoom on the hero background image as user scrolls
      if (imageContainerRef.current) {
        tl.to(
          imageContainerRef.current,
          {
            scale: 1.08,
            ease: 'power1.inOut',
            duration: 1,
          },
          0
        );
      }

      // 2. Act I (Opening Hero Title): Fades out smoothly with gentle upward float
      if (heroContentRef.current) {
        tl.to(
          heroContentRef.current,
          {
            autoAlpha: 0,
            y: -50,
            scale: 0.96,
            ease: 'power2.inOut',
            duration: 0.28,
          },
          0.04
        );
      }

      // 3. Act II (Act I • The Himalayan Foothill Harvest):
      // Silky smooth entrance from 0.28 to 0.46, stays beautifully pinned, then dissolves smoothly out from 0.58 to 0.72
      if (actTwoRef.current) {
        tl.fromTo(
          actTwoRef.current,
          {
            autoAlpha: 0,
            y: 40,
            scale: 0.96,
          },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            ease: 'power2.out',
            duration: 0.2,
          },
          0.28
        );

        tl.to(
          actTwoRef.current,
          {
            autoAlpha: 0,
            y: -40,
            scale: 0.96,
            ease: 'power2.in',
            duration: 0.16,
          },
          0.58
        );
      }

      // 4. Act III (The Journey Begins / Selection Finale):
      // Silky entrance from 0.70 to 0.86, remains fully interactive and visible through 1.0
      if (actThreeRef.current) {
        tl.fromTo(
          actThreeRef.current,
          {
            autoAlpha: 0,
            y: 40,
            scale: 0.96,
          },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            ease: 'power2.out',
            duration: 0.22,
          },
          0.7
        );
      }
    }, container);

    ScrollTrigger.refresh();

    return () => {
      if (ctx) ctx.revert();
    };
  }, []);

  return (
    <section
      ref={containerRef}
      className="relative w-full h-screen min-h-[640px] flex items-center justify-center overflow-hidden bg-[#0d0805]"
    >
      {/* Background Responsive Hero Image with Smooth Depth Zoom */}
      <div
        ref={imageContainerRef}
        className="absolute inset-0 w-full h-full overflow-hidden select-none will-change-transform"
      >
        <picture>
          <source
            type="image/webp"
            srcSet="
              /assets/hero_luxury_dryfruits-480.webp 480w,
              /assets/hero_luxury_dryfruits-768.webp 768w,
              /assets/hero_luxury_dryfruits-1024.webp 1024w,
              /assets/hero_luxury_dryfruits-1440.webp 1440w,
              /assets/hero_luxury_dryfruits-1920.webp 1920w
            "
            sizes="100vw"
          />
          <img
            src="/assets/hero_luxury_dryfruits.webp"
            alt="Seth And Sons Luxury Dry Fruits & Royal Harvest"
            fetchPriority="high"
            loading="eager"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover object-center brightness-[0.85] contrast-[1.05]"
          />
        </picture>

        {/* Luminous Natural Filmic Scrim - Smooth gradients for luxury typography contrast */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d0805]/75 via-[#0d0805]/25 to-[#0d0805]/85 pointer-events-none z-10" />
      </div>

      {/* Act I: Primary Hero Title & Intro (0% to 30% scroll) - Majestic Golden Typography */}
      <div
        ref={heroContentRef}
        className="relative z-20 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center will-change-transform pt-12 sm:pt-6"
      >
        <h1 className="font-serif text-4xl sm:text-6xl md:text-7xl lg:text-[5.5rem] xl:text-8xl font-normal tracking-tight leading-[1.06] max-w-5xl text-balance">
          <span className="bg-gradient-to-r from-[#fffbf0] via-[#dfc471] to-[#b99225] bg-clip-text text-transparent drop-shadow-[0_4px_28px_rgba(0,0,0,0.98)]">
            Nature’s Finest.
          </span>{' '}
          <span className="italic block font-serif font-light mt-1.5 sm:mt-3 bg-gradient-to-r from-[#ffe8a3] via-[#f7d983] to-[#dfc471] bg-clip-text text-transparent drop-shadow-[0_4px_28px_rgba(0,0,0,0.98)]">
            Delivered with Love.
          </span>
        </h1>

        <p className="mt-6 sm:mt-8 text-base sm:text-lg md:text-xl text-[#faebd0]/95 max-w-2xl font-sans font-light leading-relaxed text-balance drop-shadow-[0_2px_14px_rgba(0,0,0,0.95)]">
          Discover the richness of premium dry fruits and rare Kashmiri saffron, curated across three generations in Jammu for pure authenticity, fragrance, and taste.
        </p>

        <div className="mt-9 sm:mt-11 flex flex-col sm:flex-row items-center gap-4 sm:gap-5 w-full sm:w-auto">
          <button
            onClick={onRequestOrder}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 sm:px-9 py-4 rounded-full text-xs sm:text-sm font-bold tracking-wider uppercase bg-gradient-to-r from-[#dfc471] via-[#faeaad] to-[#c79d2b] text-[#1c120c] hover:brightness-110 shadow-2xl shadow-[#dfc471]/35 hover:shadow-[#dfc471]/60 transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] cursor-pointer"
          >
            <span>Request Your Order</span>
            <ArrowRight className="w-4 h-4 text-[#1c120c]" />
          </button>

          <button
            onClick={onExplore}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 sm:px-9 py-4 rounded-full text-xs sm:text-sm font-medium tracking-wider uppercase text-[#faebd0] bg-[#1c120c]/60 hover:bg-[#dfc471]/20 border border-[#dfc471]/60 hover:border-[#dfc471] backdrop-blur-md transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-xl drop-shadow"
          >
            <span>Explore Collection</span>
          </button>

          <Link
            to="/customer-service"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full text-xs sm:text-sm font-medium tracking-wider uppercase text-[#dfc471] bg-[#1c120c]/75 hover:bg-[#2a1d14] border border-[#dfc471]/45 hover:border-[#dfc471] backdrop-blur-md transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-xl drop-shadow"
          >
            <LifeBuoy className="w-4 h-4 text-[#dfc471]" />
            <span>Customer Service</span>
          </Link>
        </div>
      </div>

      {/* Act II: Mid-Scroll Terroir Narrative Reveal (35% to 65% scroll) */}
      <div
        ref={actTwoRef}
        className="absolute inset-x-4 max-w-4xl mx-auto z-20 text-center pointer-events-none opacity-0 will-change-transform px-4"
      >
        <div className="flex flex-col items-center">
          <span className="text-xs sm:text-[13px] font-sans tracking-[0.3em] text-[#f5d681] uppercase font-semibold block mb-3 drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]">
            Act I • The Himalayan Foothill Harvest
          </span>
          <h2 className="font-serif text-3xl sm:text-5xl md:text-6xl font-normal tracking-tight leading-[1.15] max-w-3xl text-balance">
            <span className="bg-gradient-to-r from-[#fffbf0] via-[#dfc471] to-[#b99225] bg-clip-text text-transparent drop-shadow-[0_4px_24px_rgba(0,0,0,0.95)]">
              Hand-Cracked Kernels.
            </span>{' '}
            <span className="italic block font-serif font-light mt-1 sm:mt-2 bg-gradient-to-r from-[#ffe8a3] via-[#f7d983] to-[#dfc471] bg-clip-text text-transparent drop-shadow-[0_4px_24px_rgba(0,0,0,0.95)]">
              Zero Bleaching. Pure Terroir.
            </span>
          </h2>
          <p className="mt-5 text-base sm:text-lg md:text-xl text-[#faebd0] max-w-2xl font-sans font-normal leading-relaxed text-balance drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)]">
            As you explore our collection, witness the ivory radiance of Jumbo W-240 Cashews, in-shell Mamra Badam rich in natural oil, and solar-cured Kishtwar walnuts.
          </p>
        </div>
      </div>

      {/* Act III: Finale & Transition into Collection (70% to 100% scroll) */}
      <div
        ref={actThreeRef}
        className="absolute inset-x-4 max-w-3xl mx-auto z-20 text-center pointer-events-auto opacity-0 will-change-transform px-4"
      >
        <div className="flex flex-col items-center">
          <span className="text-xs sm:text-[13px] font-sans tracking-[0.3em] text-[#f5d681] uppercase font-semibold block mb-3 drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]">
            The Journey Begins
          </span>
          <h3 className="font-serif text-3xl sm:text-5xl md:text-6xl font-normal leading-tight max-w-2xl text-balance">
            <span className="bg-gradient-to-r from-[#fffbf0] via-[#dfc471] to-[#b99225] bg-clip-text text-transparent drop-shadow-[0_4px_24px_rgba(0,0,0,0.95)]">
              Experience the Complete Jammu Harvest
            </span>
          </h3>
          <p className="mt-4 text-base sm:text-lg text-[#faebd0] max-w-xl font-sans font-normal leading-relaxed text-balance drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)]">
            Continue scrolling to explore each signature dry fruit batch with authentic pricing and provenance.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
            <button
              onClick={onExplore}
              className="w-full sm:w-auto px-8 py-3.5 rounded-full text-xs sm:text-sm font-semibold uppercase tracking-wider bg-gradient-to-r from-[#dfc471] via-[#fcedb3] to-[#dfc471] text-[#1c120c] hover:brightness-110 shadow-2xl shadow-[#dfc471]/35 hover:scale-[1.03] active:scale-[0.98] transition-all cursor-pointer font-bold"
            >
              Browse All 6 Products
            </button>
            <button
              onClick={onRequestOrder}
              className="w-full sm:w-auto px-8 py-3.5 rounded-full text-xs sm:text-sm font-semibold uppercase tracking-wider text-[#faebd0] bg-[#dfc471]/15 hover:bg-[#dfc471]/30 border border-[#dfc471]/80 backdrop-blur-sm shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
            >
              Request Order Now
            </button>
          </div>
        </div>
      </div>

      {/* Animated Scroll Down Indicator */}
      <button
        onClick={onExplore}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 p-2 text-[#ecdda7]/80 hover:text-[#dfc471] transition-colors cursor-pointer group"
        aria-label="Scroll to explore collection"
      >
        <span className="text-[11px] tracking-[0.25em] uppercase font-sans font-medium drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
          Scroll to Explore Harvest
        </span>
        <ChevronDown className="w-4 h-4 animate-bounce text-[#dfc471] drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]" />
      </button>
    </section>
  );
}
