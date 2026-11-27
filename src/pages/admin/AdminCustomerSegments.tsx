import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Users,
  Crown,
  Gem,
  Repeat,
  UserPlus,
  UserMinus,
  Search,
  Download,
  Settings,
  MessageCircle,
  Tag,
  Eye,
  ExternalLink,
  RefreshCw,
  ShoppingBag,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import {
  AdminCard,
  AdminModal,
  EmptyState,
  LoadingSkeleton,
  PaginationBar,
  StatusBadge,
  ToastBanner,
} from '../../components/admin/AdminUI';
import { apiRequest, ApiError } from '../../services/api';
import { formatINR } from '../../utils/priceCalculator';

type SegmentKey = 'all' | 'vip' | 'high_value' | 'returning' | 'new' | 'inactive' | 'prospect';

interface SegmentSummary {
  totalCustomers: number;
  totalRevenue: number;
  newCustomersCount: number;
  returningCustomersCount: number;
  vipCustomersCount: number;
  highValueCustomersCount: number;
  inactiveCustomersCount: number;
  prospectsCount: number;
}

const SEGMENT_BADGE_TONE: Record<string, 'emerald' | 'gold' | 'red' | 'blue' | 'neutral'> = {
  vip: 'gold',
  high_value: 'emerald',
  returning: 'blue',
  new: 'emerald',
  inactive: 'red',
  prospect: 'neutral',
};

export default function AdminCustomerSegments() {
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [summary, setSummary] = useState<SegmentSummary | null>(null);
  const [revenueBySegment, setRevenueBySegment] = useState<any[]>([]);
  const [selectedSegmentAnalytics, setSelectedSegmentAnalytics] = useState<any | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [recentCampaigns, setRecentCampaigns] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [segmentFilter, setSegmentFilter] = useState<SegmentKey>('all');
  const [search, setSearch] = useState('');
  const [consentOnly, setConsentOnly] = useState(false);

  // Threshold Config Modal
  const [configOpen, setConfigOpen] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configForm, setConfigForm] = useState({
    vipSpendThreshold: 10000,
    highValueSpendThreshold: 5000,
    inactiveDaysThreshold: 90,
  });

  // Customer Profile Modal
  const [profileDetail, setProfileDetail] = useState<any | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // WhatsApp Campaign Modal
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [submittingWa, setSubmittingWa] = useState(false);
  const [waForm, setWaForm] = useState({
    segment: 'vip' as SegmentKey,
    title: 'Patron Appreciation Reserve',
    offerCode: '',
    messageTemplate:
      'Namaste {name},\n\nThank you for being a valued patron of Seth And Sons DryFruits! Enjoy our fresh harvest collection with code {offer_code}.',
    idempotencyKey: '',
  });
  const [waResultCampaign, setWaResultCampaign] = useState<any | null>(null);

  // Apply Offer Modal
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [offerForm, setOfferForm] = useState({
    segment: 'vip' as SegmentKey,
    customerId: '',
    customerName: '',
    title: 'Exclusive Segment Privilege',
    codePrefix: 'SETHVIP',
    discountType: 'percentage' as 'percentage' | 'flat',
    discountValue: 15,
    minOrderValue: 1500,
    validDays: 30,
    usageLimit: 1,
    idempotencyKey: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{
        summary: SegmentSummary;
        revenueBySegment: any[];
        selectedSegmentAnalytics: any;
        config: any;
        customers: any[];
        recentCampaigns: any[];
        pagination: { page: number; total: number; totalPages: number };
      }>(
        `/api/admin/segments/overview?segment=${encodeURIComponent(segmentFilter)}&search=${encodeURIComponent(
          search
        )}&consentOnly=${consentOnly ? 'true' : 'false'}&page=${page}&limit=15`
      );
      setSummary(res.summary);
      setRevenueBySegment(res.revenueBySegment || []);
      setSelectedSegmentAnalytics(res.selectedSegmentAnalytics || null);
      setCustomers(res.customers || []);
      setRecentCampaigns(res.recentCampaigns || []);
      setTotalPages(res.pagination?.totalPages || 1);
      setTotalCount(res.pagination?.total || 0);
      if (res.config) {
        setConfigForm({
          vipSpendThreshold: Number(res.config.vipSpendThreshold ?? 10000),
          highValueSpendThreshold: Number(res.config.highValueSpendThreshold ?? 5000),
          inactiveDaysThreshold: Number(res.config.inactiveDaysThreshold ?? 90),
        });
      }
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to load customer segmentation analytics.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [segmentFilter, search, consentOnly, page]);

  useEffect(() => {
    setPage(1);
  }, [segmentFilter, search, consentOnly]);

  const openCustomerProfile = async (customerId: string) => {
    setLoadingProfile(true);
    setProfileDetail(null);
    try {
      const res = await apiRequest<any>(`/api/admin/segments/customers/${customerId}`);
      setProfileDetail(res);
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to load customer profile.',
      });
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/admin/segments/config', {
        method: 'PUT',
        body: configForm,
      });
      setConfigOpen(false);
      setToast({ type: 'ok', text: res.message || 'Segmentation rules saved.' });
      await loadData();
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Failed to save rules.' });
    } finally {
      setSavingConfig(false);
    }
  };

  const openWhatsAppCampaignModal = () => {
    setWaResultCampaign(null);
    setWaForm({
      segment: segmentFilter === 'all' ? 'vip' : segmentFilter,
      title: `WhatsApp Outreach (${segmentFilter.toUpperCase()})`,
      offerCode: '',
      messageTemplate:
        'Namaste {name},\n\nOur fresh Kashmiri & Iranian dry fruits harvest is ready! Let us know if you would like to reserve a box.',
      idempotencyKey: `wa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    });
    setWaModalOpen(true);
  };

  const handleRunWhatsAppCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingWa(true);
    try {
      const res = await apiRequest<{ campaign: any }>('/api/admin/segments/whatsapp-campaign', {
        method: 'POST',
        body: waForm,
      });
      setWaResultCampaign(res.campaign);
      setToast({
        type: 'ok',
        text: `Campaign prepared for ${res.campaign.eligibleCount} consented patron(s) (${res.campaign.skippedOptOutCount} opted-out skipped).`,
      });
      await loadData();
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Failed to build WhatsApp campaign.',
      });
    } finally {
      setSubmittingWa(false);
    }
  };

  const openOfferModal = (targetCustomer?: { id: string; name: string; segment: SegmentKey }) => {
    const seg = targetCustomer?.segment || (segmentFilter === 'all' ? 'vip' : segmentFilter);
    setOfferForm({
      segment: seg,
      customerId: targetCustomer?.id || '',
      customerName: targetCustomer?.name || '',
      title: targetCustomer ? `Privilege Offer for ${targetCustomer.name}` : `Segment Offer (${seg.toUpperCase()})`,
      codePrefix: seg === 'vip' ? 'SETHVIP' : seg === 'inactive' ? 'WINBACK' : 'SETH',
      discountType: 'percentage',
      discountValue: 15,
      minOrderValue: 1500,
      validDays: 30,
      usageLimit: 1,
      idempotencyKey: `off_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    });
    setOfferModalOpen(true);
  };

  const handleApplyOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingOffer(true);
    try {
      const res = await apiRequest<{ campaign: any }>('/api/admin/segments/apply-offer', {
        method: 'POST',
        body: {
          segment: offerForm.segment,
          customerId: offerForm.customerId || undefined,
          title: offerForm.title,
          codePrefix: offerForm.codePrefix,
          discountType: offerForm.discountType,
          discountValue: Number(offerForm.discountValue),
          minOrderValue: Number(offerForm.minOrderValue || 0),
          validDays: Number(offerForm.validDays),
          usageLimit: Number(offerForm.usageLimit),
          idempotencyKey: offerForm.idempotencyKey,
        },
      });
      setOfferModalOpen(false);
      setToast({
        type: 'ok',
        text: `Applied ${res.campaign.appliedCount} unique customer coupon(s) for "${offerForm.title}".`,
      });
      await loadData();
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to apply segment offer.',
      });
    } finally {
      setSubmittingOffer(false);
    }
  };

  return (
    <AdminLayout
      title="Customer Segmentation & Loyalty Intelligence"
      subtitle="Mutually exclusive lifecycle segments based on verified order history, lifetime spend thresholds, and consent-compliant outreach."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setConfigOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-[#E9E4D9] text-[#183D32] hover:bg-[#FAF3E3] cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-[#C8A96B]" />
            <span>Rules Config</span>
          </button>
          <button
            type="button"
            onClick={openWhatsAppCampaignModal}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#245746] text-white hover:bg-[#183D32] cursor-pointer"
          >
            <MessageCircle className="w-3.5 h-3.5 text-[#DFC471]" />
            <span>WhatsApp Campaign</span>
          </button>
          <button
            type="button"
            onClick={() => openOfferModal()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#F3E4BC] border border-[#D4BA76] text-[#183D32] hover:bg-[#EAD49A] cursor-pointer"
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Apply Offer</span>
          </button>
          <a
            href={`/api/admin/segments/export.csv?segment=${encodeURIComponent(segmentFilter)}&search=${encodeURIComponent(search)}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#183D32] text-white hover:opacity-95"
          >
            <Download className="w-3.5 h-3.5 text-[#C8A96B]" />
            <span>Export CSV</span>
          </a>
        </div>
      }
    >
      <div className="space-y-5">
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

        {/* 6 Core Analytics KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <AdminCard padding="p-4">
            <div className="flex items-center justify-between text-xs text-[#888B83] mb-1">
              <span>Total Customers</span>
              <Users className="w-4 h-4 text-[#183D32]" />
            </div>
            <div className="text-2xl font-bold text-[#183D32]">{summary?.totalCustomers ?? 0}</div>
            <div className="text-[11px] text-[#5C6058] mt-1">
              Rev: {formatINR(summary?.totalRevenue ?? 0)}
            </div>
          </AdminCard>

          <AdminCard padding="p-4">
            <div className="flex items-center justify-between text-xs text-[#888B83] mb-1">
              <span>New Customers</span>
              <UserPlus className="w-4 h-4 text-[#245746]" />
            </div>
            <div className="text-2xl font-bold text-[#183D32]">{summary?.newCustomersCount ?? 0}</div>
            <div className="text-[11px] text-[#5C6058] mt-1">1 successful order</div>
          </AdminCard>

          <AdminCard padding="p-4">
            <div className="flex items-center justify-between text-xs text-[#888B83] mb-1">
              <span>Returning</span>
              <Repeat className="w-4 h-4 text-[#1E568A]" />
            </div>
            <div className="text-2xl font-bold text-[#183D32]">
              {summary?.returningCustomersCount ?? 0}
            </div>
            <div className="text-[11px] text-[#5C6058] mt-1">2+ successful orders</div>
          </AdminCard>

          <AdminCard padding="p-4">
            <div className="flex items-center justify-between text-xs text-[#888B83] mb-1">
              <span>VIP Customers</span>
              <Crown className="w-4 h-4 text-[#C8A96B]" />
            </div>
            <div className="text-2xl font-bold text-[#8F6C2B]">{summary?.vipCustomersCount ?? 0}</div>
            <div className="text-[11px] text-[#8F6C2B] mt-1">
              &gt;= {formatINR(configForm.vipSpendThreshold)} spend
            </div>
          </AdminCard>

          <AdminCard padding="p-4">
            <div className="flex items-center justify-between text-xs text-[#888B83] mb-1">
              <span>High-Value</span>
              <Gem className="w-4 h-4 text-[#245746]" />
            </div>
            <div className="text-2xl font-bold text-[#183D32]">
              {summary?.highValueCustomersCount ?? 0}
            </div>
            <div className="text-[11px] text-[#5C6058] mt-1">
              &gt;= {formatINR(configForm.highValueSpendThreshold)} spend
            </div>
          </AdminCard>

          <AdminCard padding="p-4">
            <div className="flex items-center justify-between text-xs text-[#888B83] mb-1">
              <span>Inactive</span>
              <UserMinus className="w-4 h-4 text-[#C65B50]" />
            </div>
            <div className="text-2xl font-bold text-[#C65B50]">
              {summary?.inactiveCustomersCount ?? 0}
            </div>
            <div className="text-[11px] text-[#5C6058] mt-1">
              &gt; {configForm.inactiveDaysThreshold}d dormant
            </div>
          </AdminCard>
        </div>

        {/* Revenue by Segment Chart & Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <AdminCard padding="p-5" className="lg:col-span-7">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-admin-serif text-lg font-semibold text-[#183D32]">
                  Revenue by Segment
                </h2>
                <p className="text-xs text-[#888B83]">
                  Completed order revenue partitioned across mutually-exclusive customer segments (zero overlap).
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadData()}
                className="p-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-[#183D32] hover:bg-[#FAF3E3] cursor-pointer"
                title="Refresh Analytics"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueBySegment}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E9E4D9" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#5C6058' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#5C6058' }} />
                  <Tooltip
                    formatter={(val: any) => formatINR(Number(val || 0))}
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E9E4D9',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="revenue" name="Segment Revenue" fill="#183D32" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </AdminCard>

          <AdminCard padding="p-5" className="lg:col-span-5">
            <h2 className="font-admin-serif text-lg font-semibold text-[#183D32] mb-1">
              Segment Priority & Summary
            </h2>
            <p className="text-[11px] text-[#888B83] mb-3">
              Priority: Inactive (&gt;{configForm.inactiveDaysThreshold}d dormant) → VIP → High-Value → Returning → New → Prospects.
            </p>
            <div className="space-y-2 text-xs">
              {revenueBySegment.map(row => (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => setSegmentFilter(row.key)}
                  className={`w-full text-left p-2.5 rounded-xl border flex items-center justify-between transition cursor-pointer ${
                    segmentFilter === row.key
                      ? 'bg-[#FAF3E3] border-[#C8A96B]'
                      : 'bg-[#F8F6F0]/70 border-[#E9E4D9] hover:border-[#C8A96B]'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-[#183D32] flex items-center gap-2">
                      <span>{row.label}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white border border-[#E9E4D9] text-[#5C6058]">
                        {row.customerCount}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#888B83] mt-0.5">
                      {row.whatsappEligibleCount}/{row.customerCount} WhatsApp consented · AOV{' '}
                      {formatINR(row.avgOrderValue)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-[#183D32]">{formatINR(row.revenue)}</div>
                    <div className="text-[10px] text-[#8F6C2B]">{row.revenueSharePercent}% share</div>
                  </div>
                </button>
              ))}
            </div>
          </AdminCard>
        </div>

        {/* Segment Filters, Analytics Banner & Customer Directory */}
        <AdminCard padding="p-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['all', 'All Segments'],
                  ['vip', 'VIP'],
                  ['high_value', 'High-Value'],
                  ['returning', 'Returning'],
                  ['new', 'New'],
                  ['inactive', 'Inactive'],
                  ['prospect', 'Prospects'],
                ] as Array<[SegmentKey, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSegmentFilter(key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition ${
                    segmentFilter === key
                      ? 'bg-[#183D32] text-white border-[#183D32]'
                      : 'bg-[#F8F6F0] text-[#5C6058] border-[#E9E4D9] hover:border-[#C8A96B]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <label className="inline-flex items-center gap-1.5 text-xs text-[#183D32] cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentOnly}
                  onChange={e => setConsentOnly(e.target.checked)}
                  className="rounded border-[#C8A96B]"
                />
                <span>WhatsApp Consented Only</span>
              </label>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-[#888B83] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search name, email, phone..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923] focus:outline-none focus:border-[#183D32]"
                />
              </div>
            </div>
          </div>

          {/* Segment-Specific Analytics Strip */}
          {selectedSegmentAnalytics && (
            <div className="mt-3 p-3 rounded-xl bg-[#FAF8F2] border border-[#E5DEC9] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <span className="text-[#888B83]">Filtered View: </span>
                <strong className="text-[#183D32] uppercase">{segmentFilter.replace('_', ' ')}</strong>
                <span className="ml-2 text-[#5C6058]">
                  ({selectedSegmentAnalytics.customerCount} customers)
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-[#183D32]">
                <span>
                  Revenue: <strong>{formatINR(selectedSegmentAnalytics.revenue)}</strong>
                </span>
                <span>
                  Orders: <strong>{selectedSegmentAnalytics.totalOrders}</strong>
                </span>
                <span>
                  Avg Spend: <strong>{formatINR(selectedSegmentAnalytics.avgCustomerSpend)}</strong>
                </span>
                <span>
                  WhatsApp Eligible: <strong>{selectedSegmentAnalytics.whatsappEligibleCount}</strong>
                </span>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="mt-4">
            {loading ? (
              <LoadingSkeleton rows={5} />
            ) : customers.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No customers in this segment"
                description="Adjust your segment filter or thresholds to inspect customers."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E9E4D9] text-[#888B83] uppercase text-[10px]">
                      <th className="py-2.5 pr-3">Customer</th>
                      <th className="py-2.5 pr-3">Segment</th>
                      <th className="py-2.5 pr-3">Successful Orders</th>
                      <th className="py-2.5 pr-3">Lifetime Spending</th>
                      <th className="py-2.5 pr-3">Avg Order Value</th>
                      <th className="py-2.5 pr-3">Last Purchase</th>
                      <th className="py-2.5 pr-3">Consent</th>
                      <th className="py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9E4D9]">
                    {customers.map(c => (
                      <tr key={c.id} className="hover:bg-[#F8F6F0]/60">
                        <td className="py-3 pr-3">
                          <div className="font-semibold text-[#183D32]">{c.name}</div>
                          <div className="text-[11px] text-[#888B83]">{c.email}</div>
                          {c.phone && <div className="text-[11px] text-[#5C6058]">{c.phone}</div>}
                        </td>
                        <td className="py-3 pr-3">
                          <StatusBadge
                            status={c.segmentLabel}
                            tone={SEGMENT_BADGE_TONE[c.segment] || 'neutral'}
                          />
                        </td>
                        <td className="py-3 pr-3 font-semibold text-[#183D32]">
                          {c.successfulOrdersCount}
                        </td>
                        <td className="py-3 pr-3 font-bold text-[#183D32]">
                          {formatINR(c.lifetimeSpending)}
                        </td>
                        <td className="py-3 pr-3 text-[#252923]">
                          {formatINR(c.averageOrderValue)}
                        </td>
                        <td className="py-3 pr-3 text-[#5C6058] whitespace-nowrap">
                          {c.lastPurchaseDate
                            ? new Date(c.lastPurchaseDate).toLocaleDateString('en-IN')
                            : 'No orders'}
                        </td>
                        <td className="py-3 pr-3">
                          {c.whatsappEligible ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#183D32]">
                              <ShieldCheck className="w-3.5 h-3.5 text-[#245746]" />
                              <span>Opted-In</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#9E3D33]">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>{c.optOutReason || 'Opted-Out'}</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void openCustomerProfile(c.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#F8F6F0] border border-[#E9E4D9] text-[#183D32] hover:bg-[#FAF3E3] cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Profile</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openOfferModal({ id: c.id, name: c.name, segment: c.segment })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#183D32] text-white hover:bg-[#245746] cursor-pointer"
                            >
                              <Tag className="w-3.5 h-3.5 text-[#DFC471]" />
                              <span>Offer</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <PaginationBar
              page={page}
              totalPages={totalPages}
              totalItems={totalCount}
              onPageChange={setPage}
            />
          </div>
        </AdminCard>

        {/* Recent Segment Campaigns & Offers */}
        {recentCampaigns.length > 0 && (
          <AdminCard padding="p-4">
            <h3 className="font-admin-serif text-base font-semibold text-[#183D32] mb-2">
              Recent Segment Outreach & Offers
            </h3>
            <div className="space-y-2 text-xs">
              {recentCampaigns.slice(0, 5).map(cmp => (
                <div
                  key={cmp.id}
                  className="p-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-semibold text-[#183D32]">{cmp.title}</span>
                    <span className="ml-2 text-[11px] text-[#888B83]">
                      ({cmp.campaignType.replace('_', ' ')} · Segment: {cmp.segmentKey})
                    </span>
                  </div>
                  <div className="text-[11px] text-[#5C6058]">
                    {cmp.campaignType === 'whatsapp_campaign'
                      ? `${cmp.eligibleCount} eligible (${cmp.skippedOptOutCount} opted-out skipped)`
                      : `${cmp.appliedCount} coupon(s) created`}
                  </div>
                </div>
              ))}
            </div>
          </AdminCard>
        )}
      </div>

      {/* Segment Thresholds Modal */}
      <AdminModal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        title="Configure Customer Segment Rules"
        subtitle="Customize spend thresholds and inactivity duration for segment classification."
      >
        <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-[#183D32] mb-1">
              VIP Lifetime Spend Threshold (INR)
            </label>
            <input
              type="number"
              min={1000}
              required
              value={configForm.vipSpendThreshold}
              onChange={e =>
                setConfigForm(f => ({ ...f, vipSpendThreshold: Number(e.target.value) }))
              }
              className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3]"
            />
          </div>
          <div>
            <label className="block font-semibold text-[#183D32] mb-1">
              High-Value Lifetime Spend Threshold (INR)
            </label>
            <input
              type="number"
              min={500}
              required
              value={configForm.highValueSpendThreshold}
              onChange={e =>
                setConfigForm(f => ({ ...f, highValueSpendThreshold: Number(e.target.value) }))
              }
              className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3]"
            />
          </div>
          <div>
            <label className="block font-semibold text-[#183D32] mb-1">
              Inactive Threshold (Days Without Successful Purchase)
            </label>
            <input
              type="number"
              min={7}
              max={730}
              required
              value={configForm.inactiveDaysThreshold}
              onChange={e =>
                setConfigForm(f => ({ ...f, inactiveDaysThreshold: Number(e.target.value) }))
              }
              className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setConfigOpen(false)}
              className="px-4 py-2 rounded-xl bg-[#F8F6F0] text-[#5C6058] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingConfig}
              className="px-4 py-2 rounded-xl bg-[#183D32] text-white font-semibold cursor-pointer disabled:opacity-50"
            >
              {savingConfig ? 'Saving...' : 'Save Rules'}
            </button>
          </div>
        </form>
      </AdminModal>

      {/* Customer Profile Modal */}
      <AdminModal
        open={loadingProfile || Boolean(profileDetail)}
        onClose={() => {
          setLoadingProfile(false);
          setProfileDetail(null);
        }}
        title={profileDetail?.customer?.name || 'Loading Profile...'}
        subtitle={
          profileDetail
            ? `${profileDetail.customer.email} • ${profileDetail.customer.segmentLabel}`
            : ''
        }
        maxWidth="max-w-2xl"
      >
        {loadingProfile ? (
          <LoadingSkeleton rows={4} />
        ) : (
          profileDetail && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]">
                  <div className="text-[#888B83]">Lifetime Spending</div>
                  <div className="text-base font-bold text-[#183D32]">
                    {formatINR(profileDetail.customer.lifetimeSpending)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]">
                  <div className="text-[#888B83]">Successful Orders</div>
                  <div className="text-base font-bold text-[#183D32]">
                    {profileDetail.customer.successfulOrdersCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]">
                  <div className="text-[#888B83]">Avg Order Value</div>
                  <div className="text-base font-bold text-[#183D32]">
                    {formatINR(profileDetail.customer.averageOrderValue)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]">
                  <div className="text-[#888B83]">Last Purchase</div>
                  <div className="text-sm font-bold text-[#183D32]">
                    {profileDetail.customer.lastPurchaseDate
                      ? new Date(profileDetail.customer.lastPurchaseDate).toLocaleDateString('en-IN')
                      : 'Never'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[#888B83]">Segment:</span>
                <StatusBadge
                  status={profileDetail.customer.segmentLabel}
                  tone={SEGMENT_BADGE_TONE[profileDetail.customer.segment] || 'neutral'}
                />
                {(profileDetail.customer.secondaryTags || []).map((tag: string) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-full bg-[#FAF3E3] border border-[#E8D5A7] text-[10px] font-semibold text-[#8F6C2B]"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Most Purchased Products */}
              <div>
                <h4 className="font-semibold text-[#183D32] mb-1.5 flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-[#C8A96B]" />
                  <span>Most Purchased Products</span>
                </h4>
                {!profileDetail.customer.mostPurchasedProducts?.length ? (
                  <p className="text-[#888B83] italic">No successful product purchases yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {profileDetail.customer.mostPurchasedProducts.map((mp: any) => (
                      <div
                        key={mp.productId}
                        className="p-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] flex items-center justify-between"
                      >
                        <div>
                          <div className="font-semibold text-[#183D32]">{mp.productName}</div>
                          <div className="text-[11px] text-[#5C6058]">
                            Qty: {mp.quantity} across {mp.orderCount} order(s)
                          </div>
                        </div>
                        <div className="font-bold text-[#183D32]">{formatINR(mp.spent)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Purchase History */}
              <div>
                <h4 className="font-semibold text-[#183D32] mb-1.5">
                  Purchase History ({profileDetail.purchaseHistory.length})
                </h4>
                {profileDetail.purchaseHistory.length === 0 ? (
                  <p className="text-[#888B83] italic">No orders placed yet.</p>
                ) : (
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {profileDetail.purchaseHistory.map((ord: any) => (
                      <div
                        key={ord.id}
                        className="p-3 rounded-xl bg-white border border-[#E9E4D9] space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#183D32]">#{ord.orderNumber}</span>
                            <span className="text-[#888B83]">
                              {new Date(ord.createdAt).toLocaleDateString('en-IN')}
                            </span>
                            <StatusBadge status={ord.status} />
                          </div>
                          <span className="font-bold text-[#245746]">{formatINR(ord.totalAmount)}</span>
                        </div>
                        <div className="text-[11px] text-[#5C6058]">
                          {(ord.items || [])
                            .map((it: any) => `${it.productName} × ${it.quantity}`)
                            .join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        )}
      </AdminModal>

      {/* Targeted WhatsApp Campaign Modal */}
      <AdminModal
        open={waModalOpen}
        onClose={() => setWaModalOpen(false)}
        title="Targeted WhatsApp Campaign"
        subtitle="Builds consent-verified WhatsApp outreach links strictly for opted-in patrons."
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleRunWhatsAppCampaign} className="space-y-3.5 text-xs">
          <div className="p-3 rounded-xl bg-[#E7F3EE] border border-[#B7DEC9] text-[#183D32]">
            Customers who opted out, unsubscribed, or lack promotional consent are automatically skipped.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#183D32] mb-1">Target Segment</label>
              <select
                value={waForm.segment}
                onChange={e => setWaForm(f => ({ ...f, segment: e.target.value as SegmentKey }))}
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3]"
              >
                <option value="vip">VIP Customers</option>
                <option value="high_value">High-Value Customers</option>
                <option value="returning">Returning Customers</option>
                <option value="new">New Customers</option>
                <option value="inactive">Inactive Customers</option>
                <option value="all">All Customers</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-[#183D32] mb-1">Offer Code (Optional)</label>
              <input
                type="text"
                value={waForm.offerCode}
                onChange={e => setWaForm(f => ({ ...f, offerCode: e.target.value }))}
                placeholder="e.g. SETHVIP15"
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3]"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#183D32] mb-1">Campaign Title</label>
            <input
              type="text"
              required
              value={waForm.title}
              onChange={e => setWaForm(f => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#183D32] mb-1">
              Message Template (Supports {'{name}'} &amp; {'{offer_code}'})
            </label>
            <textarea
              rows={4}
              required
              value={waForm.messageTemplate}
              onChange={e => setWaForm(f => ({ ...f, messageTemplate: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3]"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setWaModalOpen(false)}
              className="px-4 py-2 rounded-xl bg-[#F8F6F0] text-[#5C6058] cursor-pointer"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={submittingWa}
              className="px-4 py-2 rounded-xl bg-[#183D32] text-white font-semibold cursor-pointer disabled:opacity-50"
            >
              {submittingWa ? 'Preparing...' : 'Prepare Campaign Links'}
            </button>
          </div>
        </form>

        {waResultCampaign && (
          <div className="mt-4 pt-3 border-t border-[#E9E4D9] space-y-2 text-xs">
            <div className="font-semibold text-[#183D32]">
              Eligible Recipients ({waResultCampaign.eligibleCount}) · Skipped Opt-Out:{' '}
              {waResultCampaign.skippedOptOutCount} · Missing Phone:{' '}
              {waResultCampaign.skippedMissingPhoneCount}
            </div>
            {!waResultCampaign.recipients?.length ? (
              <p className="text-[#888B83]">No consented recipients matched in this segment.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1.5">
                {waResultCampaign.recipients.map((r: any) => (
                  <div
                    key={r.customerId}
                    className="p-2 rounded-lg bg-[#F8F6F0] border border-[#E9E4D9] flex items-center justify-between"
                  >
                    <div>
                      <span className="font-semibold text-[#183D32]">{r.customerName}</span>
                      <span className="ml-2 text-[#5C6058]">{r.phone}</span>
                    </div>
                    <a
                      href={r.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#183D32] text-white font-semibold"
                    >
                      <span>Open Chat</span>
                      <ExternalLink className="w-3 h-3 text-[#DFC471]" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </AdminModal>

      {/* Apply Configurable Offer Modal */}
      <AdminModal
        open={offerModalOpen}
        onClose={() => setOfferModalOpen(false)}
        title={offerForm.customerId ? `Apply Offer: ${offerForm.customerName}` : 'Apply Configurable Segment Offer'}
        subtitle="Generates unique private customer coupons directly in the active Coupon ledger (duplicate-safe)."
      >
        <form onSubmit={handleApplyOffer} className="space-y-3.5 text-xs">
          {!offerForm.customerId && (
            <div>
              <label className="block font-semibold text-[#183D32] mb-1">Target Segment</label>
              <select
                value={offerForm.segment}
                onChange={e => setOfferForm(f => ({ ...f, segment: e.target.value as SegmentKey }))}
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3]"
              >
                <option value="vip">VIP Customers</option>
                <option value="high_value">High-Value Customers</option>
                <option value="returning">Returning Customers</option>
                <option value="new">New Customers</option>
                <option value="inactive">Inactive Customers</option>
                <option value="all">All Customers</option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#183D32] mb-1">Offer Title</label>
              <input
                type="text"
                required
                value={offerForm.title}
                onChange={e => setOfferForm(f => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#183D32] mb-1">Code Prefix</label>
              <input
                type="text"
                required
                maxLength={12}
                value={offerForm.codePrefix}
                onChange={e => setOfferForm(f => ({ ...f, codePrefix: e.target.value.toUpperCase() }))}
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[#183D32] mb-1">Discount Type</label>
              <select
                value={offerForm.discountType}
                onChange={e =>
                  setOfferForm(f => ({
                    ...f,
                    discountType: e.target.value as 'percentage' | 'flat',
                  }))
                }
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3]"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="flat">Flat Amount (₹)</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-[#183D32] mb-1">Discount Value</label>
              <input
                type="number"
                min={1}
                required
                value={offerForm.discountValue}
                onChange={e => setOfferForm(f => ({ ...f, discountValue: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3]"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block font-semibold text-[#183D32] mb-1">Min Order (₹)</label>
              <input
                type="number"
                min={0}
                value={offerForm.minOrderValue}
                onChange={e => setOfferForm(f => ({ ...f, minOrderValue: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#183D32] mb-1">Valid Days</label>
              <input
                type="number"
                min={1}
                max={365}
                value={offerForm.validDays}
                onChange={e => setOfferForm(f => ({ ...f, validDays: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3]"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#183D32] mb-1">Uses / User</label>
              <input
                type="number"
                min={1}
                max={20}
                value={offerForm.usageLimit}
                onChange={e => setOfferForm(f => ({ ...f, usageLimit: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOfferModalOpen(false)}
              className="px-4 py-2 rounded-xl bg-[#F8F6F0] text-[#5C6058] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingOffer}
              className="px-4 py-2 rounded-xl bg-[#183D32] text-white font-semibold cursor-pointer disabled:opacity-50"
            >
              {submittingOffer ? 'Applying...' : 'Generate Segment Offers'}
            </button>
          </div>
        </form>
      </AdminModal>
    </AdminLayout>
  );
}
