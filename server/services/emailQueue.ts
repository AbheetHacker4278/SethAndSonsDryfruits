import crypto from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { AppConfig } from '../config.ts';
import { MongoDatabase } from '../db/mongo.ts';
import { normalizeEmail } from '../utils/crypto.ts';
import { EmailTransport } from './emailProvider.ts';

export interface EnqueueEmailInput {
  recipient: string;
  customerId?: string | null;
  emailType: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  relatedOrderId?: string | null;
  campaignId?: string | null;
  idempotencyKey?: string;
  scheduledAt?: string;
}

export interface EmailQueueService {
  enqueue(input: EnqueueEmailInput): Promise<{ logId: string; jobId: string | null; deduplicated: boolean; status: string }>;
  processDueJobs(limit?: number): Promise<number>;
  processJobNow(jobId: string): Promise<boolean>;
  cancelCampaignJobs(campaignId: string): Promise<number>;
  retryJob(jobId: string): Promise<boolean>;
  getQueueStats(): Promise<{
    backend: 'bullmq-redis' | 'mongodb-persistent';
    pending: number;
    processing: number;
    failed: number;
    completed: number;
    cancelled: number;
  }>;
  startWorker(intervalMs?: number): void;
  stopWorker(): Promise<void>;
}

export function createEmailQueue(
  db: MongoDatabase,
  config: AppConfig,
  transport: EmailTransport
): EmailQueueService {
  let timer: NodeJS.Timeout | null = null;
  let isProcessing = false;
  let bullQueue: Queue | null = null;
  let bullWorker: Worker | null = null;
  let redisConn: IORedis | null = null;

  const useRedis = Boolean(config.redisUrl);

  async function syncCampaignProgress(campaignId: string | null | undefined, succeeded: boolean): Promise<void> {
    if (!campaignId) return;
    const now = new Date().toISOString();
    await db.models.MarketingCampaign.updateOne(
      { id: campaignId },
      {
        $inc: succeeded ? { sentCount: 1 } : { failedCount: 1 },
        $set: { updatedAt: now },
      }
    );

    const remaining = await db.models.EmailJob.countDocuments({
      campaignId,
      status: { $in: ['pending', 'processing'] },
    });

    if (remaining === 0) {
      const camp = await db.models.MarketingCampaign.findOne({ id: campaignId }).lean();
      if (camp && ['scheduled', 'sending'].includes(camp.status)) {
        await db.models.MarketingCampaign.updateOne(
          { id: campaignId },
          {
            $set: {
              status: 'sent',
              sentAt: camp.sentAt || now,
              updatedAt: now,
            },
          }
        );
      }
    }
  }

  async function executeEmailLog(logId: string, jobId?: string): Promise<void> {
    const log = await db.models.EmailLog.findOne({ id: logId }).lean();
    if (!log) return;

    if (log.status === 'sent' || log.status === 'delivered' || log.status === 'suppressed') {
      if (jobId) {
        await db.models.EmailJob.updateOne(
          { id: jobId },
          { $set: { status: 'completed', updatedAt: new Date().toISOString() } }
        );
      }
      return;
    }

    const cleanRecipient = normalizeEmail(log.recipient);
    const suppressed = await db.models.EmailSuppression.findOne({ email: cleanRecipient }).lean();

    const now = new Date().toISOString();
    if (suppressed) {
      await db.models.EmailLog.updateOne(
        { id: log.id },
        {
          $set: {
            status: 'suppressed',
            errorMessage: `Suppressed (${suppressed.reason}): ${suppressed.details || 'Address blocked'}`,
            updatedAt: now,
          },
        }
      );
      if (jobId) {
        await db.models.EmailJob.updateOne(
          { id: jobId },
          { $set: { status: 'completed', updatedAt: now } }
        );
      }
      await syncCampaignProgress(log.campaignId, false);
      return;
    }

    let headers: Record<string, string> | undefined;
    if (jobId) {
      const jobRow = await db.models.EmailJob.findOne({ id: jobId }).lean();
      if (jobRow?.payload && typeof jobRow.payload === 'object') {
        headers = (jobRow.payload as { headers?: Record<string, string> }).headers;
      }
    }

    const nextAttempt = (log.attempts || 0) + 1;

    try {
      const result = await transport.send({
        to: cleanRecipient,
        subject: log.subject,
        html: log.htmlBody || '',
        text: log.textBody || '',
        headers,
        idempotencyKey: log.idempotencyKey || undefined,
      });

      const sentAt = new Date().toISOString();
      await db.models.EmailLog.updateOne(
        { id: log.id },
        {
          $set: {
            status: 'sent',
            provider: result.provider,
            providerMessageId: result.messageId,
            previewUrl: result.previewUrl || null,
            attempts: nextAttempt,
            errorMessage: null,
            sentAt,
            updatedAt: sentAt,
          },
        }
      );

      if (jobId) {
        await db.models.EmailJob.updateOne(
          { id: jobId },
          { $set: { status: 'completed', attempts: nextAttempt, lastError: null, updatedAt: sentAt } }
        );
      }

      await syncCampaignProgress(log.campaignId, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errTime = new Date().toISOString();
      const maxAttempts = 5;
      const delayMs = Math.min(5000 * Math.pow(2, nextAttempt - 1), 300_000);
      const nextRunAt = new Date(Date.now() + delayMs).toISOString();
      const exhausted = nextAttempt >= maxAttempts;

      await db.models.EmailLog.updateOne(
        { id: log.id },
        {
          $set: {
            status: exhausted ? 'failed' : 'queued',
            attempts: nextAttempt,
            errorMessage: message,
            updatedAt: errTime,
          },
        }
      );

      if (jobId) {
        await db.models.EmailJob.updateOne(
          { id: jobId },
          {
            $set: {
              status: exhausted ? 'failed' : 'pending',
              attempts: nextAttempt,
              lastError: message,
              nextRunAt,
              updatedAt: errTime,
            },
          }
        );
      }

      if (exhausted) {
        await syncCampaignProgress(log.campaignId, false);
      }
      if (useRedis) {
        throw err;
      }
    }
  }

  if (useRedis) {
    redisConn = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
    bullQueue = new Queue('asulesh-email-queue', { connection: redisConn as unknown as any });
  }

  return {
    async enqueue(input: EnqueueEmailInput) {
      const cleanRecipient = normalizeEmail(input.recipient);
      const now = new Date().toISOString();

      if (input.idempotencyKey) {
        const existing = await db.models.EmailLog.findOne({ idempotencyKey: input.idempotencyKey }).lean();
        if (existing) {
          return {
            logId: existing.id,
            jobId: null,
            deduplicated: true,
            status: existing.status,
          };
        }
      }

      const logId = `elog_${crypto.randomUUID()}`;
      const jobId = `ejob_${crypto.randomUUID()}`;
      const nextRunAt = input.scheduledAt || now;
      const providerLabel = transport.getSummary().mode;

      await db.models.EmailLog.create({
        id: logId,
        idempotencyKey: input.idempotencyKey || undefined,
        recipient: cleanRecipient,
        customerId: input.customerId || null,
        emailType: input.emailType,
        subject: input.subject,
        htmlBody: input.html,
        textBody: input.text,
        provider: providerLabel,
        relatedOrderId: input.relatedOrderId || null,
        campaignId: input.campaignId || null,
        status: 'queued',
        attempts: 0,
        scheduledAt: input.scheduledAt || null,
        createdAt: now,
        updatedAt: now,
      });

      await db.models.EmailJob.create({
        id: jobId,
        idempotencyKey: input.idempotencyKey || undefined,
        emailLogId: logId,
        jobType: input.emailType,
        payload: { headers: input.headers || {} },
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
        nextRunAt,
        campaignId: input.campaignId || null,
        createdAt: now,
        updatedAt: now,
      });

      if (bullQueue) {
        const delay = input.scheduledAt
          ? Math.max(0, new Date(input.scheduledAt).getTime() - Date.now())
          : 0;
        await bullQueue.add(
          input.emailType,
          { logId, jobId },
          {
            jobId,
            delay,
            attempts: 5,
            backoff: { type: 'exponential', delay: 5000 },
          }
        );
      }

      return { logId, jobId, deduplicated: false, status: 'queued' };
    },

    async processDueJobs(limit = 25): Promise<number> {
      if (isProcessing) return 0;
      isProcessing = true;
      let processed = 0;

      try {
        const now = new Date().toISOString();
        const dueJobs = await db.models.EmailJob.find({
          status: 'pending',
          nextRunAt: { $lte: now },
        })
          .sort({ nextRunAt: 1, createdAt: 1 })
          .limit(limit)
          .lean();

        for (const job of dueJobs) {
          const claimed = await db.models.EmailJob.findOneAndUpdate(
            { id: job.id, status: 'pending' },
            { $set: { status: 'processing', updatedAt: new Date().toISOString() } },
            { new: true }
          ).lean();

          if (!claimed) continue;

          if (claimed.campaignId) {
            const camp = await db.models.MarketingCampaign.findOne({ id: claimed.campaignId }).lean();
            if (camp?.status === 'cancelled') {
              await db.models.EmailJob.updateOne(
                { id: claimed.id },
                { $set: { status: 'cancelled', updatedAt: new Date().toISOString() } }
              );
              continue;
            }
          }

          await executeEmailLog(claimed.emailLogId, claimed.id);
          processed += 1;
        }
      } catch (err) {
        console.error(
          '[EmailQueue] processDueJobs failed:',
          err instanceof Error ? err.message : err
        );
      } finally {
        isProcessing = false;
      }

      return processed;
    },

    async processJobNow(jobId: string): Promise<boolean> {
      const claimed = await db.models.EmailJob.findOneAndUpdate(
        { id: jobId, status: 'pending' },
        { $set: { status: 'processing', updatedAt: new Date().toISOString() } },
        { new: true }
      ).lean();

      if (!claimed) return false;
      await executeEmailLog(claimed.emailLogId, claimed.id);
      return true;
    },

    async cancelCampaignJobs(campaignId: string): Promise<number> {
      const now = new Date().toISOString();
      const pendingJobs = await db.models.EmailJob.find({ campaignId, status: 'pending' }).lean();

      if (bullQueue) {
        for (const job of pendingJobs) {
          const bullJob = await bullQueue.getJob(job.id);
          if (bullJob) await bullJob.remove().catch(() => {});
        }
      }

      const res = await db.models.EmailJob.updateMany(
        { campaignId, status: 'pending' },
        { $set: { status: 'cancelled', updatedAt: now } }
      );

      for (const job of pendingJobs) {
        await db.models.EmailLog.updateOne(
          { id: job.emailLogId, status: 'queued' },
          {
            $set: {
              status: 'failed',
              errorMessage: 'Campaign cancelled before execution',
              updatedAt: now,
            },
          }
        );
      }

      return Number(res.modifiedCount || 0);
    },

    async retryJob(jobId: string): Promise<boolean> {
      const now = new Date().toISOString();
      const job = await db.models.EmailJob.findOne({ id: jobId }).lean();
      if (!job) return false;

      await db.models.EmailJob.updateOne(
        { id: job.id },
        { $set: { status: 'pending', nextRunAt: now, lastError: null, updatedAt: now } }
      );
      await db.models.EmailLog.updateOne(
        { id: job.emailLogId },
        { $set: { status: 'queued', errorMessage: null, updatedAt: now } }
      );

      if (bullQueue) {
        await bullQueue.add('retry', { logId: job.emailLogId, jobId: job.id }, { attempts: 5 });
      } else {
        await this.processDueJobs(5);
      }
      return true;
    },

    async getQueueStats() {
      const rows = await db.models.EmailJob.aggregate([
        { $group: { _id: '$status', cnt: { $sum: 1 } } },
      ]);
      const map: Record<string, number> = {};
      for (const r of rows) map[String(r._id)] = Number(r.cnt || 0);

      return {
        backend: useRedis ? 'bullmq-redis' : 'mongodb-persistent',
        pending: map.pending || 0,
        processing: map.processing || 0,
        failed: map.failed || 0,
        completed: map.completed || 0,
        cancelled: map.cancelled || 0,
      };
    },

    startWorker(intervalMs = 2000) {
      if (useRedis && redisConn && !bullWorker) {
        bullWorker = new Worker(
          'asulesh-email-queue',
          async job => {
            const { logId, jobId } = job.data as { logId: string; jobId: string };
            await executeEmailLog(logId, jobId);
          },
          { connection: redisConn as unknown as any }
        );
        return;
      }

      if (!timer) {
        timer = setInterval(() => {
          void this.processDueJobs(25).catch(err => {
            console.error('[EmailQueue] background poll error:', err instanceof Error ? err.message : err);
          });
        }, intervalMs);
        timer.unref?.();
      }
    },

    async stopWorker() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (bullWorker) {
        await bullWorker.close();
        bullWorker = null;
      }
      if (bullQueue) {
        await bullQueue.close();
        bullQueue = null;
      }
      if (redisConn) {
        await redisConn.quit();
        redisConn = null;
      }
    },
  };
}
