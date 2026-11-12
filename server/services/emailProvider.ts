import crypto from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import { AppConfig } from '../config.ts';

export interface OutboundEmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

export interface EmailSendResult {
  provider: string;
  messageId: string;
  previewUrl?: string;
}

export interface EmailConnectionStatus {
  ok: boolean;
  provider: string;
  mode: string;
  latencyMs: number;
  detail: string;
}

export interface EmailTransport {
  send(payload: OutboundEmailPayload): Promise<EmailSendResult>;
  verifyConnection?(): Promise<EmailConnectionStatus>;
  getSummary(): {
    provider: string;
    mode: string;
    configured: boolean;
    fromEmail: string;
    hostHint?: string;
    trackingEnabled: boolean;
  };
}

export function createEmailTransport(config: AppConfig): EmailTransport {
  let cachedTransporter: Transporter<SMTPTransport.SentMessageInfo> | null = null;
  let etherealAccount: { user: string; pass: string; host: string; port: number } | null = null;

  async function getSmtpTransporter(): Promise<{
    transporter: Transporter<SMTPTransport.SentMessageInfo>;
    mode: string;
  }> {
    if (config.smtpHost) {
      if (!cachedTransporter) {
        cachedTransporter = nodemailer.createTransport({
          host: config.smtpHost,
          port: config.smtpPort,
          secure: config.smtpSecure,
          auth:
            config.smtpUser && config.smtpPass
              ? { user: config.smtpUser, pass: config.smtpPass }
              : undefined,
        });
      }
      return { transporter: cachedTransporter, mode: 'configured-smtp' };
    }

    if (config.isProduction) {
      throw new Error(
        'SMTP_HOST is not configured in production. Configure SMTP_HOST/SMTP_USER/SMTP_PASS (or switch EMAIL_PROVIDER).'
      );
    }

    if (!etherealAccount) {
      const account = await nodemailer.createTestAccount();
      etherealAccount = {
        user: account.user,
        pass: account.pass,
        host: account.smtp.host,
        port: account.smtp.port,
      };
      cachedTransporter = nodemailer.createTransport({
        host: etherealAccount.host,
        port: etherealAccount.port,
        secure: etherealAccount.port === 465,
        auth: {
          user: etherealAccount.user,
          pass: etherealAccount.pass,
        },
      });
    }

    return { transporter: cachedTransporter!, mode: 'ethereal-smtp-sandbox' };
  }

  async function sendViaBrevo(payload: OutboundEmailPayload): Promise<EmailSendResult> {
    const apiKey =
      config.brevoApiKey ||
      (config.smtpPass.startsWith('xkeysib-') ? config.smtpPass : '');
    if (!apiKey) {
      throw new Error('BREVO_API_KEY (or xkeysib-... API key) is not configured.');
    }

    const body: Record<string, unknown> = {
      sender: {
        name: config.emailFromName,
        email: config.emailFrom,
      },
      to: [{ email: payload.to }],
      replyTo: {
        email: config.emailReplyTo || config.emailFrom,
        name: config.emailFromName,
      },
      subject: payload.subject,
      htmlContent: payload.html || undefined,
      textContent: payload.text || undefined,
    };
    if (payload.headers && Object.keys(payload.headers).length > 0) {
      body.headers = payload.headers;
    }

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string };
    if (!res.ok || !data.messageId) {
      throw new Error(data.message || `Brevo API error (${res.status})`);
    }
    return { provider: 'brevo', messageId: data.messageId };
  }

  async function sendViaResend(payload: OutboundEmailPayload): Promise<EmailSendResult> {
    if (!config.resendApiKey) {
      throw new Error('RESEND_API_KEY is not configured.');
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json',
    };
    if (payload.idempotencyKey) {
      headers['Idempotency-Key'] = payload.idempotencyKey;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: `${config.emailFromName} <${config.emailFrom}>`,
        to: [payload.to],
        reply_to: config.emailReplyTo,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        headers: payload.headers,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !data.id) {
      throw new Error(data.message || `Resend API error (${res.status})`);
    }
    return { provider: 'resend', messageId: data.id };
  }

  function signAwsSesRequest(
    method: 'GET' | 'POST',
    requestPath: string,
    body: string
  ): { endpoint: string; amzDate: string; authorization: string } {
    const region = config.awsSesRegion;
    const host = `email.${region}.amazonaws.com`;
    const endpoint = `https://${host}${requestPath}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = crypto.createHash('sha256').update(body).digest('hex');
    const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-date';
    const canonicalRequest = [
      method,
      requestPath,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const credentialScope = `${dateStamp}/${region}/ses/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const hmac = (key: Buffer | string, data: string) =>
      crypto.createHmac('sha256', key).update(data).digest();
    const kDate = hmac(`AWS4${config.awsSecretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, 'ses');
    const kSigning = hmac(kService, 'aws4_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    return {
      endpoint,
      amzDate,
      authorization: `AWS4-HMAC-SHA256 Credential=${config.awsAccessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
  }

  async function sendViaSes(payload: OutboundEmailPayload): Promise<EmailSendResult> {
    if (!config.awsAccessKeyId || !config.awsSecretAccessKey) {
      throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for SES.');
    }

    const body = JSON.stringify({
      FromEmailAddress: `${config.emailFromName} <${config.emailFrom}>`,
      Destination: { ToAddresses: [payload.to] },
      ReplyToAddresses: [config.emailReplyTo],
      Content: {
        Simple: {
          Subject: { Data: payload.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: payload.html, Charset: 'UTF-8' },
            Text: { Data: payload.text, Charset: 'UTF-8' },
          },
        },
      },
    });

    const signed = signAwsSesRequest('POST', '/v2/email/outbound-emails', body);
    const res = await fetch(signed.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Amz-Date': signed.amzDate,
        Authorization: signed.authorization,
      },
      body,
    });

    const data = (await res.json().catch(() => ({}))) as { MessageId?: string; message?: string };
    if (!res.ok || !data.MessageId) {
      throw new Error(data.message || `AWS SES error (${res.status})`);
    }
    return { provider: 'ses', messageId: data.MessageId };
  }

  return {
    async send(payload: OutboundEmailPayload): Promise<EmailSendResult> {
      if (config.emailProvider === 'brevo') {
        return sendViaBrevo(payload);
      }
      if (config.emailProvider === 'resend') {
        return sendViaResend(payload);
      }
      if (config.emailProvider === 'ses') {
        return sendViaSes(payload);
      }
      if (config.smtpHost.includes('brevo.com') && config.smtpPass.startsWith('xkeysib-')) {
        return sendViaBrevo(payload);
      }

      const { transporter, mode } = await getSmtpTransporter();
      const info = await transporter.sendMail({
        from: `"${config.emailFromName}" <${config.emailFrom}>`,
        to: payload.to,
        replyTo: config.emailReplyTo,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        headers: payload.headers,
      });

      const preview = nodemailer.getTestMessageUrl(info);
      return {
        provider: mode,
        messageId: info.messageId,
        previewUrl: typeof preview === 'string' ? preview : undefined,
      };
    },

    async verifyConnection(): Promise<EmailConnectionStatus> {
      const started = Date.now();
      const summary = this.getSummary();
      try {
        if (summary.provider === 'brevo') {
          const apiKey =
            config.brevoApiKey ||
            (config.smtpPass.startsWith('xkeysib-') ? config.smtpPass : '');
          if (!apiKey) {
            return {
              ok: false,
              provider: 'brevo',
              mode: summary.mode,
              latencyMs: Date.now() - started,
              detail: 'Brevo API key is not configured.',
            };
          }
          const res = await fetch('https://api.brevo.com/v3/account', {
            headers: { 'api-key': apiKey, Accept: 'application/json' },
            signal: AbortSignal.timeout(4500),
          });
          return {
            ok: res.ok,
            provider: 'brevo',
            mode: summary.mode,
            latencyMs: Date.now() - started,
            detail: res.ok
              ? 'Brevo API authenticated & ready for OTP dispatch'
              : `Brevo API rejected authentication (HTTP ${res.status})`,
          };
        }

        if (summary.provider === 'resend') {
          if (!config.resendApiKey) {
            return {
              ok: false,
              provider: 'resend',
              mode: summary.mode,
              latencyMs: Date.now() - started,
              detail: 'Resend API key is missing.',
            };
          }
          const res = await fetch('https://api.resend.com/domains', {
            headers: { Authorization: `Bearer ${config.resendApiKey}` },
            signal: AbortSignal.timeout(4500),
          });
          return {
            ok: res.ok,
            provider: 'resend',
            mode: summary.mode,
            latencyMs: Date.now() - started,
            detail: res.ok
              ? 'Resend API authenticated & reachable'
              : `Resend API check failed (HTTP ${res.status})`,
          };
        }

        if (summary.provider === 'ses') {
          if (!config.awsAccessKeyId || !config.awsSecretAccessKey) {
            return {
              ok: false,
              provider: 'ses',
              mode: summary.mode,
              latencyMs: Date.now() - started,
              detail: 'AWS SES credentials are not configured.',
            };
          }
          const signed = signAwsSesRequest('GET', '/v2/email/account', '');
          const res = await fetch(signed.endpoint, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'X-Amz-Date': signed.amzDate,
              Authorization: signed.authorization,
            },
            signal: AbortSignal.timeout(4500),
          });
          return {
            ok: res.ok,
            provider: 'ses',
            mode: summary.mode,
            latencyMs: Date.now() - started,
            detail: res.ok
              ? 'AWS SES authenticated & reachable'
              : `AWS SES check failed (HTTP ${res.status})`,
          };
        }

        const { transporter, mode } = await getSmtpTransporter();
        await Promise.race([
          transporter.verify(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('SMTP verification timed out')), 4500)
          ),
        ]);
        return {
          ok: true,
          provider: 'smtp',
          mode,
          latencyMs: Date.now() - started,
          detail: `SMTP handshake verified (${mode})`,
        };
      } catch (err) {
        return {
          ok: false,
          provider: summary.provider,
          mode: summary.mode,
          latencyMs: Date.now() - started,
          detail: err instanceof Error ? err.message : 'Email provider check failed.',
        };
      }
    },

    getSummary() {
      const brevoKeyPresent = Boolean(
        config.brevoApiKey ||
          (config.smtpHost.includes('brevo.com') && config.smtpPass.startsWith('xkeysib-'))
      );
      if (
        config.emailProvider === 'brevo' ||
        (config.smtpHost.includes('brevo.com') && config.smtpPass.startsWith('xkeysib-'))
      ) {
        return {
          provider: 'brevo',
          mode: brevoKeyPresent ? 'configured-brevo-api' : 'unconfigured',
          configured: brevoKeyPresent,
          fromEmail: config.emailFrom,
          hostHint: 'api.brevo.com/v3/smtp/email',
          trackingEnabled: config.emailTrackingEnabled,
        };
      }
      if (config.emailProvider === 'resend') {
        return {
          provider: 'resend',
          mode: config.resendApiKey ? 'configured-resend-api' : 'unconfigured',
          configured: Boolean(config.resendApiKey),
          fromEmail: config.emailFrom,
          trackingEnabled: config.emailTrackingEnabled,
        };
      }
      if (config.emailProvider === 'ses') {
        return {
          provider: 'ses',
          mode: config.awsAccessKeyId && config.awsSecretAccessKey ? 'configured-aws-ses' : 'unconfigured',
          configured: Boolean(config.awsAccessKeyId && config.awsSecretAccessKey),
          fromEmail: config.emailFrom,
          hostHint: `email.${config.awsSesRegion}.amazonaws.com`,
          trackingEnabled: config.emailTrackingEnabled,
        };
      }
      const smtpConfigured = Boolean(config.smtpHost);
      return {
        provider: 'smtp',
        mode: smtpConfigured
          ? 'configured-smtp'
          : config.isProduction
          ? 'unconfigured'
          : 'ethereal-smtp-sandbox',
        configured: smtpConfigured || !config.isProduction,
        fromEmail: config.emailFrom,
        hostHint: smtpConfigured
          ? `${config.smtpHost}:${config.smtpPort}`
          : config.isProduction
          ? undefined
          : 'smtp.ethereal.email (auto-sandbox)',
        trackingEnabled: config.emailTrackingEnabled,
      };
    },
  };
}
