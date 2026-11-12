import { useEffect, useState } from 'react';
import { Ticket, Plus, Edit3, Trash2, Search } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import {
  AdminCard,
  AdminModal,
  ConfirmDialog,
  EmptyState,
  LoadingSkeleton,
  StatusBadge,
  ToastBanner,
} from '../../components/admin/AdminUI';
import { apiRequest, ApiError } from '../../services/api';
import { formatINR } from '../../utils/priceCalculator';

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState({
    code: '',
    title: '',
    description: '',
    discountType: 'percentage' as 'percentage' | 'flat',
    discountValue: '10',
    minOrderValue: '1000',
    maxDiscount: '500',
    startDate: '',
    endDate: '',
    applicableProducts: [] as string[],
    active: true,
  });

  const load = async () => {
    setLoading(true);
    try {
      const [cpnRes, prodRes] = await Promise.all([
        apiRequest<{ coupons: any[] }>('/api/admin/coupons'),
        apiRequest<{ products: any[] }>('/api/admin/erp/products'),
      ]);
      setCoupons(cpnRes.coupons || []);
      setProducts(prodRes.products || []);
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Unable to load coupons.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      code: '',
      title: '',
      description: '',
      discountType: 'percentage',
      discountValue: '10',
      minOrderValue: '1000',
      maxDiscount: '500',
      startDate: '',
      endDate: '',
      applicableProducts: [],
      active: true,
    });
    setModalOpen(true);
  };

  const openEdit = (c: any) => {
    let parsedProducts: string[] = [];
    if (Array.isArray(c.applicableProducts)) {
      parsedProducts = c.applicableProducts;
    } else if (typeof c.applicableProducts === 'string') {
      try {
        const arr = JSON.parse(c.applicableProducts);
        if (Array.isArray(arr)) parsedProducts = arr;
      } catch {
        parsedProducts = [];
      }
    }

    setEditingId(c.id);
    setForm({
      code: c.code || '',
      title: c.title || '',
      description: c.description || '',
      discountType: c.discountType === 'flat' ? 'flat' : 'percentage',
      discountValue: String(c.discountValue ?? 0),
      minOrderValue: String(c.minOrderValue ?? 0),
      maxDiscount: c.maxDiscount !== null && c.maxDiscount !== undefined ? String(c.maxDiscount) : '',
      startDate: c.startDate ? String(c.startDate).slice(0, 10) : '',
      endDate: c.endDate ? String(c.endDate).slice(0, 10) : '',
      applicableProducts: parsedProducts,
      active: Boolean(c.active),
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        title: form.title.trim() || form.code.trim().toUpperCase(),
        description: form.description.trim(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        minOrderValue: Number(form.minOrderValue || 0),
        maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        applicableProducts: form.applicableProducts,
        active: form.active,
      };
      if (editingId) {
        await apiRequest(`/api/admin/coupons/${editingId}`, { method: 'PUT', body: payload });
        setToast({ type: 'ok', text: `Coupon ${payload.code} updated.` });
      } else {
        await apiRequest('/api/admin/coupons', { method: 'POST', body: payload });
        setToast({ type: 'ok', text: `Coupon ${payload.code} created.` });
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Could not save coupon.' });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiRequest(`/api/admin/coupons/${deleteId}`, { method: 'DELETE' });
      setToast({ type: 'ok', text: 'Coupon deleted.' });
      setDeleteId(null);
      await load();
    } catch (err) {
      setDeleteId(null);
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Delete failed.' });
    }
  };

  const filtered = coupons.filter(c => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      String(c.code || '').toLowerCase().includes(q) ||
      String(c.title || '').toLowerCase().includes(q)
    );
  });

  const activeCount = coupons.filter(c => Boolean(c.active)).length;

  return (
    <AdminLayout
      title="Coupons & Promotional Discounts"
      subtitle="Manage percentage and flat-rate discount codes, eligibility thresholds, and seasonal expiry dates."
      actions={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#183D32] text-white text-xs font-semibold hover:bg-[#245746] cursor-pointer"
        >
          <Plus className="w-4 h-4 text-[#C8A96B]" />
          <span>Create Coupon</span>
        </button>
      }
    >
      <div className="space-y-6">
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <AdminCard padding="p-5">
            <div className="text-xs text-[#888B83]">Total Coupon Rules</div>
            <div className="text-2xl font-bold text-[#183D32] mt-1 tabular-nums">{coupons.length}</div>
          </AdminCard>
          <AdminCard padding="p-5">
            <div className="text-xs text-[#888B83]">Currently Active</div>
            <div className="text-2xl font-bold text-[#245746] mt-1 tabular-nums">{activeCount}</div>
          </AdminCard>
          <AdminCard padding="p-5">
            <div className="relative">
              <Search className="w-4 h-4 text-[#888B83] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search coupon code or title..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] text-xs text-[#252923] focus:outline-none focus:border-[#183D32]"
              />
            </div>
          </AdminCard>
        </div>

        <AdminCard>
          {loading ? (
            <LoadingSkeleton rows={4} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Ticket}
              title="No matching coupons"
              description="Create promotional discount codes for festive sales, loyal VIP patrons, or cart incentives."
              action={
                <button
                  type="button"
                  onClick={openCreate}
                  className="px-4 py-2 rounded-xl bg-[#183D32] text-white text-xs font-semibold cursor-pointer"
                >
                  Create Coupon
                </button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-[#E9E4D9] text-[#888B83]">
                    <th className="py-3 px-2 font-medium">Code</th>
                    <th className="py-3 px-2 font-medium">Campaign / Title</th>
                    <th className="py-3 px-2 font-medium">Discount</th>
                    <th className="py-3 px-2 font-medium">Min Order / Cap</th>
                    <th className="py-3 px-2 font-medium">Validity</th>
                    <th className="py-3 px-2 font-medium">Status</th>
                    <th className="py-3 px-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E4D9]">
                  {filtered.map(c => (
                    <tr key={c.id} className="hover:bg-[#F8F6F0]/60">
                      <td className="py-3.5 px-2">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-[#FAF3E3] border border-[#E8D5A7] font-mono font-bold text-[#183D32]">
                          {c.code}
                        </span>
                      </td>
                      <td className="py-3.5 px-2">
                        <div className="font-semibold text-[#183D32]">{c.title}</div>
                        <div className="text-[11px] text-[#888B83] max-w-xs truncate">{c.description}</div>
                      </td>
                      <td className="py-3.5 px-2 font-bold text-[#252923] tabular-nums">
                        {c.discountType === 'percentage'
                          ? `${c.discountValue}% OFF`
                          : `${formatINR(c.discountValue)} FLAT`}
                      </td>
                      <td className="py-3.5 px-2 text-[#5C6058]">
                        <div>Min: {formatINR(c.minOrderValue || 0)}</div>
                        <div className="text-[11px] text-[#888B83]">
                          Cap: {c.maxDiscount ? formatINR(c.maxDiscount) : 'No max'}
                        </div>
                      </td>
                      <td className="py-3.5 px-2 text-[#5C6058] whitespace-nowrap">
                        {c.startDate || c.endDate
                          ? `${c.startDate ? String(c.startDate).slice(0, 10) : 'Now'} → ${
                              c.endDate ? String(c.endDate).slice(0, 10) : '∞'
                            }`
                          : 'Always Active'}
                      </td>
                      <td className="py-3.5 px-2">
                        <StatusBadge status={c.active ? 'active' : 'inactive'} tone={c.active ? 'emerald' : 'neutral'} />
                      </td>
                      <td className="py-3.5 px-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            className="p-1.5 rounded-lg text-[#245746] hover:bg-[#E7F3EE] cursor-pointer"
                            title="Edit coupon"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteId(c.id)}
                            className="p-1.5 rounded-lg text-[#C65B50] hover:bg-[#FCECEB] cursor-pointer"
                            title="Delete coupon"
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
          )}
        </AdminCard>
      </div>

      {/* Create / Edit Modal */}
      <AdminModal
        open={modalOpen}
        title={editingId ? `Edit Coupon ${form.code}` : 'Create Promotional Coupon'}
        subtitle="Configure checkout eligibility, discount formula, and active dates."
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-[#252923] mb-1">Coupon Code *</label>
              <input
                required
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s+/g, '') })}
                placeholder="e.g., ROYAL15"
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] font-mono uppercase focus:outline-none focus:border-[#183D32]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#252923] mb-1">Title</label>
              <input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Festive Reserve Offer"
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#252923] mb-1">Discount Type</label>
              <select
                value={form.discountType}
                onChange={e => setForm({ ...form, discountType: e.target.value as 'percentage' | 'flat' })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="flat">Flat Amount (₹)</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-[#252923] mb-1">
                Discount Value ({form.discountType === 'percentage' ? '%' : 'INR'}) *
              </label>
              <input
                type="number"
                step="0.01"
                min="1"
                required
                value={form.discountValue}
                onChange={e => setForm({ ...form, discountValue: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#252923] mb-1">Minimum Order Value (INR)</label>
              <input
                type="number"
                min="0"
                value={form.minOrderValue}
                onChange={e => setForm({ ...form, minOrderValue: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#252923] mb-1">Max Discount Cap (INR)</label>
              <input
                type="number"
                min="0"
                value={form.maxDiscount}
                onChange={e => setForm({ ...form, maxDiscount: e.target.value })}
                placeholder="Optional cap"
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#252923] mb-1">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => setForm({ ...form, startDate: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#252923] mb-1">Expiry Date</label>
              <input
                type="date"
                value={form.endDate}
                onChange={e => setForm({ ...form, endDate: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-[#252923] mb-1">Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Offer summary displayed in customer account..."
              className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
            />
          </div>

          <div>
            <label className="block font-medium text-[#252923] mb-1.5">
              Eligible Products (leave unselected for site-wide coupon)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {products.map(p => {
                const picked = form.applicableProducts.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setForm(prev => ({
                        ...prev,
                        applicableProducts: picked
                          ? prev.applicableProducts.filter(x => x !== p.id)
                          : [...prev.applicableProducts, p.id],
                      }))
                    }
                    className={`px-2.5 py-1 rounded-full text-[11px] border cursor-pointer ${
                      picked
                        ? 'bg-[#183D32] text-white border-[#183D32]'
                        : 'bg-[#F8F6F0] text-[#5C6058] border-[#E9E4D9]'
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer font-medium text-[#183D32]">
            <input
              type="checkbox"
              checked={form.active}
              onChange={e => setForm({ ...form, active: e.target.checked })}
              className="accent-[#183D32] w-4 h-4"
            />
            <span>Coupon is active and redeemable at checkout</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-[#E9E4D9] text-[#5C6058] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[#183D32] text-white font-semibold hover:bg-[#245746] cursor-pointer"
            >
              {editingId ? 'Save Changes' : 'Create Coupon'}
            </button>
          </div>
        </form>
      </AdminModal>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete Promotional Coupon?"
        message="Deleting this coupon will immediately prevent customers from redeeming it at checkout."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </AdminLayout>
  );
}

