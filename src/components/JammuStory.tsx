import { Mountain, Droplets, Sun, Sparkles, ShieldCheck } from 'lucide-react';
import ScrollReveal from './ScrollReveal';

export default function JammuStory() {
  const jammuPillars = [
    {
      icon: Mountain,
      title: 'Himalayan Foothill Terroir',
      desc: 'The unique microclimate of Jammu province and the Pir Panjal slopes shields orchards from excessive rain while providing cool alpine breezes that concentrate natural nut sugars.'
    },
    {
      icon: Droplets,
      title: 'Glacial Mineral Waters',
      desc: 'Ancient Chenab and Tawi river basins feed mountain trees with pure mineral runoff, infusing Walnuts and Mamara Badam with rich Omega-3 and natural almond oils.'
    },
    {
      icon: Sun,
      title: 'Traditional Sun & Shade Curing',
      desc: 'Passed down through the Seth family, every crop is cured in specialized earthenware cellars in Jammu that prevent rancidity without the use of sulfur bleaching or chemical baths.'
    }
  ];

  return (
    <section id="jammu-story" className="relative py-24 sm:py-32 bg-[#120c08] text-[#ede4dc] overflow-hidden border-t border-[#38281d]">
      {/* Decorative ambient radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-[#dfc471]/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="max-w-3xl mb-16">
            <div className="inline-flex items-center gap-2 text-xs font-sans font-medium tracking-[0.25em] uppercase text-[#dfc471] mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Direct Sourcing Heritage</span>
            </div>

            <h2 className="font-serif text-3xl sm:text-5xl font-normal text-[#f9f6f2] tracking-tight leading-tight">
              The Jammu Soil: Where Nature's Truest Luxury Is Born.
            </h2>

            <p className="mt-5 text-base sm:text-lg text-[#d5c4b4] font-sans leading-relaxed">
              For three generations, <strong className="text-[#f9f6f2] font-semibold">Seth And Sons DryFruits</strong> has been anchored in the historic trade mandis of Jammu. All of our signature dry fruits and pure saffron are sourced directly from the mountain orchards, river valleys, and grower co-operatives across the Jammu & Kashmir region.
            </p>
          </div>
        </ScrollReveal>

        {/* 3 Jammu Provenance Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {jammuPillars.map((item, idx) => {
            const Icon = item.icon;
            return (
              <ScrollReveal key={idx} delay={idx * 0.15}>
                <div className="h-full p-8 rounded-2xl bg-[#1a110a] border border-[#38281d] hover:border-[#dfc471]/50 transition-all duration-300 hover:-translate-y-1 group shadow-xl">
                  <div className="w-12 h-12 rounded-xl bg-[#251a13] border border-[#38281d] flex items-center justify-center text-[#dfc471] group-hover:bg-[#dfc471] group-hover:text-[#0d0805] transition-colors mb-6">
                    <Icon className="w-6 h-6" />
                  </div>

                  <h3 className="font-serif text-xl font-medium text-[#f9f6f2] group-hover:text-[#dfc471] transition-colors">
                    {item.title}
                  </h3>

                  <p className="mt-3 text-sm text-[#d5c4b4]/75 font-sans leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </ScrollReveal>
            );
          })}
        </div>

        {/* The Seth Family Quality Guarantee Banner */}
        <ScrollReveal delay={0.3} className="mt-16">
          <div className="p-8 sm:p-10 rounded-2xl bg-[#1c120c] border border-[#dfc471]/30 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-[#251a13] border border-[#dfc471]/40 flex items-center justify-center text-[#dfc471] shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-serif text-xl text-[#f9f6f2]">
                  The Seth And Sons DryFruits Family Seal
                </h4>
                <p className="mt-1 text-sm text-[#d5c4b4]/80 max-w-2xl leading-relaxed">
                  "We never purchase from anonymous auction houses. Each bag of Walnuts, Mamra Badam, and strand of Saffron is personally inspected by our family in Jammu before dispatch to your home."
                </p>
              </div>
            </div>

            <div className="shrink-0 text-right">
              <span className="text-[11px] font-sans tracking-[0.2em] uppercase text-[#dfc471] block">
                Jammu Mandi Est. 1968
              </span>
              <span className="font-serif text-lg text-[#f9f6f2] font-semibold">
                Seth And Sons DryFruits
              </span>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
