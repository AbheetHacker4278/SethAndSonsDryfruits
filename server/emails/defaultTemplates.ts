export interface DefaultEmailTemplate {
  templateKey: string;
  templateName: string;
  category: 'transactional' | 'marketing';
  subject: string;
  htmlContent: string;
  textContent: string;
  variables: string[];
}

export const ALL_TEMPLATE_VARIABLES = [
  '{{customer_name}}',
  '{{customer_email}}',
  '{{new_email}}',
  '{{verification_url}}',
  '{{reset_url}}',
  '{{admin_name}}',
  '{{admin_email}}',
  '{{otp_code}}',
  '{{expires_minutes}}',
  '{{assigned_role}}',
  '{{permissions_list}}',
  '{{admin_portal_url}}',
  '{{ticket_number}}',
  '{{ticket_category}}',
  '{{ticket_subject}}',
  '{{attachment_count}}',
  '{{order_id}}',
  '{{order_date}}',
  '{{product_name}}',
  '{{order_total}}',
  '{{delivery_address}}',
  '{{courier_partner}}',
  '{{tracking_number}}',
  '{{tracking_url}}',
  '{{estimated_delivery}}',
  '{{refund_amount}}',
  '{{brand_name}}',
  '{{support_email}}',
];

export const DEFAULT_EMAIL_TEMPLATES: DefaultEmailTemplate[] = [
  {
    templateKey: 'welcome',
    templateName: 'Welcome Email',
    category: 'transactional',
    subject: 'Welcome to {{brand_name}} – Heritage Jammu Harvests',
    variables: ['{{customer_name}}', '{{customer_email}}', '{{brand_name}}', '{{support_email}}', '{{cta_url}}'],
    htmlContent: `<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 14px 0;font-size:24px;">Welcome, {{customer_name}}</h2>
<p style="margin:0 0 14px 0;">Your email address (<strong>{{customer_email}}</strong>) is now verified and your patron account with <strong>{{brand_name}}</strong> is active.</p>
<p style="margin:0 0 14px 0;">For three generations, our family has graded handpicked Himalayan almonds, Kishtwar walnuts, jumbo cashews, and pure Grade-1 Kashmiri Mongra saffron straight from Jammu &amp; Kashmir.</p>
<div style="background-color:#fbf8f1;border-left:4px solid #c9a23f;padding:14px 16px;margin:18px 0;">
  <strong style="color:#064e3b;">Your Patron Privileges:</strong>
  <ul style="margin:8px 0 0 0;padding-left:18px;">
    <li>Direct verified checkout &amp; order tracking</li>
    <li>Saved delivery addresses &amp; seasonal harvest updates</li>
    <li>Dedicated Jammu concierge support</li>
  </ul>
</div>
{{cta_button}}`,
    textContent: `Welcome, {{customer_name}}!\n\nYour email ({{customer_email}}) is verified and your account with {{brand_name}} is active.\n\nExplore our Jammu harvests: {{cta_url}}\nSupport: {{support_email}}`,
  },
  {
    templateKey: 'email_verification',
    templateName: 'Email Verification',
    category: 'transactional',
    subject: 'Verify Your Email Address – {{brand_name}}',
    variables: ['{{customer_name}}', '{{customer_email}}', '{{verification_url}}', '{{brand_name}}', '{{support_email}}'],
    htmlContent: `<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 14px 0;font-size:24px;">Verify Your Email Address</h2>
<p style="margin:0 0 14px 0;">Dear {{customer_name}},</p>
<p style="margin:0 0 14px 0;">Thank you for registering with <strong>{{brand_name}}</strong>. Please confirm that <strong>{{customer_email}}</strong> is your email address so you can complete orders and receive delivery updates.</p>
{{cta_button}}
<p style="margin:0 0 10px 0;font-size:13px;color:#5a6860;">This single-use verification link will expire in <strong>24 hours</strong>.</p>
<p style="margin:0;font-size:12px;color:#6c7a72;word-break:break-all;">If the button does not work, copy and paste this link into your browser:<br />{{verification_url}}</p>`,
    textContent: `Dear {{customer_name}},\n\nPlease verify your email address ({{customer_email}}) for {{brand_name}} by visiting:\n{{verification_url}}\n\nThis link expires in 24 hours. If you did not create this account, please ignore this email.`,
  },
  {
    templateKey: 'password_reset',
    templateName: 'Password Reset',
    category: 'transactional',
    subject: 'Reset Your Password – {{brand_name}}',
    variables: ['{{customer_name}}', '{{customer_email}}', '{{reset_url}}', '{{brand_name}}', '{{support_email}}'],
    htmlContent: `<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 14px 0;font-size:24px;">Password Reset Request</h2>
<p style="margin:0 0 14px 0;">Dear {{customer_name}},</p>
<p style="margin:0 0 14px 0;">We received a request to reset the password for your <strong>{{brand_name}}</strong> account ({{customer_email}}).</p>
{{cta_button}}
<p style="margin:0 0 10px 0;font-size:13px;color:#5a6860;">For your security, this single-use link expires in <strong>30 minutes</strong> and will sign out existing active sessions once used.</p>
<p style="margin:0;font-size:12px;color:#6c7a72;word-break:break-all;">Reset link: {{reset_url}}</p>`,
    textContent: `Dear {{customer_name}},\n\nReset your {{brand_name}} password using this link (expires in 30 minutes):\n{{reset_url}}\n\nIf you did not request a password reset, you can safely ignore this email.`,
  },
  {
    templateKey: 'order_placed',
    templateName: 'Order Placed',
    category: 'transactional',
    subject: 'Your Order Has Been Received! – Seth And Sons DryFruits',
    variables: ['{{customer_name}}', '{{order_id}}', '{{order_date}}', '{{product_name}}', '{{order_total}}', '{{delivery_address}}', '{{estimated_delivery}}', '{{brand_name}}', '{{support_email}}'],
    htmlContent: `<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 12px 0;font-size:24px;">Thank You for Your Order, {{customer_name}}!</h2>
<p style="margin:0 0 16px 0;">We have received your order <strong>#{{order_id}}</strong> placed on <strong>{{order_date}}</strong>.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#fbf8f1;border:1px solid #eadcbe;margin-bottom:18px;">
  <tr><td style="padding:14px 16px;font-size:13px;">
    <div><strong>Order ID:</strong> {{order_id}}</div>
    <div><strong>Payment Method:</strong> {{payment_method}} &nbsp;|&nbsp; <strong>Status:</strong> {{payment_status}}</div>
    <div><strong>Delivery Address:</strong> {{delivery_address}}</div>
    {{estimated_delivery_row}}
  </td></tr>
</table>
{{order_items_html}}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:14px;border-top:2px solid #064e3b;padding-top:10px;">
  <tr><td style="font-size:13px;padding:3px 0;">Subtotal</td><td align="right" style="font-size:13px;">{{order_subtotal}}</td></tr>
  <tr><td style="font-size:13px;padding:3px 0;">Discounts</td><td align="right" style="font-size:13px;color:#064e3b;">-{{order_discount}}</td></tr>
  <tr><td style="font-size:13px;padding:3px 0;">Shipping Charges</td><td align="right" style="font-size:13px;">{{order_shipping}}</td></tr>
  <tr><td style="font-size:13px;padding:3px 0;">Taxes</td><td align="right" style="font-size:13px;">{{order_tax}}</td></tr>
  <tr><td style="font-size:16px;font-weight:bold;color:#064e3b;padding:8px 0 0 0;">Final Amount</td><td align="right" style="font-size:16px;font-weight:bold;color:#064e3b;padding:8px 0 0 0;">{{order_total}}</td></tr>
</table>
{{cta_button}}`,
    textContent: `Thank you {{customer_name}}!\nYour order #{{order_id}} ({{order_date}}) has been received.\n\n{{order_items_text}}\n\nSubtotal: {{order_subtotal}}\nDiscounts: -{{order_discount}}\nShipping: {{order_shipping}}\nTaxes: {{order_tax}}\nFinal Amount: {{order_total}}\nPayment: {{payment_method}} ({{payment_status}})\nDelivery Address: {{delivery_address}}\n\nView My Order: {{cta_url}}`,
  },
  {
    templateKey: 'order_confirmed',
    templateName: 'Order Confirmed',
    category: 'transactional',
    subject: 'Your Order Is Confirmed! – Order #{{order_id}}',
    variables: ['{{customer_name}}', '{{order_id}}', '{{confirmation_date}}', '{{product_name}}', '{{order_total}}', '{{delivery_address}}', '{{estimated_delivery}}', '{{brand_name}}', '{{support_email}}'],
    htmlContent: `<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 12px 0;font-size:24px;">Order Confirmed</h2>
<p style="margin:0 0 14px 0;">Dear {{customer_name}},</p>
<p style="margin:0 0 16px 0;background-color:#eef6f3;border-left:4px solid #064e3b;padding:14px 16px;color:#064e3b;font-weight:600;">Great news! Your order has been successfully confirmed by our team. We are now preparing your premium dry fruits with care.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#fbf8f1;border:1px solid #eadcbe;margin-bottom:16px;">
  <tr><td style="padding:14px 16px;font-size:13px;">
    <div><strong>Order ID:</strong> {{order_id}}</div>
    <div><strong>Confirmation Date:</strong> {{confirmation_date}}</div>
    <div><strong>Total Amount:</strong> {{order_total}}</div>
    <div><strong>Delivery Address:</strong> {{delivery_address}}</div>
    {{estimated_delivery_row}}
  </td></tr>
</table>
{{order_items_html}}
{{cta_button}}`,
    textContent: `Dear {{customer_name}},\n\nGreat news! Your order has been successfully confirmed by our team. We are now preparing your premium dry fruits with care.\n\nOrder ID: {{order_id}}\nConfirmation Date: {{confirmation_date}}\nTotal Amount: {{order_total}}\nDelivery Address: {{delivery_address}}\n\n{{order_items_text}}\n\nView Order Details: {{cta_url}}`,
  },
  {
    templateKey: 'order_dispatched',
    templateName: 'Order Dispatched',
    category: 'transactional',
    subject: 'Your Order Is On Its Way! – Order #{{order_id}}',
    variables: ['{{customer_name}}', '{{order_id}}', '{{courier_partner}}', '{{tracking_number}}', '{{tracking_url}}', '{{dispatch_date}}', '{{estimated_delivery}}', '{{delivery_address}}', '{{brand_name}}', '{{support_email}}'],
    htmlContent: `<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 12px 0;font-size:24px;">Your Harvest Shipment Is On Its Way</h2>
<p style="margin:0 0 14px 0;">Dear {{customer_name}},</p>
<p style="margin:0 0 16px 0;">Your order <strong>#{{order_id}}</strong> has been dispatched from our Jammu cellar.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#fbf8f1;border:1px solid #c9a23f;margin-bottom:18px;">
  <tr><td style="padding:16px;font-size:14px;line-height:22px;">
    <div><strong>Courier Partner:</strong> {{courier_partner}}</div>
    <div><strong>Tracking / AWB Number:</strong> <span style="color:#064e3b;font-weight:bold;">{{tracking_number}}</span></div>
    <div><strong>Dispatch Date:</strong> {{dispatch_date}}</div>
    {{estimated_delivery_row}}
    <div><strong>Delivery Address:</strong> {{delivery_address}}</div>
    {{tracking_link_row}}
    {{shipment_notes_row}}
  </td></tr>
</table>
{{cta_button}}`,
    textContent: `Dear {{customer_name}},\n\nYour order #{{order_id}} is on its way!\nCourier Partner: {{courier_partner}}\nTracking / AWB Number: {{tracking_number}}\nDispatch Date: {{dispatch_date}}\nEstimated Delivery: {{estimated_delivery}}\nTracking Link: {{tracking_url}}\nDelivery Address: {{delivery_address}}\n\nTrack My Shipment: {{cta_url}}`,
  },
  {
    templateKey: 'out_for_delivery',
    templateName: 'Out for Delivery',
    category: 'transactional',
    subject: 'Out for Delivery Today – Order #{{order_id}}',
    variables: ['{{customer_name}}', '{{order_id}}', '{{courier_partner}}', '{{tracking_number}}', '{{delivery_address}}', '{{estimated_delivery}}', '{{tracking_url}}', '{{brand_name}}', '{{support_email}}'],
    htmlContent: `<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 12px 0;font-size:24px;">Your Order Is Out for Delivery</h2>
<p style="margin:0 0 14px 0;">Dear {{customer_name}},</p>
<p style="margin:0 0 16px 0;">Your order <strong>#{{order_id}}</strong> is out for delivery with <strong>{{courier_partner}}</strong>.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#fbf8f1;border:1px solid #eadcbe;margin-bottom:16px;">
  <tr><td style="padding:14px 16px;font-size:13px;">
    <div><strong>Order ID:</strong> {{order_id}}</div>
    <div><strong>Courier Partner:</strong> {{courier_partner}}</div>
    <div><strong>Tracking Number:</strong> {{tracking_number}}</div>
    <div><strong>Delivery Address:</strong> {{delivery_address}}</div>
    {{estimated_delivery_row}}
  </td></tr>
</table>
{{cta_button}}`,
    textContent: `Dear {{customer_name}},\n\nYour order #{{order_id}} is out for delivery!\nCourier: {{courier_partner}}\nTracking Number: {{tracking_number}}\nDelivery Address: {{delivery_address}}\nExpected Delivery: {{estimated_delivery}}\n\nTrack Shipment: {{cta_url}}`,
  },
  {
    templateKey: 'order_delivered',
    templateName: 'Order Delivered',
    category: 'transactional',
    subject: 'Your Order Has Been Delivered! – Seth And Sons DryFruits',
    variables: ['{{customer_name}}', '{{order_id}}', '{{delivered_date}}', '{{product_name}}', '{{brand_name}}', '{{support_email}}'],
    htmlContent: `<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 12px 0;font-size:24px;">Delivered with Care</h2>
<p style="margin:0 0 14px 0;">Dear {{customer_name}},</p>
<p style="margin:0 0 16px 0;background-color:#eef6f3;border-left:4px solid #064e3b;padding:14px 16px;color:#064e3b;font-weight:600;">Your order has been successfully delivered. We hope you enjoy the freshness and quality of our premium dry fruits!</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#fbf8f1;border:1px solid #eadcbe;margin-bottom:16px;">
  <tr><td style="padding:14px 16px;font-size:13px;">
    <div><strong>Order ID:</strong> {{order_id}}</div>
    <div><strong>Delivered Date:</strong> {{delivered_date}}</div>
  </td></tr>
</table>
{{order_items_html}}
<p style="margin:16px 0 0 0;font-size:13px;">Need assistance? Reach us anytime at <a href="mailto:{{support_email}}" style="color:#064e3b;">{{support_email}}</a>.</p>
{{cta_button}}`,
    textContent: `Dear {{customer_name}},\n\nYour order #{{order_id}} was delivered on {{delivered_date}}.\nYour order has been successfully delivered. We hope you enjoy the freshness and quality of our premium dry fruits!\n\n{{order_items_text}}\n\nShop Again: {{cta_url}}\nSupport: {{support_email}}`,
  },
  {
    templateKey: 'order_cancelled',
    templateName: 'Order Cancelled',
    category: 'transactional',
    subject: 'Your Order Has Been Cancelled – Order #{{order_id}}',
    variables: ['{{customer_name}}', '{{order_id}}', '{{cancellation_date}}', '{{cancellation_reason}}', '{{refund_status}}', '{{refund_amount}}', '{{brand_name}}', '{{support_email}}'],
    htmlContent: `<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 12px 0;font-size:24px;">Order Cancellation Confirmation</h2>
<p style="margin:0 0 14px 0;">Dear {{customer_name}},</p>
<p style="margin:0 0 16px 0;">Your order <strong>#{{order_id}}</strong> has been cancelled as of <strong>{{cancellation_date}}</strong>.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#fbf8f1;border:1px solid #eadcbe;margin-bottom:16px;">
  <tr><td style="padding:14px 16px;font-size:13px;">
    <div><strong>Order ID:</strong> {{order_id}}</div>
    <div><strong>Cancellation Date:</strong> {{cancellation_date}}</div>
    <div><strong>Cancellation Reason:</strong> {{cancellation_reason}}</div>
    {{refund_summary_row}}
  </td></tr>
</table>
<p style="margin:0 0 12px 0;font-size:13px;">If you have any questions, please contact our support team at <a href="mailto:{{support_email}}" style="color:#064e3b;">{{support_email}}</a>.</p>
{{cta_button}}`,
    textContent: `Dear {{customer_name}},\n\nYour order #{{order_id}} has been cancelled on {{cancellation_date}}.\nReason: {{cancellation_reason}}\nRefund Status: {{refund_status}} {{refund_amount}}\n\nContact Support: {{support_email}}\nContinue Shopping: {{cta_url}}`,
  },
  {
    templateKey: 'refund_processed',
    templateName: 'Refund Processed',
    category: 'transactional',
    subject: 'Your Refund Has Been Processed – Order #{{order_id}}',
    variables: ['{{customer_name}}', '{{order_id}}', '{{refund_amount}}', '{{refund_reference_id}}', '{{refund_date}}', '{{payment_method}}', '{{bank_eta}}', '{{brand_name}}', '{{support_email}}'],
    htmlContent: `<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 12px 0;font-size:24px;">Refund Processed</h2>
<p style="margin:0 0 14px 0;">Dear {{customer_name}},</p>
<p style="margin:0 0 16px 0;">Your refund for order <strong>#{{order_id}}</strong> has been verified and processed.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#fbf8f1;border:1px solid #c9a23f;margin-bottom:16px;">
  <tr><td style="padding:16px;font-size:14px;">
    <div><strong>Order ID:</strong> {{order_id}}</div>
    <div><strong>Refund Amount:</strong> <span style="color:#064e3b;font-weight:bold;">{{refund_amount}}</span></div>
    <div><strong>Refund Reference ID:</strong> {{refund_reference_id}}</div>
    <div><strong>Refund Date:</strong> {{refund_date}}</div>
    <div><strong>Payment Method:</strong> {{payment_method}}</div>
    {{bank_eta_row}}
  </td></tr>
</table>
{{cta_button}}`,
    textContent: `Dear {{customer_name}},\n\nYour verified refund for order #{{order_id}} has been processed.\nRefund Amount: {{refund_amount}}\nRefund Reference ID: {{refund_reference_id}}\nRefund Date: {{refund_date}}\nPayment Method: {{payment_method}}\n{{bank_eta}}\n\nView Order: {{cta_url}}`,
  },
  {
    templateKey: 'new_product_announcement',
    templateName: 'New Product Announcement',
    category: 'marketing',
    subject: 'New Arrival from Jammu: {{product_name}} – {{brand_name}}',
    variables: ['{{customer_name}}', '{{product_name}}', '{{product_price}}', '{{product_description}}', '{{product_variants}}', '{{brand_name}}', '{{support_email}}'],
    htmlContent: `<div style="font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#b99225;font-weight:bold;margin-bottom:8px;">Fresh Harvest Arrival</div>
<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 14px 0;font-size:26px;">Introducing {{product_name}}</h2>
<p style="margin:0 0 16px 0;">Dear {{customer_name}}, we are delighted to present our latest reserve directly graded in Jammu.</p>
{{product_showcase_html}}
{{cta_button}}`,
    textContent: `Dear {{customer_name}},\n\nIntroducing {{product_name}} ({{product_price}}) at {{brand_name}}!\n\n{{product_description}}\nVariants: {{product_variants}}\n\nShop Now: {{cta_url}}`,
  },
  {
    templateKey: 'festival_sale_announcement',
    templateName: 'Festival Sale Announcement',
    category: 'marketing',
    subject: 'Celebrate {{festival_name}} with Premium Dry Fruits – Special Festive Offers Inside!',
    variables: ['{{customer_name}}', '{{festival_name}}', '{{campaign_title}}', '{{coupon_code}}', '{{discount_badge}}', '{{brand_name}}', '{{support_email}}'],
    htmlContent: `<div style="font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#b99225;font-weight:bold;margin-bottom:8px;">{{festival_name}} Celebration</div>
<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 14px 0;font-size:26px;">{{campaign_title}}</h2>
{{banner_html}}
<div style="margin:16px 0;">{{campaign_body_html}}</div>
{{coupon_box_html}}
{{product_cards_html}}
{{cta_button}}`,
    textContent: `Dear {{customer_name}},\n\n{{campaign_title}} ({{festival_name}})\n\n{{campaign_body_text}}\n{{coupon_text}}\n\nShop Festive Offers: {{cta_url}}`,
  },
  {
    templateKey: 'promotional_offers',
    templateName: 'Promotional Offers',
    category: 'marketing',
    subject: 'Exclusive Patron Offer from {{brand_name}}',
    variables: ['{{customer_name}}', '{{campaign_title}}', '{{coupon_code}}', '{{discount_badge}}', '{{brand_name}}', '{{support_email}}'],
    htmlContent: `<div style="font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#b99225;font-weight:bold;margin-bottom:8px;">Privileged Patron Offer</div>
<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 14px 0;font-size:26px;">{{campaign_title}}</h2>
{{banner_html}}
<div style="margin:16px 0;">{{campaign_body_html}}</div>
{{coupon_box_html}}
{{product_cards_html}}
{{cta_button}}`,
    textContent: `Dear {{customer_name}},\n\n{{campaign_title}}\n{{campaign_body_text}}\n{{coupon_text}}\n\nExplore Offers: {{cta_url}}`,
  },
  {
    templateKey: 'customer_feedback_request',
    templateName: 'Customer Feedback Request',
    category: 'marketing',
    subject: 'How Was Your Recent Jammu Harvest? – {{brand_name}}',
    variables: ['{{customer_name}}', '{{order_id}}', '{{product_name}}', '{{brand_name}}', '{{support_email}}'],
    htmlContent: `<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 12px 0;font-size:24px;">We Value Your Connoisseur Feedback</h2>
<p style="margin:0 0 14px 0;">Dear {{customer_name}},</p>
<p style="margin:0 0 16px 0;">We hope you enjoyed your recent selection from <strong>{{brand_name}}</strong> (Order #{{order_id}}). Your thoughts help the Seth family uphold three generations of Jammu grading excellence.</p>
{{cta_button}}`,
    textContent: `Dear {{customer_name}},\n\nWe would love to hear how you enjoyed your recent order (#{{order_id}}) from {{brand_name}}.\nShare feedback or reply to {{support_email}}.\n\nVisit Your Account: {{cta_url}}`,
  },
  {
    templateKey: 'email_change_verification',
    templateName: 'Reset / Change Email Verification',
    category: 'transactional',
    subject: 'Confirm Your New Email Address – {{brand_name}}',
    variables: ['{{customer_name}}', '{{customer_email}}', '{{new_email}}', '{{verification_url}}', '{{brand_name}}', '{{support_email}}'],
    htmlContent: `<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 14px 0;font-size:24px;">Confirm Your New Email Address</h2>
<p style="margin:0 0 14px 0;">Dear {{customer_name}},</p>
<p style="margin:0 0 14px 0;">We received a request to update the registered email address on your <strong>{{brand_name}}</strong> account from <strong>{{customer_email}}</strong> to <strong>{{new_email}}</strong>.</p>
<p style="margin:0 0 14px 0;">Click below to confirm this email change and bind your account to your new address:</p>
{{cta_button}}
<p style="margin:0 0 10px 0;font-size:13px;color:#5a6860;">This single-use confirmation link expires in <strong>24 hours</strong>.</p>
<p style="margin:0;font-size:12px;color:#6c7a72;word-break:break-all;">If you did not request this email change, ignore this message or write to {{support_email}}.<br />Verification link: {{verification_url}}</p>`,
    textContent: `Dear {{customer_name}},\n\nConfirm changing your {{brand_name}} account email from {{customer_email}} to {{new_email}}:\n{{verification_url}}\n\nThis link expires in 24 hours. If you did not request this change, please contact {{support_email}}.`,
  },
  {
    templateKey: 'password_changed',
    templateName: 'Password Updated Security Notice',
    category: 'transactional',
    subject: 'Security Notice: Password Changed – {{brand_name}}',
    variables: ['{{customer_name}}', '{{customer_email}}', '{{brand_name}}', '{{support_email}}', '{{cta_url}}'],
    htmlContent: `<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 14px 0;font-size:24px;">Password Updated</h2>
<p style="margin:0 0 14px 0;">Dear {{customer_name}},</p>
<p style="margin:0 0 14px 0;">This security notification confirms that the password for your <strong>{{brand_name}}</strong> account (<strong>{{customer_email}}</strong>) was just changed.</p>
<div style="background-color:#fbf8f1;border-left:4px solid #c9a23f;padding:12px 16px;margin:16px 0;font-size:13px;color:#35403a;">
  For your protection, all previous active browser sessions have been signed out.
</div>
{{cta_button}}
<p style="margin:0;font-size:12px;color:#6c7a72;">If you did not authorize this update, contact us immediately at <a href="mailto:{{support_email}}" style="color:#064e3b;">{{support_email}}</a>.</p>`,
    textContent: `Dear {{customer_name}},\n\nYour password for {{brand_name}} ({{customer_email}}) was just updated and all previous sessions were signed out.\nReview your account security: {{cta_url}}\nIf you did not make this change, contact {{support_email}} immediately.`,
  },
  {
    templateKey: 'admin_welcome',
    templateName: 'Admin & Staff Welcome Email',
    category: 'transactional',
    subject: 'Welcome to the {{brand_name}} Admin Portal',
    variables: ['{{admin_name}}', '{{admin_email}}', '{{assigned_role}}', '{{permissions_list}}', '{{admin_portal_url}}', '{{brand_name}}', '{{support_email}}'],
    htmlContent: `<div style="font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#b99225;font-weight:bold;margin-bottom:8px;">Executive Administration Access</div>
<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 14px 0;font-size:24px;">Welcome, {{admin_name}}</h2>
<p style="margin:0 0 14px 0;">Your administrative profile for the <strong>{{brand_name}}</strong> management portal is now active for <strong>{{admin_email}}</strong>.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#fbf8f1;border:1px solid #eadcbe;margin-bottom:18px;">
  <tr>
    <td style="padding:14px 16px;font-size:13px;line-height:1.7;">
      <div><strong>Assigned Role:</strong> {{assigned_role}}</div>
      <div><strong>Permitted Modules:</strong> {{permissions_list}}</div>
      <div><strong>Sign-In Method:</strong> Passwordless One-Time Email OTP</div>
      <div><strong>Portal URL:</strong> {{admin_portal_url}}</div>
    </td>
  </tr>
</table>
{{cta_button}}
<p style="margin:0;font-size:12px;color:#6c7a72;">To sign in, open the Admin Portal, enter <strong>{{admin_email}}</strong>, and enter the 6-digit OTP sent to your inbox.</p>`,
    textContent: `Welcome, {{admin_name}}!\n\nYour {{brand_name}} Admin Portal account ({{admin_email}}) is active.\nRole: {{assigned_role}}\nModules: {{permissions_list}}\nSign-In Method: Passwordless Email OTP\nAdmin Portal: {{admin_portal_url}}\n\nSupport: {{support_email}}`,
  },
  {
    templateKey: 'admin_login_otp',
    templateName: 'Admin Portal Login OTP',
    category: 'transactional',
    subject: '{{otp_code}} is your {{brand_name}} Admin Portal Login OTP',
    variables: ['{{admin_name}}', '{{admin_email}}', '{{otp_code}}', '{{expires_minutes}}', '{{admin_portal_url}}', '{{brand_name}}', '{{support_email}}'],
    htmlContent: `<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 12px 0;font-size:24px;">Admin Portal Verification Code</h2>
<p style="margin:0 0 12px 0;">Namaste <strong>{{admin_name}}</strong>,</p>
<p style="margin:0 0 16px 0;color:#4a5550;">Use this single-use verification code to sign in to the <strong>{{brand_name}}</strong> Admin Portal for <strong>{{admin_email}}</strong>:</p>
<div style="margin:18px 0;padding:18px 24px;background-color:#fbf8f1;border:2px solid #c9a23f;border-radius:12px;text-align:center;">
  <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6c7a72;margin-bottom:6px;">Admin Login OTP</div>
  <div style="font-family:'Courier New',monospace;font-size:32px;font-weight:bold;letter-spacing:10px;color:#064e3b;">{{otp_code}}</div>
</div>
{{cta_button}}
<p style="margin:0 0 8px 0;font-size:13px;color:#5a6860;">This single-use OTP expires in <strong>{{expires_minutes}} minutes</strong>. Never share this code with anyone.</p>
<p style="margin:0;font-size:12px;color:#6c7a72;">If you did not request Admin Portal access ({{admin_portal_url}}), you can safely ignore this message.</p>`,
    textContent: `Namaste {{admin_name}},\n\nYour {{brand_name}} Admin Portal Login OTP for {{admin_email}} is: {{otp_code}}\n\nThis single-use OTP expires in {{expires_minutes}} minutes. Never share this code.\nPortal: {{admin_portal_url}}`,
  },
  {
    templateKey: 'admin_order_alert',
    templateName: 'Admin New Order Notification',
    category: 'transactional',
    subject: 'New Order #{{order_id}} ({{order_total}}) – {{brand_name}}',
    variables: ['{{admin_name}}', '{{order_id}}', '{{order_date}}', '{{customer_name}}', '{{customer_email}}', '{{order_total}}', '{{payment_method}}', '{{delivery_address}}', '{{admin_portal_url}}', '{{brand_name}}', '{{support_email}}'],
    htmlContent: `<div style="font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#b99225;font-weight:bold;margin-bottom:8px;">Storefront Order Alert</div>
<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 12px 0;font-size:24px;">New Order #{{order_id}}</h2>
<p style="margin:0 0 14px 0;">Namaste {{admin_name}}, customer <strong>{{customer_name}}</strong> ({{customer_email}}) placed a new order on <strong>{{order_date}}</strong>.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#fbf8f1;border:1px solid #eadcbe;margin-bottom:16px;">
  <tr>
    <td style="padding:14px 16px;font-size:13px;line-height:1.7;">
      <div><strong>Order Total:</strong> {{order_total}}</div>
      <div><strong>Payment Method:</strong> {{payment_method}}</div>
      <div><strong>Delivery Address:</strong> {{delivery_address}}</div>
    </td>
  </tr>
</table>
{{order_items_html}}
<div style="margin-top:16px;">{{cta_button}}</div>`,
    textContent: `Namaste {{admin_name}},\n\nNew order #{{order_id}} placed on {{order_date}} by {{customer_name}} ({{customer_email}}).\nTotal: {{order_total}} | Payment: {{payment_method}}\nDelivery Address: {{delivery_address}}\n\nItems:\n{{order_items_text}}\n\nReview in Admin Portal: {{admin_portal_url}}`,
  },
  {
    templateKey: 'customer_service_ack',
    templateName: 'Customer Service Request Received',
    category: 'transactional',
    subject: 'Support Request Received [#{{ticket_number}}] – {{brand_name}}',
    variables: ['{{customer_name}}', '{{customer_email}}', '{{ticket_number}}', '{{ticket_category}}', '{{ticket_subject}}', '{{attachment_count}}', '{{brand_name}}', '{{support_email}}'],
    htmlContent: `<div style="font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#b99225;font-weight:bold;margin-bottom:8px;">Jammu Patron Concierge</div>
<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 12px 0;font-size:24px;">We Have Received Your Request</h2>
<p style="margin:0 0 14px 0;">Dear {{customer_name}},</p>
<p style="margin:0 0 14px 0;">Thank you for contacting <strong>{{brand_name}} Customer Service</strong>. Our concierge team is reviewing your inquiry and any uploaded documents.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#fbf8f1;border:1px solid #eadcbe;margin-bottom:16px;">
  <tr>
    <td style="padding:14px 16px;font-size:13px;line-height:1.7;">
      <div><strong>Ticket Reference:</strong> #{{ticket_number}}</div>
      <div><strong>Category:</strong> {{ticket_category}}</div>
      <div><strong>Subject:</strong> {{ticket_subject}}</div>
      <div><strong>Attachments Received:</strong> {{attachment_count}}</div>
    </td>
  </tr>
</table>
{{cta_button}}
<p style="margin:0;font-size:12px;color:#6c7a72;">We will respond directly by email from <strong>{{support_email}}</strong>.</p>`,
    textContent: `Dear {{customer_name}},\n\nYour Customer Service request (#{{ticket_number}}) has been received by {{brand_name}}.\nCategory: {{ticket_category}}\nSubject: {{ticket_subject}}\nAttachments: {{attachment_count}}\n\nTrack Your Complaint: {{cta_url}}\nSupport: {{support_email}}`,
  },
  {
    templateKey: 'admin_support_alert',
    templateName: 'Admin Customer Service Complaint Alert',
    category: 'transactional',
    subject: 'New Customer Complaint [#{{ticket_number}}] – {{ticket_subject}}',
    variables: ['{{admin_name}}', '{{ticket_number}}', '{{customer_name}}', '{{customer_email}}', '{{ticket_category}}', '{{ticket_subject}}', '{{attachment_count}}', '{{admin_portal_url}}', '{{brand_name}}', '{{support_email}}'],
    htmlContent: `<div style="font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#b99225;font-weight:bold;margin-bottom:8px;">Customer Service Alert</div>
<h2 style="font-family:Georgia,serif;color:#064e3b;margin:0 0 12px 0;font-size:24px;">Complaint / Inquiry #{{ticket_number}}</h2>
<p style="margin:0 0 14px 0;">Namaste {{admin_name}}, <strong>{{customer_name}}</strong> ({{customer_email}}) submitted or updated a Customer Service request.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#fbf8f1;border:1px solid #eadcbe;margin-bottom:16px;">
  <tr>
    <td style="padding:14px 16px;font-size:13px;line-height:1.7;">
      <div><strong>Ticket Reference:</strong> #{{ticket_number}}</div>
      <div><strong>Category:</strong> {{ticket_category}}</div>
      <div><strong>Subject:</strong> {{ticket_subject}}</div>
      <div><strong>Attachments:</strong> {{attachment_count}}</div>
    </td>
  </tr>
</table>
<div style="margin:0 0 16px 0;padding:12px 16px;background-color:#f8f6f0;border-left:4px solid #c9a23f;font-size:13px;color:#252923;line-height:1.6;">
  {{ticket_description}}
</div>
{{support_attachments_html}}
<div style="margin-top:16px;">{{cta_button}}</div>`,
    textContent: `Namaste {{admin_name}},\n\nCustomer Service Ticket #{{ticket_number}} from {{customer_name}} ({{customer_email}}).\nCategory: {{ticket_category}}\nSubject: {{ticket_subject}}\nAttachments: {{attachment_count}}\n\nDetails:\n{{ticket_description}}\n\nReview & Reply in Admin Portal: {{admin_portal_url}}`,
  },
];

