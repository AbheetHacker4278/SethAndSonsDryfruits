export interface VideoDetails {
  videoUrl: string;
  actionTitle: string;
  craftProcess: string;
  sensoryQuality: string;
  harvestPillar: string;
  durationLabel: string;
}

export interface ProductWeightVariant {
  id: string;
  productId: string;
  weightLabel: string;
  sku: string;
  purchasePrice?: number;
  sellingPrice: number;
  discountPrice?: number | null;
  stock: number;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  hindiName?: string;
  subtitle: string;
  sku?: string;
  price: number;
  discountPrice?: number | null;
  stock?: number;
  unit: 'kg' | 'gram' | 'ml' | 'piece';
  weightLabel?: string;
  step: number;
  minQty: number;
  categoryId?: string;
  categoryName?: string;
  image: string;
  images?: string[];
  gallery?: string[];
  fallbackImage?: string;
  videoUrl?: string;
  videoDetails?: VideoDetails;
  description: string;
  origin: string;
  grade: string;
  features: string[];
  tasteProfile: string;
  variants?: string[];
  weightVariants?: ProductWeightVariant[];
  status?: 'draft' | 'published';
}

export interface HealthPillar {
  title: string;
  desc: string;
}

export interface NutritionInfo {
  calories: string;
  protein: string;
  keyNutrient: string;
  minerals: string;
  healthPillars: HealthPillar[];
}

export interface CatalogProduct extends Product {
  category: 'nuts' | 'saffron' | 'dried-fruits';
  jammuStory: string;
  inStock: boolean;
  harvestSeason: string;
  nutrition: NutritionInfo;
}

/**
 * Parse weight or volume strings like '250g', '500gm', '1kg', '100ml', '1L', or '500g Vacuum Tin'
 * into their gram / ml base equivalent.
 */
export function parseWeightGrams(weightLabel: string): number | null {
  if (!weightLabel) return null;
  const cleaned = weightLabel.trim().toLowerCase();
  const kgMatch = cleaned.match(/([\d.]+)\s*(?:kg|kilogram|kilograms|l|liter|liters|litre|litres)\b/);
  if (kgMatch) return Math.round(parseFloat(kgMatch[1]) * 1000);
  const gmMatch = cleaned.match(/([\d.]+)\s*(?:g|gm|gms|gram|grams|ml|milliliter|milliliters)\b/);
  if (gmMatch) return Math.round(parseFloat(gmMatch[1]));
  return null;
}

/**
 * Parse piece count labels like '1 Piece' or '2 Pieces'.
 */
export function parsePackPieces(weightLabel: string): number {
  if (!weightLabel) return 1;
  const m = weightLabel.trim().toLowerCase().match(/([\d.]+)/);
  return m ? Math.max(1, Math.round(parseFloat(m[1]))) : 1;
}

/**
 * Convert a pack weight/volume label into base stock units
 * (kg for 'kg' products, grams for 'gram' products, ml for 'ml' products, piece count for 'piece').
 */
export function getVariantStockUnits(weightLabel: string, baseUnit: 'kg' | 'gram' | 'ml' | 'piece'): number {
  if (baseUnit === 'piece') {
    return parsePackPieces(weightLabel);
  }
  const gramsOrMl = parseWeightGrams(weightLabel);
  if (gramsOrMl === null || gramsOrMl <= 0) return 1;
  return baseUnit === 'kg' ? Number((gramsOrMl / 1000).toFixed(4)) : gramsOrMl;
}

/**
 * Return true if the product/order item is Kesar / Saffron (exempt from shipping charges).
 */
export function isKesarProduct(item: {
  productId?: string | null;
  id?: string | null;
  productName?: string | null;
  name?: string | null;
}): boolean {
  const pid = String(item.productId || item.id || '').trim().toLowerCase();
  const pname = String(item.productName || item.name || '').trim().toLowerCase();
  if (pid === 'kesar' || pid === 'kesar-flower-1gm' || pid === 'kesar-petal-1gm') {
    return true;
  }
  if (
    (pname.includes('kesar') || pname.includes('saffron')) &&
    !pname.includes('badam') &&
    !pname.includes('honey') &&
    !pname.includes('soap') &&
    !pname.includes('cream') &&
    !pname.includes('scrub') &&
    !pname.includes('attar')
  ) {
    return true;
  }
  return false;
}

/**
 * Calculate order/cart shipping charge:
 * - ₹0 for empty carts, custom orders, or orders >= freeThreshold (default ₹5,000)
 * - ₹0 when every item in the order is Kesar / Saffron
 * - Otherwise defaultShippingCharge (default ₹120)
 */
export function calculateOrderShippingCharge(
  items: Array<{
    productId?: string | null;
    id?: string | null;
    productName?: string | null;
    name?: string | null;
  }>,
  netAfterDiscount: number,
  options?: {
    freeThreshold?: number;
    defaultShippingCharge?: number;
    orderType?: string;
  }
): number {
  if (!items || items.length === 0 || netAfterDiscount <= 0) return 0;
  if (options?.orderType === 'custom') return 0;

  const freeThreshold =
    typeof options?.freeThreshold === 'number' && Number.isFinite(options.freeThreshold)
      ? options.freeThreshold
      : 5000;
  const defaultFee =
    typeof options?.defaultShippingCharge === 'number' && Number.isFinite(options.defaultShippingCharge)
      ? options.defaultShippingCharge
      : 120;

  if (netAfterDiscount >= freeThreshold) return 0;

  const hasNonKesar = items.some(item => !isKesarProduct(item));
  if (!hasNonKesar) return 0;

  return defaultFee;
}

export const PRODUCTS_SEED: CatalogProduct[] = [
  {
    id: 'kaju',
    name: 'Kaju (Cashews)',
    hindiName: 'काजू',
    subtitle: 'King Size W-240 Premium Whole Cashews',
    price: 1372,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
    gallery: [
      '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
      '/assets/aistudio/0c5b509ff023313602180c5dd8a5582e_aad82011.jpg',
      '/assets/aistudio/87b2fabb1a3b7a90b1cbda1ffd5b7b64_1e575e9f.jpg'
    ],
    fallbackImage: '/assets/aistudio/0c5b509ff023313602180c5dd8a5582e_aad82011.jpg',
    videoUrl: '/assets/aistudio/Woman_snapping_cashew_nut_in_5a14ce7f_1080p_42b55562.mp4',
    videoDetails: {
      videoUrl: '/assets/aistudio/Woman_snapping_cashew_nut_in_5a14ce7f_1080p_42b55562.mp4',
      actionTitle: 'The Clean Crisp Snap of Jumbo W-240 Cashews',
      craftProcess: 'Graded by size and curvature in Jammu curing cellars. Snapped by hand to verify kernel density, zero hollow internal core, and complete absence of chemical oil-frying or sulfur bleaching.',
      sensoryQuality: 'Audible crisp fracture, pure ivory-white cross section, buttery natural sweetness, and silky cashew milk finish.',
      harvestPillar: 'Jumbo W-240 • Zero Chemical Bleach • Hand-Inspected Density',
      durationLabel: '0:09 • 1080p Macro Reel'
    },
    description: 'Creamy, ivory-white, whole hand-sorted kernels. Naturally sweet, dense in crunch, and packed with wholesome plant protein.',
    origin: 'Cured & Graded in Jammu Cellars',
    grade: 'Jumbo W-240 Whole Grade',
    features: ['Zero Preservatives', 'Slow Sundried', 'Naturally Sweet', 'Rich Buttery Texture'],
    variants: ['500g Vacuum Tin', '1kg Heritage Pouch', '2kg Family Reserve'],
    tasteProfile: 'Rich, buttery crunch with delicate natural sweetness',
    jammuStory: 'Brought to Jammu trading houses through decades-old artisan channels, these cashews undergo strict low-humidity curing in traditional cellars to lock in crispness.',
    inStock: true,
    harvestSeason: 'Spring Harvest',
    status: 'published',
    nutrition: {
      calories: '553 kcal / 100g',
      protein: '18.2g Plant Protein',
      keyNutrient: 'Healthy Monounsaturated Oleic Acid (75% of total fats)',
      minerals: 'Magnesium, Copper (100% RDA), Zinc & Phosphorus',
      healthPillars: [
        {
          title: 'Cardiovascular Vitality',
          desc: 'Abundant heart-healthy oleic acid aids in regulating optimal HDL cholesterol balance and arterial wellness.'
        },
        {
          title: 'Immune & Cellular Shield',
          desc: 'High concentration of bioavailable copper and zinc fortifies natural white blood cell and antioxidant enzymes.'
        },
        {
          title: 'Bone Matrix & Muscle Tone',
          desc: 'Supplies essential magnesium and phosphorus necessary for bone mineralization and soothing muscle tension.'
        }
      ]
    }
  },
  {
    id: 'badam',
    name: 'Shell Mamara Badam',
    hindiName: 'मामरा बादाम',
    subtitle: 'Authentic In-Shell High Oil Almonds',
    price: 1106,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: '/assets/aistudio/2a3c89dd1edf49b4c54431c043fd7a29_4031e226.jpg',
    gallery: [
      '/assets/aistudio/2a3c89dd1edf49b4c54431c043fd7a29_4031e226.jpg',
      '/assets/aistudio/34434d3d3a97bcca377e213f287b7e39_953b7ccf.jpg',
      '/assets/aistudio/bbad228edecb39d89fad29895a9ff2fa_05d4de78.jpg',
      '/assets/aistudio/bd6535fe461ca69a667833aa44863365_303f8cf4.jpg'
    ],
    fallbackImage: '/assets/aistudio/bbad228edecb39d89fad29895a9ff2fa_05d4de78.jpg',
    videoUrl: '/assets/aistudio/Hands_breaking_open_almond_shell_3ad2cbb9_1080p__1__6660677c.mp4',
    videoDetails: {
      videoUrl: '/assets/aistudio/Hands_breaking_open_almond_shell_3ad2cbb9_1080p__1__6660677c.mp4',
      actionTitle: 'Hand-Cracking In-Shell High-Oil Mamra Almonds',
      craftProcess: 'Cracked by hand directly before consumption. The delicate paper-thin outer shell acts as nature\'s airtight vacuum seal, preserving the 50% unrefined natural almond oil from light and oxidation.',
      sensoryQuality: 'Distinct concave kernel, rich earthen nutty fragrance, glistening natural oil sheen, and profound cognitive vitality.',
      harvestPillar: 'Pir Panjal Terraces • ~50% Natural Oil Retention • Untainted Shell Guard',
      durationLabel: '0:10 • 1080p Macro Reel'
    },
    description: 'Treasured for their high natural almond oil concentration (up to 50%) and distinct concave shape. Cracking them fresh yields unrivalled nutritive vitality.',
    origin: 'Jammu & Kashmir Highland Terraces',
    grade: 'A++ Organic Shell Mamra',
    features: ['High Natural Oil Content', 'Brain-Food Vitality', 'Sun-cured Shell Protection', 'Distinct Royal Aroma'],
    variants: ['500g Paper-Shell Pack', '1kg Royal Kraft Box', '2kg Heritage Reserve'],
    tasteProfile: 'Intense earthy sweetness with nutty, aromatic finish',
    jammuStory: 'Cultivated in the mineral-rich terraces along the Pir Panjal range in Jammu & Kashmir. The natural protective shell keeps the cold-pressed almond oil inside completely untainted.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '579 kcal / 100g',
      protein: '21.2g Complete Plant Protein',
      keyNutrient: '~50% Pure Natural Almond Oil Content (Double normal almonds)',
      minerals: 'Vitamin E (Alpha-tocopherol), Riboflavin, Calcium & Magnesium',
      healthPillars: [
        {
          title: 'Supreme Ayurvedic Brain Tonic',
          desc: 'High natural concentrations of L-Carnitine and Riboflavin stimulate neural pathways, sharpening cognitive retention.'
        },
        {
          title: 'Cellular Anti-Aging & Skin Radiance',
          desc: 'Abundant natural Vitamin E protects cell walls from oxidative degradation, nourishing dermal elasticity.'
        },
        {
          title: 'Metabolic Stamina & Glycemic Balance',
          desc: 'Slow-burning natural oils provide sustained daily endurance without triggering blood sugar spikes.'
        }
      ]
    }
  },
  {
    id: 'kishmish',
    name: 'Kishmish (Raisins)',
    hindiName: 'किशमिश',
    subtitle: 'Golden Long-Grain & Green Shade-Cured Raisins',
    price: 644,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: '/assets/aistudio/295190b67948ef58902b7efe5b0311a0_8daf8c64.jpg',
    gallery: [
      '/assets/aistudio/295190b67948ef58902b7efe5b0311a0_8daf8c64.jpg',
      '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg'
    ],
    fallbackImage: '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg',
    videoUrl: '/assets/aistudio/Woman_picking_green_raisins_1be94ac2_1080p_046a22e0.mp4',
    videoDetails: {
      videoUrl: '/assets/aistudio/Woman_picking_green_raisins_1be94ac2_1080p_046a22e0.mp4',
      actionTitle: 'Hand-Selecting Shade-Cured Long Green Raisins',
      craftProcess: 'Slow-cured inside traditional earthen shade towers in Jammu. The grapes are never dipped in harsh caustic soda, preserving their delicate natural chlorophyll, supple skin elasticity, and concentrated nectar.',
      sensoryQuality: 'Translucent emerald-gold glow, luscious tender chew without gritty crystallization, and lingering honey-caramel finish.',
      harvestPillar: 'Traditional Earthen Shade Towers • Zero Sulfur Wash • High Bioavailable Iron',
      durationLabel: '0:09 • 1080p Macro Reel'
    },
    description: 'Juicy, seedless, sun-ripened grapes shade-dried in earthen chambers. Plump in texture with a vibrant natural burst of honey and molasses notes.',
    origin: 'Jammu Traditional Shade Chambers',
    grade: 'Export Grade Long Round',
    features: ['Naturally Sweetened by Sun', 'Rich in Iron & Antioxidants', 'Plump & Juicy', 'Zero Added Sugars'],
    variants: ['500g Shade-Cured Pack', '1kg Heritage Pouch'],
    tasteProfile: 'Lush caramel sweetness with gentle tangy undertones',
    jammuStory: 'Dried slowly inside cool earthen chambers built according to traditional Jammu storage wisdom, preserving juiciness without artificial sulfur baths.',
    inStock: true,
    harvestSeason: 'Late Summer',
    status: 'published',
    nutrition: {
      calories: '299 kcal / 100g',
      protein: '3.1g Dietary Protein',
      keyNutrient: 'Bioavailable Non-Heme Iron & Tartaric Acid',
      minerals: 'Dietary Iron (10% RDA), Potassium, Boron & Vitamin B6',
      healthPillars: [
        {
          title: 'Blood Hemoglobin Rebuilding',
          desc: 'High natural bioavailable iron and copper assist in hemoglobin synthesis, countering lethargy and fatigue.'
        },
        {
          title: 'Microbiome & Digestion Ease',
          desc: 'Natural insoluble fibers and fruit tartaric acid support gut peristalsis and wholesome digestive balance.'
        },
        {
          title: 'Joint Mobility & Bone Mineralization',
          desc: 'Rich in Boron, an essential trace element proven to aid calcium absorption and joint cartilage preservation.'
        }
      ]
    }
  },
  {
    id: 'akhrot',
    name: 'Akhrot (Walnuts)',
    hindiName: 'अखरोट गिरी',
    subtitle: 'Kashmiri Snow White Halves & Quarters',
    price: 756,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg',
    gallery: [
      '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg',
      '/assets/aistudio/667dd27b774d8f7b6a6757a89cf83530_cc6420ec.jpg',
      '/assets/aistudio/17d90ef69aa71ecdfc866b5ba1939d99_2bc7858f.jpg'
    ],
    fallbackImage: '/assets/aistudio/667dd27b774d8f7b6a6757a89cf83530_cc6420ec.jpg',
    videoUrl: '/assets/aistudio/Woman_extracting_walnut_oil_8b2a505d_1080p_24231ea9.mp4',
    videoDetails: {
      videoUrl: '/assets/aistudio/Woman_extracting_walnut_oil_8b2a505d_1080p_24231ea9.mp4',
      actionTitle: 'Cold Hand-Pressing Virgin Walnut Oil from Kishtwar Halves',
      craftProcess: 'Freshly de-shelled wild Kashmiri walnut halves pressed by hand over vintage brassware, revealing the pure stream of unrefined, golden plant Omega-3 ALA oil.',
      sensoryQuality: 'Luminous virgin oil droplets, tender buttery sweetness with zero bitter astringency, and profound cardiovascular nourishment.',
      harvestPillar: 'Chenab Valley Wild Trees • Cold Hand-Pressed • Unrivalled Omega-3 ALA',
      durationLabel: '0:10 • 1080p Macro Reel'
    },
    description: 'Freshly de-shelled light amber walnut kernels. High in heart-healthy Omega-3 ALA fatty acids, offering a smooth bite without harsh bitterness.',
    origin: 'Chenab Valley & Kishtwar Hills, Jammu',
    grade: 'Light Amber Whole Halves',
    features: ['High Omega-3 ALA', 'Light Tender Kernel', 'Zero Bleach or Chemical Dip', 'Crisp Earthen Crunch'],
    variants: ['500g Vacuum Pack', '1kg Kishtwar Halves'],
    tasteProfile: 'Smooth, earthy, and nutty with clean buttery finish',
    jammuStory: 'Gathered from wild-pollinated ancestral walnut trees flourishing on the steep slopes of Kishtwar and the Chenab Valley. Cracked by hand with zero chemical bleaching.',
    inStock: true,
    harvestSeason: 'Winter Harvest',
    status: 'published',
    nutrition: {
      calories: '654 kcal / 100g',
      protein: '15.2g Heart-Healthy Protein',
      keyNutrient: 'Plant Omega-3 ALA (9.1g / 100g — Highest of all tree nuts)',
      minerals: 'Alpha-Linolenic Acid, Bio-Melatonin, Polyphenols & Copper',
      healthPillars: [
        {
          title: 'Cardiovascular & Vascular Elasticity',
          desc: 'Exceptional concentrations of plant Omega-3 ALA promote supple artery walls and reduce circulating systemic markers.'
        },
        {
          title: 'Deep Restorative Sleep & Brain Guard',
          desc: 'Natural bio-identical melatonin combined with ellagitannins fosters restorative circadian rhythms and neural longevity.'
        },
        {
          title: 'Potent Free-Radical Scavenger',
          desc: 'Pedunculagin and ellagic acid polyphenols offer twice the antioxidant capacity of common market nuts.'
        }
      ]
    }
  },
  {
    id: 'pista',
    name: 'Pista (Pistachios)',
    hindiName: 'पिस्ता',
    subtitle: 'Jumbo Roasted & Lightly Earthen-Salted',
    price: 2352,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: '/assets/aistudio/3c576d7519d8f23898ea5fb9043bb2d7_9d2bc35a.jpg',
    gallery: [
      '/assets/aistudio/3c576d7519d8f23898ea5fb9043bb2d7_9d2bc35a.jpg',
      '/assets/aistudio/a7cf107bf9037d4e4b3ba1dd39eb7744_63394296.jpg',
      '/assets/aistudio/243ed5b76ca7198521c38d98f418c8bf_f5443d27.jpg'
    ],
    fallbackImage: '/assets/aistudio/a7cf107bf9037d4e4b3ba1dd39eb7744_63394296.jpg',
    videoUrl: '/assets/aistudio/Woman_cracking_pistachio_shell_3f56c033_1080p_9ec43ffe.mp4',
    videoDetails: {
      videoUrl: '/assets/aistudio/Woman_cracking_pistachio_shell_3f56c033_1080p_9ec43ffe.mp4',
      actionTitle: 'Unveiling Emerald-Core Smiling Pistachios',
      craftProcess: 'Naturally split "smiling" shells roasted slowly over low flame in seasoned copper vessels with fine Himalayan rock salt. Opened with gentle hand pressure to expose the intact, deep emerald-green core and royal violet outer skin.',
      sensoryQuality: 'Effortless shell release with crisp audible snap, savory wood-roasted aroma, velvety nutty crunch, and rich lutein eye-shield antioxidants.',
      harvestPillar: 'Wood-Fire Copper Roasted • Naturally Smiling Shells • Dense Lutein Antioxidants',
      durationLabel: '0:09 • 1080p Macro Reel'
    },
    description: 'Naturally smiling, open-mouth jumbo pistachio kernels with vibrant emerald hues and purple skins. Gently slow-roasted over low fire for ultimate crispness.',
    origin: 'Curated by Seth And Sons DryFruits, Jammu',
    grade: 'Jumbo 18/20 Count',
    features: ['Naturally Smiling Shells', 'Emerald-Green Cores', 'Fire Roasted Perfection', 'Fiber & Potassium Rich'],
    variants: ['500g Copper-Roasted Tin', '1kg Heritage Pack'],
    tasteProfile: 'Crisp savory snap followed by rich, pistachio essence',
    jammuStory: 'Inspected kernel-by-kernel by the Seth family in Jammu. Roasted slowly in small copper vessels over low wood fire to bring out the natural aromatic crunch.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '562 kcal / 100g',
      protein: '20.3g (All 9 Essential Amino Acids)',
      keyNutrient: 'Lutein & Zeaxanthin Carotenoids (Supreme among nuts)',
      minerals: 'Potassium (More per gram than bananas), Vitamin B6 & Thiamine',
      healthPillars: [
        {
          title: 'Macular Protection & Blue-Light Shield',
          desc: 'Rich in lutein and zeaxanthin pigments that concentrate directly in the retina, relieving modern digital eye strain.'
        },
        {
          title: 'Electrolyte Balance & Muscle Tone',
          desc: 'High potassium and magnesium ratios accelerate muscle recovery after exertion and maintain fluid balance.'
        },
        {
          title: 'Metabolic & Glycemic Balance',
          desc: 'High protein and dietary fiber density supports lean muscle maintenance and prevents energy crashes.'
        }
      ]
    }
  },
  {
    id: 'kesar',
    name: 'Kesar (Saffron)',
    hindiName: 'केसर',
    subtitle: 'Grade 1 Pure Kashmiri Mongra Saffron',
    price: 357,
    unit: 'gram',
    step: 1,
    minQty: 1,
    category: 'saffron',
    image: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    gallery: [
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
      '/assets/aistudio/93d2445d6a38107f8c920e727cd8baad_a01f1317.jpg',
      '/assets/aistudio/e0c5e8456a6b625467270cfd3d21bef1_a9d4af00.jpg'
    ],
    fallbackImage: '/assets/aistudio/93d2445d6a38107f8c920e727cd8baad_a01f1317.jpg',
    videoUrl: '/assets/aistudio/Woman_picking_saffron_threads_42f4b7c7_1080p_6edfd21a.mp4',
    videoDetails: {
      videoUrl: '/assets/aistudio/Woman_picking_saffron_threads_42f4b7c7_1080p_6edfd21a.mp4',
      actionTitle: 'Hand-Plucking First-Bloom Grade 1 Mongra Stigmas',
      craftProcess: 'Harvested strand-by-strand at dawn from wild purple autumn crocus flowers before the morning sun evaporates volatile safranal oils. Only the thickest tripartite crimson stigmas are gathered, discarding all pale yellow filler threads.',
      sensoryQuality: 'Deep royal crimson stigma color, intoxicating honey-hay fragrance, and instantaneous release of luminous golden-crimson dye when infused into warm water or milk.',
      harvestPillar: 'Pampore Plateau Harvest • 100% Pure Mongra Red Stigmas • High Crocin Lab Grade',
      durationLabel: '0:10 • 1080p Macro Reel'
    },
    description: 'The world\'s most prized spice. Pure deep-crimson Mongra stigmas harvested by hand in the misty dawn. Unrivalled in crocin potency and intoxicating aroma.',
    origin: 'Jammu & Kashmir Royal Saffron Belt',
    grade: 'Grade 1 Pure Mongra Stigmas',
    features: ['100% Mongra Pure Red Threads', 'No Yellow Style Threads', 'High Crocin Pigment Value', 'Lab Certified Purity'],
    variants: ['1g Glass Vial', '2g Velvet Box', '5g Royal Keepsake Jar'],
    tasteProfile: 'Ethereal honey-hay fragrance with rich golden crimson infusion',
    jammuStory: 'Brought directly through the historic Jammu saffron gateway, each batch comes from first-bloom purple crocus flowers harvested at sunrise with zero adulterants.',
    inStock: true,
    harvestSeason: 'Autumn Bloom',
    status: 'published',
    nutrition: {
      calories: '310 kcal / 100g (Consumed in micro-potency doses)',
      protein: '11.4g Bioactive Protein',
      keyNutrient: 'Active Crocin, Safranal & Picrocrocin Compounds',
      minerals: 'Manganese, Riboflavin, Vitamin C & Bioflavonoids',
      healthPillars: [
        {
          title: 'Serotonergic Mood & Mental Equilibrium',
          desc: 'Clinical-grade crocin and safranal naturally lift mood, ease mental tension, and foster centered emotional calm.'
        },
        {
          title: 'Royal Rasayana Skin Glow',
          desc: 'Revered in ancient Ayurvedic tradition for promoting warm micro-circulation and giving skin a luminous golden undertone.'
        },
        {
          title: 'Cardio-Respiratory Vitality',
          desc: 'Natural warmth and bioflavonoids soothe bronchial pathways and support cardiovascular stamina.'
        }
      ]
    }
  },
  {
    id: 'akhrot-best',
    name: 'Best Akhrot (In-Shell Walnuts)',
    hindiName: 'कश्मीरी अखरोट साबुत',
    subtitle: 'Hand-Graded Jammu Reserve In-Shell Walnuts 1kg',
    price: 839,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-86-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-86-300x300.jpg',
      '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg'
    ],
    fallbackImage: '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg',
    description: 'Premium whole in-shell walnuts harvested from high-altitude Kashmiri groves. Crisp shell with golden, high-oil walnut kernels.',
    origin: 'Chenab Valley & Kishtwar Hills, Jammu',
    grade: 'Royal Grade A++ In-Shell',
    features: ['Crisp Thin Shell', 'High Natural Oil', 'Sun-Dried Curing', 'Zero Chemical Bleaching'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Crisp, earthy crunch with buttery sweetness',
    jammuStory: 'Grown along steep mountain slopes in Jammu & Kashmir, these in-shell walnuts preserve peak kernel oil until cracked fresh.',
    inStock: true,
    harvestSeason: 'Winter Harvest',
    status: 'published',
    nutrition: {
      calories: '654 kcal / 100g',
      protein: '15.2g Heart-Healthy Protein',
      keyNutrient: 'Plant Omega-3 ALA (9.1g / 100g — Highest of all tree nuts)',
      minerals: 'Alpha-Linolenic Acid, Bio-Melatonin, Polyphenols & Copper',
      healthPillars: [
        {
          title: 'Cardiovascular & Vascular Elasticity',
          desc: 'Exceptional concentrations of plant Omega-3 ALA promote supple artery walls and optimal blood flow.'
        },
        {
          title: 'Deep Restorative Sleep & Brain Guard',
          desc: 'Natural bio-identical melatonin combined with ellagitannins fosters restorative circadian rhythms.'
        },
        {
          title: 'Potent Free-Radical Scavenger',
          desc: 'Natural polyphenols offer twice the antioxidant capacity of common market nuts.'
        }
      ]
    }
  },
  {
    id: 'akhrot-brown-giri',
    name: 'Brown Akhrot Giri (Walnut Kernels)',
    hindiName: 'भूरा अखरोट गिरी',
    subtitle: 'Mountain Harvest Brown Walnut Kernels 1kg',
    price: 839,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-107-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-107-300x300.jpg',
      '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg'
    ],
    fallbackImage: '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg',
    description: 'Naturally sun-dried brown walnut kernels with robust earthy flavor and exceptional omega-3 oil concentration.',
    origin: 'Kishtwar & Pir Panjal Valleys, Jammu',
    grade: 'Brown Selected Kernels',
    features: ['High Omega-3 Oil', 'Pure Raw Halves & Quarters', 'Traditional Sun Cured', 'No Additives'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Robust, rich earthy walnut flavor with natural oil sweetness',
    jammuStory: 'Sun-dried in high mountain air across Pir Panjal orchards, delivering robust Ayurvedic nourishment.',
    inStock: true,
    harvestSeason: 'Winter Harvest',
    status: 'published',
    nutrition: {
      calories: '654 kcal / 100g',
      protein: '15.2g Heart-Healthy Protein',
      keyNutrient: 'Plant Omega-3 ALA (9.1g / 100g)',
      minerals: 'Alpha-Linolenic Acid, Bio-Melatonin, Polyphenols & Copper',
      healthPillars: [
        {
          title: 'Heart & Vascular Elasticity',
          desc: 'High concentration of ALA fatty acids supports arterial health.'
        },
        {
          title: 'Cognitive Vitality',
          desc: 'Bioactive polyphenols nourish brain cells.'
        },
        {
          title: 'Immunity Shield',
          desc: 'Rich in copper and manganese for cellular strength.'
        }
      ]
    }
  },
  {
    id: 'akhrot-kashmiri-medium',
    name: 'Kashmiri Medium Akhrot (In-Shell)',
    hindiName: 'कश्मीरी मीडियम अखरोट',
    subtitle: 'Traditional Chenab Valley Medium In-Shell Walnuts 1kg',
    price: 531,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-89-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-89-300x300.jpg',
      '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg'
    ],
    fallbackImage: '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg',
    description: 'Medium-sized traditional Kashmiri in-shell walnuts with easy-to-crack shells and nutty, wholesome kernels.',
    origin: 'Kashmiri Terraced Groves',
    grade: 'Medium In-Shell Harvest',
    features: ['Easy Crack Shell', 'Natural Taste', 'Clean Kernel', 'Traditional Sun Drying'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Mild, sweet, and nutty',
    jammuStory: 'Hand-sorted in Jammu heritage cellars for consistent shell integrity and balanced kernel filling.',
    inStock: true,
    harvestSeason: 'Winter Harvest',
    status: 'published',
    nutrition: {
      calories: '654 kcal / 100g',
      protein: '15.2g Protein',
      keyNutrient: 'Plant Omega-3 ALA (9.1g / 100g)',
      minerals: 'Copper, Magnesium, Phosphorus & Vitamin B6',
      healthPillars: [
        { title: 'Heart Health', desc: 'Maintains healthy blood vessels and lipid balance.' },
        { title: 'Digestive Ease', desc: 'Supplies wholesome dietary fiber for gut microbiome.' },
        { title: 'Sustained Energy', desc: 'Slow-burning natural oils provide daily vitality.' }
      ]
    }
  },
  {
    id: 'akhrot-kashmiri-small',
    name: 'Kashmiri Small Akhrot (In-Shell)',
    hindiName: 'कश्मीरी छोटा अखरोट',
    subtitle: 'Highland Foothills Small In-Shell Walnuts 1kg',
    price: 391,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-90-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-90-300x300.jpg',
      '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg'
    ],
    fallbackImage: '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg',
    description: 'Compact, naturally cured Kashmiri in-shell walnuts. Dense meat and high natural oil yield at excellent daily value.',
    origin: 'Chenab Mountain Slopes',
    grade: 'Small In-Shell Daily Value',
    features: ['High Oil Density', 'Compact Shell', 'Unrefined Raw Nut', 'Affordable Superfood'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Dense nutty chew with mild natural sweetness',
    jammuStory: 'Wild-harvested small walnuts from ancestral seedlings offering concentrated antioxidant vitality.',
    inStock: true,
    harvestSeason: 'Winter Harvest',
    status: 'published',
    nutrition: {
      calories: '654 kcal / 100g',
      protein: '15.2g Protein',
      keyNutrient: 'Plant Omega-3 ALA (9.1g / 100g)',
      minerals: 'Copper, Magnesium, Phosphorus & Vitamin B6',
      healthPillars: [
        { title: 'Daily Superfood', desc: 'High oil concentration per gram.' },
        { title: 'Metabolic Balance', desc: 'Nutrient-rich daily snacking choice.' },
        { title: 'Bone Density', desc: 'Essential minerals for bone strength.' }
      ]
    }
  },
  {
    id: 'akhrot-milky-white',
    name: 'Milky White Akhrot (Snow Walnut Kernels)',
    hindiName: 'मिल्की व्हाइट अखरोट',
    subtitle: 'Extra Milky White Snow Grade Kernels 1kg',
    price: 1231,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-92-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-92-300x300.jpg',
      '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg'
    ],
    fallbackImage: '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg',
    description: 'Exquisite ivory snow-white walnut halves with delicate sweetness, crisp buttery snap, and zero bitterness.',
    origin: 'Kishtwar High Valleys, Jammu',
    grade: 'Extra Milky Snow White A++',
    features: ['Pristine Ivory Kernels', 'Zero Bitter Bite', 'Hand-Deshelled', 'Delicate Buttery Milk Taste'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Silky, sweet buttery snap without bitterness',
    jammuStory: 'Shelled under shade immediately upon harvest to lock in the coveted snow-white kernel color and fresh oil.',
    inStock: true,
    harvestSeason: 'Winter Harvest',
    status: 'published',
    nutrition: {
      calories: '654 kcal / 100g',
      protein: '15.2g Protein',
      keyNutrient: 'Plant Omega-3 ALA (9.1g / 100g)',
      minerals: 'Alpha-Linolenic Acid, Bio-Melatonin & Copper',
      healthPillars: [
        { title: 'Supreme Purity', desc: 'Zero chemical dipping, preserving raw oils.' },
        { title: 'Cardiovascular Care', desc: 'Promotes arterial elasticity and clear circulation.' },
        { title: 'Neural Vitality', desc: 'Essential fats nourish myelin sheaths.' }
      ]
    }
  },
  {
    id: 'akhrot-organic',
    name: 'Organic Akhrot (Wild Himalayan Harvest)',
    hindiName: 'ऑर्गेनिक अखरोट साबुत',
    subtitle: 'Pesticide-Free High-Altitude Mountain Harvest 1kg',
    price: 671,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-88-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-88-300x300.jpg',
      '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg'
    ],
    fallbackImage: '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg',
    description: 'Certified organic, untreated wild in-shell walnuts harvested from untouched high-altitude terraces across Jammu & Kashmir.',
    origin: 'Wild Chenab Forest Terraces',
    grade: 'Certified 100% Wild Organic',
    features: ['Zero Synthetic Fertilizers', 'Ancient Wild Trees', 'Pure Sun Cured', 'Biodiverse Soil Provenance'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Clean, pure woodland nutty flavor',
    jammuStory: 'Harvested from century-old walnut trees watered only by glacial snowmelt in Jammu mountains.',
    inStock: true,
    harvestSeason: 'Winter Harvest',
    status: 'published',
    nutrition: {
      calories: '654 kcal / 100g',
      protein: '15.2g Protein',
      keyNutrient: 'Plant Omega-3 ALA (9.1g / 100g)',
      minerals: 'Copper, Magnesium & Polyphenols',
      healthPillars: [
        { title: '100% Pesticide Free', desc: 'Grown wild in mineral rich glacial soils.' },
        { title: 'Cellular Longevity', desc: 'Dense polyphenol antioxidants fight oxidation.' },
        { title: 'Heart Health', desc: 'High Omega-3 levels promote cardiac wellness.' }
      ]
    }
  },
  {
    id: 'akhrot-7star-kernels',
    name: 'Premium Walnut Kernels (7 Star Royal Reserve)',
    hindiName: 'प्रीमियम अखरोट गिरी 7 स्टार',
    subtitle: '7-Star Grade Extra Light Halves & Whole Kernels 1kg',
    price: 1735,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-87-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-87-300x300.jpg',
      '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg'
    ],
    fallbackImage: '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg',
    description: 'The pinnacle of walnut grading. Handpicked 7-Star unbroken jumbo halves with peerless buttery sweetness and pristine ivory hue.',
    origin: 'Kishtwar Royal Orchards',
    grade: '7-Star Royal Extra Light Jumbo Halves',
    features: ['100% Unbroken Halves', 'Supreme Extra Light Color', 'Hand-Selected Jumbo Size', 'Luxury Gift Grade'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Exquisite buttery crunch, sweet and melt-in-mouth',
    jammuStory: 'Only 3 out of every 100 harvested walnuts meet our 7-Star inspection criteria for size, unbroken form, and ivory perfection.',
    inStock: true,
    harvestSeason: 'Winter Harvest',
    status: 'published',
    nutrition: {
      calories: '654 kcal / 100g',
      protein: '15.2g Protein',
      keyNutrient: 'Plant Omega-3 ALA (9.1g / 100g)',
      minerals: 'Alpha-Linolenic Acid, Bio-Melatonin & Copper',
      healthPillars: [
        { title: 'Master Grade Selection', desc: 'Unbroken jumbo halves of highest grade.' },
        { title: 'Vascular Longevity', desc: 'Promotes arterial elasticity and circulation.' },
        { title: 'Luxury Wellness', desc: 'Maximum nutrient density with zero tannic bitterness.' }
      ]
    }
  },
  {
    id: 'akhrot-quarter-giri',
    name: 'Quarter Akhrot Giri (Walnut Quarters)',
    hindiName: 'क्वार्टर अखरोट गिरी',
    subtitle: 'Uniform Hand-Sorted Light Walnut Quarters 1kg',
    price: 1189,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-98-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-98-300x300.jpg',
      '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg'
    ],
    fallbackImage: '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg',
    description: 'Uniform quarter pieces of premium light walnut kernels. Perfect for luxury confectionery, morning oats, and dessert garnish.',
    origin: 'Kashmir Valley Cellars',
    grade: 'Light Quarter Kernels',
    features: ['Uniform Sizing', 'High Oil Content', 'Crisp Freshness', 'Easy Snacking & Topping'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Buttery crispness with gentle sweet finish',
    jammuStory: 'Carefully separated during hand de-shelling to provide pristine, ready-to-use quarters with intact oils.',
    inStock: true,
    harvestSeason: 'Winter Harvest',
    status: 'published',
    nutrition: {
      calories: '654 kcal / 100g',
      protein: '15.2g Protein',
      keyNutrient: 'Plant Omega-3 ALA (9.1g / 100g)',
      minerals: 'Magnesium, Copper & Vitamin E',
      healthPillars: [
        { title: 'Culinary Perfection', desc: 'Ideal shape for porridge, oats, and baking.' },
        { title: 'Brain Fuel', desc: 'Rich in essential ALA fats for focus.' },
        { title: 'Active Antioxidants', desc: 'Protects cells against oxidative stress.' }
      ]
    }
  },
  {
    id: 'akhrot-super-jumbo',
    name: 'Super Jumbo Akhrot (In-Shell)',
    hindiName: 'सुपर जंबो अखरोट',
    subtitle: 'King Size Extra Large In-Shell Heritage Walnuts 1kg',
    price: 909,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-91-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-91-300x300.jpg',
      '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg'
    ],
    fallbackImage: '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg',
    description: 'Extra large King-size in-shell walnuts. Generous internal cavity with thick, golden, oil-rich kernel halves.',
    origin: 'Chenab Valley Highland Groves',
    grade: 'Super Jumbo King Size In-Shell',
    features: ['Extra Large Caliber', 'Plump Kernel Yield', 'Crisp Natural Shell', 'Rich Heart-Healthy Oil'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Dense, substantial crunch with rich natural walnut oils',
    jammuStory: 'Selectively harvested from old-growth walnut groves where trees naturally yield extra large King-sized fruit.',
    inStock: true,
    harvestSeason: 'Winter Harvest',
    status: 'published',
    nutrition: {
      calories: '654 kcal / 100g',
      protein: '15.2g Protein',
      keyNutrient: 'Plant Omega-3 ALA (9.1g / 100g)',
      minerals: 'Phosphorus, Copper, Magnesium',
      healthPillars: [
        { title: 'Maximum Meat Yield', desc: 'Heavy, dense internal kernel cavity.' },
        { title: 'Vascular Tone', desc: 'High ALA content aids arterial relaxation.' },
        { title: 'Nature Sealed', desc: 'Shell barrier prevents natural oil rancidity.' }
      ]
    }
  },
  {
    id: 'akhrot-tukda-giri',
    name: 'Tukda Akhrot Giri (Walnut Kernels Pieces)',
    hindiName: 'टुकड़ा अखरोट गिरी',
    subtitle: "Baker's Reserve High-Oil Walnut Kernel Pieces 1kg",
    price: 1063,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-100-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-100-300x300.jpg',
      '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg'
    ],
    fallbackImage: '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg',
    description: 'Cleanly sifted broken walnut pieces rich in cold-pressed natural oils. Ideal for daily snacking, baking, and granola mixes.',
    origin: 'Jammu Grading Cellars',
    grade: "Artisanal Baker's Pieces",
    features: ['Triple Sifted Clean', 'Pure Walnut Oil Sheen', 'Cost-Effective Daily Nutrition', 'No Shell Debris'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Intense nutty flavor, perfect for culinary and daily use',
    jammuStory: 'Triple-sifted in Jammu curing cellars to eliminate powder and shell fragments, delivering pure kernel pieces.',
    inStock: true,
    harvestSeason: 'Winter Harvest',
    status: 'published',
    nutrition: {
      calories: '654 kcal / 100g',
      protein: '15.2g Protein',
      keyNutrient: 'Plant Omega-3 ALA (9.1g / 100g)',
      minerals: 'Copper, Magnesium & Potassium',
      healthPillars: [
        { title: 'Daily Kitchen Essential', desc: 'Ready to blend into shakes, halwa, or bread.' },
        { title: 'Cognitive Boost', desc: 'Dense Omega-3 support for focus.' },
        { title: 'Heart Wellness', desc: 'Supports optimal cardiovascular markers.' }
      ]
    }
  },
  {
    id: 'akhrot-3star-kernels',
    name: 'Walnut Kernels (3 Star Amber Halves)',
    hindiName: 'अखरोट गिरी 3 स्टार',
    subtitle: '3-Star Daily Nutrition Amber Walnut Kernels 1kg',
    price: 979,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-111-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-111-300x300.jpg',
      '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg'
    ],
    fallbackImage: '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg',
    description: 'High-potency 3-Star amber walnut kernels. Deep nutty aroma with full-bodied omega-3 nutrient profile.',
    origin: 'Kashmir Highland Terraces',
    grade: '3-Star Amber Grade',
    features: ['Daily Wellness Superfood', 'Full Omega-3 ALA Profile', 'Sun Cured', 'Wholesome Crunch'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Deep, earthy walnut sweetness with mild toasted notes',
    jammuStory: 'Standard daily wellness grade popular across Jammu households for morning health tonics.',
    inStock: true,
    harvestSeason: 'Winter Harvest',
    status: 'published',
    nutrition: {
      calories: '654 kcal / 100g',
      protein: '15.2g Protein',
      keyNutrient: 'Plant Omega-3 ALA (9.1g / 100g)',
      minerals: 'Copper, Vitamin E, Manganese',
      healthPillars: [
        { title: 'Everyday Wellness', desc: 'Wholesome source of plant fats.' },
        { title: 'Arterial Health', desc: 'Promotes clear blood circulation.' },
        { title: 'Skin Elasticity', desc: 'Nourishing fats hydrate skin tissues.' }
      ]
    }
  },
  {
    id: 'akhrot-4star-kernels',
    name: 'Walnut Kernels (4 Star Light Amber)',
    hindiName: 'अखरोट गिरी 4 स्टार',
    subtitle: '4-Star Light Amber Selected Walnut Kernels 1kg',
    price: 1119,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-110-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-110-300x300.jpg',
      '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg'
    ],
    fallbackImage: '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg',
    description: 'Handpicked 4-Star light amber kernels with clean sweet crunch and smooth finish, cured to perfection.',
    origin: 'Chenab Mountain Groves, Jammu',
    grade: '4-Star Light Amber Halves',
    features: ['Light Amber Shade', 'Crisp Intact Halves', 'High Natural Oil', 'Smooth Palate Finish'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Smooth, sweet, and nutty with minimal astringency',
    jammuStory: 'Selected for its light golden amber hue and delicate snap, representing classic Chenab Valley quality.',
    inStock: true,
    harvestSeason: 'Winter Harvest',
    status: 'published',
    nutrition: {
      calories: '654 kcal / 100g',
      protein: '15.2g Protein',
      keyNutrient: 'Plant Omega-3 ALA (9.1g / 100g)',
      minerals: 'Copper, Magnesium & Melatonin',
      healthPillars: [
        { title: 'Selective Curing', desc: 'Retains crisp crunch and light color.' },
        { title: 'Restorative Sleep', desc: 'Rich in natural bio-melatonin.' },
        { title: 'Heart Vitality', desc: 'Regulates cholesterol balance.' }
      ]
    }
  },
  {
    id: 'akhrot-5star-kernels',
    name: 'Walnut Kernels (5 Star Snow White)',
    hindiName: 'अखरोट गिरी 5 स्टार',
    subtitle: '5-Star Snow White Unbroken Jumbo Halves 1kg',
    price: 1483,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-108-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-108-300x300.jpg',
      '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg'
    ],
    fallbackImage: '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg',
    description: 'Exceptional 5-Star snow-white unbroken walnut halves. Highly prized for luxurious presentation, delicate crunch, and zero tannic bite.',
    origin: 'Kishtwar Premium Orchards',
    grade: '5-Star Snow White Extra Light Halves',
    features: ['Snow-White Ivory Color', 'Unbroken Full Halves', 'Peak Natural Oil Retention', 'Gourmet Luxury Grade'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Delicate, sweet creaminess with clean ivory crunch',
    jammuStory: 'Celebrated as the festive gift of choice in Jammu, hand-cracked in cold cellars to preserve pristine color.',
    inStock: true,
    harvestSeason: 'Winter Harvest',
    status: 'published',
    nutrition: {
      calories: '654 kcal / 100g',
      protein: '15.2g Protein',
      keyNutrient: 'Plant Omega-3 ALA (9.1g / 100g)',
      minerals: 'Copper, Phosphorus, Polyphenols & Vitamin E',
      healthPillars: [
        { title: '5-Star Grade', desc: 'Top tier hand-sorted unbroken snow halves.' },
        { title: 'Anti-Aging Antioxidants', desc: 'Neutralizes free radicals naturally.' },
        { title: 'Cardiovascular Strength', desc: 'Maximum concentration of pure ALA fats.' }
      ]
    }
  },
  {
    id: 'kaju-best',
    name: 'Best Kaju (Whole Cashews)',
    hindiName: 'बेस्ट काजू साबुत',
    subtitle: 'Select Everyday Whole Creamy Cashews 250g, 500g & 1kg',
    price: 1399,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-102-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-102-300x300.jpg',
      '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg'
    ],
    fallbackImage: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
    description: 'Smooth ivory whole cashews graded for natural sweetness, firm snap, and clean buttery aroma without chemical bleaching.',
    origin: 'Cured & Graded in Jammu Cellars',
    grade: 'Best Select Whole Kaju',
    features: ['Pure Ivory Whole Kernels', 'Zero Chemical Bleaching', 'Naturally Sweet', 'Vacuum Fresh Pack'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Clean creamy snap with gentle natural sweetness',
    jammuStory: 'Curated in our Jammu heritage cellars under low-humidity curing to preserve wholesome crispness in every batch.',
    inStock: true,
    harvestSeason: 'Spring Harvest',
    status: 'published',
    nutrition: {
      calories: '553 kcal / 100g',
      protein: '18.2g Plant Protein',
      keyNutrient: 'Healthy Monounsaturated Oleic Acid (75% of total fats)',
      minerals: 'Magnesium, Copper, Zinc & Phosphorus',
      healthPillars: [
        { title: 'Heart-Friendly Fats', desc: 'Monounsaturated oleic acid supports healthy lipid balance.' },
        { title: 'Clean Plant Energy', desc: 'Sustained nourishment for daily vitality.' },
        { title: 'Mineral Density', desc: 'Rich natural copper and magnesium for bone health.' }
      ]
    }
  },
  {
    id: 'kaju-super-jumbo',
    name: 'Super Jumbo Size Kaju (Whole Cashews)',
    hindiName: 'सुपर जंबो काजू',
    subtitle: 'King Caliber Extra-Large Whole Cashews 250g, 500g & 1kg',
    price: 1903,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-101-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-101-300x300.jpg',
      '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg'
    ],
    fallbackImage: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
    description: 'Extra-large W-180 caliber Super Jumbo whole cashews. Plump, milky-white kernels with an unmistakable rich crunch ideal for royal gifting.',
    origin: 'Cured & Graded in Jammu Cellars',
    grade: 'Super Jumbo King Size Whole',
    features: ['Extra-Large Caliber', '100% Unbroken Whole', 'Royal Gift Presentation', 'Rich Buttery Bite'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Luxuriously creamy mouthfeel with deep milky sweetness',
    jammuStory: 'Hand-sorted for top-tier size and pristine curvature, reserved for festive hampers and connoisseur households.',
    inStock: true,
    harvestSeason: 'Spring Harvest',
    status: 'published',
    nutrition: {
      calories: '553 kcal / 100g',
      protein: '18.2g Plant Protein',
      keyNutrient: 'Healthy Monounsaturated Oleic Acid',
      minerals: 'Magnesium, Copper, Iron & Zinc',
      healthPillars: [
        { title: 'King-Size Kernel Purity', desc: 'Zero hollow core and dense natural lipid content.' },
        { title: 'Vascular Vitality', desc: 'Oleic fatty acids promote optimal arterial health.' },
        { title: 'Cellular Immunity', desc: 'High zinc concentration aids immune resilience.' }
      ]
    }
  },
  {
    id: 'kaju-super',
    name: 'Super Kaju (Selected Whole Cashews)',
    hindiName: 'सुपर काजू',
    subtitle: 'Hand-Sorted Superior Whole Cashews 250g, 500g & 1kg',
    price: 1539,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-103-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-103-300x300.jpg',
      '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg'
    ],
    fallbackImage: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
    description: 'Superior grade W-210 whole cashews with delicate ivory tone, uniform curvature, and rich natural cashew butter richness.',
    origin: 'Cured & Graded in Jammu Cellars',
    grade: 'Super Whole Grade',
    features: ['Uniform Whole Kernels', 'Slow Cured Crispness', 'Rich Natural Sweetness', 'No Oil Frying'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Velvety richness with a clean, crisp finish',
    jammuStory: 'Carefully graded by Seth family artisans to balance plump kernel size and everyday culinary luxury.',
    inStock: true,
    harvestSeason: 'Spring Harvest',
    status: 'published',
    nutrition: {
      calories: '553 kcal / 100g',
      protein: '18.2g Plant Protein',
      keyNutrient: 'Healthy Monounsaturated Oleic Acid',
      minerals: 'Copper, Magnesium & Phosphorus',
      healthPillars: [
        { title: 'Balanced Nutrition', desc: 'Ideal daily source of heart-healthy fats and protein.' },
        { title: 'Nervous System Calm', desc: 'Natural magnesium supports muscle and nerve tone.' },
        { title: 'Pure Unroasted Whole', desc: 'Retains intact raw enzymes and antioxidants.' }
      ]
    }
  },
  {
    id: 'pista-classic',
    name: 'Roasted & Salted Pistachio (Pista)',
    hindiName: 'भुना नमकीन पिस्ता',
    subtitle: 'Naturally Open-Shell Roasted Pistachios 250g, 500g & 1kg',
    price: 2603,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-03-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-03-300x300.jpg',
      '/assets/aistudio/3c576d7519d8f23898ea5fb9043bb2d7_9d2bc35a.jpg'
    ],
    fallbackImage: '/assets/aistudio/3c576d7519d8f23898ea5fb9043bb2d7_9d2bc35a.jpg',
    description: 'Naturally split in-shell pistachios roasted slowly with fine mineral salt for an effortless snap and vibrant emerald kernel.',
    origin: 'Curated by Seth And Sons DryFruits, Jammu',
    grade: 'Classic Roasted In-Shell Pista',
    features: ['Naturally Split Shells', 'Slow Fire Roasted', 'Light Mineral Salt', 'Vibrant Emerald Core'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Savory roasted crispness with sweet green kernel depth',
    jammuStory: 'Small-batch copper-vessel roasting in Jammu brings out the classic nutty aroma without scorching delicate oils.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '562 kcal / 100g',
      protein: '20.3g Protein',
      keyNutrient: 'Lutein & Zeaxanthin Carotenoids',
      minerals: 'Potassium, Vitamin B6 & Thiamine',
      healthPillars: [
        { title: 'Eye & Macular Care', desc: 'Lutein carotenoids protect retinal health.' },
        { title: 'Electrolyte Support', desc: 'High natural potassium balances hydration.' },
        { title: 'Satiety & Fiber', desc: 'Nutrient-dense snacking with steady energy.' }
      ]
    }
  },
  {
    id: 'pista-kernels',
    name: 'Pistachio Kernels (Green Pista Giri)',
    hindiName: 'हरा पिस्ता गिरी',
    subtitle: 'Unsalted Shelled Green Pistachio Kernels 250g, 500g & 1kg',
    price: 4199,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-68-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-68-300x300.jpg',
      '/assets/aistudio/3c576d7519d8f23898ea5fb9043bb2d7_9d2bc35a.jpg'
    ],
    fallbackImage: '/assets/aistudio/3c576d7519d8f23898ea5fb9043bb2d7_9d2bc35a.jpg',
    description: 'Pure shelled emerald-green pistachio kernels with zero added salt. Prized for royal mithai, kheer, baklava, and raw antioxidant nutrition.',
    origin: 'Curated by Seth And Sons DryFruits, Jammu',
    grade: 'Pure Green Pista Giri (Unsalted)',
    features: ['100% Shelled Pure Kernels', 'Deep Emerald Hue', 'Zero Added Salt', 'Gourmet Dessert & Raw Grade'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Pure, sweet green pistachio essence with tender crunch',
    jammuStory: 'Carefully de-shelled from early-harvest pistachios to deliver dazzling natural green kernels without artificial coloring.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '562 kcal / 100g',
      protein: '20.3g Protein',
      keyNutrient: 'Lutein & Zeaxanthin Carotenoids',
      minerals: 'Vitamin B6, Potassium, Copper & Fiber',
      healthPillars: [
        { title: 'Zero Shell Waste', desc: '100% edible pure emerald kernels ready for daily use.' },
        { title: 'High Amino Acid Profile', desc: 'Contains all 9 essential amino acids.' },
        { title: 'Culinary Excellence', desc: 'Vibrant color and rich aroma for traditional sweets.' }
      ]
    }
  },
  {
    id: 'pista-premium',
    name: 'Premium Pistachio (Jumbo Pista Reserve)',
    hindiName: 'प्रीमियम पिस्ता रिजर्व',
    subtitle: 'Hand-Graded Extra-Large Roasted Pistachios 250g, 500g & 1kg',
    price: 2799,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-69-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-69-300x300.jpg',
      '/assets/aistudio/3c576d7519d8f23898ea5fb9043bb2d7_9d2bc35a.jpg'
    ],
    fallbackImage: '/assets/aistudio/3c576d7519d8f23898ea5fb9043bb2d7_9d2bc35a.jpg',
    description: 'Selected jumbo open-mouth pistachios featuring large plump kernels, crisp papery shells, and refined earthen roasting.',
    origin: 'Curated by Seth And Sons DryFruits, Jammu',
    grade: 'Premium Jumbo Reserve Pista',
    features: ['Jumbo Kernel Caliber', 'Naturally Open-Mouth', 'Crisp Earthen Roast', 'Zero Chemical Whitening'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Rich, satisfying crunch with subtle toasted sweetness',
    jammuStory: 'Graded in Jammu for generous kernel fill and natural shell ivory without bleaching agents.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '562 kcal / 100g',
      protein: '20.3g Protein',
      keyNutrient: 'Lutein & Zeaxanthin Carotenoids',
      minerals: 'Potassium, Magnesium & Vitamin B6',
      healthPillars: [
        { title: 'Retinal Wellness', desc: 'Concentrated lutein filters oxidative blue light.' },
        { title: 'Lean Protein Source', desc: 'Over 20g natural plant protein per 100g.' },
        { title: 'Glycemic Balance', desc: 'High fiber supports sustained daily focus.' }
      ]
    }
  },
  {
    id: 'kishmish-afghani',
    name: 'Afghani Kishmish (Golden Long Raisins)',
    hindiName: 'अफगानी किशमिश',
    subtitle: 'Lush Sundried Afghani Golden Seedless Raisins 250g, 500g & 1kg',
    price: 783,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-15-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-15-300x300.jpg',
      '/assets/aistudio/295190b67948ef58902b7efe5b0311a0_8daf8c64.jpg'
    ],
    fallbackImage: '/assets/aistudio/295190b67948ef58902b7efe5b0311a0_8daf8c64.jpg',
    description: 'Naturally sweet, plump Afghani seedless raisins shade-dried for supple skins, juicy honey nectar centers, and rich iron content.',
    origin: 'Afghanistan Harvest • Curated in Jammu',
    grade: 'Afghani Long Seedless Grade A',
    features: ['Plump Seedless Grapes', 'Zero Added Sugar', 'Rich Natural Iron', 'Shade Cured Freshness'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Honeyed caramel juiciness with clean fruit finish',
    jammuStory: 'Brought through historic dry-fruit trade routes to our Jammu cellars, sorted for spotless golden-amber translucence.',
    inStock: true,
    harvestSeason: 'Late Summer',
    status: 'published',
    nutrition: {
      calories: '299 kcal / 100g',
      protein: '3.1g Dietary Protein',
      keyNutrient: 'Bioavailable Non-Heme Iron & Tartaric Acid',
      minerals: 'Dietary Iron, Potassium, Boron & Vitamin B6',
      healthPillars: [
        { title: 'Hemoglobin Support', desc: 'Bioavailable iron and copper assist healthy red blood cell levels.' },
        { title: 'Digestive Harmony', desc: 'Soluble fiber and natural tartaric acid aid gut balance.' },
        { title: 'Quick Clean Energy', desc: 'Natural fruit sugars fuel daily stamina.' }
      ]
    }
  },
  {
    id: 'kishmish-black',
    name: 'Black Kishmish (Seedless Black Raisins)',
    hindiName: 'काली किशमिश',
    subtitle: 'Antioxidant-Rich Sundried Seedless Black Raisins 250g, 500g & 1kg',
    price: 839,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-16-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-16-300x300.jpg',
      '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg'
    ],
    fallbackImage: '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg',
    description: 'Deep purple-black seedless raisins bursting with resveratrol polyphenols, iron, and soothing soaked morning tonic vitality.',
    origin: 'Jammu Traditional Shade Chambers',
    grade: 'Seedless Black Reserve',
    features: ['Rich in Resveratrol', 'Zero Sulfur Wash', 'Soaking & Daily Wellness', 'High Iron & Potassium'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Deep berry-molasses sweetness with rich chewy pulp',
    jammuStory: 'Traditionally recommended soaked overnight in Jammu households for blood purification, bone strength, and luminous skin.',
    inStock: true,
    harvestSeason: 'Late Summer',
    status: 'published',
    nutrition: {
      calories: '299 kcal / 100g',
      protein: '3.1g Dietary Protein',
      keyNutrient: 'Resveratrol Anthocyanins & Dietary Iron',
      minerals: 'Iron, Potassium, Calcium & Boron',
      healthPillars: [
        { title: 'Antioxidant Protection', desc: 'Dark skins hold high concentrations of anthocyanins.' },
        { title: 'Blood & Skin Glow', desc: 'Overnight soaked black raisins nourish micro-circulation.' },
        { title: 'Bone Mineralization', desc: 'Natural boron supports calcium retention.' }
      ]
    }
  },
  {
    id: 'kishmish-green',
    name: 'Green Kishmish (Long Shade-Cured Raisins)',
    hindiName: 'हरी लंबी किशमिश',
    subtitle: 'Emerald-Tone Sundried Long Green Raisins 250g, 500g & 1kg',
    price: 839,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-62-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-62-300x300.jpg',
      '/assets/aistudio/295190b67948ef58902b7efe5b0311a0_8daf8c64.jpg'
    ],
    fallbackImage: '/assets/aistudio/295190b67948ef58902b7efe5b0311a0_8daf8c64.jpg',
    description: 'Slender, translucent jade-green seedless raisins shade-dried cleanly to preserve tangy grape nectar and tender chew.',
    origin: 'Jammu Traditional Shade Chambers',
    grade: 'Long Green Export Grade',
    features: ['Translucent Green Glow', 'No Artificial Dye', 'Tender Sweet-Tangy Bite', 'Ideal for Kheer & Snacking'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Bright sweet-tangy grape note with soft caramel finish',
    jammuStory: 'Cured away from harsh midday glare to keep their crisp green tint and soft moisture intact.',
    inStock: true,
    harvestSeason: 'Late Summer',
    status: 'published',
    nutrition: {
      calories: '299 kcal / 100g',
      protein: '3.1g Dietary Protein',
      keyNutrient: 'Bioavailable Iron & Grape Polyphenols',
      minerals: 'Potassium, Magnesium, Iron & Vitamin B6',
      healthPillars: [
        { title: 'Electrolyte Refreshment', desc: 'Potassium restores daily mineral balance.' },
        { title: 'Digestive Ease', desc: 'Gentle fiber relieves sluggish digestion.' },
        { title: 'Daily Energy', desc: 'Pure natural sugars without refined additives.' }
      ]
    }
  },
  {
    id: 'kishmish-munaka',
    name: 'Munaka (Royal Seeded Dried Grapes)',
    hindiName: 'मुनक्का (असली बीज वाला)',
    subtitle: 'Traditional Ayurvedic Whole Seeded Munakka 250g, 500g & 1kg',
    price: 1119,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-17-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-17-300x300.jpg',
      '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg'
    ],
    fallbackImage: '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg',
    description: 'Plump, velvety dark brown Munakka (Draksha) dried grapes with natural seeds intact — prized in Ayurveda for throat comfort, digestion, and blood vitality.',
    origin: 'Afghanistan & Jammu Heritage Selection',
    grade: 'Ayurvedic Jumbo Munakka',
    features: ['Intact Natural Grape Seeds', 'Plump Juicy Flesh', 'Ayurvedic Winter Tonic', 'Zero Chemical Processing'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Rich, warm fig-like grape sweetness',
    jammuStory: 'Sourced for thick juicy flesh and traditional winter kahwa and milk infusions in Jammu households.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '305 kcal / 100g',
      protein: '3.0g Dietary Protein',
      keyNutrient: 'Grape Seed OPC Antioxidants & Natural Iron',
      minerals: 'Iron, Potassium, Calcium & Polyphenols',
      healthPillars: [
        { title: 'Respiratory & Throat Comfort', desc: 'Revered Ayurvedic Draksha tonic for seasonal soothing.' },
        { title: 'Hemoglobin & Vitality', desc: 'Dense iron supports healthy energy and blood health.' },
        { title: 'Gut Comfort', desc: 'Natural soluble fiber supports smooth bowel health.' }
      ]
    }
  },
  // --- Anjeer (Figs) ---
  {
    id: 'anjeer-jammu',
    name: 'Anjeer (Fig) — Classic Reserve',
    hindiName: 'अंजीर क्लासिक',
    subtitle: 'Sun-Cured Natural Sweet Figs 250g, 500g & 1kg',
    price: 1399,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-12-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-12-300x300.jpg',
      '/assets/aistudio/295190b67948ef58902b7efe5b0311a0_8daf8c64.jpg'
    ],
    fallbackImage: '/assets/aistudio/295190b67948ef58902b7efe5b0311a0_8daf8c64.jpg',
    description: 'Naturally sun-dried whole figs cured to golden perfection. Soft, seed-crunchy centers packed with dietary fiber, calcium, and potassium.',
    origin: 'Afghanistan & Jammu Heritage Cellars',
    grade: 'Classic Sun-Dried Anjeer',
    features: ['Zero Added Sugar', 'Rich Dietary Fiber', 'Natural Calcium & Iron', 'Sun Cured Whole'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Honeyed fig nectar with gentle crunchy seeds',
    jammuStory: 'String-cured in mountain sun and graded in Jammu cellars for soft, pliable texture.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '249 kcal / 100g',
      protein: '3.3g Dietary Protein',
      keyNutrient: 'Soluble Prebiotic Fiber & Natural Calcium',
      minerals: 'Calcium, Potassium, Iron & Magnesium',
      healthPillars: [
        { title: 'Digestive Wellness', desc: 'Prebiotic fiber promotes smooth gut motility.' },
        { title: 'Bone Density', desc: 'Plant-based calcium and potassium support skeletal strength.' },
        { title: 'Blood Pressure Balance', desc: 'High potassium-to-sodium ratio supports vascular calm.' }
      ]
    }
  },
  {
    id: 'anjeer-afghani',
    name: 'Afghani Anjeer (Fig)',
    hindiName: 'अफगानी अंजीर',
    subtitle: 'Hand-Selected Afghani Soft Figs 250g, 500g & 1kg',
    price: 1539,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-77-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-77-300x300.jpg',
      '/assets/aistudio/295190b67948ef58902b7efe5b0311a0_8daf8c64.jpg'
    ],
    fallbackImage: '/assets/aistudio/295190b67948ef58902b7efe5b0311a0_8daf8c64.jpg',
    description: 'Sweet Afghani dried figs selected for uniform pale-gold skin, supple moisture, and rich honeyed seed crunch.',
    origin: 'Afghanistan Harvest • Curated in Jammu',
    grade: 'Afghani Select Grade',
    features: ['Pale Golden Skin', 'Soft Chewy Center', 'No Sulfur Bleaching', 'Daily Morning Superfood'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Lush natural caramel sweetness with crisp seed pop',
    jammuStory: 'Traditionally soaked overnight in milk or warm water across Jammu homes for winter vitality.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '249 kcal / 100g',
      protein: '3.3g Dietary Protein',
      keyNutrient: 'Prebiotic Pectin Fiber & Polyphenols',
      minerals: 'Calcium, Iron, Manganese & Potassium',
      healthPillars: [
        { title: 'Natural Iron Tonic', desc: 'Supports healthy hemoglobin levels.' },
        { title: 'Digestive Regularity', desc: 'High soluble and insoluble fiber content.' },
        { title: 'Heart Support', desc: 'Polyphenols combat oxidative stress.' }
      ]
    }
  },
  {
    id: 'anjeer-best',
    name: 'Best Anjeer (Fig)',
    hindiName: 'बेस्ट अंजीर',
    subtitle: 'Selected Large Golden Dried Figs 250g, 500g & 1kg',
    price: 1819,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-11-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-11-300x300.jpg',
      '/assets/aistudio/295190b67948ef58902b7efe5b0311a0_8daf8c64.jpg'
    ],
    fallbackImage: '/assets/aistudio/295190b67948ef58902b7efe5b0311a0_8daf8c64.jpg',
    description: 'Large, succulent golden dried figs prized for thin tender skins, generous nectar pulp, and clean natural sweetness.',
    origin: 'Afghanistan & Jammu Heritage Cellars',
    grade: 'Best Select Large Anjeer',
    features: ['Large Golden Disks', 'Thin Tender Skin', 'High Nectar Pulp', 'Unbleached & Pure'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Rich creamy honey-fig taste with lingering floral finish',
    jammuStory: 'Hand-graded in Jammu for plump fleshiness and spotless natural golden tone.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '249 kcal / 100g',
      protein: '3.3g Dietary Protein',
      keyNutrient: 'Soluble Dietary Fiber & Bioavailable Calcium',
      minerals: 'Calcium, Potassium, Iron & Copper',
      healthPillars: [
        { title: 'Satiety & Metabolic Balance', desc: 'Steady natural energy release.' },
        { title: 'Gut Microbiome Care', desc: 'Feeds beneficial digestive flora.' },
        { title: 'Mineral Replenishment', desc: 'Rich natural electrolytes.' }
      ]
    }
  },
  {
    id: 'anjeer-juicy-jumbo',
    name: 'Juicy Jumbo Anjeer (Fig)',
    hindiName: 'जूसी जंबो अंजीर',
    subtitle: 'King Caliber Extra-Juicy Gourmet Figs 250g, 500g & 1kg',
    price: 2799,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-72-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-72-300x300.jpg',
      '/assets/aistudio/295190b67948ef58902b7efe5b0311a0_8daf8c64.jpg'
    ],
    fallbackImage: '/assets/aistudio/295190b67948ef58902b7efe5b0311a0_8daf8c64.jpg',
    description: 'Extra-large Juicy Jumbo figs bursting with amber nectar. Our flagship festive fig grade — ultra-soft, moist, and deeply nourishing.',
    origin: 'Afghanistan Reserve • Graded in Jammu',
    grade: 'Juicy Jumbo Royal Reserve',
    features: ['Extra-Large Jumbo Caliber', 'Ultra-Moist Nectar Interior', 'Luxury Gifting Quality', 'Zero Preservatives'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Velvety molten fig jam core with delicate crunchy seeds',
    jammuStory: 'Our finest fig harvest, kept under temperature-controlled Jammu storage so every jumbo fig arrives irresistibly moist.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '249 kcal / 100g',
      protein: '3.3g Dietary Protein',
      keyNutrient: 'Concentrated Fig Polyphenols & Prebiotic Fiber',
      minerals: 'Calcium, Iron, Potassium & Magnesium',
      healthPillars: [
        { title: 'Royal Digestive Tonic', desc: 'High fiber concentration eases digestion.' },
        { title: 'Skeletal & Muscle Health', desc: 'Natural calcium and potassium synergy.' },
        { title: 'Pure Energy Density', desc: 'Wholesome, unrefined natural sweetness.' }
      ]
    }
  },
  // --- Berries & Seeds ---
  {
    id: 'berry-aaloo-bhakhara',
    name: 'Aaloo Bhakhara (Dry Plums)',
    hindiName: 'आलू बुखारा (सूखे)',
    subtitle: 'Tangy-Sweet Sundried Himalayan Prunes 250g, 500g & 1kg',
    price: 1259,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-67-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-67-300x300.jpg',
      '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg'
    ],
    fallbackImage: '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg',
    description: 'Traditional sun-dried Aloo Bukhara (dry plums) prized across Jammu & Kashmiri cuisine for digestive comfort, tangy chutney, and birch-toned sweetness.',
    origin: 'Kashmir & Afghanistan Foothills',
    grade: 'Choice Sundried Dry Plums',
    features: ['Digestive Prune Fiber', 'Tangy-Sweet Flavor', 'Ideal for Pulao & Chutneys', 'Zero Artificial Colors'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Vibrant sweet-tart plum richness',
    jammuStory: 'A pantry staple in Dogra & Kashmiri kitchens for aromatic pulao, cooling summer sherbets, and gut health.',
    inStock: true,
    harvestSeason: 'Late Summer',
    status: 'published',
    nutrition: {
      calories: '240 kcal / 100g',
      protein: '2.2g Dietary Protein',
      keyNutrient: 'Sorbitol, Neochlorogenic Acid & Prebiotic Fiber',
      minerals: 'Potassium, Vitamin K, Boron & Copper',
      healthPillars: [
        { title: 'Digestive Mobility', desc: 'Naturally rich in gentle dietary fiber and sorbitol.' },
        { title: 'Bone Density Support', desc: 'Clinical studies link dried plums with bone mineral support.' },
        { title: 'Antioxidant Density', desc: 'Polyphenols guard against cellular oxidation.' }
      ]
    }
  },
  {
    id: 'seed-basil',
    name: 'Basil Seeds (Sabja)',
    hindiName: 'तुलसी / सब्जा बीज',
    subtitle: 'Cooling Raw Sweet Basil Seeds 250g, 500g & 1kg',
    price: 727,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-37-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-37-300x300.jpg',
      '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg'
    ],
    fallbackImage: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
    description: 'Cleanly winnowed pure Sabja (sweet basil) seeds that bloom rapidly in water to cool digestion, hydrate the body, and deliver plant Omega-3s.',
    origin: 'Curated by Seth And Sons DryFruits, Jammu',
    grade: 'Triple-Cleaned Culinary Grade',
    features: ['Instant Gel Bloom', 'Natural Body Coolant', 'High Soluble Fiber', 'Zero Dust or Husk'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Mild herbal freshness when soaked in sherbets or milk',
    jammuStory: 'Triple-sifted in Jammu for pure black seeds used in traditional falooda, rose milk, and summer tonics.',
    inStock: true,
    harvestSeason: 'Spring Harvest',
    status: 'published',
    nutrition: {
      calories: '442 kcal / 100g',
      protein: '14.8g Plant Protein',
      keyNutrient: 'Alpha-Linolenic Acid & Mucilage Fiber',
      minerals: 'Calcium, Iron, Magnesium & Flavonoids',
      healthPillars: [
        { title: 'Thermal Cooling', desc: 'Traditionally steeped to cool body heat and acidity.' },
        { title: 'Satiety & Hydration', desc: 'Retains water to keep digestion smooth.' },
        { title: 'Plant Mineral Boost', desc: 'Rich natural source of calcium and iron.' }
      ]
    }
  },
  {
    id: 'berry-blackberry',
    name: 'Blackberry (Dried Blackberries)',
    hindiName: 'सूखे जामुन / ब्लैकबेरी',
    subtitle: 'Sweet-Tart Antioxidant Dried Blackberries 250g, 500g & 1kg',
    price: 1119,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-46-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-46-300x300.jpg',
      '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg'
    ],
    fallbackImage: '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg',
    description: 'Deep dark dried blackberries bursting with intense berry flavor, anthocyanins, and Vitamin C for snacking, teas, and granola.',
    origin: 'Curated by Seth And Sons DryFruits, Jammu',
    grade: 'Choice Whole Dried Berries',
    features: ['Rich Anthocyanins', 'Bold Berry Aroma', 'Snack & Bakery Ready', 'Vibrant Natural Color'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Deep wine-like blackberry tang with pleasant sweetness',
    jammuStory: 'Packed airtight in Jammu to preserve delicate berry aromatics and crisp chew.',
    inStock: true,
    harvestSeason: 'Summer Harvest',
    status: 'published',
    nutrition: {
      calories: '320 kcal / 100g',
      protein: '3.2g Dietary Protein',
      keyNutrient: 'Anthocyanin Polyphenols & Ellagic Acid',
      minerals: 'Vitamin C, Vitamin K, Manganese & Fiber',
      healthPillars: [
        { title: 'Cellular Defense', desc: 'Dark berry pigments neutralize free radicals.' },
        { title: 'Immune Support', desc: 'Natural Vitamin C and polyphenols.' },
        { title: 'Fiber-Rich Snack', desc: 'Supports clean gut health.' }
      ]
    }
  },
  {
    id: 'berry-blueberry',
    name: 'Blueberry (Dried Blueberries)',
    hindiName: 'ब्लूबेरी (सूखे)',
    subtitle: 'Whole Gourmet Antioxidant Dried Blueberries 250g, 500g & 1kg',
    price: 2239,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-52-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-52-300x300.jpg',
      '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg'
    ],
    fallbackImage: '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg',
    description: 'Whole, plump dried blueberries prized globally as a brain and eye superfood. Delicious in oatmeal, smoothies, muffins, or straight from the jar.',
    origin: 'Curated by Seth And Sons DryFruits, Jammu',
    grade: 'Whole Gourmet Blueberries',
    features: ['Whole Intact Berries', 'High ORAC Antioxidants', 'Brain & Eye Superfood', 'Zero Artificial Flavors'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Concentrated juicy blueberry sweetness with subtle tartness',
    jammuStory: 'Stored under controlled chill in Jammu to prevent clumping and retain plump whole form.',
    inStock: true,
    harvestSeason: 'Summer Harvest',
    status: 'published',
    nutrition: {
      calories: '317 kcal / 100g',
      protein: '2.5g Dietary Protein',
      keyNutrient: 'Pterostilbene & Anthocyanin Flavonoids',
      minerals: 'Vitamin K, Manganese, Vitamin C & Fiber',
      healthPillars: [
        { title: 'Cognitive Longevity', desc: 'Blueberry flavonoids nourish memory and focus.' },
        { title: 'Vascular Integrity', desc: 'Antioxidants support healthy blood vessels.' },
        { title: 'Vision Protection', desc: 'Supports retinal cellular resilience.' }
      ]
    }
  },
  {
    id: 'seed-chia',
    name: 'Chia Seeds',
    hindiName: 'चिया बीज',
    subtitle: 'Raw High-Omega-3 Black & White Chia Seeds 250g, 500g & 1kg',
    price: 783,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-27-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-27-300x300.jpg',
      '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg'
    ],
    fallbackImage: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
    description: 'Pure raw chia seeds packed with plant Omega-3 ALA, complete protein, calcium, and soluble fiber for overnight puddings and smoothies.',
    origin: 'Curated by Seth And Sons DryFruits, Jammu',
    grade: 'Purity Tested Raw Superfood',
    features: ['100% Pure Raw Seeds', 'Omega-3 ALA Powerhouse', '34g Fiber / 100g', 'Zero Dust or Fillers'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Clean neutral crunch that thickens naturally in liquids',
    jammuStory: 'Cleaned and vacuum-packed for optimal germination freshness and lipid stability.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '486 kcal / 100g',
      protein: '16.5g Complete Plant Protein',
      keyNutrient: 'Plant Omega-3 ALA (17.8g / 100g)',
      minerals: 'Calcium (631mg), Phosphorus, Magnesium & Zinc',
      healthPillars: [
        { title: 'Heart & Lipid Balance', desc: 'Concentrated plant Omega-3 fatty acids.' },
        { title: 'Bone Strength', desc: 'More calcium per gram than dairy.' },
        { title: 'Sustained Endurance', desc: 'Slow-release soluble gel fiber.' }
      ]
    }
  },
  {
    id: 'berry-cranberry',
    name: 'Cranberry (Whole Dried Cranberries)',
    hindiName: 'क्रैनबेरी (सूखे)',
    subtitle: 'Ruby-Red Whole Sliced Dried Cranberries 250g, 500g & 1kg',
    price: 979,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-41-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-41-300x300.jpg',
      '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg'
    ],
    fallbackImage: '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg',
    description: 'Vibrant ruby-red whole dried cranberries with crisp sweet-tart tang. Ideal for urinary wellness, trail mixes, salads, and artisan bakes.',
    origin: 'Curated by Seth And Sons DryFruits, Jammu',
    grade: 'Choice Ruby Cranberries',
    features: ['A-Type Proanthocyanidins', 'Ruby Red Natural Color', 'Sweet-Tart Tang', 'Trail Mix Favorite'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Bright, zesty cranberry tartness balanced with natural sweetness',
    jammuStory: 'Packed fresh in Jammu to prevent drying out, preserving chewy ruby texture.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '308 kcal / 100g',
      protein: '0.5g Dietary Protein',
      keyNutrient: 'Proanthocyanidins (PACs) & Vitamin E',
      minerals: 'Manganese, Vitamin C, Vitamin E & Fiber',
      healthPillars: [
        { title: 'Urinary Tract Shield', desc: 'Unique A-type PACs inhibit unwanted bacterial adhesion.' },
        { title: 'Antioxidant Defense', desc: 'Supports cellular wellness.' },
        { title: 'Culinary Brightness', desc: 'Adds vibrant flavor to salads, nuts, and muesli.' }
      ]
    }
  },
  {
    id: 'seed-apricot',
    name: 'Dry Apricot Seeds (Khubani Giri)',
    hindiName: 'खुबानी की गिरी',
    subtitle: 'Sweet Himalayan Apricot Kernels 250g, 500g & 1kg',
    price: 923,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-39-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-39-300x300.jpg',
      '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg'
    ],
    fallbackImage: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
    description: 'Traditional sweet Himalayan Khubani (apricot) seed kernels, prized in mountain valleys for joint oil richness, Vitamin E, and natural warmth.',
    origin: 'Ladakh & Jammu Highland Orchards',
    grade: 'Sweet Selected Khubani Kernels',
    features: ['Cold-Pressed Oil Richness', 'High Vitamin E', 'Mountain Heritage Kernel', 'Almond-Like Crunch'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Crisp almond-like bite with delicate marzipan aroma',
    jammuStory: 'Cracked cleanly from high-altitude Himalayan apricots, cherished across Jammu & Ladakh.',
    inStock: true,
    harvestSeason: 'Summer Harvest',
    status: 'published',
    nutrition: {
      calories: '518 kcal / 100g',
      protein: '21.0g Plant Protein',
      keyNutrient: 'Natural Tocopherols (Vitamin E) & Oleic Lipids',
      minerals: 'Magnesium, Iron, Zinc & Phosphorus',
      healthPillars: [
        { title: 'Joint & Skin Lubrication', desc: 'Rich natural kernel lipids nourish joints and skin.' },
        { title: 'Plant Protein', desc: 'High natural protein density.' },
        { title: 'Mountain Vitality', desc: 'Traditional Himalayan winter nourishment.' }
      ]
    }
  },
  {
    id: 'berry-dry-cherry',
    name: 'Dry Cherry (Whole Dried Cherries)',
    hindiName: 'सूखी चेरी',
    subtitle: 'Tart-Sweet Gourmet Whole Dried Cherries 250g, 500g & 1kg',
    price: 1119,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-51jpg-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-51jpg-300x300.jpg',
      '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg'
    ],
    fallbackImage: '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg',
    description: 'Deep crimson pitted dried cherries with luscious sweet-tart orchard flavor. Rich in natural melatonin for muscle recovery and calm sleep.',
    origin: 'Kashmir & Selected Orchard Reserve',
    grade: 'Pitted Whole Dried Cherries',
    features: ['Pitted & Ready to Eat', 'Natural Bio-Melatonin', 'Deep Crimson Color', 'Rich Sweet-Tart Bite'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Bright, rich cherry pie tang with deep natural sweetness',
    jammuStory: 'Carefully pitted and cured to keep whole fruit structure intact for baking and snacking.',
    inStock: true,
    harvestSeason: 'Summer Harvest',
    status: 'published',
    nutrition: {
      calories: '333 kcal / 100g',
      protein: '2.0g Dietary Protein',
      keyNutrient: 'Natural Melatonin & Cherry Anthocyanins',
      minerals: 'Potassium, Vitamin A, Copper & Iron',
      healthPillars: [
        { title: 'Restful Sleep Rhythm', desc: 'Natural bio-melatonin supports circadian calm.' },
        { title: 'Post-Workout Recovery', desc: 'Tart cherry polyphenols soothe muscle soreness.' },
        { title: 'Heart & Joint Comfort', desc: 'High antioxidant anthocyanin profile.' }
      ]
    }
  },
  {
    id: 'berry-dry-kiwi',
    name: 'Dry Kiwi (Sliced Dried Kiwi)',
    hindiName: 'सूखी कीवी स्लाइस',
    subtitle: 'Tangy Jade Dried Kiwi Slices 250g, 500g & 1kg',
    price: 839,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-43-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-43-300x300.jpg',
      '/assets/aistudio/295190b67948ef58902b7efe5b0311a0_8daf8c64.jpg'
    ],
    fallbackImage: '/assets/aistudio/295190b67948ef58902b7efe5b0311a0_8daf8c64.jpg',
    description: 'Vibrant jade-green sliced dried kiwi with zesty tropical-tart flavor, crisp kiwi seeds, and abundant Vitamin C.',
    origin: 'Curated by Seth And Sons DryFruits, Jammu',
    grade: 'Choice Sliced Dried Kiwi',
    features: ['Whole Ring Slices', 'Vitamin C Rich', 'Zesty Sweet-Tart Chew', 'Great for Grazing Boards'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Refined sweet citrus-berry kiwi tang',
    jammuStory: 'Packed flat and sealed airtight in Jammu so delicate green slices keep soft freshness.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '285 kcal / 100g',
      protein: '1.8g Dietary Protein',
      keyNutrient: 'Vitamin C & Actinidin Digestive Enzyme',
      minerals: 'Vitamin C, Potassium, Vitamin K & Fiber',
      healthPillars: [
        { title: 'Immunity Support', desc: 'Rich natural Vitamin C content.' },
        { title: 'Protein Digestion', desc: 'Actinidin naturally aids digestion.' },
        { title: 'Vibrant Snack', desc: 'Refreshing tangy energy treat.' }
      ]
    }
  },
  {
    id: 'seed-flax',
    name: 'Flax Seeds (Alsi / Flux Seeds)',
    hindiName: 'अलसी के बीज',
    subtitle: 'Roasted & Raw Omega-3 Rich Alsi Seeds 250g, 500g & 1kg',
    price: 335,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-36-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-36-300x300.jpg',
      '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg'
    ],
    fallbackImage: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
    description: 'Glossy golden-brown Alsi (flax) seeds cleaned of chaff. Rich in plant Omega-3 ALA fatty acids, lignans, and gut-friendly mucilage.',
    origin: 'North Indian Plains & Jammu Heritage Selection',
    grade: 'Triple-Sorted Glossy Brown Alsi',
    features: ['Highest Plant Lignans', 'Omega-3 ALA Rich', 'Zero Stones or Chaff', 'Traditional Mukhwas Staple'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Warm toasted nutty crunch',
    jammuStory: 'A winter essential in Jammu for homemade Alsi Pinni and digestive post-meal mukhwas.',
    inStock: true,
    harvestSeason: 'Winter Harvest',
    status: 'published',
    nutrition: {
      calories: '534 kcal / 100g',
      protein: '18.3g Plant Protein',
      keyNutrient: 'Secoisolariciresinol Lignans & Omega-3 ALA',
      minerals: 'Thiamine, Copper, Magnesium & Manganese',
      healthPillars: [
        { title: 'Hormonal & Heart Balance', desc: 'Lignans and ALA support cardiovascular wellness.' },
        { title: 'Digestive Regularity', desc: '27g natural dietary fiber per 100g.' },
        { title: 'Hair & Skin Luster', desc: 'Essential fatty acids hydrate skin from within.' }
      ]
    }
  },
  {
    id: 'seed-muskmelon',
    name: 'Musk Melon Seeds (Kharbooja Magaz)',
    hindiName: 'खरबूजे के बीज (मगज)',
    subtitle: 'Shelled Ivory Char Magaz Kernels 250g, 500g & 1kg',
    price: 1679,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-50-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-50-300x300.jpg',
      '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg'
    ],
    fallbackImage: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
    description: 'Cleanly hulled milky-white Kharbooja Magaz (muskmelon) kernels. Cooling in Ayurvedic tradition and indispensable for royal gravies, thandai, and panjiri.',
    origin: 'Curated by Seth And Sons DryFruits, Jammu',
    grade: 'Hulled Pure Ivory Magaz',
    features: ['100% Shelled White Kernels', 'Zero Hull Fragments', 'Ayurvedic Thandai Essential', 'High Protein & Zinc'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Mild creamy sweetness ideal for gravies and sweets',
    jammuStory: 'Sorted carefully so not a single tough outer seed husk reaches your kitchen.',
    inStock: true,
    harvestSeason: 'Summer Harvest',
    status: 'published',
    nutrition: {
      calories: '557 kcal / 100g',
      protein: '28.3g Plant Protein',
      keyNutrient: 'Linoleic Fatty Acids & Cooling Bioactives',
      minerals: 'Magnesium, Potassium, Zinc & Vitamin A',
      healthPillars: [
        { title: 'Ultra-High Plant Protein', desc: 'Over 28g protein per 100g.' },
        { title: 'Summer Coolant', desc: 'Traditional base for cooling thandai.' },
        { title: 'Rich Creamy Gravy Base', desc: 'Replaces heavy cream cleanly in Indian curries.' }
      ]
    }
  },
  {
    id: 'seed-pumpkin',
    name: 'Pumpkin Seeds (Pepitas)',
    hindiName: 'कद्दू के बीज',
    subtitle: 'Shelled Jade-Green AAA Grade Pepitas 250g, 500g & 1kg',
    price: 979,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-18-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-18-300x300.jpg',
      '/assets/aistudio/3c576d7519d8f23898ea5fb9043bb2d7_9d2bc35a.jpg'
    ],
    fallbackImage: '/assets/aistudio/3c576d7519d8f23898ea5fb9043bb2d7_9d2bc35a.jpg',
    description: 'Whole, hull-less jade-green AAA grade pumpkin seeds bursting with bioavailable zinc, magnesium, and 30g protein per 100g.',
    origin: 'Curated by Seth And Sons DryFruits, Jammu',
    grade: 'AAA Jade-Green Pepitas',
    features: ['30g Protein / 100g', 'Zinc & Magnesium Powerhouse', 'Whole Intact Kernels', 'Raw Unsalted Freshness'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Crisp, clean earthy-nutty snap',
    jammuStory: 'Graded for plump green wholeness with zero broken dust or oil rancidity.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '559 kcal / 100g',
      protein: '30.2g Plant Protein',
      keyNutrient: 'Bioavailable Zinc, Tryptophan & Phytosterols',
      minerals: 'Magnesium (130% RDA), Zinc, Iron & Copper',
      healthPillars: [
        { title: 'Immunity & Hormone Health', desc: 'Rich natural dietary zinc.' },
        { title: 'Deep Calm & Sleep', desc: 'High magnesium and natural tryptophan.' },
        { title: 'Cardio Vitality', desc: 'Phytosterols support balanced cholesterol.' }
      ]
    }
  },
  {
    id: 'berry-roseberry',
    name: 'Roseberry (Dried Roseberries)',
    hindiName: 'रोज़बेरी (सूखे)',
    subtitle: 'Fragrant Tangy-Sweet Dried Roseberries 250g, 500g & 1kg',
    price: 839,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-64-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-64-300x300.jpg',
      '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg'
    ],
    fallbackImage: '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg',
    description: 'Jewel-toned dried roseberries offering floral berry brightness, crisp chew, and natural Vitamin C richness for snacking and desserts.',
    origin: 'Curated by Seth And Sons DryFruits, Jammu',
    grade: 'Choice Dried Roseberries',
    features: ['Floral Berry Aroma', 'Antioxidant Vitamin C', 'Great in Trail Mixes', 'Zero Synthetic Dyes'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Delicate floral tang with soft sweet chew',
    jammuStory: 'Packed fresh in small batches to protect delicate color and crisp berry flavor.',
    inStock: true,
    harvestSeason: 'Summer Harvest',
    status: 'published',
    nutrition: {
      calories: '310 kcal / 100g',
      protein: '1.6g Dietary Protein',
      keyNutrient: 'Natural Vitamin C & Berry Bioflavonoids',
      minerals: 'Vitamin C, Potassium & Dietary Fiber',
      healthPillars: [
        { title: 'Skin Collagen Support', desc: 'Vitamin C aids healthy collagen synthesis.' },
        { title: 'Refreshing Antioxidant', desc: 'Brightens daily muesli and snacking.' },
        { title: 'Light Energy', desc: 'Fat-free fruity nourishment.' }
      ]
    }
  },
  {
    id: 'berry-seedless-apricot',
    name: 'Seedless Apricot (Khubani)',
    hindiName: 'बीज रहित सूखी खुबानी',
    subtitle: 'Soft Golden Seedless Dried Apricots 250g, 500g & 1kg',
    price: 1959,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-42-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-42-300x300.jpg',
      '/assets/aistudio/295190b67948ef58902b7efe5b0311a0_8daf8c64.jpg'
    ],
    fallbackImage: '/assets/aistudio/295190b67948ef58902b7efe5b0311a0_8daf8c64.jpg',
    description: 'Velvety, pit-free whole seedless apricots packed with beta-carotene, potassium, and iron. Soft, chewy, and naturally sweet-tart.',
    origin: 'Himalayan & Central Asian Reserve',
    grade: 'Choice Seedless Whole Khubani',
    features: ['100% Pitted Seedless', 'High Beta-Carotene', 'Soft Plump Flesh', 'Potassium & Iron Rich'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Lush tangy apricot nectar with soft velvety chew',
    jammuStory: 'De-seeded neatly and packed cool so every whole apricot stays tender and aromatic.',
    inStock: true,
    harvestSeason: 'Summer Harvest',
    status: 'published',
    nutrition: {
      calories: '241 kcal / 100g',
      protein: '3.4g Dietary Protein',
      keyNutrient: 'Beta-Carotene (Provitamin A) & Potassium',
      minerals: 'Potassium (1162mg), Iron, Vitamin A & Fiber',
      healthPillars: [
        { title: 'Vision & Skin Radiance', desc: 'Exceptional beta-carotene levels nourish eyes and skin.' },
        { title: 'Blood Pressure Support', desc: 'Concentrated potassium supports vascular health.' },
        { title: 'Hemoglobin Boost', desc: 'Good non-heme iron source.' }
      ]
    }
  },
  {
    id: 'berry-strawberry',
    name: 'Strawberry (Dried Strawberries)',
    hindiName: 'सूखी स्ट्रॉबेरी',
    subtitle: 'Whole Gourmet Dried Strawberries 250g, 500g & 1kg',
    price: 1343,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-44-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-44-300x300.jpg',
      '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg'
    ],
    fallbackImage: '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg',
    description: 'Whole aromatic dried strawberries bursting with nostalgic summer sweetness. Perfect over pancakes, yogurt bowls, dark chocolate bark, or snacking.',
    origin: 'Curated by Seth And Sons DryFruits, Jammu',
    grade: 'Whole Gourmet Dried Berries',
    features: ['Whole Aromatic Berries', 'High Vitamin C', 'Great with Yogurt & Oats', 'Delicate Ruby Sweetness'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Lush fragrant strawberry jam flavor with tender bite',
    jammuStory: 'Carefully packed to preserve fragrant strawberry esters without sticky clumping.',
    inStock: true,
    harvestSeason: 'Spring Harvest',
    status: 'published',
    nutrition: {
      calories: '325 kcal / 100g',
      protein: '2.1g Dietary Protein',
      keyNutrient: 'Ellagic Acid & Vitamin C',
      minerals: 'Vitamin C, Manganese, Folate & Potassium',
      healthPillars: [
        { title: 'Radiant Skin', desc: 'Antioxidant Vitamin C supports skin clarity.' },
        { title: 'Natural Sweetness', desc: 'Healthy alternative to refined candy.' },
        { title: 'Digestive Fiber', desc: 'Gentle soluble fruit fiber.' }
      ]
    }
  },
  {
    id: 'seed-sunflower',
    name: 'Sunflower Seeds',
    hindiName: 'सूरजमुखी के बीज',
    subtitle: 'Raw Hulled White-Grey Sunflower Kernels 250g, 500g & 1kg',
    price: 503,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-35-600x600.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-35-600x600.jpg',
      '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg'
    ],
    fallbackImage: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
    description: 'Cleanly hulled raw sunflower seed kernels rich in Vitamin E, selenium, and wholesome crunch for salads, artisan breads, and daily snacking.',
    origin: 'Curated by Seth And Sons DryFruits, Jammu',
    grade: 'Hulled Bakery & Snack Grade',
    features: ['100% Shell-Free Kernels', 'Highest Vitamin E Seed', 'Selenium & Folate Rich', 'Crisp Raw Nutty Bite'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Light, crisp roasted-nutty creaminess',
    jammuStory: 'Sorted cleanly for uniform hull-free kernels and stored cool to preserve delicate Vitamin E oils.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '584 kcal / 100g',
      protein: '20.8g Plant Protein',
      keyNutrient: 'Alpha-Tocopherol (Vitamin E — 234% RDA) & Selenium',
      minerals: 'Vitamin E, Selenium, Magnesium & Vitamin B6',
      healthPillars: [
        { title: 'Cellular Lipid Shield', desc: 'Premier plant source of fat-soluble Vitamin E.' },
        { title: 'Thyroid & Immune Care', desc: 'High natural selenium mineral content.' },
        { title: 'Everyday Protein Crunch', desc: 'Over 20g protein per 100g.' }
      ]
    }
  },
  // --- Dates & Honey ---
  {
    id: 'honey-acacia',
    name: 'Acacia Honey (Pure Kashmiri Acacia)',
    hindiName: 'कश्मीरी बबूल शहद',
    subtitle: 'Raw Unheated Pale Gold Kashmiri Acacia Honey 250g, 500g & 1kg',
    price: 979,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-81-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-81-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Monofloral, crystal-clear pale gold Kashmiri Acacia honey harvested from high mountain blossoms. Naturally slow-crystallizing with light floral sweetness.',
    origin: 'Kashmir Valley Acacia Groves',
    grade: 'Raw Unheated Monofloral Acacia',
    features: ['100% Pure Unheated Honey', 'Resists Fast Crystallization', 'Low Glycemic Fructose Ratio', 'Zero Sugar Syrups'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Delicate floral blossom sweetness with clean silky finish',
    jammuStory: 'Harvested from spring acacia blooms in high Kashmiri valleys without pasteurization heat, keeping natural enzymes alive.',
    inStock: true,
    harvestSeason: 'Spring Bloom',
    status: 'published',
    nutrition: {
      calories: '304 kcal / 100g',
      protein: '0.3g Trace Enzymes',
      keyNutrient: 'Raw Pollen Flavonoids & Natural Invertase Enzymes',
      minerals: 'Potassium, Trace Magnesium, Zinc & Antioxidants',
      healthPillars: [
        { title: 'Live Enzyme Purity', desc: 'Never superheated or ultra-filtered.' },
        { title: 'Soothing Throat Care', desc: 'Coats bronchial pathways gently.' },
        { title: 'Clean Natural Sweetener', desc: 'Ideal for Kashmiri Kahwa and green teas.' }
      ]
    }
  },
  {
    id: 'dates-ajwa',
    name: 'Ajwa Khajur (Medina Ajwa Dates)',
    hindiName: 'अजवा खजूर',
    subtitle: 'Velvety Dark Soft Medina Ajwa Dates 250g, 500g & 1kg',
    price: 1959,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-78-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-78-300x300.jpg',
      '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg'
    ],
    fallbackImage: '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg',
    description: 'Revered ebony-dark Ajwa dates with velvety fine skin, prune-caramel richness, and gentle natural sweetness prized for heart health and fasting nourishment.',
    origin: 'Medina Reserve • Curated in Jammu',
    grade: 'Authentic Soft Ajwa Reserve',
    features: ['Zero Added Glucose Syrup', 'Soft Velvety Texture', 'Heart & Hemoglobin Support', 'Gentle Natural Sweetness'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Rich caramel-cocoa & dried plum complexity without cloying sweetness',
    jammuStory: 'Kept cool in Jammu heritage storage to maintain authentic soft bite and delicate skin lines.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '282 kcal / 100g',
      protein: '2.5g Dietary Protein',
      keyNutrient: 'Caffeic Acid, Polyphenols & Soluble Fiber',
      minerals: 'Potassium, Magnesium, Iron & Copper',
      healthPillars: [
        { title: 'Cardioprotective Traditions', desc: 'Rich in unique date polyphenols and potassium.' },
        { title: 'Sustained Vitality', desc: 'Natural unrefined energy without crashes.' },
        { title: 'Bone & Iron Support', desc: 'Balanced minerals for daily resilience.' }
      ]
    }
  },
  {
    id: 'dates-arabian',
    name: 'Arabian Dates (Soft Khajur)',
    hindiName: 'अरबियन खजूर',
    subtitle: 'Plump Naturally Sweet Arabian Dates 250g, 500g & 1kg',
    price: 699,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-83-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-83-300x300.jpg',
      '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg'
    ],
    fallbackImage: '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg',
    description: 'Wholesome, naturally sweet everyday Arabian dates with tender mahogany flesh and rich caramel aroma. Great for shakes, desserts, and energy.',
    origin: 'Arabian Peninsula Harvest',
    grade: 'Select Soft Arabian Dates',
    features: ['Naturally Ripened Whole', 'Zero Glucose Glaze', 'Tender Mahogany Flesh', 'Daily Family Pack'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Warm brown sugar & toasted caramel chew',
    jammuStory: 'Hand-packed cleanly in Jammu with zero artificial sugar coating.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '277 kcal / 100g',
      protein: '1.8g Dietary Protein',
      keyNutrient: 'Potassium & Natural Fruit Fiber',
      minerals: 'Potassium, Magnesium, Iron & Vitamin B6',
      healthPillars: [
        { title: 'Clean Daily Fuel', desc: 'Healthy alternative to refined sugar.' },
        { title: 'Digestive Ease', desc: 'Natural dietary fiber aids regularity.' },
        { title: 'Electrolyte Balance', desc: 'Replenishes potassium after workouts.' }
      ]
    }
  },
  {
    id: 'dates-fard-premium',
    name: 'Fard Premium Dates',
    hindiName: 'फर्द प्रीमियम खजूर',
    subtitle: 'Glossy Dark Smooth-Skinned Fard Dates 250g, 500g & 1kg',
    price: 699,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-117-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-117-300x300.jpg',
      '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg'
    ],
    fallbackImage: '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg',
    description: 'Firm, chewy, glossy dark brown Fard dates famous for their clean non-sticky bite, mild balanced sweetness, and dense chewy flesh.',
    origin: 'Oman & Arabian Reserve',
    grade: 'Fard Choice Grade',
    features: ['Non-Sticky Firm Bite', 'Mild Clean Sweetness', 'Low Moisture Density', 'Long Fresh Shelf Life'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Clean butterscotch-date flavor without syrupiness',
    jammuStory: 'Favored by patrons who love an authentic firm-chewy date without sticky skins.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '277 kcal / 100g',
      protein: '1.8g Dietary Protein',
      keyNutrient: 'Carotenoids & Phenolic Antioxidants',
      minerals: 'Potassium, Copper, Manganese & Magnesium',
      healthPillars: [
        { title: 'Gentle Sugar Profile', desc: 'Balanced natural sweetness.' },
        { title: 'Mineral Vitality', desc: 'Rich natural copper and potassium.' },
        { title: 'On-the-Go Energy', desc: 'Zero-mess snacking anytime.' }
      ]
    }
  },
  {
    id: 'honey-gulkand',
    name: 'Gulkand Honey',
    hindiName: 'गुलकंद शहद',
    subtitle: 'Damask Rose Petal Infused Pure Honey 250g, 500g & 1kg',
    price: 419,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-124-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-124-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Sun-matured Damask rose petals gently blended into raw mountain honey with zero refined white sugar. Cooling Ayurvedic digestive elixir.',
    origin: 'Jammu Ayurvedic Infusions',
    grade: 'Sugar-Free Raw Honey Gulkand',
    features: ['Zero Refined Sugar', 'Sun-Matured Rose Petals', 'Cooling Digestive Tonic', 'Rich Rose Aroma'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Lush fragrant Damascus rose petals suspended in silky honey',
    jammuStory: 'Crafted in Jammu following heritage Ayurvedic sun-cooking methods — pure honey instead of cane sugar.',
    inStock: true,
    harvestSeason: 'Spring Rose Bloom',
    status: 'published',
    nutrition: {
      calories: '295 kcal / 100g',
      protein: '0.4g Natural Enzymes',
      keyNutrient: 'Rose Essential Polyphenols & Honey Enzymes',
      minerals: 'Potassium, Vitamin C & Natural Bioactives',
      healthPillars: [
        { title: 'Acidity & Pitta Relief', desc: 'Cools stomach heat and calms acidity.' },
        { title: 'Refined-Sugar Free', desc: '100% pure honey base.' },
        { title: 'Milk & Dessert Luxury', desc: 'Transforms warm milk, paan, and kulfi.' }
      ]
    }
  },
  {
    id: 'dates-kalmi',
    name: 'Kalmi Khajur (Safawi Reserve Dates)',
    hindiName: 'कलमी खजूर',
    subtitle: 'Plump Moist Ebony-Dark Safawi Kalmi Dates 250g, 500g & 1kg',
    price: 1119,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-79-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-79-300x300.jpg',
      '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg'
    ],
    fallbackImage: '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg',
    description: 'Long, plump black-brown Safawi Kalmi dates celebrated for soft melt-in-mouth flesh, deep molasses caramel notes, and rich mineral density.',
    origin: 'Saudi Medina Orchards • Curated in Jammu',
    grade: 'Jumbo Safawi Kalmi Grade A+',
    features: ['Soft Meaty Pulp', 'Deep Ebony Color', 'Zero Glucose Bath', 'High Potassium & Iron'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Lush melt-in-mouth toffee sweetness',
    jammuStory: 'Our highest-demand soft date variety in Jammu, selected for generous meatiness and thin skin.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '280 kcal / 100g',
      protein: '2.2g Dietary Protein',
      keyNutrient: 'Phenolic Antioxidants & Dietary Fiber',
      minerals: 'Potassium, Magnesium, Iron & Vitamin B6',
      healthPillars: [
        { title: 'Daily Stamina', desc: 'Ideal morning or pre-workout fuel.' },
        { title: 'Hemoglobin Support', desc: 'Natural iron and copper combination.' },
        { title: 'Digestive Support', desc: 'Rich soluble fruit fiber.' }
      ]
    }
  },
  {
    id: 'honey-kesar',
    name: 'Kesar Honey (Saffron-Infused Honey)',
    hindiName: 'केसरिया शहद',
    subtitle: 'Grade 1 Kashmiri Mongra Saffron Infused Pure Honey 250g, 500g & 1kg',
    price: 1119,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-95-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-95-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Raw Himalayan wildflower honey steeped patiently with pure Grade-1 Kashmiri Mongra saffron stigmas. Luminous golden hue and royal aroma.',
    origin: 'Jammu & Kashmir Saffron-Honey Reserve',
    grade: 'Mongra Saffron Infused Pure Honey',
    features: ['Real Kashmiri Saffron Strands', 'Unheated Raw Honey', 'No Artificial Essence', 'Royal Winter Elixir'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Silky wildflower honey kissed with warm saffron floral notes',
    jammuStory: 'Infused slowly inside glass jars in Jammu using our flagship Pampore Mongra saffron threads.',
    inStock: true,
    harvestSeason: 'Autumn Bloom',
    status: 'published',
    nutrition: {
      calories: '304 kcal / 100g',
      protein: '0.4g Natural Enzymes',
      keyNutrient: 'Crocin Carotenoids, Safranal & Live Honey Enzymes',
      minerals: 'Potassium, Manganese & Natural Antioxidants',
      healthPillars: [
        { title: 'Warmth & Mood Balance', desc: 'Saffron crocin uplifts mood and mental calm.' },
        { title: 'Winter Immunity', desc: 'Raw honey + saffron protects throat and airways.' },
        { title: 'Skin Glow', desc: 'Antioxidant richness nourishes complexion.' }
      ]
    }
  },
  {
    id: 'honey-kashmiri',
    name: 'Natural Kashmiri Honey',
    hindiName: 'प्राकृतिक कश्मीरी शहद',
    subtitle: 'Pure Unprocessed Highland Multiflora Honey 250g, 500g & 1kg',
    price: 629,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-80-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-80-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Authentic raw multiflora honey collected from unspoiled Kashmir and Chenab hillside wildflowers. Thick amber body with rich botanical complexity.',
    origin: 'Kashmir & Chenab Forest Meadows',
    grade: '100% Pure Raw Highland Honey',
    features: ['NMR Purity Profile', 'Zero Sugar Adulteration', 'Unheated & Unfiltered', 'Wildflower Botanicals'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Warm amber richness with subtle mountain wildflower spice',
    jammuStory: 'Sourced directly from trusted migratory apiaries across Jammu & Kashmir high meadows.',
    inStock: true,
    harvestSeason: 'Summer Blossom',
    status: 'published',
    nutrition: {
      calories: '304 kcal / 100g',
      protein: '0.3g Trace Enzymes',
      keyNutrient: 'Wildflower Polyphenols, Propolis & Live Enzymes',
      minerals: 'Potassium, Calcium, Iron & Trace Minerals',
      healthPillars: [
        { title: 'Daily Immunity', desc: 'Natural antibacterial honey properties.' },
        { title: 'Throat Soothing', desc: 'Gentle morning warm water & lemon partner.' },
        { title: 'Pure Unrefined Nutrition', desc: 'Trace pollen grains preserved intact.' }
      ]
    }
  },
  {
    id: 'dates-shuara',
    name: 'Shuara (Black Kharik / Dry Dates)',
    hindiName: 'काला छुआरा (खारीक)',
    subtitle: 'Traditional Ayurvedic Sun-Dried Black Kharik 250g, 500g & 1kg',
    price: 559,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-66-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-66-300x300.jpg',
      '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg'
    ],
    fallbackImage: '/assets/aistudio/832ffaad3250b94928b1886a927f3898_fbaaeeda.jpg',
    description: 'Traditional dark sun-dried Black Kharik (Chhuara) revered in Ayurveda for boiling in winter milk, panjiri, and bone-strengthening tonics.',
    origin: 'Curated in Jammu Heritage Mandi',
    grade: 'Select Whole Black Chhuara',
    features: ['Traditional Winter Milk Tonic', 'High Calcium & Iron', 'Sun-Cured Hard Dry Date', 'Zero Chemical Polishes'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Concentrated roasted date sweetness ideal for simmering in milk',
    jammuStory: 'A winter staple in Jammu kitchens — simmered with badam and kesar for deep strength and warmth.',
    inStock: true,
    harvestSeason: 'Winter Harvest',
    status: 'published',
    nutrition: {
      calories: '314 kcal / 100g',
      protein: '2.5g Dietary Protein',
      keyNutrient: 'Concentrated Iron, Calcium & Prebiotic Fiber',
      minerals: 'Calcium, Iron, Potassium & Magnesium',
      healthPillars: [
        { title: 'Bone & Joint Strength', desc: 'Dense mineral density when simmered in milk.' },
        { title: 'Winter Warmth', desc: 'Ayurvedic restorative tonic for stamina.' },
        { title: 'Blood Vitality', desc: 'Rich natural dietary iron.' }
      ]
    }
  },
  // --- Cold-Pressed Oils ---
  {
    id: 'oil-almond-100ml',
    name: 'Almond Oil (Cold-Pressed Badam Rogan)',
    hindiName: 'बादाम रोगन (शीत-निष्कर्षित)',
    subtitle: '100% Pure Cold-Pressed Sweet Almond Oil • 100ml Bottle',
    price: 349,
    unit: 'ml',
    step: 100,
    minQty: 100,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-65-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-65-300x300.jpg',
      '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg'
    ],
    fallbackImage: '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg',
    description: 'Pure wood-pressed sweet almond oil (Badam Rogan) extracted without heat or solvents. Ideal for nightly milk tonic, glowing skin, and hair nourishment.',
    origin: 'Cured & Cold-Pressed in Jammu',
    grade: '100% Pure Wood-Pressed Badam Rogan',
    features: ['Zero Hexane or Solvents', 'Rich Vitamin E & Oleic Lipids', 'Edible & Cosmetic Purity', 'First-Press Unrefined'],
    variants: ['100ml', '250ml', '500ml', '1000ml'],
    tasteProfile: 'Silky sweet toasted-almond essence',
    jammuStory: 'Pressed slowly at ambient temperature in Jammu from rich Mamra and Gurbandi almonds.',
    inStock: true,
    harvestSeason: 'Fresh Cold-Press Batch',
    status: 'published',
    nutrition: {
      calories: '884 kcal / 100ml',
      protein: 'Pure Botanical Lipid',
      keyNutrient: 'Vitamin E (Alpha-Tocopherol) & Monounsaturated Oleic Acid',
      minerals: 'Bioactive Tocopherols, Phytosterols & Omega-9',
      healthPillars: [
        { title: 'Neural & Brain Tonic', desc: 'A teaspoon in warm milk calms and nourishes the nervous system.' },
        { title: 'Luminous Skin & Hair', desc: 'Absorbs cleanly to restore dermal elasticity.' },
        { title: 'Pure Unrefined First Press', desc: 'Zero chemical refining or mineral oil fillers.' }
      ]
    }
  },
  {
    id: 'oil-apricot-100ml',
    name: 'Apricot Oil (Cold-Pressed Khubani Oil)',
    hindiName: 'खुबानी का तेल',
    subtitle: 'Pure Cold-Pressed Himalayan Apricot Kernel Oil • 100ml',
    price: 349,
    unit: 'ml',
    step: 100,
    minQty: 100,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-115-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-115-300x300.jpg',
      '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg'
    ],
    fallbackImage: '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg',
    description: 'Lightweight golden Khubani (apricot kernel) oil pressed cold from Himalayan mountain apricots. Deeply soothing for joints, baby massage, and dry skin.',
    origin: 'Ladakh & Jammu Cold-Press Cellars',
    grade: 'Pure Himalayan Khubani Kernel Oil',
    features: ['Featherlight Absorption', 'High Vitamin A & E', 'Ideal for Joint & Massage Care', 'Zero Artificial Fragrance'],
    variants: ['100ml', '250ml', '500ml', '1000ml'],
    tasteProfile: 'Clean light nutty mountain kernel aroma',
    jammuStory: 'An ancient Himalayan skincare and joint-care staple cold-pressed from wild apricot kernels.',
    inStock: true,
    harvestSeason: 'Fresh Cold-Press Batch',
    status: 'published',
    nutrition: {
      calories: '884 kcal / 100ml',
      protein: 'Pure Botanical Lipid',
      keyNutrient: 'Gamma-Linolenic Acid & Tocopherols (Vitamin E)',
      minerals: 'Vitamin A, Vitamin E & Omega-6 / Omega-9 Lipids',
      healthPillars: [
        { title: 'Joint Comfort', desc: 'Traditional Himalayan warming massage oil.' },
        { title: 'Skin Barrier Repair', desc: 'Nourishes sensitive skin without clogging pores.' },
        { title: 'Pure Botanical Extraction', desc: 'Zero parabens, mineral oil, or solvents.' }
      ]
    }
  },
  {
    id: 'oil-kalonji-100ml',
    name: 'Kalonji Oil (Cold-Pressed Black Seed Oil)',
    hindiName: 'कलौंजी का तेल',
    subtitle: 'Virgin Nigella Sativa Cold-Pressed Black Seed Oil • 100ml',
    price: 349,
    unit: 'ml',
    step: 100,
    minQty: 100,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-116-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-116-300x300.jpg',
      '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg'
    ],
    fallbackImage: '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg',
    description: 'Potent first-press Kalonji (Nigella sativa) black seed oil rich in active Thymoquinone. Supports respiratory immunity, scalp strength, and metabolic wellness.',
    origin: 'Curated & Cold-Pressed in Jammu',
    grade: 'Virgin High-Thymoquinone Kalonji Oil',
    features: ['Active Thymoquinone', 'Cold-Pressed Unfiltered', 'Scalp & Immunity Tonic', 'Zero Carrier Dilution'],
    variants: ['100ml', '250ml', '500ml', '1000ml'],
    tasteProfile: 'Robust peppery aromatic black-seed spice',
    jammuStory: 'Pressed in small batches from pure black seeds with zero carrier oil blending.',
    inStock: true,
    harvestSeason: 'Fresh Cold-Press Batch',
    status: 'published',
    nutrition: {
      calories: '884 kcal / 100ml',
      protein: 'Pure Botanical Lipid',
      keyNutrient: 'Thymoquinone, Thymol & Linoleic Acid',
      minerals: 'Essential Volatile Oils, Omega-6 & Antioxidants',
      healthPillars: [
        { title: 'Immunity & Respiratory Shield', desc: 'Potent natural thymoquinone bioactivity.' },
        { title: 'Scalp & Hair Roots', desc: 'Nourishes follicles and reduces dryness.' },
        { title: 'Metabolic Support', desc: 'Traditional honey-and-kalonji morning wellness drop.' }
      ]
    }
  },
  {
    id: 'oil-walnut-100ml',
    name: 'Walnut Oil (Cold-Pressed Akhrot Oil)',
    hindiName: 'अखरोट का तेल',
    subtitle: 'Virgin Kashmiri Walnut Omega-3 Cold-Pressed Oil • 100ml',
    price: 349,
    unit: 'ml',
    step: 100,
    minQty: 100,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-30-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-30-300x300.jpg',
      '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg'
    ],
    fallbackImage: '/assets/aistudio/d4c33b6c127da3b7594b2dc2bf6ad056_21202fa1.jpg',
    description: 'Golden virgin oil pressed cold from Kashmiri walnut kernels. Abundant in heart-protective Omega-3 ALA fatty acids for salads, finishing drizzles, and hair care.',
    origin: 'Jammu & Kashmir Walnut Cold-Press',
    grade: 'Virgin Unrefined Walnut Oil',
    features: ['Rich Plant Omega-3 ALA', 'Single-Press Unrefined', 'Nutty Culinary & Massage Oil', 'Zero Chemical Extraction'],
    variants: ['100ml', '250ml', '500ml', '1000ml'],
    tasteProfile: 'Fragrant roasted walnut nectar with smooth finish',
    jammuStory: 'Pressed cold from Kishtwar walnut kernels to retain delicate Omega-3 ALA lipids intact.',
    inStock: true,
    harvestSeason: 'Fresh Cold-Press Batch',
    status: 'published',
    nutrition: {
      calories: '884 kcal / 100ml',
      protein: 'Pure Botanical Lipid',
      keyNutrient: 'Plant Omega-3 ALA & Ellagic Acid Polyphenols',
      minerals: 'Vitamin E, Omega-3 / Omega-6 & Phytosterols',
      healthPillars: [
        { title: 'Heart & Arterial Health', desc: 'Concentrated plant Omega-3 ALA.' },
        { title: 'Brain & Neural Lipid Care', desc: 'Essential polyunsaturated fatty acids.' },
        { title: 'Deep Hair & Scalp Glow', desc: 'Seals moisture and strengthens strands.' }
      ]
    }
  },
  // --- Almonds (Badam) ---
  {
    id: 'badam-kagzi-shell',
    name: 'Badam Kagzi With Shell',
    hindiName: 'कागजी बादाम साबुत',
    subtitle: 'Paper-Thin In-Shell Himalayan Almonds 500g & 1kg',
    price: 699,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-74-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-74-300x300.jpg',
      '/assets/aistudio/2a3c89dd1edf49b4c54431c043fd7a29_4031e226.jpg'
    ],
    fallbackImage: '/assets/aistudio/2a3c89dd1edf49b4c54431c043fd7a29_4031e226.jpg',
    description: 'Naturally sweet Kagzi almonds protected inside paper-thin shells you can crack easily with bare fingers, sealing in fresh almond oils.',
    origin: 'Jammu & Kashmir Foothills',
    grade: 'Paper-Shell Kagzi Harvest',
    features: ['Easy Finger-Crack Shell', 'High Natural Almond Oil', 'Sun-Cured Unbleached', 'Sweet Crisp Kernel'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Crisp earthen sweetness with rich natural oil sheen',
    jammuStory: 'Kept inside nature’s airtight paper shell until cracked fresh, preserving sweet oil aromatics.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '579 kcal / 100g',
      protein: '21.2g Plant Protein',
      keyNutrient: 'Natural Almond Oil & Vitamin E',
      minerals: 'Vitamin E, Riboflavin, Calcium & Magnesium',
      healthPillars: [
        { title: 'Neural Vitality', desc: 'Riboflavin and lipids nourish brain function.' },
        { title: 'Skin Glow', desc: 'Rich Vitamin E supports cellular health.' },
        { title: 'Sustained Energy', desc: 'Protein and healthy fats keep you energized.' }
      ]
    }
  },
  {
    id: 'badam-california-giri',
    name: 'California Badam Giri (Almond Kernels)',
    hindiName: 'कैलिफोर्निया बादाम गिरी',
    subtitle: 'Uniform Extra-Crunch Whole Almond Kernels 250g, 500g & 1kg',
    price: 1623,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-93-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2022/02/Dummy-93-300x300.jpg',
      '/assets/aistudio/2a3c89dd1edf49b4c54431c043fd7a29_4031e226.jpg'
    ],
    fallbackImage: '/assets/aistudio/2a3c89dd1edf49b4c54431c043fd7a29_4031e226.jpg',
    description: 'Uniform, plump Nonpareil California almond kernels prized for sweet milkiness, snappy crunch, and everyday morning soaking.',
    origin: 'California Select • Graded in Jammu',
    grade: 'Supreme Nonpareil Whole Giri',
    features: ['Uniform Large Kernels', 'Crisp Sweet Snap', 'Zero Bitter Kernels', 'Ideal for Badam Milk'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Clean milky crunch with gentle roasted-nut sweetness',
    jammuStory: 'Hand-sorted in Jammu for spotless unbroken kernels and zero rancidity.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '579 kcal / 100g',
      protein: '21.2g Plant Protein',
      keyNutrient: 'Alpha-Tocopherol (Vitamin E) & Monounsaturated Fats',
      minerals: 'Magnesium, Calcium, Iron & Riboflavin',
      healthPillars: [
        { title: 'Daily Brain Fuel', desc: 'Classic soaked morning wellness nut.' },
        { title: 'Heart Health', desc: 'Monounsaturated fats support lipid balance.' },
        { title: 'Muscle Recovery', desc: 'Over 21g natural plant protein.' }
      ]
    }
  },
  {
    id: 'badam-chapti-giri',
    name: 'Chapti Badam Giri (Flat Kashmiri Kernels)',
    hindiName: 'चपटी बादाम गिरी',
    subtitle: 'Traditional High-Oil Flat Almond Kernels 250g, 500g & 1kg',
    price: 1511,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/04/Dummy-97-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/04/Dummy-97-300x300.jpg',
      '/assets/aistudio/2a3c89dd1edf49b4c54431c043fd7a29_4031e226.jpg'
    ],
    fallbackImage: '/assets/aistudio/2a3c89dd1edf49b4c54431c043fd7a29_4031e226.jpg',
    description: 'Flatter, oil-dense Badam Giri kernels favored across North India for ultra-creamy badam rogan, halwa, and morning soaking.',
    origin: 'Kashmir & Jammu Heritage Cellars',
    grade: 'High-Oil Flat Chapti Giri',
    features: ['Dense Almond Oil Content', 'Rich Creamy Paste Yield', 'Thin Peeling Skin', 'Intense Sweet Crunch'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Rich buttery almond paste depth with sweet aroma',
    jammuStory: 'Chosen by traditional halwais and families in Jammu for maximum oil release when ground.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '585 kcal / 100g',
      protein: '21.0g Plant Protein',
      keyNutrient: 'Concentrated Almond Oil & Vitamin E',
      minerals: 'Vitamin E, Magnesium, Phosphorus & Calcium',
      healthPillars: [
        { title: 'Ultra-Creamy Badam Milk', desc: 'Rich natural lipids blend silkily.' },
        { title: 'Skin Nourishment', desc: 'Natural tocopherols fight oxidation.' },
        { title: 'Ayurvedic Strength', desc: 'Deeply restorative winter nut.' }
      ]
    }
  },
  {
    id: 'badam-hanuman-mamra',
    name: 'Hanuman Mamra Badam',
    hindiName: 'हनुमान मामरा बादाम',
    subtitle: 'Traditional Concave High-Oil Mamra Almonds 500g & 1kg',
    price: 1259,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-75-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-75-300x300.jpg',
      '/assets/aistudio/2a3c89dd1edf49b4c54431c043fd7a29_4031e226.jpg'
    ],
    fallbackImage: '/assets/aistudio/2a3c89dd1edf49b4c54431c043fd7a29_4031e226.jpg',
    description: 'Distinctive boat-shaped Hanuman Mamra almonds packed with up to double the cold-pressed oil content of ordinary market almonds.',
    origin: 'Jammu & Iranian Heritage Trade',
    grade: 'Classic Hanuman Mamra Grade',
    features: ['Concave High-Oil Shape', 'Unmatched Energy Density', 'Athletic & Ayurvedic Favorite', 'Zero Artificial Polishing'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Robust earthy nuttiness with rich lingering almond oil',
    jammuStory: 'Revered across wrestling akhadas and Jammu households for stamina, memory, and cold-weather vitality.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '605 kcal / 100g',
      protein: '21.5g Plant Protein',
      keyNutrient: '~50% Pure Natural Almond Oil & L-Carnitine Precursors',
      minerals: 'Vitamin E, Magnesium, Calcium & Zinc',
      healthPillars: [
        { title: 'Peak Stamina Tonic', desc: 'High natural oil fuels endurance.' },
        { title: 'Cognitive Support', desc: 'Nourishes brain cells and recall.' },
        { title: 'Bone & Nerve Health', desc: 'Dense magnesium and calcium.' }
      ]
    }
  },
  {
    id: 'badam-kashmiri-giri',
    name: 'Kashmiri Badam Giri',
    hindiName: 'कश्मीरी बादाम गिरी',
    subtitle: 'Wild Highland Organic Kashmiri Almond Kernels 250g, 500g & 1kg',
    price: 1455,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/04/Dummy-73-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/04/Dummy-73-300x300.jpg',
      '/assets/aistudio/2a3c89dd1edf49b4c54431c043fd7a29_4031e226.jpg'
    ],
    fallbackImage: '/assets/aistudio/2a3c89dd1edf49b4c54431c043fd7a29_4031e226.jpg',
    description: 'Smaller, oil-glistening Kashmiri mountain almond kernels bursting with intense natural sweetness and aromatic almond essence.',
    origin: 'Pampore & Pulwama Orchards, Kashmir',
    grade: 'Authentic Kashmiri Pahadi Giri',
    features: ['Rain-Fed Mountain Orchards', 'High Oil Yield', 'Rich Traditional Flavor', 'Unprocessed Raw Kernels'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Concentrated wild almond flavor with crisp sweet snap',
    jammuStory: 'Brought down from Kashmiri terraced orchards to Jammu — prized for aroma far richer than irrigated varieties.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '590 kcal / 100g',
      protein: '21.4g Plant Protein',
      keyNutrient: 'Natural Almond Oils & Vitamin E',
      minerals: 'Vitamin E, Iron, Calcium & Magnesium',
      healthPillars: [
        { title: 'Mountain Purity', desc: 'Rain-fed highland trees with deep minerals.' },
        { title: 'Memory & Focus', desc: 'Rich riboflavin and vitamin E.' },
        { title: 'Digestive Vitality', desc: 'Pure unrefined dietary fiber.' }
      ]
    }
  },
  {
    id: 'badam-kashmiri-malai',
    name: 'Kashmiri Malai Badam Giri',
    hindiName: 'कश्मीरी मलाई बादाम गिरी',
    subtitle: 'Creamy Sweet Smooth-Skinned Kashmiri Kernels 250g, 500g & 1kg',
    price: 1455,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/04/Dummy-96-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/04/Dummy-96-300x300.jpg',
      '/assets/aistudio/2a3c89dd1edf49b4c54431c043fd7a29_4031e226.jpg'
    ],
    fallbackImage: '/assets/aistudio/2a3c89dd1edf49b4c54431c043fd7a29_4031e226.jpg',
    description: 'Exceptionally creamy Malai-grade Kashmiri almond kernels that soak silky soft and yield lush white almond milk and kesar badam drinks.',
    origin: 'Kashmir Valley Orchards',
    grade: 'Malai Creamy Select Grade',
    features: ['Silky Creamy Bite', 'High Moisture Retention', 'Soaks Tender Overnight', 'Zero Astringency'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Soft malai-like sweetness with delicate crunch',
    jammuStory: 'Selected specifically for creamy internal flesh that melts into warm saffron milk.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '585 kcal / 100g',
      protein: '21.2g Plant Protein',
      keyNutrient: 'Creamy Monounsaturated Almond Lipids & Vitamin E',
      minerals: 'Vitamin E, Magnesium, Calcium & Zinc',
      healthPillars: [
        { title: 'Silky Almond Milk', desc: 'Rich creamy pulp for drinks and kheer.' },
        { title: 'Skin Elasticity', desc: 'Abundant Vitamin E antioxidant.' },
        { title: 'Gentle Digestion', desc: 'Easy-to-peel smooth skin after soaking.' }
      ]
    }
  },
  {
    id: 'badam-kashmiri-mamra',
    name: 'Kashmiri Mamra Badam',
    hindiName: 'कश्मीरी मामरा बादाम',
    subtitle: 'Pure Mountain High-Oil Mamra Almonds 500g & 1kg',
    price: 979,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-76-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-76-300x300.jpg',
      '/assets/aistudio/2a3c89dd1edf49b4c54431c043fd7a29_4031e226.jpg'
    ],
    fallbackImage: '/assets/aistudio/2a3c89dd1edf49b4c54431c043fd7a29_4031e226.jpg',
    description: 'Authentic mountain Mamra almonds cherished for raw unrefined oil yield, rich nutty crunch, and potent daily winter nourishment.',
    origin: 'Kashmir Highland Orchards',
    grade: 'Kashmiri Mamra Value Reserve',
    features: ['Rich Natural Oil', '100% Unbleached', 'Crisp Earthen Crunch', 'Everyday Mamra Nutrition'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Earthy, oil-rich almond bite',
    jammuStory: 'Sourced straight from Kashmiri valleys for authentic Mamra nutrition at everyday value.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '600 kcal / 100g',
      protein: '21.3g Plant Protein',
      keyNutrient: 'Pure Almond Oil & Natural Tocopherols',
      minerals: 'Vitamin E, Magnesium, Iron & Calcium',
      healthPillars: [
        { title: 'Brain & Nerve Support', desc: 'Classic morning soaked tonic.' },
        { title: 'Heart Wellness', desc: 'Rich oleic acid fats.' },
        { title: 'Sustained Energy', desc: 'Steady slow-release nutrition.' }
      ]
    }
  },
  {
    id: 'badam-shahi-kesari',
    name: 'Shahi Kesari Badam Giri',
    hindiName: 'शाही केसरी बादाम गिरी',
    subtitle: 'Royal Jumbo Concave Shahi Mamra Kernels 250g, 500g & 1kg',
    price: 2183,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/04/Dummy-94-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/04/Dummy-94-300x300.jpg',
      '/assets/aistudio/2a3c89dd1edf49b4c54431c043fd7a29_4031e226.jpg'
    ],
    fallbackImage: '/assets/aistudio/2a3c89dd1edf49b4c54431c043fd7a29_4031e226.jpg',
    description: 'Our top-tier Shahi Kesari almond kernels — extraordinarily rich in natural oil (~50%), crisp, golden-amber, and prized for royal wellness & gifting.',
    origin: 'Iranian & Kashmiri Royal Reserve',
    grade: 'Shahi Kesari Royal Grade A++',
    features: ['~50% Pure Oil Content', 'Hand-Sorted Jumbo Size', 'Zero Broken Pieces', 'Prestige Gift Quality'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Exquisite rich almond oil burst with clean sweet crunch',
    jammuStory: 'Our premier Badam Giri selection reserved for royal hampers, expectant mothers, and high-performance nutrition.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '610 kcal / 100g',
      protein: '21.8g Complete Plant Protein',
      keyNutrient: '~50% Pure Almond Oil, Riboflavin & Vitamin E',
      minerals: 'Vitamin E, Magnesium, Calcium, Iron & Copper',
      healthPillars: [
        { title: 'Supreme Brain Tonic', desc: 'Unrivalled concentration of neural lipids and riboflavin.' },
        { title: 'Anti-Aging Radiance', desc: 'Abundant natural alpha-tocopherol.' },
        { title: 'Metabolic Balance', desc: 'High protein and healthy monounsaturated fats.' }
      ]
    }
  },
  // --- Spices ---
  {
    id: 'spice-hing-powder',
    name: 'Hing Powder (Asafoetida Powder)',
    hindiName: 'हींग पाउडर',
    subtitle: 'Potent Aromatic Compounded Asafoetida Powder 50g',
    price: 349,
    unit: 'gram',
    weightLabel: '50g',
    step: 50,
    minQty: 50,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-84-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-84-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Fine, pungent aroma-locked Hing powder milled cleanly for effortless tadka dispersion. Adds unmistakable savory umami and aids digestion.',
    origin: 'Curated in Jammu Spice Cellars',
    grade: 'Supreme Aromatic Hing Powder',
    features: ['Potent Pin-Drop Aroma', 'Digestive Tadka Spice', 'Zero Synthetic Fillers', 'Airtight Freshness Seal'],
    variants: ['50g', '100g', '250g'],
    tasteProfile: 'Deep savory roasted-allium aroma with lingering warmth',
    jammuStory: 'Packed fresh in aroma-seal tins in Jammu so a tiny pinch perfumes the whole meal.',
    inStock: true,
    harvestSeason: 'Current Harvest',
    status: 'published',
    nutrition: {
      calories: '297 kcal / 100g',
      protein: '4.0g Dietary Protein',
      keyNutrient: 'Ferulic Acid, Umbelliferone & Volatile Terpene Resins',
      minerals: 'Calcium, Iron, Phosphorus & Carminative Oils',
      healthPillars: [
        { title: 'Bloating & Gut Relief', desc: 'Traditional Indian carminative spice.' },
        { title: 'Savory Depth', desc: 'Enhances dals and curries cleanly.' },
        { title: 'Small-Pinch Potency', desc: 'High resin concentration per 50g.' }
      ]
    }
  },
  {
    id: 'spice-kashmiri-mirch-powder',
    name: 'Kashmiri Mirch Powder',
    hindiName: 'कश्मीरी लाल मिर्च पाउडर',
    subtitle: 'Vibrant Deep-Crimson Low-Heat Kashmiri Chilli Powder 250g, 500g & 1kg',
    price: 811,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-21-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-21-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Authentic stone-ground Kashmiri Deghi Mirch giving curries and tandoori marinades a luminous royal crimson glow with gentle aromatic warmth.',
    origin: 'Pampore & Kashmir Valley Chilli Belt',
    grade: 'Stone-Ground Kashmiri Lal Mirch',
    features: ['Zero Sudan Red Dye', 'Vibrant Natural Crimson', 'Mild Aromatic Heat', 'Cold-Milled Fine Powder'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Fruity, mildly smoky sweet capsicum warmth',
    jammuStory: 'Stem-removed and cold-milled in Jammu to keep natural red capsanthin color vibrant without synthetic dyes.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '282 kcal / 100g',
      protein: '12.0g Dietary Protein',
      keyNutrient: 'Capsanthin Carotenoids & Vitamin A',
      minerals: 'Vitamin C, Beta-Carotene, Iron & Potassium',
      healthPillars: [
        { title: '100% Dye-Free Glow', desc: 'Pure sun-cured Kashmiri chilli pigment.' },
        { title: 'Gentle Palate Heat', desc: 'Rich flavor without harsh pungency.' },
        { title: 'Antioxidant Carotenoids', desc: 'High natural capsanthin and Vitamin A.' }
      ]
    }
  },
  {
    id: 'spice-kashmiri-sabut-mirch',
    name: 'Kashmiri Sabut Mirch (Whole Red Chillies)',
    hindiName: 'कश्मीरी साबुत लाल मिर्च',
    subtitle: 'Wrinkled Sun-Cured Whole Kashmiri Chillies 250g, 500g & 1kg',
    price: 1231,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-22-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-22-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Whole sun-dried wrinkled Kashmiri chillies — rich crimson skin, fruity sweet aroma, and gentle heat for tempering, Rogan Josh, and homemade paste.',
    origin: 'Kashmir Valley Chilli Farms',
    grade: 'Whole Sun-Cured Kashmiri Sabut',
    features: ['Wrinkled Deep-Red Pods', 'Intact Aroma Oils', 'Ideal for Rogan Josh & Tempering', 'Zero Artificial Polish'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Rich fruity smoky capsicum aroma with mild heat',
    jammuStory: 'String-cured in crisp Kashmiri sun before hand-sorting in Jammu heritage cellars.',
    inStock: true,
    harvestSeason: 'Autumn Harvest',
    status: 'published',
    nutrition: {
      calories: '282 kcal / 100g',
      protein: '12.0g Dietary Protein',
      keyNutrient: 'Capsanthin & Mild Capsaicinoids',
      minerals: 'Vitamin A, Vitamin C, Potassium & Iron',
      healthPillars: [
        { title: 'Authentic Wazwan Base', desc: 'Essential whole chilli for traditional Kashmiri gravies.' },
        { title: 'Zero Adulteration', desc: 'Whole pods verify purity at a glance.' },
        { title: 'Metabolic Warmth', desc: 'Gentle thermogenic culinary spice.' }
      ]
    }
  },
  {
    id: 'spice-masala-tikki',
    name: 'Masala Tikki (Kashmiri Ver Spice Cake)',
    hindiName: 'कश्मीरी मसाला टिक्की (वेर)',
    subtitle: 'Hand-Pounded Traditional Kashmiri Pran & Spice Cake 125g & 250g',
    price: 252,
    unit: 'gram',
    weightLabel: '250g',
    step: 125,
    minQty: 125,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-105-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-105-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Authentic sun-cured Kashmiri Masala Tikki (Ver) — a fragrant spice cake pounded with Kashmiri shallots (pran), garlic, red chillies, fennel, and warm mustard oil.',
    origin: 'Traditional Kashmiri Pandit Kitchen Craft, Jammu',
    grade: 'Hand-Pounded Heritage Ver Tikki',
    features: ['Traditional Sun-Dried Ring Cake', 'Authentic Kashmiri Pran Base', 'Instant Rajma & Gravy Depth', 'Zero Preservatives'],
    variants: ['125g', '250g', '500g'],
    tasteProfile: 'Intense savory caramelized shallot & Kashmiri spice bouquet',
    jammuStory: 'Shaped by hand in traditional Jammu & Kashmiri homes — break off a small piece to perfume dals, nadru, and rajma.',
    inStock: true,
    harvestSeason: 'Summer Sun-Cured',
    status: 'published',
    nutrition: {
      calories: '310 kcal / 100g',
      protein: '8.5g Dietary Protein',
      keyNutrient: 'Pran Allium Organosulfurs & Spice Oils',
      minerals: 'Iron, Manganese, Calcium & Volatile Aromatics',
      healthPillars: [
        { title: 'Authentic Kashmir Heritage', desc: 'Centuries-old preserved aromatic spice wheel.' },
        { title: 'Digestive Spice Blend', desc: 'Fennel, ginger, and pran support smooth digestion.' },
        { title: 'Quick Culinary Magic', desc: 'Elevates simple curries instantly.' }
      ]
    }
  },
  {
    id: 'spice-dalchini',
    name: 'Natural Dalchini (Cinnamon Bark)',
    hindiName: 'प्राकृतिक दालचीनी',
    subtitle: 'Fragrant Unbleached Whole Cinnamon Bark 250g, 500g & 1kg',
    price: 1091,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-60-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-60-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Sweet, intensely aromatic whole natural Dalchini bark sticks essential for Kashmiri Kahwa, pulao, chai, and healthy blood-sugar balance.',
    origin: 'Curated in Jammu Spice Cellars',
    grade: 'Choice Whole Aromatic Cinnamon',
    features: ['High Essential Oil Bark', 'Kahwa & Chai Essential', 'Naturally Sweet Spice', 'Zero Artificial Polishing'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Warm sweet woody spice with citrus-clove finish',
    jammuStory: 'Broken gently and packed airtight in Jammu to keep cinnamaldehyde sweetness vibrant.',
    inStock: true,
    harvestSeason: 'Current Harvest',
    status: 'published',
    nutrition: {
      calories: '247 kcal / 100g',
      protein: '4.0g Dietary Protein',
      keyNutrient: 'Cinnamaldehyde & Polyphenol Antioxidants',
      minerals: 'Manganese, Calcium, Iron & Dietary Fiber',
      healthPillars: [
        { title: 'Glycemic Harmony', desc: 'Supports healthy insulin sensitivity.' },
        { title: 'Kashmiri Kahwa Heart', desc: 'Infuses saffron tea with warm fragrance.' },
        { title: 'Antioxidant Richness', desc: 'Among the highest ORAC spices.' }
      ]
    }
  },
  {
    id: 'spice-kali-mirch',
    name: 'Natural Kali Mirch (Black Pepper)',
    hindiName: 'काली मिर्च साबुत',
    subtitle: 'Bold High-Piperine Whole Black Peppercorns 250g, 500g & 1kg',
    price: 1679,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-59-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-59-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Dense, heavy TGSEB-grade whole black peppercorns bursting with pungent piperine bite, citrus-pine oils, and digestive warmth.',
    origin: 'Malabar & Curated in Jammu',
    grade: 'Bold Heavy Whole Peppercorns',
    features: ['High Piperine Pungency', 'Dense Heavy Berries', 'Zero Papaya Seed Mixing', 'Fresh Grinder Ready'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Sharp, woody citrus-pine heat that awakens the palate',
    jammuStory: 'Float-tested and sorted cleanly in Jammu so every peppercorn crushes oily and fragrant.',
    inStock: true,
    harvestSeason: 'Winter Harvest',
    status: 'published',
    nutrition: {
      calories: '251 kcal / 100g',
      protein: '10.4g Dietary Protein',
      keyNutrient: 'Piperine Alkaloid & Volatile Pepper Oils',
      minerals: 'Manganese, Vitamin K, Iron & Copper',
      healthPillars: [
        { title: 'Nutrient Bioavailability', desc: 'Piperine boosts absorption of turmeric curcumin.' },
        { title: 'Winter Throat Tonic', desc: 'Soothes congestion in kadha and honey.' },
        { title: 'Digestive Fire', desc: 'Stimulates clean enzyme secretion.' }
      ]
    }
  },
  {
    id: 'spice-laung',
    name: 'Natural Laung (Whole Cloves)',
    hindiName: 'साबुत लौंग',
    subtitle: 'Full-Bud Oil-Rich Aromatic Whole Cloves 250g, 500g & 1kg',
    price: 1959,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-57-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-57-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Handpicked whole unopened clove buds brimming with natural eugenol oil — never spent or oil-extracted.',
    origin: 'Curated in Jammu Spice Cellars',
    grade: 'Full-Crown High-Eugenol Whole Cloves',
    features: ['Unextracted Pure Buds', 'Intact Flower Crowns', 'Rich Eugenol Oil', 'Kahwa & Garam Masala Essential'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Intensely warm, sweet, numbing aromatic clove burst',
    jammuStory: 'Sorted for plump oil-rich buds that sink vertically in water — the classic hallmark of unextracted pure cloves.',
    inStock: true,
    harvestSeason: 'Current Harvest',
    status: 'published',
    nutrition: {
      calories: '274 kcal / 100g',
      protein: '6.0g Dietary Protein',
      keyNutrient: 'Eugenol Essential Oil & Phenolic Antioxidants',
      minerals: 'Manganese (260% RDA), Vitamin K, Magnesium & Calcium',
      healthPillars: [
        { title: 'Oral & Throat Comfort', desc: 'Natural eugenol soothes gums and throat.' },
        { title: 'Supreme Antioxidant', desc: 'Highest polyphenol concentration among spices.' },
        { title: 'Digestive & Kahwa Spice', desc: 'Warms winter beverages and biryanis.' }
      ]
    }
  },
  {
    id: 'spice-pure-hing',
    name: 'Pure Hing (Asafoetida)',
    hindiName: 'शुद्ध हींग (डली/पाउडर)',
    subtitle: 'High-Purity Traditional Raw Asafoetida 50g',
    price: 251,
    unit: 'gram',
    weightLabel: '50g',
    step: 50,
    minQty: 50,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-85-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-85-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Authentic high-purity Hing crafted through time-honored Jammu spice blending for unforgettable tadka fragrance and gentle digestion.',
    origin: 'Curated in Jammu Spice Cellars',
    grade: 'Pure Everyday Culinary Hing',
    features: ['Rich Authentic Tadka Aroma', 'Aids Legume Digestion', 'Zero Chemical Essence', 'Sealed Fresh Jar'],
    variants: ['50g', '100g', '250g'],
    tasteProfile: 'Classic warm roasted garlic-onion umami aroma in hot ghee',
    jammuStory: 'A household staple in Jammu kitchens for Rajma-Chawal, kadhi, and lentil tadkas.',
    inStock: true,
    harvestSeason: 'Current Harvest',
    status: 'published',
    nutrition: {
      calories: '297 kcal / 100g',
      protein: '4.0g Dietary Protein',
      keyNutrient: 'Disulfide Resin Oils & Ferulic Acid',
      minerals: 'Calcium, Iron & Digestif Bioactives',
      healthPillars: [
        { title: 'Gut Comfort', desc: 'Reduces gas from lentils and beans.' },
        { title: 'Pure Tadka Fragrance', desc: 'Blooms richly in hot desi ghee.' },
        { title: 'Zero Synthetic Perfume', desc: 'Honest botanical resin blend.' }
      ]
    }
  },
  {
    id: 'spice-shah-zeera',
    name: 'Shah Zeera (Royal Kashmiri Cumin Seeds)',
    hindiName: 'कश्मीरी शाही जीरा',
    subtitle: 'Wild Highland Kala Shahi Jeera 250g, 500g & 1kg',
    price: 1959,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-61-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-61-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Slender, intensely fragrant wild Kashmiri Shahi Jeera (Bunium persicum) prized for royal Wazwan, biryanis, and delicate nutty-smoky complexity.',
    origin: 'Kishtwar & Padder Mountain Slopes, J&K',
    grade: 'Authentic Wild Kashmiri Shahi Jeera',
    features: ['Wild Mountain Harvest', '3x More Fragrant Than Regular Cumin', 'Zero Grit or Stems', 'Royal Biryani Essential'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Complex sweet-earthy nutty pine fragrance unlike ordinary jeera',
    jammuStory: 'Foraged from high mountain pastures across Kishtwar and Padder — brought straight into our Jammu cellars.',
    inStock: true,
    harvestSeason: 'Summer Mountain Harvest',
    status: 'published',
    nutrition: {
      calories: '375 kcal / 100g',
      protein: '17.8g Dietary Protein',
      keyNutrient: 'Cuminaldehyde & Terpinene Essential Oils',
      minerals: 'Iron (360% RDA), Manganese, Calcium & Magnesium',
      healthPillars: [
        { title: 'Ultra-Rich Iron Source', desc: 'Exceptional natural iron density.' },
        { title: 'Digestive Elixir', desc: 'Calms bloating and enriches gut enzymes.' },
        { title: 'Royal Himalayan Spice', desc: 'Signature aroma of authentic Kashmiri cuisine.' }
      ]
    }
  },
  {
    id: 'sup-dhingri-mushroom',
    name: 'Dhingri (Dried Kashmiri Mushroom)',
    hindiName: 'कश्मीरी ढींगरी (सूखा मशरूम)',
    subtitle: 'Sun-Dried Highland Oyster Mushroom 250g, 500g & 1kg',
    price: 2239,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-123-1-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-123-1-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Rare sun-cured Kashmiri Dhingri (oyster mushroom) treasured in heritage vegetarian Wazwan curries for its deep umami richness and meaty alpine bite.',
    origin: 'Kashmir Valley Pine Forests, J&K',
    grade: 'Hand-Cleaned Sun-Dried Highland Dhingri',
    features: ['Pure Highland Harvest', 'Deep Savory Umami', 'High Plant Protein', 'Sulphur-Free Natural Curing'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Earthy forest umami with tender meaty texture once soaked',
    jammuStory: 'Collected from pristine mountain orchards and sun-dried slowly without preservatives in Jammu.',
    inStock: true,
    harvestSeason: 'Autumn Forest Harvest',
    status: 'published',
    nutrition: {
      calories: '295 kcal / 100g',
      protein: '22.4g Plant Protein',
      keyNutrient: 'Beta-Glucans & Vitamin D2',
      minerals: 'Potassium, Phosphorus, Selenium & Iron',
      healthPillars: [
        { title: 'Immunity Beta-Glucans', desc: 'Supports natural immune resilience.' },
        { title: 'Plant-Based Protein', desc: 'Rich savory protein alternative.' },
        { title: 'Pure Sun-Cured', desc: 'Zero chemical dehydrants or fillers.' }
      ]
    }
  },
  {
    id: 'sup-hazelnut-kernels',
    name: 'Hazelnut Kernels (Filberts)',
    hindiName: 'हेज़लनट गिरी',
    subtitle: 'Whole Blanched Crunch Kernels 250g, 500g & 1kg',
    price: 3639,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-49-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-49-300x300.jpg',
      '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg'
    ],
    fallbackImage: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
    description: 'Uniform, sweet-roasted or raw whole hazelnut kernels bursting with buttery praline aroma—ideal for gourmet snacking, dark chocolate pairing, and artisan patisserie.',
    origin: 'Giresun Selection — Graded in Jammu',
    grade: 'Extra-Grade Whole Hazelnut Kernels',
    features: ['Whole Unsplit Kernels', 'Velvety Buttery Aroma', 'Vitamin E Powerhouse', 'Vacuum Sealed Freshness'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Sweet nutty praline crunch with clean toasted undertones',
    jammuStory: 'Temperature-controlled in our Jammu cold vaults and sorted by caliber before every dispatch.',
    inStock: true,
    harvestSeason: 'Current Season Crop',
    status: 'published',
    nutrition: {
      calories: '628 kcal / 100g',
      protein: '15.0g Heart-Healthy Protein',
      keyNutrient: 'Oleic Acid & Natural Tocopherol (Vitamin E)',
      minerals: 'Manganese, Copper, Magnesium & Folate',
      healthPillars: [
        { title: 'Skin & Cell Vitality', desc: 'Packed with antioxidant Vitamin E.' },
        { title: 'Heart-Healthy Fats', desc: 'Over 75% monounsaturated lipids.' },
        { title: 'Patisserie Grade', desc: 'Consistent size and clean crunch.' }
      ]
    }
  },
  {
    id: 'sup-healthy-mix',
    name: 'Healthy Dry Fruit Mix',
    hindiName: 'हेल्दी ड्राई फ्रूट मिक्स',
    subtitle: 'Daily Vitality Medley of Nuts & Berries 250g, 500g & 1kg',
    price: 1063,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-114-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-114-300x300.jpg',
      '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg'
    ],
    fallbackImage: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
    description: 'Chef-balanced everyday blend of California almonds, whole cashews, pistachios, golden raisins, and sweet berries designed for clean sustained energy.',
    origin: 'Curated in Jammu Heritage Mandi',
    grade: 'Select Daily Trail & Wellness Blend',
    features: ['Zero Added Sugar or Salt', 'Balanced Nuts & Dried Berries', 'High Sustained Energy', 'Kid & Office Friendly'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Crisp roasted-nut crunch balanced by juicy sweet berries',
    jammuStory: 'Blended in small weekly batches at Seth And Sons DryFruits so every scoop stays crisp and evenly proportioned.',
    inStock: true,
    harvestSeason: 'Freshly Blended Batch',
    status: 'published',
    nutrition: {
      calories: '510 kcal / 100g',
      protein: '14.5g Balanced Protein',
      keyNutrient: 'Omega Fatty Acids & Fruit Polyphenols',
      minerals: 'Magnesium, Iron, Zinc & Potassium',
      healthPillars: [
        { title: 'Clean Daily Fuel', desc: 'Sustained focus without sugar crashes.' },
        { title: 'Balanced Macros', desc: 'Protein, healthy fats, and fiber in every bite.' },
        { title: 'Zero Oil Glaze', desc: 'Pure dry-fruit nutrition with no coatings.' }
      ]
    }
  },
  {
    id: 'sup-himalayan-garlic',
    name: 'Himalayan Garlic (Kashmiri Lehsun)',
    hindiName: 'हिमालयी एकल कली लहसुन',
    subtitle: 'Single-Clove Kashmiri Lahsun 250g, 500g & 1kg',
    price: 1959,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-53-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-53-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Potent single-clove Himalayan snow mountain garlic revered in Ayurveda for cholesterol balance, joint comfort, and seasonal immunity.',
    origin: 'High-Altitude Kashmiri & Jammu Hills',
    grade: 'Authentic Single-Clove Snow Garlic',
    features: ['Potent Single-Clove Form', 'Concentrated Natural Allicin', 'Morning Wellness Staple', 'Chemical-Free Highland Crop'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Sharp, aromatic pungency far milder on the palate than plains garlic',
    jammuStory: 'Harvested once a year in snow-fed mountain terraces and cured in airy wooden baskets in Jammu.',
    inStock: true,
    harvestSeason: 'Annual Mountain Harvest',
    status: 'published',
    nutrition: {
      calories: '149 kcal / 100g',
      protein: '6.4g Bioactive Peptides',
      keyNutrient: 'Concentrated Allicin & Organosulfur Compounds',
      minerals: 'Selenium, Manganese, Vitamin B6 & Vitamin C',
      healthPillars: [
        { title: 'Cholesterol Harmony', desc: 'Traditionally chewed on an empty stomach for lipid support.' },
        { title: 'Joint & Circulation Aid', desc: 'Supports healthy blood flow and flexibility.' },
        { title: 'Potent Allicin', desc: 'Up to 5x more concentrated than ordinary garlic.' }
      ]
    }
  },
  {
    id: 'sup-instant-kahwa',
    name: 'Kashmiri Instant Kahwa',
    hindiName: 'कश्मीरी इंस्टेंट कहवा',
    subtitle: 'Saffron, Cardamom & Almond Elixir Premix 250g',
    price: 349,
    unit: 'gram',
    weightLabel: '250g',
    step: 1,
    minQty: 1,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-119-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-119-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Authentic 1-minute Kashmiri Kahwa infusion enriched with real Pampore saffron strands, green cardamom, cinnamon bark, cloves, and slivered almonds.',
    origin: 'Crafted in Jammu, J&K',
    grade: 'Artisanal Saffron-Infused Instant Kahwa',
    features: ['Ready in 60 Seconds', 'Infused with Real Kesar & Elaichi', 'Metabolism & Digestion Booster', 'Includes Slivered Badam'],
    variants: ['125g', '250g', '500g'],
    tasteProfile: 'Warm spiced saffron honeyed infusion with nutty almond finish',
    jammuStory: 'Formulated using our century-old Jammu family spice ratio so one spoonful in hot water unlocks Dal Lake hospitality.',
    inStock: true,
    harvestSeason: 'Freshly Packed Spiced Batch',
    status: 'published',
    nutrition: {
      calories: '360 kcal / 100g',
      protein: '3.2g Herbal Extracts',
      keyNutrient: 'Green Tea Catechins & Saffron Crocin',
      minerals: 'Potassium, Magnesium & Spice Antioxidants',
      healthPillars: [
        { title: 'Instant Heritage Warmth', desc: 'Dissolves cleanly in hot water with zero straining.' },
        { title: 'Post-Meal Digestive', desc: 'Ginger, clove, and cardamom ease heaviness.' },
        { title: 'Real Saffron Infusion', desc: 'Naturally golden hue and calming aroma.' }
      ]
    }
  },
  {
    id: 'sup-masala-chai',
    name: 'Kashmiri Masala Chai',
    hindiName: 'कश्मीरी मसाला चाय',
    subtitle: 'Whole-Spice Heritage CTC & Assam-Kashmir Blend 100g',
    price: 349,
    unit: 'gram',
    weightLabel: '100g',
    step: 1,
    minQty: 1,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-104-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-104-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Brisk, full-bodied tea leaves layered with crushed green cardamom, sun-dried ginger, Ceylon cinnamon, cloves, and black peppercorn.',
    origin: 'Blended in Jammu, J&K',
    grade: 'Single-Estate Spiced Heritage Chai',
    features: ['Whole Crushed Spices', 'No Artificial Tea Flavoring', 'Rich Golden-Amber Liquor', 'Morning & Monsoon Comfort'],
    variants: ['100g', '250g', '500g'],
    tasteProfile: 'Velvety malty Assam body lifted by zesty ginger and aromatic elaichi',
    jammuStory: 'Spices are freshly coarse-ground in small batches at our Jammu workshop right before sealing into aroma-lock tins.',
    inStock: true,
    harvestSeason: 'Fresh Second-Flush Blend',
    status: 'published',
    nutrition: {
      calories: '110 kcal / 100g (Dry Leaf)',
      protein: '18.0g Leaf Proteins',
      keyNutrient: 'Theaflavins, Gingerols & Eugenol',
      minerals: 'Manganese, Fluoride & Trace Potassium',
      healthPillars: [
        { title: 'Seasonal Throat Care', desc: 'Ginger, clove, and black pepper warm the palate.' },
        { title: 'Clean Alertness', desc: 'Natural L-theanine balances gentle caffeine lift.' },
        { title: 'Real Spice Oils', desc: 'Zero synthetic masala essence.' }
      ]
    }
  },
  {
    id: 'sup-sugar-free-kahwa',
    name: 'Kashmiri Sugar Free Kahwa',
    hindiName: 'कश्मीरी शुगर फ्री कहवा',
    subtitle: 'Zero-Sugar Green Tea & Whole Spice Loose Leaf 70g',
    price: 307,
    unit: 'gram',
    weightLabel: '70g',
    step: 1,
    minQty: 1,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-118-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-118-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Diabetic-friendly loose-leaf green tea blended with whole Kashmiri spices, rose petals, saffron wisps, and green cardamom—zero sugar, zero jaggery, pure botanical aroma.',
    origin: 'Kashmir Tea Heritage — Packed in Jammu',
    grade: 'Zero-Sugar Detox Kahwa Blend',
    features: ['Zero Added Sugar or Sweeteners', 'Diabetic & Keto Friendly', 'Loose Whole Tea Leaves & Rose', 'High EGCG Antioxidants'],
    variants: ['70g', '140g', '280g'],
    tasteProfile: 'Crisp floral green tea finished with warm cardamom and saffron notes',
    jammuStory: 'Mixed dry in Jammu using authentic whole-leaf tea and sun-dried rose petals with zero sugar coating.',
    inStock: true,
    harvestSeason: 'Current Loose-Leaf Harvest',
    status: 'published',
    nutrition: {
      calories: '2 kcal / Brewed Cup',
      protein: '0g (Calorie-Free Brew)',
      keyNutrient: 'EGCG Catechins & Crocetin',
      minerals: 'Trace Polyphenols & Essential Spice Oils',
      healthPillars: [
        { title: 'Zero Sugar Formula', desc: 'Safe for mindful glucose and keto lifestyles.' },
        { title: 'Metabolic Detox', desc: 'Supports fat oxidation and crisp digestion.' },
        { title: 'Floral Saffron Calm', desc: 'Soothes after heavy or festive meals.' }
      ]
    }
  },
  {
    id: 'sup-mix-seeds-berries',
    name: 'Mix Seeds With Berries',
    hindiName: 'मिक्स सीड्स व बेरीज़ ब्लेंड',
    subtitle: '5-Seed & Super-Berry Crunch Mix 250g, 500g & 1kg',
    price: 839,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
    gallery: [
      '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-114-300x300.jpg'
    ],
    fallbackImage: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
    description: 'Vibrant antioxidant medley combining roasted pumpkin, sunflower, flax, and chia seeds with tart cranberries, blueberries, and black raisins.',
    origin: 'Blended in Jammu Heritage Mandi',
    grade: 'Superfood Seed & Berry Reserve',
    features: ['5 Roasted Seeds + Whole Berries', 'Ready-to-Eat Bowl Topper', 'High Omega-3 & Anthocyanins', 'No Artificial Color'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Toasty nutty seed crunch with bursts of tangy-sweet dried berries',
    jammuStory: 'Sieved clean and packed fresh weekly in Jammu for breakfast bowls, smoothies, and evening snacking.',
    inStock: true,
    harvestSeason: 'Freshly Roasted & Blended',
    status: 'published',
    nutrition: {
      calories: '492 kcal / 100g',
      protein: '16.5g Seed Protein',
      keyNutrient: 'Omega-3 ALA, Zinc & Berry Anthocyanins',
      minerals: 'Magnesium, Iron, Zinc & Selenium',
      healthPillars: [
        { title: 'Daily Superfood Boost', desc: 'Complete seed-and-berry micronutrient spectrum.' },
        { title: 'Gut & Hormone Balance', desc: 'Natural lignans and soluble dietary fiber.' },
        { title: 'Zero Salt Added', desc: 'Clean nutrition for smoothies and oats.' }
      ]
    }
  },
  {
    id: 'sup-pecans',
    name: 'Pecans (Paper-Shell In-Shell)',
    hindiName: 'पेकन (छिलके सहित)',
    subtitle: 'Crisp Gourmet In-Shell Pecans 250g, 500g & 1kg',
    price: 1679,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-47-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-47-300x300.jpg',
      '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg'
    ],
    fallbackImage: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
    description: 'Thin-shelled gourmet pecans sealed naturally inside their protective amber shell to preserve fresh caramel-butter richness all year.',
    origin: 'Imported Paper-Shell Harvest — Graded in Jammu',
    grade: 'Thin-Shell Jumbo Pecans',
    features: ['Easy-Crack Paper Shell', 'Naturally Sealed Freshness', 'Rich Caramel-Butter Aroma', 'High Flavonoid Antioxidants'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Sweeter and creamier than walnuts with warm toasted maple notes',
    jammuStory: 'Float-tested and hand-graded at our Jammu mandi so only full-meated shells enter your pack.',
    inStock: true,
    harvestSeason: 'Autumn Orchard Harvest',
    status: 'published',
    nutrition: {
      calories: '691 kcal / 100g',
      protein: '9.2g Nut Protein',
      keyNutrient: 'Ellagic Acid & Monounsaturated Lipids',
      minerals: 'Manganese, Copper, Zinc & Thiamine (B1)',
      healthPillars: [
        { title: 'Natural Shell Protection', desc: 'Blocks air oxidation until the moment you crack.' },
        { title: 'Heart & Metabolic Care', desc: 'Top-ranked tree nut for antioxidant capacity.' },
        { title: 'Easy Finger-Crack', desc: 'Wafer-thin shells release clean kernel halves.' }
      ]
    }
  },
  {
    id: 'sup-pecans-kernels',
    name: 'Pecans Kernels (Fancy Halves)',
    hindiName: 'पेकन गिरी (बिना छिलका)',
    subtitle: 'Ready-to-Eat Mammoth Pecan Halves 250g, 500g & 1kg',
    price: 3359,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-54-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-54-300x300.jpg',
      '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg'
    ],
    fallbackImage: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
    description: 'Golden-amber whole shelled pecan halves prized for zero astringency, velvet crunch, and decadent brown-butter sweetness.',
    origin: 'Mammoth Halves Reserve — Packed in Jammu',
    grade: 'Fancy Whole Shelled Pecan Halves',
    features: ['Zero Shell — 100% Edible Halves', 'Creamy Zero-Bitterness Taste', 'Cold-Vault Preserved', 'Artisan Dessert & Snack Ready'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Melt-in-mouth praline-butter richness with silky finish',
    jammuStory: 'Kept below 12°C inside our Jammu vault to protect the delicate natural pecan oils.',
    inStock: true,
    harvestSeason: 'Fresh Cold-Vault Harvest',
    status: 'published',
    nutrition: {
      calories: '691 kcal / 100g',
      protein: '9.2g Pure Nut Protein',
      keyNutrient: 'Gamma-Tocopherol & Flavonoid Polyphenols',
      minerals: 'Zinc, Copper, Manganese & Magnesium',
      healthPillars: [
        { title: 'Antioxidant Leader', desc: 'Rich in phenolic antioxidants for cellular defense.' },
        { title: 'Keto & Low-Carb Ideal', desc: 'Only 4g net carbs with high clean energy.' },
        { title: 'Zero Astringency', desc: 'Naturally sweet without walnut skin sharpness.' }
      ]
    }
  },
  {
    id: 'sup-green-tea',
    name: 'Premium Green Tea (Whole Leaf)',
    hindiName: 'प्रीमियम ग्रीन टी',
    subtitle: 'Smooth Antioxidant Whole-Leaf Green Tea 100g',
    price: 279,
    unit: 'gram',
    weightLabel: '100g',
    step: 1,
    minQty: 1,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-20-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-20-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Steamed long whole tea leaves producing a luminous jade liquor with crisp vegetal sweetness, zero dusty fannings, and smooth low bitterness.',
    origin: 'Himalayan & Darjeeling Selection — Packed in Jammu',
    grade: 'Single-Origin Whole-Leaf Green Tea',
    features: ['100% Uncut Whole Leaves', 'Smooth Non-Bitter Finish', 'Rich EGCG Catechins', '2-to-3 Re-steeps Per Spoon'],
    variants: ['100g', '250g', '500g'],
    tasteProfile: 'Fresh meadow grassiness with delicate sweet spring-water finish',
    jammuStory: 'Nitrogen-flushed at our Jammu tea room to lock in crisp chlorophyll brightness and aroma.',
    inStock: true,
    harvestSeason: 'Spring First-Flush Harvest',
    status: 'published',
    nutrition: {
      calories: '1 kcal / Brewed Cup',
      protein: '0g (Zero-Calorie Infusion)',
      keyNutrient: 'EGCG Catechins & L-Theanine',
      minerals: 'Natural Fluoride, Manganese & Flavonoids',
      healthPillars: [
        { title: 'Calm Focus', desc: 'L-theanine promotes relaxed mental clarity.' },
        { title: 'Metabolic Hydration', desc: 'Clean daily antioxidant ritual.' },
        { title: 'Zero Dust Leaves', desc: 'Whole unfurling leaves stay silky, never harsh.' }
      ]
    }
  },
  {
    id: 'elachi-cardamom',
    name: 'Elachi (Green Cardamom)',
    hindiName: 'हरी इलायची (छोटी इलायची)',
    subtitle: 'Bold 8mm Extra-Aromatic Green Cardamom 100g, 250g, 500g & 1kg',
    price: 8399,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-55-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-55-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Vibrant emerald-green bold pods packed with oil-rich black seeds—treasured as the Queen of Spices for Kashmiri Kahwa, kheer, biryani, and digestive mouth freshening.',
    origin: 'Idukki Highland Selection — Graded in Jammu',
    grade: '8mm+ Extra-Bold Green Cardamom',
    features: ['Lush Emerald Green Pods', 'High Cineole Essential Oil', 'Unbleached Whole Pods', 'Triple-Sorted Export Caliber'],
    variants: ['100g', '250g', '500g', '1kg'],
    tasteProfile: 'Intensely sweet eucalyptus-floral camphor with lingering warm spice',
    jammuStory: 'Kept cool inside dark airtight vaults in Jammu so the volatile pod oils never fade in heat.',
    inStock: true,
    harvestSeason: 'Fresh Highland Harvest',
    status: 'published',
    nutrition: {
      calories: '311 kcal / 100g',
      protein: '10.8g Seed Protein',
      keyNutrient: '1,8-Cineole & Terpinyl Acetate Oils',
      minerals: 'Manganese (1200% RDA), Iron, Potassium & Calcium',
      healthPillars: [
        { title: 'Breath & Mouth Hygiene', desc: 'Instant natural refreshment after rich meals.' },
        { title: 'Digestive Soother', desc: 'Eases acidity and stimulates healthy bile flow.' },
        { title: 'Kahwa & Dessert Essential', desc: 'Delivers authentic royal aroma with just two crushed pods.' }
      ]
    }
  },
  {
    id: 'himalayan-shilajit-resin',
    name: 'Himalayan Shilajit Resin (Pure Gold-Grade)',
    hindiName: 'शुद्ध हिमालयी शिलाजीत रेज़िन',
    subtitle: 'Triphala-Purified High-Altitude Mineral Resin 15g',
    price: 1091,
    unit: 'gram',
    weightLabel: '15g',
    step: 1,
    minQty: 1,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-125-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-125-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Authentic black-gold Himalayan rock exudate purified traditionally in Triphala decoction—dissolves cleanly in warm water or milk with zero heavy-metal fillers.',
    origin: 'High-Altitude Himalayas & Ladakh — Packed in Jammu',
    grade: 'Surya-Tapi Pure Gold-Grade Resin',
    features: ['Over 70% Fulvic Acid Complex', '84+ Trace Ionic Minerals', 'Triphala Shodhana Purified', 'Zero Corn Syrup or Tar Fillers'],
    variants: ['15g', '30g'],
    tasteProfile: 'Deep smoky mineral earthiness with signature bitter-wood resin finish',
    jammuStory: 'Lab-screened and bottled in UV-shielded glass jars at our Jammu heritage dispensary.',
    inStock: true,
    harvestSeason: 'High-Summer Cliff Exudation',
    status: 'published',
    nutrition: {
      calories: '5 kcal / 250mg Serving',
      protein: 'Trace Humic Amino Complexes',
      keyNutrient: 'Fulvic Acid (>70%) & Dibenzo-Alpha-Pyrones',
      minerals: '84+ Bioavailable Ionic Trace Minerals (Iron, Zinc, Magnesium)',
      healthPillars: [
        { title: 'Cellular ATP & Vitality', desc: 'Supports mitochondrial energy and stamina.' },
        { title: 'Recovery & Altitude Adaptation', desc: 'Classical Ayurvedic rasayana for daily resilience.' },
        { title: 'Flame & Water Verified', desc: 'Completely soluble with zero sandy residue.' }
      ]
    }
  },
  {
    id: 'himalayan-shilajit-tea',
    name: 'Himalayan Shilajit Tea',
    hindiName: 'हिमालयी शिलाजीत चाय',
    subtitle: 'Adaptogenic Mountain Leaf & Pure Shilajit Blend 20g',
    price: 517,
    unit: 'gram',
    weightLabel: '20g',
    step: 1,
    minQty: 1,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-127-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-127-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Smooth daily adaptogenic herbal infusion uniting high-altitude Himalayan botanicals with purified Shilajit extract for sustained morning focus and warmth.',
    origin: 'Himalayan Tea Heritage — Packed in Jammu',
    grade: 'Adaptogenic Shilajit Botanical Infusion',
    features: ['Smooth Morning Vitality', 'Pre-Measured Convenient Steep', 'Rich Fulvic Phytonutrients', 'Zero Synthetic Flavors'],
    variants: ['20g', '40g'],
    tasteProfile: 'Earthy roasted herbal tea with subtle smoky mineral smoothness',
    jammuStory: 'Small-batch blended in Jammu so Shilajit benefits integrate effortlessly into a 2-minute cup.',
    inStock: true,
    harvestSeason: 'Current Botanical Reserve',
    status: 'published',
    nutrition: {
      calories: '3 kcal / Brewed Cup',
      protein: '0g (Botanical Infusion)',
      keyNutrient: 'Fulvic Acid, Catechins & Adaptogenic Polyphenols',
      minerals: 'Trace Potassium, Magnesium & Ionic Minerals',
      healthPillars: [
        { title: 'Balanced Stamina', desc: 'Steady energy without midday caffeine jitters.' },
        { title: 'Daily Adaptogen', desc: 'Helps body respond smoothly to physical fatigue.' },
        { title: 'Effortless Brewing', desc: 'Enjoy plain or lightly sweetened with mountain honey.' }
      ]
    }
  },
  {
    id: 'kashmiri-bhaderwahi-rajma',
    name: 'Kashmiri Bhaderwahi Rajma (Red Kidney Beans)',
    hindiName: 'कश्मीरी भद्रवाह राजमा',
    subtitle: 'Original Small Alpine Red Bhaderwah Beans 250g, 500g & 1kg',
    price: 349,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'dried-fruits',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-63-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-63-300x300.jpg',
      '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg'
    ],
    fallbackImage: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
    description: 'Famous small glossy crimson Bhaderwah rajma grown along snow-fed Neeru river valleys—cooks rapidly into velvety thick gravy with unmistakable nutty mountain flavor.',
    origin: 'Bhaderwah Valley, Doda District, Jammu & Kashmir',
    grade: 'GI-Heritage Pure Unpolished Bhaderwahi Rajma',
    features: ['Thin Skin — Melts in Mouth', 'Rich Creamy Gravy Naturally', 'Rain-Fed & Snow-Water Crop', 'Zero Artificial Polish'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Creamy velvety texture with sweet earthy bean richness',
    jammuStory: 'Sourced straight from Bhaderwah farmer collectives each autumn for authentic Jammu Rajma Chawal.',
    inStock: true,
    harvestSeason: 'Autumn Mountain Harvest',
    status: 'published',
    nutrition: {
      calories: '333 kcal / 100g Dry',
      protein: '23.6g Plant Protein',
      keyNutrient: 'Complex Prebiotic Fiber & Folate',
      minerals: 'Iron, Molybdenum, Potassium & Magnesium',
      healthPillars: [
        { title: 'High Plant Protein', desc: 'Over 23g clean protein per 100g dry beans.' },
        { title: 'Low Glycemic Satiety', desc: 'Steady slow-release energy and fiber.' },
        { title: 'Authentic Jammu Heritage', desc: 'Impossible to replicate with plains kidney beans.' }
      ]
    }
  },
  {
    id: 'kesar-attar-6ml',
    name: 'Kashmiri Kesar Attar (Pure Saffron Perfume Oil)',
    hindiName: 'कश्मीरी केसर इत्र (अत्तर)',
    subtitle: 'Alcohol-Free Traditional Saffron Fragrance Roll-On 6ml',
    price: 251,
    unit: 'ml',
    weightLabel: '6ml',
    step: 1,
    minQty: 1,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-122-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-122-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Velvety, alcohol-free royal Kesar Attar crafted in Mysore sandalwood-oil base infused with Pampore saffron aromatics for long-lasting warm spiritual trail.',
    origin: 'Crafted with Kashmiri Saffron — Jammu Atelier',
    grade: '100% Alcohol-Free Concentrated Roll-On Attar',
    features: ['Zero Alcohol — Skin Safe', 'Long-Lasting Sandal-Saffron Notes', 'Travel-Friendly Glass Roll-On', 'Ideal for Prayer & Festive Wear'],
    variants: ['6ml', '12ml'],
    tasteProfile: 'Warm honeyed saffron florals resting on creamy sandalwood musk',
    jammuStory: 'Macerated in small numbered flacons for customers who love wearing Kashmir’s signature scent.',
    inStock: true,
    harvestSeason: 'Aged Small-Batch Maceration',
    status: 'published',
    nutrition: {
      calories: 'External Aromatic Oil Only',
      protein: 'Pure Botanical Fragrance Oils',
      keyNutrient: 'Saffron Safranal Aromatic Notes',
      minerals: 'Alcohol-Free Carrier Base',
      healthPillars: [
        { title: 'Gentle on Sensitive Skin', desc: '100% alcohol-free and non-drying.' },
        { title: '6–10 Hour Longevity', desc: 'Concentrated oil clings softly on pulse points.' },
        { title: 'Sacred Temple Aroma', desc: 'Calming spiritual scent cherished across India.' }
      ]
    }
  },
  {
    id: 'kesar-cream-50gm',
    name: 'Kashmiri Kesar Radiance Cream',
    hindiName: 'कश्मीरी केसर निखार क्रीम',
    subtitle: 'Pure Saffron, Almond Oil & Aloe Botanical Face Cream 50g',
    price: 349,
    unit: 'gram',
    weightLabel: '50g',
    step: 1,
    minQty: 1,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-120-1-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-120-1-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Whipped botanical day-and-night radiance cream enriched with real Kashmiri saffron extract, sweet almond oil, and natural shea butter for even-toned luminous skin.',
    origin: 'Formulated with Pampore Saffron — Packed in Jammu',
    grade: 'Artisanal Ayurvedic Saffron Skin Cream',
    features: ['Real Kashmiri Kesar Extract', 'Sweet Badam Oil Nourishment', 'Paraben & Bleach Free', 'Non-Greasy Silky Absorption'],
    variants: ['50g', '100g'],
    tasteProfile: 'Light whipped floral saffron veil with clean non-sticky skin feel',
    jammuStory: 'Inspired by traditional winter skincare rituals practiced across Kashmir and Jammu households.',
    inStock: true,
    harvestSeason: 'Fresh Small-Batch Skincare',
    status: 'published',
    nutrition: {
      calories: 'External Skincare Use Only',
      protein: 'Botanical Lipid & Vitamin E Base',
      keyNutrient: 'Saffron Crocin & Cold-Pressed Almond Tocopherol',
      minerals: 'Plant Emollients & Natural Antioxidants',
      healthPillars: [
        { title: 'Natural Glow Enhancement', desc: 'Helps brighten dullness without harsh bleaching agents.' },
        { title: 'Deep Barrier Moisture', desc: 'Almond oil softens dry winter patches.' },
        { title: 'Clean Heritage Formula', desc: 'Free from parabens, mineral oil, and steroids.' }
      ]
    }
  },
  {
    id: 'kesar-flower-1gm',
    name: 'Kashmiri Kesar Flower (Saffron Strands)',
    hindiName: 'कश्मीरी केसर फूल (लाल रेशे)',
    subtitle: 'Aromatic Pure Red Kesar Threads 1g Jar',
    price: 419,
    unit: 'gram',
    weightLabel: '1g',
    step: 1,
    minQty: 1,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-28-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-28-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Hand-picked crimson Crocus sativus flower stigmas from Pampore karewas—delivers vivid golden infusion in warm milk, sweets, pooja offerings, and maternity wellness.',
    origin: 'Pampore Karewas, Kashmir — Packed in Jammu',
    grade: 'Select Pure Kashmiri Kesar Flower',
    features: ['Zero Artificial Dye', 'Rich Golden Crocin Infusion', 'Moisture-Locked Airtight Jar', 'Hand-Harvested Autumn Flowers'],
    variants: ['1g', '2g', '5g'],
    tasteProfile: 'Honeyed hay, floral warmth, and unmistakably regal golden aroma',
    jammuStory: 'Each gram is weighed and sealed inside tamper-evident jars at our Jammu showroom.',
    inStock: true,
    harvestSeason: 'Autumn Karewa Bloom',
    status: 'published',
    nutrition: {
      calories: '310 kcal / 100g (Trace Per Serving)',
      protein: '11.4g Plant Proteins',
      keyNutrient: 'Crocin, Picrocrocin & Safranal',
      minerals: 'Manganese, Iron, Vitamin C & Magnesium',
      healthPillars: [
        { title: 'Mood & Calm Uplift', desc: 'Traditionally steeped in warm evening milk.' },
        { title: 'Pure Golden Infusion', desc: 'Stains slowly into rich marigold-amber—never instant neon red.' },
        { title: 'Festive & Maternal Staple', desc: 'Trusted purity for sweets, puja, and prenatal care.' }
      ]
    }
  },
  {
    id: 'kesar-handcrafted-soap',
    name: 'Kashmiri Kesar Handcrafted Soap',
    hindiName: 'कश्मीरी केसर हस्तनिर्मित साबुन',
    subtitle: 'Cold-Process Saffron, Goat Milk & Glycerine Bar 100g',
    price: 279,
    unit: 'gram',
    weightLabel: '100g',
    step: 1,
    minQty: 1,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-106-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-106-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Hand-poured botanical bathing bar infused with real saffron strands, soothing almond milk, and natural vegetable oils for creamy lather without harsh SLS detergents.',
    origin: 'Handcrafted in Jammu & Kashmir',
    grade: 'SLS-Free Artisan Saffron Bathing Bar',
    features: ['Zero SLS / SLES Detergents', 'Visible Saffron Infusion', 'Creamy Non-Drying Lather', 'Festive & Hamper Favorite'],
    variants: ['100g', '200g'],
    tasteProfile: 'Soft warm saffron-sandal bath fragrance that leaves skin supple',
    jammuStory: 'Small-batch cured on wooden racks in Jammu and wrapped in moisture-sealed butter paper.',
    inStock: true,
    harvestSeason: 'Freshly Cured Handcrafted Batch',
    status: 'published',
    nutrition: {
      calories: 'External Bathing Bar Only',
      protein: 'Plant Oil & Milk Fat Base',
      keyNutrient: 'Saffron Extract & Natural Vegetable Glycerine',
      minerals: 'Vitamin E & Mild Natural Emollients',
      healthPillars: [
        { title: 'Zero Harsh Stripping', desc: 'Retains natural skin hydration after bathing.' },
        { title: 'Saffron Luminosity', desc: 'Gentle antioxidant botanical cleanse.' },
        { title: 'Artisan Gift Worthy', desc: 'Pairs beautifully inside royal festive hampers.' }
      ]
    }
  },
  {
    id: 'kesar-petal-1gm',
    name: 'Kashmiri Kesar Petal (Saffron Stigma Reserve)',
    hindiName: 'कश्मीरी केसर पंखुड़ी (स्पेशल ग्रेड)',
    subtitle: 'Whole Crimson Kashmiri Saffron Stigma Petals 1g',
    price: 391,
    unit: 'gram',
    weightLabel: '1g',
    step: 1,
    minQty: 1,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-71-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-71-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Delicate sun-dried crimson saffron threads treasured for daily Kahwa, kheer, biryanis, and sacred temple tilak preparations.',
    origin: 'Pampore Valley, Kashmir — Sealed in Jammu',
    grade: 'Pure Kashmiri Kesar Petal Reserve',
    features: ['100% Pure Crocus Threads', 'Aromatic Daily Culinary Grade', 'No Added Sugar or Color', 'Reusable Glass Pack'],
    variants: ['1g', '2g', '5g'],
    tasteProfile: 'Fragrant meadow floral spice with clean bittersweet honey balance',
    jammuStory: 'Packed under strict cold-room humidity checks in Jammu to safeguard delicate aroma oils.',
    inStock: true,
    harvestSeason: 'Autumn Kashmir Harvest',
    status: 'published',
    nutrition: {
      calories: '310 kcal / 100g (Trace Per Cup)',
      protein: '11.4g Botanical Proteins',
      keyNutrient: 'Crocin Antioxidants & Safranal',
      minerals: 'Manganese, Iron & Trace Carotenoids',
      healthPillars: [
        { title: 'Everyday Purity', desc: 'Economical genuine Kashmir saffron for daily rituals.' },
        { title: 'Antioxidant Protection', desc: 'Rich natural carotenoid pigments.' },
        { title: 'Verified Unadulterated', desc: 'Threads stay intact even after warm-water infusion.' }
      ]
    }
  },
  {
    id: 'kesar-scrub-100gm',
    name: 'Kashmiri Kesar Exfoliating Scrub',
    hindiName: 'कश्मीरी केसर उबटन स्क्रब',
    subtitle: 'Fine Apricot-Walnut Polish with Saffron & Rosewater 100g',
    price: 349,
    unit: 'gram',
    weightLabel: '100g',
    step: 1,
    minQty: 1,
    category: 'saffron',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-120-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-120-300x300.jpg',
      '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg'
    ],
    fallbackImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
    description: 'Gentle cream-based exfoliant pairing micro-milled Kashmiri walnut shell polish with saffron extract, almond oil, and rose hydrosol to sweep away dull surface cells.',
    origin: 'Botanical Heritage Blend — Packed in Jammu',
    grade: 'Micro-Bead Free Walnut & Kesar Polish',
    features: ['Zero Plastic Microbeads', 'Finely Milled Kashmiri Walnut Polish', 'Saffron & Almond Milk Cushion', 'Smooth Brightening Rinse'],
    variants: ['100g', '200g'],
    tasteProfile: 'Silky creamy herbal ubtan feel with soothing rose-saffron aroma',
    jammuStory: 'Uses natural Kashmiri walnut shell grit milled smooth so it buffs cleanly without micro-tears.',
    inStock: true,
    harvestSeason: 'Freshly Packed Botanical Batch',
    status: 'published',
    nutrition: {
      calories: 'External Skincare Use Only',
      protein: 'Natural Ubtan Botanicals',
      keyNutrient: 'Saffron Extract & Walnut Shell Polish',
      minerals: 'Sweet Almond Oil & Rose Hydrosol',
      healthPillars: [
        { title: 'Zero Microplastics', desc: '100% biodegradable natural nut-shell exfoliation.' },
        { title: 'Unclogs & Brightens', desc: 'Lifts tan and dead buildup gently twice a week.' },
        { title: 'Soft After-Feel', desc: 'Cushioned with cold-pressed almond lipids.' }
      ]
    }
  },
  {
    id: 'chilgoza-kernels',
    name: 'Natural Chilgoza Kernels (Pine Nuts)',
    hindiName: 'शुद्ध चिलगोज़ा गिरी',
    subtitle: 'Rare Shelled Himalayan Pine Nut Kernels 250g, 500g & 1kg',
    price: 11199,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-58-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-58-300x300.jpg',
      '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg'
    ],
    fallbackImage: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
    description: 'Royal ivory-cream shelled Himalayan Chilgoza kernels celebrated for delicate resinous-buttery melt and extraordinary winter warmth—hand-cleaned for instant snacking.',
    origin: 'Kinnaur & Hindu Kush Wild Conifer Forests — Graded in Jammu',
    grade: 'Royal Whole Shelled Chilgoza Kernels',
    features: ['Zero Shelling Effort', 'Wild High-Mountain Conifer Crop', 'Pinolenic Acid Appetite Balance', 'Vacuum Sealed Cold-Vault Stock'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Silky pine-butter richness melting cleanly on the tongue',
    jammuStory: 'Kept chilled inside hermetically sealed packs at our Jammu vault because pine-nut oils are exceptionally delicate.',
    inStock: true,
    harvestSeason: 'Rare Winter Mountain Harvest',
    status: 'published',
    nutrition: {
      calories: '673 kcal / 100g',
      protein: '13.7g Noble Nut Protein',
      keyNutrient: 'Pinolenic Acid & Vitamin K1',
      minerals: 'Manganese (440% RDA), Zinc, Magnesium & Iron',
      healthPillars: [
        { title: 'Pinolenic Satiety', desc: 'Naturally triggers satiety hormones for mindful nutrition.' },
        { title: 'Winter Joint Warmth', desc: 'Unmatched Ayurvedic warming nourishment.' },
        { title: 'Rare Forest Treasure', desc: 'Takes 18–24 months per wild pine cone to mature.' }
      ]
    }
  },
  {
    id: 'chilgoza-with-shell',
    name: 'Natural Chilgoza With Shell (Pine Nuts)',
    hindiName: 'साबुत चिलगोज़ा (छिलके सहित)',
    subtitle: 'Roasted Wild-Foraged In-Shell Pine Nuts 250g, 500g & 1kg',
    price: 8399,
    unit: 'kg',
    step: 0.5,
    minQty: 0.5,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-56-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-56-300x300.jpg',
      '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg'
    ],
    fallbackImage: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
    description: 'Traditional fireside winter delicacy—elongated mahogany pine seeds in-shell protecting plump, sweet ivory pine kernels inside.',
    origin: 'Kinnaur & Frontier Highland Forests — Packed in Jammu',
    grade: 'Full-Meated Roasted In-Shell Chilgoza',
    features: ['Protected Natural Seed Coat', 'Zero Hollow Shells Sorted', 'Traditional Winter Delicacy', 'Dense Pine-Oil Crunch'],
    variants: ['250g', '500g', '1kg'],
    tasteProfile: 'Crisp crack revealing sweet milky pine kernel with roasted warmth',
    jammuStory: 'Float-graded and lightly sand-tossed by master roasters in Jammu for crisp shell snapping.',
    inStock: true,
    harvestSeason: 'Winter Forest Reserve',
    status: 'published',
    nutrition: {
      calories: '673 kcal / 100g Edible Kernel',
      protein: '13.7g Wild Forest Protein',
      keyNutrient: 'Pinolenic Acid & Monounsaturated Fats',
      minerals: 'Manganese, Zinc, Iron & Vitamin E',
      healthPillars: [
        { title: 'Naturally Oxidation-Proof', desc: 'Thin woody shell keeps kernel oils pristine.' },
        { title: 'Seasonal Energy Reserve', desc: 'Rich in clean lipids for cold climates.' },
        { title: 'Interactive Mindful Ritual', desc: 'Classic heirloom nut shared after dinner.' }
      ]
    }
  },
  {
    id: 'walnut-cracker',
    name: 'Heritage Walnut Cracker',
    hindiName: 'अखरोट क्रेकर (हेवी ड्यूटी)',
    subtitle: 'Heavy-Duty Ergonomic Nut Cracker (Single Piece)',
    price: 419,
    unit: 'piece',
    weightLabel: '1 Piece',
    step: 1,
    minQty: 1,
    category: 'nuts',
    image: 'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-70-300x300.jpg',
    gallery: [
      'https://shreeramdryfruits.com/wp-content/uploads/2023/02/Dummy-70-300x300.jpg',
      '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg'
    ],
    fallbackImage: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
    description: 'Non-slip dual-serrated ergonomic walnut and pecan shell cracker engineered to apply controlled conical pressure—cracking hard shells cleanly without crushing whole butterfly halves inside.',
    origin: 'Curated Accessory — Dispatched from Jammu',
    grade: 'Heavy-Duty Die-Cast Kitchen Nut Cracker',
    features: ['Preserves Whole Kernel Halves', 'Anti-Slip Comfort Grip Handles', 'Fits Small Badam to Jumbo Akhrot', 'Rust-Resistant Reinforced Hinge'],
    variants: ['1 Piece', '2 Pieces'],
    tasteProfile: 'Effortless controlled crack for Kashmiri in-shell walnuts, kagzi badam & pecans',
    jammuStory: 'The essential kitchen companion recommended alongside our Kishtwar in-shell akhrot packs.',
    inStock: true,
    harvestSeason: 'All-Season Kitchen Tool',
    status: 'published',
    nutrition: {
      calories: 'Kitchen Tool (1 Piece)',
      protein: 'Reinforced Alloy Construction',
      keyNutrient: 'Serrated Conical Jaw Design',
      minerals: 'Fits Walnuts, Kagzi Almonds, Pecans & Hazelnuts',
      healthPillars: [
        { title: 'Zero Crushed Kernels', desc: 'Funnel jaw cradles shells without smashing meat.' },
        { title: 'Low-Effort Leverage', desc: 'Easy one-hand squeeze for elders and families.' },
        { title: 'Built to Last', desc: 'Heavy pivot hinge resists bending across years.' }
      ]
    }
  }
];

export const BRAND_CONFIG = {
  name: 'Seth And Sons DryFruits',
  shortName: 'Seth And Sons DryFruits',
  tagline: 'Nature\'s Finest. Delivered with Love.',
  heritageStory: 'Three generations of royal grading rooted in Jammu & Kashmir.',
  whatsappBusinessNumber: '+919876543210',
  displayPhone: '+91 98765 43210',
  supportEmail: 'aseth9588@gmail.com',
  dispatchLocation: 'Heritage Dry Fruit Mandi, Jammu, J&K - 180001',
  logoPath: '/assets/seth_and_sons_logo.jpg',
  emailLogoUrl: 'https://res.cloudinary.com/n0b8m1qk/image/upload/v1794500281/asulesh-seth/branding/seth_and_sons_logo_emblem_3f4e8923.jpg',
  heroImage: '/assets/hero_luxury_dryfruits.webp',
  heroBanners: ['/assets/hero_luxury_dryfruits.webp'],
  heroPoster: '/assets/hero_luxury_dryfruits.webp'
};

