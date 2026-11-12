import { BRAND_CONFIG } from '../../shared/catalogSeed.ts';

export interface BrandLayoutOptions {
  brandLogoUrl: string;
  brandName: string;
  supportEmail: string;
  preheader?: string;
  bodyHtml: string;
  isMarketing?: boolean;
  unsubscribeUrl?: string;
  preferencesUrl?: string;
}

/**
 * Generates an email-client-compatible (Gmail / Outlook / Apple Mail)
 * 600px table-based HTML layout in Deep Emerald Green (#064e3b),
 * Champagne Gold (#dfc471), and Warm Ivory (#faf7f0).
 * Contains zero JavaScript and zero external CSS dependencies.
 */
export function wrapInBrandEmailLayout(opts: BrandLayoutOptions): string {
  const {
    brandLogoUrl,
    brandName,
    supportEmail,
    preheader = '',
    bodyHtml,
    isMarketing = false,
    unsubscribeUrl = '',
    preferencesUrl = '',
  } = opts;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${brandName}</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f1e7;font-family:'Georgia','Times New Roman',serif;color:#1e2923;-webkit-font-smoothing:antialiased;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f6f1e7;">${preheader}</div>` : ''}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f6f1e7;width:100%;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:28px 14px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #d9c48c;border-collapse:collapse;">
          <!-- Champagne Gold Top Hairline -->
          <tr>
            <td style="background-color:#c9a23f;height:4px;line-height:4px;font-size:4px;">&nbsp;</td>
          </tr>
          <!-- Deep Emerald Header -->
          <tr>
            <td align="center" style="background-color:#064e3b;padding:28px 24px 24px 24px;border-bottom:2px solid #dfc471;">
              ${
                brandLogoUrl
                  ? `<img src="${brandLogoUrl}" alt="${brandName}" width="140" style="display:block;max-width:160px;max-height:84px;width:auto;height:auto;margin:0 auto 12px auto;border:0;outline:none;border-radius:10px;" />`
                  : ''
              }
              <div style="font-family:'Georgia','Times New Roman',serif;font-size:22px;line-height:28px;font-weight:bold;color:#f9f6f2;letter-spacing:0.5px;">
                ${brandName}
              </div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:14px;color:#dfc471;text-transform:uppercase;letter-spacing:2.5px;margin-top:6px;">
                Heritage Dry Fruit Mandi • Sourced From Jammu
              </div>
            </td>
          </tr>

          <!-- Main Ivory/White Content Body -->
          <tr>
            <td style="padding:32px 28px 28px 28px;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#27332d;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Customer Support & Contact Band -->
          <tr>
            <td style="padding:20px 28px;background-color:#fbf8f1;border-top:1px solid #eadcbe;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#4a5951;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align:top;">
                    <div style="font-weight:bold;color:#064e3b;margin-bottom:4px;">Jammu Patron Concierge</div>
                    <div>Email: <a href="mailto:${supportEmail}" style="color:#064e3b;text-decoration:underline;">${supportEmail}</a></div>
                    <div>Phone / WhatsApp: ${BRAND_CONFIG.displayPhone}</div>
                    <div>${BRAND_CONFIG.dispatchLocation}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Deep Emerald Footer -->
          <tr>
            <td align="center" style="background-color:#04392b;padding:22px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#d6e3dc;">
              <div style="color:#dfc471;font-weight:bold;letter-spacing:1px;text-transform:uppercase;font-size:11px;margin-bottom:6px;">
                ${brandName}
              </div>
              <div style="color:#b8ccc2;">
                100% Authentic Jammu &amp; Kashmir Provenance • Earthen Shade Cured
              </div>
              ${
                isMarketing && unsubscribeUrl
                  ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #145c47;font-size:11px;color:#b8ccc2;">
                      You received this email because you opted in to ${brandName} communications.<br />
                      <a href="${unsubscribeUrl}" style="color:#dfc471;text-decoration:underline;">Unsubscribe with one click</a>
                      ${preferencesUrl ? ` &nbsp;|&nbsp; <a href="${preferencesUrl}" style="color:#dfc471;text-decoration:underline;">Manage Email Preferences</a>` : ''}
                    </div>`
                  : preferencesUrl
                  ? `<div style="margin-top:10px;font-size:11px;color:#b8ccc2;">
                      <a href="${preferencesUrl}" style="color:#dfc471;text-decoration:underline;">Manage Account &amp; Preferences</a>
                    </div>`
                  : ''
              }
              <div style="margin-top:8px;font-size:11px;color:#8aa89b;">
                &copy; ${new Date().getFullYear()} ${brandName}. All rights reserved.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function ctaButtonHtml(label: string, url: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
    <tr>
      <td align="center" bgcolor="#064e3b" style="border-radius:6px;border:1px solid #c9a23f;">
        <a href="${url}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#dfc471;text-decoration:none;text-transform:uppercase;letter-spacing:1.2px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

