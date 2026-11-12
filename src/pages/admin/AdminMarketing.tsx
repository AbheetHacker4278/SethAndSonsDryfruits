import { useEffect, useState } from 'react';
import {
  Megaphone,
  Plus,
  Send,
  Calendar,
  Upload,
  CheckCircle2,
  AlertCircle,
  Users,
  XCircle,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AdminCard, ConfirmDialog, StatusBadge } from '../../components/admin/AdminUI';
import { useAuth } from '../../context/AuthContext';
import { apiRequest, ApiError, apiUpload, MarketingCampaignItem } from '../../services/api';

const FESTIVALS = [
  'Diwali',
  'Raksha Bandhan',
  'Holi',
  'Navratri',
  'Dussehra',
  'Eid',
  'Christmas',
  'New Year',
  'Makar Sankranti',
  'Other Special Occasions',
];

export default function AdminMarketing() {
  const { products, refreshProducts } = useAuth();
  const [tab, setTab] = useState<'campaigns' | 'products' | 'segments'>('campaigns');
  const [campaigns, setCampaigns] = useState<MarketingCampaignItem[]>([]);
  const [segments, setSegments] = useState<Array<{ id: string; label: string; count: number }>>([]);
  const [segmentCat, setSegmentCat] = useState<'nuts' | 'saffron' | 'dried-fruits'>('nuts');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string; previewUrl?: string | null } | null>(null);

  // Campaign Builder Form
  const [campaignName, setCampaignName] = useState('');
  const [campaignType, setCampaignType] = useState<'festival' | 'promotional'>('festival');
  const [festivalName, setFestivalName] = useState('Diwali');
  const [subject, setSubject] = useState('Celebrate Diwali with Premium Dry Fruits – Special Festive Offers Inside!');
  const [bannerImage, setBannerImage] = useState('');
  const [content, setContent] = useState(
    '<p>Share the richness of authentic Jammu harvests with your loved ones this festive season.</p>'
  );
  const [discountPercentage, setDiscountPercentage] = useState('15');
  const [couponCode, setCouponCode] = useState('DIWALI15');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minOrderValue, setMinOrderValue] = useState('1500');
  const [maxDiscount, setMaxDiscount] = useState('750');
  const [ctaText, setCtaText] = useState('Shop Festive Hampers');
  const [targetSegment, setTargetSegment] = useState('all_opted_in');
  const [applicableProducts, setApplicableProducts] = useState<string[]>(['badam', 'kesar']);
  const [testEmailAddr, setTestEmailAddr] = useState('');

  // Confirm Bulk Send Modal
  const [confirmSendCampaign, setConfirmSendCampaign] = useState<MarketingCampaignItem | null>(null);
  const [scheduleInputMap, setScheduleInputMap] = useState<Record<string, string>>({});

  // New Product Form
  const [prodName, setProdName] = useState('');
  const [prodSubtitle, setProdSubtitle] = useState('');
  const [prodCategory, setProdCategory] = useState<'nuts' | 'saffron' | 'dried-fruits'>('nuts');
  const [prodPrice, setProdPrice] = useState('');
  const [prodUnit, setProdUnit] = useState<'kg' | 'gram'>('kg');
  const [prodImage, setProdImage] = useState('/assets/aistudio/00c7c9248fdf2e9e3c775c5368483218_ceac05b8.jpg');
  const [prodDesc, setProdDesc] = useState('');
  const [prodVariants, setProdVariants] = useState('500g Gift Tin, 1kg Royal Reserve');
  const [prodFeatures, setProdFeatures] = useState('Direct Jammu Provenance, Zero Preservatives, Slow Sundried');
  const [publishAction, setPublishAction] = useState<'draft' | 'publish_only' | 'publish_and_send' | 'publish_and_schedule'>('publish_only');
  const [prodSegment, setProdSegment] = useState('all_opted_in');
  const [prodScheduledAt, setProdScheduledAt] = useState('');
  const [confirmProdSend, setConfirmProdSend] = useState(false);

  const loadData = async () => {
    try {
      const [cRes, sRes] = await Promise.all([
        apiRequest<{ campaigns: MarketingCampaignItem[] }>('/api/admin/marketing/campaigns'),
        apiRequest<{ segments: any[] }>(`/api/admin/marketing/segments?category=${segmentCat}`),
      ]);
      setCampaigns(cRes.campaigns);
      setSegments(sRes.segments);
    } catch {
      // handled
    }
  };

  useEffect(() => {
    void loadData();
  }, [segmentCat]);

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('banner', file);
    try {
      const res = await apiUpload<{ bannerImage: string }>('/api/admin/marketing/upload-banner', fd);
      setBannerImage(res.bannerImage);
      setFeedback({ type: 'ok', text: 'Campaign banner uploaded.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof ApiError ? err.message : 'Banner upload failed.' });
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiRequest<{ campaign: MarketingCampaignItem }>('/api/admin/marketing/campaigns', {
        method: 'POST',
        body: {
          campaignName: campaignName.trim(),
          campaignType,
          festivalName: campaignType === 'festival' ? festivalName : null,
          subject: subject.trim(),
          content,
          bannerImage: bannerImage || null,
          discountPercentage: discountPercentage ? Number(discountPercentage) : null,
          couponCode: couponCode.trim() || null,
          startDate: startDate || null,
          endDate: endDate || null,
          applicableProducts,
          minOrderValue: Number(minOrderValue || 0),
          maxDiscount: maxDiscount ? Number(maxDiscount) : null,
          ctaText: ctaText.trim() || 'Shop Royal Harvests',
          ctaUrl: '/catalog',
          targetSegment,
          segmentCategory: targetSegment === 'category_buyers' ? segmentCat : null,
        },
      });
      setCampaignName('');
      setFeedback({ type: 'ok', text: `Campaign "${res.campaign.campaignName}" saved as draft.` });
      await loadData();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof ApiError ? err.message : 'Failed to create campaign.' });
    }
  };

  const handleTestCampaign = async (campId: string) => {
    setFeedback(null);
    try {
      const res = await apiRequest<{ message: string; result?: { previewUrl?: string } }>(
        `/api/admin/marketing/campaigns/${campId}/test`,
        { method: 'POST', body: { recipient: testEmailAddr.trim() || undefined } }
      );
      setFeedback({ type: 'ok', text: res.message, previewUrl: res.result?.previewUrl || null });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof ApiError ? err.message : 'Test send failed.' });
    }
  };

  const handleConfirmedSendCampaign = async () => {
    if (!confirmSendCampaign) return;
    setFeedback(null);
    try {
      const res = await apiRequest<{ message: string }>(
        `/api/admin/marketing/campaigns/${confirmSendCampaign.id}/send`,
        { method: 'POST', body: { confirmed: true } }
      );
      setFeedback({ type: 'ok', text: res.message });
      setConfirmSendCampaign(null);
      await loadData();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof ApiError ? err.message : 'Send failed.' });
    }
  };

  const handleScheduleCampaign = async (campId: string) => {
    const dt = scheduleInputMap[campId];
    if (!dt) {
      setFeedback({ type: 'err', text: 'Select a schedule date & time first.' });
      return;
    }
    try {
      const res = await apiRequest<{ message: string }>(
        `/api/admin/marketing/campaigns/${campId}/schedule`,
        { method: 'POST', body: { scheduledAt: dt } }
      );
      setFeedback({ type: 'ok', text: res.message });
      await loadData();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof ApiError ? err.message : 'Scheduling failed.' });
    }
  };

  const handleCancelCampaign = async (campId: string) => {
    try {
      const res = await apiRequest<{ message: string }>(
        `/api/admin/marketing/campaigns/${campId}/cancel`,
        { method: 'POST' }
      );
      setFeedback({ type: 'ok', text: res.message });
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to cancel campaign.',
      });
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiRequest<{ message: string }>('/api/admin/products', {
        method: 'POST',
        body: {
          name: prodName.trim(),
          subtitle: prodSubtitle.trim() || 'Jammu Heritage Reserve',
          category: prodCategory,
          price: Number(prodPrice),
          unit: prodUnit,
          image: prodImage.trim(),
          description: prodDesc.trim(),
          variants: prodVariants,
          features: prodFeatures,
          publishAction,
          targetSegment: prodSegment,
          scheduledAt: prodScheduledAt || undefined,
          confirmCampaignSend: confirmProdSend,
        },
      });
      setProdName('');
      setProdPrice('');
      setProdDesc('');
      setConfirmProdSend(false);
      setFeedback({ type: 'ok', text: res.message });
      await refreshProducts();
      await loadData();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof ApiError ? err.message : 'Failed to create product.' });
    }
  };

  const activeSegmentCount = segments.find(s => s.id === targetSegment)?.count ?? 0;

  return (
    <AdminLayout
      title="Marketing Campaigns & New Harvest Releases"
      subtitle="Create festival sale campaigns, segment opted-in customers, and publish new Jammu harvests with explicit approval."
    >
      <div className="space-y-6">
        {feedback && (
          <div
            className={`p-4 rounded-xl text-xs sm:text-sm flex flex-wrap items-center justify-between gap-2 border ${
              feedback.type === 'ok'
                ? 'bg-[#E7F3EE] border-[#B7DEC9] text-[#183D32]'
                : 'bg-[#FCECEB] border-[#F2C3BE] text-[#9E3D33]'
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              {feedback.type === 'ok' ? <CheckCircle2 className="w-4 h-4 text-[#245746]" /> : <AlertCircle className="w-4 h-4 text-[#C65B50]" />}
              <span>{feedback.text}</span>
            </div>
            {feedback.previewUrl && (
              <a
                href={feedback.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-[#183D32] inline-flex items-center gap-1"
              >
                <span>Open Sandbox Email</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {[
            { id: 'campaigns', label: 'Festival & Promo Campaigns', icon: Megaphone },
            { id: 'products', label: 'Add & Launch Product', icon: Sparkles },
            { id: 'segments', label: 'Customer Segments', icon: Users },
          ].map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer border transition-colors ${
                  tab === t.id
                    ? 'bg-[#183D32] text-white border-[#183D32]'
                    : 'bg-white text-[#5C6058] border-[#E9E4D9] hover:text-[#183D32]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: CAMPAIGNS */}
        {tab === 'campaigns' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <AdminCard className="lg:col-span-6">
              <form onSubmit={handleCreateCampaign} className="space-y-4">
                <h2 className="font-admin-serif text-2xl font-semibold text-[#183D32] flex items-center gap-2">
                  <Plus className="w-5 h-5 text-[#C8A96B]" />
                  <span>Create Promotional / Festival Campaign</span>
                </h2>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium uppercase text-[#888B83] mb-1">Campaign Type</label>
                    <select
                      value={campaignType}
                      onChange={e => setCampaignType(e.target.value as any)}
                      className="w-full px-3 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
                    >
                      <option value="festival">Festival Sale Campaign</option>
                      <option value="promotional">Promotional Offer</option>
                    </select>
                  </div>

                  {campaignType === 'festival' && (
                    <div>
                      <label className="block text-[11px] font-medium uppercase text-[#888B83] mb-1">Festival Occasion</label>
                      <select
                        value={festivalName}
                        onChange={e => {
                          setFestivalName(e.target.value);
                          setSubject(`Celebrate ${e.target.value} with Premium Dry Fruits – Special Festive Offers Inside!`);
                        }}
                        className="w-full px-3 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
                      >
                        {FESTIVALS.map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase text-[#888B83] mb-1">Campaign Name *</label>
                  <input
                    type="text"
                    required
                    value={campaignName}
                    onChange={e => setCampaignName(e.target.value)}
                    placeholder="e.g. Diwali Royal Saffron & Badam Reserve"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase text-[#888B83] mb-1">Email Subject *</label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={bannerImage}
                    onChange={e => setBannerImage(e.target.value)}
                    placeholder="Banner image URL or upload →"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
                  />
                  <label className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#FAF3E3] border border-[#E8D5A7] text-xs font-medium text-[#8F6C2B] cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Banner</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
                  </label>
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase text-[#888B83] mb-1">Campaign Content (HTML / Text) *</label>
                  <textarea
                    rows={4}
                    required
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-medium uppercase text-[#888B83] mb-1">Discount %</label>
                    <input
                      type="number"
                      value={discountPercentage}
                      onChange={e => setDiscountPercentage(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium uppercase text-[#888B83] mb-1">Coupon Code</label>
                    <input
                      type="text"
                      value={couponCode}
                      onChange={e => setCouponCode(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium uppercase text-[#888B83] mb-1">Min Order (₹)</label>
                    <input
                      type="number"
                      value={minOrderValue}
                      onChange={e => setMinOrderValue(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium uppercase text-[#888B83] mb-1">Max Disc (₹)</label>
                    <input
                      type="number"
                      value={maxDiscount}
                      onChange={e => setMaxDiscount(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-medium uppercase text-[#888B83] mb-1">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium uppercase text-[#888B83] mb-1">End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase text-[#888B83] mb-1.5">Featured Product Cards</label>
                  <div className="flex flex-wrap gap-2">
                    {products.map(p => {
                      const checked = applicableProducts.includes(p.id);
                      return (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() =>
                            setApplicableProducts(prev =>
                              checked ? prev.filter(x => x !== p.id) : [...prev, p.id]
                            )
                          }
                          className={`px-3 py-1 rounded-full text-[11px] font-medium border cursor-pointer ${
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium uppercase text-[#888B83] mb-1">
                      Target Segment ({activeSegmentCount} opted-in)
                    </label>
                    <select
                      value={targetSegment}
                      onChange={e => setTargetSegment(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
                    >
                      {segments.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.label} ({s.count})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium uppercase text-[#888B83] mb-1">CTA Button Label</label>
                    <input
                      type="text"
                      value={ctaText}
                      onChange={e => setCtaText(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl text-xs font-semibold bg-[#183D32] hover:bg-[#245746] text-white cursor-pointer"
                >
                  Save Campaign as Draft
                </button>
              </form>
            </AdminCard>

            {/* Existing Campaigns List */}
            <div className="lg:col-span-6 space-y-4">
              <AdminCard padding="p-4">
                <input
                  type="email"
                  value={testEmailAddr}
                  onChange={e => setTestEmailAddr(e.target.value)}
                  placeholder="Optional test email recipient (defaults to admin email)"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
                />
              </AdminCard>

              {campaigns.length === 0 ? (
                <AdminCard className="text-center text-xs text-[#888B83]">
                  No campaigns created yet. Build your first festival or promotional campaign on the left.
                </AdminCard>
              ) : (
                campaigns.map(c => (
                  <AdminCard key={c.id} padding="p-5" className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8F6C2B]">
                          {c.campaignType} {c.festivalName ? `• ${c.festivalName}` : ''}
                        </span>
                        <h3 className="font-admin-serif text-xl font-semibold text-[#183D32]">{c.campaignName}</h3>
                        <p className="text-xs text-[#5C6058]">{c.subject}</p>
                      </div>
                      <StatusBadge status={c.status} />
                    </div>

                    <div className="text-xs text-[#5C6058] flex flex-wrap gap-3">
                      <span>Segment: <strong className="text-[#252923]">{c.targetSegment}</strong></span>
                      {c.couponCode && <span>Code: <strong className="text-[#8F6C2B]">{c.couponCode}</strong></span>}
                      <span>Sent: {c.sentCount}/{c.totalRecipients}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#E9E4D9]">
                      <button
                        onClick={() => handleTestCampaign(c.id)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[#F8F6F0] text-[#252923] border border-[#E9E4D9] cursor-pointer"
                      >
                        Send Test Email
                      </button>

                      {['draft', 'scheduled'].includes(c.status) && (
                        <>
                          <button
                            onClick={() => setConfirmSendCampaign(c)}
                            className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#183D32] text-white cursor-pointer"
                          >
                            <Send className="w-3 h-3 text-[#C8A96B]" />
                            <span>Send Now</span>
                          </button>
                          <div className="inline-flex items-center gap-1.5">
                            <input
                              type="datetime-local"
                              value={scheduleInputMap[c.id] || ''}
                              onChange={e =>
                                setScheduleInputMap(prev => ({ ...prev, [c.id]: e.target.value }))
                              }
                              className="px-2 py-1 rounded-lg bg-[#F8F6F0] border border-[#E9E4D9] text-[11px] text-[#252923]"
                            />
                            <button
                              onClick={() => handleScheduleCampaign(c.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[#FAF3E3] text-[#8F6C2B] border border-[#E8D5A7] cursor-pointer"
                            >
                              <Calendar className="w-3 h-3" />
                              <span>Schedule</span>
                            </button>
                          </div>
                        </>
                      )}

                      {c.status === 'scheduled' && (
                        <button
                          onClick={() => handleCancelCampaign(c.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[#FCECEB] text-[#C65B50] border border-[#F2C3BE] cursor-pointer"
                        >
                          <XCircle className="w-3 h-3" />
                          <span>Cancel Scheduled</span>
                        </button>
                      )}
                    </div>
                  </AdminCard>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 2: ADD & LAUNCH PRODUCT */}
        {tab === 'products' && (
          <AdminCard className="max-w-3xl">
            <form onSubmit={handleCreateProduct} className="space-y-4">
              <h2 className="font-admin-serif text-2xl font-semibold text-[#183D32]">Add New Jammu Harvest Product</h2>
              <p className="text-xs text-[#888B83]">
                Creating a product never sends marketing emails automatically unless you explicitly choose and confirm a launch email or scheduled campaign.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                  type="text"
                  required
                  value={prodName}
                  onChange={e => setProdName(e.target.value)}
                  placeholder="Product Name *"
                  className="px-3.5 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-sm text-[#252923]"
                />
                <input
                  type="text"
                  value={prodSubtitle}
                  onChange={e => setProdSubtitle(e.target.value)}
                  placeholder="Subtitle / Grade"
                  className="px-3.5 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-sm text-[#252923]"
                />
                <select
                  value={prodCategory}
                  onChange={e => setProdCategory(e.target.value as any)}
                  className="px-3.5 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-sm text-[#252923]"
                >
                  <option value="nuts">Himalayan Nuts</option>
                  <option value="saffron">Pure Saffron</option>
                  <option value="dried-fruits">Sun-Dried Fruits</option>
                </select>
                <div className="flex gap-2">
                  <input
                    type="number"
                    required
                    min={1}
                    value={prodPrice}
                    onChange={e => setProdPrice(e.target.value)}
                    placeholder="Price (₹) *"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-sm text-[#252923]"
                  />
                  <select
                    value={prodUnit}
                    onChange={e => setProdUnit(e.target.value as any)}
                    className="px-3 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-sm text-[#252923]"
                  >
                    <option value="kg">/ kg</option>
                    <option value="gram">/ gram</option>
                  </select>
                </div>
              </div>

              <input
                type="text"
                value={prodImage}
                onChange={e => setProdImage(e.target.value)}
                placeholder="Product Image Path or URL"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
              />

              <textarea
                rows={3}
                required
                value={prodDesc}
                onChange={e => setProdDesc(e.target.value)}
                placeholder="Product Description *"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                  type="text"
                  value={prodVariants}
                  onChange={e => setProdVariants(e.target.value)}
                  placeholder="Variants (comma separated)"
                  className="px-3.5 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
                />
                <input
                  type="text"
                  value={prodFeatures}
                  onChange={e => setProdFeatures(e.target.value)}
                  placeholder="Product Highlights (comma separated)"
                  className="px-3.5 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
                />
              </div>

              <div className="p-4 rounded-2xl bg-[#F8F6F0] border border-[#E9E4D9] space-y-3">
                <div className="text-xs font-semibold uppercase text-[#183D32]">
                  Admin Publish &amp; Communication Choice
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  {[
                    { id: 'draft', label: 'Save as Draft' },
                    { id: 'publish_only', label: 'Publish Product Only (No Email)' },
                    { id: 'publish_and_send', label: 'Publish & Send New Product Email' },
                    { id: 'publish_and_schedule', label: 'Publish & Schedule Email Campaign' },
                  ].map(opt => (
                    <label key={opt.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-[#E9E4D9] cursor-pointer text-[#252923]">
                      <input
                        type="radio"
                        name="publishAction"
                        checked={publishAction === opt.id}
                        onChange={() => setPublishAction(opt.id as any)}
                        className="accent-[#183D32]"
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>

                {(publishAction === 'publish_and_send' || publishAction === 'publish_and_schedule') && (
                  <div className="space-y-3 pt-2 border-t border-[#E9E4D9]">
                    <select
                      value={prodSegment}
                      onChange={e => setProdSegment(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-[#E9E4D9] text-xs text-[#252923]"
                    >
                      {segments.map(s => (
                        <option key={s.id} value={s.id}>{s.label} ({s.count})</option>
                      ))}
                    </select>

                    {publishAction === 'publish_and_schedule' && (
                      <input
                        type="datetime-local"
                        required
                        value={prodScheduledAt}
                        onChange={e => setProdScheduledAt(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-[#E9E4D9] text-xs text-[#252923]"
                      />
                    )}

                    {publishAction === 'publish_and_send' && (
                      <label className="flex items-center gap-2 text-xs text-[#8F6C2B] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={confirmProdSend}
                          onChange={e => setConfirmProdSend(e.target.checked)}
                          className="accent-[#183D32]"
                        />
                        <span>I explicitly approve sending this new product launch email to opted-in customers.</span>
                      </label>
                    )}
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="px-6 py-3 rounded-xl text-xs font-semibold bg-[#183D32] hover:bg-[#245746] text-white cursor-pointer"
              >
                Save Product
              </button>
            </form>
          </AdminCard>
        )}

        {/* TAB 3: SEGMENTS */}
        {tab === 'segments' && (
          <AdminCard className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-admin-serif text-2xl font-semibold text-[#183D32]">Consent-Filtered Customer Segments</h2>
              <select
                value={segmentCat}
                onChange={e => setSegmentCat(e.target.value as any)}
                className="px-3 py-1.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
              >
                <option value="nuts">Category: Nuts</option>
                <option value="saffron">Category: Saffron</option>
                <option value="dried-fruits">Category: Dried Fruits</option>
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {segments.map(s => (
                <div key={s.id} className="p-4 rounded-2xl bg-[#F8F6F0] border border-[#E9E4D9]">
                  <div className="text-xs text-[#5C6058]">{s.label}</div>
                  <div className="text-2xl font-bold text-[#183D32] mt-1 tabular-nums">{s.count} eligible</div>
                </div>
              ))}
            </div>
          </AdminCard>
        )}

        <ConfirmDialog
          open={Boolean(confirmSendCampaign)}
          title="Confirm Bulk Campaign Dispatch"
          message={
            confirmSendCampaign
              ? `You are about to queue "${confirmSendCampaign.campaignName}" for ${
                  segments.find(s => s.id === confirmSendCampaign.targetSegment)?.count ?? 0
                } opted-in customer(s) in segment "${confirmSendCampaign.targetSegment}".`
              : ''
          }
          confirmLabel="Confirm & Dispatch"
          danger={false}
          onConfirm={handleConfirmedSendCampaign}
          onCancel={() => setConfirmSendCampaign(null)}
        />
      </div>
    </AdminLayout>
  );
}

