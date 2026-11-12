import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

export function generateSecureToken(bytes = 32): { raw: string; hash: string } {
  const raw = crypto.randomBytes(bytes).toString('hex');
  return { raw, hash: hashToken(raw) };
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export interface PasswordStrengthResult {
  valid: boolean;
  score: number; // 0-5
  label: 'Very Weak' | 'Weak' | 'Fair' | 'Strong' | 'Royal Shield';
  checks: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
  };
}

export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const checks = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };

  const score = Object.values(checks).filter(Boolean).length;
  const valid = score === 5;
  const labels: PasswordStrengthResult['label'][] = [
    'Very Weak',
    'Weak',
    'Weak',
    'Fair',
    'Strong',
    'Royal Shield',
  ];

  return {
    valid,
    score,
    label: labels[score] || 'Very Weak',
    checks,
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function isValidMobile(mobile: string): boolean {
  const norm = normalizeMobile(mobile);
  return /^[6-9]\d{9}$/.test(norm) || /^\d{10,15}$/.test(norm);
}

export function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function escapeHtml(input: unknown): string {
  const str = String(input ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitizes editable HTML templates and rich campaign content so admin edits
 * cannot embed <script>, <iframe>, <object>, inline JS handlers, or javascript: URLs.
 */
export function sanitizeEmailHtml(html: string): string {
  if (!html) return '';
  let clean = html;
  // Strip dangerous block tags including their inner contents
  clean = clean.replace(/<\s*(script|iframe|object|embed|applet|form|meta|base|link)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  clean = clean.replace(/<\s*(script|iframe|object|embed|applet|form|meta|base|link)\b[^>]*\/?>/gi, '');
  // Strip inline event handlers like onclick="..." or onload='...' or unquoted
  clean = clean.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Neutralize javascript:, vbscript:, data:text/html in href/src/action/background
  clean = clean.replace(
    /((?:href|src|action|background)\s*=\s*["']?)\s*(?:javascript|vbscript|data\s*:\s*text\/html):[^"'\s>]*/gi,
    '$1#'
  );
  // Strip CSS expression() or behavior:
  clean = clean.replace(/expression\s*\([^)]*\)/gi, '');
  clean = clean.replace(/behavior\s*:\s*[^;"]+/gi, '');
  return clean;
}

export function verifyHmacSignature(payload: string | Buffer, providedSig: string, secret: string): boolean {
  if (!providedSig || !secret) return false;
  const cleanSig = providedSig.replace(/^sha256=/i, '').trim();
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  try {
    const a = Buffer.from(cleanSig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function generateOrderNumber(): string {
  const year = new Date().getFullYear();
  const rand = crypto.randomInt(100000, 999999);
  return `AS-ORD-${year}-${rand}`;
}

