import { useEffect, useState } from 'react';
import { Receipt, Plus, Edit3, Trash2, Upload, Eye, IndianRupee } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AdminPdfViewerModal, toAdminMediaUrl } from '../../components/admin/AdminPdfViewerModal';
import {
  AdminCard,
  AdminModal,
  ConfirmDialog,
  EmptyState,
  LoadingSkeleton,
  StatusBadge,
  ToastBanner,
} from '../../components/admin/AdminUI';
import { apiRequest, ApiError, apiUpload } from '../../services/api';
import { formatINR } from '../../utils/priceCalculator';

const EXPENSE_CATEGORIES = [
  'Rent',
  'Packaging',
  'Staff Salary',
  'Shipping',
  'Marketing',
  'Utilities',
  'Maintenance',
  'Miscellaneous',
];

const PAYMENT_MODES = ['UPI', 'Bank Transfer', 'Cash', 'Corporate Card', 'Cheque'];

export default function AdminExpenses() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<{ title: string; subtitle: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    category: 'Packaging',
    title: '',
    amount: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    vendor: '',
    paymentMode: 'UPI',
    receiptUrl: '',
    notes: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const qs = categoryFilter ? `?category=${encodeURIComponent(categoryFilter)}` : '';
      const res = await apiRequest<{ expenses: any[] }>(`/api/admin/expenses${qs}`);
      setExpenses(res.expenses || []);
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to load expenses.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [categoryFilter]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      category: 'Packaging',
      title: '',
      amount: '',
      expenseDate: new Date().toISOString().slice(0, 10),
      vendor: '',
      paymentMode: 'UPI',
      receiptUrl: '',
      notes: '',
    });
    setModalOpen(true);
  };

  const openEdit = (exp: any) => {
    setEditingId(exp.id);
    setForm({
      category: exp.category || 'Miscellaneous',
      title: exp.title || '',
      amount: String(exp.amount ?? ''),
      expenseDate: (exp.expenseDate || new Date().toISOString()).slice(0, 10),
      vendor: exp.vendor || '',
      paymentMode: exp.paymentMode || 'UPI',
      receiptUrl: exp.receiptUrl || '',
      notes: exp.notes || '',
    });
    setModalOpen(true);
  };

  const handleUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('receipt', f);
      const res = await apiUpload<{ receiptUrl: string }>('/api/admin/expenses/upload-receipt', fd);
      setForm(prev => ({ ...prev, receiptUrl: res.receiptUrl }));
      setToast({ type: 'ok', text: 'Expense receipt uploaded.' });
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Upload failed.' });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        category: form.category,
        title: form.title.trim(),
        amount: Number(form.amount),
        expenseDate: form.expenseDate,
        vendor: form.vendor.trim(),
        paymentMode: form.paymentMode,
        receiptUrl: form.receiptUrl.trim() || null,
        notes: form.notes.trim(),
      };
      if (editingId) {
        await apiRequest(`/api/admin/expenses/${editingId}`, { method: 'PUT', body: payload });
        setToast({ type: 'ok', text: 'Expense entry updated.' });
      } else {
        await apiRequest('/api/admin/expenses', { method: 'POST', body: payload });
        setToast({ type: 'ok', text: 'Expense recorded.' });
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Could not save expense.' });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiRequest(`/api/admin/expenses/${deleteId}`, { method: 'DELETE' });
      setToast({ type: 'ok', text: 'Expense deleted.' });
      setDeleteId(null);
      await load();
    } catch (err) {
      setDeleteId(null);
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Delete failed.' });
    }
  };

  const totalSpend = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  return (
    <AdminLayout
      title="Operating Expenses"
      subtitle="Track rent, luxury gift tins & packaging, payroll, logistics, and operational receipts."
      actions={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#183D32] text-white text-xs font-semibold hover:bg-[#245746] cursor-pointer"
        >
          <Plus className="w-4 h-4 text-[#C8A96B]" />
          <span>Add Expense</span>
        </button>
      }
    >
      <div className="space-y-6">
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

        {/* Summary & Filter Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <AdminCard padding="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#183D32] text-[#C8A96B] flex items-center justify-center">
                <IndianRupee className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs text-[#888B83]">Filtered Total Spend</div>
                <div className="text-xl font-bold text-[#252923] tabular-nums">{formatINR(totalSpend)}</div>
              </div>
            </div>
          </AdminCard>

          <AdminCard padding="p-5">
            <div className="text-xs text-[#888B83]">Recorded Vouchers</div>
            <div className="text-xl font-bold text-[#183D32] mt-1 tabular-nums">{expenses.length}</div>
          </AdminCard>

          <AdminCard padding="p-5">
            <label className="block text-xs font-medium text-[#888B83] mb-1.5">Filter by Category</label>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] text-xs text-[#252923] focus:outline-none focus:border-[#183D32]"
            >
              <option value="">All Categories</option>
              {EXPENSE_CATEGORIES.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </AdminCard>
        </div>

        {/* Table */}
        <AdminCard>
          {loading ? (
            <LoadingSkeleton rows={5} />
          ) : expenses.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No expenses found"
              description="Record operating costs such as packaging, freight, utilities, or rent to compute net profit accurately."
              action={
                <button
                  type="button"
                  onClick={openCreate}
                  className="px-4 py-2 rounded-xl bg-[#183D32] text-white text-xs font-semibold cursor-pointer"
                >
                  Record First Expense
                </button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-[#E9E4D9] text-[#888B83]">
                    <th className="py-3 px-2 font-medium">Date</th>
                    <th className="py-3 px-2 font-medium">Title &amp; Notes</th>
                    <th className="py-3 px-2 font-medium">Category</th>
                    <th className="py-3 px-2 font-medium">Vendor</th>
                    <th className="py-3 px-2 font-medium">Mode</th>
                    <th className="py-3 px-2 font-medium text-right">Amount</th>
                    <th className="py-3 px-2 font-medium">Receipt</th>
                    <th className="py-3 px-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E4D9]">
                  {expenses.map(exp => (
                    <tr key={exp.id} className="hover:bg-[#F8F6F0]/60">
                      <td className="py-3.5 px-2 whitespace-nowrap text-[#5C6058]">
                        {String(exp.expenseDate || '').slice(0, 10)}
                      </td>
                      <td className="py-3.5 px-2">
                        <div className="font-semibold text-[#183D32]">{exp.title}</div>
                        {exp.notes && <div className="text-[11px] text-[#888B83] truncate max-w-xs">{exp.notes}</div>}
                      </td>
                      <td className="py-3.5 px-2">
                        <StatusBadge status={exp.category} tone="gold" />
                      </td>
                      <td className="py-3.5 px-2 text-[#5C6058]">{exp.vendor || '—'}</td>
                      <td className="py-3.5 px-2 text-[#5C6058]">{exp.paymentMode || 'UPI'}</td>
                      <td className="py-3.5 px-2 text-right font-bold text-[#252923] tabular-nums">
                        {formatINR(Number(exp.amount || 0))}
                      </td>
                      <td className="py-3.5 px-2">
                        {exp.receiptUrl ? (
                          <button
                            type="button"
                            onClick={() =>
                              setReceiptPreview({
                                title: `Receipt: ${exp.title}`,
                                subtitle: `${exp.category} · ${exp.expenseDate || ''}`,
                                url: toAdminMediaUrl(exp.receiptUrl),
                              })
                            }
                            className="inline-flex items-center gap-1 text-[#245746] hover:underline font-medium cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View</span>
                          </button>
                        ) : (
                          <span className="text-[#888B83]">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(exp)}
                            className="p-1.5 rounded-lg text-[#245746] hover:bg-[#E7F3EE] cursor-pointer"
                            title="Edit expense"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteId(exp.id)}
                            className="p-1.5 rounded-lg text-[#C65B50] hover:bg-[#FCECEB] cursor-pointer"
                            title="Delete expense"
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

      {/* Add / Edit Expense Modal */}
      <AdminModal
        open={modalOpen}
        title={editingId ? 'Edit Expense Entry' : 'Record New Expense'}
        subtitle="Expenses deduct from Gross Profit to compute true Net Profit."
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-[#252923] mb-1">Expense Title *</label>
              <input
                required
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="e.g., Custom Gold Tin Boxes (500 pcs)"
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#252923] mb-1">Category *</label>
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
              >
                {EXPENSE_CATEGORIES.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-[#252923] mb-1">Amount (INR) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="4500"
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#252923] mb-1">Expense Date *</label>
              <input
                type="date"
                required
                value={form.expenseDate}
                onChange={e => setForm({ ...form, expenseDate: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#252923] mb-1">Vendor / Payee</label>
              <input
                value={form.vendor}
                onChange={e => setForm({ ...form, vendor: e.target.value })}
                placeholder="e.g., Jammu Packaging Works"
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#252923] mb-1">Payment Mode</label>
              <select
                value={form.paymentMode}
                onChange={e => setForm({ ...form, paymentMode: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
              >
                {PAYMENT_MODES.map(m => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-[#252923] mb-1">Receipt / Voucher Upload</label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] hover:bg-[#EFECE4] cursor-pointer font-medium text-[#183D32]">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploading ? 'Uploading...' : 'Upload Receipt'}</span>
                <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleUploadReceipt} />
              </label>
              <input
                value={form.receiptUrl}
                onChange={e => setForm({ ...form, receiptUrl: e.target.value })}
                placeholder="or paste receipt URL..."
                className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-[#252923] mb-1">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Invoice reference or remarks..."
              className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-[#E9E4D9] text-[#5C6058] hover:bg-[#F8F6F0] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[#183D32] text-white font-semibold hover:bg-[#245746] cursor-pointer"
            >
              {editingId ? 'Save Changes' : 'Save Expense'}
            </button>
          </div>
        </form>
      </AdminModal>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete Expense Record?"
        message="This will permanently remove the expense voucher and recalculate operating totals."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />

      <AdminPdfViewerModal
        open={Boolean(receiptPreview)}
        title={receiptPreview?.title || 'Expense Receipt'}
        subtitle={receiptPreview?.subtitle}
        src={receiptPreview?.url || null}
        onClose={() => setReceiptPreview(null)}
      />
    </AdminLayout>
  );
}

