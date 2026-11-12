import { useEffect } from 'react';
import { PurchaseRequest } from '../types/product';
import { formatINR } from '../utils/priceCalculator';
import { generateWhatsAppUrl } from '../utils/whatsapp';
import confetti from 'canvas-confetti';
import { CheckCircle2, MessageCircle, Copy, ArrowLeft, Printer, AlertCircle } from 'lucide-react';
import { useState } from 'react';

interface OrderConfirmationModalProps {
  request: PurchaseRequest;
  onClose: () => void;
  onNewOrder: () => void;
}

export default function OrderConfirmationModal({
  request,
  onClose,
  onNewOrder,
}: OrderConfirmationModalProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Fire celebratory confetti on mount
    try {
      confetti({
        particleCount: 65,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#dfc471', '#d4af37', '#f9f6f2', '#b99225']
      });
    } catch {
      // ignore
    }
  }, []);

  const handleCopySummary = () => {
    const summaryText = `Seth And Sons DryFruits Purchase Request: ${request.id}\nCustomer: ${request.customer.fullName}\nTotal Estimated: ${formatINR(request.totalEstimatedAmount)}\nItems:\n${request.items.map(it => `• ${it.product.name} (${it.quantity} ${it.product.unit === 'gram' ? 'g' : it.product.unit === 'ml' ? 'ml' : it.product.unit === 'piece' ? 'pc' : 'kg'}) = ${formatINR(it.subtotal)}`).join('\n')}`;
    navigator.clipboard.writeText(summaryText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  const whatsappUrl = generateWhatsAppUrl(request);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-[#0d0805]/85 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-[#150d09] border border-[#dfc471]/40 rounded-3xl p-6 sm:p-10 shadow-2xl text-[#ede4dc] my-8 max-h-[90vh] overflow-y-auto">
        {/* Top Decorative Header */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-[#251a13] border border-[#dfc471]/40 flex items-center justify-center mx-auto mb-4 text-[#dfc471]">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <span className="text-[11px] font-sans tracking-[0.25em] text-[#dfc471] uppercase font-semibold">
            Request Reference: {request.id}
          </span>

          <h3 className="font-serif text-2xl sm:text-3xl font-medium text-[#f9f6f2] mt-1">
            Purchase Request Received
          </h3>

          {/* Mandatory User Notice */}
          <div className="mt-4 p-4 rounded-xl bg-[#251a13]/80 border border-[#dfc471]/30 text-xs sm:text-sm text-[#ecdda7] leading-relaxed text-balance text-left flex gap-3">
            <AlertCircle className="w-5 h-5 text-[#dfc471] shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block mb-0.5 text-[#f9f6f2]">
                Important Request Information
              </span>
              Thank you for your interest! Your purchase request has been received. We will contact you shortly to confirm product availability, delivery details, and the final order.
            </div>
          </div>
        </div>

        {/* Structured Request Breakdown */}
        <div className="mt-8 pt-6 border-t border-[#38281d] space-y-4">
          <div className="flex items-center justify-between text-xs tracking-wider uppercase text-[#d5c4b4]/70 font-semibold">
            <span>Requested Product</span>
            <span>Subtotal</span>
          </div>

          <div className="divide-y divide-[#251a13] text-sm">
            {request.items.map((item, idx) => (
              <div key={idx} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-[#f9f6f2]">{item.product.name}</div>
                  <div className="text-xs text-[#d5c4b4]/70">
                    {item.quantity} {item.product.unit === 'gram' ? 'g' : item.product.unit === 'ml' ? 'ml' : item.product.unit === 'piece' ? 'pc' : 'kg'} × {formatINR(item.product.price)}
                  </div>
                </div>
                <div className="font-bold text-[#dfc471] tabular-nums">
                  {formatINR(item.subtotal)}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-[#38281d] flex items-center justify-between text-base sm:text-lg">
            <span className="font-serif font-medium text-[#ede4dc]">
              Estimated Order Total:
            </span>
            <span className="font-sans font-bold text-2xl text-[#dfc471] tabular-nums">
              {formatINR(request.totalEstimatedAmount)}
            </span>
          </div>
        </div>

        {/* Customer & Delivery Summary */}
        <div className="mt-6 p-4 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#d5c4b4] space-y-1.5">
          <div>
            <span className="text-[#d5c4b4]/60">Customer:</span>{' '}
            <strong className="text-[#ede4dc]">{request.customer.fullName}</strong> ({request.customer.mobileNumber})
          </div>
          <div>
            <span className="text-[#d5c4b4]/60">Deliver to:</span>{' '}
            <span className="text-[#ede4dc]">
              {request.customer.deliveryAddress}, {request.customer.city}, {request.customer.state} - {request.customer.pincode}
            </span>
          </div>
          {request.customer.instructions && (
            <div>
              <span className="text-[#d5c4b4]/60">Instructions:</span>{' '}
              <span className="text-[#ede4dc] italic">{request.customer.instructions}</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col gap-3">
          {/* Primary WhatsApp Action */}
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-3 px-6 py-4 rounded-full text-sm font-semibold tracking-wider uppercase bg-[#25D366] hover:bg-[#20ba59] text-white shadow-xl shadow-[#25D366]/20 transition-all cursor-pointer"
          >
            <MessageCircle className="w-5 h-5 fill-current" />
            <span>Send Request via WhatsApp</span>
          </a>

          {/* Secondary Utility Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleCopySummary}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full text-xs font-medium uppercase tracking-wider bg-[#251a13] hover:bg-[#38281d] text-[#ede4dc] border border-[#38281d] transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-[#dfc471]" />
              <span>{copied ? 'Copied to Clipboard!' : 'Copy Summary'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full text-xs font-medium uppercase tracking-wider bg-[#251a13] hover:bg-[#38281d] text-[#ede4dc] border border-[#38281d] transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-[#dfc471]" />
              <span>Print Slip</span>
            </button>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[#38281d] text-xs">
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-[#d5c4b4] hover:text-[#ede4dc] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Homepage</span>
            </button>

            <button
              onClick={onNewOrder}
              className="text-[#dfc471] hover:underline transition-colors cursor-pointer font-medium"
            >
              Start Another Request
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
