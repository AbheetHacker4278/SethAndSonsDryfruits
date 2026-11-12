import { useEffect, useState } from 'react';
import { Users, Search, Download, Eye, Edit3 } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import {
  AdminCard,
  AdminModal,
  EmptyState,
  LoadingSkeleton,
  StatusBadge,
  ToastBanner,
} from '../../components/admin/AdminUI';
import { apiRequest, ApiError } from '../../services/api';
import { formatINR } from '../../utils/priceCalculator';

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<'all' | 'new' | 'returning' | 'vip' | 'inactive'>('all');
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [detail, setDetail] = useState<any | null>(null);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', tier: '', isActive: true, internalNotes: '' });

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ customers: any[] }>(
        `/api/admin/customers?search=${encodeURIComponent(search)}&segment=${segment}`
      );
      setCustomers(res.customers || []);
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to load customer directory.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [search, segment]);

  const openProfile = async (id: string) => {
    try {
      const res = await apiRequest<any>(`/api/admin/customers/${id}`);
      setDetail(res);
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to load customer profile.',
      });
    }
  };

  const openEdit = (c: any) => {
    setEditTarget(c);
    setEditForm({
      name: c.name,
      phone: c.phone || '',
      tier: c.tier || 'Privileged Patron',
      isActive: Boolean(c.isActive),
      internalNotes: c.internalNotes || '',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    try {
      await apiRequest(`/api/admin/customers/${editTarget.id}`, {
        method: 'PUT',
        body: editForm,
      });
      setEditTarget(null);
      setToast({ type: 'ok', text: 'Customer record updated.' });
      await load();
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Update failed.' });
    }
  };

  return (
    <AdminLayout
      title="Customer Directory & Segments"
      subtitle="Inspect customer lifetime value, orders, delivery addresses, and segment cohorts."
      actions={
        <a
          href="/api/admin/customers/export.csv"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#183D32] text-white"
        >
          <Download className="w-3.5 h-3.5 text-[#C8A96B]" />
          <span>Export CSV</span>
        </a>
      }
    >
      <div className="space-y-5">
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

        <AdminCard padding="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'all', label: 'All Patrons' },
                { id: 'new', label: 'New Customers' },
                { id: 'returning', label: 'Returning Customers' },
                { id: 'vip', label: 'VIP Customers' },
                { id: 'inactive', label: 'Inactive Customers' },
              ].map(s => (
                <button
                  key={s.id}
                  onClick={() => setSegment(s.id as any)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer border ${
                    segment === s.id
                      ? 'bg-[#183D32] text-white border-[#183D32]'
                      : 'bg-[#F8F6F0] text-[#5C6058] border-[#E9E4D9]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="relative sm:w-64">
              <Search className="w-4 h-4 text-[#888B83] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name, email, phone..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs"
              />
            </div>
          </div>
        </AdminCard>

        <AdminCard>
          {loading ? (
            <LoadingSkeleton rows={5} />
          ) : customers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No Customers Found"
              description="No customer records match the selected segment or search."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E9E4D9] text-[#888B83] uppercase text-[11px]">
                    <th className="py-3 pr-3">Customer</th>
                    <th className="py-3 pr-3">Email</th>
                    <th className="py-3 pr-3">Phone</th>
                    <th className="py-3 pr-3">Orders</th>
                    <th className="py-3 pr-3">Total Spending</th>
                    <th className="py-3 pr-3">Registered</th>
                    <th className="py-3 pr-3">Status</th>
                    <th className="py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E4D9]">
                  {customers.map(c => (
                    <tr key={c.id} className="hover:bg-[#F8F6F0]/60">
                      <td className="py-3 pr-3 font-semibold text-[#183D32]">{c.name}</td>
                      <td className="py-3 pr-3 text-[#5C6058]">{c.email}</td>
                      <td className="py-3 pr-3">{c.phone || '—'}</td>
                      <td className="py-3 pr-3 font-semibold">{c.totalOrders}</td>
                      <td className="py-3 pr-3 font-bold text-[#183D32]">{formatINR(c.totalSpent)}</td>
                      <td className="py-3 pr-3 text-[#888B83]">
                        {new Date(c.createdAt).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-3 pr-3">
                        <StatusBadge status={c.isActive ? 'active' : 'inactive'} />
                      </td>
                      <td className="py-3 flex gap-1.5">
                        <button
                          onClick={() => openProfile(c.id)}
                          className="p-1.5 rounded-lg hover:bg-[#E9E4D9]/60 text-[#245746] cursor-pointer"
                          title="View Profile"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openEdit(c)}
                          className="p-1.5 rounded-lg hover:bg-[#E9E4D9]/60 text-[#183D32] cursor-pointer"
                          title="Edit Customer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>

        {/* Customer Detail Modal */}
        <AdminModal
          open={Boolean(detail)}
          onClose={() => setDetail(null)}
          title={detail?.customer?.name || 'Customer Profile'}
          subtitle={detail?.customer?.email}
        >
          {detail && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]">
                  <div className="text-[#888B83]">Lifetime Spending</div>
                  <div className="text-lg font-bold text-[#183D32]">
                    {formatINR(detail.customer.lifetimeSpending)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]">
                  <div className="text-[#888B83]">Total Orders</div>
                  <div className="text-lg font-bold text-[#183D32]">{detail.orders.length}</div>
                </div>
                <div className="p-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]">
                  <div className="text-[#888B83]">Loyalty Points</div>
                  <div className="text-lg font-bold text-[#8F6C2B]">{detail.customer.loyaltyPoints}</div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-[#183D32] mb-1.5">Saved Addresses</h4>
                {detail.addresses.length === 0 ? (
                  <p className="text-[#888B83]">No saved addresses.</p>
                ) : (
                  detail.addresses.map((a: any) => (
                    <div key={a.id} className="p-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] mb-1.5">
                      <strong>{a.label}:</strong> {a.addressLine}, {a.city}, {a.state} - {a.pincode}
                    </div>
                  ))
                )}
              </div>

              <div>
                <h4 className="font-semibold text-[#183D32] mb-1.5">Order History</h4>
                {detail.orders.length === 0 ? (
                  <p className="text-[#888B83]">No orders placed.</p>
                ) : (
                  detail.orders.map((o: any) => (
                    <div key={o.id} className="flex justify-between py-2 border-b border-[#E9E4D9]">
                      <span className="font-semibold">#{o.orderNumber}</span>
                      <span>{new Date(o.createdAt).toLocaleDateString('en-IN')}</span>
                      <StatusBadge status={o.status} />
                      <span className="font-bold">{formatINR(o.totalAmount)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </AdminModal>

        {/* Edit Customer Modal */}
        <AdminModal
          open={Boolean(editTarget)}
          onClose={() => setEditTarget(null)}
          title={`Edit Customer: ${editTarget?.name || ''}`}
          maxWidth="max-w-md"
        >
          <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
            <input
              type="text"
              required
              value={editForm.name}
              onChange={e => setEditForm({ ...editForm, name: e.target.value })}
              placeholder="Name"
              className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
            />
            <input
              type="tel"
              value={editForm.phone}
              onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
              placeholder="Phone"
              className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
            />
            <input
              type="text"
              value={editForm.tier}
              onChange={e => setEditForm({ ...editForm, tier: e.target.value })}
              placeholder="Customer Tier"
              className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
            />
            <textarea
              rows={2}
              value={editForm.internalNotes}
              onChange={e => setEditForm({ ...editForm, internalNotes: e.target.value })}
              placeholder="Internal Notes"
              className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editForm.isActive}
                onChange={e => setEditForm({ ...editForm, isActive: e.target.checked })}
                className="accent-[#183D32]"
              />
              <span>Account Active</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditTarget(null)} className="px-4 py-2 rounded-xl border border-[#E9E4D9] cursor-pointer">Cancel</button>
              <button type="submit" className="px-5 py-2 rounded-xl bg-[#183D32] text-white font-semibold cursor-pointer">Save</button>
            </div>
          </form>
        </AdminModal>
      </div>
    </AdminLayout>
  );
}

