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
  PlusCircle,
  Phone,
  MessageCircle,
  CreditCard,
  UploadCloud,
  CheckCircle2,
  Trash2,
  Image as ImageIcon,
  Check,
  User,
  MapPin,
  ShoppingBag,
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
import { apiRequest, apiUpload, ApiError, PersistedOrder, fetchPublishedProducts, CatalogProduct } from '../../services/api';
import { formatINR } from '../../utils/priceCalculator';
import { calculateOrderShippingCharge } from '../../../shared/catalogSeed';

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

  // Manual Order Creation State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);

  // Manual Order Form Fields
  const [orderSource, setOrderSource] = useState<'whatsapp' | 'phone' | 'direct' | 'instagram'>('whatsapp');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');

  // Items in manual draft
  const [orderItems, setOrderItems] = useState<Array<{
    productId: string;
    productName: string;
    variantId?: string;
    weightLabel?: string;
    unitPrice: number;
    quantity: number;
    subtotal: number;
  }>>([]);

  // Product picker controls
  const [pickerProductId, setPickerProductId] = useState('');
  const [pickerVariantId, setPickerVariantId] = useState('');
  const [pickerQuantity, setPickerQuantity] = useState(1);
  const [pickerUnitPrice, setPickerUnitPrice] = useState<string>('');

  // Payment controls
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'cash' | 'card'>('upi');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending'>('paid');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentScreenshotUrl, setPaymentScreenshotUrl] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);

  // Extras
  const [discountAmount, setDiscountAmount] = useState('0');
  const [shippingOverride, setShippingOverride] = useState<string>('');
  const [manualOrderNotes, setManualOrderNotes] = useState('');

  // Inspector Live Payment Proof Upload
  const [uploadingInspectorProof, setUploadingInspectorProof] = useState(false);

  // Edit Manual Order Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any | null>(null);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [uploadingEditProof, setUploadingEditProof] = useState(false);

  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editCustomerEmail, setEditCustomerEmail] = useState('');
  const [editDeliveryAddress, setEditDeliveryAddress] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('');
  const [editPincode, setEditPincode] = useState('');

  const [editOrderItems, setEditOrderItems] = useState<Array<{
    productId: string;
    productName: string;
    variantId?: string;
    weightLabel?: string;
    unitPrice: number;
    quantity: number;
    subtotal: number;
  }>>([]);

  const [editPickerProductId, setEditPickerProductId] = useState('');
  const [editPickerVariantId, setEditPickerVariantId] = useState('');
  const [editPickerQuantity, setEditPickerQuantity] = useState(1);
  const [editPickerUnitPrice, setEditPickerUnitPrice] = useState('');

  const [editPaymentMethod, setEditPaymentMethod] = useState<'upi' | 'cash' | 'card'>('upi');
  const [editPaymentStatus, setEditPaymentStatus] = useState<'paid' | 'pending' | 'cod'>('paid');
  const [editPaymentReference, setEditPaymentReference] = useState('');
  const [editPaymentScreenshotUrl, setEditPaymentScreenshotUrl] = useState('');
  const [editDiscountAmount, setEditDiscountAmount] = useState('0');
  const [editShippingOverride, setEditShippingOverride] = useState('');
  const [editInternalNotes, setEditInternalNotes] = useState('');

  useEffect(() => {
    fetchPublishedProducts().then(setCatalogProducts).catch(() => {});
  }, []);

  const resetCreateForm = () => {
    setOrderSource('whatsapp');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setDeliveryAddress('');
    setCity('');
    setState('');
    setPincode('');
    setOrderItems([]);
    setPickerProductId('');
    setPickerVariantId('');
    setPickerQuantity(1);
    setPickerUnitPrice('');
    setPaymentMethod('upi');
    setPaymentStatus('paid');
    setPaymentReference('');
    setPaymentScreenshotUrl('');
    setDiscountAmount('0');
    setShippingOverride('');
    setManualOrderNotes('');
  };

  const handleProductSelect = (prodId: string) => {
    setPickerProductId(prodId);
    const prod = catalogProducts.find(p => p.id === prodId);
    if (!prod) {
      setPickerVariantId('');
      setPickerUnitPrice('');
      return;
    }
    if (prod.weightVariants && prod.weightVariants.length > 0) {
      const firstVar = prod.weightVariants[0];
      setPickerVariantId(firstVar.id);
      setPickerUnitPrice(String(firstVar.sellingPrice || prod.price));
    } else {
      setPickerVariantId('');
      setPickerUnitPrice(String(prod.price));
    }
  };

  const handleVariantSelect = (varId: string) => {
    setPickerVariantId(varId);
    const prod = catalogProducts.find(p => p.id === pickerProductId);
    if (!prod) return;
    const variant = prod.weightVariants?.find(v => v.id === varId);
    if (variant) {
      setPickerUnitPrice(String(variant.sellingPrice || prod.price));
    }
  };

  const handleAddItem = () => {
    const prod = catalogProducts.find(p => p.id === pickerProductId);
    if (!prod) return;
    const variant = prod.weightVariants?.find(v => v.id === pickerVariantId);
    const unitPrice = Number(pickerUnitPrice) > 0 ? Number(pickerUnitPrice) : prod.price;
    const qty = Math.max(0.1, Number(pickerQuantity) || 1);
    const lineSubtotal = Math.round(unitPrice * qty);

    setOrderItems(prev => [
      ...prev,
      {
        productId: prod.id,
        productName: prod.name,
        variantId: variant?.id,
        weightLabel: variant?.weightLabel,
        unitPrice,
        quantity: qty,
        subtotal: lineSubtotal,
      },
    ]);

    setPickerProductId('');
    setPickerVariantId('');
    setPickerQuantity(1);
    setPickerUnitPrice('');
  };

  const handleRemoveItem = (index: number) => {
    setOrderItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateItemPrice = (index: number, newPrice: number) => {
    setOrderItems(prev => {
      const next = [...prev];
      if (next[index]) {
        const p = Math.max(0, newPrice);
        next[index] = {
          ...next[index],
          unitPrice: p,
          subtotal: Math.round(p * next[index].quantity),
        };
      }
      return next;
    });
  };

  const handleUpdateItemQty = (index: number, newQty: number) => {
    setOrderItems(prev => {
      const next = [...prev];
      if (next[index]) {
        const q = Math.max(0.1, newQty);
        next[index] = {
          ...next[index],
          quantity: q,
          subtotal: Math.round(next[index].unitPrice * q),
        };
      }
      return next;
    });
  };

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProof(true);
    try {
      const fd = new FormData();
      fd.append('paymentProof', file);
      const res = await apiUpload<{ paymentScreenshotUrl: string }>(
        '/api/admin/orders/upload-payment-proof',
        fd
      );
      setPaymentScreenshotUrl(res.paymentScreenshotUrl);
      setToast({ type: 'ok', text: 'Payment receipt / screenshot uploaded successfully.' });
    } catch (err) {
      setToast({ type: 'err', text: err instanceof Error ? err.message : 'Failed to upload payment proof.' });
    } finally {
      setUploadingProof(false);
    }
  };

  const draftSubtotal = orderItems.reduce((acc, it) => acc + it.subtotal, 0);
  const autoShipping = calculateOrderShippingCharge(orderItems, draftSubtotal);
  const draftShipping = shippingOverride !== '' ? Math.max(0, Number(shippingOverride) || 0) : autoShipping;
  const draftDiscount = Math.max(0, Number(discountAmount) || 0);
  const draftTotal = Math.max(0, draftSubtotal - draftDiscount + draftShipping);

  const handleCreateManualOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim()) {
      setToast({ type: 'err', text: 'Customer name and phone number are required.' });
      return;
    }
    if (!deliveryAddress.trim() || !city.trim() || !state.trim() || !pincode.trim()) {
      setToast({ type: 'err', text: 'Please complete delivery address, city, state, and pincode.' });
      return;
    }
    if (orderItems.length === 0) {
      setToast({ type: 'err', text: 'Please add at least one product from the catalog to the order.' });
      return;
    }

    setSubmittingCreate(true);
    try {
      const payload = {
        orderSource,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim(),
        deliveryAddress: deliveryAddress.trim(),
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        items: orderItems.map(it => ({
          productId: it.productId,
          variantId: it.variantId || null,
          weightLabel: it.weightLabel || null,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        })),
        paymentMethod,
        paymentStatus,
        paymentReference: paymentReference.trim(),
        paymentScreenshotUrl: paymentScreenshotUrl.trim(),
        shippingCharge: draftShipping,
        discountAmount: draftDiscount,
        internalNotes: manualOrderNotes.trim(),
      };

      const res = await apiRequest<{ ok: boolean; order: PersistedOrder; invoiceUrl: string }>(
        '/api/admin/orders',
        {
          method: 'POST',
          body: payload,
        }
      );

      setToast({
        type: 'ok',
        text: `Manual order #${res.order.orderNumber} created! Final tax invoice generated.`,
      });

      setCreateModalOpen(false);
      resetCreateForm();
      await loadOrders(statusFilter);
      setSelectedOrder(res.order);

      // Pop up the final PDF invoice preview modal right away!
      setPdfPreview({
        title: `Tax Invoice - #${res.order.orderNumber}`,
        subtitle: `Manual Order (${orderSource.toUpperCase()}) — ${res.order.paymentMethod} • ${formatINR(res.order.totalAmount)}`,
        url: res.invoiceUrl || `/api/admin/orders/${encodeURIComponent(res.order.orderNumber)}/invoice.pdf`,
      });
    } catch (err) {
      setToast({ type: 'err', text: err instanceof Error ? err.message : 'Failed to create manual order.' });
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleInspectorProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOrder) return;
    setUploadingInspectorProof(true);
    try {
      const fd = new FormData();
      fd.append('paymentProof', file);
      const res = await apiUpload<{ paymentScreenshotUrl: string }>(
        '/api/admin/orders/upload-payment-proof',
        fd
      );
      await apiRequest(`/api/admin/orders/${encodeURIComponent(selectedOrder.orderNumber)}/payment-proof`, {
        method: 'PUT',
        body: { paymentScreenshotUrl: res.paymentScreenshotUrl },
      });
      setSelectedOrder((prev: any) => ({ ...prev, paymentScreenshotUrl: res.paymentScreenshotUrl }));
      setToast({ type: 'ok', text: 'Payment screenshot attached to order invoice successfully.' });
      await loadOrders();
    } catch (err) {
      setToast({ type: 'err', text: err instanceof Error ? err.message : 'Failed to upload payment proof.' });
    } finally {
      setUploadingInspectorProof(false);
    }
  };

  const openEditManualModal = (ord: any) => {
    setEditingOrder(ord);
    const addr = ord.deliveryAddressObj || {};
    const cust = ord.customerObj || {};
    setEditCustomerName(addr.fullName || cust.name || '');
    setEditCustomerPhone(addr.mobileNumber || cust.phone || '');
    setEditCustomerEmail(addr.email || cust.email || '');
    setEditDeliveryAddress(addr.deliveryAddress || '');
    setEditCity(addr.city || '');
    setEditState(addr.state || '');
    setEditPincode(addr.pincode || '');

    const items = (ord.items || []).map((it: any) => ({
      productId: it.productId,
      productName: it.productName,
      variantId: it.variantId || undefined,
      weightLabel: it.weightLabel || undefined,
      unitPrice: it.unitPrice,
      quantity: it.quantity,
      subtotal: it.subtotal,
    }));
    setEditOrderItems(items);

    const pm = (ord.paymentMethod || 'upi').toLowerCase();
    setEditPaymentMethod(pm === 'cash' ? 'cash' : pm === 'card' ? 'card' : 'upi');
    setEditPaymentStatus(ord.paymentStatus || 'paid');
    setEditPaymentReference(ord.paymentReference || '');
    setEditPaymentScreenshotUrl(ord.paymentScreenshotUrl || '');
    setEditDiscountAmount(String(ord.discountAmount || 0));
    setEditShippingOverride(String(ord.shippingCharge ?? 0));
    setEditInternalNotes(ord.internalNotes || '');

    setEditPickerProductId('');
    setEditPickerVariantId('');
    setEditPickerQuantity(1);
    setEditPickerUnitPrice('');
    setEditModalOpen(true);
  };

  const editDraftSubtotal = editOrderItems.reduce((acc, it) => acc + it.subtotal, 0);
  const editAutoShipping = calculateOrderShippingCharge(editOrderItems, editDraftSubtotal);
  const editDraftShipping = editShippingOverride !== '' ? Math.max(0, Number(editShippingOverride) || 0) : editAutoShipping;
  const editDraftDiscount = Math.max(0, Number(editDiscountAmount) || 0);
  const editDraftTotal = Math.max(0, editDraftSubtotal - editDraftDiscount + editDraftShipping);

  const handleEditProductSelect = (prodId: string) => {
    setEditPickerProductId(prodId);
    const prod = catalogProducts.find(p => p.id === prodId);
    if (!prod) {
      setEditPickerVariantId('');
      setEditPickerUnitPrice('');
      return;
    }
    if (prod.weightVariants && prod.weightVariants.length > 0) {
      const firstVar = prod.weightVariants[0];
      setEditPickerVariantId(firstVar.id);
      setEditPickerUnitPrice(String(firstVar.sellingPrice || prod.price));
    } else {
      setEditPickerVariantId('');
      setEditPickerUnitPrice(String(prod.price));
    }
  };

  const handleEditVariantSelect = (varId: string) => {
    setEditPickerVariantId(varId);
    const prod = catalogProducts.find(p => p.id === editPickerProductId);
    if (!prod) return;
    const variant = prod.weightVariants?.find(v => v.id === varId);
    if (variant) {
      setEditPickerUnitPrice(String(variant.sellingPrice || prod.price));
    }
  };

  const handleEditAddItem = () => {
    const prod = catalogProducts.find(p => p.id === editPickerProductId);
    if (!prod) return;
    const variant = prod.weightVariants?.find(v => v.id === editPickerVariantId);
    const unitPrice = Number(editPickerUnitPrice) > 0 ? Number(editPickerUnitPrice) : prod.price;
    const qty = Math.max(0.1, Number(editPickerQuantity) || 1);
    const lineSubtotal = Math.round(unitPrice * qty);

    setEditOrderItems(prev => [
      ...prev,
      {
        productId: prod.id,
        productName: prod.name,
        variantId: variant?.id,
        weightLabel: variant?.weightLabel,
        unitPrice,
        quantity: qty,
        subtotal: lineSubtotal,
      },
    ]);

    setEditPickerProductId('');
    setEditPickerVariantId('');
    setEditPickerQuantity(1);
    setEditPickerUnitPrice('');
  };

  const handleEditRemoveItem = (index: number) => {
    setEditOrderItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleEditUpdateItemPrice = (index: number, newPrice: number) => {
    setEditOrderItems(prev => {
      const next = [...prev];
      if (next[index]) {
        const p = Math.max(0, newPrice);
        next[index] = {
          ...next[index],
          unitPrice: p,
          subtotal: Math.round(p * next[index].quantity),
        };
      }
      return next;
    });
  };

  const handleEditUpdateItemQty = (index: number, newQty: number) => {
    setEditOrderItems(prev => {
      const next = [...prev];
      if (next[index]) {
        const q = Math.max(0.1, newQty);
        next[index] = {
          ...next[index],
          quantity: q,
          subtotal: Math.round(next[index].unitPrice * q),
        };
      }
      return next;
    });
  };

  const handleEditProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingEditProof(true);
    try {
      const fd = new FormData();
      fd.append('paymentProof', file);
      const res = await apiUpload<{ paymentScreenshotUrl: string }>(
        '/api/admin/orders/upload-payment-proof',
        fd
      );
      setEditPaymentScreenshotUrl(res.paymentScreenshotUrl);
      setToast({ type: 'ok', text: 'Payment receipt uploaded.' });
    } catch (err) {
      setToast({ type: 'err', text: err instanceof Error ? err.message : 'Failed to upload payment proof.' });
    } finally {
      setUploadingEditProof(false);
    }
  };

  const handleSaveEditManualOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;
    if (!editCustomerName.trim() || !editCustomerPhone.trim()) {
      setToast({ type: 'err', text: 'Customer name and phone number are required.' });
      return;
    }
    if (!editDeliveryAddress.trim() || !editCity.trim() || !editState.trim() || !editPincode.trim()) {
      setToast({ type: 'err', text: 'Please complete delivery address, city, state, and pincode.' });
      return;
    }
    if (editOrderItems.length === 0) {
      setToast({ type: 'err', text: 'At least one catalog product is required.' });
      return;
    }

    setSubmittingEdit(true);
    try {
      const payload = {
        customerName: editCustomerName.trim(),
        customerPhone: editCustomerPhone.trim(),
        customerEmail: editCustomerEmail.trim(),
        deliveryAddress: editDeliveryAddress.trim(),
        city: editCity.trim(),
        state: editState.trim(),
        pincode: editPincode.trim(),
        items: editOrderItems.map(it => ({
          productId: it.productId,
          variantId: it.variantId || null,
          weightLabel: it.weightLabel || null,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        })),
        paymentMethod: editPaymentMethod,
        paymentStatus: editPaymentStatus,
        paymentReference: editPaymentReference.trim(),
        paymentScreenshotUrl: editPaymentScreenshotUrl.trim(),
        shippingCharge: editDraftShipping,
        discountAmount: editDraftDiscount,
        internalNotes: editInternalNotes.trim(),
      };

      const res = await apiRequest<{ ok: boolean; message: string; order: PersistedOrder }>(
        `/api/admin/orders/${encodeURIComponent(editingOrder.orderNumber)}/manual-edit`,
        {
          method: 'PUT',
          body: payload,
        }
      );

      setToast({ type: 'ok', text: res.message || 'Manual order updated successfully.' });
      setSelectedOrder(res.order);
      setEditModalOpen(false);
      await loadOrders();
    } catch (err) {
      setToast({ type: 'err', text: err instanceof Error ? err.message : 'Failed to update manual order.' });
    } finally {
      setSubmittingEdit(false);
    }
  };

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

  const isSelectedManual = Boolean(
    selectedOrder?.orderSource &&
    ['whatsapp', 'phone', 'direct', 'instagram', 'manual'].includes(String(selectedOrder.orderSource).toLowerCase())
  );

  return (
    <AdminLayout
      title="Order Management & Courier Dispatch"
      subtitle="Verify orders, update payment states, assign AWB tracking details, print PDF invoices, and manage returns."
    >
      <div className="space-y-5">
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

        {/* Header Toolbar: Status Pills + Create Manual Order CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                resetCreateForm();
                setCreateModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#183D32] hover:bg-[#245746] text-white cursor-pointer shadow-sm transition-all"
            >
              <PlusCircle className="w-4 h-4 text-[#C8A96B]" />
              <span>+ Add Manual Order (WhatsApp / Phone)</span>
            </button>
            <button
              onClick={() => loadOrders(statusFilter)}
              title="Refresh Orders"
              className="p-2 rounded-xl border border-[#E9E4D9] bg-white text-[#5C6058] hover:text-[#183D32] cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
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
                        <td className="py-3 pr-3 font-bold text-[#183D32]">
                          <div>#{ord.orderNumber}</div>
                          {ord.orderSource && ord.orderSource !== 'online' && (
                            <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-semibold mt-0.5 ${
                              ord.orderSource === 'whatsapp'
                                ? 'bg-[#E7F6ED] text-[#128C7E]'
                                : ord.orderSource === 'phone'
                                ? 'bg-[#EBF5FB] text-[#2980B9]'
                                : 'bg-[#FAF3E3] text-[#C8A96B]'
                            }`}>
                              {ord.orderSource === 'whatsapp' ? <MessageCircle className="w-2.5 h-2.5" /> : <Phone className="w-2.5 h-2.5" />}
                              <span className="capitalize">{ord.orderSource}</span>
                            </span>
                          )}
                        </td>
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
                    <div className="flex items-center gap-2">
                      <h3 className="font-admin-serif text-xl font-semibold text-[#183D32]">
                        #{selectedOrder.orderNumber}
                      </h3>
                      {isSelectedManual ? (
                        <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full font-bold bg-[#183D32] text-[#C8A96B] border border-[#C8A96B]/50 shadow-sm">
                          {selectedOrder.orderSource === 'whatsapp' ? (
                            <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
                          ) : selectedOrder.orderSource === 'phone' ? (
                            <Phone className="w-3.5 h-3.5 text-[#3498DB]" />
                          ) : (
                            <User className="w-3.5 h-3.5 text-[#C8A96B]" />
                          )}
                          <span>Manual Order • {selectedOrder.orderSource.toUpperCase()}</span>
                        </span>
                      ) : (
                        selectedOrder.orderSource && selectedOrder.orderSource !== 'online' && (
                          <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                            selectedOrder.orderSource === 'whatsapp'
                              ? 'bg-[#E7F6ED] text-[#128C7E]'
                              : selectedOrder.orderSource === 'phone'
                              ? 'bg-[#EBF5FB] text-[#2980B9]'
                              : 'bg-[#FAF3E3] text-[#C8A96B]'
                          }`}>
                            {selectedOrder.orderSource === 'whatsapp' ? <MessageCircle className="w-3 h-3" /> : <Phone className="w-3 h-3" />}
                            <span className="capitalize">{selectedOrder.orderSource}</span>
                          </span>
                        )
                      )}
                    </div>
                    <div className="text-xs text-[#888B83]">
                      {selectedOrder.customerObj?.name || 'Patron'} • {selectedOrder.customerObj?.phone || selectedOrder.customerObj?.email || ''}
                    </div>
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
                {isSelectedManual ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditManualModal(selectedOrder)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#183D32] text-white hover:bg-[#245746] transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-[#C8A96B]" />
                      <span>Edit Manual Order</span>
                    </button>
                    {!['cancelled', 'returned'].includes(selectedOrder.status) && (
                      <button
                        type="button"
                        onClick={() => handleStatusUpdate(selectedOrder.orderNumber, 'cancelled', 'Cancelled by admin')}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#FCECEB] text-[#C65B50] hover:bg-red-100 transition-colors cursor-pointer inline-flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Cancel</span>
                      </button>
                    )}
                    {selectedOrder.refundStatus !== 'refunded' && (
                      <button
                        type="button"
                        onClick={() => {
                          setRefundModalOrder(selectedOrder);
                          setRefundAmount(String(selectedOrder.totalAmount));
                          setRefundRef('');
                          setRefundVerified(false);
                        }}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#F8F6F0] border border-[#E9E4D9] text-[#252923] hover:bg-[#E9E4D9] transition-colors cursor-pointer inline-flex items-center gap-1"
                      >
                        <IndianRupee className="w-3.5 h-3.5 text-[#C8A96B]" />
                        <span>Refund</span>
                      </button>
                    )}
                  </div>
                ) : (
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
                )}

                {/* Payment Status Control & Proof */}
                <div className="space-y-2.5 p-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs">
                  <div className="flex items-center justify-between gap-2">
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

                  {selectedOrder.paymentReference && (
                    <div className="text-[11px] text-[#5C6058] flex items-center justify-between">
                      <span className="font-semibold text-[#183D32]">UTR / Ref:</span>
                      <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-[#E9E4D9]">{selectedOrder.paymentReference}</span>
                    </div>
                  )}

                  {/* Payment Proof Section - With upload/replace at any time, even after invoice generation */}
                  <div className="pt-2 border-t border-[#E9E4D9]/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[#183D32] flex items-center gap-1">
                        <CreditCard className="w-3.5 h-3.5 text-[#C8A96B]" />
                        <span>Payment Screenshot / Receipt</span>
                      </span>
                      {selectedOrder.paymentScreenshotUrl && (
                        <a
                          href={selectedOrder.paymentScreenshotUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-[#183D32] hover:text-[#C8A96B] font-semibold underline"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View Proof</span>
                        </a>
                      )}
                    </div>

                    {selectedOrder.paymentScreenshotUrl ? (
                      <div className="flex items-center justify-between gap-2 p-2 bg-white rounded-lg border border-[#C8A96B]/50">
                        <div className="flex items-center gap-2">
                          <img
                            src={selectedOrder.paymentScreenshotUrl}
                            alt="Payment Proof"
                            className="w-10 h-10 object-cover rounded-md border border-[#E9E4D9]"
                          />
                          <div>
                            <div className="font-semibold text-[#183D32] text-[11px]">Payment Proof Attached</div>
                            <div className="text-[10px] text-[#888B83]">Uploaded receipt on file</div>
                          </div>
                        </div>
                        <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#F8F6F0] hover:bg-[#E9E4D9] text-[#183D32] text-[11px] font-medium cursor-pointer border border-[#E9E4D9] transition">
                          <UploadCloud className="w-3 h-3 text-[#C8A96B]" />
                          <span>{uploadingInspectorProof ? 'Uploading...' : 'Replace'}</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,application/pdf"
                            disabled={uploadingInspectorProof}
                            onChange={handleInspectorProofUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2 p-2 bg-white rounded-lg border border-dashed border-[#E9E4D9]">
                        <div className="text-[11px] text-[#888B83]">No payment screenshot attached yet.</div>
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#183D32] hover:bg-[#245746] text-white text-[11px] font-semibold cursor-pointer transition shadow-sm">
                          <UploadCloud className="w-3.5 h-3.5 text-[#C8A96B]" />
                          <span>{uploadingInspectorProof ? 'Uploading...' : 'Upload Screenshot'}</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,application/pdf"
                            disabled={uploadingInspectorProof}
                            onChange={handleInspectorProofUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                    )}
                  </div>
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

        {/* Create Manual Order Modal */}
        <AdminModal
          open={createModalOpen}
          onClose={() => {
            if (!submittingCreate) setCreateModalOpen(false);
          }}
          title="Create Manual Order (WhatsApp / Phone)"
          subtitle="Record an off-platform order, select products from the catalog, upload payment screenshot, and generate a final invoice."
          maxWidth="max-w-3xl"
        >
          <form onSubmit={handleCreateManualOrder} className="space-y-4 text-xs">
            {/* 1. Order Channel Selector */}
            <div>
              <label className="block font-semibold text-[#183D32] mb-1.5">Order Channel / Source *</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'text-[#128C7E] border-[#25D366] bg-[#E7F6ED]' },
                  { id: 'phone', label: 'Phone Call', icon: Phone, color: 'text-[#2980B9] border-[#3498DB] bg-[#EBF5FB]' },
                  { id: 'direct', label: 'Walk-in / Direct', icon: User, color: 'text-[#C8A96B] border-[#C8A96B] bg-[#FAF3E3]' },
                  { id: 'instagram', label: 'Instagram / Social', icon: ExternalLink, color: 'text-[#8E44AD] border-[#9B59B6] bg-[#F4ECF7]' },
                ].map(item => {
                  const Icon = item.icon;
                  const isSelected = orderSource === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setOrderSource(item.id as any)}
                      className={`p-2.5 rounded-xl border text-center flex flex-col items-center gap-1 transition-all cursor-pointer ${
                        isSelected
                          ? `${item.color} font-bold ring-2 ring-offset-1 ring-[#183D32]`
                          : 'bg-[#F8F6F0] border-[#E9E4D9] text-[#5C6058] hover:bg-white'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[11px]">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Customer Information */}
            <div className="p-3.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] space-y-2.5">
              <div className="font-semibold text-[#183D32] flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#C8A96B]" />
                <span>Customer & Delivery Details</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-0.5">Customer Name *</label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="e.g. Rajesh Sharma"
                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#E9E4D9]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-0.5">Mobile / Phone *</label>
                  <input
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#E9E4D9]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-0.5">Email (Optional)</label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={e => setCustomerEmail(e.target.value)}
                    placeholder="e.g. rajesh@example.com"
                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#E9E4D9]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-0.5">Street Address *</label>
                  <input
                    type="text"
                    required
                    value={deliveryAddress}
                    onChange={e => setDeliveryAddress(e.target.value)}
                    placeholder="Flat/House, Road, Area"
                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#E9E4D9]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-0.5">City *</label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    placeholder="e.g. Jammu / Delhi"
                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#E9E4D9]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-0.5">State & Pincode *</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      required
                      value={state}
                      onChange={e => setState(e.target.value)}
                      placeholder="State"
                      className="w-1/2 px-2.5 py-1.5 rounded-lg bg-white border border-[#E9E4D9]"
                    />
                    <input
                      type="text"
                      required
                      value={pincode}
                      onChange={e => setPincode(e.target.value)}
                      placeholder="PIN"
                      className="w-1/2 px-2.5 py-1.5 rounded-lg bg-white border border-[#E9E4D9]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Product Selection from Catalog */}
            <div className="p-3.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] space-y-3">
              <div className="font-semibold text-[#183D32] flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-[#C8A96B]" />
                  <span>Select Products from Catalog *</span>
                </div>
                <span className="text-[11px] text-[#888B83]">{orderItems.length} item(s) selected</span>
              </div>

              {/* Picker row */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end bg-white p-3 rounded-xl border border-[#E9E4D9]">
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-0.5">Product</label>
                  <select
                    value={pickerProductId}
                    onChange={e => handleProductSelect(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#F8F6F0] border border-[#E9E4D9] text-xs"
                  >
                    <option value="">-- Choose from Catalog --</option>
                    {catalogProducts.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} (₹{p.price}/{p.unit})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-0.5">Weight / Variant</label>
                  {(() => {
                    const prod = catalogProducts.find(p => p.id === pickerProductId);
                    if (prod?.weightVariants && prod.weightVariants.length > 0) {
                      return (
                        <select
                          value={pickerVariantId}
                          onChange={e => handleVariantSelect(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#F8F6F0] border border-[#E9E4D9] text-xs"
                        >
                          {prod.weightVariants.map(v => (
                            <option key={v.id} value={v.id}>
                              {v.weightLabel} - ₹{v.sellingPrice}
                            </option>
                          ))}
                        </select>
                      );
                    }
                    return (
                      <div className="px-2.5 py-1.5 rounded-lg bg-[#F8F6F0] text-[#888B83] text-xs border border-[#E9E4D9]">
                        {prod ? `Standard (${prod.unit})` : 'Select product'}
                      </div>
                    );
                  })()}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-0.5">Custom Price (₹) *</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={pickerUnitPrice}
                    onChange={e => setPickerUnitPrice(e.target.value)}
                    placeholder="e.g. 850"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#F8F6F0] border border-[#E9E4D9] text-xs font-semibold text-[#183D32] focus:border-[#183D32] focus:bg-white transition-colors"
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-0.5">Qty</label>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={pickerQuantity}
                    onChange={e => setPickerQuantity(Math.max(0.1, Number(e.target.value) || 1))}
                    className="w-full px-2 py-1.5 rounded-lg bg-[#F8F6F0] border border-[#E9E4D9] text-xs font-semibold"
                  />
                </div>

                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={handleAddItem}
                    disabled={!pickerProductId}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#183D32] hover:bg-[#245746] disabled:opacity-50 text-white font-semibold cursor-pointer text-xs"
                  >
                    + Add Item
                  </button>
                </div>
              </div>

              {/* Items List Table */}
              {orderItems.length > 0 ? (
                <div className="overflow-x-auto border border-[#E9E4D9] rounded-xl bg-white">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#E9E4D9] bg-[#F8F6F0] text-[#888B83] text-[11px]">
                        <th className="py-2 px-3">Item</th>
                        <th className="py-2 px-2">Variant</th>
                        <th className="py-2 px-2">Unit Price (₹)</th>
                        <th className="py-2 px-2">Qty</th>
                        <th className="py-2 px-2">Subtotal</th>
                        <th className="py-2 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E9E4D9]">
                      {orderItems.map((it, idx) => (
                        <tr key={idx} className="hover:bg-[#FAF3E3]/40">
                          <td className="py-2 px-3 font-medium text-[#183D32]">{it.productName}</td>
                          <td className="py-2 px-2 text-[#5C6058]">{it.weightLabel || 'Base'}</td>
                          <td className="py-2 px-2 text-[#5C6058]">
                            <div className="flex items-center gap-1">
                              <span className="text-[#888B83]">₹</span>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={it.unitPrice}
                                onChange={e => handleUpdateItemPrice(idx, Number(e.target.value) || 0)}
                                className="w-20 px-1.5 py-0.5 rounded border border-[#E9E4D9] text-xs font-semibold bg-[#F8F6F0] focus:bg-white focus:border-[#183D32]"
                              />
                            </div>
                          </td>
                          <td className="py-2 px-2 font-semibold text-[#183D32]">
                            <input
                              type="number"
                              min={0.1}
                              step={0.1}
                              value={it.quantity}
                              onChange={e => handleUpdateItemQty(idx, Number(e.target.value) || 1)}
                              className="w-16 px-1.5 py-0.5 rounded border border-[#E9E4D9] text-xs font-semibold bg-[#F8F6F0] focus:bg-white focus:border-[#183D32]"
                            />
                          </td>
                          <td className="py-2 px-2 font-bold text-[#183D32]">{formatINR(it.subtotal)}</td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="text-[#C65B50] hover:text-red-700 p-1 cursor-pointer"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center py-4 text-xs text-[#888B83] bg-white rounded-xl border border-dashed border-[#E9E4D9]">
                  No items added yet. Choose a product above and click "+ Add Item".
                </p>
              )}

              {/* Order Totals Bar */}
              {orderItems.length > 0 && (
                <div className="p-3 bg-white rounded-xl border border-[#E9E4D9] flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div>
                    <span className="text-[#888B83]">Subtotal:</span>{' '}
                    <span className="font-semibold text-[#183D32]">{formatINR(draftSubtotal)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#888B83]">Shipping:</span>
                    <input
                      type="number"
                      min={0}
                      value={shippingOverride !== '' ? shippingOverride : autoShipping}
                      onChange={e => setShippingOverride(e.target.value)}
                      placeholder={String(autoShipping)}
                      className="w-20 px-2 py-1 rounded bg-[#F8F6F0] border border-[#E9E4D9] text-xs font-semibold"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#888B83]">Discount:</span>
                    <input
                      type="number"
                      min={0}
                      value={discountAmount}
                      onChange={e => setDiscountAmount(e.target.value)}
                      className="w-20 px-2 py-1 rounded bg-[#F8F6F0] border border-[#E9E4D9] text-xs font-semibold"
                    />
                  </div>
                  <div className="text-sm font-bold text-[#183D32]">
                    <span>Total:</span> <span className="text-[#C8A96B]">{formatINR(draftTotal)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Payment Details & Proof Upload */}
            <div className="p-3.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] space-y-3">
              <div className="font-semibold text-[#183D32] flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-[#C8A96B]" />
                <span>Payment & Proof *</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-1">Payment Method *</label>
                  <div className="flex gap-1.5">
                    {[
                      { id: 'upi', label: 'UPI' },
                      { id: 'cash', label: 'Cash' },
                      { id: 'card', label: 'Card' },
                    ].map(pm => (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setPaymentMethod(pm.id as any)}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                          paymentMethod === pm.id
                            ? 'bg-[#183D32] text-white border-[#183D32]'
                            : 'bg-white text-[#5C6058] border-[#E9E4D9] hover:bg-[#F8F6F0]'
                        }`}
                      >
                        {pm.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-1">Payment Status *</label>
                  <select
                    value={paymentStatus}
                    onChange={e => setPaymentStatus(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#E9E4D9] text-xs font-medium"
                  >
                    <option value="paid">Paid (Verified)</option>
                    <option value="pending">Pending</option>
                    <option value="cod">Cash on Delivery</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-1">Transaction Ref / UTR</label>
                  <input
                    type="text"
                    value={paymentReference}
                    onChange={e => setPaymentReference(e.target.value)}
                    placeholder="e.g. UPI UTR or Card auth"
                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#E9E4D9]"
                  />
                </div>
              </div>

              {/* Upload Payment Screenshot or Receipt */}
              <div className="pt-2 border-t border-[#E9E4D9]">
                <label className="block text-[11px] font-semibold text-[#183D32] mb-1.5">
                  Upload Payment Screenshot / Receipt (Image or PDF)
                </label>
                {paymentScreenshotUrl ? (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-[#C8A96B] gap-3">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={paymentScreenshotUrl}
                        alt="Proof Preview"
                        className="w-12 h-12 object-cover rounded-lg border border-[#E9E4D9]"
                        onError={e => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                      />
                      <div>
                        <div className="font-semibold text-[#183D32] flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                          <span>Payment proof attached</span>
                        </div>
                        <a
                          href={paymentScreenshotUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-[#245746] hover:underline"
                        >
                          View full screenshot ↗
                        </a>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPaymentScreenshotUrl('')}
                      className="text-xs text-[#C65B50] hover:text-red-700 font-medium px-2 py-1 rounded border border-[#E9E4D9] cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-[#E9E4D9] hover:border-[#183D32] text-xs font-medium text-[#183D32] cursor-pointer transition-colors shadow-sm">
                      <UploadCloud className="w-4 h-4 text-[#C8A96B]" />
                      <span>{uploadingProof ? 'Uploading Proof...' : 'Choose Screenshot / Image'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,application/pdf"
                        disabled={uploadingProof}
                        onChange={handleProofUpload}
                        className="hidden"
                      />
                    </label>
                    <span className="text-[11px] text-[#888B83]">
                      Supports PNG, JPG, WEBP, or PDF (up to 5 MB)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 5. Internal Notes */}
            <div>
              <label className="block text-[11px] font-medium text-[#5C6058] mb-1">
                Internal Order Notes (Optional)
              </label>
              <textarea
                rows={2}
                value={manualOrderNotes}
                onChange={e => setManualOrderNotes(e.target.value)}
                placeholder="e.g. Customer placed via WhatsApp. Paid ₹1,200 via GPay. Wants dispatch tomorrow morning."
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs resize-none"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#E9E4D9]">
              <div className="text-xs text-[#888B83]">
                Total: <strong className="text-base text-[#183D32] font-bold">{formatINR(draftTotal)}</strong>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={submittingCreate}
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#E9E4D9] text-[#5C6058] hover:text-[#183D32] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCreate || orderItems.length === 0}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#183D32] hover:bg-[#245746] disabled:opacity-50 text-white font-semibold cursor-pointer shadow-md transition-all"
                >
                  <FileText className="w-4 h-4 text-[#C8A96B]" />
                  <span>{submittingCreate ? 'Creating Order...' : 'Create Order & View Final Invoice'}</span>
                </button>
              </div>
            </div>
          </form>
        </AdminModal>

        {/* Edit Manual Order Modal */}
        <AdminModal
          open={editModalOpen}
          onClose={() => {
            if (!submittingEdit) setEditModalOpen(false);
          }}
          title={editingOrder ? `Edit Manual Order #${editingOrder.orderNumber}` : 'Edit Manual Order'}
          subtitle="Modify customer delivery address, line items, quantities, custom prices, and payment details."
          maxWidth="max-w-3xl"
        >
          <form onSubmit={handleSaveEditManualOrder} className="space-y-4 text-xs">
            {/* Customer Information */}
            <div className="p-3.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] space-y-2.5">
              <div className="font-semibold text-[#183D32] flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#C8A96B]" />
                <span>Customer & Delivery Details</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-0.5">Customer Name *</label>
                  <input
                    type="text"
                    required
                    value={editCustomerName}
                    onChange={e => setEditCustomerName(e.target.value)}
                    placeholder="e.g. Rajesh Sharma"
                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#E9E4D9]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-0.5">Mobile / Phone *</label>
                  <input
                    type="tel"
                    required
                    value={editCustomerPhone}
                    onChange={e => setEditCustomerPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#E9E4D9]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-0.5">Email (Optional)</label>
                  <input
                    type="email"
                    value={editCustomerEmail}
                    onChange={e => setEditCustomerEmail(e.target.value)}
                    placeholder="e.g. rajesh@example.com"
                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#E9E4D9]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-0.5">Street Address *</label>
                  <input
                    type="text"
                    required
                    value={editDeliveryAddress}
                    onChange={e => setEditDeliveryAddress(e.target.value)}
                    placeholder="Flat/House, Road, Area"
                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#E9E4D9]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-0.5">City *</label>
                  <input
                    type="text"
                    required
                    value={editCity}
                    onChange={e => setEditCity(e.target.value)}
                    placeholder="e.g. Surat / Mumbai"
                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#E9E4D9]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-0.5">State & Pincode *</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      required
                      value={editState}
                      onChange={e => setEditState(e.target.value)}
                      placeholder="State"
                      className="w-1/2 px-2.5 py-1.5 rounded-lg bg-white border border-[#E9E4D9]"
                    />
                    <input
                      type="text"
                      required
                      value={editPincode}
                      onChange={e => setEditPincode(e.target.value)}
                      placeholder="PIN"
                      className="w-1/2 px-2.5 py-1.5 rounded-lg bg-white border border-[#E9E4D9]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Product Selection & Items List */}
            <div className="p-3.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] space-y-3">
              <div className="font-semibold text-[#183D32] flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-[#C8A96B]" />
                  <span>Order Items & Custom Prices *</span>
                </div>
                <span className="text-[11px] text-[#888B83]">{editOrderItems.length} item(s)</span>
              </div>

              {/* Picker row */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end bg-white p-3 rounded-xl border border-[#E9E4D9]">
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-0.5">Product</label>
                  <select
                    value={editPickerProductId}
                    onChange={e => handleEditProductSelect(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#F8F6F0] border border-[#E9E4D9] text-xs"
                  >
                    <option value="">-- Choose from Catalog --</option>
                    {catalogProducts.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} (₹{p.price}/{p.unit})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-0.5">Weight / Variant</label>
                  {(() => {
                    const prod = catalogProducts.find(p => p.id === editPickerProductId);
                    if (prod?.weightVariants && prod.weightVariants.length > 0) {
                      return (
                        <select
                          value={editPickerVariantId}
                          onChange={e => handleEditVariantSelect(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#F8F6F0] border border-[#E9E4D9] text-xs"
                        >
                          {prod.weightVariants.map(v => (
                            <option key={v.id} value={v.id}>
                              {v.weightLabel} - ₹{v.sellingPrice}
                            </option>
                          ))}
                        </select>
                      );
                    }
                    return (
                      <div className="px-2.5 py-1.5 rounded-lg bg-[#F8F6F0] text-[#888B83] text-xs border border-[#E9E4D9]">
                        {prod ? `Standard (${prod.unit})` : 'Select product'}
                      </div>
                    );
                  })()}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-0.5">Custom Price (₹) *</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={editPickerUnitPrice}
                    onChange={e => setEditPickerUnitPrice(e.target.value)}
                    placeholder="e.g. 850"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#F8F6F0] border border-[#E9E4D9] text-xs font-semibold text-[#183D32] focus:border-[#183D32] focus:bg-white transition-colors"
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-0.5">Qty</label>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={editPickerQuantity}
                    onChange={e => setEditPickerQuantity(Math.max(0.1, Number(e.target.value) || 1))}
                    className="w-full px-2 py-1.5 rounded-lg bg-[#F8F6F0] border border-[#E9E4D9] text-xs font-semibold"
                  />
                </div>

                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={handleEditAddItem}
                    disabled={!editPickerProductId}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#183D32] hover:bg-[#245746] disabled:opacity-50 text-white font-semibold cursor-pointer text-xs"
                  >
                    + Add Item
                  </button>
                </div>
              </div>

              {/* Items List Table */}
              {editOrderItems.length > 0 ? (
                <div className="overflow-x-auto border border-[#E9E4D9] rounded-xl bg-white">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#E9E4D9] bg-[#F8F6F0] text-[#888B83] text-[11px]">
                        <th className="py-2 px-3">Item</th>
                        <th className="py-2 px-2">Variant</th>
                        <th className="py-2 px-2">Unit Price (₹)</th>
                        <th className="py-2 px-2">Qty</th>
                        <th className="py-2 px-2">Subtotal</th>
                        <th className="py-2 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E9E4D9]">
                      {editOrderItems.map((it, idx) => (
                        <tr key={idx} className="hover:bg-[#FAF3E3]/40">
                          <td className="py-2 px-3 font-medium text-[#183D32]">{it.productName}</td>
                          <td className="py-2 px-2 text-[#5C6058]">{it.weightLabel || 'Base'}</td>
                          <td className="py-2 px-2 text-[#5C6058]">
                            <div className="flex items-center gap-1">
                              <span className="text-[#888B83]">₹</span>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={it.unitPrice}
                                onChange={e => handleEditUpdateItemPrice(idx, Number(e.target.value) || 0)}
                                className="w-20 px-1.5 py-0.5 rounded border border-[#E9E4D9] text-xs font-semibold bg-[#F8F6F0] focus:bg-white focus:border-[#183D32]"
                              />
                            </div>
                          </td>
                          <td className="py-2 px-2 font-semibold text-[#183D32]">
                            <input
                              type="number"
                              min={0.1}
                              step={0.1}
                              value={it.quantity}
                              onChange={e => handleEditUpdateItemQty(idx, Number(e.target.value) || 1)}
                              className="w-16 px-1.5 py-0.5 rounded border border-[#E9E4D9] text-xs font-semibold bg-[#F8F6F0] focus:bg-white focus:border-[#183D32]"
                            />
                          </td>
                          <td className="py-2 px-2 font-bold text-[#183D32]">{formatINR(it.subtotal)}</td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleEditRemoveItem(idx)}
                              className="text-[#C65B50] hover:text-red-700 p-1 cursor-pointer"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center py-4 text-xs text-[#888B83] bg-white rounded-xl border border-dashed border-[#E9E4D9]">
                  No items in order. Select a product above to add.
                </p>
              )}

              {/* Order Totals Bar */}
              {editOrderItems.length > 0 && (
                <div className="p-3 bg-white rounded-xl border border-[#E9E4D9] flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div>
                    <span className="text-[#888B83]">Subtotal:</span>{' '}
                    <span className="font-semibold text-[#183D32]">{formatINR(editDraftSubtotal)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#888B83]">Shipping:</span>
                    <input
                      type="number"
                      min={0}
                      value={editShippingOverride !== '' ? editShippingOverride : editAutoShipping}
                      onChange={e => setEditShippingOverride(e.target.value)}
                      placeholder={String(editAutoShipping)}
                      className="w-20 px-2 py-1 rounded bg-[#F8F6F0] border border-[#E9E4D9] text-xs font-semibold"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#888B83]">Discount:</span>
                    <input
                      type="number"
                      min={0}
                      value={editDiscountAmount}
                      onChange={e => setEditDiscountAmount(e.target.value)}
                      className="w-20 px-2 py-1 rounded bg-[#F8F6F0] border border-[#E9E4D9] text-xs font-semibold"
                    />
                  </div>
                  <div className="text-sm font-bold text-[#183D32]">
                    <span>Total:</span> <span className="text-[#C8A96B]">{formatINR(editDraftTotal)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Payment Details & Proof */}
            <div className="p-3.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] space-y-3">
              <div className="font-semibold text-[#183D32] flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-[#C8A96B]" />
                <span>Payment Details & Proof</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-1">Payment Method</label>
                  <div className="flex gap-1.5">
                    {[
                      { id: 'upi', label: 'UPI' },
                      { id: 'cash', label: 'Cash' },
                      { id: 'card', label: 'Card' },
                    ].map(pm => (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setEditPaymentMethod(pm.id as any)}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                          editPaymentMethod === pm.id
                            ? 'bg-[#183D32] text-white border-[#183D32]'
                            : 'bg-white text-[#5C6058] border-[#E9E4D9] hover:bg-[#F8F6F0]'
                        }`}
                      >
                        {pm.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-1">Payment Status</label>
                  <select
                    value={editPaymentStatus}
                    onChange={e => setEditPaymentStatus(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#E9E4D9] text-xs font-medium"
                  >
                    <option value="paid">Paid (Verified)</option>
                    <option value="pending">Pending</option>
                    <option value="cod">Cash on Delivery</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#5C6058] mb-1">Transaction Ref / UTR</label>
                  <input
                    type="text"
                    value={editPaymentReference}
                    onChange={e => setEditPaymentReference(e.target.value)}
                    placeholder="e.g. UPI UTR or Card auth"
                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#E9E4D9]"
                  />
                </div>
              </div>

              {/* Upload or Update Payment Screenshot */}
              <div className="pt-2 border-t border-[#E9E4D9]">
                <label className="block text-[11px] font-semibold text-[#183D32] mb-1.5">
                  Payment Screenshot / Receipt (Image or PDF)
                </label>
                {editPaymentScreenshotUrl ? (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-[#C8A96B] gap-3">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={editPaymentScreenshotUrl}
                        alt="Proof Preview"
                        className="w-12 h-12 object-cover rounded-lg border border-[#E9E4D9]"
                        onError={e => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                      />
                      <div>
                        <div className="font-semibold text-[#183D32] flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                          <span>Payment proof attached</span>
                        </div>
                        <a
                          href={editPaymentScreenshotUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-[#245746] hover:underline"
                        >
                          View full screenshot ↗
                        </a>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditPaymentScreenshotUrl('')}
                      className="text-xs text-[#C65B50] hover:text-red-700 font-medium px-2 py-1 rounded border border-[#E9E4D9] cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-[#E9E4D9] hover:border-[#183D32] text-xs font-medium text-[#183D32] cursor-pointer transition-colors shadow-sm">
                      <UploadCloud className="w-4 h-4 text-[#C8A96B]" />
                      <span>{uploadingEditProof ? 'Uploading Proof...' : 'Choose Screenshot / Image'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,application/pdf"
                        disabled={uploadingEditProof}
                        onChange={handleEditProofUpload}
                        className="hidden"
                      />
                    </label>
                    <span className="text-[11px] text-[#888B83]">
                      Supports PNG, JPG, WEBP, or PDF (up to 5 MB)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Internal Notes */}
            <div>
              <label className="block text-[11px] font-medium text-[#5C6058] mb-1">
                Internal Order Notes
              </label>
              <textarea
                rows={2}
                value={editInternalNotes}
                onChange={e => setEditInternalNotes(e.target.value)}
                placeholder="Internal administrative or delivery notes..."
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs resize-none"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#E9E4D9]">
              <div className="text-xs text-[#888B83]">
                Updated Total: <strong className="text-base text-[#183D32] font-bold">{formatINR(editDraftTotal)}</strong>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={submittingEdit}
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#E9E4D9] text-[#5C6058] hover:text-[#183D32] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit || editOrderItems.length === 0}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#183D32] hover:bg-[#245746] disabled:opacity-50 text-white font-semibold cursor-pointer shadow-md transition-all"
                >
                  <Edit3 className="w-4 h-4 text-[#C8A96B]" />
                  <span>{submittingEdit ? 'Saving Changes...' : 'Save Changes & Update Order'}</span>
                </button>
              </div>
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
