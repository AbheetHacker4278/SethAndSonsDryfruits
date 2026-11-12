import crypto from 'node:crypto';
import { BRAND_CONFIG } from '../../shared/catalogSeed.ts';
import { AppConfig } from '../config.ts';
import { MongoDatabase } from '../db/mongo.ts';
import { ctaButtonHtml, wrapInBrandEmailLayout } from '../emails/brandLayout.ts';
import { DEFAULT_EMAIL_TEMPLATES } from '../emails/defaultTemplates.ts';
import { renderEmailFromTemplate } from '../emails/renderer.ts';
import { escapeHtml, generateSecureToken, normalizeEmail, sanitizeEmailHtml } from '../utils/crypto.ts';
import { EmailQueueService } from './emailQueue.ts';

export interface CustomerRecord {
  id: string;
  name: string;
  email: string;
  marketingConsent: number | boolean;
  unsubscribedAt?: string | null;
  emailPreferences: string | Record<string, any>;
}

export interface OrderEmailRecord {
  id: string;
  orderNumber: string;
  customerId: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: number;
  discountAmount: number;
  couponCode?: string | null;
  shippingCharge: number;
  taxAmount: number;
  totalAmount: number;
  deliveryAddress: string | Record<string, unknown>;
  customerSnapshot: string | Record<string, unknown>;
  estimatedDeliveryEstimate?: string | null;
  confirmedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  refundStatus?: string | null;
  refundAmount?: number | null;
  refundReferenceId?: string | null;
  refundDate?: string | null;
  refundBankEta?: string | null;
  createdAt: string;
}

export interface OrderItemRecord {
  productId: string;
  variantId?: string | null;
  weightLabel?: string | null;
  productName: string;
  productImage: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface ShipmentRecord {
  courierPartner: string;
  trackingNumber: string;
  trackingUrl?: string | null;
  dispatchDate: string;
  estimatedDeliveryDate?: string | null;
  shipmentNotes?: string | null;
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount || 0);
}

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function createEmailService(db: MongoDatabase, config: AppConfig, queue: EmailQueueService) {
  function absoluteUrl(pathOrUrl: string | null | undefined): string {
    if (!pathOrUrl) return '';
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      return pathOrUrl;
    }
    const cleanPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    return `${config.appUrl}${cleanPath}`;
  }

  async function getBrandLogoUrl(): Promise<string> {
    const row = await db.models.SiteSetting.findOne({ key: 'brand_logo_url' }).lean();
    let logoPath = BRAND_CONFIG.emailLogoUrl;
    if (row?.value) {
      if (typeof row.value === 'string') {
        try {
          logoPath = JSON.parse(row.value) as string;
        } catch {
          logoPath = row.value;
        }
      }
    }
    if (!logoPath || logoPath === BRAND_CONFIG.logoPath) {
      logoPath = BRAND_CONFIG.emailLogoUrl;
    }
    return absoluteUrl(logoPath);
  }

  async function getTemplate(templateKey: string) {
    const row = await db.models.EmailTemplate.findOne({ templateKey }).lean();
    if (row) return row;
    const fallback = DEFAULT_EMAIL_TEMPLATES.find(t => t.templateKey === templateKey);
    if (!fallback) {
      throw new Error(`Email template "${templateKey}" not found`);
    }
    return {
      ...fallback,
      enabled: true,
    };
  }

  async function issueUnsubscribeUrl(customer: CustomerRecord): Promise<{ url: string; rawToken: string }> {
    const { raw, hash } = generateSecureToken(24);
    const now = new Date().toISOString();
    await db.models.EmailUnsubscribe.create({
      id: `unsub_${crypto.randomUUID()}`,
      customerId: customer.id,
      email: normalizeEmail(customer.email),
      unsubscribeTokenHash: hash,
      createdAt: now,
    });
    return {
      rawToken: raw,
      url: `${config.appUrl}/unsubscribe?token=${encodeURIComponent(raw)}`,
    };
  }

  function formatItemQtyLabel(it: OrderItemRecord): string {
    return it.weightLabel
      ? `${it.quantity} × ${it.weightLabel}`
      : `${it.quantity} ${it.unit === 'gram' ? 'g' : it.unit === 'ml' ? 'ml' : it.unit === 'piece' ? 'pc' : 'kg'}`;
  }

  function buildOrderItemsBlocks(items: OrderItemRecord[]): { html: string; text: string; productNames: string } {
    const rowsHtml = items
      .map(
        it => `<tr>
          <td style="padding:10px 8px;border-bottom:1px solid #eadcbe;font-size:13px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="padding-right:10px;vertical-align:middle;">
                  <img src="${escapeHtml(absoluteUrl(it.productImage))}" alt="${escapeHtml(it.productName)}" width="44" height="44" style="display:block;width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid #d9c48c;" />
                </td>
                <td style="vertical-align:middle;">
                  <div style="font-weight:bold;color:#064e3b;">${escapeHtml(it.productName)}</div>
                  <div style="font-size:12px;color:#5a6860;">${escapeHtml(formatItemQtyLabel(it))} &times; ${escapeHtml(formatINR(it.unitPrice))}</div>
                </td>
              </tr>
            </table>
          </td>
          <td align="right" style="padding:10px 8px;border-bottom:1px solid #eadcbe;font-size:13px;font-weight:bold;color:#064e3b;vertical-align:middle;">
            ${escapeHtml(formatINR(it.subtotal))}
          </td>
        </tr>`
      )
      .join('');

    const html = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #eadcbe;border-collapse:collapse;">
      <tr style="background-color:#fbf8f1;">
        <th align="left" style="padding:8px;font-size:11px;text-transform:uppercase;color:#6c7a72;letter-spacing:1px;">Item</th>
        <th align="right" style="padding:8px;font-size:11px;text-transform:uppercase;color:#6c7a72;letter-spacing:1px;">Subtotal</th>
      </tr>
      ${rowsHtml}
    </table>`;

    const text = items
      .map(
        it =>
          `- ${it.productName} (${formatItemQtyLabel(it)} @ ${formatINR(it.unitPrice)}) = ${formatINR(it.subtotal)}`
      )
      .join('\n');

    return {
      html,
      text,
      productNames: items.map(i => i.productName).join(', '),
    };
  }

  function parseAddressString(addressRaw: string | Record<string, unknown>): string {
    try {
      const a = (typeof addressRaw === 'string' ? JSON.parse(addressRaw) : addressRaw) as {
        deliveryAddress?: string;
        addressLine?: string;
        city?: string;
        state?: string;
        pincode?: string;
      };
      return [a.deliveryAddress || a.addressLine, a.city, a.state, a.pincode].filter(Boolean).join(', ');
    } catch {
      return typeof addressRaw === 'string' ? addressRaw : '';
    }
  }

  async function getOrderCustomer(order: OrderEmailRecord): Promise<{ id: string; name: string; email: string }> {
    const dbCust = await db.models.Customer.findOne(
      { id: order.customerId },
      { id: 1, name: 1, email: 1, _id: 0 }
    ).lean();
    if (dbCust) return dbCust as { id: string; name: string; email: string };

    try {
      const snap = (
        typeof order.customerSnapshot === 'string'
          ? JSON.parse(order.customerSnapshot)
          : order.customerSnapshot
      ) as { id?: string; name?: string; email?: string };
      return {
        id: snap.id || order.customerId,
        name: snap.name || 'Valued Patron',
        email: snap.email || '',
      };
    } catch {
      return { id: order.customerId, name: 'Valued Patron', email: '' };
    }
  }

  async function getOrderItems(orderId: string): Promise<OrderItemRecord[]> {
    const items = await db.models.OrderItem.find(
      { orderId },
      { productId: 1, variantId: 1, weightLabel: 1, productName: 1, productImage: 1, unit: 1, unitPrice: 1, quantity: 1, subtotal: 1, _id: 0 }
    ).lean();
    return items as unknown as OrderItemRecord[];
  }

  function customerAllowsMarketing(
    customer: CustomerRecord,
    prefKey: 'newProductAnnouncements' | 'festivalOffers' | 'promotionalDiscounts' | 'specialCampaigns' | 'newsletter'
  ): boolean {
    if (!customer.marketingConsent || customer.unsubscribedAt) return false;
    try {
      const prefs = (
        typeof customer.emailPreferences === 'string'
          ? JSON.parse(customer.emailPreferences)
          : customer.emailPreferences
      ) as { marketing?: Record<string, boolean> };
      if (prefs?.marketing && prefKey in prefs.marketing) {
        return Boolean(prefs.marketing[prefKey]);
      }
    } catch {
      // ignore parse fallback
    }
    return true;
  }

  async function queueRenderedTemplate(opts: {
    templateKey: string;
    recipient: string;
    customerId?: string | null;
    variables: Record<string, string>;
    rawHtmlBlocks?: Record<string, string>;
    ctaLabel?: string;
    ctaUrl?: string;
    relatedOrderId?: string | null;
    campaignId?: string | null;
    idempotencyKey?: string;
    scheduledAt?: string;
    unsubscribeCustomer?: CustomerRecord;
    forceEnabled?: boolean;
  }) {
    const tpl = await getTemplate(opts.templateKey);
    if (!tpl.enabled && !opts.forceEnabled) {
      return { skipped: true, reason: 'Template disabled by admin' };
    }

    let unsubscribeUrl = '';
    const headers: Record<string, string> = {};
    if (tpl.category === 'marketing' && opts.unsubscribeCustomer) {
      const unsub = await issueUnsubscribeUrl(opts.unsubscribeCustomer);
      unsubscribeUrl = unsub.url;
      headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }

    const brandLogoUrl = await getBrandLogoUrl();
    const rendered = renderEmailFromTemplate(tpl.subject, tpl.htmlContent, tpl.textContent, {
      variables: opts.variables,
      rawHtmlBlocks: opts.rawHtmlBlocks,
      ctaLabel: opts.ctaLabel,
      ctaUrl: opts.ctaUrl,
      brandLogoUrl,
      isMarketing: tpl.category === 'marketing',
      unsubscribeUrl,
      preferencesUrl: `${config.appUrl}/account?tab=preferences`,
    });

    const res = await queue.enqueue({
      recipient: opts.recipient,
      customerId: opts.customerId,
      emailType: opts.templateKey,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers,
      relatedOrderId: opts.relatedOrderId,
      campaignId: opts.campaignId,
      idempotencyKey: opts.idempotencyKey,
      scheduledAt: opts.scheduledAt,
    });

    if (!opts.scheduledAt && res.jobId) {
      await queue.processJobNow(res.jobId);
    }

    return { skipped: false, ...res };
  }

  return {
    async sendVerificationEmail(
      customer: { id: string; name: string; email: string },
      rawToken: string,
      targetEmail?: string,
      purpose: 'email_verify' | 'email_change' = 'email_verify'
    ) {
      const recipient = targetEmail || customer.email;
      const verificationUrl = `${config.appUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;
      const isEmailChange = purpose === 'email_change';
      return queueRenderedTemplate({
        templateKey: isEmailChange ? 'email_change_verification' : 'email_verification',
        recipient,
        customerId: customer.id,
        variables: {
          customer_name: customer.name,
          customer_email: customer.email,
          new_email: recipient,
          verification_url: verificationUrl,
        },
        ctaLabel: isEmailChange ? 'Confirm New Email Address' : 'Verify Email Address',
        ctaUrl: verificationUrl,
        idempotencyKey: `${isEmailChange ? 'emailchg' : 'verify'}_${customer.id}_${crypto.createHash('sha256').update(rawToken).digest('hex').slice(0, 12)}`,
        forceEnabled: true,
      });
    },

    async sendWelcomeEmail(customer: { id: string; name: string; email: string }) {
      return queueRenderedTemplate({
        templateKey: 'welcome',
        recipient: customer.email,
        customerId: customer.id,
        variables: {
          customer_name: customer.name,
          customer_email: customer.email,
        },
        ctaLabel: 'Explore Jammu Harvests',
        ctaUrl: `${config.appUrl}/catalog`,
        idempotencyKey: `welcome_${customer.id}`,
      });
    },

    async sendPasswordResetEmail(customer: { id: string; name: string; email: string }, rawToken: string) {
      const resetUrl = `${config.appUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
      return queueRenderedTemplate({
        templateKey: 'password_reset',
        recipient: customer.email,
        customerId: customer.id,
        variables: {
          customer_name: customer.name,
          customer_email: customer.email,
          reset_url: resetUrl,
        },
        ctaLabel: 'Reset Password',
        ctaUrl: resetUrl,
        idempotencyKey: `pwreset_${customer.id}_${crypto.createHash('sha256').update(rawToken).digest('hex').slice(0, 12)}`,
        forceEnabled: true,
      });
    },

    async sendAdminWelcomeEmail(admin: {
      id: string;
      name: string;
      email: string;
      adminRole: string;
      permissions: string[];
    }) {
      const adminPortalUrl = `${config.adminUrl}/admin/login`;
      const assignedRole = admin.adminRole === 'super_admin' ? 'Super Admin' : 'Store Staff';
      const permissionsList =
        admin.adminRole === 'super_admin'
          ? 'All Administrative Modules (Full Access)'
          : admin.permissions.length > 0
            ? admin.permissions.join(', ')
            : 'Dashboard & Orders';

      return queueRenderedTemplate({
        templateKey: 'admin_welcome',
        recipient: admin.email,
        customerId: admin.id,
        variables: {
          admin_name: admin.name || 'Administrator',
          admin_email: admin.email,
          assigned_role: assignedRole,
          permissions_list: permissionsList,
          admin_portal_url: adminPortalUrl,
        },
        ctaLabel: 'Sign In to Admin Portal',
        ctaUrl: adminPortalUrl,
        idempotencyKey: `admin_welcome_${admin.id}`,
        forceEnabled: true,
      });
    },

    async sendAdminLoginOtpEmail(
      admin: { id: string; name: string; email: string },
      otpCode: string,
      expiresMinutes = 10
    ) {
      const adminPortalUrl = `${config.adminUrl}/admin/login`;
      return queueRenderedTemplate({
        templateKey: 'admin_login_otp',
        recipient: admin.email,
        customerId: admin.id,
        variables: {
          admin_name: admin.name || 'Administrator',
          admin_email: admin.email,
          otp_code: otpCode,
          expires_minutes: String(expiresMinutes),
          admin_portal_url: adminPortalUrl,
        },
        ctaLabel: 'Open Admin Portal',
        ctaUrl: adminPortalUrl,
        idempotencyKey: `admin_otp_${admin.id}_${crypto.createHash('sha256').update(`${otpCode}:${Date.now()}`).digest('hex').slice(0, 12)}`,
        forceEnabled: true,
      });
    },

    async sendPasswordChangedEmail(customer: { id: string; name: string; email: string }) {
      return queueRenderedTemplate({
        templateKey: 'password_changed',
        recipient: customer.email,
        customerId: customer.id,
        variables: {
          customer_name: customer.name,
          customer_email: customer.email,
        },
        ctaLabel: 'Manage Account & Security',
        ctaUrl: `${config.appUrl}/account`,
        forceEnabled: true,
      });
    },

    async sendAdminOrderAlertEmail(order: OrderEmailRecord) {
      const cust = await getOrderCustomer(order);
      const items = await getOrderItems(order.id);
      const blocks = buildOrderItemsBlocks(items);
      const addressStr = parseAddressString(order.deliveryAddress);
      const adminEmail = normalizeEmail(config.adminSeedEmail);
      const adminUser = await db.models.Customer.findOne(
        { email: adminEmail, role: 'admin' },
        { id: 1, name: 1, email: 1, _id: 0 }
      ).lean();

      const adminPortalOrdersUrl = `${config.adminUrl}/admin/orders`;
      return queueRenderedTemplate({
        templateKey: 'admin_order_alert',
        recipient: adminUser?.email || adminEmail,
        customerId: adminUser?.id || null,
        relatedOrderId: order.orderNumber,
        variables: {
          admin_name: adminUser?.name || 'Administrator',
          admin_email: adminUser?.email || adminEmail,
          order_id: order.orderNumber,
          order_date: formatDate(order.createdAt),
          customer_name: cust.name,
          customer_email: cust.email || '—',
          order_total: formatINR(order.totalAmount),
          payment_method: order.paymentMethod || 'Online / COD',
          delivery_address: addressStr,
          order_items_text: blocks.text,
          admin_portal_url: adminPortalOrdersUrl,
        },
        rawHtmlBlocks: {
          order_items_html: blocks.html,
        },
        ctaLabel: 'Review Order in Admin Portal',
        ctaUrl: adminPortalOrdersUrl,
        idempotencyKey: `admin_order_alert_${order.orderNumber}`,
      });
    },

    async sendSupportTicketAckEmail(ticket: {
      ticketNumber: string;
      customerId?: string | null;
      name: string;
      email: string;
      category: string;
      subject: string;
      attachmentCount: number;
    }) {
      const trackUrl = `${config.appUrl}/customer-service?ticket=${encodeURIComponent(ticket.ticketNumber)}&email=${encodeURIComponent(ticket.email)}`;
      return queueRenderedTemplate({
        templateKey: 'customer_service_ack',
        recipient: ticket.email,
        customerId: ticket.customerId || null,
        relatedOrderId: ticket.ticketNumber,
        variables: {
          customer_name: ticket.name,
          customer_email: ticket.email,
          ticket_number: ticket.ticketNumber,
          ticket_category: ticket.category,
          ticket_subject: ticket.subject,
          attachment_count: `${ticket.attachmentCount} file(s)`,
        },
        ctaLabel: 'Track Your Complaint',
        ctaUrl: trackUrl,
        idempotencyKey: `support_ack_${ticket.ticketNumber}`,
      });
    },

    async sendSupportAdminAlertEmail(ticket: {
      ticketNumber: string;
      name: string;
      email: string;
      category: string;
      subject: string;
      description: string;
      attachments?: Array<{ id?: string; filename: string; mimeType: string; sizeBytes: number; url: string }>;
      isFollowUp?: boolean;
      eventId?: string;
    }) {
      const adminEmail = normalizeEmail(config.adminSeedEmail);
      const adminUser = await db.models.Customer.findOne(
        { email: adminEmail, role: 'admin' },
        { id: 1, name: 1, email: 1, _id: 0 }
      ).lean();

      const adminSupportUrl = `${config.adminUrl}/admin/support`;
      const atts = ticket.attachments || [];
      const linkForAtt = (a: { id?: string; url: string }) =>
        a.id
          ? `${config.appUrl}/api/support/${encodeURIComponent(ticket.ticketNumber)}/attachments/${encodeURIComponent(a.id)}/file?email=${encodeURIComponent(ticket.email)}&download=1`
          : a.url;
      const attachmentsHtml =
        atts.length > 0
          ? `<div style="margin:12px 0;padding:12px 14px;background-color:#fbf8f1;border:1px solid #eadcbe;border-radius:8px;font-size:12px;">
              <strong style="color:#064e3b;display:block;margin-bottom:6px;">Uploaded Attachments (${atts.length}):</strong>
              <ul style="margin:0;padding-left:18px;line-height:1.7;">
                ${atts
                  .map(
                    a =>
                      `<li><a href="${escapeHtml(linkForAtt(a))}" style="color:#064e3b;font-weight:bold;">${escapeHtml(a.filename)}</a> (${escapeHtml(a.mimeType)})</li>`
                  )
                  .join('')}
              </ul>
            </div>`
          : '';

      return queueRenderedTemplate({
        templateKey: 'admin_support_alert',
        recipient: adminUser?.email || adminEmail,
        customerId: adminUser?.id || null,
        relatedOrderId: ticket.ticketNumber,
        variables: {
          admin_name: adminUser?.name || 'Administrator',
          ticket_number: ticket.ticketNumber,
          customer_name: ticket.name,
          customer_email: ticket.email,
          ticket_category: ticket.category,
          ticket_subject: ticket.isFollowUp ? `[Customer Follow-Up] ${ticket.subject}` : ticket.subject,
          ticket_description: ticket.description,
          attachment_count: `${atts.length} file(s)`,
          admin_portal_url: adminSupportUrl,
        },
        rawHtmlBlocks: {
          support_attachments_html: attachmentsHtml,
        },
        ctaLabel: 'Review Complaint in Admin Portal',
        ctaUrl: adminSupportUrl,
        idempotencyKey: ticket.eventId
          ? `admin_support_${ticket.ticketNumber}_${ticket.eventId}`
          : `admin_support_${ticket.ticketNumber}`,
      });
    },

    async sendSupportCustomReplyEmail(params: {
      ticketId: string;
      ticketNumber: string;
      customerId?: string | null;
      recipientName: string;
      recipientEmail: string;
      category: string;
      ticketSubject: string;
      customSubject: string;
      customMessage: string;
      adminName: string;
      attachments?: Array<{ id?: string; filename: string; mimeType: string; sizeBytes: number; url: string }>;
    }) {
      const brandLogoUrl = await getBrandLogoUrl();
      const safeParagraphs = escapeHtml(params.customMessage.trim()).replace(/\r\n|\r|\n/g, '<br />');
      const supportUrl = `${config.appUrl}/customer-service?ticket=${encodeURIComponent(params.ticketNumber)}&email=${encodeURIComponent(params.recipientEmail)}`;
      const atts = params.attachments || [];
      const linkForAtt = (a: { id?: string; url: string }) =>
        a.id
          ? `${config.appUrl}/api/support/${encodeURIComponent(params.ticketNumber)}/attachments/${encodeURIComponent(a.id)}/file?email=${encodeURIComponent(params.recipientEmail)}&download=1`
          : a.url;
      const adminAttHtml =
        atts.length > 0
          ? `<div style="margin:0 0 18px 0;padding:12px 16px;background-color:#f8f6f0;border:1px solid #eadcbe;border-radius:8px;font-size:12px;">
              <strong style="color:#064e3b;display:block;margin-bottom:6px;">Attached Documents &amp; Files (${atts.length}):</strong>
              <ul style="margin:0;padding-left:18px;line-height:1.7;">
                ${atts
                  .map(
                    a =>
                      `<li><a href="${escapeHtml(linkForAtt(a))}" style="color:#064e3b;font-weight:bold;">${escapeHtml(a.filename)}</a> (${Math.max(1, Math.round((a.sizeBytes || 0) / 1024))} KB)</li>`
                  )
                  .join('')}
              </ul>
            </div>`
          : '';
      const bodyHtml = `<div style="font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#b99225;font-weight:bold;margin-bottom:8px;">Seth And Sons Concierge Response</div>
<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 14px 0;font-size:22px;">${escapeHtml(params.customSubject)}</h2>
<p style="margin:0 0 12px 0;">Dear <strong>${escapeHtml(params.recipientName)}</strong>,</p>
<div style="margin:14px 0 18px 0;padding:16px 18px;background-color:#fbf8f1;border-left:4px solid #c9a23f;font-size:14px;line-height:1.7;color:#1b2621;">
  ${safeParagraphs}
</div>
${adminAttHtml}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4efe4;border:1px solid #eadcbe;margin-bottom:16px;">
  <tr>
    <td style="padding:12px 16px;font-size:12px;color:#4a5951;line-height:1.6;">
      <div><strong>Support Ticket:</strong> #${escapeHtml(params.ticketNumber)} (${escapeHtml(params.category)})</div>
      <div><strong>Original Issue:</strong> ${escapeHtml(params.ticketSubject)}</div>
      <div><strong>Concierge Representative:</strong> ${escapeHtml(params.adminName)}</div>
    </td>
  </tr>
</table>
${ctaButtonHtml('Track Your Complaint', escapeHtml(supportUrl))}`;

      const cleanSubject = params.customSubject.replace(/[\r\n]+/g, ' ').trim();
      const html = wrapInBrandEmailLayout({
        brandLogoUrl,
        brandName: BRAND_CONFIG.name,
        supportEmail: config.emailReplyTo || BRAND_CONFIG.supportEmail,
        preheader: `${cleanSubject} — Ticket #${params.ticketNumber}`,
        bodyHtml,
        isMarketing: false,
      });

      const attTextLines =
        atts.length > 0
          ? ['', `Attached Files (${atts.length}):`, ...atts.map(a => `- ${a.filename}: ${linkForAtt(a)}`)]
          : [];
      const text = [
        `Dear ${params.recipientName},`,
        '',
        params.customMessage.trim(),
        ...attTextLines,
        '',
        `---`,
        `Support Ticket: #${params.ticketNumber} (${params.category})`,
        `Original Issue: ${params.ticketSubject}`,
        `Responded by: ${params.adminName} — ${BRAND_CONFIG.name}`,
        `Track Complaint: ${supportUrl}`,
      ].join('\n');

      const res = await queue.enqueue({
        recipient: params.recipientEmail,
        customerId: params.customerId || null,
        emailType: 'customer_service_reply',
        subject: cleanSubject,
        html,
        text,
        relatedOrderId: params.ticketNumber,
      });
      if (res.jobId) {
        await queue.processJobNow(res.jobId);
      }

      const log = res.logId
        ? await db.models.EmailLog.findOne(
            { id: res.logId },
            { id: 1, status: 1, providerMessageId: 1, previewUrl: 1, errorMessage: 1, _id: 0 }
          ).lean()
        : null;

      return {
        skipped: res.status === 'suppressed',
        reason: res.status === 'suppressed' ? 'Recipient suppressed' : undefined,
        ...res,
        log,
      };
    },

    async sendOrderPlacedEmail(order: OrderEmailRecord) {
      const cust = await getOrderCustomer(order);
      if (!cust.email) return { skipped: true, reason: 'No recipient email' };
      const items = await getOrderItems(order.id);
      const blocks = buildOrderItemsBlocks(items);
      const addressStr = parseAddressString(order.deliveryAddress);

      return queueRenderedTemplate({
        templateKey: 'order_placed',
        recipient: cust.email,
        customerId: cust.id,
        relatedOrderId: order.id,
        idempotencyKey: `order_placed_${order.id}`,
        variables: {
          customer_name: cust.name,
          customer_email: cust.email,
          order_id: order.orderNumber,
          order_date: formatDate(order.createdAt),
          product_name: blocks.productNames,
          order_items_text: blocks.text,
          order_subtotal: formatINR(order.subtotal),
          order_discount: formatINR(order.discountAmount),
          order_shipping: order.shippingCharge > 0 ? formatINR(order.shippingCharge) : 'Complimentary',
          order_tax: formatINR(order.taxAmount),
          order_total: formatINR(order.totalAmount),
          delivery_address: addressStr,
          payment_method: order.paymentMethod,
          payment_status: order.paymentStatus.toUpperCase(),
          estimated_delivery: order.estimatedDeliveryEstimate || '',
        },
        rawHtmlBlocks: {
          order_items_html: blocks.html,
          estimated_delivery_row: order.estimatedDeliveryEstimate
            ? `<div><strong>Expected Delivery Estimate:</strong> ${escapeHtml(order.estimatedDeliveryEstimate)}</div>`
            : '',
        },
        ctaLabel: 'View My Order',
        ctaUrl: `${config.appUrl}/account/orders/${encodeURIComponent(order.orderNumber)}`,
      });
    },

    async sendOrderConfirmedEmail(order: OrderEmailRecord) {
      const cust = await getOrderCustomer(order);
      if (!cust.email) return { skipped: true, reason: 'No recipient email' };
      const items = await getOrderItems(order.id);
      const blocks = buildOrderItemsBlocks(items);
      const addressStr = parseAddressString(order.deliveryAddress);

      return queueRenderedTemplate({
        templateKey: 'order_confirmed',
        recipient: cust.email,
        customerId: cust.id,
        relatedOrderId: order.id,
        idempotencyKey: `order_confirmed_${order.id}`,
        variables: {
          customer_name: cust.name,
          customer_email: cust.email,
          order_id: order.orderNumber,
          confirmation_date: formatDate(order.confirmedAt || new Date().toISOString()),
          product_name: blocks.productNames,
          order_items_text: blocks.text,
          order_total: formatINR(order.totalAmount),
          delivery_address: addressStr,
          estimated_delivery: order.estimatedDeliveryEstimate || '',
        },
        rawHtmlBlocks: {
          order_items_html: blocks.html,
          estimated_delivery_row: order.estimatedDeliveryEstimate
            ? `<div><strong>Estimated Delivery:</strong> ${escapeHtml(order.estimatedDeliveryEstimate)}</div>`
            : '',
        },
        ctaLabel: 'View Order Details',
        ctaUrl: `${config.appUrl}/account/orders/${encodeURIComponent(order.orderNumber)}`,
      });
    },

    async sendOrderDispatchedEmail(
      order: OrderEmailRecord,
      shipment: ShipmentRecord,
      isCorrection = false,
      correctionVersion = 0
    ) {
      const cust = await getOrderCustomer(order);
      if (!cust.email) return { skipped: true, reason: 'No recipient email' };
      const addressStr = parseAddressString(order.deliveryAddress);
      const trackUrl = shipment.trackingUrl || `${config.appUrl}/account/orders/${encodeURIComponent(order.orderNumber)}`;

      return queueRenderedTemplate({
        templateKey: 'order_dispatched',
        recipient: cust.email,
        customerId: cust.id,
        relatedOrderId: order.id,
        idempotencyKey: isCorrection
          ? `order_dispatch_update_${order.id}_v${correctionVersion}`
          : `order_dispatched_${order.id}`,
        variables: {
          customer_name: cust.name,
          customer_email: cust.email,
          order_id: order.orderNumber,
          courier_partner: shipment.courierPartner,
          tracking_number: shipment.trackingNumber,
          tracking_url: trackUrl,
          dispatch_date: formatDate(shipment.dispatchDate),
          estimated_delivery: shipment.estimatedDeliveryDate ? formatDate(shipment.estimatedDeliveryDate) : 'As per courier schedule',
          delivery_address: addressStr,
        },
        rawHtmlBlocks: {
          estimated_delivery_row: shipment.estimatedDeliveryDate
            ? `<div><strong>Estimated Delivery Date:</strong> ${escapeHtml(formatDate(shipment.estimatedDeliveryDate))}</div>`
            : '',
          tracking_link_row: shipment.trackingUrl
            ? `<div><strong>Courier Tracking Link:</strong> <a href="${escapeHtml(shipment.trackingUrl)}" style="color:#064e3b;">${escapeHtml(shipment.trackingUrl)}</a></div>`
            : '',
          shipment_notes_row: shipment.shipmentNotes
            ? `<div style="margin-top:6px;color:#5a6860;"><strong>Shipping Note:</strong> ${escapeHtml(shipment.shipmentNotes)}</div>`
            : '',
        },
        ctaLabel: 'Track My Shipment',
        ctaUrl: trackUrl,
      });
    },

    async sendOutForDeliveryEmail(order: OrderEmailRecord, shipment?: ShipmentRecord | null) {
      const cust = await getOrderCustomer(order);
      if (!cust.email) return { skipped: true, reason: 'No recipient email' };
      const addressStr = parseAddressString(order.deliveryAddress);
      const trackUrl = shipment?.trackingUrl || `${config.appUrl}/account/orders/${encodeURIComponent(order.orderNumber)}`;

      return queueRenderedTemplate({
        templateKey: 'out_for_delivery',
        recipient: cust.email,
        customerId: cust.id,
        relatedOrderId: order.id,
        idempotencyKey: `order_ofd_${order.id}`,
        variables: {
          customer_name: cust.name,
          customer_email: cust.email,
          order_id: order.orderNumber,
          courier_partner: shipment?.courierPartner || 'Authorized Courier Partner',
          tracking_number: shipment?.trackingNumber || 'Assigned at Dispatch',
          tracking_url: trackUrl,
          delivery_address: addressStr,
          estimated_delivery: shipment?.estimatedDeliveryDate
            ? formatDate(shipment.estimatedDeliveryDate)
            : 'Expected Today',
        },
        rawHtmlBlocks: {
          estimated_delivery_row: shipment?.estimatedDeliveryDate
            ? `<div><strong>Expected Delivery Date:</strong> ${escapeHtml(formatDate(shipment.estimatedDeliveryDate))}</div>`
            : '',
        },
        ctaLabel: 'Track Shipment',
        ctaUrl: trackUrl,
      });
    },

    async sendOrderDeliveredEmail(order: OrderEmailRecord) {
      const cust = await getOrderCustomer(order);
      if (!cust.email) return { skipped: true, reason: 'No recipient email' };
      const items = await getOrderItems(order.id);
      const blocks = buildOrderItemsBlocks(items);

      return queueRenderedTemplate({
        templateKey: 'order_delivered',
        recipient: cust.email,
        customerId: cust.id,
        relatedOrderId: order.id,
        idempotencyKey: `order_delivered_${order.id}`,
        variables: {
          customer_name: cust.name,
          customer_email: cust.email,
          order_id: order.orderNumber,
          delivered_date: formatDate(order.deliveredAt || new Date().toISOString()),
          product_name: blocks.productNames,
          order_items_text: blocks.text,
        },
        rawHtmlBlocks: {
          order_items_html: blocks.html,
        },
        ctaLabel: 'Shop Again',
        ctaUrl: `${config.appUrl}/catalog`,
      });
    },

    async sendOrderCancelledEmail(order: OrderEmailRecord) {
      const cust = await getOrderCustomer(order);
      if (!cust.email) return { skipped: true, reason: 'No recipient email' };
      const hasRefund = order.refundStatus && order.refundStatus !== 'none';

      return queueRenderedTemplate({
        templateKey: 'order_cancelled',
        recipient: cust.email,
        customerId: cust.id,
        relatedOrderId: order.id,
        idempotencyKey: `order_cancelled_${order.id}`,
        variables: {
          customer_name: cust.name,
          customer_email: cust.email,
          order_id: order.orderNumber,
          cancellation_date: formatDate(order.cancelledAt || new Date().toISOString()),
          cancellation_reason: order.cancellationReason || 'Cancelled per request',
          refund_status: hasRefund ? String(order.refundStatus).toUpperCase() : 'Not applicable',
          refund_amount: order.refundAmount ? formatINR(order.refundAmount) : '',
        },
        rawHtmlBlocks: {
          refund_summary_row: hasRefund
            ? `<div><strong>Refund Status:</strong> ${escapeHtml(String(order.refundStatus).toUpperCase())}${order.refundAmount ? ` (${escapeHtml(formatINR(order.refundAmount))})` : ''}</div>`
            : '',
        },
        ctaLabel: 'Continue Shopping',
        ctaUrl: `${config.appUrl}/catalog`,
      });
    },

    async sendRefundProcessedEmail(order: OrderEmailRecord) {
      if (order.refundStatus !== 'refunded' || !order.refundReferenceId) {
        return { skipped: true, reason: 'Refund is not verified as completed' };
      }
      const cust = await getOrderCustomer(order);
      if (!cust.email) return { skipped: true, reason: 'No recipient email' };

      return queueRenderedTemplate({
        templateKey: 'refund_processed',
        recipient: cust.email,
        customerId: cust.id,
        relatedOrderId: order.id,
        idempotencyKey: `refund_processed_${order.id}_${order.refundReferenceId}`,
        variables: {
          customer_name: cust.name,
          customer_email: cust.email,
          order_id: order.orderNumber,
          refund_amount: formatINR(order.refundAmount || order.totalAmount),
          refund_reference_id: order.refundReferenceId,
          refund_date: formatDate(order.refundDate || new Date().toISOString()),
          payment_method: order.paymentMethod,
          bank_eta: order.refundBankEta ? `Expected bank processing time: ${order.refundBankEta}` : '',
        },
        rawHtmlBlocks: {
          bank_eta_row: order.refundBankEta
            ? `<div><strong>Expected Bank Processing Time:</strong> ${escapeHtml(order.refundBankEta)}</div>`
            : '',
        },
        ctaLabel: 'View Order Details',
        ctaUrl: `${config.appUrl}/account/orders/${encodeURIComponent(order.orderNumber)}`,
      });
    },

    async sendNewProductEmail(
      product: {
        id: string;
        name: string;
        image: string;
        description: string;
        price: number;
        unit: string;
        variants: string[];
        features: string[];
      },
      customer: CustomerRecord,
      campaignId?: string,
      scheduledAt?: string
    ) {
      if (!customerAllowsMarketing(customer, 'newProductAnnouncements')) {
        return { skipped: true, reason: 'Customer has not opted in to new product announcements' };
      }

      const highlightsHtml = (product.features || [])
        .map(f => `<li style="margin:4px 0;">${escapeHtml(f)}</li>`)
        .join('');
      const variantsText = (product.variants || []).join(', ') || `Standard ${product.unit} reserve`;

      const showcaseHtml = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#fbf8f1;border:1px solid #c9a23f;margin-bottom:16px;">
        <tr>
          <td style="padding:16px;">
            <img src="${escapeHtml(absoluteUrl(product.image))}" alt="${escapeHtml(product.name)}" width="240" style="display:block;width:100%;max-width:240px;height:auto;border-radius:8px;margin-bottom:14px;border:1px solid #d9c48c;" />
            <div style="font-family:Georgia,serif;font-size:20px;font-weight:bold;color:#064e3b;">${escapeHtml(product.name)}</div>
            <div style="font-size:16px;font-weight:bold;color:#b99225;margin:6px 0;">${escapeHtml(formatINR(product.price))} / ${escapeHtml(product.unit)}</div>
            <p style="margin:8px 0;font-size:14px;color:#27332d;">${escapeHtml(product.description)}</p>
            <div style="font-size:13px;color:#064e3b;margin-top:8px;"><strong>Available Variants:</strong> ${escapeHtml(variantsText)}</div>
            ${highlightsHtml ? `<ul style="margin:10px 0 0 0;padding-left:18px;font-size:13px;color:#4a5951;">${highlightsHtml}</ul>` : ''}
          </td>
        </tr>
      </table>`;

      return queueRenderedTemplate({
        templateKey: 'new_product_announcement',
        recipient: customer.email,
        customerId: customer.id,
        campaignId: campaignId || null,
        scheduledAt,
        unsubscribeCustomer: customer,
        idempotencyKey: campaignId ? `camp_${campaignId}_${customer.id}` : `newprod_${product.id}_${customer.id}`,
        variables: {
          customer_name: customer.name,
          customer_email: customer.email,
          product_name: product.name,
          product_price: `${formatINR(product.price)} / ${product.unit}`,
          product_description: product.description,
          product_variants: variantsText,
        },
        rawHtmlBlocks: {
          product_showcase_html: showcaseHtml,
        },
        ctaLabel: 'Shop Now',
        ctaUrl: `${config.appUrl}/catalog?highlight=${encodeURIComponent(product.id)}`,
      });
    },

    async sendFestivalCampaignEmail(
      campaign: {
        id: string;
        campaignName: string;
        campaignType: 'festival' | 'promotional' | 'new_product';
        festivalName?: string | null;
        subject: string;
        content: string;
        bannerImage?: string | null;
        discountPercentage?: number | null;
        couponCode?: string | null;
        minOrderValue?: number | null;
        maxDiscount?: number | null;
        ctaText?: string | null;
        ctaUrl?: string | null;
      },
      customer: CustomerRecord,
      products: Array<{ id: string; name: string; image: string; price: number; unit: string }>,
      scheduledAt?: string
    ) {
      const prefKey = campaign.campaignType === 'festival' ? 'festivalOffers' : 'promotionalDiscounts';
      if (!customerAllowsMarketing(customer, prefKey)) {
        return { skipped: true, reason: 'Customer unsubscribed or not opted in' };
      }

      const templateKey =
        campaign.campaignType === 'festival' ? 'festival_sale_announcement' : 'promotional_offers';
      const tpl = await getTemplate(templateKey);
      if (!tpl.enabled) {
        return { skipped: true, reason: 'Template disabled by admin' };
      }

      const unsub = await issueUnsubscribeUrl(customer);
      const bannerHtml = campaign.bannerImage
        ? `<img src="${escapeHtml(absoluteUrl(campaign.bannerImage))}" alt="${escapeHtml(campaign.campaignName)}" width="540" style="display:block;width:100%;max-width:540px;height:auto;border-radius:8px;margin:0 0 18px 0;border:1px solid #d9c48c;" />`
        : '';

      const couponBoxHtml = campaign.couponCode
        ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#eef6f3;border:1px dashed #064e3b;margin:18px 0;">
            <tr>
              <td align="center" style="padding:16px;">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#064e3b;font-weight:bold;">
                  ${campaign.discountPercentage ? `${escapeHtml(campaign.discountPercentage)}% Festive Privilege` : 'Exclusive Patron Privilege'}
                </div>
                <div style="font-family:monospace;font-size:20px;font-weight:bold;color:#064e3b;letter-spacing:2px;margin:6px 0;">
                  ${escapeHtml(campaign.couponCode)}
                </div>
                ${
                  campaign.minOrderValue
                    ? `<div style="font-size:12px;color:#4a5951;">Valid on orders above ${escapeHtml(formatINR(campaign.minOrderValue))}${campaign.maxDiscount ? ` (max discount ${escapeHtml(formatINR(campaign.maxDiscount))})` : ''}</div>`
                    : ''
                }
              </td>
            </tr>
          </table>`
        : '';

      const productCardsHtml =
        products.length > 0
          ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0;border-collapse:collapse;">
              ${products
                .map(
                  p => `<tr>
                    <td style="padding:10px;border:1px solid #eadcbe;background-color:#fbf8f1;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td width="64" style="vertical-align:middle;">
                            <img src="${escapeHtml(absoluteUrl(p.image))}" alt="${escapeHtml(p.name)}" width="56" height="56" style="display:block;width:56px;height:56px;object-fit:cover;border-radius:6px;" />
                          </td>
                          <td style="padding-left:12px;vertical-align:middle;">
                            <div style="font-family:Georgia,serif;font-size:15px;font-weight:bold;color:#064e3b;">${escapeHtml(p.name)}</div>
                            <div style="font-size:13px;color:#b99225;font-weight:bold;">${escapeHtml(formatINR(p.price))} / ${escapeHtml(p.unit)}</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>`
                )
                .join('')}
            </table>`
          : '';

      const targetCtaUrl = absoluteUrl(campaign.ctaUrl || '/catalog');
      const brandLogoUrl = await getBrandLogoUrl();
      const rendered = renderEmailFromTemplate(
        campaign.subject || tpl.subject,
        tpl.htmlContent,
        tpl.textContent,
        {
          variables: {
            customer_name: customer.name,
            customer_email: customer.email,
            festival_name: campaign.festivalName || 'Festive Season',
            campaign_title: campaign.campaignName,
            coupon_code: campaign.couponCode || '',
            discount_badge: campaign.discountPercentage ? `${campaign.discountPercentage}% OFF` : '',
            campaign_body_text: campaign.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
            coupon_text: campaign.couponCode ? `Use coupon code: ${campaign.couponCode}` : '',
          },
          rawHtmlBlocks: {
            banner_html: bannerHtml,
            campaign_body_html: sanitizeEmailHtml(campaign.content),
            coupon_box_html: couponBoxHtml,
            product_cards_html: productCardsHtml,
          },
          ctaLabel: campaign.ctaText || 'Shop Royal Harvests',
          ctaUrl: targetCtaUrl,
          brandLogoUrl,
          isMarketing: true,
          unsubscribeUrl: unsub.url,
          preferencesUrl: `${config.appUrl}/account?tab=preferences`,
        }
      );

      const res = await queue.enqueue({
        recipient: customer.email,
        customerId: customer.id,
        emailType: templateKey,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        headers: {
          'List-Unsubscribe': `<${unsub.url}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        campaignId: campaign.id,
        idempotencyKey: `camp_${campaign.id}_${customer.id}`,
        scheduledAt,
      });

      if (!scheduledAt && res.jobId) {
        await queue.processJobNow(res.jobId);
      }
      return { skipped: false, ...res };
    },

    async previewTemplate(templateKey: string, overrideSubject?: string, overrideHtml?: string, overrideText?: string) {
      const tpl = await getTemplate(templateKey);
      const sampleItems: OrderItemRecord[] = [
        {
          productId: 'badam',
          productName: 'Shell Mamara Badam',
          productImage: '/assets/aistudio/2a3c89dd1edf49b4c54431c043fd7a29_4031e226.jpg',
          unit: 'kg',
          unitPrice: 1200,
          quantity: 2,
          subtotal: 2400,
        },
        {
          productId: 'kesar',
          productName: 'Kesar (Saffron)',
          productImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
          unit: 'gram',
          unitPrice: 396,
          quantity: 3,
          subtotal: 1188,
        },
      ];
      const blocks = buildOrderItemsBlocks(sampleItems);
      const brandLogoUrl = await getBrandLogoUrl();

      const previewCtaByKey: Record<string, { label: string; url: string }> = {
        email_verification: { label: 'Verify Email Address', url: `${config.appUrl}/verify-email?token=sample-preview-token` },
        email_change_verification: { label: 'Confirm New Email Address', url: `${config.appUrl}/verify-email?token=sample-preview-token` },
        password_reset: { label: 'Reset Password', url: `${config.appUrl}/reset-password?token=sample-reset-token` },
        password_changed: { label: 'Manage Account & Security', url: `${config.appUrl}/account` },
        admin_welcome: { label: 'Sign In to Admin Portal', url: `${config.adminUrl}/admin/login` },
        admin_login_otp: { label: 'Open Admin Portal', url: `${config.adminUrl}/admin/login` },
        admin_order_alert: { label: 'Review Order in Admin Portal', url: `${config.adminUrl}/admin/orders` },
        customer_service_ack: { label: 'Track Your Complaint', url: `${config.appUrl}/customer-service` },
        admin_support_alert: { label: 'Review Complaint in Admin Portal', url: `${config.adminUrl}/admin/support` },
      };
      const previewCta = previewCtaByKey[templateKey] || { label: 'View Details', url: `${config.appUrl}/catalog` };

      return renderEmailFromTemplate(
        overrideSubject ?? tpl.subject,
        overrideHtml ?? tpl.htmlContent,
        overrideText ?? tpl.textContent,
        {
          variables: {
            customer_name: 'Vikramaditya Seth',
            customer_email: 'vikram.seth@heritage.in',
            order_id: 'AS-ORD-2026-4819',
            order_date: '11 Nov 2026',
            confirmation_date: '11 Nov 2026',
            dispatch_date: '11 Nov 2026',
            delivered_date: '14 Nov 2026',
            cancellation_date: '11 Nov 2026',
            cancellation_reason: 'Customer requested address update',
            refund_status: 'REFUNDED',
            refund_amount: '₹3,588',
            refund_reference_id: 'RFND-JAMMU-88412',
            refund_date: '11 Nov 2026',
            bank_eta: 'Expected bank processing time: 3–5 business days',
            product_name: 'Shell Mamara Badam, Kesar (Saffron)',
            product_price: '₹1,200 / kg',
            product_description: 'High-oil mountain almonds hand-graded in Jammu.',
            product_variants: '500g Paper-Shell Pack, 1kg Royal Kraft Box',
            order_items_text: blocks.text,
            order_subtotal: '₹3,588',
            order_discount: '₹0',
            order_shipping: 'Complimentary',
            order_tax: '₹0',
            order_total: '₹3,588',
            delivery_address: '24/B Heritage Enclave, Circular Road, Jammu, J&K - 180001',
            payment_method: 'Concierge Invoice / COD',
            payment_status: 'CONFIRMED',
            courier_partner: 'Blue Dart',
            tracking_number: 'BD849201445IN',
            tracking_url: 'https://www.bluedart.com/tracking',
            estimated_delivery: '14 Nov 2026',
            verification_url: `${config.appUrl}/verify-email?token=sample-preview-token`,
            reset_url: `${config.appUrl}/reset-password?token=sample-reset-token`,
            new_email: 'vikram.new@heritage.in',
            admin_name: 'Seth And Sons Admin',
            admin_email: config.adminSeedEmail,
            otp_code: '482913',
            expires_minutes: '10',
            assigned_role: 'Store Staff',
            permissions_list: 'dashboard, orders, inventory, communications',
            admin_portal_url: `${config.adminUrl}/admin/login`,
            ticket_number: 'AS-SUP-2026-1042',
            ticket_category: 'Quality / Packaging',
            ticket_subject: 'Vacuum pouch seal inquiry for Mongra Saffron',
            ticket_description: 'Outer pouch corner had slight transit scuffing; attached photo and invoice PDF.',
            attachment_count: '2 file(s)',
            festival_name: 'Diwali',
            campaign_title: 'Royal Diwali Dry Fruit Hampers',
            coupon_code: 'DIWALI15',
            discount_badge: '15% OFF',
            campaign_body_text: 'Celebrate Diwali with authentic Jammu dry fruits and pure Mongra saffron.',
            coupon_text: 'Use code DIWALI15 at checkout.',
          },
          rawHtmlBlocks: {
            order_items_html: blocks.html,
            estimated_delivery_row: '<div><strong>Estimated Delivery:</strong> 14 Nov 2026</div>',
            tracking_link_row: '<div><strong>Tracking Link:</strong> <a href="https://www.bluedart.com/tracking" style="color:#064e3b;">https://www.bluedart.com/tracking</a></div>',
            shipment_notes_row: '<div><strong>Notes:</strong> Vacuum sealed for saffron aroma</div>',
            refund_summary_row: '<div><strong>Refund Status:</strong> REFUNDED (₹3,588)</div>',
            bank_eta_row: '<div><strong>Expected Bank Processing Time:</strong> 3–5 business days</div>',
            campaign_body_html: '<p>Celebrate Diwali with authentic Jammu dry fruits and pure Mongra saffron.</p>',
            support_attachments_html: '<div><strong>Attachments:</strong> batch_photo.png, invoice.pdf</div>',
          },
          ctaLabel: previewCta.label,
          ctaUrl: previewCta.url,
          brandLogoUrl,
          isMarketing: tpl.category === 'marketing',
          unsubscribeUrl: `${config.appUrl}/unsubscribe?token=preview`,
          preferencesUrl: `${config.appUrl}/account?tab=preferences`,
        }
      );
    },

    async sendTestTemplateEmail(templateKey: string, recipientEmail: string) {
      const rendered = await this.previewTemplate(templateKey);
      const res = await queue.enqueue({
        recipient: recipientEmail,
        emailType: `test_${templateKey}`,
        subject: `[TEST] ${rendered.subject}`,
        html: rendered.html,
        text: rendered.text,
      });
      if (res.jobId) {
        await queue.processJobNow(res.jobId);
      }
      const log = await db.models.EmailLog.findOne(
        { id: res.logId },
        { id: 1, status: 1, previewUrl: 1, providerMessageId: 1, errorMessage: 1, _id: 0 }
      ).lean();
      return log;
    },
  };
}

export type EmailService = ReturnType<typeof createEmailService>;
