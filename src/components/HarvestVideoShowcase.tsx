import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Sparkles, ArrowRight, CheckCircle2, Eye } from 'lucide-react';
import ScrollReveal from './ScrollReveal';
import { PRODUCTS, CatalogProduct } from '../data/products';

interface HarvestVideoShowcaseProps {
  onRequestPurchase: (productId: string) => void;
  onViewCatalog?: (productId?: string) => void;
}

export default function HarvestVideoShowcase({
  onRequestPurchase,
  onViewCatalog
}: HarvestVideoShowcaseProps) {
  // Only products with active video show in this carousel
  const videoProducts = PRODUCTS.filter(p => !!p.videoUrl && !!p.videoDetails);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isInView, setIsInView] = useState(false);
  const [userInteracted, setUserInteracted] = useState(false);

  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentProduct: CatalogProduct | undefined = videoProducts[selectedIndex] || videoProducts[0];
  const videoDetails = currentProduct?.videoDetails;

  // IntersectionObserver to prevent downloading ~5MB video until user scrolls near
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setIsInView(true);
        } else {
          // Pause when offscreen to save battery and main-thread work
          if (videoRef.current && !videoRef.current.paused) {
            videoRef.current.pause();
            setIsPlaying(false);
          }
        }
      },
      { rootMargin: '250px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Handle video playback synchronization on product change or when scrolled into view
  useEffect(() => {
    if (!isInView) return;
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = 0;
    video.playbackRate = 1.0;
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  }, [selectedIndex, isInView]);

  if (!currentProduct || !videoDetails) {
    return null;
  }

  // Track video progress bar
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    setProgress((video.currentTime / video.duration) * 100);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    setUserInteracted(true);
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const posterImage = currentProduct.image.endsWith('.jpg')
    ? currentProduct.image.replace('.jpg', '.webp')
    : currentProduct.image;

  return (
    <section
      id="harvest-reels"
      ref={sectionRef}
      className="relative w-full py-24 sm:py-32 bg-[#0d0805] text-[#ede4dc] overflow-hidden border-t border-[#38281d]/60"
    >
      {/* Subtle ambient golden gradient background highlights */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(223,196,113,0.06)_0%,transparent_70%)] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <ScrollReveal>
          <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#dfc471]/15 border border-[#dfc471]/40 backdrop-blur-sm mb-4 shadow-lg">
              <Sparkles className="w-3.5 h-3.5 text-[#dfc471] animate-pulse" />
              <span className="text-[11px] sm:text-xs font-semibold tracking-[0.25em] text-[#fae8b2] uppercase">
                Artisanal Harvest in Motion • 1080p Cinema
              </span>
            </div>

            <h2 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-normal text-[#f9f6f2] tracking-tight leading-tight">
              Terroir & Craft:{' '}
              <span className="italic block font-serif font-light mt-1 bg-gradient-to-r from-[#ffe8a3] via-[#dfc471] to-[#b99225] bg-clip-text text-transparent">
                Witness The Purity.
              </span>
            </h2>

            <p className="mt-4 sm:mt-5 text-base sm:text-lg text-[#d5c4b4]/90 font-sans leading-relaxed text-balance">
              Inspect the authentic hand-cracking, cold virgin oil extraction, and morning dew harvesting of our 6 signature Jammu dry fruits. Zero chemicals, zero bleaching, pure mountain vitality.
            </p>
          </div>
        </ScrollReveal>

        {/* 6 Product Selector Pills */}
        <ScrollReveal delay={0.1}>
          <div className="flex items-center justify-start sm:justify-center gap-2.5 overflow-x-auto pb-4 mb-8 sm:mb-12 no-scrollbar">
            {videoProducts.map((product, idx) => {
              const isSelected = selectedIndex === idx;
              return (
                <button
                  key={product.id}
                  onClick={() => {
                    setUserInteracted(true);
                    setSelectedIndex(idx);
                  }}
                  className={`shrink-0 flex items-center gap-2.5 px-4 sm:px-5 py-2.5 rounded-full text-xs font-medium tracking-wide transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-[#dfc471] via-[#faeaad] to-[#c79d2b] text-[#1c120c] font-bold shadow-xl shadow-[#dfc471]/30 scale-105'
                      : 'bg-[#1c120c]/80 text-[#d5c4b4] hover:text-[#ede4dc] hover:bg-[#251a13] border border-[#38281d] hover:border-[#dfc471]/40'
                  }`}
                  aria-label={`Select harvest video for ${product.name}`}
                >
                  <span className="w-2 h-2 rounded-full bg-current opacity-80" />
                  <span>{product.name}</span>
                  {product.hindiName && (
                    <span className={`text-[11px] opacity-75 font-serif ${isSelected ? 'text-[#1c120c]' : 'text-[#dfc471]'}`}>
                      {product.hindiName}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </ScrollReveal>

        {/* Master Cinema Viewport + Craft Detail Panel */}
        <ScrollReveal delay={0.2}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch bg-[#140e0a]/90 border border-[#38281d] rounded-3xl p-6 sm:p-8 lg:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.9)] backdrop-blur-md">
            {/* Left Column: 1080p Cinema Player */}
            <div className="lg:col-span-7 flex flex-col justify-between">
              <div
                onClick={togglePlay}
                className="relative aspect-video w-full rounded-2xl overflow-hidden bg-[#0d0805] border border-[#dfc471]/30 shadow-2xl group cursor-pointer"
              >
                <video
                  ref={videoRef}
                  key={currentProduct.videoUrl}
                  src={isInView || userInteracted ? currentProduct.videoUrl : undefined}
                  poster={posterImage}
                  preload="none"
                  autoPlay={isInView}
                  muted={isMuted}
                  playsInline
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => setSelectedIndex(prev => (prev + 1) % videoProducts.length)}
                  className="w-full h-full object-cover transform brightness-[0.92] contrast-[1.04]"
                />

                {/* Subtle Cinematic Vignette */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0d0805]/80 via-transparent to-[#0d0805]/30 pointer-events-none" />

                {/* Big Center Play/Pause Indicator when paused */}
                {!isPlaying && (
                  <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                    <div className="w-16 h-16 rounded-full bg-[#1c120c]/80 border border-[#dfc471]/70 backdrop-blur-md flex items-center justify-center text-[#dfc471] shadow-2xl transform transition-transform group-hover:scale-110">
                      <Play className="w-7 h-7 ml-1" />
                    </div>
                  </div>
                )}

                {/* Bottom Overlay Controls */}
                <div
                  className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3 z-20"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2">
                    <button
                      onClick={togglePlay}
                      className="p-2.5 rounded-full bg-[#1c120c]/85 hover:bg-[#dfc471] text-[#dfc471] hover:text-[#0d0805] border border-[#dfc471]/40 backdrop-blur-md transition-all shadow-xl cursor-pointer"
                      title={isPlaying ? 'Pause video' : 'Play video'}
                      aria-label={isPlaying ? 'Pause video' : 'Play video'}
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={toggleMute}
                      className="p-2.5 rounded-full bg-[#1c120c]/85 hover:bg-[#dfc471] text-[#dfc471] hover:text-[#0d0805] border border-[#dfc471]/40 backdrop-blur-md transition-all shadow-xl cursor-pointer"
                      title={isMuted ? 'Unmute' : 'Mute'}
                      aria-label={isMuted ? 'Unmute' : 'Mute'}
                    >
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                  </div>

                  <span className="text-[11px] font-sans text-[#faebd0]/90 bg-[#0d0805]/80 px-3 py-1 rounded-full border border-[#38281d] truncate max-w-[200px] sm:max-w-xs">
                    {currentProduct.name}
                  </span>
                </div>

                {/* Hairline Progress Scrubber Line */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#251a13]/80">
                  <div
                    className="h-full bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#faeaad] transition-all duration-100"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Reel navigation buttons below video */}
              <div className="mt-4 flex items-center justify-between text-xs text-[#d5c4b4]/70">
                <span>Natural 1.0x Speed • Authentic Harvest Footage</span>
                <span className="text-[#dfc471] font-medium">
                  {selectedIndex + 1} of {videoProducts.length} Signature Batches
                </span>
              </div>
            </div>

            {/* Right Column: Artisan Craft & Sensory Details */}
            <div className="lg:col-span-5 flex flex-col justify-between space-y-6">
              <div>
                {/* Product Eyebrow & Badges */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-[11px] font-sans tracking-[0.25em] text-[#dfc471] uppercase font-semibold">
                    {currentProduct.grade}
                  </span>
                  <span className="text-[#38281d]">·</span>
                  <span className="text-[11px] text-[#faebd0]/75 font-sans">
                    {currentProduct.origin}
                  </span>
                </div>

                {/* Product Title */}
                <h3 className="font-serif text-2xl sm:text-4xl font-normal text-[#f9f6f2] tracking-tight leading-tight">
                  {currentProduct.name}{' '}
                  {currentProduct.hindiName && (
                    <span className="italic font-serif text-[#dfc471] text-xl sm:text-2xl font-light">
                      ({currentProduct.hindiName})
                    </span>
                  )}
                </h3>

                {/* Action Title */}
                <div className="mt-3 p-3 rounded-xl bg-[#1c120c]/80 border border-[#dfc471]/30">
                  <span className="text-xs sm:text-sm font-semibold text-[#fcedb3] block font-sans">
                    🎬 {videoDetails.actionTitle}
                  </span>
                </div>

                {/* Craft Process */}
                <div className="mt-5 space-y-2">
                  <h4 className="text-xs font-sans tracking-wider uppercase text-[#d5c4b4]/60 font-semibold">
                    The Artisanal Craft
                  </h4>
                  <p className="text-sm text-[#ede4dc]/90 font-sans leading-relaxed">
                    {videoDetails.craftProcess}
                  </p>
                </div>

                {/* Sensory & Texture Notes */}
                <div className="mt-5 space-y-2">
                  <h4 className="text-xs font-sans tracking-wider uppercase text-[#d5c4b4]/60 font-semibold">
                    Sensory & Texture Notes
                  </h4>
                  <p className="text-sm text-[#faebd0]/85 font-sans leading-relaxed italic bg-[#0d0805]/40 p-3 rounded-xl border border-[#38281d]">
                    "{videoDetails.sensoryQuality}"
                  </p>
                </div>

                {/* Provenance Pillar Highlight */}
                <div className="mt-4 flex items-start gap-2 text-xs text-[#dfc471]">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[#dfc471] mt-0.5" />
                  <span>{videoDetails.harvestPillar}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-6 border-t border-[#38281d] flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={() => onRequestPurchase(currentProduct.id)}
                  className="w-full sm:flex-1 py-3.5 px-6 rounded-full text-xs font-bold tracking-wider uppercase bg-gradient-to-r from-[#dfc471] via-[#faeaad] to-[#c79d2b] text-[#1c120c] hover:brightness-110 shadow-xl shadow-[#dfc471]/25 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Request {currentProduct.name.split(' ')[0]} Order</span>
                  <ArrowRight className="w-4 h-4 text-[#1c120c]" />
                </button>

                {onViewCatalog && (
                  <button
                    onClick={() => onViewCatalog(currentProduct.id)}
                    className="w-full sm:w-auto py-3.5 px-5 rounded-full text-xs font-medium tracking-wider uppercase text-[#faebd0] bg-[#1c120c]/80 hover:bg-[#dfc471]/20 border border-[#dfc471]/50 hover:border-[#dfc471] transition-all cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#dfc471]" />
                    <span>View In Catalog</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* 6 Miniature Motion Cards Row Below */}
        <ScrollReveal delay={0.3} className="mt-8 sm:mt-12">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            {videoProducts.map((p, idx) => {
              const isSelected = selectedIndex === idx;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedIndex(idx)}
                  className={`group relative rounded-2xl overflow-hidden p-2.5 bg-[#140e0a] border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#dfc471] ring-2 ring-[#dfc471]/30 shadow-xl -translate-y-1'
                      : 'border-[#38281d] hover:border-[#dfc471]/50 hover:-translate-y-0.5'
                  }`}
                >
                  <div className="relative aspect-video rounded-xl overflow-hidden mb-2 bg-[#0d0805]">
                    <img
                      src={p.image}
                      alt={p.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-[#0d0805]/40 group-hover:bg-[#0d0805]/20 transition-colors flex items-center justify-center">
                      <div className={`p-1.5 rounded-full backdrop-blur-md ${isSelected ? 'bg-[#dfc471] text-[#0d0805]' : 'bg-[#0d0805]/80 text-[#dfc471]'}`}>
                        <Play className="w-3 h-3 fill-current" />
                      </div>
                    </div>
                  </div>

                  <span className="font-serif text-xs font-medium text-[#ede4dc] group-hover:text-[#dfc471] transition-colors truncate block">
                    {p.name}
                  </span>
                  <span className="text-[10px] text-[#d5c4b4]/60 font-sans truncate block">
                    {p.subtitle.split(' ')[0]} {p.subtitle.split(' ')[1]}
                  </span>
                </div>
              );
            })}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
