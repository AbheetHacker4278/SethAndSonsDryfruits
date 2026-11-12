import { useEffect, useState } from 'react';
import { FolderTree, Plus, Edit3, Trash2 } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AdminCard, ConfirmDialog, LoadingSkeleton, StatusBadge, ToastBanner } from '../../components/admin/AdminUI';
import { apiRequest, ApiError } from '../../services/api';

export default function AdminCategories() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [storefrontGroup, setStorefrontGroup] = useState<'nuts' | 'saffron' | 'dried-fruits'>('nuts');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ categories: any[] }>('/api/admin/categories');
      setCategories(res.categories || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setToast(null);
    try {
      if (editingId) {
        await apiRequest(`/api/admin/categories/${editingId}`, {
          method: 'PUT',
          body: { name, description, storefrontGroup, active: true },
        });
        setToast({ type: 'ok', text: 'Category updated.' });
      } else {
        await apiRequest('/api/admin/categories', {
          method: 'POST',
          body: { name, description, storefrontGroup },
        });
        setToast({ type: 'ok', text: 'Category added.' });
      }
      setName('');
      setDescription('');
      setEditingId(null);
      await load();
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Failed to save category.' });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiRequest(`/api/admin/categories/${deleteId}`, { method: 'DELETE' });
      setDeleteId(null);
      setToast({ type: 'ok', text: 'Category deleted.' });
      await load();
    } catch (err) {
      setDeleteId(null);
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Failed to delete category.',
      });
    }
  };

  return (
    <AdminLayout
      title="Dry Fruit Categories"
      subtitle="Organize your catalog across Almonds, Cashews, Pistachios, Walnuts, Raisins, Dates, Figs, Seeds, Mixes & Hampers."
    >
      <div className="space-y-6">
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <AdminCard className="lg:col-span-4 h-fit">
            <h2 className="font-admin-serif text-xl font-semibold text-[#183D32] mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#C8A96B]" />
              <span>{editingId ? 'Edit Category' : 'Add Category'}</span>
            </h2>
            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Category Name (e.g. Dates (Khajoor))"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
              />
              <select
                value={storefrontGroup}
                onChange={e => setStorefrontGroup(e.target.value as any)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
              >
                <option value="nuts">Storefront Group: Himalayan Nuts</option>
                <option value="dried-fruits">Storefront Group: Sun-Dried Fruits</option>
                <option value="saffron">Storefront Group: Saffron &amp; Reserves</option>
              </select>
              <textarea
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Description"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#183D32] hover:bg-[#245746] text-white font-semibold cursor-pointer"
                >
                  {editingId ? 'Save Changes' : 'Create Category'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setName('');
                      setDescription('');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </AdminCard>

          <AdminCard className="lg:col-span-8">
            <div className="flex items-center gap-2 mb-4">
              <FolderTree className="w-4 h-4 text-[#245746]" />
              <h2 className="font-admin-serif text-xl font-semibold text-[#183D32]">
                All Categories ({categories.length})
              </h2>
            </div>

            {loading ? (
              <LoadingSkeleton rows={5} />
            ) : (
              <div className="divide-y divide-[#E9E4D9] text-xs">
                {categories.map(cat => (
                  <div key={cat.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-sm text-[#183D32]">{cat.name}</div>
                      <div className="text-[#888B83]">{cat.description || 'No description'}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-1 rounded-full bg-[#F8F6F0] border border-[#E9E4D9] text-[#5C6058]">
                        {cat.productCount || 0} products
                      </span>
                      <StatusBadge status={cat.active ? 'active' : 'draft'} />
                      <button
                        onClick={() => {
                          setEditingId(cat.id);
                          setName(cat.name);
                          setDescription(cat.description || '');
                          setStorefrontGroup(cat.storefrontGroup || 'nuts');
                        }}
                        className="p-1.5 rounded-lg hover:bg-[#F8F6F0] text-[#183D32] cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteId(cat.id)}
                        className="p-1.5 rounded-lg hover:bg-[#FCECEB] text-[#C65B50] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AdminCard>
        </div>

        <ConfirmDialog
          open={Boolean(deleteId)}
          title="Delete Category"
          message="Products in this category will move to Other Products. Continue?"
          confirmLabel="Delete Category"
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      </div>
    </AdminLayout>
  );
}

