import { describe, expect, it } from 'vitest';
import {
  CART_ITEM_TTL_MS,
  getNextCartExpiryDelayMs,
  purgeExpiredCartItems,
  reconcileCartTimestamps,
} from '../src/utils/cartExpiry.ts';

describe('Storefront Cart 1-Hour Auto-Expiry', () => {
  it('automatically removes an item kept in cart for >= 1 hour without ordering', () => {
    const now = 1_700_000_000_000;
    const oneHourAgo = now - CART_ITEM_TTL_MS;

    const { activeItems, activeTimestamps, expiredKeys } = purgeExpiredCartItems(
      { badam: 2 },
      { badam: oneHourAgo },
      now
    );

    expect(expiredKeys).toEqual(['badam']);
    expect(activeItems).toEqual({});
    expect(activeTimestamps).toEqual({});
  });

  it('removes only items kept >= 1 hour while keeping newer items in the cart', () => {
    const now = 1_700_000_000_000;
    const sixtyFiveMinsAgo = now - 65 * 60 * 1000;
    const twentyMinsAgo = now - 20 * 60 * 1000;

    const { activeItems, activeTimestamps, expiredKeys } = purgeExpiredCartItems(
      { badam: 1, 'kaju::var_500': 3 },
      { badam: sixtyFiveMinsAgo, 'kaju::var_500': twentyMinsAgo },
      now
    );

    expect(expiredKeys).toEqual(['badam']);
    expect(activeItems).toEqual({ 'kaju::var_500': 3 });
    expect(activeTimestamps).toEqual({ 'kaju::var_500': twentyMinsAgo });

    const nextDelay = getNextCartExpiryDelayMs(activeItems, activeTimestamps, now);
    expect(nextDelay).toBe(40 * 60 * 1000);
  });

  it('backfills timestamps for newly added items and preserves existing timestamps', () => {
    const earlier = 1_700_000_000_000;
    const now = earlier + 15 * 60 * 1000;

    const reconciled = reconcileCartTimestamps(
      { badam: 2, kesar: 1, removed_key: 0 },
      { badam: earlier, stale_key: earlier - 5000 },
      now
    );

    expect(reconciled).toEqual({
      badam: earlier,
      kesar: now,
    });
  });
});
