import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { AppConfig } from '../config.ts';
import { DEFAULT_EMAIL_PREFERENCES, MongoDatabase } from '../db/mongo.ts';
import {
  clearSessionCookie,
  createAdminNotification,
  createCustomerNotification,
  createRateLimiter,
  createSessionRecord,
  logAudit,
  mapCustomerRow,
  setSessionCookie,
} from '../middleware/security.ts';
import { EmailService } from '../services/emailService.ts';
import {
  generateSecureToken,
  hashPassword,
  hashToken,
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

const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  email: z.string().trim().email('Please enter a valid email address'),
  mobileNumber: z.string().trim().min(10, 'Please enter a valid 10-digit mobile number').max(20),
  password: z.string().min(8).max(128),
  confirmPassword: z.string(),
  houseFlat: z.string().trim().min(1, 'House Number / Flat Number is required').max(150),
  streetArea: z.string().trim().min(2, 'Street / Area / Locality is required').max(200),
  city: z.string().trim().min(2, 'City is required').max(100),
  state: z.string().trim().min(2, 'State is required').max(100),
  pincode: z.string().trim().regex(/^\d{6}$/, 'PIN Code must be a 6-digit number'),
  country: z.string().trim().min(2, 'Country is required').default('India'),
  acceptTerms: z.literal(true, {
    message: 'You must accept the Terms & Conditions to register',
  }),
  marketingConsent: z.boolean().optional().default(false),
});

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

const adminOtpRequestSchema = z.object({
  email: z.string().trim().email('Please enter a valid administrator email address'),
});

const adminOtpVerifySchema = z.object({
  email: z.string().trim().email('Please enter a valid administrator email address'),
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Please enter the 6-digit numeric verification code'),
  rememberMe: z.boolean().optional().default(true),
});

export function createAuthRouter(db: MongoDatabase, config: AppConfig, emailService: EmailService) {
  const router = Router();

  const authRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 30, keyPrefix: 'auth' });
  const strictAuthRateLimit = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 15,
    keyPrefix: 'auth-strict',
  });

  router.get('/config', (_req, res) => {
    res.json({
      googleOAuthEnabled: Boolean(config.googleClientId && config.googleClientSecret),
      emailVerificationRequired: true,
    });
  });

  router.get('/me', async (req, res) => {
    if (!req.user) {
      res.json({ user: null });
      return;
    }
    const defaultAddr =
      (await db.models.CustomerAddress.findOne({ customerId: req.user.id, isDefault: true }).lean()) ||
      (await db.models.CustomerAddress.findOne({ customerId: req.user.id }).lean());
    const customer = await db.models.Customer.findOne({ id: req.user.id }).lean();
    res.json({ user: customer ? mapCustomerRow(customer, defaultAddr) : req.user });
  });

  router.post('/register', strictAuthRateLimit, async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid registration data' });
      return;
    }

    const { fullName, email, mobileNumber, password, confirmPassword, marketingConsent } = parsed.data;
    const cleanEmail = normalizeEmail(email);
    const cleanPhone = normalizeMobile(mobileNumber);

    if (!isValidEmail(cleanEmail)) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }
    if (!isValidMobile(cleanPhone)) {
      res.status(400).json({ error: 'Please provide a valid 10-digit mobile number.' });
      return;
    }
    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Passwords do not match.' });
      return;
    }

    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      res.status(400).json({
        error:
          'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.',
      });
      return;
    }

    const existingEmail = await db.models.Customer.findOne({ email: cleanEmail }).lean();
    if (existingEmail) {
      res.status(409).json({ error: 'An account with this email address already exists.' });
      return;
    }

    const existingPhone = await db.models.Customer.findOne({ phone: cleanPhone }).lean();
    if (existingPhone) {
      res.status(409).json({ error: 'An account with this mobile number is already registered.' });
      return;
    }

    const customerId = `cust_${crypto.randomUUID()}`;
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();

    const prefs = {
      ...DEFAULT_EMAIL_PREFERENCES,
      marketing: {
        newProductAnnouncements: marketingConsent,
        festivalOffers: marketingConsent,
        promotionalDiscounts: marketingConsent,
        specialCampaigns: marketingConsent,
        newsletter: marketingConsent,
      },
    };

    const created = await db.models.Customer.create({
      id: customerId,
      name: fullName,
      email: cleanEmail,
      emailVerified: false,
      phone: cleanPhone,
      passwordHash,
      role: 'customer',
      isActive: true,
      tier: 'Privileged Patron',
      loyaltyPoints: 0,
      marketingConsent: Boolean(marketingConsent),
      marketingConsentAt: marketingConsent ? now : null,
      consentSource: marketingConsent ? 'registration' : null,
      emailPreferences: prefs,
      lastVerificationSentAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const { raw, hash } = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db.models.VerificationToken.create({
      id: `vtok_${crypto.randomUUID()}`,
      customerId,
      emailTarget: cleanEmail,
      purpose: 'email_verify',
      tokenHash: hash,
      expiresAt,
      createdAt: now,
    });

    await createCustomerNotification(db, {
      customerId,
      type: 'account_security',
      title: 'Verify Your Email Address',
      message: `Welcome to Seth And Sons DryFruits! Please verify ${cleanEmail} using the link sent to your inbox.`,
    });

    await createAdminNotification(db, {
      type: 'new_customer',
      title: `New Customer Registered: ${fullName}`,
      message: `${fullName} (${cleanEmail}) registered as a patron.`,
      severity: 'info',
      entityType: 'customer',
      entityId: customerId,
    });

    const addressId = `addr_${crypto.randomUUID()}`;
    const addressLine = `${parsed.data.houseFlat.trim()}, ${parsed.data.streetArea.trim()}`;
    const createdAddress = await db.models.CustomerAddress.create({
      id: addressId,
      customerId,
      label: 'Home',
      fullName,
      phone: cleanPhone,
      houseFlat: parsed.data.houseFlat.trim(),
      streetArea: parsed.data.streetArea.trim(),
      addressLine,
      city: parsed.data.city.trim(),
      state: parsed.data.state.trim(),
      pincode: parsed.data.pincode.trim(),
      country: (parsed.data.country || 'India').trim(),
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });

    let verificationEmailResult: Record<string, unknown> = {};
    const requestBaseUrl = getRequestOrigin(req, config.appUrl);
    try {
      verificationEmailResult = await emailService.sendVerificationEmail(
        { id: customerId, name: fullName, email: cleanEmail },
        raw,
        undefined,
        'email_verify',
        requestBaseUrl
      );
    } catch {
      verificationEmailResult = { queued: false };
    }

    const rawSession = await createSessionRecord(db, customerId, false, req);
    setSessionCookie(res, config, rawSession, false);

    res.status(201).json({
      message: 'Account created! Please check your email to verify your address within 24 hours.',
      user: mapCustomerRow(created.toObject(), createdAddress.toObject()),
      verificationRequired: true,
      emailStatus: verificationEmailResult,
    });
  });

  async function handleLogin(req: any, res: any, requireAdminPortal: boolean) {
    if (requireAdminPortal) {
      res.status(403).json({
        error: 'Password login is disabled for the Admin Portal. Please sign in using Email OTP.',
      });
      return;
    }

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Email and password are required' });
      return;
    }

    const cleanEmail = normalizeEmail(parsed.data.email);
    const { password, rememberMe } = parsed.data;

    const row = await db.models.Customer.findOne({ email: cleanEmail }).lean();

    if (!row) {
      res.status(401).json({ error: 'Invalid email address or password.' });
      return;
    }

    if (row.role === 'admin') {
      res.status(403).json({
        error: 'Administrator accounts must sign in using Email OTP on the Admin Portal.',
      });
      return;
    }

    if (row.lockedUntil && new Date(row.lockedUntil).getTime() > Date.now()) {
      res.status(429).json({
        error: 'This account is temporarily locked due to repeated failed attempts. Please try again in 15 minutes.',
      });
      return;
    }

    const passwordOk = await verifyPassword(password, row.passwordHash || '');
    if (!passwordOk) {
      const nextFails = Number(row.failedLoginAttempts || 0) + 1;
      const lockedUntil = nextFails >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
      await db.models.Customer.updateOne(
        { id: row.id },
        { $set: { failedLoginAttempts: nextFails, lockedUntil, updatedAt: new Date().toISOString() } }
      );

      res.status(401).json({ error: 'Invalid email address or password.' });
      return;
    }

    if (row.isActive === false) {
      res.status(403).json({
        error: 'This account has been deactivated. Contact the Super Admin for assistance.',
      });
      return;
    }

    await db.models.Customer.updateOne(
      { id: row.id },
      { $set: { failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date().toISOString() } }
    );

    const defaultAddr = (await db.models.CustomerAddress.findOne({ customerId: row.id, isDefault: true }).lean())
      || (await db.models.CustomerAddress.findOne({ customerId: row.id }).sort({ createdAt: -1 }).lean());

    const rawSession = await createSessionRecord(db, row.id, Boolean(rememberMe), req);
    setSessionCookie(res, config, rawSession, Boolean(rememberMe));

    res.json({
      message: 'Signed in successfully.',
      user: mapCustomerRow(row, defaultAddr),
    });
  }

  router.post('/login', authRateLimit, (req, res) => {
    return handleLogin(req, res, false);
  });

  router.post('/admin-login', strictAuthRateLimit, (req, res) => {
    return handleLogin(req, res, true);
  });

  router.post('/admin-otp/request', strictAuthRateLimit, async (req, res) => {
    const parsed = adminOtpRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Valid email is required.' });
      return;
    }

    const cleanEmail = normalizeEmail(parsed.data.email);
    const genericMsg =
      'If an authorized administrator account matches this email, a 6-digit verification code has been sent (valid for 10 minutes).';

    const admin = await db.models.Customer.findOne({ email: cleanEmail }).lean();
    if (!admin || admin.role !== 'admin' || admin.isActive === false) {
      res.json({ message: genericMsg, expiresInSeconds: 600 });
      return;
    }

    const latestUnused = await db.models.VerificationToken.findOne({
      customerId: admin.id,
      purpose: 'admin_login_otp',
      usedAt: null,
    })
      .sort({ createdAt: -1 })
      .lean();

    if (latestUnused) {
      const elapsedSec = (Date.now() - new Date(latestUnused.createdAt).getTime()) / 1000;
      if (elapsedSec < 30) {
        res.status(429).json({
          error: `Please wait ${Math.ceil(30 - elapsedSec)} seconds before requesting another OTP.`,
          retryAfterSeconds: Math.ceil(30 - elapsedSec),
        });
        return;
      }
    }

    const now = new Date().toISOString();
    await db.models.VerificationToken.updateMany(
      { customerId: admin.id, purpose: 'admin_login_otp', usedAt: null },
      { $set: { usedAt: now } }
    );

    const otp = crypto.randomInt(100000, 1000000).toString();
    const tokenHash = hashToken(`admin-otp:${cleanEmail}:${otp}`);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await db.models.VerificationToken.create({
      id: `vtok_${crypto.randomUUID()}`,
      customerId: admin.id,
      emailTarget: cleanEmail,
      purpose: 'admin_login_otp',
      tokenHash,
      attempts: 0,
      expiresAt,
      createdAt: now,
    });

    try {
      await emailService.sendAdminLoginOtpEmail(
        { id: admin.id, name: admin.name, email: cleanEmail },
        otp,
        10
      );
    } catch {
      // non-fatal; queued for delivery
    }

    await logAudit(db, {
      actorId: admin.id,
      actorEmail: cleanEmail,
      action: 'admin_otp_requested',
      entityType: 'session',
      ipAddress: req.ip || '',
    });

    res.json({
      message: genericMsg,
      expiresInSeconds: 600,
    });
  });

  router.post('/admin-otp/verify', strictAuthRateLimit, async (req, res) => {
    const parsed = adminOtpVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Email and 6-digit OTP are required.' });
      return;
    }

    const cleanEmail = normalizeEmail(parsed.data.email);
    const { otp, rememberMe } = parsed.data;

    const admin = await db.models.Customer.findOne({ email: cleanEmail }).lean();
    if (!admin) {
      res.status(401).json({ error: 'Invalid or expired verification code.' });
      return;
    }
    if (admin.role !== 'admin') {
      res.status(403).json({ error: 'Customer credentials cannot access administrator routes.' });
      return;
    }
    if (admin.isActive === false) {
      res.status(403).json({ error: 'This account has been deactivated. Contact the Super Admin for assistance.' });
      return;
    }
    if (admin.lockedUntil && new Date(admin.lockedUntil).getTime() > Date.now()) {
      res.status(429).json({
        error: 'This administrator account is temporarily locked due to repeated invalid OTP attempts. Please try again in 15 minutes.',
      });
      return;
    }

    const tokenRow = await db.models.VerificationToken.findOne({
      customerId: admin.id,
      emailTarget: cleanEmail,
      purpose: 'admin_login_otp',
      usedAt: null,
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!tokenRow) {
      res.status(401).json({ error: 'No active OTP found. Please request a verification code first.' });
      return;
    }

    const now = new Date().toISOString();
    if (new Date(tokenRow.expiresAt).getTime() <= Date.now()) {
      await db.models.VerificationToken.updateOne({ id: tokenRow.id }, { $set: { usedAt: now } });
      res.status(400).json({
        code: 'OTP_EXPIRED',
        error: 'This verification code has expired (10-minute validity). Please request a new OTP.',
      });
      return;
    }

    const expectedHash = hashToken(`admin-otp:${cleanEmail}:${otp}`);
    const a = Buffer.from(tokenRow.tokenHash, 'utf8');
    const b = Buffer.from(expectedHash, 'utf8');
    const matched = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!matched) {
      const nextAttempts = Number(tokenRow.attempts || 0) + 1;
      if (nextAttempts >= 5) {
        const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        await Promise.all([
          db.models.VerificationToken.updateOne(
            { id: tokenRow.id },
            { $set: { attempts: nextAttempts, usedAt: now } }
          ),
          db.models.Customer.updateOne(
            { id: admin.id },
            { $set: { failedLoginAttempts: nextAttempts, lockedUntil, updatedAt: now } }
          ),
        ]);
        res.status(429).json({
          error: 'Too many invalid OTP attempts. Please wait 15 minutes and request a new verification code.',
        });
        return;
      }

      await db.models.VerificationToken.updateOne(
        { id: tokenRow.id },
        { $set: { attempts: nextAttempts } }
      );
      res.status(401).json({ error: 'Invalid verification code. Please check your inbox and try again.' });
      return;
    }

    await Promise.all([
      db.models.VerificationToken.updateOne({ id: tokenRow.id }, { $set: { usedAt: now } }),
      db.models.Customer.updateOne(
        { id: admin.id },
        { $set: { failedLoginAttempts: 0, lockedUntil: null, updatedAt: now } }
      ),
    ]);

    const rawSession = await createSessionRecord(db, admin.id, Boolean(rememberMe), req);
    setSessionCookie(res, config, rawSession, Boolean(rememberMe));

    await logAudit(db, {
      actorId: admin.id,
      actorEmail: cleanEmail,
      action: 'admin_otp_login',
      entityType: 'session',
      ipAddress: req.ip || '',
    });

    res.json({
      message: 'Signed in successfully.',
      user: mapCustomerRow(admin),
    });
  });

  router.post('/logout', async (req, res) => {
    if (req.sessionId) {
      await db.models.Session.updateOne(
        { id: req.sessionId },
        { $set: { revokedAt: new Date().toISOString() } }
      );
    }
    clearSessionCookie(res, config);
    res.json({ message: 'Signed out successfully.' });
  });

  router.post('/verify-email', authRateLimit, async (req, res) => {
    const rawToken = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!rawToken) {
      res.status(400).json({ error: 'Verification token is missing.' });
      return;
    }

    const tokenHash = hashToken(rawToken);
    const tokenRow = await db.models.VerificationToken.findOne({ tokenHash }).lean();

    if (!tokenRow) {
      res.status(400).json({ error: 'This verification link is invalid.' });
      return;
    }
    if (tokenRow.usedAt) {
      res.status(400).json({ error: 'This verification link has already been used.' });
      return;
    }
    if (new Date(tokenRow.expiresAt).getTime() <= Date.now()) {
      res.status(400).json({
        code: 'TOKEN_EXPIRED',
        error: 'This verification link has expired (24-hour validity). Please request a new verification email.',
      });
      return;
    }

    const cust = await db.models.Customer.findOne({ id: tokenRow.customerId }).lean();
    if (!cust) {
      res.status(400).json({ error: 'Account not found for this verification link.' });
      return;
    }

    const now = new Date().toISOString();

    if (tokenRow.purpose === 'email_verify') {
      if (cust.emailVerified) {
        await db.models.VerificationToken.updateOne({ id: tokenRow.id }, { $set: { usedAt: now } });
        res.status(400).json({ error: 'Your email address is already verified.' });
        return;
      }

      await db.models.VerificationToken.updateOne({ id: tokenRow.id }, { $set: { usedAt: now } });
      await db.models.Customer.updateOne(
        { id: tokenRow.customerId },
        { $set: { emailVerified: true, emailVerifiedAt: now, updatedAt: now } }
      );

      await createCustomerNotification(db, {
        customerId: tokenRow.customerId,
        type: 'account_security',
        title: 'Email Verified',
        message: 'Your email address has been verified. You can now complete checkout and receive order notifications.',
      });

      try {
        await emailService.sendWelcomeEmail({
          id: tokenRow.customerId,
          name: cust.name,
          email: cust.email,
        });
      } catch {
        // non-fatal
      }
    } else {
      const collision = await db.models.Customer.findOne({
        email: tokenRow.emailTarget,
        id: { $ne: tokenRow.customerId },
      }).lean();
      if (collision) {
        res.status(409).json({ error: 'That email address is already linked to another account.' });
        return;
      }

      await db.models.VerificationToken.updateOne({ id: tokenRow.id }, { $set: { usedAt: now } });
      await db.models.Customer.updateOne(
        { id: tokenRow.customerId },
        {
          $set: {
            email: tokenRow.emailTarget,
            pendingEmail: null,
            emailVerified: true,
            emailVerifiedAt: now,
            updatedAt: now,
          },
        }
      );

      await createCustomerNotification(db, {
        customerId: tokenRow.customerId,
        type: 'account_security',
        title: 'Email Address Updated',
        message: `Your verified account email has been updated to ${tokenRow.emailTarget}.`,
      });
    }

    const updated = await db.models.Customer.findOne({ id: tokenRow.customerId }).lean();
    let defaultAddr = null;
    if (updated) {
      defaultAddr = (await db.models.CustomerAddress.findOne({ customerId: updated.id, isDefault: true }).lean())
        || (await db.models.CustomerAddress.findOne({ customerId: updated.id }).sort({ createdAt: -1 }).lean());
    }
    res.json({
      message: 'Email verified successfully! You now have full checkout access.',
      user: updated ? mapCustomerRow(updated, defaultAddr) : null,
    });
  });

  router.post('/resend-verification', strictAuthRateLimit, async (req, res) => {
    const rawEmail =
      typeof req.body?.email === 'string' && req.body.email.trim()
        ? req.body.email.trim()
        : req.user?.email || '';

    const genericOk = {
      message:
        'If an unverified account matches that email address, a new verification link has been sent.',
      cooldownSeconds: 60,
    };

    if (!rawEmail || !isValidEmail(rawEmail)) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }

    const cleanEmail = normalizeEmail(rawEmail);
    const customer = await db.models.Customer.findOne({ email: cleanEmail }).lean();

    if (!customer) {
      res.json(genericOk);
      return;
    }

    const isAuthenticatedOwner = req.user?.id === customer.id;
    const targetPurpose: 'email_verify' | 'email_change' = customer.pendingEmail
      ? 'email_change'
      : 'email_verify';
    const targetEmail = customer.pendingEmail || customer.email;

    if (customer.emailVerified && !customer.pendingEmail) {
      if (isAuthenticatedOwner) {
        res.status(400).json({ error: 'Your email address is already verified.' });
        return;
      }
      res.json(genericOk);
      return;
    }

    if (customer.lastVerificationSentAt) {
      const elapsedSec = (Date.now() - new Date(customer.lastVerificationSentAt).getTime()) / 1000;
      if (elapsedSec < 60) {
        const remaining = Math.ceil(60 - elapsedSec);
        if (isAuthenticatedOwner) {
          res.status(429).json({
            error: `Please wait ${remaining} seconds before requesting another verification email.`,
            retryAfterSeconds: remaining,
          });
          return;
        }
        res.json(genericOk);
        return;
      }
    }

    const now = new Date().toISOString();
    await db.models.VerificationToken.updateMany(
      { customerId: customer.id, purpose: targetPurpose, usedAt: null },
      { $set: { usedAt: now } }
    );

    const { raw, hash } = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db.models.VerificationToken.create({
      id: `vtok_${crypto.randomUUID()}`,
      customerId: customer.id,
      emailTarget: targetEmail,
      purpose: targetPurpose,
      tokenHash: hash,
      expiresAt,
      createdAt: now,
    });

    await db.models.Customer.updateOne(
      { id: customer.id },
      { $set: { lastVerificationSentAt: now, updatedAt: now } }
    );

    const resendBaseUrl = getRequestOrigin(req, config.appUrl);
    try {
      await emailService.sendVerificationEmail(
        { id: customer.id, name: customer.name, email: customer.email },
        raw,
        targetEmail,
        targetPurpose,
        resendBaseUrl
      );
    } catch {
      // non-fatal; queued
    }

    res.json(genericOk);
  });

  router.post('/forgot-password', strictAuthRateLimit, async (req, res) => {
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    if (!rawEmail || !isValidEmail(rawEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const cleanEmail = normalizeEmail(rawEmail);
    const genericMsg =
      'If an account exists for that email address, a password reset link has been sent (valid for 30 minutes).';

    const customer = await db.models.Customer.findOne(
      { email: cleanEmail },
      { id: 1, name: 1, email: 1, role: 1, _id: 0 }
    ).lean();

    if (!customer || customer.role === 'admin') {
      res.json({ message: genericMsg });
      return;
    }

    const now = new Date().toISOString();
    await db.models.PasswordResetToken.updateMany(
      { customerId: customer.id, usedAt: null },
      { $set: { usedAt: now } }
    );

    const { raw, hash } = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await db.models.PasswordResetToken.create({
      id: `prtok_${crypto.randomUUID()}`,
      customerId: customer.id,
      tokenHash: hash,
      expiresAt,
      createdAt: now,
    });

    const resetBaseUrl = getRequestOrigin(req, config.appUrl);
    try {
      await emailService.sendPasswordResetEmail(customer, raw, resetBaseUrl);
    } catch {
      // queued
    }

    res.json({ message: genericMsg });
  });

  router.get('/reset-password/validate', authRateLimit, async (req, res) => {
    const rawToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    if (!rawToken) {
      res.json({ valid: false, error: 'Missing password reset token.' });
      return;
    }
    const tokenHash = hashToken(rawToken);
    const row = await db.models.PasswordResetToken.findOne({ tokenHash }).lean();

    if (!row) {
      res.json({ valid: false, error: 'Invalid password reset link.' });
      return;
    }
    if (row.usedAt) {
      res.json({ valid: false, error: 'This password reset link has already been used.' });
      return;
    }
    if (new Date(row.expiresAt).getTime() <= Date.now()) {
      res.json({ valid: false, error: 'This password reset link has expired (30-minute limit).' });
      return;
    }

    res.json({ valid: true });
  });

  router.post('/reset-password', strictAuthRateLimit, async (req, res) => {
    const rawToken = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const confirmPassword = typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : '';

    if (!rawToken) {
      res.status(400).json({ error: 'Reset token is required.' });
      return;
    }
    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Passwords do not match.' });
      return;
    }
    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      res.status(400).json({
        error:
          'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.',
      });
      return;
    }

    const tokenHash = hashToken(rawToken);
    const tokenRow = await db.models.PasswordResetToken.findOne({ tokenHash }).lean();

    if (!tokenRow || tokenRow.usedAt) {
      res.status(400).json({ error: 'This password reset link is invalid or has already been used.' });
      return;
    }
    if (new Date(tokenRow.expiresAt).getTime() <= Date.now()) {
      res.status(400).json({ error: 'This password reset link has expired. Please request a new one.' });
      return;
    }

    const cust = await db.models.Customer.findOne({ id: tokenRow.customerId }).lean();
    if (!cust) {
      res.status(400).json({ error: 'Account not found.' });
      return;
    }

    const now = new Date().toISOString();
    const newHash = await hashPassword(password);

    await db.models.PasswordResetToken.updateOne({ id: tokenRow.id }, { $set: { usedAt: now } });
    await db.models.Customer.updateOne(
      { id: tokenRow.customerId },
      { $set: { passwordHash: newHash, failedLoginAttempts: 0, lockedUntil: null, updatedAt: now } }
    );
    await db.models.Session.updateMany(
      { customerId: tokenRow.customerId, revokedAt: null },
      { $set: { revokedAt: now } }
    );
    clearSessionCookie(res, config);

    await createCustomerNotification(db, {
      customerId: tokenRow.customerId,
      type: 'account_security',
      title: 'Password Reset Successful',
      message: 'Your password has been updated and all prior sessions were signed out.',
    });

    try {
      await emailService.sendPasswordChangedEmail({
        id: tokenRow.customerId,
        name: cust.name,
        email: cust.email,
      });
    } catch {
      // queued
    }

    res.json({
      message: 'Your password has been updated. All existing sessions were signed out; please sign in again.',
    });
  });

  // Google OAuth 2.0
  router.get('/google', (_req, res) => {
    if (!config.googleClientId || !config.googleClientSecret) {
      res.status(501).json({ error: 'Google OAuth is not configured on this server.' });
      return;
    }

    const state = crypto.randomBytes(20).toString('hex');
    res.cookie('as_oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: 10 * 60 * 1000,
    });

    const params = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: config.googleRedirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  router.get('/google/callback', async (req, res) => {
    if (!config.googleClientId || !config.googleClientSecret) {
      res.redirect(`${config.appUrl}/login?error=oauth_not_configured`);
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const expectedState = req.cookies?.as_oauth_state as string | undefined;
    res.clearCookie('as_oauth_state');

    if (!code || !state || !expectedState || state !== expectedState) {
      res.redirect(`${config.appUrl}/login?error=oauth_state_mismatch`);
      return;
    }

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.googleClientId,
          client_secret: config.googleClientSecret,
          redirect_uri: config.googleRedirectUri,
          grant_type: 'authorization_code',
        }),
      });
      const tokenJson = (await tokenRes.json()) as { access_token?: string };
      if (!tokenJson.access_token) {
        res.redirect(`${config.appUrl}/login?error=oauth_token_failed`);
        return;
      }

      const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      const profile = (await profileRes.json()) as {
        sub?: string;
        email?: string;
        name?: string;
        picture?: string;
        email_verified?: boolean;
      };

      if (!profile.email || !profile.sub) {
        res.redirect(`${config.appUrl}/login?error=oauth_profile_incomplete`);
        return;
      }

      const cleanEmail = normalizeEmail(profile.email);
      const now = new Date().toISOString();
      let existing = await db.models.Customer.findOne({ email: cleanEmail }).lean();

      if (!existing) {
        const custId = `cust_${crypto.randomUUID()}`;
        existing = (
          await db.models.Customer.create({
            id: custId,
            name: profile.name || cleanEmail.split('@')[0],
            email: cleanEmail,
            emailVerified: Boolean(profile.email_verified),
            emailVerifiedAt: profile.email_verified ? now : null,
            phone: '',
            passwordHash: '',
            role: 'customer',
            isActive: true,
            profilePicture: profile.picture || null,
            tier: 'Privileged Patron',
            loyaltyPoints: 0,
            marketingConsent: false,
            emailPreferences: DEFAULT_EMAIL_PREFERENCES,
            googleId: profile.sub,
            createdAt: now,
            updatedAt: now,
          })
        ).toObject();
      } else {
        await db.models.Customer.updateOne(
          { id: existing.id },
          {
            $set: {
              googleId: existing.googleId || profile.sub,
              emailVerified: profile.email_verified ? true : existing.emailVerified,
              updatedAt: now,
            },
          }
        );
      }

      const rawSession = await createSessionRecord(db, existing.id, true, req);
      setSessionCookie(res, config, rawSession, true);
      res.redirect(`${config.appUrl}/account`);
    } catch {
      res.redirect(`${config.appUrl}/login?error=oauth_failed`);
    }
  });

  return router;
}
