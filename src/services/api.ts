import type { CatalogProduct } from '../data/products';
import type { OrderStatus } from '../types/product';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  pendingEmail: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  phone: string;
  role: 'customer' | 'admin';
  adminRole?: 'super_admin' | 'staff' | null;
  permissions?: string[];
  isActive?: boolean;
  profilePicture: string | null;
  tier: string;
  loyaltyPoints: number;
  marketingConsent: boolean;
  marketingConsentAt: string | null;
  consentSource: string | null;
  unsubscribedAt: string | null;
  emailPreferences: {
    transactional?: Record<string, boolean>;
    marketing?: {
      newProductAnnouncements?: boolean;
      festivalOffers?: boolean;
      promotionalDiscounts?: boolean;
      specialCampaigns?: boolean;
      newsletter?: boolean;
    };
  };
  createdAt: string;
}

export interface PersistedOrderItem {
  id: string;
  orderId: string;
  productId: string;
  variantId?: string | null;
  weightLabel?: string | null;
  productName: string;
  productImage: string;
  category: string;
  unit: 'kg' | 'gram' | 'ml' | 'piece';
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface OrderShipment {
  id: string;
  orderId: string;
  courierPartner: string;
  trackingNumber: string;
  trackingUrl: string | null;
  dispatchDate: string;
  estimatedDeliveryDate: string | null;
  shipmentNotes: string | null;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderStatusHistoryEntry {
  id: string;
  orderId: string;
  previousStatus: string | null;
  newStatus: OrderStatus;
  updatedBy: string;
  notes: string | null;
  timestamp: string;
}

export interface PersistedOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  orderType: 'standard' | 'custom';
  status: OrderStatus;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: number;
  discountAmount: number;
  couponCode: string | null;
  shippingCharge: number;
  taxAmount: number;
  totalAmount: number;
  deliveryAddressObj: {
    fullName?: string;
    mobileNumber?: string;
    whatsappNumber?: string;
    email?: string;
    deliveryAddress?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  customerObj: {
    id?: string;
    name?: string;
    email?: string;
    phone?: string;
  };
  instructions: string;
  estimatedDeliveryEstimate: string | null;
  confirmedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  refundStatus: string | null;
  refundAmount: number | null;
  refundReferenceId: string | null;
  refundDate: string | null;
  refundBankEta: string | null;
  createdAt: string;
  updatedAt: string;
  items: PersistedOrderItem[];
  shipment: OrderShipment | null;
  statusHistory: OrderStatusHistoryEntry[];
  emailLogs?: EmailLogItem[];
}

export interface AddressItem {
  id: string;
  customerId: string;
  label: string;
  fullName: string;
  phone: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: number | boolean;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  relatedOrderId: string | null;
  isRead: number | boolean;
  createdAt: string;
}

export interface CouponItem {
  id: string;
  code: string;
  title: string;
  description: string;
  discountType: 'percentage' | 'flat';
  discountValue: number;
  minOrderValue: number;
  maxDiscount: number | null;
  startDate: string | null;
  endDate: string | null;
}

export interface EmailTemplateItem {
  id: string;
  templateKey: string;
  templateName: string;
  category: 'transactional' | 'marketing';
  subject: string;
  htmlContent: string;
  textContent: string;
  variables: string[];
  enabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export interface EmailLogItem {
  id: string;
  recipient: string;
  emailType: string;
  subject: string;
  provider: string;
  providerMessageId: string | null;
  previewUrl: string | null;
  relatedOrderId: string | null;
  campaignId: string | null;
  status: string;
  attempts: number;
  errorMessage: string | null;
  opensCount: number;
  clicksCount: number;
  scheduledAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  jobId?: string | null;
  jobStatus?: string | null;
}

export interface MarketingCampaignItem {
  id: string;
  campaignName: string;
  campaignType: 'new_product' | 'festival' | 'promotional';
  festivalName: string | null;
  productId: string | null;
  subject: string;
  content: string;
  bannerImage: string | null;
  discountPercentage: number | null;
  couponCode: string | null;
  startDate: string | null;
  endDate: string | null;
  applicableProducts: string[];
  minOrderValue: number;
  maxDiscount: number | null;
  ctaText: string;
  ctaUrl: string;
  targetSegment: string;
  segmentCategory: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdBy: string;
  createdAt: string;
}

export interface SupportAttachmentItem {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  publicId: string;
  resourceType: 'image' | 'raw' | 'video';
}

export interface SupportReplyItem {
  id: string;
  senderType: 'admin' | 'customer';
  senderId: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  message: string;
  attachments?: SupportAttachmentItem[];
  emailStatus?: string;
  emailLogId?: string | null;
  createdAt: string;
}

export interface SupportTicketItem {
  id: string;
  ticketNumber: string;
  customerId: string | null;
  name: string;
  email: string;
  phone: string;
  category: string;
  orderNumber: string | null;
  subject: string;
  description: string;
  attachments: SupportAttachmentItem[];
  adminAttachments?: SupportAttachmentItem[];
  status: 'open' | 'in_review' | 'responded' | 'resolved' | 'closed';
  priority: 'normal' | 'high' | 'urgent';
  adminNotes?: string;
  replies: SupportReplyItem[];
  lastRepliedAt: string | null;
  lastRepliedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTierLimits {
  maxFiles: number;
  maxFileSizeBytes: number;
  maxTotalSizeBytes: number;
}

export const SUPPORT_UPLOAD_ACCEPT =
  '.png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.mp4,.webm,image/png,image/jpeg,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,application/zip,video/mp4,video/webm';

export const SUPPORT_ALLOWED_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.csv',
  '.txt',
  '.zip',
  '.mp4',
  '.webm',
];

export const SUPPORT_UPLOAD_LIMITS = {
  maxFiles: 5,
  maxFileSizeBytes: 5 * 1024 * 1024,
  maxTotalSizeBytes: 15 * 1024 * 1024,
  user: {
    maxFiles: 5,
    maxFileSizeBytes: 5 * 1024 * 1024,
    maxTotalSizeBytes: 15 * 1024 * 1024,
  } satisfies SupportTierLimits,
  admin: {
    maxFiles: 15,
    maxFileSizeBytes: 25 * 1024 * 1024,
    maxTotalSizeBytes: 100 * 1024 * 1024,
  } satisfies SupportTierLimits,
  allowedMimeTypes: [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/csv',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed',
    'video/mp4',
    'video/webm',
  ],
};

export function formatFileBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function validateSupportFiles(
  incoming: FileList | File[],
  existingFiles: File[],
  limits: SupportTierLimits
): { accepted: File[]; error: string } {
  const next = [...existingFiles];
  let runningBytes = next.reduce((sum, f) => sum + f.size, 0);
  let error = '';
  const maxFileMb = Math.round(limits.maxFileSizeBytes / (1024 * 1024));
  const maxTotalMb = Math.round(limits.maxTotalSizeBytes / (1024 * 1024));

  for (const file of Array.from(incoming)) {
    if (next.length >= limits.maxFiles) {
      error = `Limit reached: maximum ${limits.maxFiles} files allowed.`;
      break;
    }
    const ext = file.name.includes('.') ? `.${file.name.split('.').pop()!.toLowerCase()}` : '';
    const mimeOk = SUPPORT_UPLOAD_LIMITS.allowedMimeTypes.includes(file.type.toLowerCase());
    const extOk = SUPPORT_ALLOWED_EXTENSIONS.includes(ext);
    if (!mimeOk && !extOk) {
      error = `Unsupported file "${file.name}". Allowed: PNG/JPG/WEBP/GIF, PDF, DOC/DOCX/XLS/XLSX/CSV/TXT, ZIP, MP4/WEBM.`;
      continue;
    }
    if (file.size > limits.maxFileSizeBytes) {
      error = `"${file.name}" exceeds the ${maxFileMb} MB per-file limit (${formatFileBytes(file.size)}).`;
      continue;
    }
    if (runningBytes + file.size > limits.maxTotalSizeBytes) {
      error = `Adding "${file.name}" exceeds the ${maxTotalMb} MB total upload limit.`;
      break;
    }
    runningBytes += file.size;
    next.push(file);
  }

  return { accepted: next, error };
}

function getCsrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)as_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function getPortalScope(): 'admin' | 'storefront' {
  if (typeof window !== 'undefined') {
    if (window.location.port === '8000' || window.location.hostname.startsWith('admin.')) {
      return 'admin';
    }
  }
  return 'storefront';
}

function notifyUnauthorizedIfProtected(path: string, status: number): void {
  if (
    status === 401 &&
    typeof window !== 'undefined' &&
    (path.startsWith('/api/account') || path.startsWith('/api/admin') || path.startsWith('/api/orders'))
  ) {
    window.dispatchEvent(new CustomEvent('as:session-expired'));
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;
  retryAfterSeconds?: number;

  constructor(message: string, status: number, code?: string, retryAfterSeconds?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function apiRequest<T = any>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
  } = {}
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    'X-Portal-Scope': getPortalScope(),
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(path, {
    method,
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    retryAfterSeconds?: number;
  };

  if (!res.ok) {
    notifyUnauthorizedIfProtected(path, res.status);
    const defaultMsg =
      res.status === 502 || res.status === 503 || res.status === 504
        ? `Service temporarily unavailable (${res.status}). Please ensure the API server is running and try again.`
        : `Request failed (${res.status})`;
    throw new ApiError(
      data.error || defaultMsg,
      res.status,
      data.code,
      data.retryAfterSeconds
    );
  }

  return data as T;
}

export async function apiUpload<T = any>(path: string, formData: FormData): Promise<T> {
  const csrf = getCsrfToken();
  const headers: Record<string, string> = {
    'X-Portal-Scope': getPortalScope(),
  };
  if (csrf) headers['X-CSRF-Token'] = csrf;

  const res = await fetch(path, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: formData,
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    notifyUnauthorizedIfProtected(path, res.status);
    throw new ApiError(data.error || `Upload failed (${res.status})`, res.status);
  }
  return data as T;
}

export interface PublicWebsiteSettings {
  logoUrl: string;
  faviconUrl: string;
  brandName: string;
  tagline: string;
  heroBanners: string[];
  featuredProductIds: string[];
  promotionalSections: Array<{ title: string; subtitle: string; active: boolean }>;
  footerAbout: string;
  contactPhone: string;
  contactEmail: string;
  dispatchLocation: string;
  socialLinks: {
    instagram: string;
    facebook: string;
    whatsapp: string;
  };
  shippingInfo: string;
  returnPolicy: string;
  privacyPolicy: string;
  termsAndConditions: string;
}

export interface PublicBusinessSettings {
  businessName: string;
  defaultGstRate: number;
  defaultShippingCharge: number;
  freeShippingThreshold: number;
  contactNumber?: string;
  businessEmail?: string;
}

export interface PublicSettingsPayload {
  website: PublicWebsiteSettings;
  currency: string;
  business?: PublicBusinessSettings;
}

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  sortOrder?: number;
}

export async function fetchPublishedProducts(): Promise<CatalogProduct[]> {
  const data = await apiRequest<{ products: CatalogProduct[] }>('/api/products');
  return data.products;
}

export async function fetchPublicCategories(): Promise<PublicCategory[]> {
  const data = await apiRequest<{ categories: PublicCategory[] }>('/api/categories');
  return data.categories || [];
}

export async function fetchPublicSettings(): Promise<PublicSettingsPayload> {
  return apiRequest<PublicSettingsPayload>('/api/settings/public');
}

export interface PreflightCheckItem {
  key: 'mongodb' | 'email' | 'cloudinary' | 'queue' | 'endpoints';
  label: string;
  ok: boolean;
  status: 'connected' | 'degraded' | 'error' | 'waiting';
  latencyMs: number;
  detail: string;
  meta?: Record<string, string | number | boolean>;
}

export interface PreflightEndpointStatus {
  path: string;
  ok: boolean;
  status: number | string;
  latencyMs: number;
}

export interface SystemPreflightReport {
  overallOk: boolean;
  readyForAdminLogin: boolean;
  timestamp: string;
  totalDurationMs: number;
  checks: PreflightCheckItem[];
  endpoints: PreflightEndpointStatus[];
  browserProxyChecks?: PreflightEndpointStatus[];
}

export async function fetchAdminPreflight(fresh = false): Promise<SystemPreflightReport> {
  const started = performance.now();
  const headers: Record<string, string> = {
    'X-Portal-Scope': 'admin',
    Accept: 'application/json',
  };

  let report: SystemPreflightReport | null = null;
  try {
    const res = await fetch(`/api/system/preflight${fresh ? '?fresh=1' : ''}`, {
      headers,
      credentials: 'include',
    });
    const parsed = (await res.json().catch(() => null)) as SystemPreflightReport | null;
    if (parsed && Array.isArray(parsed.checks)) {
      report = parsed;
    } else {
      return {
        overallOk: false,
        readyForAdminLogin: false,
        timestamp: new Date().toISOString(),
        totalDurationMs: Math.round(performance.now() - started),
        checks: [
          {
            key: 'endpoints',
            label: 'API Server & Gateway',
            ok: false,
            status: 'error',
            latencyMs: Math.round(performance.now() - started),
            detail: `Backend API returned HTTP ${res.status} without diagnostics.`,
          },
        ],
        endpoints: [],
      };
    }
  } catch (err) {
    return {
      overallOk: false,
      readyForAdminLogin: false,
      timestamp: new Date().toISOString(),
      totalDurationMs: Math.round(performance.now() - started),
      checks: [
        {
          key: 'endpoints',
          label: 'API Server & Gateway',
          ok: false,
          status: 'error',
          latencyMs: Math.round(performance.now() - started),
          detail: err instanceof Error ? err.message : 'Unable to reach API backend.',
        },
      ],
      endpoints: [],
    };
  }

  // Probe live browser-through-proxy API routes only when backend & DB are ready (avoids noisy 503 console spam)
  const mongoOk = Boolean(report.checks.find(c => c.key === 'mongodb')?.ok);
  if (mongoOk) {
    const browserRoutes = ['/api/health', '/api/auth/config', '/api/auth/me', '/api/products', '/api/settings/public'];
    const proxyResults = await Promise.all(
      browserRoutes.map(async (route): Promise<PreflightEndpointStatus> => {
        const t0 = performance.now();
        try {
          const r = await fetch(route, { headers, credentials: 'include' });
          return {
            path: route,
            ok: r.ok,
            status: r.status,
            latencyMs: Math.round(performance.now() - t0),
          };
        } catch {
          return {
            path: route,
            ok: false,
            status: 'unreachable',
            latencyMs: Math.round(performance.now() - t0),
          };
        }
      })
    );
    report.browserProxyChecks = proxyResults;
    if (proxyResults.some(r => !r.ok)) {
      report.overallOk = false;
    }
  }

  return report;
}

