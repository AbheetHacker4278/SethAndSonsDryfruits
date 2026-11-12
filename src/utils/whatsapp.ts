import { PurchaseRequest } from '../types/product';
import { BRAND_CONFIG } from '../data/products';
import { formatINR } from './priceCalculator';

/**
 * Builds a structured, beautifully formatted WhatsApp text message for the purchase request
 */
export function buildWhatsAppMessage(request: PurchaseRequest): string {
  const { customer, items, totalEstimatedAmount, id } = request;

  const lines: string[] = [
    `✨ *PURCHASE REQUEST: ${id}* ✨`,
    `_Seth And Sons DryFruits — Nature's Finest_`,
    ``,
    `*Customer Details:*`,
    `• Name: ${customer.fullName}`,
    `• Phone: ${customer.mobileNumber}`,
    customer.whatsappNumber && customer.whatsappNumber !== customer.mobileNumber
      ? `• WhatsApp: ${customer.whatsappNumber}`
      : null,
    customer.email ? `• Email: ${customer.email}` : null,
    `• Delivery Address: ${customer.deliveryAddress}, ${customer.city}, ${customer.state} - ${customer.pincode}`,
    customer.instructions ? `• Notes: ${customer.instructions}` : null,
    ``,
    `*Selected Products & Quantities:*`,
    ...items.map(item => {
      const unitLabel = item.product.unit === 'gram' ? 'g' : item.product.unit === 'ml' ? 'ml' : item.product.unit === 'piece' ? 'pc' : 'kg';
      return `• *${item.product.name}*\n  Qty: ${item.quantity} ${unitLabel} @ ${formatINR(item.product.price)}/${unitLabel} = *${formatINR(item.subtotal)}*`;
    }),
    ``,
    `*Estimated Total Amount:* *${formatINR(totalEstimatedAmount)}*`,
    ``,
    `📌 *Request Note:*`,
    `This is a purchase request. Please confirm product availability, shipping schedule, and payment details at your earliest convenience.`
  ].filter(Boolean) as string[];

  return lines.join('\n');
}

/**
 * Generates the direct WhatsApp click-to-chat URL with encoded message
 */
export function generateWhatsAppUrl(request: PurchaseRequest, businessPhone?: string): string {
  const phone = (businessPhone || BRAND_CONFIG.whatsappBusinessNumber).replace(/[^0-9]/g, '');
  const message = buildWhatsAppMessage(request);
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
