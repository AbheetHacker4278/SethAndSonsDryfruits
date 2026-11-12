import { BRAND_CONFIG } from '../../shared/catalogSeed.ts';
import { escapeHtml, sanitizeEmailHtml } from '../utils/crypto.ts';
import { ctaButtonHtml, wrapInBrandEmailLayout } from './brandLayout.ts';

export interface RenderContext {
  // Raw escaped text fields
  variables: Record<string, string>;
  // Pre-constructed trusted HTML fragments (all user values inside already escaped!)
  rawHtmlBlocks?: Record<string, string>;
  ctaLabel?: string;
  ctaUrl?: string;
  brandLogoUrl: string;
  isMarketing: boolean;
  unsubscribeUrl?: string;
  preferencesUrl?: string;
}

const RAW_HTML_KEYS = new Set([
  'cta_button',
  'order_items_html',
  'estimated_delivery_row',
  'tracking_link_row',
  'shipment_notes_row',
  'refund_summary_row',
  'bank_eta_row',
  'product_showcase_html',
  'banner_html',
  'campaign_body_html',
  'coupon_box_html',
  'product_cards_html',
  'support_attachments_html',
]);

export function renderEmailFromTemplate(
  subjectTemplate: string,
  htmlTemplate: string,
  textTemplate: string,
  context: RenderContext
): { subject: string; html: string; text: string } {
  const vars: Record<string, string> = {
    brand_name: BRAND_CONFIG.name,
    support_email: BRAND_CONFIG.supportEmail,
    ...context.variables,
  };

  const replaceVarsText = (tpl: string): string =>
    tpl.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => {
      if (key in vars) return vars[key];
      if (key === 'cta_url' && context.ctaUrl) return context.ctaUrl;
      return '';
    });

  const safeBlocks: Record<string, string> = {
    ...(context.rawHtmlBlocks || {}),
  };
  if (context.ctaLabel && context.ctaUrl) {
    safeBlocks.cta_button = ctaButtonHtml(escapeHtml(context.ctaLabel), escapeHtml(context.ctaUrl));
    if (!vars.cta_url) vars.cta_url = context.ctaUrl;
  }

  const sanitizedBodyTemplate = sanitizeEmailHtml(htmlTemplate);
  const renderedBodyHtml = sanitizedBodyTemplate.replace(
    /\{\{([a-zA-Z0-9_]+)\}\}/g,
    (_match, key: string) => {
      if (RAW_HTML_KEYS.has(key)) {
        return safeBlocks[key] || '';
      }
      if (key in vars) {
        return escapeHtml(vars[key]);
      }
      return '';
    }
  );

  const subject = replaceVarsText(subjectTemplate).replace(/[\r\n]+/g, ' ').trim();
  const text = replaceVarsText(textTemplate);
  const html = wrapInBrandEmailLayout({
    brandLogoUrl: context.brandLogoUrl,
    brandName: vars.brand_name,
    supportEmail: vars.support_email,
    preheader: subject,
    bodyHtml: renderedBodyHtml,
    isMarketing: context.isMarketing,
    unsubscribeUrl: context.unsubscribeUrl,
    preferencesUrl: context.preferencesUrl,
  });

  return { subject, html, text };
}

