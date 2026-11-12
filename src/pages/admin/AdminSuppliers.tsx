import { useEffect, useState } from 'react';
import { Truck, Plus, Edit3, Trash2, History } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AdminCard, AdminModal, ConfirmDialog, LoadingSkeleton, ToastBanner } from '../../components/admin/AdminUI';
import { apiRequest, ApiError } from '../../services/api';
import { formatINR } from '../../utils/priceCalculator';

export default function AdminSuppliers() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<{ supplier: any; purchases: any[] } | null>(null);

  const [form, setForm] = useState({
    supplierName: '',
    businessName: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    gstin: '',
    paymentTerms: 'Net 15 Days',
    notes: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ suppliers: any[] }>('/api/admin/suppliers');
      setSuppliers(res.suppliers || []);
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to load suppliers.',
      });
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
      supplierName: '',
      businessName: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      gstin: '',
      paymentTerms: 'Net 15 Days',
      notes: '',
    });
    setFormOpen(true);
  };

  const openEdit = (s: any) => {
    setEditingId(s.id);
    setForm({
      supplierName: s.supplierName || '',
      businessName: s.businessName || '',
      contactPerson: s.contactPerson || '',
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      gstin: s.gstin || '',
      paymentTerms: s.paymentTerms || 'Net 15 Days',
      notes: s.notes || '',
    });
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await apiRequest(`/api/admin/suppliers/${editingId}`, { method: 'PUT', body: form });
        setToast({ type: 'ok', text: 'Supplier updated.' });
      } else {
        await apiRequest('/api/admin/suppliers', { method: 'POST', body: form });
        setToast({ type: 'ok', text: 'Supplier added.' });
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Save failed.' });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiRequest(`/api/admin/suppliers/${deleteId}`, { method: 'DELETE' });
      setToast({ type: 'ok', text: 'Supplier removed.' });
      setDeleteId(null);
      await load();
    } catch (err) {
      setDeleteId(null);
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Cannot delete supplier.' });
    }
  };

  const viewHistory = async (supplier: any) => {
    try {
      const res = await apiRequest<{ purchases: any[] }>(`/api/admin/suppliers/${supplier.id}/history`);
      setHistoryData({ supplier, purchases: res.purchases || [] });
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to load supplier purchase history.',
      });
    }
  };

  return (
    <AdminLayout
      title="Dry Fruit Suppliers"
      subtitle="Manage growers, mandi traders, GSTIN records, payment terms, and outstanding payables."
      actions={
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#183D32] text-white cursor-pointer"
        >
          <Plus className="w-4 h-4 text-[#C8A96B]" />
          <span>Add Supplier</span>
        </button>
      }
    >
      <div className="space-y-5">
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

        <AdminCard>
          {loading ? (
            <LoadingSkeleton rows={4} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E9E4D9] text-[#888B83] uppercase text-[11px]">
                    <th className="py-3 pr-3">Supplier / Business</th>
                    <th className="py-3 pr-3">Contact</th>
                    <th className="py-3 pr-3">GSTIN</th>
                    <th className="py-3 pr-3">Terms</th>
                    <th className="py-3 pr-3">Total Volume</th>
                    <th className="py-3 pr-3">Outstanding</th>
                    <th className="py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E4D9]">
                  {suppliers.map(s => (
                    <tr key={s.id}>
                      <td className="py-3 pr-3">
                        <div className="font-semibold text-[#183D32]">{s.supplierName}</div>
                        <div className="text-[11px] text-[#888B83]">{s.businessName}</div>
                      </td>
                      <td className="py-3 pr-3">
                        <div>{s.contactPerson}</div>
                        <div className="text-[11px] text-[#888B83]">{s.phone}</div>
                      </td>
                      <td className="py-3 pr-3 font-mono text-[11px]">{s.gstin || '—'}</td>
                      <td className="py-3 pr-3">{s.paymentTerms}</td>
                      <td className="py-3 pr-3 font-semibold">{formatINR(s.totalVolume || 0)}</td>
                      <td className="py-3 pr-3 font-bold text-[#C65B50]">
                        {formatINR(s.outstandingBalance || 0)}
                      </td>
                      <td className="py-3 flex gap-1.5">
                        <button onClick={() => viewHistory(s)} className="p-1.5 rounded-lg hover:bg-[#F8F6F0] text-[#245746] cursor-pointer" title="Purchase History">
                          <History className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-[#F8F6F0] text-[#183D32] cursor-pointer" title="Edit">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteId(s.id)} className="p-1.5 rounded-lg hover:bg-[#FCECEB] text-[#C65B50] cursor-pointer" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>

        <AdminModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title={editingId ? 'Edit Supplier' : 'Add Dry Fruit Supplier'}
        >
          <form onSubmit={handleSave} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <input type="text" required value={form.supplierName} onChange={e => setForm({ ...form, supplierName: e.target.value })} placeholder="Supplier Name *" className="px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]" />
              <input type="text" value={form.businessName} onChange={e => setForm({ ...form, businessName: e.target.value })} placeholder="Business Name" className="px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]" />
              <input type="text" value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} placeholder="Contact Person" className="px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]" />
              <input type="tel" required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Phone *" className="px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]" />
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email" className="px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]" />
              <input type="text" value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value })} placeholder="GSTIN" className="px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]" />
            </div>
            <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Address" className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]" />
            <input type="text" value={form.paymentTerms} onChange={e => setForm({ ...form, paymentTerms: e.target.value })} placeholder="Payment Terms" className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]" />
            <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes" className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]" />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-xl border border-[#E9E4D9] cursor-pointer">Cancel</button>
              <button type="submit" className="px-5 py-2 rounded-xl bg-[#183D32] text-white font-semibold cursor-pointer">Save Supplier</button>
            </div>
          </form>
        </AdminModal>

        <AdminModal
          open={Boolean(historyData)}
          onClose={() => setHistoryData(null)}
          title={`Purchase History — ${historyData?.supplier?.supplierName || ''}`}
        >
          {historyData && (
            <div className="space-y-2 text-xs">
              {historyData.purchases.length === 0 ? (
                <p className="text-[#888B83]">No purchases recorded for this supplier yet.</p>
              ) : (
                historyData.purchases.map((p: any) => (
                  <div key={p.id} className="p-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] flex justify-between">
                    <span className="font-semibold">#{p.purchaseNumber}</span>
                    <span>{p.purchaseDate}</span>
                    <span className="capitalize">{p.paymentStatus}</span>
                    <span className="font-bold text-[#183D32]">{formatINR(p.totalAmount)}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </AdminModal>

        <ConfirmDialog
          open={Boolean(deleteId)}
          title="Delete Supplier"
          message="Remove this supplier from your vendor directory?"
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      </div>
    </AdminLayout>
  );
}

