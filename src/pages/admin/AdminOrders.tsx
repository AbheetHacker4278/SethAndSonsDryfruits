import { useEffect, useState } from 'react';
import {
  Truck,
  Package,
  XCircle,
  RefreshCw,
  ExternalLink,
  Mail,
  Edit3,
  IndianRupee,
  Download,
  Printer,
  RotateCcw,
  FileText,
  Eye,
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AdminPdfViewerModal } from '../../components/admin/AdminPdfViewerModal';
import {
  AdminCard,
  AdminModal,
  LoadingSkeleton,
  StatusBadge,
  ToastBanner,
} from '../../components/admin/AdminUI';
import { apiRequest, ApiError, PersistedOrder } from '../../services/api';
import { formatINR } from '../../utils/priceCalculator';

const COURIER_PARTNERS = [
  'Delhivery',
  'Blue Dart',
  'DTDC',
  'India Post',
  'XpressBees',
  'Ekart',
  'Other',
];

export default function AdminOrders() {
  const [orders, setOrders] = useState<PersistedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ title: string; subtitle: string; url: string } | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string; link?: { label: string; href: string } } | null>(null);

  // Dispatch Modal State
  const [dispatchModalOrder, setDispatchModalOrder] = useState<PersistedOrder | null>(null);
  const [isEditingShipment, setIsEditingShipment] = useState(false);
  const [courierPartner, setCourierPartner] = useState('Blue Dart');
  const [customCourier, setCustomCourier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [dispatchDate, setDispatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState('');
  const [shipmentNotes, setShipmentNotes] = useState('');
  const [notifyCustomerOnEdit, setNotifyCustomerOnEdit] = useState(true);
  const [submittingDispatch, setSubmittingDispatch] = useState(false);

  // Refund Modal State
  const [refundModalOrder, setRefundModalOrder] = useState<PersistedOrder | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundRef, setRefundRef] = useState('');
  const [refundMethod, setRefundMethod] = useState('Original Payment Method / UPI');
  const [refundBankEta, setRefundBankEta] = useState('3-5 business days');
  const [refundVerified, setRefundVerified] = useState(false);

  // Internal Notes & Return State
  const [internalNotesDraft, setInternalNotesDraft] = useState('');
  const [returnModalOrder, setReturnModalOrder] = useState<PersistedOrder | null>(null);
  const [returnReason, setReturnReason] = useState('');

  const loadOrders = async (filter = statusFilter) => {
    setLoading(true);
    try {
      const res = await apiRequest<{ orders: PersistedOrder[] }>(
        `/api/admin/orders?status=${encodeURIComponent(filter)}`
      );
      setOrders(res.orders);
      if (selectedOrder) {
        const refreshed = res.orders.find(o => o.id === selectedOrder.id);
        if (refreshed) {
          setSelectedOrder(refreshed);
          setInternalNotesDraft((refreshed as any).internalNotes || '');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrders(statusFilter);
  }, [statusFilter]);

  const selectOrder = (ord: any) => {
    setSelectedOrder(ord);
    setInternalNotesDraft(ord.internalNotes || '');
  };

  const handleConfirmOrder = async (orderNumber: string) => {
    setToast(null);
    try {
      const res = await apiRequest<{ message: string }>(
        `/api/admin/orders/${encodeURIComponent(orderNumber)}/confirm`,
        { method: 'POST', body: {} }
      );
      setToast({ type: 'ok', text: res.message });
      await loadOrders();
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Failed to confirm order.' });
    }
  };

  const handleStatusUpdate = async (orderNumber: string, status: string, notes = '') => {
    setToast(null);
    try {
      const res = await apiRequest<{ message: string }>(
        `/api/admin/orders/${encodeURIComponent(orderNumber)}/status`,
        { method: 'POST', body: { status, notes } }
      );
      setToast({ type: 'ok', text: res.message });
      await loadOrders();
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Status update failed.' });
    }
  };

  const handlePaymentStatusUpdate = async (orderNumber: string, paymentStatus: string) => {
    try {
      const res = await apiRequest<{ message: string }>(
        `/api/admin/orders/${encodeURIComponent(orderNumber)}/payment-status`,
        { method: 'PUT', body: { paymentStatus } }
      );
      setToast({ type: 'ok', text: res.message });
      await loadOrders();
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Payment status update failed.' });
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedOrder) return;
    try {
      await apiRequest(`/api/admin/orders/${encodeURIComponent(selectedOrder.orderNumber)}/notes`, {
        method: 'PUT',
        body: { internalNotes: internalNotesDraft },
      });
      setToast({ type: 'ok', text: 'Internal order notes saved.' });
      await loadOrders();
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Failed to save internal notes.',
      });
    }
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnModalOrder) return;
    try {
      const res = await apiRequest<{ message: string }>(
        `/api/admin/orders/${encodeURIComponent(returnModalOrder.orderNumber)}/return`,
        { method: 'POST', body: { reason: returnReason } }
      );
      setReturnModalOrder(null);
      setReturnReason('');
      setToast({ type: 'ok', text: res.message });
      await loadOrders();
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Order return processing failed.',
      });
    }
  };

  const openDispatchModal = (ord: PersistedOrder, editMode = false) => {
    setDispatchModalOrder(ord);
    setIsEditingShipment(editMode);
    if (editMode && ord.shipment) {
      const isKnown = COURIER_PARTNERS.includes(ord.shipment.courierPartner);
      setCourierPartner(isKnown ? ord.shipment.courierPartner : 'Other');
      setCustomCourier(isKnown ? '' : ord.shipment.courierPartner);
      setTrackingNumber(ord.shipment.trackingNumber);
      setTrackingUrl(ord.shipment.trackingUrl || '');
      setDispatchDate(ord.shipment.dispatchDate.slice(0, 10));
      setEstimatedDeliveryDate(
        ord.shipment.estimatedDeliveryDate ? ord.shipment.estimatedDeliveryDate.slice(0, 10) : ''
      );
      setShipmentNotes(ord.shipment.shipmentNotes || '');
    } else {
      setCourierPartner('Blue Dart');
      setCustomCourier('');
      setTrackingNumber('');
      setTrackingUrl('');
      setDispatchDate(new Date().toISOString().slice(0, 10));
      setEstimatedDeliveryDate('');
      setShipmentNotes('');
    }
  };

  const handleDispatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchModalOrder) return;
    setToast(null);
    const finalCourier = courierPartner === 'Other' ? customCourier.trim() : courierPartner;
    if (!finalCourier) {
      setToast({ type: 'err', text: 'Please enter the courier partner name.' });
      return;
    }

    setSubmittingDispatch(true);
    try {
      const endpoint = isEditingShipment
        ? `/api/admin/orders/${encodeURIComponent(dispatchModalOrder.orderNumber)}/shipment`
        : `/api/admin/orders/${encodeURIComponent(dispatchModalOrder.orderNumber)}/dispatch`;

      const res = await apiRequest<{
        message: string;
        emailDeliveryLog?: { status?: string; previewUrl?: string | null } | null;
      }>(endpoint, {
        method: isEditingShipment ? 'PUT' : 'POST',
        body: {
          courierPartner: finalCourier,
          trackingNumber: trackingNumber.trim(),
          trackingUrl: trackingUrl.trim(),
          dispatchDate,
          estimatedDeliveryDate: estimatedDeliveryDate.trim(),
          shipmentNotes: shipmentNotes.trim(),
          notifyCustomer: isEditingShipment ? notifyCustomerOnEdit : true,
        },
      });

      const emailBadge = res.emailDeliveryLog?.status
        ? ` Email status: ${res.emailDeliveryLog.status.toUpperCase()}.`
        : '';
      setToast({
        type: 'ok',
        text: `${res.message}${emailBadge}`,
        link: res.emailDeliveryLog?.previewUrl
          ? { label: 'Preview Sent Email', href: res.emailDeliveryLog.previewUrl }
          : undefined,
      });
      setDispatchModalOrder(null);
      await loadOrders();
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Dispatch update failed.' });
    } finally {
      setSubmittingDispatch(false);
    }
  };

  const handleRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundModalOrder) return;
    try {
      const res = await apiRequest<{ message: string }>(
        `/api/admin/orders/${encodeURIComponent(refundModalOrder.orderNumber)}/refund`,
        {
          method: 'POST',
          body: {
            verified: refundVerified,
            refundAmount: Number(refundAmount),
            refundReferenceId: refundRef.trim(),
            paymentMethod: refundMethod.trim(),
            refundBankEta: refundBankEta.trim(),
          },
        }
      );
      setToast({ type: 'ok', text: res.message });
      setRefundModalOrder(null);
      await loadOrders();
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Refund processing failed.' });
    }
  };

  const statuses = [
    { id: 'all', label: 'All' },
    { id: 'placed', label: 'Pending' },
    { id: 'confirmed', label: 'Confirmed' },
    { id: 'processing', label: 'Processing' },
    { id: 'packed', label: 'Packed' },
    { id: 'dispatched', label: 'Shipped' },
    { id: 'out_for_delivery', label: 'Out for Delivery' },
    { id: 'delivered', label: 'Delivered' },
    { id: 'cancelled', label: 'Cancelled' },
    { id: 'returned', label: 'Returned' },
  ];

  return (
    <AdminLayout
      title="Order Management & Courier Dispatch"
      subtitle="Verify orders, update payment states, assign AWB tracking details, print PDF invoices, and manage returns."
    >
      <div className="space-y-5">
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

        {/* Status Filter Pills */}
        <div className="flex flex-wrap gap-2">
          {statuses.map(s => (
            <button
              key={s.id}
              onClick={() => setStatusFilter(s.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium cursor-pointer border transition-colors ${
                statusFilter === s.id
                  ? 'bg-[#183D32] text-white border-[#183D32]'
                  : 'bg-white text-[#5C6058] border-[#E9E4D9] hover:border-[#183D32]/40'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Table + Inspector Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <AdminCard className="lg:col-span-7">
            {loading ? (
              <LoadingSkeleton rows={6} />
            ) : orders.length === 0 ? (
              <p className="text-center py-8 text-xs text-[#888B83]">No orders in this status.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E9E4D9] text-[#888B83] uppercase text-[11px]">
                      <th className="py-2.5 pr-3">Order ID</th>
                      <th className="py-2.5 pr-3">Customer</th>
                      <th className="py-2.5 pr-3">Date</th>
                      <th className="py-2.5 pr-3">Total</th>
                      <th className="py-2.5 pr-3">Payment</th>
                      <th className="py-2.5 pr-3">Status</th>
                      <th className="py-2.5">Invoice</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9E4D9]">
                    {orders.map(ord => (
                      <tr
                        key={ord.id}
                        onClick={() => selectOrder(ord)}
                        className={`cursor-pointer transition-colors ${
                          selectedOrder?.id === ord.id ? 'bg-[#FAF3E3]' : 'hover:bg-[#F8F6F0]'
                        }`}
                      >
                        <td className="py-3 pr-3 font-bold text-[#183D32]">#{ord.orderNumber}</td>
                        <td className="py-3 pr-3">
                          <div className="font-medium text-[#252923]">{ord.customerObj.name}</div>
                          <div className="text-[11px] text-[#888B83]">{ord.shipment ? ord.shipment.courierPartner : 'Unshipped'}</div>
                        </td>
                        <td className="py-3 pr-3 text-[#888B83]">
                          {new Date(ord.createdAt).toLocaleDateString('en-IN')}
                        </td>
                        <td className="py-3 pr-3 font-bold text-[#183D32] tabular-nums">
                          {formatINR(ord.totalAmount)}
                        </td>
                        <td className="py-3 pr-3">
                          <StatusBadge status={ord.paymentStatus} />
                        </td>
                        <td className="py-3 pr-3">
                          <StatusBadge status={ord.status === 'placed' ? 'pending' : ord.status} />
                        </td>
                        <td className="py-3 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() =>
                              setPdfPreview({
                                title: `Invoice #${ord.orderNumber}`,
                                subtitle: `${ord.customerObj?.name || ord.customerObj?.email || 'Order Invoice'}`,
                                url: `/api/admin/orders/${encodeURIComponent(ord.orderNumber)}/invoice.pdf`,
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#183D32] hover:bg-[#245746] text-white cursor-pointer"
                            title="View PDF Invoice in Portal"
                          >
                            <Eye className="w-3 h-3 text-[#C8A96B]" />
                            <span>View</span>
                          </button>
                          <a
                            href={`/api/admin/orders/${encodeURIComponent(ord.orderNumber)}/invoice.pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#F8F6F0] hover:bg-[#183D32] text-[#183D32] hover:text-white border border-[#E9E4D9]"
                            title="Download PDF Invoice"
                          >
                            <Download className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminCard>

          {/* Detail Inspector */}
          <div className="lg:col-span-5">
            {selectedOrder ? (
              <AdminCard className="space-y-4 sticky top-20">
                <div className="flex items-start justify-between border-b border-[#E9E4D9] pb-3">
                  <div>
                    <h3 className="font-admin-serif text-xl font-semibold text-[#183D32]">
                      #{selectedOrder.orderNumber}
                    </h3>
                    <div className="text-xs text-[#888B83]">{selectedOrder.customerObj.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setPdfPreview({
                          title: `Invoice #${selectedOrder.orderNumber}`,
                          subtitle: selectedOrder.customerObj?.email || '',
                          url: `/api/admin/orders/${encodeURIComponent(selectedOrder.orderNumber)}/invoice.pdf`,
                        })
                      }
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-[#183D32] hover:bg-[#245746] text-white text-xs font-semibold cursor-pointer"
                      title="View PDF Invoice"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#C8A96B]" />
                      <span>View PDF</span>
                    </button>
                    <a
                      href={`/api/admin/orders/${encodeURIComponent(selectedOrder.orderNumber)}/invoice.pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg bg-[#F8F6F0] border border-[#E9E4D9] text-[#183D32]"
                      title="Download PDF Invoice"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => window.print()}
                      className="p-2 rounded-lg bg-[#F8F6F0] border border-[#E9E4D9] text-[#183D32] cursor-pointer"
                      title="Print Order"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Action Pills */}
                <div className="flex flex-wrap gap-2">
                  {selectedOrder.status === 'placed' && (
                    <button
                      onClick={() => handleConfirmOrder(selectedOrder.orderNumber)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#183D32] text-white cursor-pointer"
                    >
                      Confirm Order
                    </button>
                  )}
                  {selectedOrder.status === 'confirmed' && (
                    <button
                      onClick={() => handleStatusUpdate(selectedOrder.orderNumber, 'processing', 'Preparing batch')}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#F8F6F0] border border-[#E9E4D9] text-[#183D32] cursor-pointer"
                    >
                      Processing
                    </button>
                  )}
                  {['confirmed', 'processing'].includes(selectedOrder.status) && (
                    <button
                      onClick={() => handleStatusUpdate(selectedOrder.orderNumber, 'packed', 'Vacuum packed')}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#F8F6F0] border border-[#E9E4D9] text-[#183D32] cursor-pointer"
                    >
                      Mark Packed
                    </button>
                  )}
                  {['placed', 'confirmed', 'processing', 'packed'].includes(selectedOrder.status) && (
                    <button
                      onClick={() => openDispatchModal(selectedOrder, false)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#C8A96B] text-[#183D32] cursor-pointer inline-flex items-center gap-1"
                    >
                      <Truck className="w-3.5 h-3.5" />
                      <span>Mark as Dispatched</span>
                    </button>
                  )}
                  {selectedOrder.shipment && (
                    <button
                      onClick={() => openDispatchModal(selectedOrder, true)}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[#F8F6F0] border border-[#E9E4D9] text-[#183D32] cursor-pointer inline-flex items-center gap-1"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit Courier</span>
                    </button>
                  )}
                  {selectedOrder.status === 'dispatched' && (
                    <button
                      onClick={() => handleStatusUpdate(selectedOrder.orderNumber, 'out_for_delivery', 'Out for delivery')}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#245746] text-white cursor-pointer"
                    >
                      Out for Delivery
                    </button>
                  )}
                  {['dispatched', 'out_for_delivery'].includes(selectedOrder.status) && (
                    <button
                      onClick={() => handleStatusUpdate(selectedOrder.orderNumber, 'delivered', 'Delivered')}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#183D32] text-white cursor-pointer"
                    >
                      Mark Delivered
                    </button>
                  )}
                  {selectedOrder.status === 'delivered' && (
                    <button
                      onClick={() => setReturnModalOrder(selectedOrder)}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[#FCECEB] text-[#C65B50] cursor-pointer inline-flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Process Return</span>
                    </button>
                  )}
                  {!['delivered', 'cancelled', 'returned'].includes(selectedOrder.status) && (
                    <button
                      onClick={() => handleStatusUpdate(selectedOrder.orderNumber, 'cancelled', 'Cancelled by admin')}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[#FCECEB] text-[#C65B50] cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                  {selectedOrder.refundStatus !== 'refunded' && (
                    <button
                      onClick={() => {
                        setRefundModalOrder(selectedOrder);
                        setRefundAmount(String(selectedOrder.totalAmount));
                        setRefundRef('');
                        setRefundVerified(false);
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[#F8F6F0] border border-[#E9E4D9] text-[#252923] cursor-pointer inline-flex items-center gap-1"
                    >
                      <IndianRupee className="w-3 h-3" />
                      <span>Refund</span>
                    </button>
                  )}
                </div>

                {/* Payment Status Control */}
                <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs">
                  <span className="font-medium text-[#252923]">Payment Status ({selectedOrder.paymentMethod})</span>
                  <select
                    value={selectedOrder.paymentStatus}
                    onChange={e => handlePaymentStatusUpdate(selectedOrder.orderNumber, e.target.value)}
                    className="px-2.5 py-1 rounded-lg bg-white border border-[#E9E4D9] font-semibold text-[#183D32]"
                  >
                    <option value="pending">Pending</option>
                    <option value="cod">COD</option>
                    <option value="paid">Paid</option>
                    <option value="refund_pending">Refund Pending</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>

                {/* Address & Items */}
                <div className="text-xs space-y-1">
                  <div className="font-semibold text-[#183D32]">Delivery Address</div>
                  <div className="text-[#5C6058]">
                    {selectedOrder.deliveryAddressObj.fullName} ({selectedOrder.deliveryAddressObj.mobileNumber})
                  </div>
                  <div className="text-[#888B83]">
                    {selectedOrder.deliveryAddressObj.deliveryAddress}, {selectedOrder.deliveryAddressObj.city},{' '}
                    {selectedOrder.deliveryAddressObj.state} - {selectedOrder.deliveryAddressObj.pincode}
                  </div>
                </div>

                <div className="text-xs space-y-1.5 border-t border-[#E9E4D9] pt-3">
                  {selectedOrder.items.map((it: any) => (
                    <div key={it.id} className="flex justify-between">
                      <span>
                        {it.productName} (
                        {it.weightLabel
                          ? `${it.quantity} × ${it.weightLabel}`
                          : `${it.quantity} ${it.unit === 'gram' ? 'g' : it.unit === 'ml' ? 'ml' : it.unit === 'piece' ? 'pc' : 'kg'}`}
                        )
                      </span>
                      <span className="font-semibold text-[#183D32]">{formatINR(it.subtotal)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-[#888B83] pt-1">
                    <span>Shipping / Tax / Discount</span>
                    <span>+{formatINR(selectedOrder.shippingCharge)} / +{formatINR(selectedOrder.taxAmount)} / -{formatINR(selectedOrder.discountAmount)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm text-[#183D32] pt-1 border-t border-[#E9E4D9]">
                    <span>Final Total</span>
                    <span>{formatINR(selectedOrder.totalAmount)}</span>
                  </div>
                </div>

                {/* Internal Order Notes */}
                <div className="space-y-1.5 pt-2 border-t border-[#E9E4D9] text-xs">
                  <div className="font-semibold text-[#183D32] flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Internal Order Notes</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={internalNotesDraft}
                      onChange={e => setInternalNotesDraft(e.target.value)}
                      placeholder="Private staff notes..."
                      className="flex-1 px-3 py-1.5 rounded-lg bg-[#F8F6F0] border border-[#E9E4D9]"
                    />
                    <button
                      onClick={handleSaveNotes}
                      className="px-3 py-1.5 rounded-lg bg-[#183D32] text-white font-semibold cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                </div>

                {/* Triggered Email Logs */}
                <div className="space-y-1.5 pt-2 border-t border-[#E9E4D9] text-xs">
                  <div className="font-semibold text-[#183D32] flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-[#C8A96B]" />
                    <span>Automated Emails ({selectedOrder.emailLogs?.length || 0})</span>
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1.5">
                    {(selectedOrder.emailLogs || []).map((log: any) => (
                      <div key={log.id} className="p-2 rounded-lg bg-[#F8F6F0] border border-[#E9E4D9] flex items-center justify-between gap-2">
                        <span className="capitalize font-medium">{log.emailType.replace(/_/g, ' ')}</span>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={log.status} />
                          {log.previewUrl && (
                            <a href={log.previewUrl} target="_blank" rel="noopener noreferrer" className="text-[#245746]">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </AdminCard>
            ) : (
              <AdminCard className="text-center py-12 text-xs text-[#888B83]">
                <Package className="w-8 h-8 mx-auto text-[#C8A96B] mb-2" />
                Select an order row to manage status, payments, courier AWB, internal notes, and invoices.
              </AdminCard>
            )}
          </div>
        </div>

        {/* Dispatch Modal */}
        <AdminModal
          open={Boolean(dispatchModalOrder)}
          onClose={() => setDispatchModalOrder(null)}
          title={isEditingShipment ? 'Edit Courier Tracking' : 'Mark Order as Dispatched'}
          subtitle={dispatchModalOrder ? `Order #${dispatchModalOrder.orderNumber}` : ''}
          maxWidth="max-w-lg"
        >
          <form onSubmit={handleDispatchSubmit} className="space-y-3 text-xs">
            <div>
              <label className="block font-medium mb-1">Courier Partner *</label>
              <select
                value={courierPartner}
                onChange={e => setCourierPartner(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
              >
                {COURIER_PARTNERS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {courierPartner === 'Other' && (
              <input
                type="text"
                required
                value={customCourier}
                onChange={e => setCustomCourier(e.target.value)}
                placeholder="Enter courier partner name *"
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
              />
            )}
            <input
              type="text"
              required
              value={trackingNumber}
              onChange={e => setTrackingNumber(e.target.value)}
              placeholder="Tracking / AWB Number *"
              className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
            />
            <input
              type="url"
              value={trackingUrl}
              onChange={e => setTrackingUrl(e.target.value)}
              placeholder="Tracking URL (https://...)"
              className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1">Dispatch Date *</label>
                <input
                  type="date"
                  required
                  value={dispatchDate}
                  onChange={e => setDispatchDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Est. Delivery</label>
                <input
                  type="date"
                  value={estimatedDeliveryDate}
                  onChange={e => setEstimatedDeliveryDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
                />
              </div>
            </div>
            <textarea
              rows={2}
              value={shipmentNotes}
              onChange={e => setShipmentNotes(e.target.value)}
              placeholder="Optional shipping notes"
              className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
            />
            {isEditingShipment && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyCustomerOnEdit}
                  onChange={e => setNotifyCustomerOnEdit(e.target.checked)}
                  className="accent-[#183D32]"
                />
                <span>Notify customer of updated tracking details</span>
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDispatchModalOrder(null)}
                className="px-4 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingDispatch}
                className="px-5 py-2 rounded-xl bg-[#183D32] text-white font-semibold cursor-pointer inline-flex items-center gap-1.5"
              >
                {submittingDispatch && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isEditingShipment ? 'Save Update' : 'Confirm Dispatch & Email'}</span>
              </button>
            </div>
          </form>
        </AdminModal>

        {/* Return Modal */}
        <AdminModal
          open={Boolean(returnModalOrder)}
          onClose={() => setReturnModalOrder(null)}
          title="Process Order Return"
          maxWidth="max-w-md"
        >
          <form onSubmit={handleReturnSubmit} className="space-y-3 text-xs">
            <p className="text-[#5C6058]">
              Marking order <strong>#{returnModalOrder?.orderNumber}</strong> as returned will automatically restore item stock into inventory.
            </p>
            <input
              type="text"
              required
              value={returnReason}
              onChange={e => setReturnReason(e.target.value)}
              placeholder="Return reason *"
              className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReturnModalOrder(null)} className="px-4 py-2 rounded-xl border border-[#E9E4D9] cursor-pointer">Cancel</button>
              <button type="submit" className="px-5 py-2 rounded-xl bg-[#C65B50] text-white font-semibold cursor-pointer">Confirm Return</button>
            </div>
          </form>
        </AdminModal>

        {/* Verified Refund Modal */}
        <AdminModal
          open={Boolean(refundModalOrder)}
          onClose={() => setRefundModalOrder(null)}
          title="Process Verified Refund"
          maxWidth="max-w-md"
        >
          <form onSubmit={handleRefundSubmit} className="space-y-3 text-xs">
            <input
              type="number"
              required
              min={1}
              value={refundAmount}
              onChange={e => setRefundAmount(e.target.value)}
              placeholder="Refund Amount (₹) *"
              className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
            />
            <input
              type="text"
              required
              value={refundRef}
              onChange={e => setRefundRef(e.target.value)}
              placeholder="Refund Reference ID *"
              className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
            />
            <input
              type="text"
              required
              value={refundMethod}
              onChange={e => setRefundMethod(e.target.value)}
              placeholder="Payment Method"
              className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
            />
            <input
              type="text"
              value={refundBankEta}
              onChange={e => setRefundBankEta(e.target.value)}
              placeholder="Bank Processing ETA"
              className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
            />
            <label className="flex items-start gap-2 cursor-pointer text-[#183D32]">
              <input
                type="checkbox"
                checked={refundVerified}
                onChange={e => setRefundVerified(e.target.checked)}
                className="mt-0.5 accent-[#183D32]"
              />
              <span>Confirm refund has been verified/settled before emailing customer.</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setRefundModalOrder(null)} className="px-4 py-2 rounded-xl border border-[#E9E4D9] cursor-pointer">Cancel</button>
              <button type="submit" className="px-5 py-2 rounded-xl bg-[#183D32] text-white font-semibold cursor-pointer">Confirm Refund</button>
            </div>
          </form>
        </AdminModal>

        <AdminPdfViewerModal
          open={Boolean(pdfPreview)}
          title={pdfPreview?.title || 'Invoice PDF'}
          subtitle={pdfPreview?.subtitle}
          src={pdfPreview?.url || null}
          onClose={() => setPdfPreview(null)}
        />
      </div>
    </AdminLayout>
  );
}
