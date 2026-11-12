import { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ChevronDown, ArrowRight, Play, Pause, LifeBuoy } from 'lucide-react';

// Register GSAP ScrollTrigger plugin
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

// Hero Video Playlist: 1st and 3rd videos are kept for extended duration (~20s and ~16s).
// Product display video waits for 5 seconds upon reaching the end, then smoothly crossfades to next video.
export const HERO_PLAYLIST = [
  {
    url: '/assets/aistudio/Woman_picking_dry_fruits_777f06bb_1080p_747221ce.mp4',
    title: 'Woman Picking Dry Fruits',
    repeatCount: 2, // Extended duration: 2 full seamless cycles (~20s total)
    holdAtEndMs: 0,
  },
  {
    url: '/assets/aistudio/Harvesting_and_packaging_dry_fruits_eea79562_t1.3-8_1080p_9a241cbd.mp4',
    title: 'Packaging & Product Display',
    repeatCount: 1, // Plays naturally to the end
    holdAtEndMs: 5000, // Wait for 5 seconds when product display video ends, then smooth faded transition
  },
  {
    url: '/assets/aistudio/Dry_fruits_bowl_showcase_49c88bee_1080p_faf9591c.mp4',
    title: 'Signature Jammu Harvest Bowls',
    repeatCount: 2, // Extended duration: 2 full seamless cycles (~16s total)
    holdAtEndMs: 0,
  },
];

interface HeroVideoProps {
  onExplore: () => void;
  onRequestOrder: () => void;
}

export default function HeroVideo({ onExplore, onRequestOrder }: HeroVideoProps) {
  const containerRef = useRef<HTMLElement>(null);
  const videoRefA = useRef<HTMLVideoElement>(null);
  const videoRefB = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const heroContentRef = useRef<HTMLDivElement>(null);
  const actTwoRef = useRef<HTMLDivElement>(null);
  const actThreeRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const activePlayerRef = useRef<'A' | 'B'>('A');

  // True dual-player additive cross-dissolve:
  // Outgoing video stays solid underneath at 100% while incoming video fades in smoothly over 1200ms
  const [opacityA, setOpacityA] = useState(1);
  const [opacityB, setOpacityB] = useState(0);
  const [zIndexA, setZIndexA] = useState(10);
  const [zIndexB, setZIndexB] = useState(20);

  const [currentIdx, setCurrentIdx] = useState(0);
  const currentIdxRef = useRef(0);
  const currentIterationRef = useRef(1); // 1-indexed: 1 .. repeatCount

  // 5-second wait timer when product display video finishes
  const waitingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isWaitingAtEndRef = useRef(false);
  const isCrossfadingRef = useRef(false);

  // Helper to determine which video should be loaded next on the standby player
  const getUpcomingUrl = (idx: number, iteration: number) => {
    const item = HERO_PLAYLIST[idx];
    if (iteration <= item.repeatCount) {
      return item.url;
    }
    const followingIdx = (idx + 1) % HERO_PLAYLIST.length;
    return HERO_PLAYLIST[followingIdx].url;
  };

  // Standby player initially preloads Video 0's second repeat
  const [srcA, setSrcA] = useState(HERO_PLAYLIST[0].url);
  const [srcB, setSrcB] = useState(getUpcomingUrl(0, 2));

  // Perform a smooth 1200ms faded transition to the specified video and iteration
  const executeSmoothCrossfade = (nextIdx: number, nextIteration: number) => {
    if (isCrossfadingRef.current) return;
    isCrossfadingRef.current = true;

    // Clear any pending 5-second wait timer
    if (waitingTimerRef.current) {
      clearTimeout(waitingTimerRef.current);
      waitingTimerRef.current = null;
    }
    isWaitingAtEndRef.current = false;

    currentIdxRef.current = nextIdx;
    setCurrentIdx(nextIdx);
    currentIterationRef.current = nextIteration;

    const currentPlayer = activePlayerRef.current;
    const nextPlayer: 'A' | 'B' = currentPlayer === 'A' ? 'B' : 'A';
    const currentVideoEl = currentPlayer === 'A' ? videoRefA.current : videoRefB.current;
    const nextVideoEl = nextPlayer === 'B' ? videoRefB.current : videoRefA.current;

    // Put incoming video on the top layer
    if (nextPlayer === 'B') {
      setZIndexB(20);
      setZIndexA(10);
    } else {
      setZIndexA(20);
      setZIndexB(10);
    }

    if (nextVideoEl) {
      nextVideoEl.currentTime = 0;
      nextVideoEl.playbackRate = 1.0;
      nextVideoEl.play().catch(() => {});
    }

    // Smoothly dissolve in incoming video (1200ms cubic-bezier transition)
    if (nextPlayer === 'B') {
      setOpacityB(1);
    } else {
      setOpacityA(1);
    }

    activePlayerRef.current = nextPlayer;

    // Once the smooth crossfade finishes (1200ms), finalize standby player
    setTimeout(() => {
      if (currentVideoEl) {
        currentVideoEl.pause();
        currentVideoEl.currentTime = 0;
      }

      // Hide retired player and swap layers so next transition is ready
      if (nextPlayer === 'B') {
        setOpacityA(0);
        setZIndexB(10); // B is now base layer
        setZIndexA(20); // A is now standby top layer
      } else {
        setOpacityB(0);
        setZIndexA(10); // A is now base layer
        setZIndexB(20); // B is now standby top layer
      }

      // Preload next upcoming video on the newly idle standby player
      const upcomingUrl = getUpcomingUrl(nextIdx, nextIteration + 1);
      if (nextPlayer === 'B') {
        setSrcA(upcomingUrl);
      } else {
        setSrcB(upcomingUrl);
      }

      isCrossfadingRef.current = false;
    }, 1200);
  };

  // Advance to next cycle or next video
  const advanceToNextOrRepeat = () => {
    if (isCrossfadingRef.current || isWaitingAtEndRef.current) return;

    const currentItem = HERO_PLAYLIST[currentIdxRef.current];
    let nextIdx = currentIdxRef.current;
    let nextIteration = currentIterationRef.current + 1;

    // If all repeats of current video are complete, advance to next video
    if (nextIteration > currentItem.repeatCount) {
      nextIdx = (currentIdxRef.current + 1) % HERO_PLAYLIST.length;
      nextIteration = 1;
    }

    executeSmoothCrossfade(nextIdx, nextIteration);
  };

  // Called when video finishes playback
  const handleVideoEnded = () => {
    if (isCrossfadingRef.current || isWaitingAtEndRef.current) return;
    const currentItem = HERO_PLAYLIST[currentIdxRef.current];

    // For product display video: wait for 5 seconds on final frame, then smooth faded transition!
    if (currentItem.holdAtEndMs && currentItem.holdAtEndMs > 0) {
      isWaitingAtEndRef.current = true;
      const currentVideoEl = activePlayerRef.current === 'A' ? videoRefA.current : videoRefB.current;
      if (currentVideoEl) {
        currentVideoEl.pause();
      }
      if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current);
      waitingTimerRef.current = setTimeout(() => {
        isWaitingAtEndRef.current = false;
        waitingTimerRef.current = null;
        advanceToNextOrRepeat();
      }, currentItem.holdAtEndMs);
    } else {
      advanceToNextOrRepeat();
    }
  };

  // Allow clicking on a chapter pill to jump directly to any video
  const handleSelectVideo = (targetIdx: number) => {
    if (isCrossfadingRef.current) return;
    if (targetIdx === currentIdxRef.current && currentIterationRef.current === 1 && !isWaitingAtEndRef.current) return;

    if (waitingTimerRef.current) {
      clearTimeout(waitingTimerRef.current);
      waitingTimerRef.current = null;
    }
    isWaitingAtEndRef.current = false;

    const currentPlayer = activePlayerRef.current;
    const nextPlayer: 'A' | 'B' = currentPlayer === 'A' ? 'B' : 'A';
    const targetUrl = HERO_PLAYLIST[targetIdx].url;

    if (nextPlayer === 'B') {
      setSrcB(targetUrl);
    } else {
      setSrcA(targetUrl);
    }

    setTimeout(() => {
      executeSmoothCrossfade(targetIdx, 1);
    }, 40);
  };

  useEffect(() => {
    const videoA = videoRefA.current;
    const videoB = videoRefB.current;
    const container = containerRef.current;
    if (!videoA || !videoB || !container) return;

    let ctx: gsap.Context | null = null;
    let animId: number;

    videoA.playbackRate = 1.0;
    videoB.playbackRate = 1.0;

    const startActive = () => {
      const active = activePlayerRef.current === 'A' ? videoA : videoB;
      active.playbackRate = 1.0;
      active.play().then(() => setIsPlaying(true)).catch(() => {});
    };

    startActive();

    // Continuous loop crossfade monitor:
    // Seamlessly handles 5-second wait when product display video ends and smooth faded transition
    const monitorLoopCrossfade = () => {
      const current = activePlayerRef.current === 'A' ? videoA : videoB;

      if (current && current.duration > 0 && !current.paused && !isWaitingAtEndRef.current && !isCrossfadingRef.current) {
        const timeLeft = current.duration - current.currentTime;
        const currentItem = HERO_PLAYLIST[currentIdxRef.current];

        if (currentItem.holdAtEndMs && currentItem.holdAtEndMs > 0) {
          // Product display video: pause on end frame and wait for 5 seconds
          if (timeLeft <= 0.05 || current.ended) {
            handleVideoEnded();
          }
        } else {
          // Normal continuous videos: initiate smooth faded transition 0.45s before end
          if (timeLeft <= 0.45 && timeLeft > 0) {
            advanceToNextOrRepeat();
          }
        }
      }

      animId = requestAnimationFrame(monitorLoopCrossfade);
    };

    animId = requestAnimationFrame(monitorLoopCrossfade);

    const initScrollTrigger = () => {
      videoA.playbackRate = 1.0;
      videoB.playbackRate = 1.0;

      if (ctx) ctx.revert();

      ctx = gsap.context(() => {
        // Master GSAP ScrollTrigger Timeline
        // Pins the hero container for scroll so narrative texts transition smoothly,
        // while the background video plays continuously with seamless crossfade looping
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: container,
            start: 'top top',
            end: '+=180%',
            pin: true,
            scrub: 0.8,
            anticipatePin: 1
          }
        });

        // 1. Subtle camera depth zoom on video container as user scrolls through
        if (videoContainerRef.current) {
          tl.to(videoContainerRef.current, {
            scale: 1.10,
            ease: 'power1.inOut',
            duration: 1
          }, 0);
        }

        // 2. Act I (Opening Hero Title): Fades out smoothly with gentle upward float
        if (heroContentRef.current) {
          tl.to(heroContentRef.current, {
            autoAlpha: 0,
            y: -50,
            scale: 0.96,
            ease: 'power2.inOut',
            duration: 0.28
          }, 0.04);
        }

        // 3. Act II (Act I • The Himalayan Foothill Harvest):
        // Silky smooth entrance from 0.28 to 0.46, stays beautifully pinned, then dissolves smoothly out from 0.58 to 0.72
        if (actTwoRef.current) {
          tl.fromTo(actTwoRef.current, {
            autoAlpha: 0,
            y: 40,
            scale: 0.96
          }, {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            ease: 'power2.out',
            duration: 0.20
          }, 0.28);

          tl.to(actTwoRef.current, {
            autoAlpha: 0,
            y: -40,
            scale: 0.96,
            ease: 'power2.in',
            duration: 0.16
          }, 0.58);
        }

        // 4. Act III (The Journey Begins / Selection Finale):
        // Silky entrance from 0.70 to 0.86, remains fully interactive and visible through 1.0
        if (actThreeRef.current) {
          tl.fromTo(actThreeRef.current, {
            autoAlpha: 0,
            y: 40,
            scale: 0.96
          }, {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            ease: 'power2.out',
            duration: 0.22
          }, 0.70);
        }
      }, container);

      ScrollTrigger.refresh();
    };

    if (videoA.readyState >= 1) {
      initScrollTrigger();
    } else {
      videoA.addEventListener('loadedmetadata', initScrollTrigger, { once: true });
      videoA.addEventListener('canplay', initScrollTrigger, { once: true });
    }

    videoA.load();
    videoB.load();

    return () => {
      cancelAnimationFrame(animId);
      if (waitingTimerRef.current) {
        clearTimeout(waitingTimerRef.current);
      }
      videoA.removeEventListener('loadedmetadata', initScrollTrigger);
      videoA.removeEventListener('canplay', initScrollTrigger);
      if (ctx) ctx.revert();
    };
  }, []);

  // Manual play/pause fallback toggle with original speed maintained
  const handleTogglePlay = () => {
    const active = activePlayerRef.current === 'A' ? videoRefA.current : videoRefB.current;
    if (!active) return;
    if (active.paused && !isWaitingAtEndRef.current) {
      active.playbackRate = 1.0;
      active.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      videoRefA.current?.pause();
      videoRefB.current?.pause();
      setIsPlaying(false);
    }
  };

  return (
    <section
      ref={containerRef}
      className="relative w-full h-screen min-h-[640px] flex items-center justify-center overflow-hidden bg-[#0d0805]"
    >
      {/* Background Cinematic Video with smooth 1200ms faded transitions and 5s product display hold */}
      <div
        ref={videoContainerRef}
        className="absolute inset-0 w-full h-full overflow-hidden select-none will-change-transform"
      >
        <video
          ref={videoRefA}
          src={srcA}
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={handleVideoEnded}
          style={{
            opacity: opacityA,
            zIndex: zIndexA,
            transition: 'opacity 1200ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          className="absolute inset-0 w-full h-full object-cover brightness-[0.88] contrast-[1.04]"
        />
        <video
          ref={videoRefB}
          src={srcB}
          muted
          playsInline
          preload="auto"
          onEnded={handleVideoEnded}
          style={{
            opacity: opacityB,
            zIndex: zIndexB,
            transition: 'opacity 1200ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          className="absolute inset-0 w-full h-full object-cover brightness-[0.88] contrast-[1.04]"
        />

        {/* Luminous Natural Filmic Scrim - Clean, seamless, without dark radial center box */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d0805]/65 via-transparent to-[#0d0805]/70 pointer-events-none z-20" />
      </div>

      {/* Act I: Primary Hero Title & Intro (0% to 30% scroll) - Majestic Golden Typography */}
      <div
        ref={heroContentRef}
        className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center will-change-transform pt-12 sm:pt-6"
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

      {/* Act II: Mid-Scroll Terroir Narrative Reveal (35% to 65% scroll) - Golden Text without black background box */}
      <div
        ref={actTwoRef}
        className="absolute inset-x-4 max-w-4xl mx-auto z-15 text-center pointer-events-none opacity-0 will-change-transform px-4"
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
            As you scroll through our signature bowls, witness the ivory radiance of Jumbo W-240 Cashews, in-shell Mamra Badam rich in natural oil, and solar-cured Kishtwar walnuts.
          </p>
        </div>
      </div>

      {/* Act III: Finale & Transition into Collection (70% to 100% scroll) - Golden Text without black background box */}
      <div
        ref={actThreeRef}
        className="absolute inset-x-4 max-w-3xl mx-auto z-15 text-center pointer-events-auto opacity-0 will-change-transform px-4"
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

      {/* Floating Manual Play/Pause & Status */}
      <div className="absolute bottom-8 left-6 sm:left-10 z-20 flex items-center gap-3">
        <button
          onClick={handleTogglePlay}
          className="p-3 rounded-full bg-[#1c120c]/85 border border-[#dfc471]/40 text-[#dfc471] hover:text-[#0d0805] hover:bg-[#dfc471] backdrop-blur-md transition-all shadow-xl cursor-pointer"
          title={isPlaying ? 'Pause video' : 'Play video'}
          aria-label={isPlaying ? 'Pause video' : 'Play video'}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>

        {/* Video Chapter Indicator & Interactive Pills */}
        <div className="flex items-center gap-2.5 bg-[#1c120c]/85 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-[#dfc471]/35 shadow-xl">
          <div className="flex items-center gap-1.5">
            {HERO_PLAYLIST.map((item, i) => (
              <button
                key={i}
                onClick={() => handleSelectVideo(i)}
                className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                  currentIdx === i
                    ? 'w-6 bg-[#dfc471] shadow-[0_0_8px_rgba(223,196,113,0.6)]'
                    : 'w-2 bg-[#dfc471]/30 hover:bg-[#dfc471]/60'
                }`}
                title={`Switch to: ${item.title}`}
                aria-label={`Switch to: ${item.title}`}
              />
            ))}
          </div>
          <span className="text-[11px] text-[#ecdda7] font-sans font-medium hidden sm:inline tracking-wide">
            {HERO_PLAYLIST[currentIdx].title}
          </span>
        </div>
      </div>

      {/* Animated Scroll Down Indicator */}
      <button
        onClick={onExplore}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1.5 text-[#ecdda7]/80 hover:text-[#dfc471] transition-colors cursor-pointer group"
        aria-label="Scroll to explore collection"
      >
        <span className="text-[11px] tracking-[0.25em] uppercase font-sans font-medium">
          Scroll to Explore Harvest
        </span>
        <ChevronDown className="w-4 h-4 animate-bounce text-[#dfc471]" />
      </button>
    </section>
  );
}
