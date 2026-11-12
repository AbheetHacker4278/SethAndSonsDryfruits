import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Upload,
  CheckCircle2,
  IndianRupee,
  Eye,
  Edit3,
  Trash2,
  RotateCcw,
  Search,
  X,
  AlertTriangle,
  FileText,
  Boxes,
  ClipboardList,
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AdminPdfViewerModal, toAdminMediaUrl } from '../../components/admin/AdminPdfViewerModal';
import {
  AdminCard,
  AdminModal,
  ConfirmDialog,
  EmptyState,
  LoadingSkeleton,
  PaginationBar,
  StatusBadge,
  ToastBanner,
} from '../../components/admin/AdminUI';
import { apiRequest, ApiError, apiUpload } from '../../services/api';
import { formatINR } from '../../utils/priceCalculator';

interface PurchaseLineDraft {
  productId: string;
  quantity: number;
  purchasePrice: number;
  gstRate: number;
  batchNumber: string;
  expiryDate: string;
}

export default function AdminPurchases() {
  const [purchases, setPurchases] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [liveMsg, setLiveMsg] = useState('');

  // Filters & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ordered' | 'received'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'partial' | 'pending'>('all');
  const [page, setPage] = useState(1);
  const perPage = 10;

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPoId, setEditingPoId] = useState<string | null>(null);
  const [viewPo, setViewPo] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [billPreview, setBillPreview] = useState<{ title: string; subtitle: string; url: string } | null>(null);

  // PO Form State
  const [supplierId, setSupplierId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [additionalExpenses, setAdditionalExpenses] = useState('0');
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'partial' | 'paid'>('paid');
  const [paidAmount, setPaidAmount] = useState('0');
  const [receiveImmediately, setReceiveImmediately] = useState(true);
  const [invoiceFile, setInvoiceFile] = useState('');
  const [invoiceLabel, setInvoiceLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<PurchaseLineDraft[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [poRes, supRes, prodRes] = await Promise.all([
        apiRequest<{ purchases: any[] }>('/api/admin/purchases'),
        apiRequest<{ suppliers: any[] }>('/api/admin/suppliers'),
        apiRequest<{ products: any[] }>('/api/admin/erp/products'),
      ]);
      setPurchases(poRes.purchases || []);
      setSuppliers(supRes.suppliers || []);
      setProducts(prodRes.products || []);
      if (!supplierId && supRes.suppliers?.length) setSupplierId(supRes.suppliers[0].id);
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to load purchase orders.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, paymentFilter]);

  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);

  const zeroOrLowProducts = useMemo(() => {
    return products
      .filter(p => Number(p.stock || 0) <= 0 || Number(p.stock || 0) <= Number(p.minStockAlert ?? 5))
      .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0));
  }, [products]);

  const zeroStockCount = useMemo(
    () => products.filter(p => Number(p.stock || 0) <= 0).length,
    [products]
  );

  const summaryStats = useMemo(() => {
    const totalSpend = purchases.reduce((s, po) => s + Number(po.totalAmount || 0), 0);
    const pendingPayable = purchases.reduce(
      (s, po) => s + Math.max(0, Number(po.totalAmount || 0) - Number(po.paidAmount || 0)),
      0
    );
    const pendingReceipt = purchases.filter(po => po.status === 'ordered').length;
    return {
      totalCount: purchases.length,
      totalSpend,
      pendingPayable,
      pendingReceipt,
    };
  }, [purchases]);

  const filteredPurchases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return purchases.filter(po => {
      if (statusFilter !== 'all' && po.status !== statusFilter) return false;
      if (paymentFilter !== 'all' && po.paymentStatus !== paymentFilter) return false;
      if (!q) return true;
      const itemNames = (po.items || []).map((it: any) => it.productName || '').join(' ');
      return `${po.purchaseNumber || ''} ${po.supplierName || ''} ${itemNames}`.toLowerCase().includes(q);
    });
  }, [purchases, searchQuery, statusFilter, paymentFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredPurchases.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pagedPurchases = filteredPurchases.slice((safePage - 1) * perPage, safePage * perPage);

  const formTotals = useMemo(() => {
    let subtotal = 0;
    let gstTotal = 0;
    for (const li of lineItems) {
      const sub = Math.round(Number(li.quantity || 0) * Number(li.purchasePrice || 0));
      const gst = Math.round(sub * (Number(li.gstRate || 0) / 100));
      subtotal += sub;
      gstTotal += gst;
    }
    const freight = Math.max(0, Number(additionalExpenses || 0));
    return {
      subtotal,
      gstTotal,
      freight,
      grandTotal: subtotal + gstTotal + freight,
    };
  }, [lineItems, additionalExpenses]);

  const makeDefaultLineForProduct = (prod?: any): PurchaseLineDraft => {
    const target = prod || products[0];
    const defaultQty = target?.unit === 'gram' || target?.unit === 'ml' ? 250 : 10;
    return {
      productId: target?.id || '',
      quantity: defaultQty,
      purchasePrice: Math.max(1, Number(target?.purchasePrice || 500)),
      gstRate: Number(target?.gstRate ?? 5),
      batchNumber: '',
      expiryDate: '',
    };
  };

  const openCreateModal = (presetProduct?: any) => {
    setEditingPoId(null);
    setSupplierId(suppliers[0]?.id || '');
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setAdditionalExpenses('0');
    setPaymentStatus('paid');
    setPaidAmount('0');
    setReceiveImmediately(true);
    setInvoiceFile('');
    setInvoiceLabel('');
    setNotes('');
    setLineItems([makeDefaultLineForProduct(presetProduct)]);
    setModalOpen(true);
    if (presetProduct) {
      setLiveMsg(`Opened Restock Purchase Order for ${presetProduct.name}.`);
    }
  };

  const openEditModal = (po: any) => {
    setEditingPoId(po.id);
    setSupplierId(po.supplierId || suppliers[0]?.id || '');
    setPurchaseDate((po.purchaseDate || new Date().toISOString()).slice(0, 10));
    setAdditionalExpenses(String(po.additionalExpenses ?? 0));
    setPaymentStatus(po.paymentStatus || 'paid');
    setPaidAmount(String(po.paidAmount ?? 0));
    setReceiveImmediately(po.status === 'received');
    setInvoiceFile(po.invoiceFile || '');
    setInvoiceLabel(po.invoiceFile ? `Uploaded Invoice (${po.purchaseNumber})` : '');
    setNotes(po.notes || '');
    setLineItems(
      Array.isArray(po.items) && po.items.length > 0
        ? po.items.map((it: any) => ({
            productId: it.productId,
            quantity: Number(it.quantity || 1),
            purchasePrice: Number(it.purchasePrice || 1),
            gstRate: Number(it.gstRate ?? 5),
            batchNumber: it.batchNumber || '',
            expiryDate: it.expiryDate ? String(it.expiryDate).slice(0, 10) : '',
          }))
        : [makeDefaultLineForProduct()]
    );
    setModalOpen(true);
  };

  const openRestockAgainModal = (po: any) => {
    setEditingPoId(null);
    setSupplierId(po.supplierId || suppliers[0]?.id || '');
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setAdditionalExpenses(String(po.additionalExpenses ?? 0));
    setPaymentStatus('paid');
    setPaidAmount('0');
    setReceiveImmediately(true);
    setInvoiceFile('');
    setInvoiceLabel('');
    setNotes(`Restock replenishment (based on #${po.purchaseNumber})`);
    setLineItems(
      Array.isArray(po.items) && po.items.length > 0
        ? po.items.map((it: any) => ({
            productId: it.productId,
            quantity: Number(it.quantity || 1),
            purchasePrice: Number(it.purchasePrice || 1),
            gstRate: Number(it.gstRate ?? 5),
            batchNumber: '',
            expiryDate: '',
          }))
        : [makeDefaultLineForProduct()]
    );
    setModalOpen(true);
    setLiveMsg(`Pre-filled new restock order from #${po.purchaseNumber}.`);
  };

  const handleInvoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadingInvoice(true);
    const fd = new FormData();
    fd.append('invoice', f);
    try {
      const res = await apiUpload<{ invoiceFile: string }>('/api/admin/purchases/upload-invoice', fd);
      setInvoiceFile(res.invoiceFile);
      setInvoiceLabel(f.name);
      setToast({ type: 'ok', text: `Purchase invoice "${f.name}" uploaded.` });
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Upload failed.' });
    } finally {
      setUploadingInvoice(false);
    }
  };

  const handleProductLineChange = (index: number, newProdId: string) => {
    const prod = productMap.get(newProdId);
    setLineItems(arr =>
      arr.map((x, idx) =>
        idx === index
          ? {
              ...x,
              productId: newProdId,
              purchasePrice: Math.max(1, Number(prod?.purchasePrice || x.purchasePrice || 500)),
              gstRate: Number(prod?.gstRate ?? 5),
              quantity: prod?.unit === 'gram' || prod?.unit === 'ml' ? 250 : x.quantity,
            }
          : x
      )
    );
  };

  const handleSavePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) {
      setToast({ type: 'err', text: 'Please select or create a supplier first.' });
      return;
    }
    setSaving(true);
    setToast(null);
    const payload = {
      supplierId,
      purchaseDate,
      additionalExpenses: Number(additionalExpenses || 0),
      paymentStatus,
      paidAmount: Number(paidAmount || 0),
      receiveImmediately,
      invoiceFile: invoiceFile || null,
      notes: notes.trim(),
      items: lineItems.map(li => ({
        ...li,
        quantity: Number(li.quantity),
        purchasePrice: Number(li.purchasePrice),
        gstRate: Number(li.gstRate || 0),
        batchNumber: li.batchNumber.trim() || undefined,
        expiryDate: li.expiryDate || undefined,
      })),
    };

    try {
      const res = editingPoId
        ? await apiRequest<{ message: string }>(`/api/admin/purchases/${editingPoId}`, {
            method: 'PUT',
            body: payload,
          })
        : await apiRequest<{ message: string }>('/api/admin/purchases', {
            method: 'POST',
            body: payload,
          });
      setModalOpen(false);
      setEditingPoId(null);
      setToast({ type: 'ok', text: res.message });
      setLiveMsg(res.message);
      await load();
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Could not save purchase order.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReceive = async (id: string) => {
    try {
      const res = await apiRequest<{ message: string }>(`/api/admin/purchases/${id}/receive`, {
        method: 'POST',
      });
      setToast({ type: 'ok', text: res.message });
      setLiveMsg(res.message);
      await load();
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to mark purchase order received.',
      });
    }
  };

  const handleRecordPayment = async (po: any) => {
    const due = Math.max(0, Number(po.totalAmount) - Number(po.paidAmount));
    if (due <= 0) return;
    try {
      const res = await apiRequest<{ message: string }>(`/api/admin/purchases/${po.id}/payment`, {
        method: 'POST',
        body: { amount: due },
      });
      setToast({ type: 'ok', text: res.message });
      setLiveMsg(res.message);
      await load();
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to record supplier payment.',
      });
    }
  };

  const handleDeletePo = async () => {
    if (!deleteTarget) return;
    try {
      const res = await apiRequest<{ message: string }>(`/api/admin/purchases/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      setDeleteTarget(null);
      if (viewPo?.id === deleteTarget.id) setViewPo(null);
      setToast({ type: 'ok', text: res.message });
      setLiveMsg(res.message);
      await load();
    } catch (err) {
      setDeleteTarget(null);
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to delete purchase order.',
      });
    }
  };

  return (
    <AdminLayout
      title="Stock Purchases & Procurement"
      subtitle="Create or edit supplier purchase orders, upload bills, restock zero-stock harvests in one click, and audit received inventory."
      actions={
        <button
          type="button"
          onClick={() => openCreateModal()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#183D32] hover:bg-[#245746] text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
        >
          <Plus className="w-4 h-4 text-[#C8A96B]" aria-hidden="true" />
          <span>New Purchase Order</span>
        </button>
      }
    >
      {/* Screen reader status announcements */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveMsg}
      </div>

      <div className="space-y-6">
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

        {/* Summary KPI Strip */}
        {!loading && (
          <section aria-label="Purchase summary metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <AdminCard padding="p-5">
              <div className="flex items-center justify-between text-xs font-medium text-[#5C6058]">
                <span>Total Purchase Orders</span>
                <ClipboardList className="w-4 h-4 text-[#183D32]" aria-hidden="true" />
              </div>
              <div className="text-2xl font-bold text-[#183D32] mt-1.5 tabular-nums">
                {summaryStats.totalCount}
              </div>
              <div className="text-[11px] text-[#5C6058] mt-1">
                {summaryStats.pendingReceipt} awaiting stock receipt
              </div>
            </AdminCard>

            <AdminCard padding="p-5">
              <div className="flex items-center justify-between text-xs font-medium text-[#5C6058]">
                <span>Total Procurement Spend</span>
                <IndianRupee className="w-4 h-4 text-[#245746]" aria-hidden="true" />
              </div>
              <div className="text-2xl font-bold text-[#252923] mt-1.5 tabular-nums">
                {formatINR(summaryStats.totalSpend)}
              </div>
              <div className="text-[11px] text-[#5C6058] mt-1">Incl. GST &amp; freight</div>
            </AdminCard>

            <AdminCard padding="p-5">
              <div className="flex items-center justify-between text-xs font-medium text-[#5C6058]">
                <span>Pending Supplier Payables</span>
                <FileText className="w-4 h-4 text-[#8F6C2B]" aria-hidden="true" />
              </div>
              <div className="text-2xl font-bold text-[#7A591F] mt-1.5 tabular-nums">
                {formatINR(summaryStats.pendingPayable)}
              </div>
              <div className="text-[11px] text-[#5C6058] mt-1">Unpaid PO balances</div>
            </AdminCard>

            <button
              type="button"
              onClick={() => zeroOrLowProducts.length > 0 && openCreateModal(zeroOrLowProducts[0])}
              className={`text-left bg-white border rounded-2xl p-5 shadow-[0_2px_14px_rgba(24,61,50,0.04)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32] ${
                zeroStockCount > 0 ? 'border-[#F2C3BE] hover:border-[#C65B50]' : 'border-[#E9E4D9]'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-medium text-[#5C6058]">
                <span>Out-of-Stock Alerts (0 Stock)</span>
                <Boxes className="w-4 h-4 text-[#C65B50]" aria-hidden="true" />
              </div>
              <div className="text-2xl font-bold text-[#B34338] mt-1.5 tabular-nums">
                {zeroStockCount} item{zeroStockCount === 1 ? '' : 's'}
              </div>
              <div className="text-[11px] text-[#5C6058] mt-1">
                {zeroOrLowProducts.length > 0 ? 'Click to restock immediately →' : 'All stocks healthy'}
              </div>
            </button>
          </section>
        )}

        {/* Quick Zero / Low Stock Restock Strip */}
        {!loading && zeroOrLowProducts.length > 0 && (
          <section
            aria-label="Items needing restock"
            className="p-4 rounded-2xl bg-[#FAF3E3] border border-[#C8A96B] space-y-2.5 text-xs text-[#6B4E1B]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0 text-[#B34338]" aria-hidden="true" />
                <span>
                  Restock Alert: {zeroStockCount} product{zeroStockCount === 1 ? '' : 's'} reached 0 stock
                  {zeroOrLowProducts.length > zeroStockCount
                    ? ` (${zeroOrLowProducts.length - zeroStockCount} low stock)`
                    : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={() => openCreateModal(zeroOrLowProducts[0])}
                className="px-3 py-1 rounded-lg bg-[#183D32] hover:bg-[#245746] text-white font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
              >
                + Quick Restock PO
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {zeroOrLowProducts.slice(0, 6).map((p: any) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openCreateModal(p)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#F8F6F0] border border-[#DEC48C] text-[#252923] font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                >
                  <span className="font-semibold text-[#183D32]">{p.name}</span>
                  <span className="text-[#B34338] font-bold tabular-nums">
                    ({p.stock} {p.unit})
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-[#245746] font-bold underline">
                    Restock
                  </span>
                </button>
              ))}
              {zeroOrLowProducts.length > 6 && (
                <span className="self-center text-[11px] font-medium text-[#6B4E1B]">
                  +{zeroOrLowProducts.length - 6} more out of stock
                </span>
              )}
            </div>
          </section>
        )}

        {/* Filter & Search Bar */}
        <AdminCard padding="p-4" className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <label htmlFor="po-search-input" className="sr-only">
              Search purchase orders by PO number, supplier, or product
            </label>
            <Search
              className="w-4 h-4 text-[#5C6058] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="po-search-input"
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search PO #, supplier name, or product..."
              className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3] text-xs text-[#252923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-[#5C6058] hover:text-[#183D32] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <div>
              <label htmlFor="po-status-filter" className="sr-only">Filter by receipt status</label>
              <select
                id="po-status-filter"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="px-3 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3] text-xs text-[#252923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
              >
                <option value="all">All Statuses</option>
                <option value="received">Received</option>
                <option value="ordered">Ordered (Pending Stock)</option>
              </select>
            </div>
            <div>
              <label htmlFor="po-payment-filter" className="sr-only">Filter by payment status</label>
              <select
                id="po-payment-filter"
                value={paymentFilter}
                onChange={e => setPaymentFilter(e.target.value as any)}
                className="px-3 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3] text-xs text-[#252923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
              >
                <option value="all">All Payments</option>
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
        </AdminCard>

        {/* Purchase Orders Table */}
        <AdminCard>
          {loading ? (
            <LoadingSkeleton rows={4} />
          ) : pagedPurchases.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No purchase orders found"
              description={
                purchases.length === 0
                  ? 'Create a purchase order to restock zero-stock items and attach supplier bills.'
                  : 'Try adjusting your search or filter selections.'
              }
              action={
                <button
                  type="button"
                  onClick={() => openCreateModal(zeroOrLowProducts[0])}
                  className="px-4 py-2 rounded-xl bg-[#183D32] text-white text-xs font-semibold cursor-pointer"
                >
                  + Create Purchase Order
                </button>
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">
                    Supplier purchase orders with item counts, totals, payment status, receipt status, and management actions
                  </caption>
                  <thead>
                    <tr className="border-b border-[#E9E4D9] text-[#5C6058] uppercase text-[11px]">
                      <th scope="col" className="py-3 pr-3">PO #</th>
                      <th scope="col" className="py-3 pr-3">Supplier &amp; Items</th>
                      <th scope="col" className="py-3 pr-3">Date</th>
                      <th scope="col" className="py-3 pr-3">Total (incl GST)</th>
                      <th scope="col" className="py-3 pr-3">Payment</th>
                      <th scope="col" className="py-3 pr-3">Status</th>
                      <th scope="col" className="py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9E4D9]">
                    {pagedPurchases.map(po => {
                      const itemsSummary = (po.items || [])
                        .map((it: any) => `${it.productName} (${it.quantity} ${it.unit || 'kg'})`)
                        .join(', ');
                      return (
                        <tr key={po.id} className="hover:bg-[#F8F6F0]/70">
                          <td className="py-3 pr-3 font-bold text-[#183D32] whitespace-nowrap">
                            {po.purchaseNumber}
                          </td>
                          <td className="py-3 pr-3">
                            <div className="font-semibold text-[#252923]">{po.supplierName}</div>
                            {itemsSummary && (
                              <div className="text-[11px] text-[#5C6058] truncate max-w-[260px]" title={itemsSummary}>
                                {itemsSummary}
                              </div>
                            )}
                          </td>
                          <td className="py-3 pr-3 text-[#5C6058] whitespace-nowrap">{po.purchaseDate}</td>
                          <td className="py-3 pr-3 font-bold text-[#252923] tabular-nums whitespace-nowrap">
                            {formatINR(po.totalAmount)}
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap">
                            <StatusBadge status={po.paymentStatus} />
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap">
                            <StatusBadge status={po.status} />
                          </td>
                          <td className="py-3 text-right whitespace-nowrap">
                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setViewPo(po)}
                                title="View PO Details"
                                aria-label={`View details for ${po.purchaseNumber}`}
                                className="p-1.5 rounded-lg bg-[#F8F6F0] hover:bg-[#E9E4D9] text-[#245746] border border-[#E2DDD2] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                              >
                                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>

                              {po.invoiceFile && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setBillPreview({
                                      title: `Purchase Invoice ${po.purchaseNumber}`,
                                      subtitle: po.supplierName || 'Supplier Bill',
                                      url: toAdminMediaUrl(po.invoiceFile),
                                    })
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F8F6F0] hover:bg-[#183D32] text-[#183D32] hover:text-white border border-[#D8D1C3] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                                >
                                  <FileText className="w-3 h-3" aria-hidden="true" />
                                  <span>Invoice</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => openEditModal(po)}
                                title="Edit Purchase Order"
                                aria-label={`Edit ${po.purchaseNumber}`}
                                className="p-1.5 rounded-lg bg-[#F8F6F0] hover:bg-[#E9E4D9] text-[#183D32] border border-[#E2DDD2] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                              >
                                <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>

                              <button
                                type="button"
                                onClick={() => openRestockAgainModal(po)}
                                title="Restock Again (Clone PO)"
                                aria-label={`Restock items from ${po.purchaseNumber}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#E7F3EE] hover:bg-[#183D32] text-[#183D32] hover:text-white border border-[#B7DEC9] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                              >
                                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                                <span>Restock</span>
                              </button>

                              {po.status === 'ordered' && (
                                <button
                                  type="button"
                                  onClick={() => handleReceive(po.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#183D32] hover:bg-[#245746] text-white font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                                >
                                  <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                                  <span>Receive</span>
                                </button>
                              )}

                              {po.paymentStatus !== 'paid' && (
                                <button
                                  type="button"
                                  onClick={() => handleRecordPayment(po)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FAF3E3] hover:bg-[#F3E5C5] border border-[#C8A96B] text-[#7A591F] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                                >
                                  <IndianRupee className="w-3 h-3" aria-hidden="true" />
                                  <span>Pay Due</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setDeleteTarget(po)}
                                title="Delete Purchase Order"
                                aria-label={`Delete ${po.purchaseNumber}`}
                                className="p-1.5 rounded-lg bg-[#FCECEB] hover:bg-[#F8D7D4] text-[#B34338] border border-[#F2C3BE] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C65B50]"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={safePage}
                totalPages={totalPages}
                totalItems={filteredPurchases.length}
                onPageChange={setPage}
              />
            </>
          )}
        </AdminCard>

        {/* Create / Edit Purchase Order Modal */}
        <AdminModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditingPoId(null);
          }}
          title={editingPoId ? 'Edit Purchase Order' : 'Create Purchase Order'}
          subtitle="Select products, enter restock quantities & purchase cost, attach supplier invoice, and update stock."
          maxWidth="max-w-4xl"
        >
          <form onSubmit={handleSavePo} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="po-supplier" className="block font-semibold text-[#252923] mb-1">
                  Supplier <span className="text-[#C65B50]" aria-hidden="true">*</span>
                </label>
                <select
                  id="po-supplier"
                  required
                  aria-required="true"
                  value={supplierId}
                  onChange={e => setSupplierId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3] text-[#252923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                >
                  {suppliers.length === 0 ? (
                    <option value="">No suppliers found — create one in Suppliers</option>
                  ) : (
                    suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.supplierName}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label htmlFor="po-date" className="block font-semibold text-[#252923] mb-1">
                  Purchase Date <span className="text-[#C65B50]" aria-hidden="true">*</span>
                </label>
                <input
                  id="po-date"
                  type="date"
                  required
                  aria-required="true"
                  value={purchaseDate}
                  onChange={e => setPurchaseDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3] text-[#252923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                />
              </div>
              <div>
                <label htmlFor="po-freight" className="block font-semibold text-[#252923] mb-1">
                  Additional Freight / Handling (₹)
                </label>
                <input
                  id="po-freight"
                  type="number"
                  min={0}
                  value={additionalExpenses}
                  onChange={e => setAdditionalExpenses(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3] text-[#252923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                />
              </div>
            </div>

            {/* Line Items */}
            <div className="p-3.5 rounded-2xl bg-[#F8F6F0] border border-[#D8D1C3] space-y-3">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <div>
                  <span className="font-semibold text-sm text-[#183D32]">Purchase Line Items</span>
                  <span className="text-[11px] text-[#5C6058] ml-2">
                    ({lineItems.length} item{lineItems.length === 1 ? '' : 's'})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    products.length && setLineItems(prev => [...prev, makeDefaultLineForProduct()])
                  }
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-[#183D32] hover:bg-[#245746] text-white font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Add Line Item</span>
                </button>
              </div>

              <div className="space-y-3">
                {lineItems.map((li, i) => {
                  const selectedProd = productMap.get(li.productId);
                  const unitName = selectedProd?.unit || 'kg';
                  const lineSub = Math.round(Number(li.quantity || 0) * Number(li.purchasePrice || 0));
                  const lineGst = Math.round(lineSub * (Number(li.gstRate || 0) / 100));
                  const lineTotal = lineSub + lineGst;

                  return (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-white border border-[#E2DDD2] space-y-2.5"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                        <div className="sm:col-span-4">
                          <label htmlFor={`li-prod-${i}`} className="block font-medium text-[#252923] mb-1">
                            Product *
                          </label>
                          <select
                            id={`li-prod-${i}`}
                            value={li.productId}
                            onChange={e => handleProductLineChange(i, e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg bg-[#F8F6F0] border border-[#D8D1C3] text-[#252923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                          >
                            {products.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.stock} {p.unit})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label htmlFor={`li-qty-${i}`} className="block font-medium text-[#252923] mb-1">
                            Qty ({unitName}) *
                          </label>
                          <input
                            id={`li-qty-${i}`}
                            type="number"
                            required
                            min={unitName === 'kg' ? 0.25 : 1}
                            step={unitName === 'kg' ? '0.25' : '1'}
                            value={li.quantity}
                            onChange={e =>
                              setLineItems(arr =>
                                arr.map((x, idx) =>
                                  idx === i ? { ...x, quantity: Number(e.target.value) } : x
                                )
                              )
                            }
                            className="w-full px-2.5 py-2 rounded-lg bg-[#F8F6F0] border border-[#D8D1C3] text-[#252923] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label htmlFor={`li-rate-${i}`} className="block font-medium text-[#252923] mb-1">
                            Cost Rate (₹) *
                          </label>
                          <input
                            id={`li-rate-${i}`}
                            type="number"
                            required
                            min={1}
                            value={li.purchasePrice}
                            onChange={e =>
                              setLineItems(arr =>
                                arr.map((x, idx) =>
                                  idx === i ? { ...x, purchasePrice: Number(e.target.value) } : x
                                )
                              )
                            }
                            className="w-full px-2.5 py-2 rounded-lg bg-[#F8F6F0] border border-[#D8D1C3] text-[#252923] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                          />
                        </div>

                        <div className="sm:col-span-1">
                          <label htmlFor={`li-gst-${i}`} className="block font-medium text-[#252923] mb-1">
                            GST %
                          </label>
                          <input
                            id={`li-gst-${i}`}
                            type="number"
                            min={0}
                            max={28}
                            value={li.gstRate}
                            onChange={e =>
                              setLineItems(arr =>
                                arr.map((x, idx) =>
                                  idx === i ? { ...x, gstRate: Number(e.target.value) } : x
                                )
                              )
                            }
                            className="w-full px-2 py-2 rounded-lg bg-[#F8F6F0] border border-[#D8D1C3] text-[#252923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                          />
                        </div>

                        <div className="sm:col-span-3 flex items-center justify-between gap-2 pb-1">
                          <div>
                            <div className="text-[10px] uppercase text-[#5C6058]">Line Total</div>
                            <div className="font-bold text-sm text-[#183D32] tabular-nums">
                              {formatINR(lineTotal)}
                            </div>
                          </div>
                          {lineItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setLineItems(arr => arr.filter((_, idx) => idx !== i))}
                              aria-label={`Remove line item ${selectedProd?.name || i + 1}`}
                              className="p-1.5 rounded-lg bg-[#FCECEB] text-[#B34338] hover:bg-[#F8D7D4] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C65B50]"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center pt-1 border-t border-[#F0ECE2]">
                        <div>
                          <label htmlFor={`li-batch-${i}`} className="block text-[11px] font-medium text-[#5C6058] mb-0.5">
                            Batch # (Optional)
                          </label>
                          <input
                            id={`li-batch-${i}`}
                            type="text"
                            value={li.batchNumber}
                            onChange={e =>
                              setLineItems(arr =>
                                arr.map((x, idx) => (idx === i ? { ...x, batchNumber: e.target.value } : x))
                              )
                            }
                            placeholder="Auto-generated if blank"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#F8F6F0] border border-[#D8D1C3] text-[#252923]"
                          />
                        </div>
                        <div>
                          <label htmlFor={`li-exp-${i}`} className="block text-[11px] font-medium text-[#5C6058] mb-0.5">
                            Expiry Date (Optional)
                          </label>
                          <input
                            id={`li-exp-${i}`}
                            type="date"
                            value={li.expiryDate}
                            onChange={e =>
                              setLineItems(arr =>
                                arr.map((x, idx) => (idx === i ? { ...x, expiryDate: e.target.value } : x))
                              )
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#F8F6F0] border border-[#D8D1C3] text-[#252923]"
                          />
                        </div>
                        {selectedProd && (
                          <div className="text-[11px] text-[#5C6058] sm:pt-4">
                            Current stock: <strong className="text-[#183D32]">{selectedProd.stock} {selectedProd.unit}</strong>
                            {' · '}Sell: <strong>{formatINR(selectedProd.price)}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Live Order Total Summary */}
              <div className="p-3 rounded-xl bg-white border border-[#DEC48C] flex flex-wrap items-center justify-between gap-3">
                <div className="text-[11px] text-[#5C6058] space-x-3">
                  <span>Items Subtotal: <strong className="text-[#252923]">{formatINR(formTotals.subtotal)}</strong></span>
                  <span>GST: <strong className="text-[#252923]">{formatINR(formTotals.gstTotal)}</strong></span>
                  <span>Freight: <strong className="text-[#252923]">{formatINR(formTotals.freight)}</strong></span>
                </div>
                <div className="text-sm font-bold text-[#183D32] tabular-nums">
                  Grand Total: {formatINR(formTotals.grandTotal)}
                </div>
              </div>
            </div>

            {/* Payment & Invoice Upload */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label htmlFor="po-payment-status" className="block font-semibold text-[#252923] mb-1">
                  Payment Status
                </label>
                <select
                  id="po-payment-status"
                  value={paymentStatus}
                  onChange={e => setPaymentStatus(e.target.value as any)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3] text-[#252923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                >
                  <option value="paid">Paid in Full</option>
                  <option value="partial">Partial Payment</option>
                  <option value="pending">Pending Credit</option>
                </select>
              </div>

              {paymentStatus === 'partial' && (
                <div>
                  <label htmlFor="po-paid-amount" className="block font-semibold text-[#252923] mb-1">
                    Paid Amount (₹)
                  </label>
                  <input
                    id="po-paid-amount"
                    type="number"
                    min={0}
                    max={formTotals.grandTotal}
                    value={paidAmount}
                    onChange={e => setPaidAmount(e.target.value)}
                    placeholder="Paid ₹"
                    className="w-full px-3 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3] text-[#252923]"
                  />
                </div>
              )}

              <div className={paymentStatus === 'partial' ? '' : 'sm:col-span-2'}>
                <span className="block font-semibold text-[#252923] mb-1">Purchase Invoice (PDF / Image)</span>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#F8F6F0] hover:bg-[#EFECE4] border border-[#D8D1C3] text-[#183D32] font-semibold cursor-pointer focus-within:ring-2 focus-within:ring-[#183D32]">
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {uploadingInvoice
                        ? 'Uploading...'
                        : invoiceFile
                        ? `Replace (${invoiceLabel || 'Uploaded'})`
                        : 'Upload Purchase Invoice'}
                    </span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="sr-only"
                      disabled={uploadingInvoice}
                      onChange={handleInvoiceUpload}
                    />
                  </label>
                  {invoiceFile && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setBillPreview({
                            title: 'Purchase Invoice Preview',
                            subtitle: invoiceLabel || 'Uploaded Supplier Invoice',
                            url: toAdminMediaUrl(invoiceFile),
                          })
                        }
                        className="px-3 py-2 rounded-xl bg-[#E7F3EE] text-[#183D32] font-semibold cursor-pointer"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setInvoiceFile('');
                          setInvoiceLabel('');
                        }}
                        className="px-2.5 py-2 rounded-xl bg-[#FCECEB] text-[#B34338] font-semibold cursor-pointer"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="po-notes" className="block font-medium text-[#252923] mb-1">
                Internal Procurement Notes (Optional)
              </label>
              <input
                id="po-notes"
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Transport details, quality grade remarks, or mandi reference..."
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3] text-[#252923]"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer font-medium text-[#183D32]">
              <input
                type="checkbox"
                checked={receiveImmediately}
                onChange={e => setReceiveImmediately(e.target.checked)}
                className="w-4 h-4 accent-[#183D32]"
              />
              <span>Automatically update inventory stock &amp; batches upon saving</span>
            </label>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E9E4D9]">
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setEditingPoId(null);
                }}
                className="px-4 py-2.5 rounded-xl border border-[#D8D1C3] text-[#252923] font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || uploadingInvoice}
                className="px-5 py-2.5 rounded-xl bg-[#183D32] hover:bg-[#245746] disabled:opacity-60 text-white font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
              >
                {saving
                  ? 'Saving...'
                  : editingPoId
                  ? 'Update Purchase Order'
                  : 'Save Purchase Order'}
              </button>
            </div>
          </form>
        </AdminModal>

        {/* View Purchase Order Details Modal */}
        <AdminModal
          open={Boolean(viewPo)}
          onClose={() => setViewPo(null)}
          title={viewPo ? `Purchase Order #${viewPo.purchaseNumber}` : 'Purchase Order Details'}
          subtitle={viewPo ? `${viewPo.supplierName} • ${viewPo.purchaseDate}` : undefined}
          maxWidth="max-w-2xl"
        >
          {viewPo && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]">
                <div>
                  <div className="text-[#5C6058]">Status</div>
                  <div className="mt-1"><StatusBadge status={viewPo.status} /></div>
                </div>
                <div>
                  <div className="text-[#5C6058]">Payment</div>
                  <div className="mt-1"><StatusBadge status={viewPo.paymentStatus} /></div>
                </div>
                <div>
                  <div className="text-[#5C6058]">Paid Amount</div>
                  <div className="font-bold text-[#183D32] mt-1 tabular-nums">{formatINR(viewPo.paidAmount || 0)}</div>
                </div>
                <div>
                  <div className="text-[#5C6058]">Total Amount</div>
                  <div className="font-bold text-[#252923] mt-1 tabular-nums">{formatINR(viewPo.totalAmount || 0)}</div>
                </div>
              </div>

              <div className="overflow-x-auto border border-[#E9E4D9] rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8F6F0] border-b border-[#E9E4D9] text-[#5C6058] uppercase text-[10px]">
                    <tr>
                      <th scope="col" className="py-2 px-3">Product</th>
                      <th scope="col" className="py-2 px-3">Qty</th>
                      <th scope="col" className="py-2 px-3">Rate</th>
                      <th scope="col" className="py-2 px-3">GST</th>
                      <th scope="col" className="py-2 px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9E4D9]">
                    {(viewPo.items || []).map((it: any) => (
                      <tr key={it.id}>
                        <td className="py-2 px-3 font-medium text-[#183D32]">
                          {it.productName}
                          {it.batchNumber && (
                            <span className="block text-[10px] text-[#5C6058]">Batch: {it.batchNumber}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 tabular-nums">{it.quantity} {it.unit || 'kg'}</td>
                        <td className="py-2 px-3 tabular-nums">{formatINR(it.purchasePrice)}</td>
                        <td className="py-2 px-3 tabular-nums">{it.gstRate}%</td>
                        <td className="py-2 px-3 text-right font-semibold tabular-nums">{formatINR(it.totalCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {viewPo.notes && (
                <div className="p-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-[#4A4E47]">
                  <strong>Notes:</strong> {viewPo.notes}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E9E4D9]">
                <div className="flex flex-wrap gap-2">
                  {viewPo.invoiceFile ? (
                    <button
                      type="button"
                      onClick={() =>
                        setBillPreview({
                          title: `Purchase Invoice ${viewPo.purchaseNumber}`,
                          subtitle: viewPo.supplierName || 'Supplier Bill',
                          url: toAdminMediaUrl(viewPo.invoiceFile),
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#183D32] text-white font-semibold cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>View Purchase Invoice</span>
                    </button>
                  ) : (
                    <span className="text-[#5C6058] self-center">No invoice uploaded yet.</span>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const target = viewPo;
                      setViewPo(null);
                      openEditModal(target);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3] text-[#183D32] font-semibold cursor-pointer"
                  >
                    Edit PO / Attach Bill
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const target = viewPo;
                      setViewPo(null);
                      openRestockAgainModal(target);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#E7F3EE] border border-[#B7DEC9] text-[#183D32] font-semibold cursor-pointer"
                  >
                    Restock Again
                  </button>
                </div>
              </div>
            </div>
          )}
        </AdminModal>

        {/* Delete PO Confirmation */}
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title="Delete Purchase Order?"
          message={
            deleteTarget?.status === 'received'
              ? `Deleting #${deleteTarget?.purchaseNumber} (${formatINR(deleteTarget?.totalAmount || 0)}) will reverse its received stock quantities from inventory and remove linked batches. Continue?`
              : `Are you sure you want to delete Purchase Order #${deleteTarget?.purchaseNumber}? This cannot be undone.`
          }
          confirmLabel="Delete Purchase Order"
          onConfirm={handleDeletePo}
          onCancel={() => setDeleteTarget(null)}
        />

        {/* Invoice Viewer */}
        <AdminPdfViewerModal
          open={Boolean(billPreview)}
          title={billPreview?.title || 'Purchase Invoice'}
          subtitle={billPreview?.subtitle}
          src={billPreview?.url || null}
          onClose={() => setBillPreview(null)}
        />
      </div>
    </AdminLayout>
  );
}
