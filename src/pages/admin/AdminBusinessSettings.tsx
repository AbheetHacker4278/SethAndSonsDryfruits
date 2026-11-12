import { useEffect, useState } from 'react';
import { Building2, Save, Bell, Receipt } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AdminCard, LoadingSkeleton, ToastBanner } from '../../components/admin/AdminUI';
import { useAuth } from '../../context/AuthContext';
import { apiRequest, ApiError } from '../../services/api';

interface BusinessSettings {
  businessName: string;
  businessAddress: string;
  gstin: string;
  contactNumber: string;
  businessEmail: string;
  currency: string;
  defaultGstRate: number;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  defaultShippingCharge: number;
  freeShippingThreshold: number;
  notificationPreferences: {
    lowStockAlerts: boolean;
    newOrderAlerts: boolean;
    expiryAlerts: boolean;
    supplierPaymentAlerts: boolean;
  };
}

export default function AdminBusinessSettings() {
  const { refreshPublicSettings } = useAuth();
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiRequest<{ settings: BusinessSettings }>('/api/admin/settings/business');
      setSettings(res.settings);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Unable to load business settings.';
      setLoadError(msg);
      setToast({ type: 'err', text: msg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setToast(null);
    try {
      const payload: BusinessSettings = {
        ...settings,
        defaultGstRate: Number.isFinite(Number(settings.defaultGstRate)) ? Number(settings.defaultGstRate) : 0,
        nextInvoiceNumber: Number.isFinite(Number(settings.nextInvoiceNumber))
          ? Math.max(1, Math.round(Number(settings.nextInvoiceNumber)))
          : 1001,
        defaultShippingCharge: Number.isFinite(Number(settings.defaultShippingCharge))
          ? Math.max(0, Number(settings.defaultShippingCharge))
          : 0,
        freeShippingThreshold: Number.isFinite(Number(settings.freeShippingThreshold))
          ? Math.max(0, Number(settings.freeShippingThreshold))
          : 0,
      };
      const res = await apiRequest<{ settings: BusinessSettings; message?: string }>('/api/admin/settings/business', {
        method: 'PUT',
        body: payload,
      });
      setSettings(res.settings);
      await refreshPublicSettings();
      setToast({ type: 'ok', text: res.message || 'Business & GST rules saved.' });
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout
      title="Business, Tax & Invoice Settings"
      subtitle="Configure registered entity details, GSTIN, default shipping threshold, invoice prefixes, and operational alerts."
    >
      <div className="space-y-6">
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

        {loading ? (
          <LoadingSkeleton rows={5} />
        ) : !settings ? (
          <AdminCard className="text-center py-10 space-y-3">
            <p className="text-sm text-[#5C6058]">{loadError || 'Unable to load business settings.'}</p>
            <button
              type="button"
              onClick={() => void loadSettings()}
              className="px-4 py-2 rounded-xl bg-[#183D32] text-white text-xs font-semibold cursor-pointer hover:bg-[#245746]"
            >
              Retry
            </button>
          </AdminCard>
        ) : (
          <form onSubmit={handleSave} className="space-y-6 text-xs">
            <AdminCard className="space-y-4">
              <div className="flex items-center gap-2 text-[#183D32]">
                <Building2 className="w-5 h-5 text-[#C8A96B]" />
                <h2 className="font-admin-serif text-xl font-semibold">Registered Entity &amp; GSTIN</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-[#252923] mb-1">Registered Business Name</label>
                  <input
                    required
                    value={settings.businessName}
                    onChange={e => setSettings({ ...settings, businessName: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#252923] mb-1">GSTIN</label>
                  <input
                    value={settings.gstin}
                    onChange={e => setSettings({ ...settings, gstin: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#252923] mb-1">Official Phone</label>
                  <input
                    value={settings.contactNumber}
                    onChange={e => setSettings({ ...settings, contactNumber: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#252923] mb-1">Billing Email</label>
                  <input
                    type="email"
                    value={settings.businessEmail}
                    onChange={e => setSettings({ ...settings, businessEmail: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#252923] mb-1">Registered Business Address</label>
                <textarea
                  rows={2}
                  value={settings.businessAddress}
                  onChange={e => setSettings({ ...settings, businessAddress: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                />
              </div>
            </AdminCard>

            <AdminCard className="space-y-4">
              <div className="flex items-center gap-2 text-[#183D32]">
                <Receipt className="w-5 h-5 text-[#C8A96B]" />
                <h2 className="font-admin-serif text-xl font-semibold">Tax, Shipping &amp; Invoicing Rules</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-[#252923] mb-1">Currency Display</label>
                  <input
                    value={settings.currency}
                    onChange={e => setSettings({ ...settings, currency: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#252923] mb-1">Default GST Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="28"
                    value={settings.defaultGstRate}
                    onChange={e => setSettings({ ...settings, defaultGstRate: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#252923] mb-1">Invoice Prefix</label>
                  <input
                    value={settings.invoicePrefix}
                    onChange={e => setSettings({ ...settings, invoicePrefix: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#252923] mb-1">Next Invoice Sequence #</label>
                  <input
                    type="number"
                    min="1"
                    value={settings.nextInvoiceNumber}
                    onChange={e => setSettings({ ...settings, nextInvoiceNumber: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#252923] mb-1">Standard Shipping Fee (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={settings.defaultShippingCharge}
                    onChange={e => setSettings({ ...settings, defaultShippingCharge: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#252923] mb-1">Complimentary Shipping Threshold (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={settings.freeShippingThreshold}
                    onChange={e => setSettings({ ...settings, freeShippingThreshold: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                  />
                </div>
              </div>
            </AdminCard>

            <AdminCard className="space-y-4">
              <div className="flex items-center gap-2 text-[#183D32]">
                <Bell className="w-5 h-5 text-[#C8A96B]" />
                <h2 className="font-admin-serif text-xl font-semibold">Admin Alert Preferences</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { key: 'lowStockAlerts', label: 'Low Stock & Out-of-Stock Warehouse Alerts' },
                  { key: 'newOrderAlerts', label: 'New Customer Order Alerts' },
                  { key: 'expiryAlerts', label: 'Inventory Batch Near-Expiry Alerts' },
                  { key: 'supplierPaymentAlerts', label: 'Supplier Payable Due Reminders' },
                ].map(item => (
                  <label
                    key={item.key}
                    className="flex items-center gap-3 p-3.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] cursor-pointer font-medium text-[#252923]"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean((settings.notificationPreferences as any)[item.key])}
                      onChange={e =>
                        setSettings({
                          ...settings,
                          notificationPreferences: {
                            ...settings.notificationPreferences,
                            [item.key]: e.target.checked,
                          },
                        })
                      }
                      className="accent-[#183D32] w-4 h-4"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </AdminCard>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#183D32] hover:bg-[#245746] text-white font-semibold disabled:opacity-60 cursor-pointer"
              >
                <Save className="w-4 h-4 text-[#C8A96B]" />
                <span>{saving ? 'Saving...' : 'Save Business Settings'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </AdminLayout>
  );
}

