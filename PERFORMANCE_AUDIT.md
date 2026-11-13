# COMPREHENSIVE PERFORMANCE & ARCHITECTURE AUDIT
## Project: Seth And Sons DryFruits (Jammu)
**Date:** November 13, 2026  
**Auditor:** Senior Frontend Performance Engineer & Web Performance Specialist  
**Target:** Mobile Performance 90–100 | Desktop Performance 95–100  

---

## 1. Application Architecture

- **Frontend Framework:** React 19.0.1 with React DOM 19.0.1
- **Language:** TypeScript 7.0.2 / TSX
- **Build Tool & Bundler:** Vite 8.3.6 with `@tailwindcss/vite` 4.3.3 and `@vitejs/plugin-react` 6.1.1
- **Backend Framework:** Express 4.21.2 on Node.js (with Vercel Serverless Function adapter in `api/index.ts`)
- **Routing Architecture:** `react-router-dom` 7.18.5 (client-side SPA routing). Currently, **all storefront and admin routes are synchronously imported in `src/App.tsx`**.
- **State Management:** React Context (`AuthContext`) handling session user, products, categories, public settings, and branding.
- **API Architecture:** REST API mounted at `/api` (`/api/products`, `/api/categories`, `/api/settings/public`, `/api/auth/*`, `/api/orders/*`, `/api/admin/*`).
- **Database:** MongoDB 9.x via Mongoose 9.12.1 with in-memory fallback for testing.
- **Image Storage & Delivery:** Local `/public/assets` and `/public/uploads`, with Cloudinary integration for admin media uploads.
- **Video Storage & Delivery:** Direct MP4 videos served from `/public/assets/aistudio/` and `/public/assets/asulesh_seth_intro.mp4`.
- **CSS Architecture:** Tailwind CSS v4 (`@tailwindcss/vite` + `@theme` directive in `src/index.css`).
- **Animation Libraries:** GSAP 3.15.1 (`ScrollTrigger`), Motion 12.23.24 (`motion/react`), `canvas-confetti`.
- **Deployment Configuration:** Vercel (`vercel.json`), static SPA fallback with `/api` serverless rewrites.
- **PDF & Data Heavyweights:** `@embedpdf/viewer-react` 3.1.0 (bundles PDFium WebAssembly + Web Workers), `exceljs` 4.4.0, `pdfkit` 0.20.2, `recharts` 3.10.1.

---

## 2. Identified Performance Bottlenecks

### Bottleneck A: Over 47 MB of Uncached, Eagerly Preloaded Video Assets
- Total video payload on disk: **47.9 MB** across 10 MP4 files.
- `src/components/HeroVideo.tsx` renders **two simultaneous `<video>` elements** with `preload="auto"` and `autoplay` without any poster image or responsive video checks.
- Standby player B immediately attempts to download the next 5–7 MB video concurrently with player A's 5.3 MB video.
- `src/components/HarvestVideoShowcase.tsx` renders below the fold (Section 4), yet has `autoPlay` without `preload="none"` or viewport intersection observation. On mobile, this saturates the network bandwidth with multiple concurrent multi-megabyte video streams on initial page load.

### Bottleneck B: Monolithic JavaScript Bundle (4.02 MB uncompressed / 1.07 MB gzip)
- `src/App.tsx` imports all 18+ heavy admin pages (`AdminDashboard`, `AdminReports`, `AdminOrders`, `AdminProducts`, etc.) statically.
- Admin PDF viewer (`@embedpdf/viewer-react`) brings in **7.88 MB of WebAssembly** (`embedpdf-WCTppm89.wasm`) and 1.63 MB worker scripts into the client bundle graph.
- Data export libraries (`exceljs`, `pdfkit`) and charting (`recharts`) are included in the bundle loaded by regular storefront visitors.
- Unused JavaScript on initial mobile load is estimated at ~715 KB out of 961 KB transfer size.

### Bottleneck C: Render-Blocking Google Fonts Chain (~510 ms latency)
- `index.html` loads 5 distinct Google Font families with over 20 weights in a single render-blocking `<link rel="stylesheet">`:
  - `Cinzel` (400, 600, 700, 800)
  - `Cormorant Garamond` (regular & italic 400, 600, 700)
  - `Inter` (400, 500, 600, 700) — *only used in admin*
  - `Playfair Display` (regular & italic 500, 600, 700) — *only used in admin*
  - `Plus Jakarta Sans` (300, 400, 500, 600, 700)
- The browser must resolve DNS, perform TLS handshake, fetch the stylesheet, and download font files before the first frame can render, directly inflating FCP (6.1s) and LCP (11.0s).

### Bottleneck D: Oversized Brand Logo & Unoptimized Product Images
- `/assets/seth_and_sons_logo.jpg` is **1024 × 1024 pixels, 389.4 KB**, but displayed at **48 × 48 px** (mobile) and **72 × 72 px** (desktop) inside `AnimatedLogo.tsx` and `Navbar.tsx`.
- Product images (`akhrot.jpg`, `badam.jpg`, `kaju.jpg`, `kishmish.jpg`, `pista.jpg`, `hero_poster.jpg`) are raw JPEGs/PNGs (200 KB – 2.1 MB each) without WebP/AVIF versions, responsive `srcset`, or explicit aspect ratios.
- Missing `fetchpriority="high"` on the hero LCP element causes the browser to defer LCP image scheduling.

### Bottleneck E: Duplicate API Requests & Cold Start Waterfall
- `AuthContext.tsx` on mount fires 5 independent requests: `/api/auth/me`, `/api/products`, `/api/categories`, `/api/settings/public`, `/api/auth/config`.
- None of `/api/products`, `/api/categories`, or `/api/settings/public` include `Cache-Control` response headers.
- On Vercel, each request triggers serverless execution, and failure retries add 800ms, 1500ms, and 2500ms delays.

### Bottleneck F: Invalid robots.txt and Missing sitemap.xml
- `public/robots.txt` and `public/sitemap.xml` do not exist.
- `vercel.json` rewrites `/(.*)` to `/index.html`, returning full SPA HTML for `/robots.txt`, triggering 23 syntax errors in Lighthouse SEO audits.

### Bottleneck G: Accessibility Contrast, Hit Targets & Labels
- Small hit targets (< 48px) on mobile menu toggles, video chapter pills, and footer links.
- Icon-only buttons lack descriptive `aria-label`s.
- Low contrast text elements on dark brown backgrounds (`#d5c4b4` on `#0d0805` in certain lighting conditions).

---

## 3. Inventory of Media Assets

### Video Assets
| Filename | Disk Size | Format | Resolution | Location | Initial Load Behavior | Optimization Plan |
|---|---|---|---|---|---|---|
| `Harvesting_and_packaging_dry_fruits_eea79562_t1.3-8_1080p_9a241cbd.mp4` | 7.28 MB | MP4 | 1080p | `HeroVideo.tsx` (item 1) | Eagerly preloaded on standby player B | Set `preload="none"`, load on demand, WebM conversion |
| `Dry_fruits_bowl_showcase_49c88bee_1080p_faf9591c.mp4` | 6.36 MB | MP4 | 1080p | `HeroVideo.tsx` (item 2) | Eagerly queued | Set `preload="none"`, load on demand |
| `Woman_extracting_walnut_oil_8b2a505d_1080p_24231ea9.mp4` | 5.74 MB | MP4 | 1080p | `HarvestVideoShowcase.tsx` | Auto-downloaded below the fold | Defer until visible via IntersectionObserver |
| `Woman_picking_dry_fruits_777f06bb_1080p_747221ce.mp4` | 5.31 MB | MP4 | 1080p | `HeroVideo.tsx` (item 0) | AutoPlay immediately on player A | Add poster image, optimize bitrate, lazy load player B |
| `Hands_breaking_open_almond_shell_3ad2cbb9_1080p__1__6660677c.mp4` | 4.88 MB | MP4 | 1080p | `HarvestVideoShowcase.tsx` | Auto-downloaded below the fold | Defer until visible |
| `Woman_snapping_cashew_nut_in_5a14ce7f_1080p_42b55562.mp4` | 4.65 MB | MP4 | 1080p | `HarvestVideoShowcase.tsx` | Auto-downloaded below the fold | Defer until visible |
| `Woman_picking_saffron_threads_42f4b7c7_1080p_6edfd21a.mp4` | 4.54 MB | MP4 | 1080p | `HarvestVideoShowcase.tsx` | Auto-downloaded below the fold | Defer until visible |
| `Woman_picking_green_raisins_1be94ac2_1080p_046a22e0.mp4` | 4.33 MB | MP4 | 1080p | `HarvestVideoShowcase.tsx` | Auto-downloaded below the fold | Defer until visible |
| `Woman_cracking_pistachio_shell_3f56c033_1080p_9ec43ffe.mp4` | 3.15 MB | MP4 | 1080p | `HarvestVideoShowcase.tsx` | Auto-downloaded below the fold | Defer until visible |
| `asulesh_seth_intro.mp4` | 1.67 MB | MP4 | 720p | Unreferenced | Not used | Retain as static asset |

### Top Image Assets
| Image Asset | Original Dimensions | Original Size | Displayed Size | Savings Potential |
|---|---|---|---|---|
| `public/assets/seth_and_sons_logo.jpg` | 1024 × 1024 px | 389.4 KB | 48 × 48 px / 72 × 72 px | ~380 KB (98% reduction) |
| `public/assets/products/hero_poster.jpg` | 1920 × 1080 px | 495.0 KB | Fullscreen | Convert to WebP (~90 KB) |
| `public/assets/products/badam_frame.jpg` | 1080 × 1080 px | 437.1 KB | 400 × 400 px | Convert to WebP (~65 KB) |
| `public/assets/products/akhrot_frame.jpg` | 1080 × 1080 px | 204.0 KB | 400 × 400 px | Convert to WebP (~50 KB) |
| `public/assets/products/kishmish_frame.jpg` | 1080 × 1080 px | 203.8 KB | 400 × 400 px | Convert to WebP (~48 KB) |
| `public/assets/products/pista_frame.jpg` | 1080 × 1080 px | 200.7 KB | 400 × 400 px | Convert to WebP (~46 KB) |
| `public/assets/products/kaju_frame.jpg` | 1080 × 1080 px | 195.0 KB | 400 × 400 px | Convert to WebP (~45 KB) |

---

## 4. Recommended Optimization Order

1. **Phase 1: Large Asset Optimization (Images & Videos)**
   - Generate optimized WebP versions of the logo (72px, 96px, 192px) and update all references.
   - Generate WebP versions of all product images and posters.
   - Refactor `HeroVideo.tsx`: Add high-quality WebP poster, remove `preload="auto"` on standby player B, lazy-load video on mobile or respect reduced-motion.
   - Refactor `HarvestVideoShowcase.tsx`: Implement IntersectionObserver so video is only loaded when scrolled near viewport; default to `preload="none"`.

2. **Phase 2: JavaScript Bundle Optimization & Route Code Splitting**
   - Refactor `src/App.tsx` with `React.lazy()` and `Suspense` for all admin routes, account routes, auth pages, catalog, custom order, and customer service.
   - Configure manual chunk splitting in `vite.config.ts` (`vendor-react`, `vendor-motion`, `vendor-icons`, `vendor-admin`).
   - Isolate `@embedpdf/viewer-react`, `pdfkit`, `exceljs`, and `recharts` so they only load inside admin chunks.

3. **Phase 3: LCP, FCP & Font Optimization**
   - Optimize Google Fonts loading in `index.html`: Preconnect, load critical weights with `display=swap`, asynchronously load secondary/admin fonts.
   - Preload critical LCP hero poster image.
   - Ensure the hero title and CTA elements render immediately without waiting for API calls.

4. **Phase 4: API Caching & Network Optimization**
   - Add HTTP `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600` headers to `/api/products`, `/api/categories`, and `/api/settings/public`.
   - Implement in-memory API caching with TTL in Express for public catalog endpoints.
   - Consolidate initial data fetching in `AuthContext` to prevent sequential waterfalls.

5. **Phase 5: Animation & Accessibility**
   - Use CSS composited properties (`transform`, `opacity`) instead of layout-triggering properties.
   - Fix all touch targets to ensure >= 44x44px clickable areas on mobile.
   - Add explicit `aria-label` to icon-only buttons.
   - Improve color contrast on key interactive and secondary elements.

6. **Phase 6: SEO & Deployment Hardening**
   - Add static `public/robots.txt` and `public/sitemap.xml`.
   - Update `vercel.json` with proper static caching headers (`Cache-Control: public, max-age=31536000, immutable` for `/assets/`).
   - Verify serverless rewrites and routes.

7. **Phase 7: Final Verification & Reporting**
   - Run production build (`npm run build`).
   - Run vitest test suite (`npm test`).
   - Measure bundle size reductions, network payload deltas, and document before-and-after metrics in `PERFORMANCE_REPORT.md`.

