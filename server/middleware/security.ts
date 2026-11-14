import crypto from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { AppConfig } from '../config.ts';
import { DEFAULT_BUSINESS_SETTINGS, getBusinessSettingsDoc, MongoDatabase } from '../db/mongo.ts';
import { hashToken } from '../utils/crypto.ts';
import {
  isSuratCity,
  SURAT_MARGIN_PERCENT,
  OTHER_CITY_MARGIN_PERCENT,
  SURAT_SHIPPING_FEE,
  OTHER_CITY_SHIPPING_FEE,
} from '../../shared/catalogSeed.ts';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  pendingEmail: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  phone: string;
  role: 'customer' | 'admin';
  adminRole: 'super_admin' | 'staff' | null;
  permissions: string[];
  isActive: boolean;
  profilePicture: string | null;
  tier: string;
  loyaltyPoints: number;
  marketingConsent: boolean;
  marketingConsentAt: string | null;
  consentSource: string | null;
  unsubscribedAt: string | null;
  emailPreferences: Record<string, Record<string, boolean>>;
  shippingAddress?: {
    id?: string;
    fullName?: string;
    phone?: string;
    houseFlat?: string;
    streetArea?: string;
    addressLine?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
    isDefault?: boolean;
  } | null;
  profitMargin?: number;
  shippingFee?: number;
  createdAt: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser | null;
      sessionId?: string | null;
    }
  }
}

export const SESSION_COOKIE_NAME = 'as_session';
export const ADMIN_SESSION_COOKIE_NAME = 'as_admin_session';
export const CSRF_COOKIE_NAME = 'as_csrf';

export function getSessionCookieName(req?: Request): string {
  if (!req) return SESSION_COOKIE_NAME;
  const scope = String(req.get('x-portal-scope') || '').toLowerCase();
  if (scope === 'admin') return ADMIN_SESSION_COOKIE_NAME;
  if (scope === 'storefront') return SESSION_COOKIE_NAME;
  const host = String(req.get('x-forwarded-host') || req.get('host') || '').toLowerCase();
  if (host.endsWith(':8000') || host.startsWith('admin.')) {
    return ADMIN_SESSION_COOKIE_NAME;
  }
  return SESSION_COOKIE_NAME;
}

function sendRejectedWithDrain(
  req: Request,
  res: Response,
  status: number,
  payload: Record<string, unknown>
) {
  if (!req.complete && req.readable) {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!res.headersSent) {
        res.status(status).json(payload);
      }
    };
    const timer = setTimeout(finish, 250);
    req.once('end', finish);
    req.once('close', finish);
    req.resume();
    return;
  }
  res.status(status).json(payload);
}

const rateLimitStore = new Map<string, number[]>();

export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanObjectKeys(val: unknown): unknown {
  if (Array.isArray(val)) {
    return val.map(cleanObjectKeys);
  }
  if (val && typeof val === 'object' && !(val instanceof Date) && !(val instanceof Buffer)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (k.startsWith('$') || k.includes('.')) {
        continue;
      }
      out[k] = cleanObjectKeys(v);
    }
    return out;
  }
  return val;
}

export function sanitizeNoSqlInput(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') {
    req.body = cleanObjectKeys(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    for (const key of Object.keys(req.query)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete (req.query as Record<string, unknown>)[key];
      } else {
        const val = (req.query as Record<string, unknown>)[key];
        if (val && typeof val === 'object') {
          // Collapse object operator injections like ?email[$ne]=x into strings or strip nested operators
          (req.query as Record<string, unknown>)[key] = cleanObjectKeys(val);
        }
      }
    }
  }
  next();
}

export function createRateLimiter(opts: { windowMs: number; max: number; keyPrefix: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${opts.keyPrefix}:${ip}`;
    const now = Date.now();
    const cutoff = now - opts.windowMs;
    const timestamps = (rateLimitStore.get(key) || []).filter(ts => ts > cutoff);

    if (timestamps.length >= opts.max) {
      const retryAfterSec = Math.ceil((timestamps[0] + opts.windowMs - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retryAfterSec)));
      res.status(429).json({
        error: `Too many requests. Please wait ${Math.max(1, retryAfterSec)} seconds before trying again.`,
      });
      return;
    }

    timestamps.push(now);
    rateLimitStore.set(key, timestamps);
    next();
  };
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

function shouldUseSecureCookie(config: AppConfig, req?: Request): boolean {
  if (!config.isProduction) return false;
  if (req) {
    if (req.secure || req.get('x-forwarded-proto') === 'https') return true;
    const host = (req.get('host') || '').toLowerCase();
    if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) return false;
  }
  return config.appUrl.startsWith('https://');
}

export function ensureCsrfCookie(config: AppConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    let csrfToken = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;
    const isHttps = shouldUseSecureCookie(config, req);
    if (!csrfToken) {
      csrfToken = crypto.randomBytes(24).toString('hex');
      res.cookie(CSRF_COOKIE_NAME, csrfToken, {
        httpOnly: false,
        sameSite: isHttps ? 'none' : 'lax',
        secure: isHttps,
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
      if (req.cookies) {
        req.cookies[CSRF_COOKIE_NAME] = csrfToken;
      }
    }
    res.setHeader('X-CSRF-Token', csrfToken);
    next();
  };
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  const fullPath = `${req.baseUrl}${req.path}`;
  if (fullPath === '/api/webhooks/email' || fullPath === '/api/unsubscribe') {
    next();
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;
  const headerToken = req.get('x-csrf-token');

  if (!cookieToken || !headerToken || cookieToken.length < 16) {
    sendRejectedWithDrain(req, res, 403, { error: 'Invalid or missing CSRF token. Please refresh the page.' });
    return;
  }

  try {
    const a = Buffer.from(cookieToken, 'utf8');
    const b = Buffer.from(headerToken, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      sendRejectedWithDrain(req, res, 403, { error: 'CSRF validation failed.' });
      return;
    }
  } catch {
    sendRejectedWithDrain(req, res, 403, { error: 'CSRF validation failed.' });
    return;
  }

  next();
}

export function mapCustomerRow(row: Record<string, any>, defaultAddress?: Record<string, any> | null): AuthenticatedUser {
  let prefs: Record<string, Record<string, boolean>> = {};
  if (row.emailPreferences && typeof row.emailPreferences === 'object') {
    prefs = row.emailPreferences;
  } else if (typeof row.emailPreferences === 'string') {
    try {
      prefs = JSON.parse(row.emailPreferences);
    } catch {
      prefs = {};
    }
  }

  let perms: string[] = [];
  if (Array.isArray(row.permissions)) {
    perms = row.permissions.map(String);
  } else if (typeof row.permissions === 'string') {
    try {
      perms = JSON.parse(row.permissions);
    } catch {
      perms = [];
    }
  }

  const isSurat = defaultAddress ? isSuratCity(defaultAddress.city) : false;
  const profitMargin = defaultAddress ? (isSurat ? SURAT_MARGIN_PERCENT : OTHER_CITY_MARGIN_PERCENT) : 25;
  const shippingFee = defaultAddress ? (isSurat ? SURAT_SHIPPING_FEE : OTHER_CITY_SHIPPING_FEE) : 158;

  const shippingAddress = defaultAddress
    ? {
        id: String(defaultAddress.id || ''),
        fullName: String(defaultAddress.fullName || ''),
        phone: String(defaultAddress.phone || ''),
        houseFlat: String(defaultAddress.houseFlat || ''),
        streetArea: String(defaultAddress.streetArea || ''),
        addressLine: String(defaultAddress.addressLine || ''),
        city: String(defaultAddress.city || ''),
        state: String(defaultAddress.state || ''),
        pincode: String(defaultAddress.pincode || ''),
        country: String(defaultAddress.country || 'India'),
        isDefault: Boolean(defaultAddress.isDefault),
      }
    : null;

  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    pendingEmail: row.pendingEmail ? String(row.pendingEmail) : null,
    emailVerified: Boolean(row.emailVerified),
    emailVerifiedAt: row.emailVerifiedAt ? String(row.emailVerifiedAt) : null,
    phone: String(row.phone || ''),
    role: row.role === 'admin' ? 'admin' : 'customer',
    adminRole:
      row.adminRole === 'super_admin' || row.adminRole === 'staff'
        ? row.adminRole
        : row.role === 'admin'
        ? 'super_admin'
        : null,
    permissions: perms,
    isActive: row.isActive === undefined ? true : Boolean(row.isActive),
    profilePicture: row.profilePicture ? String(row.profilePicture) : null,
    tier: String(row.tier || 'Privileged Patron'),
    loyaltyPoints: Number(row.loyaltyPoints || 0),
    marketingConsent: Boolean(row.marketingConsent),
    marketingConsentAt: row.marketingConsentAt ? String(row.marketingConsentAt) : null,
    consentSource: row.consentSource ? String(row.consentSource) : null,
    unsubscribedAt: row.unsubscribedAt ? String(row.unsubscribedAt) : null,
    emailPreferences: prefs,
    shippingAddress,
    profitMargin,
    shippingFee,
    createdAt: String(row.createdAt),
  };
}

export function attachSession(db: MongoDatabase) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const cookieName = getSessionCookieName(req);
      const rawToken = req.cookies?.[cookieName] as string | undefined;
      if (!rawToken) {
        req.user = null;
        req.sessionId = null;
        next();
        return;
      }

      const tokenHash = hashToken(rawToken);
      const now = new Date().toISOString();
      const session = await db.models.Session.findOne({
        tokenHash,
        revokedAt: null,
        expiresAt: { $gt: now },
      }).lean();

      if (!session) {
        req.user = null;
        req.sessionId = null;
        next();
        return;
      }

      const [customer, defaultAddr] = await Promise.all([
        db.models.Customer.findOne({ id: session.customerId }).lean(),
        db.models.CustomerAddress.findOne({ customerId: session.customerId, isDefault: true })
          .lean()
          .then(async res => res || (await db.models.CustomerAddress.findOne({ customerId: session.customerId }).lean())),
      ]);
      if (!customer || customer.isActive === false) {
        req.user = null;
        req.sessionId = null;
        next();
        return;
      }

      req.sessionId = String(session.id);
      req.user = mapCustomerRow(customer, defaultAddr);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    sendRejectedWithDrain(req, res, 401, { error: 'Authentication required. Please sign in to continue.' });
    return;
  }
  next();
}

export function requireVerifiedEmail(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    sendRejectedWithDrain(req, res, 401, { error: 'Authentication required. Please sign in to continue.' });
    return;
  }
  if (!req.user.emailVerified) {
    sendRejectedWithDrain(req, res, 403, {
      code: 'EMAIL_NOT_VERIFIED',
      error: 'Please verify your email address before completing checkout.',
    });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    sendRejectedWithDrain(req, res, 401, { error: 'Admin authentication required.' });
    return;
  }
  if (req.user.role !== 'admin' || !req.user.isActive) {
    sendRejectedWithDrain(req, res, 403, { error: 'Access denied. Administrator privileges required.' });
    return;
  }
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin' || !req.user.isActive) {
    res.status(403).json({ error: 'Administrator authentication required.' });
    return;
  }
  if (req.user.adminRole !== 'super_admin') {
    res.status(403).json({ error: 'Super Admin role required for this operation.' });
    return;
  }
  next();
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'admin' || !req.user.isActive) {
      res.status(403).json({ error: 'Administrator privileges required.' });
      return;
    }
    if (req.user.adminRole === 'super_admin' || req.user.permissions.includes(permission)) {
      next();
      return;
    }
    res.status(403).json({
      error: `Access denied. Missing "${permission}" permission for your staff role.`,
    });
  };
}

export function setSessionCookie(
  res: Response,
  config: AppConfig,
  rawToken: string,
  rememberMe: boolean
) {
  const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const cookieName = getSessionCookieName(res.req);
  const isHttps = shouldUseSecureCookie(config, res.req);
  res.cookie(cookieName, rawToken, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    path: '/',
    maxAge,
  });
}

export function clearSessionCookie(res: Response, config: AppConfig) {
  const cookieName = getSessionCookieName(res.req);
  const isHttps = shouldUseSecureCookie(config, res.req);
  res.clearCookie(cookieName, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    path: '/',
  });
}

export async function createSessionRecord(
  db: MongoDatabase,
  customerId: string,
  rememberMe: boolean,
  req: Request
): Promise<string> {
  const raw = crypto.randomBytes(32).toString('hex');
  const computedHash = hashToken(raw);
  const ttlMs = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  await db.models.Session.create({
    id: `sess_${crypto.randomUUID()}`,
    tokenHash: computedHash,
    customerId,
    rememberMe,
    userAgent: req.get('user-agent') || '',
    ipAddress: req.ip || req.socket.remoteAddress || '',
    expiresAt,
    revokedAt: null,
    createdAt: now,
  });

  return raw;
}

export async function logAudit(
  db: MongoDatabase,
  params: {
    actorId?: string | null;
    actorEmail?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: Record<string, unknown>;
    ipAddress?: string;
  }
) {
  await db.models.AuditLog.create({
    id: `aud_${crypto.randomUUID()}`,
    actorId: params.actorId || null,
    actorEmail: params.actorEmail || null,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId || null,
    details: params.details || {},
    ipAddress: params.ipAddress || '',
    createdAt: new Date().toISOString(),
  });
}

export async function createCustomerNotification(
  db: MongoDatabase,
  params: {
    customerId: string;
    type: string;
    title: string;
    message: string;
    relatedOrderId?: string | null;
  }
) {
  await db.models.CustomerNotification.create({
    id: `notif_${crypto.randomUUID()}`,
    customerId: params.customerId,
    type: params.type,
    title: params.title,
    message: params.message,
    relatedOrderId: params.relatedOrderId || null,
    isRead: false,
    createdAt: new Date().toISOString(),
  });
}

export async function createAdminNotification(
  db: MongoDatabase,
  params: {
    type: string;
    title: string;
    message: string;
    severity?: 'info' | 'warning' | 'critical';
    entityType?: string | null;
    entityId?: string | null;
  }
) {
  const biz = await getBusinessSettingsDoc(db);
  const prefs = biz.notificationPreferences || DEFAULT_BUSINESS_SETTINGS.notificationPreferences;
  if (
    (params.type === 'low_stock' || params.type === 'out_of_stock') &&
    prefs.lowStockAlerts === false
  ) {
    return;
  }
  if (params.type === 'new_order' && prefs.newOrderAlerts === false) {
    return;
  }
  if (params.type === 'expiry_approaching' && prefs.expiryAlerts === false) {
    return;
  }
  if (params.type === 'supplier_payment_due' && prefs.supplierPaymentAlerts === false) {
    return;
  }

  await db.models.AdminNotification.create({
    id: `anotif_${crypto.randomUUID()}`,
    type: params.type,
    title: params.title,
    message: params.message,
    severity: params.severity || 'info',
    entityType: params.entityType || null,
    entityId: params.entityId || null,
    isRead: false,
    createdAt: new Date().toISOString(),
  });
}

export async function clearResolvedStockAlerts(
  db: MongoDatabase,
  productId: string,
  newStock: number,
  minStockAlert: number
): Promise<void> {
  if (newStock > 0) {
    await db.models.AdminNotification.updateMany(
      { type: 'out_of_stock', entityId: productId, isRead: false },
      { $set: { isRead: true } }
    );
  }
  if (newStock > minStockAlert) {
    await db.models.AdminNotification.updateMany(
      { type: 'low_stock', entityId: productId, isRead: false },
      { $set: { isRead: true } }
    );
  }
  const zeroRemaining = await db.models.Product.countDocuments({
    status: 'published',
    stock: { $lte: 0 },
  });
  if (zeroRemaining === 0) {
    await db.models.AdminNotification.updateMany(
      { type: 'out_of_stock', entityId: 'summary_zero_stock', isRead: false },
      { $set: { isRead: true } }
    );
  }
}

export async function emitStockAlertIfNeeded(
  db: MongoDatabase,
  prod: { id: string; name: string; unit?: string; stock?: number; minStockAlert?: number },
  contextNote?: string
): Promise<void> {
  const stock = Number(prod.stock || 0);
  const minAlert = Number(prod.minStockAlert ?? 5);
  if (stock > minAlert) {
    await clearResolvedStockAlerts(db, prod.id, stock, minAlert);
    return;
  }

  const type = stock <= 0 ? 'out_of_stock' : 'low_stock';
  const existingUnread = await db.models.AdminNotification.findOne({
    type,
    entityType: 'product',
    entityId: prod.id,
    isRead: false,
  }).lean();
  if (existingUnread) return;

  await createAdminNotification(db, {
    type,
    title:
      stock <= 0
        ? `Out of Stock (0 remaining): ${prod.name}`
        : `Low Stock Alert: ${prod.name}`,
    message:
      stock <= 0
        ? `${prod.name} reached 0 ${prod.unit || 'kg'}${contextNote ? ` (${contextNote})` : ''}. Restock needed.`
        : `Stock for ${prod.name} is ${stock} ${prod.unit || 'kg'} (alert level: ${minAlert}).`,
    severity: stock <= 0 ? 'critical' : 'warning',
    entityType: 'product',
    entityId: prod.id,
  });
}

export async function checkAndEmitExpiryNotifications(db: MongoDatabase): Promise<void> {
  const biz = await getBusinessSettingsDoc(db);
  if (biz.notificationPreferences?.expiryAlerts === false) return;

  const soonCutoff = new Date(Date.now() + 45 * 86400_000).toISOString().slice(0, 10);
  const batches = await db.models.InventoryBatch.find({
    remainingQty: { $gt: 0 },
    expiryDate: { $ne: null, $lte: soonCutoff },
  }).lean();

  for (const batch of batches) {
    if (!batch.expiryDate) continue;
    const existing = await db.models.AdminNotification.findOne({
      type: 'expiry_approaching',
      entityType: 'batch',
      entityId: batch.id,
    }).lean();
    if (!existing) {
      const prod = await db.models.Product.findOne({ id: batch.productId }).lean();
      await createAdminNotification(db, {
        type: 'expiry_approaching',
        title: `Expiry Approaching: ${prod?.name || batch.productId}`,
        message: `Batch ${batch.batchNumber} (${batch.remainingQty} remaining) expires on ${batch.expiryDate}.`,
        severity: 'warning',
        entityType: 'batch',
        entityId: batch.id,
      });
    }
  }
}
