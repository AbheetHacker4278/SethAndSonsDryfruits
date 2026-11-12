import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Boxes,
  AlertTriangle,
  ArrowUpDown,
  Calendar,
  History,
  Search,
  X,
  Download,
  SlidersHorizontal,
  CheckCircle2,
  PackageX,
  RefreshCw,
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import {
  AdminCard,
  EmptyState,
  LoadingSkeleton,
  PaginationBar,
  StatusBadge,
  ToastBanner,
} from '../../components/admin/AdminUI';
import { apiRequest, ApiError } from '../../services/api';
import { formatINR, parseWeightGrams } from '../../utils/priceCalculator';

type HealthFilter = 'all' | 'healthy' | 'alerts' | 'low_stock' | 'out_of_stock';
type SortOption = 'critical' | 'valuation_desc' | 'valuation_asc' | 'name_asc' | 'stock_desc';

const FALLBACK_IMG = '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg';

const REASON_PRESETS = [
  'Fresh Jammu harvest arrival',
  'Physical stock count reconciliation',
  'Grading / spillage write-off',
  'Concierge tasting / sample pack',
];

function computeProductHealth(p: { stock?: number; minStockAlert?: number }) {
  const s = Number(p.stock || 0);
  const min = Number(p.minStockAlert ?? 5);
  if (s <= 0) return 'out_of_stock' as const;
  if (s <= min) return 'low_stock' as const;
  return 'active' as const;
}

function computeProductValuation(p: {
  valuation?: number;
  stock?: number;
  purchasePrice?: number;
  unit?: string;
  weightLabel?: string;
}): number {
  if (typeof p.valuation === 'number' && Number.isFinite(p.valuation)) {
    return Math.round(p.valuation);
  }
  const baseUnits =
    p.unit === 'ml'
      ? parseWeightGrams(String(p.weightLabel || '100ml')) || 100
      : p.unit === 'gram'
      ? parseWeightGrams(String(p.weightLabel || '1g')) || 1
      : 1;
  return Math.round((Number(p.stock || 0) / baseUnits) * Number(p.purchasePrice || 0));
}

function csvCell(value: unknown): string {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function AdminInventory() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<'stock' | 'batches' | 'history'>('stock');
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [liveMsg, setLiveMsg] = useState('');

  // Filters, search, sort, pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('critical');
  const [onlyExpiringBatches, setOnlyExpiringBatches] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 12;

  // Adjustment Form State
  const [productId, setProductId] = useState('');
  const [movementType, setMovementType] = useState<'stock_in' | 'stock_out' | 'adjustment'>('stock_in');
  const [quantity, setQuantity] = useState('10');
  const [unitCost, setUnitCost] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [reason, setReason] = useState('');

  const qtyInputRef = useRef<HTMLInputElement | null>(null);
  const formPanelRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<any>('/api/admin/inventory/overview');
      setData(res);
      if (res.products?.length > 0) {
        setProductId(prev =>
          prev && res.products.some((p: any) => p.id === prev) ? prev : res.products[0].id
        );
      }
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to load inventory overview.',
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
  }, [tab, searchQuery, healthFilter, categoryFilter, sortBy, onlyExpiringBatches]);

  const selectedProduct = useMemo(() => {
    if (!data?.products) return null;
    return data.products.find((p: any) => p.id === productId) || data.products[0] || null;
  }, [data, productId]);

  const resultingPreview = useMemo(() => {
    if (!selectedProduct) return null;
    const prev = Number(selectedProduct.stock || 0);
    const delta = Math.max(0, Number(quantity) || 0);
    const next =
      movementType === 'stock_in'
        ? Number((prev + delta).toFixed(3))
        : movementType === 'stock_out'
        ? Math.max(0, Number((prev - delta).toFixed(3)))
        : Number(delta.toFixed(3));
    const min = Number(selectedProduct.minStockAlert ?? 5);
    const health = next <= 0 ? 'out_of_stock' : next <= min ? 'low_stock' : 'active';
    return { prev, next, unit: selectedProduct.unit || 'kg', health };
  }, [selectedProduct, movementType, quantity]);

  const allProducts = data?.products || [];
  const allCategories = data?.categories || [];

  const healthCounts = useMemo(() => {
    let healthy = 0;
    let low = 0;
    let out = 0;
    for (const p of allProducts) {
      const h = computeProductHealth(p);
      if (h === 'out_of_stock') out++;
      else if (h === 'low_stock') low++;
      else healthy++;
    }
    return { all: allProducts.length, healthy, low, out, alerts: low + out };
  }, [allProducts]);

  const filteredStock = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = allProducts.filter((p: any) => {
      const h = computeProductHealth(p);
      if (healthFilter === 'healthy' && h !== 'active') return false;
      if (healthFilter === 'low_stock' && h !== 'low_stock') return false;
      if (healthFilter === 'out_of_stock' && h !== 'out_of_stock') return false;
      if (healthFilter === 'alerts' && h === 'active') return false;
      if (categoryFilter !== 'all' && (p.categoryId || 'cat_other') !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return `${p.name} ${p.sku || ''} ${p.categoryName || ''}`.toLowerCase().includes(q);
    });

    return [...list].sort((a: any, b: any) => {
      const va = computeProductValuation(a);
      const vb = computeProductValuation(b);
      switch (sortBy) {
        case 'valuation_desc':
          return vb - va;
        case 'valuation_asc':
          return va - vb;
        case 'name_asc':
          return String(a.name).localeCompare(String(b.name));
        case 'stock_desc':
          return Number(b.stock || 0) - Number(a.stock || 0);
        case 'critical':
        default: {
          const rank = (p: any) => {
            const h = computeProductHealth(p);
            return h === 'out_of_stock' ? 0 : h === 'low_stock' ? 1 : 2;
          };
          const ra = rank(a);
          const rb = rank(b);
          if (ra !== rb) return ra - rb;
          return Number(a.stock || 0) - Number(b.stock || 0);
        }
      }
    });
  }, [allProducts, searchQuery, healthFilter, categoryFilter, sortBy]);

  const filteredBatches = useMemo(() => {
    const batches = data?.batches || [];
    const expCutoff = new Date(Date.now() + 45 * 86400_000).toISOString().slice(0, 10);
    const q = searchQuery.trim().toLowerCase();
    return batches.filter((b: any) => {
      if (onlyExpiringBatches) {
        if (!b.expiryDate || String(b.expiryDate) > expCutoff || Number(b.remainingQty || 0) <= 0) {
          return false;
        }
      }
      if (!q) return true;
      return `${b.batchNumber || ''} ${b.productName || ''} ${b.supplierName || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [data, searchQuery, onlyExpiringBatches]);

  const filteredHistory = useMemo(() => {
    const txs = data?.transactions || [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return txs;
    return txs.filter((t: any) =>
      `${t.productName || ''} ${t.reason || ''} ${t.adminName || ''} ${t.movementType || ''} ${t.batchNumber || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [data, searchQuery]);

  const activeRows =
    tab === 'stock' ? filteredStock : tab === 'batches' ? filteredBatches : filteredHistory;
  const totalPages = Math.max(1, Math.ceil(activeRows.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pagedRows = activeRows.slice((safePage - 1) * perPage, safePage * perPage);

  const quickSelectForAdjustment = (p: any, defaultMovement: 'stock_in' | 'adjustment' = 'stock_in') => {
    setProductId(p.id);
    setMovementType(defaultMovement);
    const suggestedQty = p.unit === 'gram' || p.unit === 'ml' ? '250' : '10';
    setQuantity(suggestedQty);
    setReason(prev => prev || 'Fresh restock replenishment');
    setLiveMsg(`Selected ${p.name} for stock movement entry.`);
    formPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    requestAnimationFrame(() => qtyInputRef.current?.focus());
  };

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    setToast(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/admin/inventory/adjust', {
        method: 'POST',
        body: {
          productId,
          movementType,
          quantity: Number(quantity),
          reason: reason.trim(),
          unitCost: unitCost ? Number(unitCost) : undefined,
          batchNumber: batchNumber.trim() || undefined,
          expiryDate: expiryDate || undefined,
        },
      });
      setToast({ type: 'ok', text: res.message });
      setLiveMsg(res.message);
      setReason('');
      setBatchNumber('');
      setUnitCost('');
      await load();
    } catch (err) {
      const errText = err instanceof ApiError ? err.message : 'Stock adjustment failed.';
      setToast({ type: 'err', text: errText });
      setLiveMsg(errText);
    } finally {
      setSubmitting(false);
    }
  };

  const exportStockCsv = () => {
    const header = [
      'SKU',
      'Product',
      'Category',
      'Available Stock',
      'Unit',
      'Min Stock Alert',
      'Unit Cost (INR)',
      'Pack Base',
      'Total Valuation (INR)',
      'Health',
    ];
    const rows = filteredStock.map((p: any) => [
      p.sku || '',
      p.name,
      p.categoryName || '',
      p.stock ?? 0,
      p.unit || 'kg',
      p.minStockAlert ?? 5,
      p.purchasePrice ?? 0,
      p.weightLabel || p.unit || 'kg',
      computeProductValuation(p),
      computeProductHealth(p),
    ]);
    const csv = [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-stock-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setLiveMsg(`Exported ${filteredStock.length} stock rows to CSV.`);
  };

  const resetFilters = () => {
    setSearchQuery('');
    setHealthFilter('all');
    setCategoryFilter('all');
    setOnlyExpiringBatches(false);
    setLiveMsg('Cleared all inventory filters.');
  };

  const criticalAlerts = useMemo(
    () => [...(data?.alerts?.outOfStock || []), ...(data?.alerts?.lowStock || [])],
    [data]
  );

  const todayIso = new Date().toISOString().slice(0, 10);
  const expCutoffIso = new Date(Date.now() + 45 * 86400_000).toISOString().slice(0, 10);
  const quickQtyNudges =
    selectedProduct?.unit === 'gram' || selectedProduct?.unit === 'ml'
      ? [100, 250, 500, 1000]
      : [1, 5, 10, 25];

  return (
    <AdminLayout
      title="Inventory & Batch Control"
      subtitle="Monitor accurate cellar valuation, filter critical alerts across all SKUs, record stock movements, and track batch expirations."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-[#D8D1C3] text-[#183D32] hover:bg-[#F8F6F0] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Refresh</span>
          </button>
          {data && (
            <button
              type="button"
              onClick={exportStockCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#183D32] text-white hover:bg-[#245746] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export CSV</span>
            </button>
          )}
        </div>
      }
    >
      {/* Screen reader status announcements */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveMsg}
      </div>

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : !data ? (
        <div className="space-y-4">
          <ToastBanner toast={toast} onDismiss={() => setToast(null)} />
          <AdminCard className="text-center py-10 space-y-3">
            <p className="text-sm text-[#4A4E47]">
              {toast?.text || 'Unable to load inventory overview.'}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="px-4 py-2 rounded-xl bg-[#183D32] text-white text-xs font-semibold cursor-pointer hover:bg-[#245746] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
            >
              Retry
            </button>
          </AdminCard>
        </div>
      ) : (
        <div className="space-y-6">
          <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

          {/* Interactive Clickable KPI Cards */}
          <section aria-label="Inventory summary metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              type="button"
              onClick={() => {
                setTab('stock');
                setHealthFilter('all');
                setSortBy('valuation_desc');
              }}
              className="text-left bg-white border border-[#E9E4D9] hover:border-[#183D32]/50 rounded-2xl p-5 shadow-[0_2px_14px_rgba(24,61,50,0.04)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
            >
              <div className="flex items-center justify-between text-xs font-medium text-[#5C6058]">
                <span>Total Cost Valuation</span>
                <Boxes className="w-4 h-4 text-[#183D32]" aria-hidden="true" />
              </div>
              <div className="text-2xl font-bold text-[#183D32] mt-1.5 tabular-nums">
                {formatINR(data.summary.valuation)}
              </div>
              <div className="text-[11px] text-[#5C6058] mt-1">
                Across {healthCounts.all} active catalog SKUs
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setTab('stock');
                setHealthFilter('healthy');
              }}
              className="text-left bg-white border border-[#E9E4D9] hover:border-[#183D32]/50 rounded-2xl p-5 shadow-[0_2px_14px_rgba(24,61,50,0.04)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
            >
              <div className="flex items-center justify-between text-xs font-medium text-[#5C6058]">
                <span>Healthy Stock SKUs</span>
                <CheckCircle2 className="w-4 h-4 text-[#245746]" aria-hidden="true" />
              </div>
              <div className="text-2xl font-bold text-[#252923] mt-1.5 tabular-nums">
                {healthCounts.healthy} / {healthCounts.all}
              </div>
              <div className="text-[11px] text-[#5C6058] mt-1">
                Click to view well-stocked items
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setTab('stock');
                setHealthFilter('alerts');
                setSortBy('critical');
              }}
              className={`text-left bg-white border rounded-2xl p-5 shadow-[0_2px_14px_rgba(24,61,50,0.04)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32] ${
                healthCounts.alerts > 0
                  ? 'border-[#E8D5A7] hover:border-[#C65B50]'
                  : 'border-[#E9E4D9] hover:border-[#183D32]/50'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-medium text-[#5C6058]">
                <span>Low / Out-of-Stock</span>
                <PackageX className="w-4 h-4 text-[#C65B50]" aria-hidden="true" />
              </div>
              <div className="text-2xl font-bold text-[#B34338] mt-1.5 tabular-nums">
                {data.summary.lowStockCount} low · {data.summary.outOfStockCount} out
              </div>
              <div className="text-[11px] text-[#5C6058] mt-1">
                Click to filter items needing restock
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setTab('batches');
                setOnlyExpiringBatches(true);
              }}
              className="text-left bg-white border border-[#E9E4D9] hover:border-[#8F6C2B] rounded-2xl p-5 shadow-[0_2px_14px_rgba(24,61,50,0.04)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
            >
              <div className="flex items-center justify-between text-xs font-medium text-[#5C6058]">
                <span>Expiring Soon (45d)</span>
                <Calendar className="w-4 h-4 text-[#8F6C2B]" aria-hidden="true" />
              </div>
              <div className="text-2xl font-bold text-[#7A591F] mt-1.5 tabular-nums">
                {data.summary.expiringBatchesCount} batch{data.summary.expiringBatchesCount === 1 ? '' : 'es'}
              </div>
              <div className="text-[11px] text-[#5C6058] mt-1">
                Click to inspect batch shelf-life
              </div>
            </button>
          </section>

          {/* Compact Actionable Low-Stock Alert Strip */}
          {criticalAlerts.length > 0 && (
            <section
              aria-label="Restock alerts"
              className="p-4 rounded-2xl bg-[#FAF3E3] border border-[#C8A96B] space-y-2.5 text-xs text-[#6B4E1B]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-[#8F6C2B]" aria-hidden="true" />
                  <span>
                    {criticalAlerts.length} product{criticalAlerts.length === 1 ? '' : 's'} at or below minimum stock alert
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTab('stock');
                    setHealthFilter('alerts');
                    setSortBy('critical');
                  }}
                  className="px-3 py-1 rounded-lg bg-[#8F6C2B] hover:bg-[#73551F] text-white font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                >
                  Filter to Alerts ({criticalAlerts.length})
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {criticalAlerts.slice(0, 6).map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => quickSelectForAdjustment(p, 'stock_in')}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/90 hover:bg-white border border-[#DEC48C] text-[#252923] font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                  >
                    <span className="font-semibold text-[#183D32]">{p.name}</span>
                    <span className="text-[#B34338] font-semibold tabular-nums">
                      ({p.stock} {p.unit})
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-[#183D32] font-bold underline">
                      + Restock
                    </span>
                  </button>
                ))}
                {criticalAlerts.length > 6 && (
                  <span className="self-center text-[11px] font-medium text-[#6B4E1B]">
                    +{criticalAlerts.length - 6} more
                  </span>
                )}
              </div>
            </section>
          )}

          {/* Main 2-Column Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Sticky Left Panel: Stock Movement Entry */}
            <div ref={formPanelRef} className="lg:col-span-4 lg:sticky lg:top-6">
              <AdminCard>
                <h2 className="font-admin-serif text-xl font-semibold text-[#183D32] mb-1 flex items-center gap-2">
                  <ArrowUpDown className="w-4 h-4 text-[#C8A96B]" aria-hidden="true" />
                  <span>Stock Movement Entry</span>
                </h2>
                <p className="text-xs text-[#5C6058] mb-4">
                  Select a product below or click <strong>Adjust</strong> on any row to pre-fill.
                </p>

                <form onSubmit={handleAdjust} className="space-y-3.5 text-xs">
                  <div>
                    <label htmlFor="inv-product-select" className="block font-semibold text-[#252923] mb-1">
                      Product <span className="text-[#C65B50]" aria-hidden="true">*</span>
                    </label>
                    <select
                      id="inv-product-select"
                      value={productId}
                      onChange={e => setProductId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3] text-[#252923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                    >
                      {allProducts.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {p.stock} {p.unit} ({p.sku || p.id})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="inv-movement-type" className="block font-semibold text-[#252923] mb-1">
                        Movement Type
                      </label>
                      <select
                        id="inv-movement-type"
                        value={movementType}
                        onChange={e => setMovementType(e.target.value as any)}
                        className="w-full px-3 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3] text-[#252923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                      >
                        <option value="stock_in">Stock In (+)</option>
                        <option value="stock_out">Stock Out (-)</option>
                        <option value="adjustment">Set Exact Count</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="inv-qty-input" className="block font-semibold text-[#252923] mb-1">
                        Quantity ({selectedProduct?.unit || 'kg'}) <span className="text-[#C65B50]" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="inv-qty-input"
                        ref={qtyInputRef}
                        type="number"
                        required
                        aria-required="true"
                        min={0}
                        step={selectedProduct?.unit === 'kg' ? '0.25' : '1'}
                        value={quantity}
                        onChange={e => setQuantity(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3] text-[#252923] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                      />
                    </div>
                  </div>

                  {/* Quick Quantity Chips */}
                  <div className="flex flex-wrap items-center gap-1.5" aria-label="Quick quantity presets">
                    <span className="text-[11px] text-[#5C6058]">Quick set:</span>
                    {quickQtyNudges.map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setQuantity(String(val))}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32] ${
                          Number(quantity) === val
                            ? 'bg-[#183D32] text-white border-[#183D32]'
                            : 'bg-[#F8F6F0] text-[#252923] border-[#D8D1C3] hover:border-[#183D32]'
                        }`}
                      >
                        {val} {selectedProduct?.unit || 'kg'}
                      </button>
                    ))}
                  </div>

                  {/* Live Stock Resulting Preview */}
                  {resultingPreview && (
                    <div className="p-3 rounded-xl bg-[#F4F1EA] border border-[#E2DDD2] flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] text-[#5C6058]">Stock Preview After Save</div>
                        <div className="font-bold text-sm text-[#183D32] tabular-nums mt-0.5">
                          {resultingPreview.prev} {resultingPreview.unit} → {resultingPreview.next} {resultingPreview.unit}
                        </div>
                      </div>
                      <StatusBadge status={resultingPreview.health} />
                    </div>
                  )}

                  {movementType === 'stock_in' && (
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label htmlFor="inv-batch-number" className="block font-medium text-[#252923] mb-1">
                          Batch # (Optional)
                        </label>
                        <input
                          id="inv-batch-number"
                          type="text"
                          value={batchNumber}
                          onChange={e => setBatchNumber(e.target.value)}
                          placeholder="Auto if blank"
                          className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3] text-[#252923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                        />
                      </div>
                      <div>
                        <label htmlFor="inv-expiry-date" className="block font-medium text-[#252923] mb-1">
                          Batch Expiry Date
                        </label>
                        <input
                          id="inv-expiry-date"
                          type="date"
                          value={expiryDate}
                          onChange={e => setExpiryDate(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3] text-[#252923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label htmlFor="inv-unit-cost" className="block font-medium text-[#252923] mb-1">
                      Purchase Cost (₹ per {selectedProduct?.weightLabel || selectedProduct?.unit || 'pack'}, optional)
                    </label>
                    <input
                      id="inv-unit-cost"
                      type="number"
                      min={0}
                      value={unitCost}
                      onChange={e => setUnitCost(e.target.value)}
                      placeholder={selectedProduct ? `Current: ₹${selectedProduct.purchasePrice || 0}` : 'e.g. 850'}
                      className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3] text-[#252923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                    />
                  </div>

                  <div>
                    <label htmlFor="inv-reason" className="block font-semibold text-[#252923] mb-1">
                      Audit Reason <span className="text-[#C65B50]" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="inv-reason"
                      type="text"
                      required
                      aria-required="true"
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder="e.g. Fresh Jammu harvest arrival"
                      className="w-full px-3 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3] text-[#252923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                    />
                    <div className="flex flex-wrap gap-1 mt-2" aria-label="Common reason presets">
                      {REASON_PRESETS.map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setReason(preset)}
                          className="px-2 py-0.5 rounded-md bg-[#F8F6F0] hover:bg-[#E9E4D9] border border-[#E2DDD2] text-[10px] text-[#4A4E47] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 rounded-xl bg-[#183D32] hover:bg-[#245746] disabled:opacity-60 text-white font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                  >
                    {submitting ? 'Recording Movement...' : 'Record Stock Movement'}
                  </button>
                </form>
              </AdminCard>
            </div>

            {/* Right Panel: Searchable, Filterable & Paginated Tables */}
            <div className="lg:col-span-8 space-y-4">
              {/* Accessible Tablist */}
              <div
                role="tablist"
                aria-label="Inventory management views"
                className="flex flex-wrap gap-2"
              >
                {[
                  { id: 'stock', label: `Current Stock (${allProducts.length})`, icon: Boxes },
                  { id: 'batches', label: `Batches (${data.batches.length})`, icon: Calendar },
                  { id: 'history', label: `Movement Audit Log (${data.transactions.length})`, icon: History },
                ].map(t => {
                  const Icon = t.icon;
                  const active = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      id={`tab-${t.id}`}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-controls={`tabpanel-${t.id}`}
                      onClick={() => setTab(t.id as any)}
                      className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32] ${
                        active
                          ? 'bg-[#183D32] text-white border-[#183D32] shadow-sm'
                          : 'bg-white text-[#4A4E47] border-[#D8D1C3] hover:border-[#183D32]/50'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Unified Search & Filter Bar */}
              <AdminCard padding="p-4" className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <label htmlFor="inv-search-input" className="sr-only">
                      Search inventory items, SKUs, batches, or reasons
                    </label>
                    <Search
                      className="w-4 h-4 text-[#5C6058] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="inv-search-input"
                      type="search"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder={
                        tab === 'stock'
                          ? 'Search product name, SKU, or category...'
                          : tab === 'batches'
                          ? 'Search batch #, product, or supplier...'
                          : 'Search product, reason, movement, or admin...'
                      }
                      className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3] text-xs text-[#252923] placeholder:text-[#6B6F67] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="Clear search"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-[#5C6058] hover:text-[#183D32] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  {tab === 'stock' && (
                    <div className="flex flex-wrap sm:flex-nowrap gap-2">
                      <div>
                        <label htmlFor="inv-category-filter" className="sr-only">
                          Filter by category
                        </label>
                        <select
                          id="inv-category-filter"
                          value={categoryFilter}
                          onChange={e => setCategoryFilter(e.target.value)}
                          className="px-3 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3] text-xs text-[#252923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                        >
                          <option value="all">All Categories</option>
                          {allCategories.map((c: any) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="inv-sort-select" className="sr-only">
                          Sort stock items
                        </label>
                        <select
                          id="inv-sort-select"
                          value={sortBy}
                          onChange={e => setSortBy(e.target.value as SortOption)}
                          className="px-3 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3] text-xs text-[#252923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
                        >
                          <option value="critical">Sort: Critical Stock First</option>
                          <option value="valuation_desc">Sort: Highest Valuation</option>
                          <option value="valuation_asc">Sort: Lowest Valuation</option>
                          <option value="stock_desc">Sort: Highest Stock</option>
                          <option value="name_asc">Sort: Name (A–Z)</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {tab === 'batches' && (
                    <button
                      type="button"
                      aria-pressed={onlyExpiringBatches}
                      onClick={() => setOnlyExpiringBatches(v => !v)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32] ${
                        onlyExpiringBatches
                          ? 'bg-[#8F6C2B] text-white border-[#8F6C2B]'
                          : 'bg-[#F8F6F0] text-[#4A4E47] border-[#D8D1C3]'
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Expiring ≤ 45d ({data.summary.expiringBatchesCount})</span>
                    </button>
                  )}
                </div>

                {/* Health Status Filter Pills */}
                {tab === 'stock' && (
                  <div
                    role="group"
                    aria-label="Filter stock by health status"
                    className="flex flex-wrap items-center gap-2 pt-1"
                  >
                    {[
                      { id: 'all', label: `All (${healthCounts.all})` },
                      { id: 'healthy', label: `Healthy (${healthCounts.healthy})` },
                      { id: 'low_stock', label: `Low Stock (${healthCounts.low})` },
                      { id: 'out_of_stock', label: `Out of Stock (${healthCounts.out})` },
                      { id: 'alerts', label: `All Alerts (${healthCounts.alerts})` },
                    ].map(f => {
                      const active = healthFilter === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setHealthFilter(f.id as HealthFilter)}
                          className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32] ${
                            active
                              ? 'bg-[#183D32] text-white border-[#183D32]'
                              : 'bg-[#F8F6F0] text-[#4A4E47] border-[#D8D1C3] hover:border-[#183D32]/50'
                          }`}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                    {(searchQuery || healthFilter !== 'all' || categoryFilter !== 'all') && (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="text-[11px] text-[#183D32] underline font-semibold ml-auto cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32] rounded px-1"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>
                )}
              </AdminCard>

              {/* Tab Content Panel */}
              <AdminCard>
                {tab === 'stock' && (
                  <div id="tabpanel-stock" role="tabpanel" aria-labelledby="tab-stock">
                    {pagedRows.length === 0 ? (
                      <EmptyState
                        icon={Boxes}
                        title="No matching stock items"
                        description="Try adjusting your search query, category filter, or stock health filter."
                        action={
                          <button
                            type="button"
                            onClick={resetFilters}
                            className="px-4 py-2 rounded-xl bg-[#183D32] text-white text-xs font-semibold cursor-pointer"
                          >
                            Reset All Filters
                          </button>
                        }
                      />
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <caption className="sr-only">
                              Current inventory levels, alert thresholds, cost valuations, and stock health
                            </caption>
                            <thead>
                              <tr className="border-b border-[#E9E4D9] text-[#5C6058] uppercase text-[11px]">
                                <th scope="col" className="py-2.5 pr-3">Product</th>
                                <th scope="col" className="py-2.5 pr-3">SKU</th>
                                <th scope="col" className="py-2.5 pr-3">Available</th>
                                <th scope="col" className="py-2.5 pr-3">Alert Level</th>
                                <th scope="col" className="py-2.5 pr-3">Valuation</th>
                                <th scope="col" className="py-2.5 pr-3">Health</th>
                                <th scope="col" className="py-2.5 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E9E4D9]">
                              {pagedRows.map((p: any) => {
                                const health = computeProductHealth(p);
                                const itemValuation = computeProductValuation(p);
                                const isSelectedRow = p.id === productId;
                                const ratioPct = Math.min(
                                  100,
                                  Math.round(
                                    (Number(p.stock || 0) / Math.max(1, Number(p.minStockAlert ?? 5) * 2)) * 100
                                  )
                                );

                                return (
                                  <tr
                                    key={p.id}
                                    className={`transition-colors ${
                                      isSelectedRow ? 'bg-[#E7F3EE]/45' : 'hover:bg-[#F8F6F0]/70'
                                    }`}
                                  >
                                    <td className="py-3 pr-3">
                                      <div className="flex items-center gap-2.5">
                                        <img
                                          src={p.image || FALLBACK_IMG}
                                          alt=""
                                          onError={e => {
                                            const img = e.currentTarget;
                                            if (img.dataset.fbApplied === '1') return;
                                            img.dataset.fbApplied = '1';
                                            img.src = p.fallbackImage || FALLBACK_IMG;
                                          }}
                                          className="w-9 h-9 rounded-lg object-cover border border-[#E9E4D9] shrink-0 bg-[#F8F6F0]"
                                        />
                                        <div className="min-w-0">
                                          <div className="font-semibold text-[#183D32] truncate max-w-[200px]">
                                            {p.name}
                                          </div>
                                          <div className="text-[11px] text-[#5C6058] truncate">
                                            {p.categoryName || 'Other Products'}
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-3 pr-3 font-mono text-[11px] text-[#4A4E47] whitespace-nowrap">
                                      {p.sku || '—'}
                                    </td>
                                    <td className="py-3 pr-3 whitespace-nowrap">
                                      <div className="font-bold text-[#252923] tabular-nums">
                                        {p.stock} {p.unit}
                                      </div>
                                      <div
                                        aria-hidden="true"
                                        className="w-16 h-1.5 rounded-full bg-[#ECE8DE] overflow-hidden mt-1"
                                      >
                                        <div
                                          className={`h-full rounded-full ${
                                            health === 'out_of_stock'
                                              ? 'bg-[#C65B50]'
                                              : health === 'low_stock'
                                              ? 'bg-[#C8A96B]'
                                              : 'bg-[#245746]'
                                          }`}
                                          style={{ width: `${ratioPct}%` }}
                                        />
                                      </div>
                                    </td>
                                    <td className="py-3 pr-3 text-[#5C6058] whitespace-nowrap tabular-nums">
                                      {p.minStockAlert} {p.unit}
                                    </td>
                                    <td className="py-3 pr-3 font-semibold text-[#252923] whitespace-nowrap tabular-nums">
                                      {formatINR(itemValuation)}
                                    </td>
                                    <td className="py-3 pr-3 whitespace-nowrap">
                                      <StatusBadge status={health} />
                                    </td>
                                    <td className="py-3 text-right whitespace-nowrap">
                                      <button
                                        type="button"
                                        onClick={() => quickSelectForAdjustment(p, 'stock_in')}
                                        aria-label={`Adjust stock for ${p.name}`}
                                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32] ${
                                          isSelectedRow
                                            ? 'bg-[#183D32] text-white border-[#183D32]'
                                            : 'bg-[#F8F6F0] text-[#183D32] border-[#D8D1C3] hover:border-[#183D32]'
                                        }`}
                                      >
                                        {isSelectedRow ? 'Selected' : 'Adjust'}
                                      </button>
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
                          totalItems={filteredStock.length}
                          onPageChange={setPage}
                        />
                      </>
                    )}
                  </div>
                )}

                {tab === 'batches' && (
                  <div id="tabpanel-batches" role="tabpanel" aria-labelledby="tab-batches">
                    {pagedRows.length === 0 ? (
                      <EmptyState
                        icon={Calendar}
                        title="No matching batches"
                        description="No cellar batches match your current filter."
                        action={
                          onlyExpiringBatches || searchQuery ? (
                            <button
                              type="button"
                              onClick={resetFilters}
                              className="px-4 py-2 rounded-xl bg-[#183D32] text-white text-xs font-semibold cursor-pointer"
                            >
                              Show All Batches
                            </button>
                          ) : undefined
                        }
                      />
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <caption className="sr-only">
                              Inventory batches with remaining quantities, unit costs, and expiry status
                            </caption>
                            <thead>
                              <tr className="border-b border-[#E9E4D9] text-[#5C6058] uppercase text-[11px]">
                                <th scope="col" className="py-2.5 pr-3">Batch #</th>
                                <th scope="col" className="py-2.5 pr-3">Product</th>
                                <th scope="col" className="py-2.5 pr-3">Qty Remaining</th>
                                <th scope="col" className="py-2.5 pr-3">Unit Cost</th>
                                <th scope="col" className="py-2.5">Expiry Date</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E9E4D9]">
                              {pagedRows.map((b: any) => {
                                const exp = b.expiryDate ? String(b.expiryDate).slice(0, 10) : '';
                                const isExpired = exp && exp < todayIso;
                                const isExpiringSoon = exp && !isExpired && exp <= expCutoffIso;
                                return (
                                  <tr key={b.id} className="hover:bg-[#F8F6F0]/70">
                                    <td className="py-2.5 pr-3 font-mono font-semibold text-[#183D32] whitespace-nowrap">
                                      {b.batchNumber}
                                    </td>
                                    <td className="py-2.5 pr-3">
                                      <div className="font-medium text-[#252923]">{b.productName}</div>
                                      {b.supplierName && (
                                        <div className="text-[11px] text-[#5C6058]">{b.supplierName}</div>
                                      )}
                                    </td>
                                    <td className="py-2.5 pr-3 font-semibold tabular-nums whitespace-nowrap">
                                      {b.remainingQty} {b.unit}
                                    </td>
                                    <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap">
                                      {formatINR(b.purchaseCost)}
                                    </td>
                                    <td className="py-2.5 whitespace-nowrap">
                                      <div className="flex items-center gap-2">
                                        <span className="tabular-nums">{exp || 'N/A'}</span>
                                        {isExpired && <StatusBadge status="expired" tone="red" />}
                                        {isExpiringSoon && <StatusBadge status="expiring_soon" tone="gold" />}
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
                          totalItems={filteredBatches.length}
                          onPageChange={setPage}
                        />
                      </>
                    )}
                  </div>
                )}

                {tab === 'history' && (
                  <div id="tabpanel-history" role="tabpanel" aria-labelledby="tab-history">
                    {pagedRows.length === 0 ? (
                      <EmptyState
                        icon={History}
                        title="No matching movement logs"
                        description="No inventory adjustment logs match your search."
                      />
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <caption className="sr-only">
                              Chronological audit trail of inventory stock movements
                            </caption>
                            <thead>
                              <tr className="border-b border-[#E9E4D9] text-[#5C6058] uppercase text-[11px]">
                                <th scope="col" className="py-2.5 pr-3">Time</th>
                                <th scope="col" className="py-2.5 pr-3">Product</th>
                                <th scope="col" className="py-2.5 pr-3">Type</th>
                                <th scope="col" className="py-2.5 pr-3">Prev → New</th>
                                <th scope="col" className="py-2.5 pr-3">Reason</th>
                                <th scope="col" className="py-2.5">Admin</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E9E4D9]">
                              {pagedRows.map((t: any) => (
                                <tr key={t.id} className="hover:bg-[#F8F6F0]/70">
                                  <td className="py-2.5 pr-3 text-[#5C6058] whitespace-nowrap">
                                    {new Date(t.timestamp).toLocaleString('en-IN')}
                                  </td>
                                  <td className="py-2.5 pr-3 font-medium text-[#183D32]">
                                    {t.productName}
                                  </td>
                                  <td className="py-2.5 pr-3 whitespace-nowrap">
                                    <StatusBadge status={t.movementType} />
                                  </td>
                                  <td className="py-2.5 pr-3 font-semibold tabular-nums whitespace-nowrap">
                                    {t.previousStock} → {t.updatedStock} {t.unit}
                                  </td>
                                  <td className="py-2.5 pr-3 text-[#4A4E47]">{t.reason}</td>
                                  <td className="py-2.5 text-[#5C6058] whitespace-nowrap">{t.adminName}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <PaginationBar
                          page={safePage}
                          totalPages={totalPages}
                          totalItems={filteredHistory.length}
                          onPageChange={setPage}
                        />
                      </>
                    )}
                  </div>
                )}
              </AdminCard>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
