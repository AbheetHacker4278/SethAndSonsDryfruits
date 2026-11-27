export const CART_ITEM_TTL_MS = 60 * 60 * 1000; // 1 hour
export const CART_ITEMS_STORAGE_KEY = 'as_cart_items';
export const CART_TIMESTAMPS_STORAGE_KEY = 'as_cart_item_added_at';

/**
 * Ensure every positive-quantity item in the cart has a numeric addedAt timestamp
 * and remove stale timestamps for items no longer present.
 */
export function reconcileCartTimestamps(
  cartItems: Record<string, number>,
  timestamps: Record<string, number>,
  now: number = Date.now()
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [key, qty] of Object.entries(cartItems)) {
    if (Number(qty) <= 0) continue;
    const existingTs = timestamps[key];
    next[key] =
      typeof existingTs === 'number' && Number.isFinite(existingTs) && existingTs > 0
        ? existingTs
        : now;
  }
  return next;
}

/**
 * Remove any item kept in cart for `ttlMs` (default 1 hour) or longer without ordering,
 * keeping newer items untouched.
 */
export function purgeExpiredCartItems(
  cartItems: Record<string, number>,
  timestamps: Record<string, number>,
  now: number = Date.now(),
  ttlMs: number = CART_ITEM_TTL_MS
): {
  activeItems: Record<string, number>;
  activeTimestamps: Record<string, number>;
  expiredKeys: string[];
} {
  const activeItems: Record<string, number> = {};
  const activeTimestamps: Record<string, number> = {};
  const expiredKeys: string[] = [];

  for (const [key, rawQty] of Object.entries(cartItems)) {
    const qty = Number(rawQty || 0);
    if (qty <= 0) continue;

    const addedAt = timestamps[key];
    const hasValidTs = typeof addedAt === 'number' && Number.isFinite(addedAt) && addedAt > 0;
    if (hasValidTs && now - addedAt >= ttlMs) {
      expiredKeys.push(key);
      continue;
    }

    activeItems[key] = qty;
    activeTimestamps[key] = hasValidTs ? addedAt : now;
  }

  return { activeItems, activeTimestamps, expiredKeys };
}

/**
 * Return milliseconds until the next earliest item in cart reaches `ttlMs`,
 * or `null` when the cart is empty.
 */
export function getNextCartExpiryDelayMs(
  cartItems: Record<string, number>,
  timestamps: Record<string, number>,
  now: number = Date.now(),
  ttlMs: number = CART_ITEM_TTL_MS
): number | null {
  let earliestExpiry: number | null = null;
  for (const [key, qty] of Object.entries(cartItems)) {
    if (Number(qty) <= 0) continue;
    const addedAt = timestamps[key];
    const validTs = typeof addedAt === 'number' && Number.isFinite(addedAt) && addedAt > 0 ? addedAt : now;
    const expiresAt = validTs + ttlMs;
    if (earliestExpiry === null || expiresAt < earliestExpiry) {
      earliestExpiry = expiresAt;
    }
  }
  if (earliestExpiry === null) return null;
  return Math.max(50, earliestExpiry - now);
}
