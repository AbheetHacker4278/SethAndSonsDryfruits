import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { AppConfig, loadConfig } from './config.ts';
import { connectDatabase, MongoDatabase, seedDatabase } from './db/mongo.ts';
import {
  attachSession,
  csrfProtection,
  ensureCsrfCookie,
  sanitizeNoSqlInput,
  securityHeaders,
} from './middleware/security.ts';
import { createAccountRouter } from './routes/account.ts';
import { createAdminRouter } from './routes/admin.ts';
import { createAdminErpRouter } from './routes/adminErp.ts';
import { createAuthRouter } from './routes/auth.ts';
import { createOrdersRouter } from './routes/orders.ts';
import { createPublicRouter } from './routes/public.ts';
import { createAdminSupportRouter, createSupportRouter } from './routes/support.ts';
import { createCloudinaryStorage, MediaStorageService } from './services/cloudinaryService.ts';
import { createEmailTransport, EmailTransport } from './services/emailProvider.ts';
import { createEmailQueue, EmailQueueService } from './services/emailQueue.ts';
import { createEmailService, EmailService } from './services/emailService.ts';

export interface AppInstance {
  app: express.Express;
  db: MongoDatabase;
  config: AppConfig;
  transport: EmailTransport;
  queue: EmailQueueService;
  emailService: EmailService;
  mediaStorage: MediaStorageService;
  close: () => Promise<void>;
}

interface RouterLayerLike {
  route?: { stack?: RouterLayerLike[] };
  name?: string;
  handle?: ((...args: unknown[]) => unknown) & {
    stack?: RouterLayerLike[];
    __asyncWrapped?: boolean;
  };
}

function wrapAsyncHandler<T extends ((...args: unknown[]) => unknown) & { __asyncWrapped?: boolean }>(fn: T): T {
  if (fn.length >= 4 || fn.__asyncWrapped) return fn;
  const wrapped = function asyncSafeWrapper(this: unknown, req: unknown, res: unknown, next: (err?: unknown) => void) {
    try {
      const out = fn.call(this, req, res, next);
      if (out && typeof (out as Promise<unknown>).catch === 'function') {
        (out as Promise<unknown>).catch(next);
      }
      return out;
    } catch (err) {
      next(err);
      return undefined;
    }
  } as unknown as T;
  wrapped.__asyncWrapped = true;
  return wrapped;
}

export function wrapRouterAsync(router: express.Router): express.Router {
  const container = router as unknown as { stack?: RouterLayerLike[] };
  const layers = container.stack;
  if (!Array.isArray(layers)) return router;

  for (const layer of layers) {
    if (layer.route?.stack) {
      for (const routeLayer of layer.route.stack) {
        if (typeof routeLayer.handle === 'function') {
          routeLayer.handle = wrapAsyncHandler(routeLayer.handle);
        }
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      wrapRouterAsync(layer.handle as unknown as express.Router);
    } else if (typeof layer.handle === 'function') {
      layer.handle = wrapAsyncHandler(layer.handle);
    }
  }
  return router;
}

export async function createApp(overrides?: {
  config?: Partial<AppConfig>;
  emailTransport?: EmailTransport;
  mediaStorage?: MediaStorageService;
  startQueueWorker?: boolean;
}): Promise<AppInstance> {
  const baseConfig = loadConfig();
  const config: AppConfig = { ...baseConfig, ...(overrides?.config || {}) };

  const db = await connectDatabase(config.mongodbUri);
  await seedDatabase(db, config);

  const transport = overrides?.emailTransport || createEmailTransport(config);
  const queue = createEmailQueue(db, config, transport);
  const emailService = createEmailService(db, config, queue);
  const mediaStorage = overrides?.mediaStorage || createCloudinaryStorage(config);

  if (overrides?.startQueueWorker !== false) {
    queue.startWorker(2000);
  }

  const app = express();
  app.set('trust proxy', 1);

  app.use(securityHeaders);
  app.use(cookieParser(config.cookieSecret));
  app.use(
    express.json({
      limit: '5mb',
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(sanitizeNoSqlInput);

  app.use(ensureCsrfCookie(config));
  app.use('/api', csrfProtection);
  app.use('/api', attachSession(db));

  // Optional static fallback for any pre-existing local media files
  const uploadsRoot = path.resolve(process.cwd(), 'public/uploads');
  if (fs.existsSync(uploadsRoot)) {
    app.use('/uploads', express.static(uploadsRoot));
  }

  // API Routes (wrapped to forward async/await rejections cleanly into Express 4 error middleware)
  app.use('/api', wrapRouterAsync(createPublicRouter(db, config, { transport, queue, mediaStorage })));
  app.use('/api/auth', wrapRouterAsync(createAuthRouter(db, config, emailService)));
  app.use('/api/account', wrapRouterAsync(createAccountRouter(db, config, emailService, mediaStorage)));
  app.use('/api/orders', wrapRouterAsync(createOrdersRouter(db, emailService)));
  app.use('/api/support', wrapRouterAsync(createSupportRouter(db, mediaStorage, emailService)));
  app.use('/api/admin', wrapRouterAsync(createAdminRouter(db, config, transport, queue, emailService, mediaStorage)));
  app.use('/api/admin', wrapRouterAsync(createAdminErpRouter(db, transport, queue, mediaStorage, emailService)));
  app.use('/api/admin/support', wrapRouterAsync(createAdminSupportRouter(db, mediaStorage, emailService)));

  // Production static SPA serving when dist exists
  const distDir = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distDir) && config.isProduction) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // Error handler (including multer, Cloudinary upload & forwarded async errors)
  app.use(
    (
      err: Error & { status?: number; statusCode?: number; name?: string },
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (res.headersSent) {
        next(err);
        return;
      }
      const explicitStatus = Number(err.status || err.statusCode);
      const isMongoErr = typeof err.name === 'string' && err.name.startsWith('Mongo');
      const status =
        explicitStatus >= 400 && explicitStatus < 600
          ? explicitStatus
          : isMongoErr
          ? 503
          : 400;
      res.status(status).json({ error: err.message || 'Unexpected server error.' });
    }
  );

  return {
    app,
    db,
    config,
    transport,
    queue,
    emailService,
    mediaStorage,
    async close() {
      await queue.stopWorker();
      await db.close();
    },
  };
}
