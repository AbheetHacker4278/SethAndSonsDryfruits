import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Quote, Star, CheckCircle2 } from 'lucide-react';
import ScrollReveal from './ScrollReveal';

interface Testimonial {
  id: string;
  quote: string;
  author: string;
  role: string;
  location: string;
  purchasedProduct: string;
  rating: number;
  highlight: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    id: '1',
    quote:
      'We have sourced our festival gifting exclusively from the Seth family for over a decade. The Shell Mamara Badam crack open with an intoxicating almond oil richness that commercial vacuum pouches simply cannot mimic. Our patrons constantly ask for the origin.',
    author: 'Rajiv Singhania',
    role: 'Managing Director, Singhania Heritage Gems',
    location: 'New Delhi & Jammu',
    purchasedProduct: 'In-Shell Mamra Badam (15 kg Batch)',
    rating: 5,
    highlight: 'Unrivalled 50% Natural Oil Retention'
  },
  {
    id: '2',
    quote:
      'In high-end pastry and dessert formulation, saffron potency is everything. The Grade 1 Mongra from Seth And Sons DryFruits releases a deep royal crimson hue with just three strands, imparting a warm, authentic honey-hay fragrance without any bitter coloring agents.',
    author: 'Chef Sanjana Varma',
    role: 'Executive Pastry Chef & Chocolatier',
    location: 'Bandra, Mumbai',
    purchasedProduct: 'Kashmiri Mongra Saffron (25g Tin)',
    rating: 5,
    highlight: 'Pure Red Stigmas & Crocin Potency'
  },
  {
    id: '3',
    quote:
      'Finding walnuts that haven’t been chemically bleached with hydrogen peroxide is nearly impossible today. The Kishtwar halves from Seth And Sons DryFruits are light, buttery, and naturally sweet with zero acrid aftertaste. I recommend them to all my cardiac health patients.',
    author: 'Dr. Kabir Raina',
    role: 'Cardiologist & Preventive Wellness Director',
    location: 'Jammu & Chandigarh',
    purchasedProduct: 'Snow White Akhrot Kernels',
    rating: 5,
    highlight: '100% Unbleached Himalayan Halves'
  },
  {
    id: '4',
    quote:
      'The W-240 Cashews are extraordinarily uniform and dense. When roasted over low fire, they maintain their crisp snap without disintegrating. Their concierge service on WhatsApp confirmed batch dispatch within two hours.',
    author: 'Meenakshi & Alok Dewan',
    role: 'Private Connoisseurs & Longtime Patrons',
    location: 'Vasant Vihar, New Delhi',
    purchasedProduct: 'Signature King Kaju & Earthen Pista',
    rating: 5,
    highlight: 'Consistent Jumbo Grade Quality'
  }
];

export default function ClientTestimonials() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0); // -1 for left, 1 for right
  const [isPaused, setIsPaused] = useState(false);

  const total = TESTIMONIALS.length;

  const nextTestimonial = useCallback(() => {
    setDirection(1);
    setCurrentIndex((prev) => (prev + 1) % total);
  }, [total]);

  const prevTestimonial = useCallback(() => {
    setDirection(-1);
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  // Autoplay timer with pause on user hover
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      nextTestimonial();
    }, 7000);
    return () => clearInterval(interval);
  }, [isPaused, nextTestimonial]);

  const current = TESTIMONIALS[currentIndex];

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 40 : -40,
      opacity: 0,
      scale: 0.98
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1] as const
      }
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -40 : 40,
      opacity: 0,
      scale: 0.98,
      transition: {
        duration: 0.35,
        ease: [0.16, 1, 0.3, 1] as const
      }
    })
  };

  return (
    <section
      id="testimonials"
      className="relative py-28 sm:py-36 bg-[#120c08] text-[#ede4dc] overflow-hidden border-t border-[#38281d]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Subtle ambient lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[450px] bg-[#dfc471]/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <ScrollReveal>
          <div className="text-center max-w-2xl mx-auto mb-16 sm:mb-20">
            <div className="inline-flex items-center gap-2 text-xs font-sans font-medium tracking-[0.25em] uppercase text-[#dfc471] mb-3">
              <Quote className="w-3.5 h-3.5" />
              <span>Patron Testimonials</span>
            </div>

            <h2 className="font-serif text-3xl sm:text-5xl font-normal text-[#f9f6f2] tracking-tight">
              Words From Our Discerning Patrons
            </h2>

            <p className="mt-4 text-base text-[#d5c4b4]/80 font-sans leading-relaxed">
              Decades of trust, authentic terroir, and artisanal hand-grading have earned Seth And Sons DryFruits an enduring place in India’s finest residences and culinary institutions.
            </p>
          </div>
        </ScrollReveal>

        {/* Minimalist Luxury Carousel Card */}
        <div className="relative bg-[#17100b] border border-[#38281d] rounded-3xl p-8 sm:p-14 shadow-2xl overflow-hidden min-h-[380px] flex flex-col justify-between">
          {/* Subtle Corner Watermark Icon */}
          <div className="absolute top-6 right-8 text-[#dfc471]/10 pointer-events-none select-none">
            <Quote className="w-24 h-24" />
          </div>

          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={current.id}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="flex flex-col justify-between flex-grow"
            >
              <div>
                {/* Rating Stars & Verified Sourcing Note */}
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-1 text-[#dfc471]">
                    {[...Array(current.rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-current" />
                    ))}
                  </div>

                  <div className="inline-flex items-center gap-1.5 text-xs text-[#ecdda7] bg-[#251a13] border border-[#38281d] px-3 py-1 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{current.highlight}</span>
                  </div>
                </div>

                {/* Testimonial Quote */}
                <blockquote className="font-serif text-xl sm:text-2xl md:text-3xl text-[#f9f6f2] font-normal leading-relaxed text-balance">
                  "{current.quote}"
                </blockquote>
              </div>

              {/* Author Attribution & Purchased Item */}
              <div className="mt-8 pt-6 border-t border-[#2a1b12] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-serif text-lg font-semibold text-[#f9f6f2]">
                    {current.author}
                  </h4>
                  <p className="text-xs text-[#ede4dc]/90 font-sans">
                    {current.role} • <span className="text-[#ede4dc]">{current.location}</span>
                  </p>
                </div>

                <div className="text-left sm:text-right text-xs">
                  <span className="text-[#ede4dc]/70 uppercase tracking-wider block text-[10px]">
                    Verified Batch Selection
                  </span>
                  <span className="text-[#dfc471] font-medium font-sans">
                    {current.purchasedProduct}
                  </span>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Carousel Navigation Bar (Bottom Controls) */}
          <div className="mt-8 pt-6 border-t border-[#251a13] flex items-center justify-between">
            {/* Step Indicators */}
            <div className="flex items-center gap-1">
              {TESTIMONIALS.map((t, idx) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setDirection(idx > currentIndex ? 1 : -1);
                    setCurrentIndex(idx);
                  }}
                  className="py-2.5 px-1 cursor-pointer flex items-center justify-center min-h-[44px]"
                  aria-label={`Go to testimonial slide ${idx + 1}`}
                >
                  <span
                    className={`h-1.5 rounded-full transition-all duration-300 block ${
                      currentIndex === idx
                        ? 'w-8 bg-[#dfc471]'
                        : 'w-2 bg-[#38281d] hover:bg-[#d5c4b4]/40'
                    }`}
                  />
                </button>
              ))}
              <span className="ml-3 text-xs text-[#ede4dc]/80 font-sans tabular-nums">
                0{currentIndex + 1} / 0{total}
              </span>
            </div>

            {/* Next / Prev Directional Buttons */}
            <div className="flex items-center gap-2.5">
              <button
                onClick={prevTestimonial}
                className="w-11 h-11 rounded-full bg-[#251a13] hover:bg-[#dfc471] text-[#ede4dc] hover:text-[#0d0805] border border-[#38281d] hover:border-[#dfc471] flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Previous testimonial"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                onClick={nextTestimonial}
                className="w-11 h-11 rounded-full bg-[#251a13] hover:bg-[#dfc471] text-[#ede4dc] hover:text-[#0d0805] border border-[#38281d] hover:border-[#dfc471] flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Next testimonial"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
