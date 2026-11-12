import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  Package,
  ShieldCheck,
  Truck,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import { apiRequest, ApiError, PersistedOrder } from '../services/api';
import { formatINR } from '../utils/priceCalculator';

const TRACKING_STAGES = [
  { key: 'placed', label: 'Order Placed', desc: 'Your order request was received.' },
  { key: 'confirmed', label: 'Order Confirmed', desc: 'Confirmed by Jammu concierge team.' },
  { key: 'processing', label: 'Processing', desc: 'Harvest batch inspected & quality checked.' },
  { key: 'packed', label: 'Packed', desc: 'Sealed for freshness & aroma preservation.' },
  { key: 'dispatched', label: 'Dispatched', desc: 'Handed over to courier partner.' },
  { key: 'out_for_delivery', label: 'Out for Delivery', desc: 'Arriving at your delivery address.' },
  { key: 'delivered', label: 'Delivered', desc: 'Successfully delivered to recipient.' },
] as const;

export default function OrderTracking() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<PersistedOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelForm, setShowCancelForm] = useState(false);

  const loadOrder = async () => {
    if (!orderId) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<{ order: PersistedOrder }>(`/api/orders/${encodeURIComponent(orderId)}`);
      setOrder(res.order);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load order tracking details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrder();
  }, [orderId]);

  const handleCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    setCancelling(true);
    try {
      const res = await apiRequest<{ order: PersistedOrder }>(
        `/api/orders/${encodeURIComponent(order.orderNumber)}/cancel`,
        {
          method: 'POST',
          body: { reason: cancelReason.trim() || 'Cancelled by customer' },
        }
      );
      setOrder(res.order);
      setShowCancelForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel order.');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0805] text-[#ede4dc] pt-32 pb-24 px-4 text-center">
        <p className="text-sm text-[#d5c4b4]/75">Loading shipment timeline...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#0d0805] text-[#ede4dc] pt-32 pb-24 px-4">
        <div className="max-w-xl mx-auto bg-[#150d09] border border-red-500/40 rounded-3xl p-8 text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
          <h1 className="font-serif text-2xl text-[#f9f6f2]">Order Tracking Unavailable</h1>
          <p className="text-sm text-red-200/80">{error || 'Order not found.'}</p>
          <Link
            to="/account"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#dfc471] text-[#0d0805]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Account</span>
          </Link>
        </div>
      </div>
    );
  }

  const currentStageIdx = TRACKING_STAGES.findIndex(s => s.key === order.status);
  const historyMap = new Map(order.statusHistory.map(h => [h.newStatus, h]));
  const isCancelled = order.status === 'cancelled';

  return (
    <div className="min-h-screen bg-[#0d0805] text-[#ede4dc] pt-28 pb-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            to="/account?tab=orders"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#d5c4b4] hover:text-[#dfc471]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to My Orders</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="text-xs px-3 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/30 text-emerald-300 font-medium capitalize">
              Status: {order.status.replace(/_/g, ' ')}
            </span>
            {['placed', 'confirmed'].includes(order.status) && (
              <button
                onClick={() => setShowCancelForm(s => !s)}
                className="text-xs px-3.5 py-1 rounded-full bg-red-950/60 hover:bg-red-900/70 border border-red-500/40 text-red-200 cursor-pointer"
              >
                Cancel Order
              </button>
            )}
          </div>
        </div>

        {/* Header Card */}
        <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] uppercase tracking-[0.25em] text-[#dfc471] font-semibold">
              Seth And Sons DryFruits • Order Tracking
            </span>
            <h1 className="font-serif text-3xl text-[#f9f6f2] mt-1">Order #{order.orderNumber}</h1>
            <p className="text-xs text-[#d5c4b4]/70 mt-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>
                Placed on{' '}
                {new Date(order.createdAt).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </p>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-[11px] uppercase tracking-wider text-[#d5c4b4]/60">Total Amount</div>
            <div className="text-2xl font-bold text-[#dfc471] tabular-nums">{formatINR(order.totalAmount)}</div>
            <div className="text-xs text-[#d5c4b4]/70">
              {order.paymentMethod} • <span className="uppercase">{order.paymentStatus}</span>
            </div>
          </div>
        </div>

        {showCancelForm && (
          <form
            onSubmit={handleCancelOrder}
            className="bg-[#150d09] border border-red-500/40 rounded-2xl p-5 space-y-3"
          >
            <h3 className="font-serif text-lg text-[#f9f6f2]">Cancel Order #{order.orderNumber}</h3>
            <input
              type="text"
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Optional reason for cancellation..."
              className="w-full px-4 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2] focus:outline-none focus:border-[#dfc471]"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowCancelForm(false)}
                className="px-4 py-2 rounded-full text-xs bg-[#251a13] text-[#d5c4b4] cursor-pointer"
              >
                Keep Order
              </button>
              <button
                type="submit"
                disabled={cancelling}
                className="px-5 py-2 rounded-full text-xs font-semibold bg-red-600 hover:bg-red-500 text-white cursor-pointer"
              >
                {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </form>
        )}

        {/* Cancelled / Refund Banner */}
        {isCancelled && (
          <div className="bg-red-950/40 border border-red-500/40 rounded-2xl p-5 flex items-start gap-3">
            <XCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs sm:text-sm">
              <div className="font-semibold text-red-200">
                Order Cancelled {order.cancelledAt ? `on ${new Date(order.cancelledAt).toLocaleDateString('en-IN')}` : ''}
              </div>
              {order.cancellationReason && (
                <div className="text-red-200/80">Reason: {order.cancellationReason}</div>
              )}
              {order.refundStatus && order.refundStatus !== 'none' && (
                <div className="text-emerald-300 pt-1">
                  Refund Status: <strong className="uppercase">{order.refundStatus.replace('_', ' ')}</strong>
                  {order.refundAmount ? ` • ${formatINR(order.refundAmount)}` : ''}
                  {order.refundReferenceId ? ` • Ref: ${order.refundReferenceId}` : ''}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 7-Stage Vertical/Horizontal Progress Timeline */}
        {!isCancelled && (
          <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-6 sm:p-8 shadow-xl">
            <h2 className="font-serif text-2xl text-[#f9f6f2] mb-6">Order &amp; Harvest Fulfillment Timeline</h2>

            <div className="space-y-0">
              {TRACKING_STAGES.map((stage, idx) => {
                const entry = historyMap.get(stage.key);
                const isCompleted = Boolean(entry) || (currentStageIdx >= idx && currentStageIdx !== -1);
                const isCurrent = order.status === stage.key;
                const ts = entry?.timestamp ? new Date(entry.timestamp) : null;

                return (
                  <div key={stage.key} className="relative flex gap-4 pb-6 last:pb-0">
                    {idx < TRACKING_STAGES.length - 1 && (
                      <div
                        className={`absolute left-4 top-8 bottom-0 w-0.5 ${
                          currentStageIdx > idx ? 'bg-emerald-500' : 'bg-[#38281d]'
                        }`}
                      />
                    )}
                    <div
                      className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center border shrink-0 transition-all ${
                        isCurrent
                          ? 'bg-emerald-600 border-[#dfc471] text-white shadow-lg shadow-emerald-900/50'
                          : isCompleted
                          ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                          : 'bg-[#1c120c] border-[#38281d] text-[#d5c4b4]/40'
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <span className="text-xs">{idx + 1}</span>}
                    </div>

                    <div className="flex-1 pt-0.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            isCompleted ? 'text-[#f9f6f2]' : 'text-[#d5c4b4]/50'
                          }`}
                        >
                          {stage.label}
                        </span>
                        {ts && (
                          <span className="text-xs text-[#dfc471]">
                            {ts.toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}{' '}
                            •{' '}
                            {ts.toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#d5c4b4]/75 mt-0.5">
                        {entry?.notes || stage.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Shipment Details & Items Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Shipment Details */}
          <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-6 sm:p-8 space-y-4">
            <div className="flex items-center gap-2 text-[#dfc471]">
              <Truck className="w-5 h-5" />
              <h2 className="font-serif text-2xl text-[#f9f6f2]">Shipment Details</h2>
            </div>

            {order.shipment ? (
              <div className="space-y-3 text-xs sm:text-sm">
                <div className="p-4 rounded-2xl bg-[#1c120c] border border-[#38281d] space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[#d5c4b4]/60">Courier Partner:</span>
                    <span className="font-semibold text-[#f9f6f2]">{order.shipment.courierPartner}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#d5c4b4]/60">Tracking / AWB #:</span>
                    <span className="font-mono font-bold text-[#dfc471]">{order.shipment.trackingNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#d5c4b4]/60">Dispatch Date:</span>
                    <span>{new Date(order.shipment.dispatchDate).toLocaleDateString('en-IN')}</span>
                  </div>
                  {order.shipment.estimatedDeliveryDate && (
                    <div className="flex justify-between">
                      <span className="text-[#d5c4b4]/60">Estimated Delivery:</span>
                      <span className="text-emerald-300 font-medium">
                        {new Date(order.shipment.estimatedDeliveryDate).toLocaleDateString('en-IN')}
                      </span>
                    </div>
                  )}
                  {order.shipment.shipmentNotes && (
                    <div className="pt-2 border-t border-[#251a13] text-xs text-[#d5c4b4]/80">
                      <span className="text-[#d5c4b4]/60">Notes: </span>
                      {order.shipment.shipmentNotes}
                    </div>
                  )}
                </div>

                {order.shipment.trackingUrl && (
                  <a
                    href={order.shipment.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-gradient-to-r from-[#064e3b] to-[#065f46] hover:brightness-110 text-[#dfc471] border border-[#dfc471]/40 flex items-center justify-center gap-2"
                  >
                    <span>Track with Courier</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            ) : (
              <div className="p-5 rounded-2xl bg-[#1c120c] border border-dashed border-[#38281d] text-xs sm:text-sm text-[#d5c4b4]/80 flex items-start gap-3">
                <Package className="w-5 h-5 text-[#dfc471] shrink-0 mt-0.5" />
                <span>Shipment tracking information will be available once your order is dispatched.</span>
              </div>
            )}

            <div className="pt-2 space-y-1.5 text-xs text-[#d5c4b4]/80">
              <div className="flex items-center gap-1.5 text-[#dfc471] font-semibold uppercase tracking-wider text-[11px]">
                <MapPin className="w-3.5 h-3.5" />
                <span>Delivery Address</span>
              </div>
              <p className="text-[#ede4dc]">
                {order.deliveryAddressObj.fullName} ({order.deliveryAddressObj.mobileNumber})
              </p>
              <p>
                {order.deliveryAddressObj.deliveryAddress}, {order.deliveryAddressObj.city},{' '}
                {order.deliveryAddressObj.state} - {order.deliveryAddressObj.pincode}
              </p>
            </div>
          </div>

          {/* Items & Pricing Summary */}
          <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-6 sm:p-8 space-y-4">
            <div className="flex items-center gap-2 text-[#dfc471]">
              <ShieldCheck className="w-5 h-5" />
              <h2 className="font-serif text-2xl text-[#f9f6f2]">Order Summary</h2>
            </div>

            <div className="divide-y divide-[#251a13]">
              {order.items.map(item => (
                <div key={item.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-3">
                    <img
                      src={item.productImage}
                      alt={item.productName}
                      className="w-11 h-11 rounded-xl object-cover bg-[#1c120c] border border-[#38281d]"
                    />
                    <div>
                      <div className="font-medium text-[#f9f6f2]">{item.productName}</div>
                      <div className="text-xs text-[#d5c4b4]/70">
                        {item.weightLabel ? `${item.quantity} × ${item.weightLabel}` : `${item.quantity} ${item.unit === 'gram' ? 'g' : item.unit === 'ml' ? 'ml' : item.unit === 'piece' ? 'pc' : 'kg'}`} × {formatINR(item.unitPrice)}
                      </div>
                    </div>
                  </div>
                  <div className="font-bold text-[#dfc471] tabular-nums">{formatINR(item.subtotal)}</div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-[#38281d] space-y-1.5 text-xs">
              <div className="flex justify-between text-[#d5c4b4]/80">
                <span>Subtotal</span>
                <span>{formatINR(order.subtotal)}</span>
              </div>
              {order.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-300">
                  <span>Discount {order.couponCode ? `(${order.couponCode})` : ''}</span>
                  <span>-{formatINR(order.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-[#d5c4b4]/80">
                <span>Shipping</span>
                <span>{order.shippingCharge > 0 ? formatINR(order.shippingCharge) : 'Complimentary'}</span>
              </div>
              <div className="flex justify-between text-[#d5c4b4]/80">
                <span>Taxes (5% GST)</span>
                <span>{formatINR(order.taxAmount)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#251a13] text-base font-bold text-[#dfc471]">
                <span>Final Amount</span>
                <span>{formatINR(order.totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

