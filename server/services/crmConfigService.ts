import { z } from 'zod';
import { MongoDatabase } from '../db/mongo.ts';

export interface CrmSegmentationConfig {
  abandonmentThresholdMinutes: number;
  cartExpiryHours: number;
  followUpCooldownHours: number;
  vipSpendThreshold: number;
  highValueSpendThreshold: number;
  inactiveDaysThreshold: number;
  updatedAt?: string;
  updatedBy?: string | null;
}

export const DEFAULT_CRM_CONFIG: CrmSegmentationConfig = {
  abandonmentThresholdMinutes: 30,
  cartExpiryHours: 168,
  followUpCooldownHours: 24,
  vipSpendThreshold: 10000,
  highValueSpendThreshold: 5000,
  inactiveDaysThreshold: 90,
};

export const updateCrmConfigSchema = z
  .object({
    abandonmentThresholdMinutes: z.coerce.number().int().min(5).max(10080).optional(),
    cartExpiryHours: z.coerce.number().int().min(24).max(2160).optional(),
    followUpCooldownHours: z.coerce.number().int().min(1).max(720).optional(),
    vipSpendThreshold: z.coerce.number().min(1000).max(10000000).optional(),
    highValueSpendThreshold: z.coerce.number().min(500).max(10000000).optional(),
    inactiveDaysThreshold: z.coerce.number().int().min(7).max(730).optional(),
  })
  .strict();

export async function getCrmConfig(db: MongoDatabase): Promise<CrmSegmentationConfig> {
  const row = await db.models.AdminCrmSetting.findOne({ id: 'singleton' }, { _id: 0 }).lean();
  const raw = (row?.data && typeof row.data === 'object' ? row.data : {}) as Partial<CrmSegmentationConfig>;

  const highVal = Number(raw.highValueSpendThreshold ?? DEFAULT_CRM_CONFIG.highValueSpendThreshold);
  const vipVal = Math.max(highVal + 1, Number(raw.vipSpendThreshold ?? DEFAULT_CRM_CONFIG.vipSpendThreshold));

  return {
    abandonmentThresholdMinutes: Number(
      raw.abandonmentThresholdMinutes ?? DEFAULT_CRM_CONFIG.abandonmentThresholdMinutes
    ),
    cartExpiryHours: Number(raw.cartExpiryHours ?? DEFAULT_CRM_CONFIG.cartExpiryHours),
    followUpCooldownHours: Number(raw.followUpCooldownHours ?? DEFAULT_CRM_CONFIG.followUpCooldownHours),
    vipSpendThreshold: vipVal,
    highValueSpendThreshold: highVal,
    inactiveDaysThreshold: Number(raw.inactiveDaysThreshold ?? DEFAULT_CRM_CONFIG.inactiveDaysThreshold),
    updatedAt: row?.updatedAt,
    updatedBy: row?.updatedBy || null,
  };
}

export async function updateCrmConfig(
  db: MongoDatabase,
  patch: Partial<CrmSegmentationConfig>,
  updatedBy: string
): Promise<CrmSegmentationConfig> {
  const current = await getCrmConfig(db);
  const merged: CrmSegmentationConfig = {
    abandonmentThresholdMinutes:
      patch.abandonmentThresholdMinutes ?? current.abandonmentThresholdMinutes,
    cartExpiryHours: patch.cartExpiryHours ?? current.cartExpiryHours,
    followUpCooldownHours: patch.followUpCooldownHours ?? current.followUpCooldownHours,
    vipSpendThreshold: patch.vipSpendThreshold ?? current.vipSpendThreshold,
    highValueSpendThreshold: patch.highValueSpendThreshold ?? current.highValueSpendThreshold,
    inactiveDaysThreshold: patch.inactiveDaysThreshold ?? current.inactiveDaysThreshold,
  };

  if (merged.highValueSpendThreshold >= merged.vipSpendThreshold) {
    throw new Error('High-Value spend threshold must be strictly lower than the VIP spend threshold.');
  }

  const now = new Date().toISOString();
  await db.models.AdminCrmSetting.findOneAndUpdate(
    { id: 'singleton' },
    { $set: { id: 'singleton', data: merged, updatedBy, updatedAt: now } },
    { upsert: true, returnDocument: 'after' }
  );

  return { ...merged, updatedAt: now, updatedBy };
}
