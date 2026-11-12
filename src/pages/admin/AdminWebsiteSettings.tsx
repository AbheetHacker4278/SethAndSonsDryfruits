import { useEffect, useState } from 'react';
import { Globe, Plus, Trash2, Save, Upload, Loader2 } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AdminCard, LoadingSkeleton, ToastBanner } from '../../components/admin/AdminUI';
import { useAuth } from '../../context/AuthContext';
import { apiRequest, ApiError, apiUpload } from '../../services/api';

interface WebsiteSettings {
  logoUrl: string;
  faviconUrl: string;
  brandName: string;
  tagline: string;
  heroBanners: string[];
  featuredProductIds: string[];
  promotionalSections: Array<{ title: string; subtitle: string; active: boolean }>;
  footerAbout: string;
  contactPhone: string;
  contactEmail: string;
  dispatchLocation: string;
  socialLinks: {
    instagram: string;
    facebook: string;
    whatsapp: string;
  };
  shippingInfo: string;
  returnPolicy: string;
  privacyPolicy: string;
  termsAndConditions: string;
}

export default function AdminWebsiteSettings() {
  const { refreshPublicSettings } = useAuth();
  const [settings, setSettings] = useState<WebsiteSettings | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<'logoUrl' | 'faviconUrl' | null>(null);
  const [newBanner, setNewBanner] = useState('');
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [webRes, prodRes] = await Promise.all([
        apiRequest<{ settings: WebsiteSettings }>('/api/admin/settings/website'),
        apiRequest<{ products: any[] }>('/api/admin/erp/products'),
      ]);
      const ws = webRes.settings;
      setSettings({
        ...ws,
        heroBanners: Array.isArray(ws.heroBanners) ? ws.heroBanners : [],
        featuredProductIds: Array.isArray(ws.featuredProductIds) ? ws.featuredProductIds : [],
        promotionalSections: Array.isArray(ws.promotionalSections) ? ws.promotionalSections : [],
        socialLinks: {
          instagram: ws.socialLinks?.instagram || '',
          facebook: ws.socialLinks?.facebook || '',
          whatsapp: ws.socialLinks?.whatsapp || '',
        },
      });
      setProducts(prodRes.products || []);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Unable to load website settings.';
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
      const res = await apiRequest<{ settings: WebsiteSettings; message?: string }>('/api/admin/settings/website', {
        method: 'PUT',
        body: settings,
      });
      setSettings(res.settings);
      await refreshPublicSettings();
      setToast({ type: 'ok', text: res.message || 'Storefront website settings saved.' });
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  const handleUploadAsset = async (
    field: 'logoUrl' | 'faviconUrl',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !settings) return;
    const fd = new FormData();
    fd.append('image', file);
    setUploadingField(field);
    try {
      const res = await apiUpload<{ imageUrl: string }>('/api/admin/products/upload-image', fd);
      setSettings(prev => (prev ? { ...prev, [field]: res.imageUrl } : prev));
      setToast({ type: 'ok', text: 'Brand asset uploaded. Click Save Website Settings to publish.' });
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Upload failed.' });
    } finally {
      setUploadingField(null);
    }
  };

  return (
    <AdminLayout
      title="Website & Storefront Settings"
      subtitle="Control storefront branding, hero banners, featured collections, contact details, social links, and store policies."
    >
      <div className="space-y-6">
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

        {loading ? (
          <LoadingSkeleton rows={6} />
        ) : !settings ? (
          <AdminCard className="text-center py-10 space-y-3">
            <p className="text-sm text-[#5C6058]">{loadError || 'Unable to load website settings.'}</p>
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
            {/* Brand & Identity */}
            <AdminCard className="space-y-4">
              <div className="flex items-center gap-2 text-[#183D32]">
                <Globe className="w-5 h-5 text-[#C8A96B]" />
                <h2 className="font-admin-serif text-xl font-semibold">Brand Identity &amp; Assets</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-[#252923] mb-1">Brand Display Name</label>
                  <input
                    value={settings.brandName}
                    onChange={e => setSettings({ ...settings, brandName: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#252923] mb-1">Heritage Tagline</label>
                  <input
                    value={settings.tagline}
                    onChange={e => setSettings({ ...settings, tagline: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                  />
                </div>

                <div>
                  <label className="block font-medium text-[#252923] mb-1">Logo URL</label>
                  <div className="flex gap-2 items-center">
                    {settings.logoUrl && (
                      <img
                        src={settings.logoUrl}
                        alt="Logo preview"
                        className="w-10 h-10 rounded-lg object-contain bg-[#150d09] border border-[#E9E4D9] p-1 shrink-0"
                      />
                    )}
                    <input
                      value={settings.logoUrl}
                      onChange={e => setSettings({ ...settings, logoUrl: e.target.value })}
                      className="flex-1 px-3 py-2 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                    />
                    <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FAF3E3] border border-[#E8D5A7] text-[#8F6C2B] cursor-pointer shrink-0">
                      {uploadingField === 'logoUrl' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>{uploadingField === 'logoUrl' ? 'Uploading...' : 'Upload'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingField !== null}
                        className="hidden"
                        onChange={e => void handleUploadAsset('logoUrl', e)}
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-[#252923] mb-1">Favicon URL</label>
                  <div className="flex gap-2 items-center">
                    {settings.faviconUrl && (
                      <img
                        src={settings.faviconUrl}
                        alt="Favicon preview"
                        className="w-10 h-10 rounded-lg object-contain bg-[#150d09] border border-[#E9E4D9] p-1 shrink-0"
                      />
                    )}
                    <input
                      value={settings.faviconUrl}
                      onChange={e => setSettings({ ...settings, faviconUrl: e.target.value })}
                      className="flex-1 px-3 py-2 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                    />
                    <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FAF3E3] border border-[#E8D5A7] text-[#8F6C2B] cursor-pointer shrink-0">
                      {uploadingField === 'faviconUrl' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>{uploadingField === 'faviconUrl' ? 'Uploading...' : 'Upload'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingField !== null}
                        className="hidden"
                        onChange={e => void handleUploadAsset('faviconUrl', e)}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#252923] mb-1">Footer Heritage Bio</label>
                <textarea
                  rows={2}
                  value={settings.footerAbout}
                  onChange={e => setSettings({ ...settings, footerAbout: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                />
              </div>
            </AdminCard>

            {/* Hero Banners & Featured Products */}
            <AdminCard className="space-y-4">
              <h2 className="font-admin-serif text-xl font-semibold text-[#183D32]">
                Hero Media &amp; Featured Harvests
              </h2>

              <div className="space-y-2">
                <label className="block font-medium text-[#252923]">Hero Banner / Video URLs</label>
                {settings.heroBanners.map((b, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      value={b}
                      onChange={e => {
                        const next = [...settings.heroBanners];
                        next[idx] = e.target.value;
                        setSettings({ ...settings, heroBanners: next });
                      }}
                      className="flex-1 px-3 py-2 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          heroBanners: settings.heroBanners.filter((_, i) => i !== idx),
                        })
                      }
                      className="p-2 rounded-xl text-[#C65B50] hover:bg-[#FCECEB] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <input
                    value={newBanner}
                    onChange={e => setNewBanner(e.target.value)}
                    placeholder="Add banner image or MP4 asset path..."
                    className="flex-1 px-3 py-2 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newBanner.trim()) return;
                      setSettings({
                        ...settings,
                        heroBanners: [...settings.heroBanners, newBanner.trim()],
                      });
                      setNewBanner('');
                    }}
                    className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-[#FAF3E3] text-[#8F6C2B] border border-[#E8D5A7] font-medium cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Banner</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#252923] mb-1.5">Featured Storefront Products</label>
                <div className="flex flex-wrap gap-2">
                  {products.map(p => {
                    const checked = settings.featuredProductIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setSettings({
                            ...settings,
                            featuredProductIds: checked
                              ? settings.featuredProductIds.filter(x => x !== p.id)
                              : [...settings.featuredProductIds, p.id],
                          })
                        }
                        className={`px-3 py-1.5 rounded-full border cursor-pointer font-medium ${
                          checked
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
            </AdminCard>

            {/* Promotional Sections */}
            <AdminCard className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-admin-serif text-xl font-semibold text-[#183D32]">
                  Promotional Callout Sections
                </h2>
                <button
                  type="button"
                  onClick={() =>
                    setSettings({
                      ...settings,
                      promotionalSections: [
                        ...settings.promotionalSections,
                        { title: '', subtitle: '', active: true },
                      ],
                    })
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#FAF3E3] text-[#8F6C2B] border border-[#E8D5A7] font-medium cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Section</span>
                </button>
              </div>
              {settings.promotionalSections.map((sec, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      value={sec.title}
                      onChange={e => {
                        const next = [...settings.promotionalSections];
                        next[idx] = { ...sec, title: e.target.value };
                        setSettings({ ...settings, promotionalSections: next });
                      }}
                      placeholder="Section heading"
                      className="flex-1 px-3 py-2 rounded-lg border border-[#E9E4D9] bg-white font-semibold"
                    />
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sec.active}
                        onChange={e => {
                          const next = [...settings.promotionalSections];
                          next[idx] = { ...sec, active: e.target.checked };
                          setSettings({ ...settings, promotionalSections: next });
                        }}
                        className="accent-[#183D32]"
                      />
                      <span>Active</span>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          promotionalSections: settings.promotionalSections.filter((_, i) => i !== idx),
                        })
                      }
                      className="p-1.5 text-[#C65B50] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    value={sec.subtitle}
                    onChange={e => {
                      const next = [...settings.promotionalSections];
                      next[idx] = { ...sec, subtitle: e.target.value };
                      setSettings({ ...settings, promotionalSections: next });
                    }}
                    placeholder="Section subtitle / copy"
                    className="w-full px-3 py-2 rounded-lg border border-[#E9E4D9] bg-white"
                  />
                </div>
              ))}
            </AdminCard>

            {/* Contact, Social & Policies */}
            <AdminCard className="space-y-4">
              <h2 className="font-admin-serif text-xl font-semibold text-[#183D32]">
                Contact, Social Channels &amp; Legal Policies
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-[#252923] mb-1">Concierge Phone</label>
                  <input
                    value={settings.contactPhone}
                    onChange={e => setSettings({ ...settings, contactPhone: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#252923] mb-1">Support Email</label>
                  <input
                    value={settings.contactEmail}
                    onChange={e => setSettings({ ...settings, contactEmail: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#252923] mb-1">Dispatch Location</label>
                  <input
                    value={settings.dispatchLocation}
                    onChange={e => setSettings({ ...settings, dispatchLocation: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                  />
                </div>

                <div>
                  <label className="block font-medium text-[#252923] mb-1">Instagram URL</label>
                  <input
                    value={settings.socialLinks.instagram}
                    onChange={e =>
                      setSettings({
                        ...settings,
                        socialLinks: { ...settings.socialLinks, instagram: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#252923] mb-1">Facebook URL</label>
                  <input
                    value={settings.socialLinks.facebook}
                    onChange={e =>
                      setSettings({
                        ...settings,
                        socialLinks: { ...settings.socialLinks, facebook: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#252923] mb-1">WhatsApp Number</label>
                  <input
                    value={settings.socialLinks.whatsapp}
                    onChange={e =>
                      setSettings({
                        ...settings,
                        socialLinks: { ...settings.socialLinks, whatsapp: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-[#252923] mb-1">Shipping Information</label>
                  <textarea
                    rows={3}
                    value={settings.shippingInfo}
                    onChange={e => setSettings({ ...settings, shippingInfo: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#252923] mb-1">Return &amp; Refund Policy</label>
                  <textarea
                    rows={3}
                    value={settings.returnPolicy}
                    onChange={e => setSettings({ ...settings, returnPolicy: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#252923] mb-1">Privacy Policy</label>
                  <textarea
                    rows={3}
                    value={settings.privacyPolicy}
                    onChange={e => setSettings({ ...settings, privacyPolicy: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#252923] mb-1">Terms &amp; Conditions</label>
                  <textarea
                    rows={3}
                    value={settings.termsAndConditions}
                    onChange={e => setSettings({ ...settings, termsAndConditions: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
                  />
                </div>
              </div>
            </AdminCard>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#183D32] hover:bg-[#245746] text-white font-semibold disabled:opacity-60 cursor-pointer"
              >
                <Save className="w-4 h-4 text-[#C8A96B]" />
                <span>{saving ? 'Saving...' : 'Save Website Settings'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </AdminLayout>
  );
}
