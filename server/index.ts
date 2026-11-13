import http from 'node:http';
import { AppInstance, createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createCloudinaryStorage } from './services/cloudinaryService.ts';
import { createEmailTransport } from './services/emailProvider.ts';
import { runSystemPreflight } from './services/preflightService.ts';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const config = loadConfig();
  const fallbackTransport = createEmailTransport(config);
  const fallbackMedia = createCloudinaryStorage(config);
  const servers: http.Server[] = [];
  let instance: AppInstance | null = null;
  let startupError: string | null = null;
  let shuttingDown = false;

  const requestListener: http.RequestListener = (req, res) => {
    if (instance) {
      instance.app(req, res);
      return;
    }

    if (req.url && req.url.split('?')[0] === '/api/system/preflight') {
      void runSystemPreflight({
        db: null,
        config,
        transport: fallbackTransport,
        queue: null,
        mediaStorage: fallbackMedia,
        startupError,
        forceRefresh: true,
      })
        .then(report => {
          if (res.headersSent) return;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(report));
        })
        .catch(() => {
          if (res.headersSent) return;
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ overallOk: false, readyForAdminLogin: false, checks: [] }));
        });
      return;
    }

    const payload = JSON.stringify({
      status: 'unavailable',
      code: startupError ? 'DATABASE_UNAVAILABLE' : 'API_INITIALIZING',
      error: startupError || 'API server is starting and connecting to database...',
    });
    res.writeHead(503, {
      'Content-Type': 'application/json',
      'Retry-After': '3',
    });
    res.end(payload);
  };

  if (config.isProduction) {
    const mainServer = http.createServer(requestListener).listen(config.port, '0.0.0.0', () => {
      console.log(
        `[Seth And Sons Application] Listening on port ${config.port} (env=${config.nodeEnv})`
      );
    });
    servers.push(mainServer);

    // Only start a separate admin listener in production if ADMIN_PORT is explicitly set and distinct
    const hasExplicitAdminPort = Boolean(process.env.ADMIN_PORT && Number(process.env.ADMIN_PORT) !== config.port);
    if (hasExplicitAdminPort) {
      try {
        const adminServer = http.createServer(requestListener).listen(config.adminPort, '0.0.0.0', () => {
          console.log(`[Seth And Sons Admin Portal] Listening on http://localhost:${config.adminPort}`);
        });
        servers.push(adminServer);
      } catch (err) {
        console.warn('[Seth And Sons Admin Portal] Could not bind separate admin port:', err);
      }
    }
  } else {
    const apiServer = http.createServer(requestListener).listen(config.apiPort, '0.0.0.0', () => {
      console.log(
        `[Seth And Sons API] Listening on http://localhost:${config.apiPort} (Storefront=${config.appUrl}, Admin=${config.adminUrl}) — connecting to database...`
      );
    });
    servers.push(apiServer);
  }

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const srv of servers) {
      srv.close();
    }
    if (instance) {
      await instance.close().catch(() => {});
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  process.on('unhandledRejection', reason => {
    console.error('[Seth And Sons API] Unhandled promise rejection:', reason);
  });

  // Connect to MongoDB with automatic retry so Vite never receives dead-socket 502 Bad Gateway
  let attempt = 0;
  while (!shuttingDown && !instance) {
    attempt += 1;
    try {
      const appInstance = await createApp({ config });
      if (shuttingDown) {
        await appInstance.close().catch(() => {});
        break;
      }
      instance = appInstance;
      startupError = null;
      const providerInfo = instance.transport.getSummary();
      const queueStats = await instance.queue.getQueueStats();
      console.log(
        `[Seth And Sons API] Ready (email=${providerInfo.mode}, queue=${queueStats.backend}, database=mongodb-connected)`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      startupError = msg;
      console.error(`[Seth And Sons API] Database connection attempt #${attempt} failed: ${msg}`);
      if (/whitelist|ReplicaSetNoPrimary|ServerSelection/i.test(msg)) {
        console.error(
          '  -> Check internet access and confirm your current IP address is whitelisted in MongoDB Atlas Network Access.'
        );
      }
      if (config.isProduction && attempt >= 6) {
        console.error('[Seth And Sons API] Exhausted production startup retries. Exiting.');
        await shutdown();
        process.exit(1);
      }
      await delay(5000);
    }
  }
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
