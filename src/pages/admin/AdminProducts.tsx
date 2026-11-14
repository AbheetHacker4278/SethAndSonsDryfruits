import { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Edit3,
  Copy,
  Trash2,
  Eye,
  Power,
  Upload,
  Package,
  Sparkles,
  Calculator,
  Percent,
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
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
import {
  formatINR,
  calculateKgMarginTiers,
  parseWeightGrams,
  getProductBaseCost,
  getVariantBaseCost,
  calculateDynamicSellingPrice,
} from '../../utils/priceCalculator';
import { useAuth } from '../../context/AuthContext';

interface WeightVariantInput {
  id?: string;
  weightLabel: string;
  sku: string;
  purchasePrice: number;
  sellingPrice: number;
  discountPrice?: number | null;
  stock: number;
  active: boolean;
}

function formatPriceUnitSuffix(p: {
  unit?: string;
  weightLabel?: string | null;
  price?: number;
  weightVariants?: Array<{ weightLabel?: string; sellingPrice?: number }>;
}): string {
  const wl = (p.weightLabel || '').trim();
  if (wl) {
    if (/^1\s*kg$/i.test(wl)) return 'kg';
    if (/^1\s*(?:g|gm|gram)$/i.test(wl)) {
      const matchedTier = (p.weightVariants || []).find(
        v => Number(v.sellingPrice) === Number(p.price) && v.weightLabel
      );
      if (matchedTier?.weightLabel) {
        return /^1\s*kg$/i.test(matchedTier.weightLabel) ? 'kg' : matchedTier.weightLabel;
      }
      return 'gram';
    }
    return wl;
  }
  return p.unit || 'kg';
}

export default function AdminProducts() {
  const { refreshProducts } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const perPage = 8;

  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [viewProduct, setViewProduct] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  // Add/Edit Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [autoCalcMargin, setAutoCalcMargin] = useState(true);
  const [marginPercent] = useState(40);
  const [form, setForm] = useState({
    name: '',
    hindiName: '',
    subtitle: 'Jammu Heritage Reserve',
    sku: '',
    barcode: '',
    purchasePrice: '600',
    price: '750',
    discountPrice: '',
    gstRate: '5',
    stock: '25',
    minStockAlert: '5',
    unit: 'kg' as 'kg' | 'gram' | 'ml' | 'piece',
    weightLabel: '1kg',
    categoryId: 'cat_almonds',
    image: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
    description: '',
    origin: 'Jammu & Kashmir Orchards',
    grade: 'Royal Grade A++',
    expiryDate: '',
    storageInstructions: 'Store in a cool, dry airtight container.',
    featured: false,
    status: 'published' as 'published' | 'draft',
  });
  const [variants, setVariants] = useState<WeightVariantInput[]>([]);

  const applyMarginCalculations = (
    costPerKg: number,
    baseSku: string = form.sku,
    margin: number = marginPercent
  ) => {
    const calculated = calculateKgMarginTiers(costPerKg, margin, baseSku);
    setVariants(prev => {
      const nextVariants = [...prev];
      for (const tier of calculated) {
        const idx = nextVariants.findIndex(
          v => v.weightLabel.toLowerCase().replace(/\s+/g, '') === tier.weightLabel.toLowerCase()
        );
        if (idx >= 0) {
          nextVariants[idx] = {
            ...nextVariants[idx],
            purchasePrice: tier.purchasePrice,
            sellingPrice: tier.sellingPrice,
            sku: nextVariants[idx].sku || tier.sku,
          };
        } else {
          nextVariants.push(tier);
        }
      }

      // Also adjust any other custom variants (e.g. 100g, 200g, 2kg) proportionally
      return nextVariants.map(v => {
        const grams = parseWeightGrams(v.weightLabel);
        if (grams !== null && grams !== 250 && grams !== 500 && grams !== 1000) {
          const ratio = grams / 1000;
          const vCost = Math.round(costPerKg * ratio);
          const mult = 1 + margin / 100;
          return {
            ...v,
            purchasePrice: vCost,
            sellingPrice: Math.round(vCost * mult),
          };
        }
        return v;
      });
    });
  };

  const handlePurchasePriceChange = (val: string) => {
    const cost = parseFloat(val);
    setForm(f => {
      const next = { ...f, purchasePrice: val };
      if (autoCalcMargin && !isNaN(cost) && cost >= 0) {
        const mult = 1 + marginPercent / 100;
        next.price = String(Math.round(cost * mult));
        next.weightLabel = '1kg';
      }
      return next;
    });

    if (autoCalcMargin && !isNaN(cost) && cost >= 0) {
      applyMarginCalculations(cost, form.sku, marginPercent);
    }
  };

  const handleTriggerAutoCalc = () => {
    const cost = parseFloat(form.purchasePrice);
    if (isNaN(cost) || cost <= 0) {
      setToast({ type: 'err', text: 'Please enter a valid Purchase Price for 1 kg first.' });
      return;
    }
    const mult = 1 + marginPercent / 100;
    setForm(f => ({ ...f, price: String(Math.round(cost * mult)), weightLabel: '1kg' }));
    applyMarginCalculations(cost, form.sku, marginPercent);
    setToast({
      type: 'ok',
      text: `Calculated 250g (₹${Math.round(cost * 0.25)} cost, ₹${Math.round(cost * 0.25 * mult)} sell), 500g (₹${Math.round(cost * 0.5)} cost, ₹${Math.round(cost * 0.5 * mult)} sell), and 1kg (₹${cost} cost, ₹${Math.round(cost * mult)} sell) with ${marginPercent}% margin.`,
    });
  };

  const handleVariantCostChange = (index: number, newCost: number) => {
    setVariants(arr =>
      arr.map((x, idx) => {
        if (idx !== index) return x;
        const updated = { ...x, purchasePrice: newCost };
        if (autoCalcMargin) {
          const mult = 1 + marginPercent / 100;
          updated.sellingPrice = Math.round(newCost * mult);
        }
        return updated;
      })
    );
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        apiRequest<{ products: any[] }>(
          `/api/admin/erp/products?search=${encodeURIComponent(search)}&categoryId=${encodeURIComponent(categoryFilter)}&status=${encodeURIComponent(statusFilter)}`
        ),
        apiRequest<{ categories: any[] }>('/api/admin/categories'),
      ]);
      setProducts(pRes.products || []);
      setCategories(cRes.categories || []);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [search, categoryFilter, statusFilter]);

  const openCreate = () => {
    const initialCost = 600;
    const initialVariants = calculateKgMarginTiers(initialCost, marginPercent, 'AS-NEW');
    setEditingId(null);
    setForm({
      name: '',
      hindiName: '',
      subtitle: 'Jammu Heritage Reserve',
      sku: '',
      barcode: '',
      purchasePrice: String(initialCost),
      price: String(Math.round(initialCost * (1 + marginPercent / 100))),
      discountPrice: '',
      gstRate: '5',
      stock: '25',
      minStockAlert: '5',
      unit: 'kg',
      weightLabel: '1kg',
      categoryId: categories[0]?.id || 'cat_almonds',
      image: '/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg',
      description: '',
      origin: 'Jammu & Kashmir Orchards',
      grade: 'Royal Grade A++',
      expiryDate: '',
      storageInstructions: 'Store in a cool, dry airtight container.',
      featured: false,
      status: 'published',
    });
    setVariants(initialVariants);
    setFormOpen(true);
  };

  const openEdit = (p: any) => {
    const pCost = Number(p.purchasePrice ?? 0);
    const existingVariants: WeightVariantInput[] = (p.weightVariants || []).map((v: any) => ({
      id: v.id,
      weightLabel: v.weightLabel,
      sku: v.sku,
      purchasePrice: Number(v.purchasePrice || 0),
      sellingPrice: Number(v.sellingPrice || 0),
      discountPrice: v.discountPrice ? Number(v.discountPrice) : null,
      stock: Number(v.stock || 0),
      active: Boolean(v.active),
    }));

    // If product has no weight variants configured yet, generate standard 250g, 500g, 1kg tiers
    let finalVariants = existingVariants;
    if (finalVariants.length === 0 && pCost > 0) {
      finalVariants = calculateKgMarginTiers(pCost, marginPercent, p.sku || 'AS-PROD', Number(p.stock || 20));
    }

    setEditingId(p.id);
    setForm({
      name: p.name || '',
      hindiName: p.hindiName || '',
      subtitle: p.subtitle || '',
      sku: p.sku || '',
      barcode: p.barcode || '',
      purchasePrice: String(p.purchasePrice ?? 0),
      price: String(p.price ?? 0),
      discountPrice: p.discountPrice ? String(p.discountPrice) : '',
      gstRate: String(p.gstRate ?? 5),
      stock: String(p.stock ?? 0),
      minStockAlert: String(p.minStockAlert ?? 5),
      unit: p.unit === 'gram' ? 'gram' : p.unit === 'ml' ? 'ml' : p.unit === 'piece' ? 'piece' : 'kg',
      weightLabel: p.weightLabel || '1kg',
      categoryId: p.categoryId || categories[0]?.id || 'cat_almonds',
      image: p.image || '',
      description: p.description || '',
      origin: p.origin || '',
      grade: p.grade || '',
      expiryDate: p.expiryDate || '',
      storageInstructions: p.storageInstructions || '',
      featured: Boolean(p.featured),
      status: p.status === 'draft' ? 'draft' : 'published',
    });
    setVariants(finalVariants);
    setFormOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    try {
      const res = await apiUpload<{ imageUrl: string }>('/api/admin/products/upload-image', fd);
      setForm(f => ({ ...f, image: res.imageUrl }));
      setToast({ type: 'ok', text: 'Product image uploaded.' });
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Image upload failed.' });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setToast(null);
    const payload = {
      ...form,
      purchasePrice: Number(form.purchasePrice || 0),
      price: Number(form.price || 0),
      discountPrice: form.discountPrice ? Number(form.discountPrice) : null,
      gstRate: Number(form.gstRate || 5),
      stock: Number(form.stock || 0),
      minStockAlert: Number(form.minStockAlert || 5),
      expiryDate: form.expiryDate || null,
      weightVariants: variants,
    };
    try {
      if (editingId) {
        await apiRequest(`/api/admin/erp/products/${editingId}`, { method: 'PUT', body: payload });
        setToast({ type: 'ok', text: 'Product updated successfully.' });
      } else {
        await apiRequest('/api/admin/erp/products', { method: 'POST', body: payload });
        setToast({ type: 'ok', text: 'Product created successfully.' });
      }
      setFormOpen(false);
      await loadData();
      await refreshProducts();
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Could not save product.' });
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await apiRequest(`/api/admin/erp/products/${id}/duplicate`, { method: 'POST' });
      setToast({ type: 'ok', text: 'Product duplicated as draft.' });
      await loadData();
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Could not duplicate product.',
      });
    }
  };

  const handleToggleStatus = async (p: any) => {
    const next = p.status === 'published' ? 'draft' : 'published';
    try {
      await apiRequest(`/api/admin/erp/products/${p.id}/status`, {
        method: 'PATCH',
        body: { status: next },
      });
      setToast({ type: 'ok', text: `Product ${next === 'published' ? 'activated' : 'deactivated'}.` });
      await loadData();
      await refreshProducts();
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Could not update product status.',
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await apiRequest<{ message: string }>(`/api/admin/erp/products/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      setDeleteTarget(null);
      setToast({ type: 'ok', text: res.message });
      await loadData();
      await refreshProducts();
    } catch (err) {
      setDeleteTarget(null);
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Could not delete product.',
      });
    }
  };

  const totalPages = Math.max(1, Math.ceil(products.length / perPage));
  const paged = products.slice((page - 1) * perPage, page * perPage);

  return (
    <AdminLayout
      title="Product Catalog Management"
      subtitle="Manage dry-fruit SKUs, purchase & selling prices, GST rates, weight variants (100g–1kg), and stock alerts."
      actions={
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#183D32] hover:bg-[#245746] text-white cursor-pointer shadow-sm"
        >
          <Plus className="w-4 h-4 text-[#C8A96B]" />
          <span>Add Product</span>
        </button>
      }
    >
      <div className="space-y-5">
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

        {/* Filters */}
        <AdminCard padding="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#888B83] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search name, SKU, origin..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={e => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs"
            >
              <option value="all">All Categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs"
            >
              <option value="all">All Statuses</option>
              <option value="published">Active (Published)</option>
              <option value="draft">Inactive (Draft)</option>
            </select>
          </div>
        </AdminCard>

        {/* Product Table */}
        <AdminCard>
          {loading ? (
            <LoadingSkeleton rows={5} />
          ) : paged.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No Products Found"
              description="Adjust your filters or add a new luxury dry-fruit product."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E9E4D9] text-[#888B83] uppercase text-[11px]">
                      <th className="py-3 pr-3">Product</th>
                      <th className="py-3 pr-3">SKU</th>
                      <th className="py-3 pr-3">Category</th>
                      <th className="py-3 pr-3">Selling Prices (40% / 25%)</th>
                      <th className="py-3 pr-3">Purchase Cost</th>
                      <th className="py-3 pr-3">Stock</th>
                      <th className="py-3 pr-3">Status</th>
                      <th className="py-3 pr-3">Created</th>
                      <th className="py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9E4D9]">
                    {paged.map(p => (
                      <tr key={p.id} className="hover:bg-[#F8F6F0]/60">
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-3">
                            <img
                              src={p.image}
                              alt={p.name}
                              className="w-10 h-10 rounded-xl object-cover border border-[#E9E4D9]"
                            />
                            <div>
                              <div className="font-semibold text-[#183D32]">{p.name}</div>
                              <div className="text-[11px] text-[#888B83]">{p.weightVariants?.length || 0} variants</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-3 font-mono text-[11px] text-[#5C6058]">{p.sku || '—'}</td>
                        <td className="py-3 pr-3">{p.categoryName}</td>
                        <td className="py-3 pr-3">
                          {(() => {
                            const baseCost = getProductBaseCost(p);
                            const price40 = p.price ? Number(p.price) : calculateDynamicSellingPrice(baseCost, 40);
                            const price25 = calculateDynamicSellingPrice(baseCost, 25);
                            const unitSuffix = formatPriceUnitSuffix(p);

                            return (
                              <div className="space-y-1 py-0.5">
                                <div
                                  className="flex items-center gap-1.5 whitespace-nowrap"
                                  title="40% Profit Margin (Domestic / Other Cities)"
                                >
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-300">
                                    40%
                                  </span>
                                  <span className="font-bold text-[#183D32]">
                                    {formatINR(price40)}/{unitSuffix}
                                  </span>
                                </div>
                                <div
                                  className="flex items-center gap-1.5 whitespace-nowrap"
                                  title="25% Profit Margin (Surat / Guest Baseline)"
                                >
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-900 border border-amber-300">
                                    25%
                                  </span>
                                  <span className="font-semibold text-[#8F6C2B]">
                                    {formatINR(price25)}/{unitSuffix}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-3 pr-3 text-[#5C6058]">{formatINR(p.purchasePrice || 0)}</td>
                        <td className="py-3 pr-3">
                          <span
                            className={`font-semibold ${
                              p.stock <= 0
                                ? 'text-[#C65B50]'
                                : p.stock <= p.minStockAlert
                                ? 'text-[#8F6C2B]'
                                : 'text-[#183D32]'
                            }`}
                          >
                            {p.stock} {p.unit}
                          </span>
                        </td>
                        <td className="py-3 pr-3">
                          <StatusBadge status={p.status} />
                        </td>
                        <td className="py-3 pr-3 text-[#888B83]">
                          {p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN') : '—'}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setViewProduct(p)}
                              title="View"
                              className="p-1.5 rounded-lg hover:bg-[#E9E4D9]/60 text-[#245746] cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => openEdit(p)}
                              title="Edit"
                              className="p-1.5 rounded-lg hover:bg-[#E9E4D9]/60 text-[#183D32] cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDuplicate(p.id)}
                              title="Duplicate"
                              className="p-1.5 rounded-lg hover:bg-[#E9E4D9]/60 text-[#8F6C2B] cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleToggleStatus(p)}
                              title={p.status === 'published' ? 'Deactivate' : 'Activate'}
                              className="p-1.5 rounded-lg hover:bg-[#E9E4D9]/60 text-[#5C6058] cursor-pointer"
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(p)}
                              title="Delete"
                              className="p-1.5 rounded-lg hover:bg-[#FCECEB] text-[#C65B50] cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={page}
                totalPages={totalPages}
                totalItems={products.length}
                onPageChange={setPage}
              />
            </>
          )}
        </AdminCard>

        {/* Add / Edit Product Modal */}
        <AdminModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title={editingId ? 'Edit Product' : 'Add New Product'}
          subtitle="Configure SKU, purchase & selling rates, GST, storage, and weight variations."
          maxWidth="max-w-3xl"
        >
          <form onSubmit={handleSave} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Category *</label>
                <select
                  value={form.categoryId}
                  onChange={e => setForm({ ...form, categoryId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">SKU / Product Code</label>
                <input
                  type="text"
                  value={form.sku}
                  onChange={e => setForm({ ...form, sku: e.target.value })}
                  placeholder="e.g. AS-BAD-MAM"
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Barcode (Optional)</label>
                <input
                  type="text"
                  value={form.barcode}
                  onChange={e => setForm({ ...form, barcode: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium mb-1">Description *</label>
              <textarea
                rows={2}
                required
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-[#183D32]">Purchase Price (₹)</label>
                  <span className="text-[10px] text-[#70746B] font-medium">1 kg Cost</span>
                </div>
                <input
                  type="number"
                  min={0}
                  required
                  value={form.purchasePrice}
                  onChange={e => handlePurchasePriceChange(e.target.value)}
                  placeholder="e.g. 800"
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] focus:outline-none focus:border-[#183D32]"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-[#183D32]">Selling Price (₹) *</label>
                  {autoCalcMargin && Number(form.purchasePrice || 0) > 0 && (
                    <span className="text-[10px] font-bold text-[#183D32] bg-[#E2ECE7] px-1.5 py-0.5 rounded">
                      {marginPercent}% Margin
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min={1}
                  required
                  value={form.price}
                  onChange={e => setForm({ ...form, price: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] focus:outline-none focus:border-[#183D32]"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Discount Price (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={form.discountPrice}
                  onChange={e => setForm({ ...form, discountPrice: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">GST Rate (%)</label>
                <input
                  type="number"
                  min={0}
                  max={28}
                  value={form.gstRate}
                  onChange={e => setForm({ ...form, gstRate: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
                />
              </div>
            </div>

            {/* Auto-calculation toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-[#F4F1EA] border border-[#E4DFD5] text-xs">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-[#183D32]">
                <input
                  type="checkbox"
                  checked={autoCalcMargin}
                  onChange={e => setAutoCalcMargin(e.target.checked)}
                  className="accent-[#183D32] rounded"
                />
                <span>Auto-calculate {marginPercent}% margin &amp; weight tiers (250g, 500g, 1kg) from 1 kg cost</span>
              </label>
              <button
                type="button"
                onClick={handleTriggerAutoCalc}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#183D32] hover:bg-[#245746] text-white font-semibold text-[11px] cursor-pointer shadow-sm"
              >
                <Sparkles className="w-3 h-3 text-[#E2C375]" />
                <span>Recalculate Tiers ({marginPercent}% Margin)</span>
              </button>
            </div>

            {/* Dual Margin Pricing Breakdown Cards (40% & 25%) */}
            {Number(form.purchasePrice || 0) > 0 && (
              <div className="p-3 rounded-xl bg-[#FDFBF7] border border-[#E8E3D8] space-y-2 text-xs">
                <div className="flex items-center justify-between font-semibold text-[#183D32]">
                  <div className="flex items-center gap-1.5">
                    <Calculator className="w-3.5 h-3.5 text-[#245746]" />
                    <span>Dual Profit Margin Engine (40% &amp; 25%)</span>
                  </div>
                  <span className="text-[11px] font-normal text-[#5C6058]">
                    1 kg Cost: <strong>{formatINR(Number(form.purchasePrice))}</strong>
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                  <div className="p-2.5 rounded-lg bg-white border border-[#E9E4D9] space-y-1">
                    <div className="font-bold text-[#183D32] flex items-center justify-between">
                      <span>250g Tier (Cost ÷ 4)</span>
                      <span className="text-[9px] text-[#5C6058]">Cost: {formatINR(Math.round(Number(form.purchasePrice) * 0.25))}</span>
                    </div>
                    <div className="flex items-center justify-between text-emerald-800">
                      <span>40% Profit (Other Cities):</span>
                      <strong>{formatINR(Math.round(Number(form.purchasePrice) * 0.25 * 1.40))}</strong>
                    </div>
                    <div className="flex items-center justify-between text-amber-900">
                      <span>25% Profit (Surat/Guest):</span>
                      <strong>{formatINR(Math.round(Number(form.purchasePrice) * 0.25 * 1.25))}</strong>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white border border-[#E9E4D9] space-y-1">
                    <div className="font-bold text-[#183D32] flex items-center justify-between">
                      <span>500g Tier (Cost ÷ 2)</span>
                      <span className="text-[9px] text-[#5C6058]">Cost: {formatINR(Math.round(Number(form.purchasePrice) * 0.5))}</span>
                    </div>
                    <div className="flex items-center justify-between text-emerald-800">
                      <span>40% Profit (Other Cities):</span>
                      <strong>{formatINR(Math.round(Number(form.purchasePrice) * 0.5 * 1.40))}</strong>
                    </div>
                    <div className="flex items-center justify-between text-amber-900">
                      <span>25% Profit (Surat/Guest):</span>
                      <strong>{formatINR(Math.round(Number(form.purchasePrice) * 0.5 * 1.25))}</strong>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white border border-[#E9E4D9] space-y-1">
                    <div className="font-bold text-[#183D32] flex items-center justify-between">
                      <span>1000g (1 kg) Tier</span>
                      <span className="text-[9px] text-[#5C6058]">Cost: {formatINR(Math.round(Number(form.purchasePrice)))}</span>
                    </div>
                    <div className="flex items-center justify-between text-emerald-800">
                      <span>40% Profit (Other Cities):</span>
                      <strong>{formatINR(Math.round(Number(form.purchasePrice) * 1.40))}</strong>
                    </div>
                    <div className="flex items-center justify-between text-amber-900">
                      <span>25% Profit (Surat/Guest):</span>
                      <strong>{formatINR(Math.round(Number(form.purchasePrice) * 1.25))}</strong>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block font-medium mb-1">Available Stock</label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={form.stock}
                  onChange={e => setForm({ ...form, stock: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Min Stock Alert</label>
                <input
                  type="number"
                  min={0}
                  value={form.minStockAlert}
                  onChange={e => setForm({ ...form, minStockAlert: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Unit</label>
                <select
                  value={form.unit}
                  onChange={e => setForm({ ...form, unit: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
                >
                  <option value="kg">kg</option>
                  <option value="gram">gram</option>
                  <option value="ml">ml</option>
                  <option value="piece">piece</option>
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Expiry Date</label>
                <input
                  type="date"
                  value={form.expiryDate}
                  onChange={e => setForm({ ...form, expiryDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1">Origin</label>
                <input
                  type="text"
                  value={form.origin}
                  onChange={e => setForm({ ...form, origin: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Storage Instructions</label>
                <input
                  type="text"
                  value={form.storageInstructions}
                  onChange={e => setForm({ ...form, storageInstructions: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="text"
                value={form.image}
                onChange={e => setForm({ ...form, image: e.target.value })}
                placeholder="Product image URL"
                className="flex-1 px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
              />
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-[#183D32] font-semibold cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Image</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            </div>

            {/* Weight Variants Builder */}
            <div className="p-4 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-[#183D32] block">
                    Weight Variations & Multi-Tier Pricing
                  </span>
                  <span className="text-[11px] text-[#70746B]">
                    Automatically synced with 250g, 500g, and 1kg cost and 25% margin selling prices.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTriggerAutoCalc}
                    className="text-[11px] font-semibold text-[#183D32] bg-[#E9E4D9] hover:bg-[#DDD7CD] px-2.5 py-1 rounded-lg cursor-pointer"
                  >
                    ⚡ Sync 25% Margin
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cost = Number(form.purchasePrice || 0);
                      setVariants(v => [
                        ...v,
                        {
                          weightLabel: '100g',
                          sku: `${(form.sku || 'AS').replace(/-(?:250G|500G|1KG|1000G|\d+G)$/i, '')}-100G`,
                          purchasePrice: Math.round(cost * 0.1),
                          sellingPrice: Math.round(cost * 0.1 * 1.25),
                          stock: 10,
                          active: true,
                        },
                      ]);
                    }}
                    className="text-[11px] font-semibold text-[#245746] hover:underline cursor-pointer"
                  >
                    + Add Variant
                  </button>
                </div>
              </div>

              {variants.length > 0 && (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-12 gap-2 text-[11px] font-bold text-[#5C6058] px-2">
                    <div className="col-span-2">Weight</div>
                    <div className="col-span-3">SKU</div>
                    <div className="col-span-2">Cost (₹)</div>
                    <div className="col-span-2">Selling (₹)</div>
                    <div className="col-span-2">Stock</div>
                    <div className="col-span-1 text-right">Action</div>
                  </div>
                  {variants.map((v, i) => {
                    const is25Pct = v.purchasePrice > 0 && Math.round(v.purchasePrice * 1.25) === v.sellingPrice;
                    return (
                      <div
                        key={i}
                        className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded-xl border border-[#E9E4D9]"
                      >
                        <input
                          type="text"
                          value={v.weightLabel}
                          onChange={e =>
                            setVariants(arr =>
                              arr.map((x, idx) => (idx === i ? { ...x, weightLabel: e.target.value } : x))
                            )
                          }
                          placeholder="e.g. 250g"
                          className="col-span-2 px-2 py-1.5 text-xs rounded-lg bg-[#F8F6F0] border border-[#E9E4D9]"
                        />
                        <input
                          type="text"
                          value={v.sku}
                          onChange={e =>
                            setVariants(arr => arr.map((x, idx) => (idx === i ? { ...x, sku: e.target.value } : x)))
                          }
                          placeholder="SKU"
                          className="col-span-3 px-2 py-1.5 text-xs rounded-lg bg-[#F8F6F0] border border-[#E9E4D9]"
                        />
                        <input
                          type="number"
                          min={0}
                          value={v.purchasePrice}
                          onChange={e => handleVariantCostChange(i, Number(e.target.value))}
                          placeholder="Cost"
                          className="col-span-2 px-2 py-1.5 text-xs rounded-lg bg-[#F8F6F0] border border-[#E9E4D9]"
                        />
                        <div className="col-span-2 relative">
                          <input
                            type="number"
                            min={0}
                            value={v.sellingPrice}
                            onChange={e =>
                              setVariants(arr =>
                                arr.map((x, idx) =>
                                  idx === i ? { ...x, sellingPrice: Number(e.target.value) } : x
                                )
                              )
                            }
                            placeholder="Selling"
                            className="w-full px-2 py-1.5 text-xs rounded-lg bg-[#F8F6F0] border border-[#E9E4D9]"
                          />
                          {is25Pct && (
                            <span
                              className="absolute right-1 top-1.5 text-[8px] font-bold text-[#183D32] bg-[#E2ECE7] px-1 py-0.5 rounded"
                              title="25% Margin Active"
                            >
                              25%
                            </span>
                          )}
                        </div>
                        <input
                          type="number"
                          min={0}
                          value={v.stock}
                          onChange={e =>
                            setVariants(arr =>
                              arr.map((x, idx) => (idx === i ? { ...x, stock: Number(e.target.value) } : x))
                            )
                          }
                          placeholder="Stock"
                          className="col-span-2 px-2 py-1.5 text-xs rounded-lg bg-[#F8F6F0] border border-[#E9E4D9]"
                        />
                        <div className="col-span-1 text-right">
                          <button
                            type="button"
                            onClick={() => setVariants(arr => arr.filter((_, idx) => idx !== i))}
                            className="text-[#C65B50] hover:text-[#9B372D] cursor-pointer inline-flex items-center justify-center p-1 rounded hover:bg-[#FBEAE8]"
                            title="Remove Variant"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.featured}
                    onChange={e => setForm({ ...form, featured: e.target.checked })}
                    className="accent-[#183D32]"
                  />
                  <span>Featured Product</span>
                </label>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value as any })}
                  className="px-3 py-1.5 rounded-lg bg-[#F8F6F0] border border-[#E9E4D9]"
                >
                  <option value="published">Active (Published)</option>
                  <option value="draft">Inactive (Draft)</option>
                </select>
              </div>

              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-[#183D32] hover:bg-[#245746] text-white font-semibold cursor-pointer"
              >
                {editingId ? 'Save Changes' : 'Create Product'}
              </button>
            </div>
          </form>
        </AdminModal>

        {/* View Product Modal */}
        <AdminModal
          open={Boolean(viewProduct)}
          onClose={() => setViewProduct(null)}
          title={viewProduct?.name || 'Product Details'}
        >
          {viewProduct && (() => {
            const baseCost = getProductBaseCost(viewProduct);
            const price40 = viewProduct.price ? Number(viewProduct.price) : calculateDynamicSellingPrice(baseCost, 40);
            const price25 = calculateDynamicSellingPrice(baseCost, 25);
            const unitSuffix = formatPriceUnitSuffix(viewProduct);

            return (
              <div className="space-y-4 text-xs">
                <div className="flex gap-4 items-start">
                  <img src={viewProduct.image} alt={viewProduct.name} className="w-24 h-24 rounded-xl object-cover border border-[#E9E4D9]" />
                  <div className="space-y-1.5 flex-1">
                    <div className="font-semibold text-base text-[#183D32]">{viewProduct.name}</div>
                    <div className="text-[#888B83]">SKU: {viewProduct.sku} • Origin: {viewProduct.origin}</div>
                    <div className="flex flex-wrap items-center gap-2 py-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 font-medium">
                        <span className="font-bold">40% Profit:</span> {formatINR(price40)}/{unitSuffix}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-300 font-medium">
                        <span className="font-bold">25% Profit:</span> {formatINR(price25)}/{unitSuffix}
                      </span>
                      <span className="text-[#5C6058] ml-1">
                        Cost: <strong>{formatINR(viewProduct.purchasePrice || baseCost)}</strong>
                      </span>
                    </div>
                    <div>Stock: <strong>{viewProduct.stock} {viewProduct.unit}</strong> (Min alert: {viewProduct.minStockAlert})</div>
                  </div>
                </div>
                <p className="text-[#5C6058]">{viewProduct.description}</p>
                <div className="text-[#888B83]">Storage: {viewProduct.storageInstructions}</div>
                {Array.isArray(viewProduct.weightVariants) && viewProduct.weightVariants.length > 0 && (
                  <div className="mt-3 p-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]">
                    <div className="font-semibold text-[#183D32] mb-2 flex items-center justify-between">
                      <span>Weight Variations &amp; Dual Profit Margins</span>
                      <span className="text-[10px] text-[#70746B]">{viewProduct.weightVariants.length} tiers configured</span>
                    </div>
                    <div className="grid grid-cols-5 gap-2 text-[11px] font-bold text-[#5C6058] border-b border-[#E9E4D9] pb-1">
                      <div>Weight</div>
                      <div>Cost Price</div>
                      <div>Selling (40% Profit)</div>
                      <div>Selling (25% Profit)</div>
                      <div>Profit Spread</div>
                    </div>
                    {viewProduct.weightVariants.map((v: any, idx: number) => {
                      const vCost = getVariantBaseCost(v);
                      const vPrice40 = v.sellingPrice ? Number(v.sellingPrice) : calculateDynamicSellingPrice(vCost, 40);
                      const vPrice25 = calculateDynamicSellingPrice(vCost, 25);
                      return (
                        <div key={idx} className="grid grid-cols-5 gap-2 text-[11px] py-1.5 border-b border-[#E9E4D9]/40 items-center">
                          <div className="font-semibold text-[#183D32]">{v.weightLabel}</div>
                          <div className="text-[#5C6058]">{formatINR(vCost)}</div>
                          <div className="font-bold text-emerald-800">{formatINR(vPrice40)}</div>
                          <div className="font-bold text-amber-900">{formatINR(vPrice25)}</div>
                          <div className="text-[#245746] font-semibold text-[10px]">
                            +{formatINR(vPrice40 - vCost)} (40%) / +{formatINR(vPrice25 - vCost)} (25%)
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </AdminModal>

        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title="Delete Product"
          message={`Delete "${deleteTarget?.name}"? Products referenced by historical purchases will be safely archived as draft.`}
          confirmLabel="Delete Product"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      </div>
    </AdminLayout>
  );
}

