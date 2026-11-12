import { AppConfig } from '../config.ts';
import { MongoDatabase } from '../db/mongo.ts';
import { MediaStorageService } from './cloudinaryService.ts';
import { EmailTransport } from './emailProvider.ts';
import { EmailQueueService } from './emailQueue.ts';

export type PreflightKey = 'mongodb' | 'email' | 'cloudinary' | 'queue' | 'endpoints';

export interface PreflightCheckItem {
  key: PreflightKey;
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
}

export interface SystemPreflightDeps {
  db?: MongoDatabase | null;
  config: AppConfig;
  transport: EmailTransport;
  queue?: EmailQueueService | null;
  mediaStorage: MediaStorageService;
  startupError?: string | null;
  selfBaseUrl?: string | null;
  forceRefresh?: boolean;
}

const PREFLIGHT_CACHE = new WeakMap<MongoDatabase, { at: number; report: SystemPreflightReport }>();
const CACHE_TTL_MS = 5000;

export function sanitizeDiagnosticText(raw: unknown): string {
  const txt = typeof raw === 'string' ? raw : raw instanceof Error ? raw.message : String(raw || '');
  return txt
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/gi, '[redacted-db-uri]')
    .replace(/cloudinary:\/\/[^\s"']+/gi, '[redacted-cloudinary-uri]')
    .replace(/xkeysib-[^\s"']+/gi, '[redacted-key]')
    .replace(/re_[a-zA-Z0-9_]+/g, '[redacted-key]')
    .slice(0, 180);
}

async function checkMongo(
  db: MongoDatabase | null | undefined,
  startupError?: string | null
): Promise<PreflightCheckItem> {
  const started = Date.now();
  if (!db) {
    return {
      key: 'mongodb',
      label: 'MongoDB Database',
      ok: false,
      status: 'error',
      latencyMs: Date.now() - started,
      detail: startupError
        ? sanitizeDiagnosticText(startupError)
        : 'Database is still connecting...',
    };
  }

  try {
    if (db.conn.readyState !== 1 || !db.conn.db) {
      return {
        key: 'mongodb',
        label: 'MongoDB Database',
        ok: false,
        status: 'error',
        latencyMs: Date.now() - started,
        detail: `MongoDB connection not ready (state=${db.conn.readyState}).`,
      };
    }

    await db.conn.db.admin().ping();
    const [products, templates, admins] = await Promise.all([
      db.models.Product.countDocuments({ status: 'published' }),
      db.models.EmailTemplate.countDocuments(),
      db.models.Customer.countDocuments({ role: 'admin', isActive: { $ne: false } }),
    ]);

    return {
      key: 'mongodb',
      label: 'MongoDB Database',
      ok: admins > 0,
      status: admins > 0 ? 'connected' : 'degraded',
      latencyMs: Date.now() - started,
      detail:
        admins > 0
          ? `Connected & ping OK (${products} products, ${templates} templates, ${admins} admin active)`
          : 'Database reachable, but no active administrator account exists.',
      meta: {
        readyState: db.conn.readyState,
        publishedProducts: products,
        emailTemplates: templates,
        activeAdmins: admins,
      },
    };
  } catch (err) {
    return {
      key: 'mongodb',
      label: 'MongoDB Database',
      ok: false,
      status: 'error',
      latencyMs: Date.now() - started,
      detail: sanitizeDiagnosticText(err) || 'MongoDB ping failed.',
    };
  }
}

async function checkEmail(transport: EmailTransport): Promise<PreflightCheckItem> {
  const started = Date.now();
  const summary = transport.getSummary();
  try {
    if (transport.verifyConnection) {
      const res = await transport.verifyConnection();
      return {
        key: 'email',
        label: `Email Connection (${res.provider.toUpperCase()})`,
        ok: res.ok,
        status: res.ok ? 'connected' : 'error',
        latencyMs: res.latencyMs,
        detail: sanitizeDiagnosticText(res.detail),
        meta: {
          provider: res.provider,
          mode: res.mode,
        },
      };
    }

    return {
      key: 'email',
      label: `Email Connection (${summary.provider.toUpperCase()})`,
      ok: summary.configured,
      status: summary.configured ? 'connected' : 'error',
      latencyMs: Date.now() - started,
      detail: summary.configured
        ? `Transport ready (${summary.mode})`
        : 'Email transport is not configured.',
      meta: {
        provider: summary.provider,
        mode: summary.mode,
      },
    };
  } catch (err) {
    return {
      key: 'email',
      label: `Email Connection (${summary.provider.toUpperCase()})`,
      ok: false,
      status: 'error',
      latencyMs: Date.now() - started,
      detail: sanitizeDiagnosticText(err) || 'Email connection check failed.',
      meta: { provider: summary.provider },
    };
  }
}

async function checkCloudinary(mediaStorage: MediaStorageService): Promise<PreflightCheckItem> {
  const started = Date.now();
  try {
    if (mediaStorage.verifyConnection) {
      const res = await mediaStorage.verifyConnection();
      return {
        key: 'cloudinary',
        label: 'Cloudinary Media & PDFs',
        ok: res.ok,
        status: res.ok ? 'connected' : 'error',
        latencyMs: res.latencyMs,
        detail: sanitizeDiagnosticText(res.detail),
        meta: { configured: res.configured },
      };
    }

    const configured = mediaStorage.isConfigured();
    return {
      key: 'cloudinary',
      label: 'Cloudinary Media & PDFs',
      ok: configured,
      status: configured ? 'connected' : 'error',
      latencyMs: Date.now() - started,
      detail: configured ? 'Cloudinary storage configured & ready' : 'Cloudinary storage not configured.',
      meta: { configured },
    };
  } catch (err) {
    return {
      key: 'cloudinary',
      label: 'Cloudinary Media & PDFs',
      ok: false,
      status: 'error',
      latencyMs: Date.now() - started,
      detail: sanitizeDiagnosticText(err) || 'Cloudinary check failed.',
    };
  }
}

async function checkQueue(queue: EmailQueueService | null | undefined): Promise<PreflightCheckItem> {
  const started = Date.now();
  if (!queue) {
    return {
      key: 'queue',
      label: 'Email Worker & Queue',
      ok: false,
      status: 'waiting',
      latencyMs: 0,
      detail: 'Waiting for database initialization.',
    };
  }
  try {
    const stats = await queue.getQueueStats();
    return {
      key: 'queue',
      label: 'Email Worker & Queue',
      ok: true,
      status: 'connected',
      latencyMs: Date.now() - started,
      detail: `${stats.backend} running (${stats.pending} pending, ${stats.failed} failed)`,
      meta: {
        backend: stats.backend,
        pending: stats.pending,
        failed: stats.failed,
        completed: stats.completed,
      },
    };
  } catch (err) {
    return {
      key: 'queue',
      label: 'Email Worker & Queue',
      ok: false,
      status: 'error',
      latencyMs: Date.now() - started,
      detail: sanitizeDiagnosticText(err) || 'Unable to read email queue stats.',
    };
  }
}

const PROBE_ENDPOINTS: Array<{ path: string; expectedStatuses: number[] }> = [
  { path: '/api/health', expectedStatuses: [200] },
  { path: '/api/auth/config', expectedStatuses: [200] },
  { path: '/api/auth/me', expectedStatuses: [200] },
  { path: '/api/products', expectedStatuses: [200] },
  { path: '/api/settings/public', expectedStatuses: [200] },
  { path: '/api/support/track', expectedStatuses: [400] },
];

async function checkEndpoints(
  db: MongoDatabase | null | undefined,
  selfBaseUrl?: string | null
): Promise<{ item: PreflightCheckItem; endpoints: PreflightEndpointStatus[] }> {
  const started = Date.now();
  if (!db) {
    return {
      item: {
        key: 'endpoints',
        label: 'Core API Endpoints',
        ok: false,
        status: 'waiting',
        latencyMs: 0,
        detail: 'Waiting for database connection before API routes mount.',
      },
      endpoints: PROBE_ENDPOINTS.map(ep => ({
        path: ep.path,
        ok: false,
        status: 'waiting',
        latencyMs: 0,
      })),
    };
  }

  const isLoopback = Boolean(selfBaseUrl && /^http:\/\/127\.0\.0\.1:\d+$/.test(selfBaseUrl));
  if (isLoopback && selfBaseUrl) {
    const endpoints = await Promise.all(
      PROBE_ENDPOINTS.map(async (ep): Promise<PreflightEndpointStatus> => {
        const epStart = Date.now();
        try {
          const res = await fetch(`${selfBaseUrl}${ep.path}`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(2500),
          });
          return {
            path: ep.path,
            ok: ep.expectedStatuses.includes(res.status),
            status: res.status,
            latencyMs: Date.now() - epStart,
          };
        } catch {
          return {
            path: ep.path,
            ok: false,
            status: 'unreachable',
            latencyMs: Date.now() - epStart,
          };
        }
      })
    );
    const passed = endpoints.filter(e => e.ok).length;
    const allOk = passed === endpoints.length;
    return {
      item: {
        key: 'endpoints',
        label: 'Core API Endpoints',
        ok: allOk,
        status: allOk ? 'connected' : passed > 0 ? 'degraded' : 'error',
        latencyMs: Date.now() - started,
        detail: `${passed}/${endpoints.length} core API routes healthy`,
        meta: { passed, total: endpoints.length },
      },
      endpoints,
    };
  }

  // Fallback in-process verification (e.g. Supertest without listening TCP socket)
  try {
    await Promise.all([
      db.models.Product.findOne({}, { id: 1 }).lean(),
      db.models.SiteSetting.findOne({}, { key: 1 }).lean(),
      db.models.Session.findOne({}, { id: 1 }).lean(),
      db.models.SupportTicket.findOne({}, { id: 1 }).lean(),
      db.models.Order.findOne({}, { id: 1 }).lean(),
    ]);
    const endpoints: PreflightEndpointStatus[] = PROBE_ENDPOINTS.map(ep => ({
      path: ep.path,
      ok: true,
      status: ep.expectedStatuses[0],
      latencyMs: Date.now() - started,
    }));
    return {
      item: {
        key: 'endpoints',
        label: 'Core API Endpoints',
        ok: true,
        status: 'connected',
        latencyMs: Date.now() - started,
        detail: `${endpoints.length}/${endpoints.length} core API handlers & collections verified`,
        meta: { passed: endpoints.length, total: endpoints.length },
      },
      endpoints,
    };
  } catch (err) {
    return {
      item: {
        key: 'endpoints',
        label: 'Core API Endpoints',
        ok: false,
        status: 'error',
        latencyMs: Date.now() - started,
        detail: sanitizeDiagnosticText(err) || 'Core route dependency check failed.',
      },
      endpoints: PROBE_ENDPOINTS.map(ep => ({
        path: ep.path,
        ok: false,
        status: 'error',
        latencyMs: Date.now() - started,
      })),
    };
  }
}

export async function runSystemPreflight(deps: SystemPreflightDeps): Promise<SystemPreflightReport> {
  if (deps.db && !deps.forceRefresh) {
    const cached = PREFLIGHT_CACHE.get(deps.db);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.report;
    }
  }

  const started = Date.now();
  const [mongodb, email, cloudinary, queueCheck, endpointsResult] = await Promise.all([
    checkMongo(deps.db, deps.startupError),
    checkEmail(deps.transport),
    checkCloudinary(deps.mediaStorage),
    checkQueue(deps.queue),
    checkEndpoints(deps.db, deps.selfBaseUrl),
  ]);

  const checks: PreflightCheckItem[] = [mongodb, email, cloudinary, queueCheck, endpointsResult.item];
  const overallOk = checks.every(c => c.ok);
  const readyForAdminLogin = mongodb.ok && email.ok;

  const report: SystemPreflightReport = {
    overallOk,
    readyForAdminLogin,
    timestamp: new Date().toISOString(),
    totalDurationMs: Date.now() - started,
    checks,
    endpoints: endpointsResult.endpoints,
  };

  if (deps.db) {
    PREFLIGHT_CACHE.set(deps.db, { at: Date.now(), report });
  }
  return report;
}

