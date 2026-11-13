import { Crown, CheckCircle2, Leaf, Sparkles, PackageCheck, HeartHandshake } from 'lucide-react';

export default function WhyChooseUs() {
  const pillars = [
    {
      icon: Crown,
      title: 'Premium Quality',
      description: 'Only the topmost tier of kernel size, texture, and density is curated for our signature packs.'
    },
    {
      icon: CheckCircle2,
      title: 'Carefully Selected Products',
      description: 'Every batch undergoes multi-stage manual grading to remove broken pieces, dust, and immature kernels.'
    },
    {
      icon: Leaf,
      title: 'Freshness Guaranteed',
      description: 'Harvested in season, nitrogen-flushed, and stored in humidity-controlled artisanal cellars.'
    },
    {
      icon: Sparkles,
      title: 'Authentic Taste',
      description: 'No added artificial glazing, zero sulfur bleaching, and zero chemical preservatives. 100% natural flavor.'
    },
    {
      icon: PackageCheck,
      title: 'Quality Packaging',
      description: 'Food-grade multi-barrier canisters and airtight jars that seal in natural crunch, aroma, and essential oils.'
    },
    {
      icon: HeartHandshake,
      title: 'Customer Satisfaction',
      description: 'Direct concierge support, transparent request processing, and an unwavering commitment to your delight.'
    }
  ];

  return (
    <section id="why-us" className="relative py-24 sm:py-32 bg-[#0d0805] text-[#ede4dc] overflow-hidden">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16 sm:mb-20">
          <div className="inline-flex items-center gap-2 text-xs font-sans font-medium tracking-[0.25em] uppercase text-[#dfc471] mb-3">
            <span>The Gold Standard</span>
          </div>

          <h2 className="font-serif text-3xl sm:text-5xl font-normal text-[#f9f6f2] tracking-tight">
            Why Discerning Patrons Choose Seth And Sons DryFruits
          </h2>

          <p className="mt-4 text-base text-[#ede4dc]/90 font-sans leading-relaxed">
            Our uncompromising attention to origin, harvest timing, and protective curing makes every single bite an unforgettable luxury.
          </p>
        </div>

        {/* 6 Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
          {pillars.map((pillar, index) => {
            const Icon = pillar.icon;
            return (
              <div
                key={index}
                className="group p-8 rounded-2xl bg-[#150d09]/70 border border-[#38281d] hover:border-[#dfc471]/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#0d0805]"
              >
                <div className="w-12 h-12 rounded-xl bg-[#251a13] border border-[#38281d] flex items-center justify-center text-[#dfc471] group-hover:bg-[#dfc471] group-hover:text-[#0d0805] transition-colors duration-300 mb-6">
                  <Icon className="w-6 h-6" />
                </div>

                <h3 className="font-serif text-xl font-medium text-[#f9f6f2] group-hover:text-[#dfc471] transition-colors">
                  {pillar.title}
                </h3>

                <p className="mt-3 text-sm text-[#ede4dc]/90 font-sans leading-relaxed">
                  {pillar.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
