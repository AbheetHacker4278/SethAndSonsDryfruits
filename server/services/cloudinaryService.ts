import { v2 as cloudinary } from 'cloudinary';
import path from 'node:path';
import crypto from 'node:crypto';
import { AppConfig } from '../config.ts';

export interface UploadMediaResult {
  url: string;
  publicId: string;
  format?: string;
  bytes?: number;
}

export interface MediaConnectionStatus {
  ok: boolean;
  configured: boolean;
  latencyMs: number;
  detail: string;
}

export interface MediaStorageService {
  isConfigured(): boolean;
  verifyConnection?(): Promise<MediaConnectionStatus>;
  uploadBuffer(opts: {
    buffer: Buffer;
    filename: string;
    folder: string;
    mimeType?: string;
    resourceType?: 'image' | 'raw' | 'video' | 'auto';
  }): Promise<UploadMediaResult>;
  isAllowedMediaUrl?(url: string): boolean;
  deleteAsset?(opts: {
    url?: string;
    publicId?: string;
    resourceType?: 'image' | 'raw' | 'video';
  }): Promise<boolean>;
  downloadAsset?(opts: {
    url: string;
    publicId?: string;
    resourceType?: 'image' | 'raw' | 'video';
    format?: string;
  }): Promise<{ buffer: Buffer; contentType: string }>;
}

function parseCloudinaryCredentials(config: AppConfig): {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
} | null {
  if (config.cloudinaryCloudName && config.cloudinaryApiKey && config.cloudinaryApiSecret) {
    return {
      cloudName: config.cloudinaryCloudName,
      apiKey: config.cloudinaryApiKey,
      apiSecret: config.cloudinaryApiSecret,
    };
  }
  if (config.cloudinaryUrl) {
    try {
      const parsed = new URL(config.cloudinaryUrl);
      if (parsed.protocol === 'cloudinary:' && parsed.username && parsed.password && parsed.hostname) {
        return {
          cloudName: parsed.hostname,
          apiKey: decodeURIComponent(parsed.username),
          apiSecret: decodeURIComponent(parsed.password),
        };
      }
    } catch {
      // invalid CLOUDINARY_URL format
    }
  }
  return null;
}

export function createCloudinaryStorage(config: AppConfig): MediaStorageService {
  const creds = parseCloudinaryCredentials(config);

  return {
    isConfigured() {
      return Boolean(creds);
    },

    async verifyConnection(): Promise<MediaConnectionStatus> {
      const started = Date.now();
      if (!creds) {
        return {
          ok: false,
          configured: false,
          latencyMs: 0,
          detail: 'Cloudinary credentials are not configured.',
        };
      }
      try {
        cloudinary.config({
          cloud_name: creds.cloudName,
          api_key: creds.apiKey,
          api_secret: creds.apiSecret,
          secure: true,
        });
        const pingRes = (await Promise.race([
          cloudinary.api.ping(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Cloudinary ping timed out')), 4500)
          ),
        ])) as { status?: string } | undefined;
        const ok = pingRes?.status === 'ok';
        return {
          ok,
          configured: true,
          latencyMs: Date.now() - started,
          detail: ok
            ? 'Cloudinary Admin ping OK (uploads & signed PDF proxy ready)'
            : 'Cloudinary ping returned unexpected response.',
        };
      } catch (err) {
        return {
          ok: false,
          configured: true,
          latencyMs: Date.now() - started,
          detail: err instanceof Error ? err.message : 'Cloudinary connection check failed.',
        };
      }
    },

    async uploadBuffer(opts) {
      if (!creds) {
        const err = new Error(
          'Cloudinary storage is not configured. Please provide CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your .env file.'
        ) as Error & { statusCode?: number };
        err.statusCode = 503;
        throw err;
      }

      cloudinary.config({
        cloud_name: creds.cloudName,
        api_key: creds.apiKey,
        api_secret: creds.apiSecret,
        secure: true,
      });

      const ext = path.extname(opts.filename || '').toLowerCase();
      const baseName = path
        .basename(opts.filename || 'asset', ext)
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 40);
      const rawSuffix =
        opts.resourceType === 'raw' && ext && /^[.][a-z0-9]{1,8}$/.test(ext) ? ext : '';
      const publicId = `${baseName || 'media'}_${crypto.randomUUID().slice(0, 8)}${rawSuffix}`;

      return new Promise<UploadMediaResult>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `asulesh-seth/${opts.folder}`,
            public_id: publicId,
            resource_type: opts.resourceType || 'auto',
          },
          (error, result) => {
            if (error || !result?.secure_url) {
              reject(error || new Error('Cloudinary upload returned no URL.'));
              return;
            }
            resolve({
              url: result.secure_url,
              publicId: result.public_id,
              format: result.format,
              bytes: result.bytes,
            });
          }
        );

        stream.end(opts.buffer);
      });
    },

    isAllowedMediaUrl(rawUrl) {
      if (!creds) return false;
      try {
        const parsed = new URL(rawUrl);
        return (
          parsed.protocol === 'https:' &&
          parsed.hostname === 'res.cloudinary.com' &&
          parsed.pathname.startsWith(`/${creds.cloudName}/`)
        );
      } catch {
        return false;
      }
    },

    async deleteAsset(opts) {
      if (!creds) return false;
      try {
        cloudinary.config({
          cloud_name: creds.cloudName,
          api_key: creds.apiKey,
          api_secret: creds.apiSecret,
          secure: true,
        });
        let publicId = opts.publicId;
        if (!publicId && opts.url) {
          const m = opts.url.match(
            /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|raw|video)\/(?:upload|authenticated|private)\/(?:v\d+\/)?([^?]+)/
          );
          if (m) {
            publicId = decodeURIComponent(m[2]).replace(/\.[^/.]+$/, '');
          }
        }
        if (!publicId) return false;
        const res = (await cloudinary.uploader.destroy(publicId, {
          resource_type: opts.resourceType || 'image',
          invalidate: true,
        })) as { result?: string } | undefined;
        return res?.result === 'ok';
      } catch {
        return false;
      }
    },

    async downloadAsset(opts) {
      const candidateUrls: string[] = [];
      let parsedPublicId = opts.publicId || '';
      let parsedResourceType = opts.resourceType || 'raw';
      let parsedFormat = (opts.format || '').replace(/^\./, '').toLowerCase();

      if (opts.url) {
        const m = opts.url.match(
          /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|raw|video)\/(?:upload|authenticated|private)\/(?:v\d+\/)?([^?]+)/
        );
        if (m) {
          if (!opts.resourceType) parsedResourceType = m[1] as 'image' | 'raw' | 'video';
          if (!parsedPublicId) parsedPublicId = decodeURIComponent(m[2]);
        }
      }

      if (!parsedFormat && parsedPublicId) {
        parsedFormat = path.extname(parsedPublicId).replace(/^\./, '').toLowerCase();
      }
      if (!parsedFormat) {
        parsedFormat = 'bin';
      }

      if (creds && parsedPublicId) {
        cloudinary.config({
          cloud_name: creds.cloudName,
          api_key: creds.apiKey,
          api_secret: creds.apiSecret,
          secure: true,
        });
        const ext = path.extname(parsedPublicId);
        const pidForSign =
          parsedResourceType !== 'raw' && ext ? parsedPublicId.slice(0, -ext.length) : parsedPublicId;
        const privUrl = cloudinary.utils.private_download_url(pidForSign, parsedFormat, {
          resource_type: parsedResourceType,
          type: 'upload',
          expires_at: Math.floor(Date.now() / 1000) + 300,
        });
        candidateUrls.push(privUrl);
      }

      if (opts.url) {
        candidateUrls.push(opts.url);
      }

      let lastStatus = 502;
      for (const target of candidateUrls) {
        try {
          const res = await fetch(target);
          if (res.ok) {
            const buffer = Buffer.from(await res.arrayBuffer());
            const contentType = res.headers.get('content-type') || 'application/octet-stream';
            return { buffer, contentType };
          }
          lastStatus = res.status;
        } catch {
          // try fallback URL
        }
      }

      const err = new Error(`Unable to retrieve stored document (HTTP ${lastStatus}).`) as Error & {
        statusCode?: number;
      };
      err.statusCode = lastStatus === 404 ? 404 : 502;
      throw err;
    },
  };
}

