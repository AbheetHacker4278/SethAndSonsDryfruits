import { Product, OrderItem } from '../types/product';
import {
  PRODUCTS,
  type CatalogProduct,
  type ProductWeightVariant,
  parseWeightGrams,
  getVariantStockUnits,
} from '../data/products';

export { parseWeightGrams, getVariantStockUnits };

/**
 * Format currency in Indian Rupee format with ₹ symbol
 */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * Calculate item subtotal based on product unit and quantity
 */
export function calculateItemSubtotal(product: Product, quantity: number): number {
  if (!quantity || quantity <= 0) return 0;
  // Product price is per unit (per kg for dry fruits, per gram for saffron)
  return Math.round(product.price * quantity);
}

export interface CalculatedWeightTier {
  weightLabel: string;
  sku: string;
  purchasePrice: number;
  sellingPrice: number;
  stock: number;
  active: boolean;
}

/**
 * Return selectable pack options for any storefront product:
 * prioritizes active Admin-configured ProductVariant records, and falls back to
 * standard 250g / 500g / 1kg (or 1g / 2g / 5g) packs derived from the product's unit price.
 */
export function getProductPackOptions(product: Pick<CatalogProduct, 'id' | 'sku' | 'price' | 'discountPrice' | 'unit' | 'weightLabel' | 'variants' | 'stock' | 'weightVariants'>): ProductWeightVariant[] {
  const activeVariants = (product.weightVariants || []).filter(v => v.active !== false && v.sellingPrice > 0);
  if (activeVariants.length > 0) {
    return [...activeVariants].sort((a, b) => {
      const ga = parseWeightGrams(a.weightLabel) ?? Number.MAX_SAFE_INTEGER;
      const gb = parseWeightGrams(b.weightLabel) ?? Number.MAX_SAFE_INTEGER;
      if (ga !== gb) return ga - gb;
      return a.sellingPrice - b.sellingPrice;
    });
  }

  const baseSelling =
    product.discountPrice && product.discountPrice > 0 && product.discountPrice < product.price
      ? product.discountPrice
      : product.price;
  const baseSku = product.sku || product.id.toUpperCase();
  const stockFallback = Math.max(5, Number(product.stock ?? 10));

  if (product.unit === 'gram') {
    const baseGrams = parseWeightGrams(product.weightLabel || '1g') || 1;
    if (baseGrams > 1 && product.variants && product.variants.length > 0) {
      const custom = product.variants
        .map(label => {
          const g = parseWeightGrams(label);
          if (!g) return null;
          return {
            id: `pack_${product.id}_${label}`,
            productId: product.id,
            weightLabel: label,
            sku: `${baseSku}-${label.toUpperCase()}`,
            sellingPrice: Math.round(baseSelling * (g / baseGrams)),
            stock: stockFallback,
            active: true,
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));
      if (custom.length > 0) return custom;
    }
    return [
      { id: `pack_${product.id}_1g`, productId: product.id, weightLabel: '1g', sku: `${baseSku}-1G`, sellingPrice: Math.round(baseSelling * 1), stock: stockFallback, active: true },
      { id: `pack_${product.id}_2g`, productId: product.id, weightLabel: '2g', sku: `${baseSku}-2G`, sellingPrice: Math.round(baseSelling * 2), stock: stockFallback, active: true },
      { id: `pack_${product.id}_5g`, productId: product.id, weightLabel: '5g', sku: `${baseSku}-5G`, sellingPrice: Math.round(baseSelling * 5), stock: stockFallback, active: true },
    ];
  }

  if (product.unit === 'piece') {
    if (product.variants && product.variants.length > 0) {
      return product.variants.map(label => {
        const m = label.trim().toLowerCase().match(/([\d.]+)/);
        const pieces = m ? Math.max(1, Math.round(parseFloat(m[1]))) : 1;
        return {
          id: `pack_${product.id}_${label}`,
          productId: product.id,
          weightLabel: label,
          sku: `${baseSku}-${pieces}PC`,
          sellingPrice: Math.round(baseSelling * pieces),
          stock: stockFallback,
          active: true,
        };
      });
    }
    const fallbackLabel = product.weightLabel || '1 Piece';
    return [
      { id: `pack_${product.id}_1pc`, productId: product.id, weightLabel: fallbackLabel, sku: `${baseSku}-1PC`, sellingPrice: Math.round(baseSelling), stock: stockFallback, active: true },
    ];
  }

  if (product.unit === 'ml') {
    const baseMl = parseWeightGrams(product.weightLabel || '100ml') || 100;
    if (product.variants && product.variants.length > 0 && baseMl !== 100) {
      const custom = product.variants
        .map(label => {
          const ml = parseWeightGrams(label);
          if (!ml) return null;
          return {
            id: `pack_${product.id}_${label}`,
            productId: product.id,
            weightLabel: label,
            sku: `${baseSku}-${label.toUpperCase()}`,
            sellingPrice: Math.round(baseSelling * (ml / baseMl)),
            stock: stockFallback,
            active: true,
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));
      if (custom.length > 0) return custom;
    }
    return [
      { id: `pack_${product.id}_100ml`, productId: product.id, weightLabel: '100ml', sku: `${baseSku}-100ML`, sellingPrice: Math.round(baseSelling * 1), stock: stockFallback, active: true },
      { id: `pack_${product.id}_250ml`, productId: product.id, weightLabel: '250ml', sku: `${baseSku}-250ML`, sellingPrice: Math.round(baseSelling * 2.5), stock: stockFallback, active: true },
      { id: `pack_${product.id}_500ml`, productId: product.id, weightLabel: '500ml', sku: `${baseSku}-500ML`, sellingPrice: Math.round(baseSelling * 5), stock: stockFallback, active: true },
      { id: `pack_${product.id}_1000ml`, productId: product.id, weightLabel: '1000ml', sku: `${baseSku}-1000ML`, sellingPrice: Math.round(baseSelling * 10), stock: stockFallback, active: true },
    ];
  }

  if (product.variants && product.variants.includes('100g')) {
    return [
      { id: `pack_${product.id}_100g`, productId: product.id, weightLabel: '100g', sku: `${baseSku}-100G`, sellingPrice: Math.round(baseSelling * 0.1), stock: stockFallback, active: true },
      { id: `pack_${product.id}_250g`, productId: product.id, weightLabel: '250g', sku: `${baseSku}-250G`, sellingPrice: Math.round(baseSelling * 0.25), stock: stockFallback, active: true },
      { id: `pack_${product.id}_500g`, productId: product.id, weightLabel: '500g', sku: `${baseSku}-500G`, sellingPrice: Math.round(baseSelling * 0.5), stock: stockFallback, active: true },
      { id: `pack_${product.id}_1kg`, productId: product.id, weightLabel: '1kg', sku: `${baseSku}-1KG`, sellingPrice: Math.round(baseSelling), stock: stockFallback, active: true },
    ];
  }

  return [
    { id: `pack_${product.id}_250g`, productId: product.id, weightLabel: '250g', sku: `${baseSku}-250G`, sellingPrice: Math.round(baseSelling * 0.25), stock: stockFallback, active: true },
    { id: `pack_${product.id}_500g`, productId: product.id, weightLabel: '500g', sku: `${baseSku}-500G`, sellingPrice: Math.round(baseSelling * 0.5), stock: stockFallback, active: true },
    { id: `pack_${product.id}_1kg`, productId: product.id, weightLabel: '1kg', sku: `${baseSku}-1KG`, sellingPrice: Math.round(baseSelling), stock: stockFallback, active: true },
  ];
}

/**
 * Calculate Cost Price for 500g, 250g and Selling Price for 250g, 500g, 1000g (1kg)
 * based on the 1 kg cost price with a default 40% margin (cost * 1.40).
 */
export function calculateKgMarginTiers(
  costPerKg: number,
  marginPercent: number = 40,
  baseSku: string = 'AS-PROD',
  defaultStock: number = 20
): CalculatedWeightTier[] {
  const safeCost = Math.max(0, Math.round(Number(costPerKg) || 0));
  const mult = 1 + marginPercent / 100;
  const cleanSku = (baseSku || 'AS-PROD')
    .trim()
    .replace(/-(?:250G|500G|1KG|1000G|\d+G)$/i, '');

  const cost250g = Math.round(safeCost * 0.25);
  const cost500g = Math.round(safeCost * 0.5);
  const cost1kg = safeCost;

  const sell250g = Math.round(cost250g * mult);
  const sell500g = Math.round(cost500g * mult);
  const sell1kg = Math.round(cost1kg * mult);

  return [
    {
      weightLabel: '250g',
      sku: `${cleanSku}-250G`,
      purchasePrice: cost250g,
      sellingPrice: sell250g,
      stock: defaultStock,
      active: true,
    },
    {
      weightLabel: '500g',
      sku: `${cleanSku}-500G`,
      purchasePrice: cost500g,
      sellingPrice: sell500g,
      stock: Math.max(5, Math.round(defaultStock * 0.75)),
      active: true,
    },
    {
      weightLabel: '1kg',
      sku: `${cleanSku}-1KG`,
      purchasePrice: cost1kg,
      sellingPrice: sell1kg,
      stock: Math.max(5, Math.round(defaultStock * 0.5)),
      active: true,
    },
  ];
}

/**
 * Calculate full order summary including all subtotals and estimated total
 */
export function calculateOrderSummary(selectedItems: OrderItem[]) {
  const itemBreakdown = selectedItems
    .map(item => {
      const product = PRODUCTS.find(p => p.id === item.productId);
      if (!product || item.quantity <= 0) return null;
      const subtotal = calculateItemSubtotal(product, item.quantity);
      return {
        product,
        quantity: item.quantity,
        subtotal
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const totalAmount = itemBreakdown.reduce((sum, item) => sum + item.subtotal, 0);
  const totalItemCount = itemBreakdown.length;

  return {
    itemBreakdown,
    totalAmount,
    totalItemCount
  };
}

