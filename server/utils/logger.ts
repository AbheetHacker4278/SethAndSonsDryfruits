import crypto from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  route?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  operationId?: string;
  errorCategory?: string;
  errorStack?: string;
  meta?: Record<string, unknown>;
}

const REDACTED_KEYS = new Set([
  'password',
  'adminpassword',
  'newpassword',
  'currentpassword',
  'token',
  'authtoken',
  'authorization',
  'cookie',
  'cookies',
  'csrf',
  'csrftoken',
  'secret',
  'cookiesecret',
  'emailwebhooksecret',
  'razorpaykeysecret',
  'cloudinaryapisecret',
  'otp',
  'pin',
  'cvv',
  'cardnumber',
  'purchaseprice',
  'basecost',
  'profitmargin',
  'costperunit',
  'suppliercost',
]);

/**
 * Recursively deep-clones an object while redacting sensitive and confidential fields.
 */
export function sanitizeLogData(data: unknown, depth = 0): unknown {
  if (depth > 5) return '[DeeplyNested]';
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase().replace(/[-_]/g, '');
    if (REDACTED_KEYS.has(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeLogData(val, depth + 1);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

export class AppLogger {
  private isTest = process.env.NODE_ENV === 'test';

  private output(entry: StructuredLogEntry) {
    // In test environment, keep output quiet unless debugging
    if (this.isTest && process.env.VERBOSE_LOGS !== 'true') {
      return;
    }
    const serialized = JSON.stringify(entry);
    if (entry.level === 'error') {
      console.error(serialized);
    } else if (entry.level === 'warn') {
      console.warn(serialized);
    } else {
      console.log(serialized);
    }
  }

  info(message: string, meta?: Record<string, unknown>) {
    this.output({
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      meta: sanitizeLogData(meta) as Record<string, unknown>,
    });
  }

  warn(message: string, meta?: Record<string, unknown>) {
    this.output({
      timestamp: new Date().toISOString(),
      level: 'warn',
      message,
      meta: sanitizeLogData(meta) as Record<string, unknown>,
    });
  }

  error(message: string, error?: unknown, meta?: Record<string, unknown>) {
    const errObj = error instanceof Error ? error : null;
    this.output({
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      errorCategory: errObj?.name || 'Error',
      errorStack: errObj?.stack,
      meta: sanitizeLogData(meta) as Record<string, unknown>,
    });
  }

  // Domain-specific event helpers for auditing critical e-commerce flows
  logOrderEvent(eventType: string, orderNumber: string, details?: Record<string, unknown>) {
    this.info(`[OrderEvent] ${eventType}: ${orderNumber}`, {
      eventType,
      orderNumber,
      ...details,
    });
  }

  logPaymentEvent(eventType: string, txRef: string, details?: Record<string, unknown>) {
    this.info(`[PaymentEvent] ${eventType}: ${txRef}`, {
      eventType,
      txRef,
      ...details,
    });
  }

  logRefundEvent(eventType: string, orderNumber: string, details?: Record<string, unknown>) {
    this.info(`[RefundEvent] ${eventType}: ${orderNumber}`, {
      eventType,
      orderNumber,
      ...details,
    });
  }

  logInventoryEvent(eventType: string, productId: string, details?: Record<string, unknown>) {
    this.info(`[InventoryEvent] ${eventType}: ${productId}`, {
      eventType,
      productId,
      ...details,
    });
  }

  logLoyaltyEvent(eventType: string, customerId: string, details?: Record<string, unknown>) {
    this.info(`[LoyaltyEvent] ${eventType}: ${customerId}`, {
      eventType,
      customerId,
      ...details,
    });
  }
}

export const logger = new AppLogger();

/**
 * Express middleware that generates a unique request ID, sets X-Request-ID response header,
 * and outputs structured request completion metrics upon finish.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  (req as any).id = requestId;
  res.setHeader('X-Request-ID', requestId);

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const isError = res.statusCode >= 400;
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level: isError ? (res.statusCode >= 500 ? 'error' : 'warn') : 'info',
      message: `${req.method} ${req.path} ${res.statusCode} (${durationMs}ms)`,
      requestId,
      route: req.path,
      method: req.method,
      status: res.statusCode,
      durationMs,
    };
    if (process.env.NODE_ENV !== 'test' || process.env.VERBOSE_LOGS === 'true') {
      const serialized = JSON.stringify(entry);
      if (isError) {
        if (res.statusCode >= 500) console.error(serialized);
        else console.warn(serialized);
      } else {
        console.log(serialized);
      }
    }
  });

  next();
}
