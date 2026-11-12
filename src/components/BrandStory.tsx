import { ShieldCheck, Sparkles, Award, HeartHandshake } from 'lucide-react';

export default function BrandStory() {
  return (
    <section id="story" className="relative py-28 sm:py-36 bg-[#150d09] text-[#ede4dc] overflow-hidden border-y border-[#38281d]/70">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(223,196,113,0.06)_0%,transparent_60%)] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Left Column: Brand Story Manifesto */}
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 text-xs font-sans font-medium tracking-[0.25em] uppercase text-[#dfc471] mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              <span>The Royal Heritage</span>
            </div>

            <h2 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-normal text-[#f9f6f2] tracking-tight leading-[1.1] text-balance">
              Quality You Can Taste.{' '}
              <span className="italic text-[#dfc471] block font-light mt-1">
                Goodness You Can Trust.
              </span>
            </h2>

            <p className="mt-8 text-base sm:text-lg text-[#d5c4b4] leading-relaxed font-sans font-light">
              We believe true luxury begins in the soil. Unlike commercial mass retailers who rely on industrial sulfur bleaching and prolonged cold-storage decay, Seth And Sons DryFruits celebrates the seasonal rhythm of genuine harvests.
            </p>

            <p className="mt-4 text-base text-[#d5c4b4]/80 leading-relaxed font-sans">
              From the pristine high-altitude saffron fields of Pampore to sun-kissed cashew orchards of Konkan, our connoisseurs personally inspect every single lot before it is hand-packed into nitrogen-flushed, airtight moisture-lock glass and tin keepsakes.
            </p>

            {/* Core Pillars */}
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="p-5 rounded-xl bg-[#1c120c] border border-[#38281d]/80">
                <div className="w-10 h-10 rounded-lg bg-[#251a13] flex items-center justify-center text-[#dfc471] mb-3">
                  <Award className="w-5 h-5" />
                </div>
                <h4 className="font-serif text-lg text-[#f9f6f2]">Origin-Specific Sourcing</h4>
                <p className="mt-1 text-xs text-[#d5c4b4]/70 leading-relaxed font-sans">
                  Zero blending. Single-source geographical verification for each variety.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-[#1c120c] border border-[#38281d]/80">
                <div className="w-10 h-10 rounded-lg bg-[#251a13] flex items-center justify-center text-[#dfc471] mb-3">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h4 className="font-serif text-lg text-[#f9f6f2]">Rigorous Grade Selection</h4>
                <p className="mt-1 text-xs text-[#d5c4b4]/70 leading-relaxed font-sans">
                  Kernel size, moisture equilibrium, and natural oil content audited by hand.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Visual Editorial Card & Seal of Purity */}
          <div className="lg:col-span-5 relative">
            <div className="relative rounded-2xl overflow-hidden border border-[#dfc471]/30 bg-[#1c120c] shadow-2xl p-8 sm:p-10 flex flex-col justify-between">
              {/* Subtle gold decorative lines */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#dfc471]/15 to-transparent pointer-events-none" />

              <div>
                <div className="flex items-center justify-between mb-8">
                  <span className="text-[11px] font-sans tracking-[0.2em] uppercase text-[#dfc471]">
                    Purity Pledge
                  </span>
                  <HeartHandshake className="w-5 h-5 text-[#dfc471]" />
                </div>

                <blockquote className="font-serif text-2xl sm:text-3xl text-[#f9f6f2] italic font-light leading-snug">
                  "Dry fruits are not mere commodities; they are concentrated vitality created by sun, water, and centuries of artisan care."
                </blockquote>

                <div className="mt-6 pt-6 border-t border-[#38281d] text-sm text-[#d5c4b4]">
                  <p className="font-medium text-[#ede4dc]">The Seth And Sons DryFruits Tasting Council</p>
                  <p className="text-xs text-[#d5c4b4]/60">Hand-selected harvest guarantee</p>
                </div>
              </div>

              {/* Trust Metrics Strip */}
              <div className="mt-8 pt-6 border-t border-[#38281d] grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="font-sans font-bold text-2xl text-[#dfc471] tabular-nums">100%</div>
                  <div className="text-[10px] tracking-wider uppercase text-[#d5c4b4]/70 mt-0.5">Raw Purity</div>
                </div>
                <div>
                  <div className="font-sans font-bold text-2xl text-[#dfc471] tabular-nums">0%</div>
                  <div className="text-[10px] tracking-wider uppercase text-[#d5c4b4]/70 mt-0.5">Additives</div>
                </div>
                <div>
                  <div className="font-sans font-bold text-2xl text-[#dfc471] tabular-nums">24h</div>
                  <div className="text-[10px] tracking-wider uppercase text-[#d5c4b4]/70 mt-0.5">Fresh Pack</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
