import { Product } from '../types/product';
import ProductCard from './ProductCard';
import ScrollReveal from './ScrollReveal';

interface ProductShowcaseProps {
  products: Product[];
  onRequestPurchase: (productId: string) => void;
}

export default function ProductShowcase({ products, onRequestPurchase }: ProductShowcaseProps) {
  return (
    <section id="collection" className="relative py-24 sm:py-32 bg-[#0d0805] text-[#ede4dc] overflow-hidden">
      {/* Decorative ambient backdrop */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-[#38281d]/20 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header with ScrollReveal */}
        <ScrollReveal>
          <div className="max-w-3xl mb-16 sm:mb-20">
            <div className="inline-flex items-center gap-2 text-xs font-sans font-medium tracking-[0.25em] uppercase text-[#dfc471] mb-3">
              <span>Seth And Sons DryFruits • Jammu Provenance</span>
              <span aria-hidden="true">·</span>
              <span>Hand-Graded Batches</span>
            </div>

            <h2 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-normal text-[#f9f6f2] tracking-tight leading-tight">
              Curated For The Discerning Palate.
            </h2>

            <p className="mt-5 text-base sm:text-lg text-[#d5c4b4]/80 font-sans leading-relaxed">
              Every harvest is sourced directly through our family channels in Jammu & Kashmir. Slow-cured in traditional earthen cellars, unadulterated, and packed fresh for true nutritional vitality.
            </p>
          </div>
        </ScrollReveal>

        {/* 3-Column Luxury Product Grid with ScrollReveal Animations */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-9">
          {products.map((product, index) => (
            <ScrollReveal
              key={product.id}
              delay={(index % 3) * 0.12}
              direction="up"
              distance={40}
            >
              <ProductCard
                product={product}
                onRequestPurchase={onRequestPurchase}
                index={index}
              />
            </ScrollReveal>
          ))}
        </div>

        {/* Reassurance banner below collection with ScrollReveal */}
        <ScrollReveal delay={0.2} className="mt-16">
          <div className="p-6 sm:p-8 rounded-2xl bg-[#150d09]/60 border border-[#38281d] flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h4 className="font-serif text-xl text-[#f9f6f2]">
                Looking for Bespoke Gifting or Corporate Hampers from Jammu?
              </h4>
              <p className="mt-1 text-sm text-[#d5c4b4]/70">
                Custom velvet boxes, gold foiling, and customized assorted batches curated by Seth And Sons DryFruits.
              </p>
            </div>
            <button
              onClick={() => onRequestPurchase('kaju')}
              className="shrink-0 px-6 py-3 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#251a13] hover:bg-[#dfc471] text-[#ede4dc] hover:text-[#0d0805] border border-[#dfc471]/40 transition-colors cursor-pointer"
            >
              Custom Order Inquiries
            </button>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
