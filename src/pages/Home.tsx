import { Link } from 'react-router-dom';
import { LifeBuoy, ArrowRight } from 'lucide-react';
import HeroVideo from '../components/HeroVideo';
import ParallaxSection from '../components/ParallaxSection';
import ProductShowcase from '../components/ProductShowcase';
import HarvestVideoShowcase from '../components/HarvestVideoShowcase';
import BrandStory from '../components/BrandStory';
import WhyChooseUs from '../components/WhyChooseUs';
import ClientTestimonials from '../components/ClientTestimonials';
import { useAuth } from '../context/AuthContext';

interface HomeProps {
  onNavigateToRequest: (productId?: string) => void;
  onNavigateToCatalog: () => void;
}

export default function Home({ onNavigateToRequest, onNavigateToCatalog }: HomeProps) {
  const { products, publicSettings } = useAuth();
  const featuredIds = publicSettings?.website?.featuredProductIds || [];
  const orderedProducts =
    featuredIds.length > 0
      ? [
          ...featuredIds
            .map(id => products.find(p => p.id === id))
            .filter((p): p is NonNullable<typeof p> => Boolean(p)),
          ...products.filter(p => !featuredIds.includes(p.id)),
        ]
      : products;
  const activePromos = (publicSettings?.website?.promotionalSections || []).filter(
    s => s.active && (s.title || s.subtitle)
  );

  const handleScrollToCollection = () => {
    const el = document.getElementById('collection');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="w-full bg-[#0d0805] text-[#ede4dc] selection:bg-[#dfc471] selection:text-[#0d0805]">
      {/* 1. Hero Section with provided video synced with scroll */}
      <HeroVideo
        onExplore={handleScrollToCollection}
        onRequestOrder={() => onNavigateToRequest()}
      />

      {activePromos.length > 0 && (
        <section className="bg-[#150d09] border-y border-[#38281d] py-5 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-4 text-center sm:text-left">
            {activePromos.slice(0, 2).map((promo, i) => (
              <div key={i} className="px-4 py-1">
                <div className="text-xs uppercase tracking-[0.2em] text-[#dfc471] font-semibold">
                  {promo.title}
                </div>
                {promo.subtitle && (
                  <p className="text-xs text-[#d5c4b4]/85 mt-0.5">{promo.subtitle}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 2. Parallax Depth Feature Showcase with GSAP: Top Selling Product */}
      <ParallaxSection
        onRequestPurchase={(productId) => onNavigateToRequest(productId)}
      />

      {/* 3. Product Collection with authentic photography and ScrollReveal */}
      <ProductShowcase
        products={orderedProducts}
        onRequestPurchase={(productId) => onNavigateToRequest(productId)}
        onViewCatalog={onNavigateToCatalog}
      />

      {/* 4. Artisanal Harvest Motion Reels: High-definition craft & texture cinema */}
      <HarvestVideoShowcase
        onRequestPurchase={(productId) => onNavigateToRequest(productId)}
        onViewCatalog={() => onNavigateToCatalog()}
      />

      {/* 5. Brand Story: Three generations of Seth family grading */}
      <BrandStory />

      {/* 6. Why Choose Us: 6 Core Pillars */}
      <WhyChooseUs />

      {/* 7. Client Testimonials: Authentic patron reviews with minimalist carousel */}
      <ClientTestimonials />

      {/* 8. Customer Service Desk Callout */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-[#251a13] bg-gradient-to-b from-[#0d0805] to-[#130c08]">
        <div className="max-w-5xl mx-auto rounded-3xl bg-[#150d09] border border-[#38281d] p-8 sm:p-10 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[#dfc471] font-semibold">
              <LifeBuoy className="w-4 h-4" />
              <span>Jammu Patron Concierge</span>
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl text-[#f9f6f2]">
              Need Help With an Order, Delivery, or Batch Quality?
            </h2>
            <p className="text-xs sm:text-sm text-[#d5c4b4]/80 max-w-2xl">
              Submit complaints, attach PDFs, photos, or supporting documents (up to 5 files, 5 MB each), track live resolution status, and receive direct concierge email updates.
            </p>
          </div>
          <Link
            to="/customer-service"
            className="shrink-0 inline-flex items-center gap-2.5 px-7 py-4 rounded-full text-xs sm:text-sm font-bold tracking-wider uppercase bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] hover:brightness-110 shadow-xl transition-all"
          >
            <LifeBuoy className="w-4 h-4" />
            <span>Customer Service</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
