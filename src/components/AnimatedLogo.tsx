import { motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';

interface AnimatedLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  className?: string;
}

export default function AnimatedLogo({
  size = 'md',
  showSubtitle = true,
  className = ''
}: AnimatedLogoProps) {
  const { publicSettings } = useAuth();
  const rawLogo = publicSettings?.website?.logoUrl || '/assets/seth_and_sons_logo-96.webp';
  const logoSrc = rawLogo.endsWith('seth_and_sons_logo.jpg')
    ? '/assets/seth_and_sons_logo-96.webp'
    : rawLogo;
  const isDefaultLogo = logoSrc.includes('seth_and_sons_logo');
  const brandAlt = publicSettings?.website?.brandName || 'Seth And Sons DryFruits';
  // Circular medallion dimensions tailored for mobile, tablet, and desktop
  const sizeClasses = {
    sm: 'h-9 w-9',
    md: 'h-11 w-11 sm:h-12 sm:w-12',
    lg: 'h-20 w-20 sm:h-24 sm:w-24',
  };
  const pixelDims = {
    sm: 36,
    md: 48,
    lg: 96,
  };

  return (
    <div className={`flex flex-col items-start group cursor-pointer select-none ${className}`}>
      {/* Official Emblem Cartouche Logo with Golden Aura */}
      <motion.div
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
        className="relative flex items-center justify-center transition-all duration-300"
      >
        {/* Subtle ambient golden backglow on hover */}
        <div className="absolute -inset-1 bg-gradient-to-r from-[#dfc471]/0 via-[#dfc471]/25 to-[#dfc471]/0 rounded-full blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

        <img
          src={logoSrc}
          srcSet={
            isDefaultLogo
              ? '/assets/seth_and_sons_logo-96.webp 96w, /assets/seth_and_sons_logo-192.webp 192w'
              : undefined
          }
          sizes={isDefaultLogo ? '(max-width: 640px) 48px, 96px' : undefined}
          alt={brandAlt}
          width={pixelDims[size]}
          height={pixelDims[size]}
          className={`${sizeClasses[size]} rounded-full object-cover border border-[#dfc471]/40 transition-transform duration-300 drop-shadow-[0_4px_14px_rgba(0,0,0,0.85)] group-hover:brightness-105`}
          loading="eager"
          decoding="async"
        />
      </motion.div>

      {/* Optional Jammu Provenance Tagline (used predominantly in footer / large views) */}
      {showSubtitle && size === 'lg' && (
        <span className="mt-2 text-[10px] sm:text-[20px] tracking-[0.25em] text-[#dfc471] uppercase font-sans font-semibold pl-1">
          Seth And Sons Dryfruits
        </span>
      )}
    </div>
  );
}
