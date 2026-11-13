import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppConfig } from '../config.ts';
import { DEFAULT_EMAIL_PREFERENCES, MongoDatabase } from '../db/mongo.ts';
import {
  createCustomerNotification,
  mapCustomerRow,
  requireAuth,
} from '../middleware/security.ts';
import { MediaStorageService } from '../services/cloudinaryService.ts';
import { EmailService } from '../services/emailService.ts';
import {
  generateSecureToken,
  hashPassword,
  isValidEmail,
  isValidMobile,
  normalizeEmail,
  normalizeMobile,
  validatePasswordStrength,
  verifyPassword,
} from '../utils/crypto.ts';

function getRequestOrigin(req: any, fallback: string): string {
  const forwardedHost = (req.headers?.['x-forwarded-host'] || req.headers?.host || '').toString();
  if (forwardedHost && !forwardedHost.includes('localhost') && !forwardedHost.includes('127.0.0.1')) {
    const proto = (req.headers?.['x-forwarded-proto'] || (req.secure ? 'https' : 'http')).toString();
    return `${proto}://${forwardedHost}`.replace(/\/+$/, '');
  }
  return fallback;
}

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPEG, and WEBP images are allowed.'));
    }
  },
});

const addressSchema = z.object({
  label: z.string().trim().min(1).max(40).default('Home'),
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(10).max(20),
  addressLine: z.string().trim().min(4).max(300),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode: z.string().trim().min(4).max(12),
  isDefault: z.boolean().optional().default(false),
});

export function createAccountRouter(
  db: MongoDatabase,
  config: AppConfig,
  emailService: EmailService,
  mediaStorage: MediaStorageService
) {
  const router = Router();
  router.use(requireAuth);

  router.get('/overview', async (req, res) => {
    const userId = req.user!.id;
    const customerRow = await db.models.Customer.findOne({ id: userId }).lean();
    if (!customerRow) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    const [totalOrders, recentOrders, unreadNotifications, coupons] = await Promise.all([
      db.models.Order.countDocuments({ customerId: userId }),
      db.models.Order.find(
        { customerId: userId },
        { id: 1, orderNumber: 1, orderType: 1, status: 1, paymentStatus: 1, totalAmount: 1, createdAt: 1, _id: 0 }
      )
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      db.models.CustomerNotification.countDocuments({ customerId: userId, isRead: false }),
      db.models.Coupon.find(
        {
          active: true,
          $and: [
            { $or: [{ startDate: null }, { startDate: { $lte: new Date().toISOString() } }] },
            { $or: [{ endDate: null }, { endDate: { $gte: new Date().toISOString() } }] },
          ],
        },
        { id: 1, code: 1, title: 1, description: 1, discountType: 1, discountValue: 1, minOrderValue: 1, maxDiscount: 1, startDate: 1, endDate: 1, _id: 0 }
      )
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    res.json({
      user: mapCustomerRow(customerRow),
      stats: {
        totalOrders,
        loyaltyPoints: Number(customerRow.loyaltyPoints || 0),
        unreadNotifications,
        availableCouponsCount: coupons.length,
      },
      recentOrders,
      availableCoupons: coupons,
    });
  });

  router.put('/profile', async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const phoneRaw = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    const profilePicture =
      typeof req.body?.profilePicture === 'string' ? req.body.profilePicture.trim() : undefined;

    if (name.length < 2) {
      res.status(400).json({ error: 'Name must be at least 2 characters.' });
      return;
    }

    const cleanPhone = normalizeMobile(phoneRaw);
    if (!isValidMobile(cleanPhone)) {
      res.status(400).json({ error: 'Please provide a valid 10-digit mobile number.' });
      return;
    }

    const dupPhone = await db.models.Customer.findOne({
      phone: cleanPhone,
      id: { $ne: req.user!.id },
    }).lean();
    if (dupPhone) {
      res.status(409).json({ error: 'That mobile number is already associated with another account.' });
      return;
    }

    const now = new Date().toISOString();
    const updateDoc: Record<string, unknown> = {
      name,
      phone: cleanPhone,
      updatedAt: now,
    };
    if (profilePicture !== undefined) {
      updateDoc.profilePicture = profilePicture || null;
    }

    const updated = await db.models.Customer.findOneAndUpdate(
      { id: req.user!.id },
      { $set: updateDoc },
      { new: true }
    ).lean();

    res.json({ message: 'Profile updated successfully.', user: updated ? mapCustomerRow(updated) : null });
  });

  router.post('/avatar', avatarUpload.single('avatar'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Please upload a valid image file (PNG, JPG, WEBP).' });
      return;
    }
    try {
      const uploaded = await mediaStorage.uploadBuffer({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        folder: 'avatars',
        mimeType: req.file.mimetype,
        resourceType: 'image',
      });
      const updated = await db.models.Customer.findOneAndUpdate(
        { id: req.user!.id },
        { $set: { profilePicture: uploaded.url, updatedAt: new Date().toISOString() } },
        { new: true }
      ).lean();

      res.json({
        message: 'Profile picture uploaded to Cloudinary.',
        profilePicture: uploaded.url,
        user: updated ? mapCustomerRow(updated) : null,
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: err instanceof Error ? err.message : 'Cloudinary avatar upload failed.' });
    }
  });

  router.post('/change-email', async (req, res) => {
    const newEmailRaw = typeof req.body?.newEmail === 'string' ? req.body.newEmail.trim() : '';
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';

    if (!newEmailRaw || !isValidEmail(newEmailRaw)) {
      res.status(400).json({ error: 'Please provide a valid new email address.' });
      return;
    }
    const cleanNewEmail = normalizeEmail(newEmailRaw);
    if (cleanNewEmail === req.user!.email) {
      res.status(400).json({ error: 'New email address matches your current verified email.' });
      return;
    }

    const cust = await db.models.Customer.findOne({ id: req.user!.id }).lean();
    if (!cust) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    if (cust.passwordHash) {
      const ok = await verifyPassword(currentPassword, cust.passwordHash);
      if (!ok) {
        res.status(401).json({ error: 'Current password is incorrect.' });
        return;
      }
    }

    const taken = await db.models.Customer.findOne({
      email: cleanNewEmail,
      id: { $ne: req.user!.id },
    }).lean();
    if (taken) {
      res.status(409).json({ error: 'This email address is already registered to another account.' });
      return;
    }

    const now = new Date().toISOString();
    await db.models.VerificationToken.updateMany(
      { customerId: req.user!.id, purpose: 'email_change', usedAt: null },
      { $set: { usedAt: now } }
    );

    const { raw, hash } = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db.models.VerificationToken.create({
      id: `vtok_${crypto.randomUUID()}`,
      customerId: req.user!.id,
      emailTarget: cleanNewEmail,
      purpose: 'email_change',
      tokenHash: hash,
      expiresAt,
      createdAt: now,
    });

    const updated = await db.models.Customer.findOneAndUpdate(
      { id: req.user!.id },
      { $set: { pendingEmail: cleanNewEmail, lastVerificationSentAt: now, updatedAt: now } },
      { new: true }
    ).lean();

    const changeBaseUrl = getRequestOrigin(req, config.appUrl);
    try {
      await emailService.sendVerificationEmail(
        { id: cust.id, name: cust.name, email: cust.email },
        raw,
        cleanNewEmail,
        'email_change',
        changeBaseUrl
      );
    } catch {
      // queued
    }

    res.json({
      message: `A verification link has been sent to ${cleanNewEmail}. Your email will update once verified.`,
      user: updated ? mapCustomerRow(updated) : null,
    });
  });

  router.post('/change-password', async (req, res) => {
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    const confirmPassword = typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : '';

    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: 'New passwords do not match.' });
      return;
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      res.status(400).json({
        error:
          'New password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.',
      });
      return;
    }

    const cust = await db.models.Customer.findOne({ id: req.user!.id }).lean();
    if (!cust) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    if (cust.passwordHash) {
      const validCurrent = await verifyPassword(currentPassword, cust.passwordHash);
      if (!validCurrent) {
        res.status(401).json({ error: 'Current password is incorrect.' });
        return;
      }
    }

    const now = new Date().toISOString();
    const newHash = await hashPassword(newPassword);
    await db.models.Customer.updateOne(
      { id: req.user!.id },
      { $set: { passwordHash: newHash, updatedAt: now } }
    );

    await db.models.Session.updateMany(
      { customerId: req.user!.id, id: { $ne: req.sessionId || '' }, revokedAt: null },
      { $set: { revokedAt: now } }
    );

    await createCustomerNotification(db, {
      customerId: req.user!.id,
      type: 'account_security',
      title: 'Password Updated',
      message: 'Your account password was changed and other active sessions were signed out.',
    });

    try {
      await emailService.sendPasswordChangedEmail({ id: cust.id, name: cust.name, email: cust.email });
    } catch {
      // queued
    }

    res.json({ message: 'Password updated successfully.' });
  });

  router.get('/preferences', async (req, res) => {
    const row = await db.models.Customer.findOne({ id: req.user!.id }).lean();
    const user = mapCustomerRow(row!);
    res.json({
      marketingConsent: user.marketingConsent,
      marketingConsentAt: user.marketingConsentAt,
      consentSource: user.consentSource,
      unsubscribedAt: user.unsubscribedAt,
      emailPreferences: user.emailPreferences,
    });
  });

  router.put('/preferences', async (req, res) => {
    const incomingMarketing = (req.body?.marketing || {}) as Record<string, unknown>;
    const unsubscribeAll = Boolean(req.body?.unsubscribeAll);

    const marketingPrefs = unsubscribeAll
      ? {
          newProductAnnouncements: false,
          festivalOffers: false,
          promotionalDiscounts: false,
          specialCampaigns: false,
          newsletter: false,
        }
      : {
          newProductAnnouncements: Boolean(incomingMarketing.newProductAnnouncements),
          festivalOffers: Boolean(incomingMarketing.festivalOffers),
          promotionalDiscounts: Boolean(incomingMarketing.promotionalDiscounts),
          specialCampaigns: Boolean(incomingMarketing.specialCampaigns),
          newsletter: Boolean(incomingMarketing.newsletter),
        };

    const anyMarketingEnabled = Object.values(marketingPrefs).some(Boolean);
    const now = new Date().toISOString();
    const fullPrefs = {
      transactional: { ...DEFAULT_EMAIL_PREFERENCES.transactional },
      marketing: marketingPrefs,
    };

    const current = await db.models.Customer.findOne({ id: req.user!.id }).lean();
    const updateFields = anyMarketingEnabled
      ? {
          marketingConsent: true,
          marketingConsentAt: current?.marketingConsentAt || now,
          consentSource: current?.consentSource || 'account_preferences',
          unsubscribedAt: null,
          emailPreferences: fullPrefs,
          updatedAt: now,
        }
      : {
          marketingConsent: false,
          unsubscribedAt: now,
          emailPreferences: fullPrefs,
          updatedAt: now,
        };

    const updated = await db.models.Customer.findOneAndUpdate(
      { id: req.user!.id },
      { $set: updateFields },
      { new: true }
    ).lean();

    res.json({
      message: anyMarketingEnabled
        ? 'Communication preferences saved.'
        : 'You have been unsubscribed from all marketing emails.',
      user: updated ? mapCustomerRow(updated) : null,
    });
  });

  // Saved Addresses
  router.get('/addresses', async (req, res) => {
    const rows = await db.models.CustomerAddress.find(
      { customerId: req.user!.id },
      { _id: 0 }
    )
      .sort({ isDefault: -1, createdAt: -1 })
      .lean();
    res.json({ addresses: rows });
  });

  router.post('/addresses', async (req, res) => {
    const parsed = addressSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid address data' });
      return;
    }

    const data = parsed.data;
    const id = `addr_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    if (data.isDefault) {
      await db.models.CustomerAddress.updateMany(
        { customerId: req.user!.id },
        { $set: { isDefault: false } }
      );
    }

    const created = await db.models.CustomerAddress.create({
      id,
      customerId: req.user!.id,
      label: data.label,
      fullName: data.fullName,
      phone: normalizeMobile(data.phone),
      addressLine: data.addressLine,
      city: data.city,
      state: data.state,
      pincode: data.pincode,
      isDefault: Boolean(data.isDefault),
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({ address: created.toObject() });
  });

  router.put('/addresses/:id', async (req, res) => {
    const existing = await db.models.CustomerAddress.findOne({
      id: req.params.id,
      customerId: req.user!.id,
    }).lean();
    if (!existing) {
      res.status(404).json({ error: 'Address not found.' });
      return;
    }
    const parsed = addressSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid address data' });
      return;
    }
    const data = parsed.data;
    const now = new Date().toISOString();

    if (data.isDefault) {
      await db.models.CustomerAddress.updateMany(
        { customerId: req.user!.id },
        { $set: { isDefault: false } }
      );
    }

    const updated = await db.models.CustomerAddress.findOneAndUpdate(
      { id: req.params.id, customerId: req.user!.id },
      {
        $set: {
          label: data.label,
          fullName: data.fullName,
          phone: normalizeMobile(data.phone),
          addressLine: data.addressLine,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
          isDefault: Boolean(data.isDefault),
          updatedAt: now,
        },
      },
      { new: true }
    ).lean();

    res.json({ address: updated });
  });

  router.delete('/addresses/:id', async (req, res) => {
    const del = await db.models.CustomerAddress.deleteOne({
      id: req.params.id,
      customerId: req.user!.id,
    });
    if (del.deletedCount === 0) {
      res.status(404).json({ error: 'Address not found.' });
      return;
    }
    res.json({ message: 'Address removed.' });
  });

  // Wishlist
  router.get('/wishlist', async (req, res) => {
    const wishRows = await db.models.WishlistItem.find({ customerId: req.user!.id })
      .sort({ createdAt: -1 })
      .lean();
    const productIds = wishRows.map(w => w.productId);
    const products = await db.models.Product.find({ id: { $in: productIds } }).lean();
    const prodMap = new Map(products.map(p => [p.id, p]));

    res.json({
      items: wishRows
        .map(w => {
          const p = prodMap.get(w.productId);
          if (!p) return null;
          return {
            wishlistId: w.id,
            addedAt: w.createdAt,
            product: {
              id: p.id,
              name: p.name,
              hindiName: p.hindiName,
              subtitle: p.subtitle,
              price: p.price,
              unit: p.unit,
              image: p.image,
              origin: p.origin,
              grade: p.grade,
            },
          };
        })
        .filter(Boolean),
    });
  });

  router.post('/wishlist', async (req, res) => {
    const productId = typeof req.body?.productId === 'string' ? req.body.productId.trim() : '';
    const product = await db.models.Product.findOne({ id: productId, status: 'published' }).lean();
    if (!product) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    await db.models.WishlistItem.updateOne(
      { customerId: req.user!.id, productId },
      {
        $setOnInsert: {
          id: `wish_${crypto.randomUUID()}`,
          customerId: req.user!.id,
          productId,
          createdAt: new Date().toISOString(),
        },
      },
      { upsert: true }
    );

    res.status(201).json({ message: 'Added to wishlist.' });
  });

  router.delete('/wishlist/:productId', async (req, res) => {
    await db.models.WishlistItem.deleteOne({
      customerId: req.user!.id,
      productId: req.params.productId,
    });
    res.json({ message: 'Removed from wishlist.' });
  });

  // Notifications
  router.get('/notifications', async (req, res) => {
    const rows = await db.models.CustomerNotification.find(
      { customerId: req.user!.id },
      { _id: 0 }
    )
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ notifications: rows });
  });

  router.post('/notifications/read', async (req, res) => {
    const notificationId = typeof req.body?.id === 'string' ? req.body.id : '';
    if (notificationId) {
      await db.models.CustomerNotification.updateOne(
        { id: notificationId, customerId: req.user!.id },
        { $set: { isRead: true } }
      );
    } else {
      await db.models.CustomerNotification.updateMany(
        { customerId: req.user!.id },
        { $set: { isRead: true } }
      );
    }
    res.json({ message: 'Notifications marked as read.' });
  });

  // Available coupons
  router.get('/coupons', async (_req, res) => {
    const now = new Date().toISOString();
    const coupons = await db.models.Coupon.find(
      {
        active: true,
        $and: [
          { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
          { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
        ],
      },
      { id: 1, code: 1, title: 1, description: 1, discountType: 1, discountValue: 1, minOrderValue: 1, maxDiscount: 1, startDate: 1, endDate: 1, _id: 0 }
    )
      .sort({ createdAt: -1 })
      .lean();
    res.json({ coupons });
  });

  return router;
}
