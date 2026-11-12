import { useEffect, useState } from 'react';
import { UserCog, Plus, Edit3, Trash2, ShieldCheck } from 'lucide-react';
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
import { useAuth } from '../../context/AuthContext';
import { apiRequest, ApiError } from '../../services/api';

const PRESETS: Record<string, string[]> = {
  'Order Fulfillment': ['dashboard', 'orders', 'customers', 'inventory'],
  'Inventory & Purchasing': ['dashboard', 'products', 'categories', 'inventory', 'suppliers', 'purchases'],
  'Finance & Reports': ['dashboard', 'sales', 'expenses', 'reports', 'purchases'],
  'Marketing & Comms': ['dashboard', 'coupons', 'marketing', 'communications', 'customers'],
};

export default function AdminStaff() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<any[]>([]);
  const [allPermissions, setAllPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    adminRole: 'staff' as 'super_admin' | 'staff',
    permissions: ['dashboard', 'orders'] as string[],
    isActive: true,
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ allPermissions: string[]; staff: any[] }>('/api/admin/staff');
      setAllPermissions(res.allPermissions || []);
      setStaff(res.staff || []);
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to load staff accounts.',
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
      name: '',
      email: '',
      phone: '',
      password: '',
      adminRole: 'staff',
      permissions: ['dashboard', 'orders'],
      isActive: true,
    });
    setModalOpen(true);
  };

  const openEdit = (member: any) => {
    setEditingId(member.id);
    setForm({
      name: member.name || '',
      email: member.email || '',
      phone: member.phone || '',
      password: '',
      adminRole: member.adminRole === 'super_admin' ? 'super_admin' : 'staff',
      permissions: Array.isArray(member.permissions) ? member.permissions : [],
      isActive: Boolean(member.isActive),
    });
    setModalOpen(true);
  };

  const togglePerm = (perm: string) => {
    setForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm],
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const effectivePermissions = form.adminRole === 'super_admin' ? allPermissions : form.permissions;
      if (editingId) {
        const body: Record<string, any> = {
          name: form.name.trim(),
          phone: form.phone.trim(),
          adminRole: form.adminRole,
          permissions: effectivePermissions,
          isActive: form.isActive,
        };
        if (form.password.trim()) {
          body.password = form.password;
        }
        await apiRequest(`/api/admin/staff/${editingId}`, { method: 'PUT', body });
        setToast({ type: 'ok', text: 'Staff member permissions & status updated.' });
      } else {
        await apiRequest('/api/admin/staff', {
          method: 'POST',
          body: {
            name: form.name.trim(),
            email: form.email.trim().toLowerCase(),
            phone: form.phone.trim(),
            password: form.password,
            adminRole: form.adminRole,
            permissions: effectivePermissions,
          },
        });
        setToast({ type: 'ok', text: 'New admin/staff account created.' });
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to save staff account.',
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/admin/staff/${deleteTarget.id}`, { method: 'DELETE' });
      setToast({ type: 'ok', text: `Staff account "${deleteTarget.name}" removed.` });
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setDeleteTarget(null);
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Could not delete account.' });
    }
  };

  return (
    <AdminLayout
      title="Staff & Access Control (RBAC)"
      subtitle="Manage Super Admins and module-scoped Staff operators with least-privilege permissions."
      actions={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#183D32] text-white text-xs font-semibold hover:bg-[#245746] cursor-pointer"
        >
          <Plus className="w-4 h-4 text-[#C8A96B]" />
          <span>Invite Staff Member</span>
        </button>
      }
    >
      <div className="space-y-6">
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

        <AdminCard>
          {loading ? (
            <LoadingSkeleton rows={4} />
          ) : staff.length === 0 ? (
            <EmptyState
              icon={UserCog}
              title="No staff users configured"
              description="Create dedicated staff logins with restricted permissions for orders, warehouse inventory, or marketing."
              action={
                <button
                  type="button"
                  onClick={openCreate}
                  className="px-4 py-2 rounded-xl bg-[#183D32] text-white text-xs font-semibold cursor-pointer"
                >
                  Create Staff Account
                </button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-[#E9E4D9] text-[#888B83]">
                    <th className="py-3 px-2 font-medium">Staff Member</th>
                    <th className="py-3 px-2 font-medium">Role</th>
                    <th className="py-3 px-2 font-medium">Module Permissions</th>
                    <th className="py-3 px-2 font-medium">Status</th>
                    <th className="py-3 px-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E4D9]">
                  {staff.map(member => {
                    const isSelf = member.id === user?.id;
                    return (
                      <tr key={member.id} className="hover:bg-[#F8F6F0]/60">
                        <td className="py-3.5 px-2">
                          <div className="font-semibold text-[#183D32] flex items-center gap-1.5">
                            <span>{member.name}</span>
                            {isSelf && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FAF3E3] text-[#8F6C2B] border border-[#E8D5A7]">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#888B83]">
                            {member.email} {member.phone ? `• ${member.phone}` : ''}
                          </div>
                        </td>
                        <td className="py-3.5 px-2">
                          <StatusBadge
                            status={member.adminRole === 'super_admin' ? 'Super Admin' : 'Staff'}
                            tone={member.adminRole === 'super_admin' ? 'gold' : 'blue'}
                          />
                        </td>
                        <td className="py-3.5 px-2">
                          {member.adminRole === 'super_admin' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#245746]">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              Full System Access ({allPermissions.length} modules)
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1 max-w-md">
                              {(member.permissions || []).map((p: string) => (
                                <span
                                  key={p}
                                  className="px-2 py-0.5 rounded-md bg-[#F8F6F0] border border-[#E9E4D9] text-[10px] capitalize text-[#252923]"
                                >
                                  {p}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-2">
                          <StatusBadge
                            status={member.isActive ? 'active' : 'inactive'}
                            tone={member.isActive ? 'emerald' : 'red'}
                          />
                        </td>
                        <td className="py-3.5 px-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(member)}
                              className="p-1.5 rounded-lg text-[#245746] hover:bg-[#E7F3EE] cursor-pointer"
                              title="Edit staff"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {!isSelf && (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(member)}
                                className="p-1.5 rounded-lg text-[#C65B50] hover:bg-[#FCECEB] cursor-pointer"
                                title="Delete staff"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      </div>

      {/* Add / Edit Staff Modal */}
      <AdminModal
        open={modalOpen}
        title={editingId ? `Update Staff: ${form.name}` : 'Create Admin / Staff Account'}
        subtitle="Admin & staff accounts sign in via passwordless Email OTP at localhost:8000; permissions are enforced per API request."
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-[#252923] mb-1">Full Name *</label>
              <input
                required
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Arjun Mehta"
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#252923] mb-1">Email Address *</label>
              <input
                type="email"
                required={!editingId}
                disabled={Boolean(editingId)}
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="arjun@asuleshseth.com"
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] disabled:opacity-60 focus:outline-none focus:border-[#183D32]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#252923] mb-1">Mobile Number</label>
              <input
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="9876543210"
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#252923] mb-1">
                Sign-In Method
              </label>
              <div className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#FAF3E3] text-[#183D32] font-medium">
                Email OTP Verification (6-digit code)
              </div>
            </div>

            <div>
              <label className="block font-medium text-[#252923] mb-1">Admin Role</label>
              <select
                value={form.adminRole}
                onChange={e => setForm({ ...form, adminRole: e.target.value as 'super_admin' | 'staff' })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
              >
                <option value="staff">Staff (Scoped Permissions)</option>
                <option value="super_admin">Super Admin (Full Control)</option>
              </select>
            </div>

            {editingId && (
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-[#183D32]">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={e => setForm({ ...form, isActive: e.target.checked })}
                    className="accent-[#183D32] w-4 h-4"
                  />
                  <span>Account Active (Can Sign In)</span>
                </label>
              </div>
            )}
          </div>

          {form.adminRole === 'staff' && (
            <div className="p-4 rounded-2xl bg-[#F8F6F0] border border-[#E9E4D9] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[#183D32]">Module Permissions</span>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(PRESETS).map(([label, perms]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, permissions: perms }))}
                      className="px-2 py-1 rounded-lg bg-white border border-[#E9E4D9] text-[10px] font-medium text-[#245746] hover:border-[#183D32] cursor-pointer"
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, permissions: allPermissions }))}
                    className="px-2 py-1 rounded-lg bg-white border border-[#E9E4D9] text-[10px] font-medium text-[#8F6C2B] cursor-pointer"
                  >
                    All
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {allPermissions.map(perm => (
                  <label
                    key={perm}
                    className="flex items-center gap-2 p-2 rounded-xl bg-white border border-[#E9E4D9] cursor-pointer capitalize"
                  >
                    <input
                      type="checkbox"
                      checked={form.permissions.includes(perm)}
                      onChange={() => togglePerm(perm)}
                      className="accent-[#183D32]"
                    />
                    <span>{perm}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

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
              {editingId ? 'Save Staff Account' : 'Create Staff Account'}
            </button>
          </div>
        </form>
      </AdminModal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Staff Account?"
        message={
          deleteTarget
            ? `Remove admin access for ${deleteTarget.name} (${deleteTarget.email})? Active sessions will be revoked immediately.`
            : ''
        }
        confirmLabel="Remove Access"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </AdminLayout>
  );
}

