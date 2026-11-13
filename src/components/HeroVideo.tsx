import { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ArrowRight, LifeBuoy, Sparkles } from 'lucide-react';

interface HeroVideoProps {
  onExplore: () => void;
  onRequestOrder: () => void;
}

export default function HeroVideo({ onExplore, onRequestOrder }: HeroVideoProps) {
  const containerRef = useRef<HTMLElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Subtle parallax effect on mouse move / scroll for ultra-premium depth
    const el = imageContainerRef.current;
    if (!el) return;

    let rafId = 0;
    const handleScroll = () => {
      const scrollY = window.scrollY;
      if (scrollY < window.innerHeight) {
        el.style.transform = `scale(${1 + scrollY * 0.00015}) translateY(${scrollY * 0.12}px)`;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <section
      ref={containerRef}
      className="relative w-full min-h-[580px] sm:min-h-[680px] md:min-h-[760px] lg:min-h-[88vh] xl:min-h-[94vh] flex flex-col justify-between overflow-hidden bg-[#0d0805] select-none"
    >
      {/* Hidden SEO & Accessibility H1 */}
      <h1 className="sr-only">
        Seth And Sons DryFruits — Pure Goodness. Naturally. Premium Dry Fruits & Kashmiri Saffron Sourced From Jammu
      </h1>

      {/* Background Responsive Hero Artwork */}
      <div
        ref={imageContainerRef}
        className="absolute inset-0 w-full h-full overflow-hidden will-change-transform transition-transform duration-300 ease-out"
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
            className="w-full h-full object-cover object-center sm:object-[center_42%] brightness-[0.98] contrast-[1.03]"
          />
        </picture>

        {/* Elegant Minimal Vignettes - Keeps artwork vibrant while framing navbar and footer */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d0805]/80 via-transparent to-[#0d0805]/95 pointer-events-none" />
        <div className="absolute inset-0 bg-radial from-transparent via-transparent to-[#0d0805]/60 pointer-events-none" />
      </div>

      {/* Top Heritage Sub-Badge (Positioned gracefully below the floating navbar) */}
      <div className="relative z-20 pt-24 sm:pt-28 md:pt-32 px-4 sm:px-6 max-w-7xl mx-auto w-full flex items-center justify-between pointer-events-none">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#120a06]/75 border border-[#dfc471]/35 backdrop-blur-md text-[#dfc471] text-[10px] sm:text-xs font-semibold uppercase tracking-[0.25em] shadow-xl pointer-events-auto">
          <Sparkles className="w-3 h-3 text-[#dfc471] animate-pulse" />
          <span>Heritage Dry Fruit Mandi, Jammu • Est. 1952</span>
        </div>

        <div className="hidden md:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#120a06]/65 border border-[#dfc471]/20 backdrop-blur-md text-[#faebd0]/80 text-[10px] sm:text-xs font-medium uppercase tracking-[0.2em] pointer-events-auto">
          <span>Three Generations of Royal Grading</span>
        </div>
      </div>

      {/* Center Spacer allowing the rich artwork, brass bowls, and typography to shine unobstructed */}
      <div className="flex-1 min-h-[160px] sm:min-h-[260px] md:min-h-[320px]" />

      {/* Bottom Floating Luxury Action Dock & Exploration Controls */}
      <div className="relative z-20 pb-8 sm:pb-12 px-4 sm:px-6 w-full flex flex-col items-center">
        {/* Floating Glassmorphism Command Dock */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 p-2 sm:p-2.5 rounded-full bg-[#120a06]/85 border border-[#dfc471]/45 backdrop-blur-2xl shadow-[0_16px_48px_rgba(0,0,0,0.92)] transition-all hover:border-[#dfc471]/70">
          <button
            onClick={onRequestOrder}
            className="inline-flex items-center justify-center gap-2.5 px-6 sm:px-8 py-3 sm:py-3.5 rounded-full text-xs sm:text-sm font-bold tracking-wider uppercase bg-gradient-to-r from-[#dfc471] via-[#faeaad] to-[#c79d2b] text-[#1c120c] hover:brightness-110 shadow-xl shadow-[#dfc471]/25 transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] cursor-pointer"
          >
            <span>Request Your Order</span>
            <ArrowRight className="w-4 h-4 text-[#1c120c]" />
          </button>

          <button
            onClick={onExplore}
            className="inline-flex items-center justify-center gap-2 px-6 sm:px-7 py-3 sm:py-3.5 rounded-full text-xs sm:text-sm font-semibold tracking-wider uppercase text-[#faebd0] hover:text-[#dfc471] bg-[#1c120c]/60 hover:bg-[#dfc471]/15 border border-[#dfc471]/35 hover:border-[#dfc471]/80 backdrop-blur-md transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            <span>Explore Collection</span>
          </button>

          <Link
            to="/customer-service"
            className="hidden sm:inline-flex items-center justify-center gap-2 px-5 py-3 sm:py-3.5 rounded-full text-xs sm:text-sm font-medium tracking-wider uppercase text-[#dfc471]/90 hover:text-[#dfc471] hover:bg-[#dfc471]/10 transition-all duration-300"
          >
            <LifeBuoy className="w-4 h-4 text-[#dfc471]" />
            <span>Concierge</span>
          </Link>
        </div>

        {/* Smooth Scroll Exploration Trigger */}
        <button
          onClick={onExplore}
          className="mt-4 sm:mt-5 flex items-center gap-2 text-[10px] sm:text-[11px] tracking-[0.28em] uppercase font-sans text-[#ecdda7]/75 hover:text-[#dfc471] transition-colors cursor-pointer group"
          aria-label="Scroll to explore collection"
        >
          <span className="drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">Scroll to Explore Harvest</span>
          <ChevronDown className="w-3.5 h-3.5 animate-bounce text-[#dfc471] drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]" />
        </button>
      </div>
    </section>
  );
}
