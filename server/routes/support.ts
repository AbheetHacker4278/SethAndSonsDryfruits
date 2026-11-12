import crypto from 'node:crypto';
import path from 'node:path';
import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { MongoDatabase } from '../db/mongo.ts';
import {
  createAdminNotification,
  createCustomerNotification,
  createRateLimiter,
  escapeRegex,
  logAudit,
  requireAdmin,
  requireAuth,
  requirePermission,
} from '../middleware/security.ts';
import { MediaStorageService } from '../services/cloudinaryService.ts';
import { EmailService } from '../services/emailService.ts';
import { isValidEmail, isValidMobile, normalizeEmail, normalizeMobile } from '../utils/crypto.ts';

export const USER_MAX_SUPPORT_FILES = 5;
export const USER_MAX_SUPPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB per file
export const USER_MAX_SUPPORT_TOTAL_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB total

export const ADMIN_MAX_SUPPORT_FILES = 15;
export const ADMIN_MAX_SUPPORT_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB per file
export const ADMIN_MAX_SUPPORT_TOTAL_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB total

// Kept for backwards compatibility with existing imports
export const MAX_SUPPORT_FILES = USER_MAX_SUPPORT_FILES;
export const MAX_SUPPORT_FILE_SIZE_BYTES = USER_MAX_SUPPORT_FILE_SIZE_BYTES;
export const MAX_SUPPORT_TOTAL_SIZE_BYTES = USER_MAX_SUPPORT_TOTAL_SIZE_BYTES;

interface AllowedMimeConfig {
  resourceType: 'image' | 'raw' | 'video';
  extensions: string[];
}

export const ALLOWED_SUPPORT_FILE_CONFIG: Record<string, AllowedMimeConfig> = {
  'image/png': { resourceType: 'image', extensions: ['.png'] },
  'image/jpeg': { resourceType: 'image', extensions: ['.jpg', '.jpeg'] },
  'image/webp': { resourceType: 'image', extensions: ['.webp'] },
  'image/gif': { resourceType: 'image', extensions: ['.gif'] },
  'application/pdf': { resourceType: 'raw', extensions: ['.pdf'] },
  'application/msword': { resourceType: 'raw', extensions: ['.doc'] },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    resourceType: 'raw',
    extensions: ['.docx'],
  },
  'application/vnd.ms-excel': { resourceType: 'raw', extensions: ['.xls'] },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    resourceType: 'raw',
    extensions: ['.xlsx'],
  },
  'text/csv': { resourceType: 'raw', extensions: ['.csv'] },
  'application/csv': { resourceType: 'raw', extensions: ['.csv'] },
  'text/plain': { resourceType: 'raw', extensions: ['.txt'] },
  'application/zip': { resourceType: 'raw', extensions: ['.zip'] },
  'application/x-zip-compressed': { resourceType: 'raw', extensions: ['.zip'] },
  'video/mp4': { resourceType: 'video', extensions: ['.mp4'] },
  'video/webm': { resourceType: 'video', extensions: ['.webm'] },
};

export const ALLOWED_SUPPORT_MIMES = new Set(Object.keys(ALLOWED_SUPPORT_FILE_CONFIG));

const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.msi',
  '.bat',
  '.cmd',
  '.ps1',
  '.sh',
  '.js',
  '.mjs',
  '.cjs',
  '.html',
  '.htm',
  '.svg',
  '.php',
  '.dll',
  '.scr',
  '.vbs',
]);

export const SUPPORT_CATEGORIES = [
  'Order Issue',
  'Quality / Packaging',
  'Delivery & Tracking',
  'Payment / Refund',
  'Bulk / Corporate Inquiry',
  'Other',
] as const;

export const SUPPORT_STATUSES = ['open', 'in_review', 'responded', 'resolved', 'closed'] as const;
export const SUPPORT_PRIORITIES = ['normal', 'high', 'urgent'] as const;

const supportSubmitRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyPrefix: 'support_submit',
});

function resolveMimeType(file: Express.Multer.File): string {
  const declared = (file.mimetype || '').toLowerCase();
  if (ALLOWED_SUPPORT_MIMES.has(declared)) {
    return declared;
  }
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (declared === 'application/octet-stream' && ext) {
    for (const [mime, cfg] of Object.entries(ALLOWED_SUPPORT_FILE_CONFIG)) {
      if (cfg.extensions.includes(ext)) return mime;
    }
  }
  return declared;
}

function makeSupportUploader(opts: { maxFiles: number; maxFileBytes: number }) {
  const instance = multer({
    storage: multer.memoryStorage(),
    limits: {
      files: opts.maxFiles,
      fileSize: opts.maxFileBytes,
    },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (ext && BLOCKED_EXTENSIONS.has(ext)) {
        cb(new Error(`File type "${ext}" is blocked for security reasons.`));
        return;
      }
      const mime = resolveMimeType(file);
      if (ALLOWED_SUPPORT_MIMES.has(mime)) {
        cb(null, true);
      } else {
        cb(
          new Error(
            'Unsupported file format. Allowed: Images (PNG, JPG, WEBP, GIF), PDF, Word/Excel/CSV/TXT, ZIP, and MP4/WEBM.'
          )
        );
      }
    },
  });

  const maxMb = Math.round(opts.maxFileBytes / (1024 * 1024));
  return (req: Request, res: Response, next: NextFunction) => {
    instance.array('attachments', opts.maxFiles)(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: `Each uploaded file must be ${maxMb} MB or smaller.` });
          return;
        }
        if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
          res.status(400).json({ error: `You can upload at most ${opts.maxFiles} files per request.` });
          return;
        }
        res.status(400).json({ error: err.message || 'Invalid attachment upload.' });
        return;
      }
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unsupported attachment.' });
    });
  };
}

const handleUserSupportMultipart = makeSupportUploader({
  maxFiles: USER_MAX_SUPPORT_FILES,
  maxFileBytes: USER_MAX_SUPPORT_FILE_SIZE_BYTES,
});

const handleAdminSupportMultipart = makeSupportUploader({
  maxFiles: ADMIN_MAX_SUPPORT_FILES,
  maxFileBytes: ADMIN_MAX_SUPPORT_FILE_SIZE_BYTES,
});

function maybeAdminSupportMultipart(req: Request, res: Response, next: NextFunction) {
  if (req.is('multipart/form-data')) {
    handleAdminSupportMultipart(req, res, next);
    return;
  }
  next();
}

function hasValidAttachmentSignature(buffer: Buffer, mimeType: string, filename: string): boolean {
  if (!buffer || buffer.length === 0) return false;
  const ext = path.extname(filename || '').toLowerCase();
  if (ext && BLOCKED_EXTENSIONS.has(ext)) return false;

  if (mimeType === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (mimeType === 'image/gif') {
    const hdr = buffer.subarray(0, 6).toString('ascii');
    return hdr === 'GIF87a' || hdr === 'GIF89a';
  }
  if (mimeType === 'application/pdf') {
    return buffer.subarray(0, 16).toString('ascii').trimStart().startsWith('%PDF-');
  }
  if (
    mimeType === 'application/zip' ||
    mimeType === 'application/x-zip-compressed' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return (
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      (buffer[2] === 0x03 || buffer[2] === 0x05) &&
      (buffer[3] === 0x04 || buffer[3] === 0x06)
    );
  }
  if (mimeType === 'application/msword' || mimeType === 'application/vnd.ms-excel') {
    return (
      buffer.length >= 4 &&
      buffer[0] === 0xd0 &&
      buffer[1] === 0xcf &&
      buffer[2] === 0x11 &&
      buffer[3] === 0xe0
    );
  }
  if (mimeType === 'video/mp4') {
    return buffer.length >= 8 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  }
  if (mimeType === 'video/webm') {
    return (
      buffer.length >= 4 &&
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3
    );
  }
  if (mimeType === 'text/csv' || mimeType === 'application/csv' || mimeType === 'text/plain') {
    if (buffer.includes(0)) return false;
    const sample = buffer.subarray(0, 2048).toString('utf8').toLowerCase();
    return !sample.includes('<script') && !sample.includes('<!doctype html') && !sample.includes('<html');
  }
  return false;
}

export interface StoredSupportAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  publicId: string;
  resourceType: 'image' | 'raw' | 'video';
}

async function validateAndUploadAttachments(
  files: Express.Multer.File[],
  limits: { maxFiles: number; maxTotalBytes: number; folder: string },
  mediaStorage: MediaStorageService
): Promise<{ attachments: StoredSupportAttachment[]; error?: { status: number; message: string } }> {
  if (files.length === 0) return { attachments: [] };

  if (files.length > limits.maxFiles) {
    return {
      attachments: [],
      error: { status: 400, message: `You can upload at most ${limits.maxFiles} files per request.` },
    };
  }

  const totalBytes = files.reduce((sum, f) => sum + (f.size || f.buffer.length), 0);
  if (totalBytes > limits.maxTotalBytes) {
    const totalMb = Math.round(limits.maxTotalBytes / (1024 * 1024));
    return {
      attachments: [],
      error: { status: 400, message: `Combined size of uploaded files must not exceed ${totalMb} MB.` },
    };
  }

  for (const file of files) {
    const mime = resolveMimeType(file);
    if (!ALLOWED_SUPPORT_MIMES.has(mime) || !hasValidAttachmentSignature(file.buffer, mime, file.originalname)) {
      return {
        attachments: [],
        error: {
          status: 400,
          message: `Attachment "${file.originalname}" is invalid or corrupted for its file format.`,
        },
      };
    }
  }

  if (!mediaStorage.isConfigured()) {
    return {
      attachments: [],
      error: {
        status: 503,
        message: 'Attachment storage (Cloudinary) is not configured yet. Please contact store support.',
      },
    };
  }

  const uploadedList: StoredSupportAttachment[] = [];
  for (const file of files) {
    const mime = resolveMimeType(file);
    const cfg = ALLOWED_SUPPORT_FILE_CONFIG[mime] || { resourceType: 'raw' as const };
    const uploaded = await mediaStorage.uploadBuffer({
      buffer: file.buffer,
      filename: file.originalname || 'attachment',
      folder: limits.folder,
      mimeType: mime,
      resourceType: cfg.resourceType,
    });
    uploadedList.push({
      id: `att_${crypto.randomUUID()}`,
      filename: (file.originalname || 'attachment').slice(0, 140),
      mimeType: mime,
      sizeBytes: file.size || file.buffer.length,
      url: uploaded.url,
      publicId: uploaded.publicId,
      resourceType: cfg.resourceType,
    });
  }

  return { attachments: uploadedList };
}

function generateTicketNumber(): string {
  const yr = new Date().getFullYear();
  const rnd = crypto.randomInt(10000, 99999);
  return `AS-SUP-${yr}-${rnd}`;
}

function stripAdminFields(row: Record<string, any>) {
  const { _id: _omitId, adminNotes: _omitNotes, ...rest } = row;
  return rest;
}

function findTicketAttachment(ticket: Record<string, any>, attId: string): StoredSupportAttachment | null {
  const pools: StoredSupportAttachment[] = [
    ...(Array.isArray(ticket.attachments) ? ticket.attachments : []),
    ...(Array.isArray(ticket.adminAttachments) ? ticket.adminAttachments : []),
    ...(Array.isArray(ticket.replies)
      ? ticket.replies.flatMap((r: any) => (Array.isArray(r.attachments) ? r.attachments : []))
      : []),
  ];
  return pools.find(a => a && a.id === attId) || null;
}

async function streamTicketAttachment(
  res: Response,
  mediaStorage: MediaStorageService,
  att: StoredSupportAttachment,
  forceDownload: boolean
) {
  try {
    const extFmt = path.extname(att.filename || '').replace(/^\./, '').toLowerCase() || undefined;
    const downloaded = mediaStorage.downloadAsset
      ? await mediaStorage.downloadAsset({
          url: att.url,
          publicId: att.publicId,
          resourceType: att.resourceType,
          format: extFmt,
        })
      : await (async () => {
          const r = await fetch(att.url);
          if (!r.ok) {
            const err = new Error(`Unable to fetch attachment (HTTP ${r.status}).`) as Error & {
              statusCode?: number;
            };
            err.statusCode = r.status;
            throw err;
          }
          return {
            buffer: Buffer.from(await r.arrayBuffer()),
            contentType: r.headers.get('content-type') || att.mimeType,
          };
        })();

    const safeName = (att.filename || 'document').replace(/["\r\n]/g, '_');
    res.setHeader('Content-Type', att.mimeType || downloaded.contentType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `${forceDownload ? 'attachment' : 'inline'}; filename="${safeName}"`
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(downloaded.buffer);
  } catch (err) {
    const sc = (err as { statusCode?: number }).statusCode || 502;
    res.status(sc).json({ error: err instanceof Error ? err.message : 'Unable to stream attachment.' });
  }
}

export function createSupportRouter(
  db: MongoDatabase,
  mediaStorage: MediaStorageService,
  emailService: EmailService
) {
  const router = Router();

  // Limit metadata for both user and admin upload controls
  router.get('/limits', (_req, res) => {
    const allowedExtensions = [...new Set(Object.values(ALLOWED_SUPPORT_FILE_CONFIG).flatMap(c => c.extensions))];
    res.json({
      maxFiles: USER_MAX_SUPPORT_FILES,
      maxFileSizeBytes: USER_MAX_SUPPORT_FILE_SIZE_BYTES,
      maxTotalSizeBytes: USER_MAX_SUPPORT_TOTAL_SIZE_BYTES,
      user: {
        maxFiles: USER_MAX_SUPPORT_FILES,
        maxFileSizeBytes: USER_MAX_SUPPORT_FILE_SIZE_BYTES,
        maxTotalSizeBytes: USER_MAX_SUPPORT_TOTAL_SIZE_BYTES,
      },
      admin: {
        maxFiles: ADMIN_MAX_SUPPORT_FILES,
        maxFileSizeBytes: ADMIN_MAX_SUPPORT_FILE_SIZE_BYTES,
        maxTotalSizeBytes: ADMIN_MAX_SUPPORT_TOTAL_SIZE_BYTES,
      },
      allowedMimeTypes: [...ALLOWED_SUPPORT_MIMES],
      allowedExtensions,
      categories: [...SUPPORT_CATEGORIES],
    });
  });

  // List signed-in customer's submitted complaints
  router.get('/my-tickets', requireAuth, async (req, res) => {
    const email = normalizeEmail(req.user!.email);
    const tickets = await db.models.SupportTicket.find(
      { $or: [{ customerId: req.user!.id }, { email }] },
      { _id: 0, adminNotes: 0 }
    )
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ tickets });
  });

  // Public or authenticated complaint tracking by Ticket Number + Email
  router.get('/track', async (req, res) => {
    const ticketNumber = typeof req.query.ticketNumber === 'string' ? req.query.ticketNumber.trim() : '';
    const emailQuery = typeof req.query.email === 'string' ? req.query.email.trim() : '';

    if (!ticketNumber) {
      res.status(400).json({ error: 'Ticket reference number is required to track a complaint.' });
      return;
    }

    const ticket = await db.models.SupportTicket.findOne({ ticketNumber }, { _id: 0, adminNotes: 0 }).lean();
    if (!ticket) {
      res.status(404).json({ error: 'No complaint found matching that ticket number and email address.' });
      return;
    }

    const signedInOwner =
      req.user &&
      (ticket.customerId === req.user.id || normalizeEmail(ticket.email) === normalizeEmail(req.user.email));

    if (!signedInOwner) {
      if (!emailQuery || !isValidEmail(emailQuery) || normalizeEmail(emailQuery) !== normalizeEmail(ticket.email)) {
        res.status(404).json({ error: 'No complaint found matching that ticket number and email address.' });
        return;
      }
    }

    res.json({ ticket });
  });

  // Submit new complaint (notifies BOTH user and admin by email)
  router.post('/', supportSubmitRateLimit, handleUserSupportMultipart, async (req, res) => {
    const b = req.body || {};
    const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim() : req.user?.name || '';
    const emailRaw =
      typeof b.email === 'string' && b.email.trim() ? b.email.trim() : req.user?.email || '';
    const phoneRaw =
      typeof b.phone === 'string' && b.phone.trim() ? b.phone.trim() : req.user?.phone || '';
    const categoryRaw = typeof b.category === 'string' ? b.category.trim() : 'Order Issue';
    const orderNumber =
      typeof b.orderNumber === 'string' && b.orderNumber.trim()
        ? b.orderNumber.trim().slice(0, 60)
        : null;
    const subject = typeof b.subject === 'string' ? b.subject.trim() : '';
    const description = typeof b.description === 'string' ? b.description.trim() : '';

    if (name.length < 2 || name.length > 100) {
      res.status(400).json({ error: 'Please provide your full name (2–100 characters).' });
      return;
    }
    if (!isValidEmail(emailRaw)) {
      res.status(400).json({ error: 'Please provide a valid email address so we can reply to you.' });
      return;
    }
    const cleanEmail = normalizeEmail(emailRaw);

    let cleanPhone = '';
    if (phoneRaw) {
      const normalized = normalizeMobile(phoneRaw);
      if (!isValidMobile(normalized)) {
        res.status(400).json({ error: 'Please provide a valid 10-digit mobile number (or leave blank).' });
        return;
      }
      cleanPhone = normalized;
    }

    if (subject.length < 3 || subject.length > 160) {
      res.status(400).json({ error: 'Please enter a concise complaint subject (3–160 characters).' });
      return;
    }
    if (description.length < 10 || description.length > 4000) {
      res.status(400).json({ error: 'Please describe your issue in detail (10–4000 characters).' });
      return;
    }

    const category = SUPPORT_CATEGORIES.includes(categoryRaw as (typeof SUPPORT_CATEGORIES)[number])
      ? categoryRaw
      : 'Other';

    const files = (req.files as Express.Multer.File[] | undefined) || [];
    let uploadedAttachments: StoredSupportAttachment[] = [];
    try {
      const uploadResult = await validateAndUploadAttachments(
        files,
        {
          maxFiles: USER_MAX_SUPPORT_FILES,
          maxTotalBytes: USER_MAX_SUPPORT_TOTAL_SIZE_BYTES,
          folder: 'support',
        },
        mediaStorage
      );
      if (uploadResult.error) {
        res.status(uploadResult.error.status).json({ error: uploadResult.error.message });
        return;
      }
      uploadedAttachments = uploadResult.attachments;
    } catch (err) {
      const sc = (err as { statusCode?: number }).statusCode || 500;
      res.status(sc).json({
        error: err instanceof Error ? err.message : 'Failed to upload Customer Service attachments.',
      });
      return;
    }

    const now = new Date().toISOString();
    const id = `sup_tkt_${crypto.randomUUID()}`;
    let ticketNumber = generateTicketNumber();
    for (let attempt = 0; attempt < 5; attempt++) {
      const collision = await db.models.SupportTicket.findOne({ ticketNumber }).lean();
      if (!collision) break;
      ticketNumber = generateTicketNumber();
    }

    const createdDoc = await db.models.SupportTicket.create({
      id,
      ticketNumber,
      customerId: req.user?.id || null,
      name,
      email: cleanEmail,
      phone: cleanPhone,
      category,
      orderNumber,
      subject,
      description,
      attachments: uploadedAttachments,
      adminAttachments: [],
      status: 'open',
      priority: 'normal',
      adminNotes: '',
      replies: [],
      lastRepliedAt: null,
      lastRepliedBy: null,
      createdAt: now,
      updatedAt: now,
    });

    await createAdminNotification(db, {
      type: 'support_ticket',
      title: `Customer Service #${ticketNumber}: ${subject}`,
      message: `${name} (${cleanEmail}) submitted a ${category} inquiry with ${uploadedAttachments.length} attachment(s).`,
      severity: 'warning',
      entityType: 'support',
      entityId: ticketNumber,
    });

    // Notify BOTH concerned user AND admin via email
    try {
      await Promise.allSettled([
        emailService.sendSupportTicketAckEmail({
          ticketNumber,
          customerId: req.user?.id || null,
          name,
          email: cleanEmail,
          category,
          subject,
          attachmentCount: uploadedAttachments.length,
        }),
        emailService.sendSupportAdminAlertEmail({
          ticketNumber,
          name,
          email: cleanEmail,
          category,
          subject,
          description,
          attachments: uploadedAttachments,
        }),
      ]);
    } catch {
      // non-fatal notifications
    }

    res.status(201).json({
      message: `Complaint #${ticketNumber} submitted successfully. Confirmation and Admin alert emails have been dispatched.`,
      ticket: stripAdminFields(createdDoc.toObject()),
    });
  });

  // Customer follow-up reply / additional PDF or file upload on tracked complaint
  router.post('/:ticketNumber/reply', supportSubmitRateLimit, handleUserSupportMultipart, async (req, res) => {
    const b = req.body || {};
    const message = typeof b.message === 'string' ? b.message.trim() : '';
    const emailConfirm = typeof b.email === 'string' ? b.email.trim() : '';

    const ticket = await db.models.SupportTicket.findOne({
      $or: [{ ticketNumber: req.params.ticketNumber }, { id: req.params.ticketNumber }],
    }).lean();
    if (!ticket) {
      res.status(404).json({ error: 'Complaint ticket not found.' });
      return;
    }

    const isOwner =
      (req.user &&
        (ticket.customerId === req.user.id || normalizeEmail(ticket.email) === normalizeEmail(req.user.email))) ||
      (emailConfirm && isValidEmail(emailConfirm) && normalizeEmail(emailConfirm) === normalizeEmail(ticket.email));

    if (!isOwner) {
      res.status(403).json({ error: 'Please verify your email or sign in as the complaint owner to reply.' });
      return;
    }

    const files = (req.files as Express.Multer.File[] | undefined) || [];
    if (message.length < 2 && files.length === 0) {
      res.status(400).json({ error: 'Please write a follow-up note or attach at least one file.' });
      return;
    }
    if (message.length > 4000) {
      res.status(400).json({ error: 'Follow-up message cannot exceed 4000 characters.' });
      return;
    }

    let uploadedAttachments: StoredSupportAttachment[] = [];
    try {
      const uploadResult = await validateAndUploadAttachments(
        files,
        {
          maxFiles: USER_MAX_SUPPORT_FILES,
          maxTotalBytes: USER_MAX_SUPPORT_TOTAL_SIZE_BYTES,
          folder: 'support',
        },
        mediaStorage
      );
      if (uploadResult.error) {
        res.status(uploadResult.error.status).json({ error: uploadResult.error.message });
        return;
      }
      uploadedAttachments = uploadResult.attachments;
    } catch (err) {
      const sc = (err as { statusCode?: number }).statusCode || 500;
      res.status(sc).json({
        error: err instanceof Error ? err.message : 'Failed to upload follow-up attachments.',
      });
      return;
    }

    const now = new Date().toISOString();
    const replyEntry = {
      id: `rep_${crypto.randomUUID()}`,
      senderType: 'customer',
      senderId: req.user?.id || ticket.email,
      senderName: req.user?.name || ticket.name,
      senderEmail: ticket.email,
      subject: `Customer Follow-Up [#${ticket.ticketNumber}]`,
      message: message || `Uploaded ${uploadedAttachments.length} additional file(s).`,
      attachments: uploadedAttachments,
      createdAt: now,
    };

    const nextStatus = ticket.status === 'open' ? 'open' : 'in_review';
    const updatedTicket = await db.models.SupportTicket.findOneAndUpdate(
      { id: ticket.id },
      {
        $push: { replies: replyEntry },
        $set: { status: nextStatus, updatedAt: now },
      },
      { new: true, projection: { _id: 0, adminNotes: 0 } }
    ).lean();

    await createAdminNotification(db, {
      type: 'support_ticket',
      title: `Customer Follow-Up on #${ticket.ticketNumber}`,
      message: `${ticket.name} added a reply${uploadedAttachments.length ? ` with ${uploadedAttachments.length} attachment(s)` : ''}.`,
      severity: 'warning',
      entityType: 'support',
      entityId: ticket.ticketNumber,
    });

    try {
      await emailService.sendSupportAdminAlertEmail({
        ticketNumber: ticket.ticketNumber,
        name: ticket.name,
        email: ticket.email,
        category: ticket.category,
        subject: ticket.subject,
        description: replyEntry.message,
        attachments: uploadedAttachments,
        isFollowUp: true,
        eventId: replyEntry.id,
      });
    } catch {
      // non-fatal alert
    }

    res.json({
      message: 'Your follow-up has been added and the concierge team has been notified.',
      ticket: updatedTicket,
      reply: replyEntry,
    });
  });

  // Stream / download a support attachment cleanly (handles ACL-restricted Cloudinary PDFs/ZIPs)
  router.get('/:ticketNumber/attachments/:attId/file', async (req, res) => {
    const ticket = await db.models.SupportTicket.findOne({
      $or: [{ ticketNumber: req.params.ticketNumber }, { id: req.params.ticketNumber }],
    }).lean();
    if (!ticket) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }

    const emailQuery = typeof req.query.email === 'string' ? req.query.email.trim() : '';
    const isAuthorized =
      req.user?.role === 'admin' ||
      (req.user &&
        (ticket.customerId === req.user.id || normalizeEmail(ticket.email) === normalizeEmail(req.user.email))) ||
      (emailQuery && isValidEmail(emailQuery) && normalizeEmail(emailQuery) === normalizeEmail(ticket.email));

    if (!isAuthorized) {
      res.status(403).json({ error: 'Authorization required to view this attachment.' });
      return;
    }

    const att = findTicketAttachment(ticket, req.params.attId);
    if (!att) {
      res.status(404).json({ error: 'Attachment not found on this ticket.' });
      return;
    }

    await streamTicketAttachment(res, mediaStorage, att, req.query.download === '1');
  });

  return router;
}

export function createAdminSupportRouter(
  db: MongoDatabase,
  mediaStorage: MediaStorageService,
  emailService: EmailService
) {
  const router = Router();
  router.use(requireAdmin);
  router.use(requirePermission('support'));

  router.get('/', async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const priority = typeof req.query.priority === 'string' ? req.query.priority.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const filter: Record<string, unknown> = {};
    if (status && status !== 'all') filter.status = status;
    if (priority && priority !== 'all') filter.priority = priority;
    if (category && category !== 'all') filter.category = category;
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [
        { ticketNumber: rx },
        { name: rx },
        { email: rx },
        { subject: rx },
        { orderNumber: rx },
      ];
    }

    const [tickets, allStatuses] = await Promise.all([
      db.models.SupportTicket.find(filter, { _id: 0 }).sort({ createdAt: -1 }).limit(100).lean(),
      db.models.SupportTicket.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);

    const counts: Record<string, number> = {
      all: 0,
      open: 0,
      in_review: 0,
      responded: 0,
      resolved: 0,
      closed: 0,
    };
    for (const row of allStatuses) {
      if (row._id && row._id in counts) {
        counts[row._id] = row.count;
      }
      counts.all += row.count;
    }

    res.json({ tickets, counts });
  });

  router.get('/:id', async (req, res) => {
    const ticket = await db.models.SupportTicket.findOne(
      { $or: [{ id: req.params.id }, { ticketNumber: req.params.id }] },
      { _id: 0 }
    ).lean();
    if (!ticket) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }

    const emailLogs = await db.models.EmailLog.find(
      { relatedOrderId: ticket.ticketNumber },
      { _id: 0 }
    )
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({ ticket, emailLogs });
  });

  router.get('/:id/attachments/:attId/file', async (req, res) => {
    const ticket = await db.models.SupportTicket.findOne(
      { $or: [{ id: req.params.id }, { ticketNumber: req.params.id }] },
      { _id: 0 }
    ).lean();
    if (!ticket) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }

    const att = findTicketAttachment(ticket, req.params.attId);
    if (!att) {
      res.status(404).json({ error: 'Attachment not found on this ticket.' });
      return;
    }

    await streamTicketAttachment(res, mediaStorage, att, req.query.download === '1');
  });

  router.patch('/:id', async (req, res) => {
    const schema = z.object({
      status: z.enum(SUPPORT_STATUSES).optional(),
      priority: z.enum(SUPPORT_PRIORITIES).optional(),
      adminNotes: z.string().max(4000).optional(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid status or priority value.' });
      return;
    }

    const existing = await db.models.SupportTicket.findOne({
      $or: [{ id: req.params.id }, { ticketNumber: req.params.id }],
    }).lean();
    if (!existing) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }

    const now = new Date().toISOString();
    const updateSet: Record<string, unknown> = { updatedAt: now };
    if (parsed.data.status !== undefined) updateSet.status = parsed.data.status;
    if (parsed.data.priority !== undefined) updateSet.priority = parsed.data.priority;
    if (parsed.data.adminNotes !== undefined) updateSet.adminNotes = parsed.data.adminNotes.trim();

    const updated = await db.models.SupportTicket.findOneAndUpdate(
      { id: existing.id },
      { $set: updateSet },
      { new: true, projection: { _id: 0 } }
    ).lean();

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'support_ticket_updated',
      entityType: 'support',
      entityId: existing.ticketNumber,
      details: updateSet,
      ipAddress: req.ip || '',
    });

    res.json({ message: 'Ticket updated.', ticket: updated });
  });

  // Standalone Admin attachment upload (higher limit: 15 files, 25 MB/file, 100 MB total)
  router.post('/:id/attachments', handleAdminSupportMultipart, async (req, res) => {
    const ticket = await db.models.SupportTicket.findOne({
      $or: [{ id: req.params.id }, { ticketNumber: req.params.id }],
    }).lean();
    if (!ticket) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }

    const files = (req.files as Express.Multer.File[] | undefined) || [];
    if (files.length === 0) {
      res.status(400).json({ error: 'Please select at least one PDF, image, or document file to upload.' });
      return;
    }

    let uploadedAttachments: StoredSupportAttachment[] = [];
    try {
      const uploadResult = await validateAndUploadAttachments(
        files,
        {
          maxFiles: ADMIN_MAX_SUPPORT_FILES,
          maxTotalBytes: ADMIN_MAX_SUPPORT_TOTAL_SIZE_BYTES,
          folder: 'support-admin',
        },
        mediaStorage
      );
      if (uploadResult.error) {
        res.status(uploadResult.error.status).json({ error: uploadResult.error.message });
        return;
      }
      uploadedAttachments = uploadResult.attachments;
    } catch (err) {
      const sc = (err as { statusCode?: number }).statusCode || 500;
      res.status(sc).json({
        error: err instanceof Error ? err.message : 'Failed to upload admin support files.',
      });
      return;
    }

    const now = new Date().toISOString();
    const updated = await db.models.SupportTicket.findOneAndUpdate(
      { id: ticket.id },
      {
        $push: { adminAttachments: { $each: uploadedAttachments } },
        $set: { updatedAt: now },
      },
      { new: true, projection: { _id: 0 } }
    ).lean();

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'support_admin_files_uploaded',
      entityType: 'support',
      entityId: ticket.ticketNumber,
      details: { filenames: uploadedAttachments.map(a => a.filename) },
      ipAddress: req.ip || '',
    });

    res.status(201).json({
      message: `Uploaded ${uploadedAttachments.length} admin file(s) to complaint #${ticket.ticketNumber}.`,
      attachments: uploadedAttachments,
      ticket: updated,
    });
  });

  // Send Custom Mail to Concerned User (with optional higher-limit Admin attachments)
  router.post('/:id/reply', maybeAdminSupportMultipart, async (req, res) => {
    const schema = z.object({
      subject: z.string().trim().min(3, 'Email subject is required (min 3 characters).').max(180),
      message: z.string().trim().min(5, 'Custom message body is required (min 5 characters).').max(8000),
      nextStatus: z.enum(SUPPORT_STATUSES).optional().default('responded'),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid custom email payload.' });
      return;
    }

    const ticket = await db.models.SupportTicket.findOne({
      $or: [{ id: req.params.id }, { ticketNumber: req.params.id }],
    }).lean();
    if (!ticket) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }

    if (!isValidEmail(ticket.email)) {
      res.status(400).json({ error: 'Concerned customer does not have a valid email address.' });
      return;
    }

    const files = (req.files as Express.Multer.File[] | undefined) || [];
    let uploadedAttachments: StoredSupportAttachment[] = [];
    if (files.length > 0) {
      try {
        const uploadResult = await validateAndUploadAttachments(
          files,
          {
            maxFiles: ADMIN_MAX_SUPPORT_FILES,
            maxTotalBytes: ADMIN_MAX_SUPPORT_TOTAL_SIZE_BYTES,
            folder: 'support-admin',
          },
          mediaStorage
        );
        if (uploadResult.error) {
          res.status(uploadResult.error.status).json({ error: uploadResult.error.message });
          return;
        }
        uploadedAttachments = uploadResult.attachments;
      } catch (err) {
        const sc = (err as { statusCode?: number }).statusCode || 500;
        res.status(sc).json({
          error: err instanceof Error ? err.message : 'Failed to upload custom email attachments.',
        });
        return;
      }
    }

    const sendRes = await emailService.sendSupportCustomReplyEmail({
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      customerId: ticket.customerId,
      recipientName: ticket.name,
      recipientEmail: ticket.email,
      category: ticket.category,
      ticketSubject: ticket.subject,
      customSubject: parsed.data.subject,
      customMessage: parsed.data.message,
      adminName: req.user!.name || 'Jammu Concierge Team',
      attachments: uploadedAttachments,
    });

    const now = new Date().toISOString();
    const replyEntry = {
      id: `rep_${crypto.randomUUID()}`,
      senderType: 'admin',
      senderId: req.user!.id,
      senderName: req.user!.name || req.user!.email,
      senderEmail: req.user!.email,
      subject: parsed.data.subject,
      message: parsed.data.message,
      attachments: uploadedAttachments,
      emailStatus: sendRes.log?.status || (sendRes.skipped ? 'suppressed' : 'queued'),
      emailLogId: sendRes.logId || null,
      createdAt: now,
    };

    const updateOps: Record<string, unknown> = {
      $push:
        uploadedAttachments.length > 0
          ? { replies: replyEntry, adminAttachments: { $each: uploadedAttachments } }
          : { replies: replyEntry },
      $set: {
        status: parsed.data.nextStatus,
        lastRepliedAt: now,
        lastRepliedBy: req.user!.email,
        updatedAt: now,
      },
    };

    const updatedTicket = await db.models.SupportTicket.findOneAndUpdate(
      { id: ticket.id },
      updateOps,
      { new: true, projection: { _id: 0 } }
    ).lean();

    if (ticket.customerId) {
      await createCustomerNotification(db, {
        customerId: ticket.customerId,
        type: 'support_reply',
        title: `Concierge Response: #${ticket.ticketNumber}`,
        message: `${parsed.data.subject} — check your inbox or complaint tracker for details.`,
      });
    }

    await logAudit(db, {
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'support_custom_email_sent',
      entityType: 'support',
      entityId: ticket.ticketNumber,
      details: {
        recipientEmail: ticket.email,
        subject: parsed.data.subject,
        attachmentsCount: uploadedAttachments.length,
        emailStatus: replyEntry.emailStatus,
        nextStatus: parsed.data.nextStatus,
      },
      ipAddress: req.ip || '',
    });

    res.json({
      message:
        sendRes.log?.status === 'sent'
          ? `Custom email delivered to ${ticket.email}.`
          : `Custom email recorded (${sendRes.log?.status || 'queued'}) for ${ticket.email}.`,
      ticket: updatedTicket,
      reply: replyEntry,
      emailLog: sendRes.log,
    });
  });

  return router;
}
