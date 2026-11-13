import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

// Capture env keys already set by the OS/CLI before .env files are loaded so CLI overrides remain intact
// while .env.local edits always take effect cleanly on hot-reloads.
const CLI_ENV_KEYS = new Set(Object.keys(process.env));

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export type EmailProviderType = 'smtp' | 'brevo' | 'resend' | 'ses';

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  adminPort: number;
  apiPort: number;
  appUrl: string;
  adminUrl: string;
  mongodbUri: string;
  cookieSecret: string;
  cloudinaryCloudName: string;
  cloudinaryApiKey: string;
  cloudinaryApiSecret: string;
  cloudinaryUrl: string;
  emailProvider: EmailProviderType;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  emailFrom: string;
  emailFromName: string;
  emailReplyTo: string;
  brevoApiKey: string;
  resendApiKey: string;
  awsSesRegion: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  emailWebhookSecret: string;
  emailTrackingEnabled: boolean;
  redisUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  adminSeedEmail: string;
  adminSeedPassword: string;
}

function readEnvFiles(): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const file of ['.env', '.env.local']) {
    const full = path.resolve(process.cwd(), file);
    if (fs.existsSync(full)) {
      Object.assign(merged, dotenv.parse(fs.readFileSync(full, 'utf8')));
    }
  }
  return merged;
}

export function loadConfig(): AppConfig {
  const fileEnv = process.env.NODE_ENV === 'test' ? {} : readEnvFiles();
  const get = (key: string, fallback = ''): string => {
    if (CLI_ENV_KEYS.has(key) && process.env[key] !== undefined) {
      return process.env[key]!;
    }
    if (fileEnv[key] !== undefined) {
      return fileEnv[key];
    }
    return process.env[key] ?? fallback;
  };

  const nodeEnv = process.argv.includes('--prod')
    ? 'production'
    : get('NODE_ENV', 'development');
  const rawProvider = get('EMAIL_PROVIDER', 'smtp').toLowerCase();
  const emailProvider: EmailProviderType =
    rawProvider === 'brevo' || rawProvider === 'resend' || rawProvider === 'ses'
      ? rawProvider
      : 'smtp';

  const appUrl = get('APP_URL', 'http://localhost:3000').replace(/\/+$/, '');
  const adminUrl = get('ADMIN_URL', nodeEnv === 'production' ? appUrl : 'http://localhost:8000').replace(/\/+$/, '');
  const emailFrom = get('EMAIL_FROM', 'abheetseth203@gmail.com');

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: Number(get('PORT', '3000') || 3000),
    adminPort: Number(get('ADMIN_PORT', '8000') || 8000),
    apiPort: Number(get('API_PORT', '8001') || 8001),
    appUrl,
    adminUrl,
    mongodbUri: get('MONGODB_URI', 'mongodb://127.0.0.1:27017/asulesh_seth_dryfruits'),
    cookieSecret: get('COOKIE_SECRET', 'dev-asulesh-seth-cookie-secret-change-in-prod'),
    cloudinaryCloudName: get('CLOUDINARY_CLOUD_NAME', ''),
    cloudinaryApiKey: get('CLOUDINARY_API_KEY', ''),
    cloudinaryApiSecret: get('CLOUDINARY_API_SECRET', ''),
    cloudinaryUrl: get('CLOUDINARY_URL', ''),
    emailProvider,
    smtpHost: get('SMTP_HOST', ''),
    smtpPort: Number(get('SMTP_PORT', '587') || 587),
    smtpSecure: get('SMTP_SECURE', 'false') === 'true' || Number(get('SMTP_PORT', '587')) === 465,
    smtpUser: get('SMTP_USER', ''),
    smtpPass: get('SMTP_PASS', ''),
    emailFrom,
    emailFromName: get('EMAIL_FROM_NAME', 'Seth And Sons DryFruits'),
    emailReplyTo: get('EMAIL_REPLY_TO', emailFrom) || emailFrom,
    brevoApiKey: get('BREVO_API_KEY', ''),
    resendApiKey: get('RESEND_API_KEY', ''),
    awsSesRegion: get('AWS_SES_REGION', 'ap-south-1'),
    awsAccessKeyId: get('AWS_ACCESS_KEY_ID', ''),
    awsSecretAccessKey: get('AWS_SECRET_ACCESS_KEY', ''),
    emailWebhookSecret: get('EMAIL_WEBHOOK_SECRET', 'dev-webhook-hmac-secret'),
    emailTrackingEnabled: get('EMAIL_TRACKING_ENABLED', 'false') === 'true',
    redisUrl: get('REDIS_URL', ''),
    googleClientId: get('GOOGLE_CLIENT_ID', ''),
    googleClientSecret: get('GOOGLE_CLIENT_SECRET', ''),
    googleRedirectUri: get('GOOGLE_REDIRECT_URI', `${appUrl}/api/auth/google/callback`),
    adminSeedEmail: get('ADMIN_SEED_EMAIL', 'aseth9588@gmail.com'),
    adminSeedPassword: get('ADMIN_SEED_PASSWORD', 'RoyalAdmin@2026!'),
  };
}
