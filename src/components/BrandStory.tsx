import { ShieldCheck, Scale, FileText, CheckCircle2, Lock } from 'lucide-react';

export default function BrandStory() {
  const owners = [
    { id: 1, name: 'Asulesh Prasad Seth', role: 'Owner & Managing Partner' },
    { id: 2, name: 'Anjana Prasad Seth', role: 'Owner & Managing Partner' },
    { id: 3, name: 'Arihant Seth', role: 'Owner & Managing Partner' },
    { id: 4, name: 'Abheet Seth', role: 'Owner & Managing Partner' },
  ];

  return (
    <section id="story" className="relative py-24 sm:py-32 bg-[#150d09] text-[#ede4dc] overflow-hidden border-y border-[#38281d]/70">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(223,196,113,0.06)_0%,transparent_60%)] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
          {/* Main Legal Declaration Column */}
          <div className="lg:col-span-8 space-y-6">
            <div className="inline-flex items-center gap-2 text-xs font-sans font-medium tracking-[0.25em] uppercase text-[#dfc471]">
              <Scale className="w-3.5 h-3.5 text-[#dfc471]" />
              <span>Official Business &amp; Governance Notice</span>
            </div>

            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-semibold text-[#f9f6f2] tracking-tight leading-[1.15]">
              LEGAL OWNERSHIP DECLARATION
            </h2>

            <div className="p-6 sm:p-8 rounded-2xl bg-[#1c120c] border border-[#38281d] space-y-6 shadow-xl">
              <p className="text-base sm:text-lg text-[#ede4dc] leading-relaxed font-sans">
                This website and the business operated under the name <strong className="font-semibold text-[#f9f6f2]">Seth And Sons DryFruits</strong> are exclusively owned and managed by the following individuals:
              </p>

              {/* Numbered Owner List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {owners.map(owner => (
                  <div
                    key={owner.id}
                    className="p-4 rounded-xl bg-[#150d09] border border-[#dfc471]/25 flex items-center gap-3.5 hover:border-[#dfc471]/50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#dfc471]/15 text-[#dfc471] font-serif font-bold text-sm flex items-center justify-center shrink-0 border border-[#dfc471]/30">
                      {owner.id}
                    </div>
                    <div>
                      <div className="font-serif text-base sm:text-lg text-[#f9f6f2] font-semibold tracking-wide">
                        {owner.name}
                      </div>
                      <div className="text-[11px] text-[#dfc471]/80 font-sans uppercase tracking-wider">
                        {owner.role}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Exclusion & Authorization Clause */}
              <div className="pt-2 text-sm sm:text-base text-[#d5c4b4] leading-relaxed font-sans space-y-4">
                <p>
                  No other individual, whether belonging to the Seth family or otherwise, is an owner, partner, stakeholder, or authorized participant in this business unless formally authorized in writing by the above-mentioned owners.
                </p>
                <p>
                  All business rights, operations, branding, website content, and associated assets are reserved exclusively to the above-mentioned owners.
                </p>
              </div>

              {/* Copyright Seal */}
              <div className="pt-4 border-t border-[#38281d] flex items-center justify-between flex-wrap gap-2 text-xs sm:text-sm font-semibold text-[#dfc471]">
                <span>&copy; 2026 Seth And Sons DryFruits. All Rights Reserved.</span>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-[#d5c4b4]/70 font-normal">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Legally Binding Declaration
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Formal Certificate & Authentication Emblem Card */}
          <div className="lg:col-span-4 relative lg:mt-12">
            <div className="relative rounded-2xl overflow-hidden border border-[#dfc471]/35 bg-[#1c120c] shadow-2xl p-6 sm:p-8 space-y-6">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#dfc471]/15 to-transparent pointer-events-none" />

              <div className="flex items-center justify-between border-b border-[#38281d] pb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#dfc471]" />
                  <span className="text-xs font-sans tracking-[0.2em] uppercase text-[#dfc471] font-semibold">
                    Proprietary Notice
                  </span>
                </div>
                <Lock className="w-4 h-4 text-[#dfc471]/70" />
              </div>

              <div className="space-y-4 text-xs text-[#d5c4b4]/90 leading-relaxed font-sans">
                <div className="font-serif text-lg text-[#f9f6f2] font-normal leading-snug">
                  Official Entity &amp; Trade Registration
                </div>
                <p>
                  Operating under the historic Seth enterprise lineage with exclusive direct governance by the four declared partners.
                </p>
                <div className="p-3.5 rounded-xl bg-[#150d09] border border-[#38281d] space-y-2 text-[11px]">
                  <div className="flex justify-between items-center text-[#d5c4b4]/70">
                    <span>Business Domain:</span>
                    <span className="text-[#f9f6f2] font-mono">Seth And Sons DryFruits</span>
                  </div>
                  <div className="flex justify-between items-center text-[#d5c4b4]/70">
                    <span>Governance:</span>
                    <span className="text-[#dfc471] font-medium">Exclusively 4 Declared Owners</span>
                  </div>
                  <div className="flex justify-between items-center text-[#d5c4b4]/70">
                    <span>Effective Year:</span>
                    <span className="text-[#f9f6f2]">2026</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#38281d] text-center">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-sans font-medium text-[#d5c4b4]/70">
                  <FileText className="w-3.5 h-3.5 text-[#dfc471]" />
                  <span>Public Record &bull; Legal Compliance</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
