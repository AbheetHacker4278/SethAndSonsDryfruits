import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Clock, MessageCircle, ArrowRight, ShoppingBag, Package, Printer, Truck, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest, PersistedOrder } from '../services/api';
import { formatINR } from '../utils/priceCalculator';
import { generateWhatsAppUrl } from '../utils/whatsapp';
import ScrollReveal from '../components/ScrollReveal';

interface OrderHistoryProps {
  onReorder: (items: { productId: string; quantity: number; variantId?: string | null }[]) => void;
}

export default function OrderHistory({ onReorder }: OrderHistoryProps) {
  const { user, products } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PersistedOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrderForReceipt, setSelectedOrderForReceipt] = useState<PersistedOrder | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    apiRequest<{ orders: PersistedOrder[] }>('/api/orders')
      .then(res => setOrders(res.orders || []))
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [user]);

  const buildWhatsAppForPersistedOrder = (order: PersistedOrder) => {
    return generateWhatsAppUrl({
      id: order.orderNumber,
      createdAt: order.createdAt,
      items: order.items.map(it => ({
        product: products.find(p => p.id === it.productId) || {
          id: it.productId,
          name: it.productName,
          subtitle: '',
          price: it.unitPrice,
          unit: it.unit,
          step: 1,
          minQty: 1,
          image: it.productImage,
          description: '',
          origin: 'Jammu',
          grade: '',
          features: [],
          tasteProfile: '',
        },
        quantity: it.quantity,
        subtotal: it.subtotal,
      })),
      totalEstimatedAmount: order.totalAmount,
      customer: {
        fullName: order.deliveryAddressObj.fullName || order.customerObj.name || '',
        mobileNumber: order.deliveryAddressObj.mobileNumber || order.customerObj.phone || '',
        whatsappNumber: order.deliveryAddressObj.whatsappNumber || '',
        sameAsMobile: true,
        email: order.customerObj.email || '',
        deliveryAddress: order.deliveryAddressObj.deliveryAddress || '',
        city: order.deliveryAddressObj.city || '',
        state: order.deliveryAddressObj.state || '',
        pincode: order.deliveryAddressObj.pincode || '',
        instructions: order.instructions || '',
      },
    });
  };

  return (
    <div className="min-h-screen bg-[#0d0805] text-[#ede4dc] pt-28 pb-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="mb-12 pb-6 border-b border-[#38281d] flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <span className="text-[11px] font-sans tracking-[0.25em] uppercase text-[#dfc471] font-semibold block mb-2">
                Seth And Sons DryFruits • Patron Portal
              </span>
              <h1 className="font-serif text-3xl sm:text-5xl font-normal text-[#f9f6f2] tracking-tight">
                Orders &amp; Shipment History
              </h1>
              <p className="mt-2 text-sm text-[#d5c4b4]/80 font-sans">
                Track live dispatch stages, inspect receipts, and re-order signature Jammu harvests.
              </p>
            </div>

            <Link
              to="/catalog"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#251a13] hover:bg-[#dfc471] text-[#ede4dc] hover:text-[#0d0805] border border-[#dfc471]/30 transition-colors self-start md:self-auto"
            >
              <span>Explore Catalog</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </ScrollReveal>

        {!user ? (
          <div className="text-center py-20 px-6 bg-[#150d09] border border-[#38281d] rounded-3xl max-w-lg mx-auto space-y-4">
            <div className="w-16 h-16 rounded-full bg-[#251a13] border border-[#38281d] flex items-center justify-center mx-auto text-[#dfc471]">
              <Lock className="w-7 h-7" />
            </div>
            <h2 className="font-serif text-2xl text-[#f9f6f2]">Sign In to View Your Orders</h2>
            <p className="text-xs sm:text-sm text-[#d5c4b4]/75">
              Order tracking and purchase history are protected for your privacy.
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <Link
                to="/login?redirect=/orders"
                className="px-6 py-3 rounded-full text-xs font-semibold uppercase tracking-wider bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805]"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="px-6 py-3 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#251a13] text-[#ede4dc] border border-[#38281d]"
              >
                Create Account
              </Link>
            </div>
          </div>
        ) : loading ? (
          <div className="text-center py-12 text-sm text-[#d5c4b4]/70">Loading your orders...</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 px-6 bg-[#150d09] border border-[#38281d] rounded-3xl max-w-lg mx-auto">
            <div className="w-16 h-16 rounded-full bg-[#251a13] border border-[#38281d] flex items-center justify-center mx-auto text-[#dfc471] mb-5">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <h3 className="font-serif text-2xl font-medium text-[#f9f6f2]">No Orders Yet</h3>
            <p className="mt-2 text-xs sm:text-sm text-[#d5c4b4]/70">
              Select your preferred mountain almonds, walnuts, cashews, or pure saffron from our Jammu collection.
            </p>
            <Link
              to="/catalog"
              className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full text-xs font-semibold tracking-wider uppercase bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805]"
            >
              <span>Browse Jammu Harvests</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {orders.map((order, index) => (
              <ScrollReveal key={order.id} delay={index * 0.05}>
                <div className="bg-[#150d09] border border-[#38281d] hover:border-[#dfc471]/40 rounded-2xl p-6 sm:p-8 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#251a13]">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-sans font-bold text-base text-[#f9f6f2]">
                          #{order.orderNumber}
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 capitalize">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span>{order.status.replace(/_/g, ' ')}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[#d5c4b4]/60 mt-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Placed on {new Date(order.createdAt).toLocaleString('en-IN')}</span>
                      </div>
                    </div>

                    <div className="text-left sm:text-right">
                      <span className="text-[11px] text-[#d5c4b4]/60 uppercase tracking-wider block">Order Total</span>
                      <span className="font-sans font-bold text-2xl text-[#dfc471] tabular-nums">
                        {formatINR(order.totalAmount)}
                      </span>
                    </div>
                  </div>

                  <div className="py-5 divide-y divide-[#251a13]">
                    {order.items.map(item => (
                      <div key={item.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4 text-sm">
                        <div className="flex items-center gap-3.5">
                          <img
                            src={item.productImage}
                            alt={item.productName}
                            className="w-12 h-12 rounded-xl object-cover bg-[#251a13] border border-[#38281d]"
                          />
                          <div>
                            <div className="font-medium text-[#f9f6f2]">{item.productName}</div>
                            <div className="text-xs text-[#d5c4b4]/70">
                              {item.weightLabel ? `${item.quantity} × ${item.weightLabel}` : `${item.quantity} ${item.unit === 'gram' ? 'g' : item.unit === 'ml' ? 'ml' : item.unit === 'piece' ? 'pc' : 'kg'}`} @ {formatINR(item.unitPrice)}/{item.weightLabel || item.unit}
                            </div>
                          </div>
                        </div>
                        <div className="font-bold text-[#dfc471] tabular-nums">{formatINR(item.subtotal)}</div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-5 border-t border-[#251a13] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="text-xs text-[#d5c4b4]/70 max-w-md">
                      {order.shipment ? (
                        <span className="text-emerald-300">
                          Shipped via {order.shipment.courierPartner} • AWB: {order.shipment.trackingNumber}
                        </span>
                      ) : (
                        <span>
                          Deliver to: {order.deliveryAddressObj.fullName}, {order.deliveryAddressObj.city} ({order.deliveryAddressObj.pincode})
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <Link
                        to={`/account/orders/${order.orderNumber}`}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-semibold bg-[#064e3b] text-[#dfc471] border border-[#dfc471]/40"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        <span>Track Order</span>
                      </Link>

                      <a
                        href={buildWhatsAppForPersistedOrder(order)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-semibold bg-[#25D366] hover:bg-[#20ba59] text-white"
                      >
                        <MessageCircle className="w-3.5 h-3.5 fill-current" />
                        <span>WhatsApp Concierge</span>
                      </a>

                      <button
                        onClick={() => setSelectedOrderForReceipt(order)}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-medium bg-[#1c120c] text-[#ede4dc] border border-[#38281d] cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5 text-[#dfc471]" />
                        <span>Receipt</span>
                      </button>

                      <button
                        onClick={() => {
                          onReorder(order.items.map(it => ({ productId: it.productId, quantity: it.quantity, variantId: it.variantId })));
                          navigate('/catalog');
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-semibold bg-[#dfc471] text-[#0d0805] cursor-pointer"
                      >
                        <Package className="w-3.5 h-3.5" />
                        <span>Re-Order</span>
                      </button>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        )}

        {selectedOrderForReceipt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0d0805]/85 backdrop-blur-md">
            <div className="relative w-full max-w-xl bg-[#150d09] border border-[#dfc471]/40 rounded-3xl p-6 sm:p-8 shadow-2xl text-[#ede4dc]">
              <div className="text-center pb-6 border-b border-[#38281d]">
                <h3 className="font-serif text-2xl font-bold text-[#f9f6f2]">Seth And Sons DryFruits</h3>
                <p className="text-xs text-[#dfc471] tracking-wider uppercase mt-1">Heritage Dry Fruit Mandi, Jammu (J&amp;K)</p>
                <p className="text-xs text-[#d5c4b4]/60 mt-1">Order Receipt #{selectedOrderForReceipt.orderNumber}</p>
              </div>
              <div className="py-5 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#d5c4b4]/60">Customer:</span>
                  <span className="font-semibold text-[#ede4dc]">{selectedOrderForReceipt.deliveryAddressObj.fullName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#d5c4b4]/60">Delivery Address:</span>
                  <span className="text-right max-w-xs">
                    {selectedOrderForReceipt.deliveryAddressObj.deliveryAddress}, {selectedOrderForReceipt.deliveryAddressObj.city} - {selectedOrderForReceipt.deliveryAddressObj.pincode}
                  </span>
                </div>
              </div>
              <div className="pt-4 border-t border-[#38281d] space-y-2 text-sm">
                {selectedOrderForReceipt.items.map(it => (
                  <div key={it.id} className="flex justify-between">
                    <span>
                      {it.productName} (
                      {it.weightLabel
                        ? `${it.quantity} × ${it.weightLabel}`
                        : `${it.quantity} ${it.unit === 'gram' ? 'g' : it.unit === 'ml' ? 'ml' : it.unit === 'piece' ? 'pc' : 'kg'}`}
                      )
                    </span>
                    <span className="font-bold text-[#dfc471]">{formatINR(it.subtotal)}</span>
                  </div>
                ))}
                <div className="pt-3 border-t border-[#38281d] flex justify-between font-bold text-base">
                  <span>Final Amount:</span>
                  <span className="text-[#dfc471] text-lg">{formatINR(selectedOrderForReceipt.totalAmount)}</span>
                </div>
              </div>
              <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-[#38281d]">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2.5 rounded-full text-xs font-semibold bg-[#251a13] text-[#ede4dc] cursor-pointer"
                >
                  Print Slip
                </button>
                <button
                  onClick={() => setSelectedOrderForReceipt(null)}
                  className="px-5 py-2.5 rounded-full text-xs font-semibold bg-[#dfc471] text-[#0d0805] cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
