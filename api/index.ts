import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp, type AppInstance } from '../server/app.ts';

let appInstance: AppInstance | null = null;
let initPromise: Promise<AppInstance> | null = null;

async function getApp(): Promise<AppInstance> {
  if (appInstance) return appInstance;
  if (!initPromise) {
    initPromise = createApp({ startQueueWorker: false });
  }
  appInstance = await initPromise;
  return appInstance;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const instance = await getApp();
    return instance.app(req, res);
  } catch (err) {
    console.error('[Vercel Serverless Function Error]:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'Serverless initialization failed',
        details: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

