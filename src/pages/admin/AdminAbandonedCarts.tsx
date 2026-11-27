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
  ShoppingCart,
  TrendingUp,
  IndianRupee,
  Clock,
  MessageCircle,
  Search,
  RefreshCw,
  Settings,
  History,
  Ban,
  ShieldAlert,
  CheckCircle2,
  ExternalLink,
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

interface AbandonedCartSummary {
  totalAbandonedCarts: number;
  totalEverAbandoned: number;
  activeCartsCount: number;
  expiredCartsCount: number;
  potentialLostRevenue: number;
  recoveredCartsCount: number;
  recoveredCartRevenue: number;
  cartRecoveryRate: number;
  avgAbandonmentDurationMinutes: number;
}

interface TrendPoint {
  date: string;
  label: string;
  abandonedCount: number;
  recoveredCount: number;
  potentialLostRevenue: number;
  recoveredRevenue: number;
}

function formatDurationMinutes(totalMins: number): string {
  if (!totalMins || totalMins <= 0) return '0m';
  if (totalMins < 60) return `${totalMins}m`;
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs < 24) return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  return remHrs > 0 ? `${days}d ${remHrs}h` : `${days}d`;
}

export default function AdminAbandonedCarts() {
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [submittingFollowUp, setSubmittingFollowUp] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [summary, setSummary] = useState<AbandonedCartSummary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [carts, setCarts] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [statusFilter, setStatusFilter] = useState<'all' | 'abandoned' | 'recovered' | 'expired' | 'active'>('all');
  const [search, setSearch] = useState('');

  const [configOpen, setConfigOpen] = useState(false);
  const [configForm, setConfigForm] = useState({
    abandonmentThresholdMinutes: 30,
    cartExpiryHours: 168,
    followUpCooldownHours: 24,
  });

  const [followUpTarget, setFollowUpTarget] = useState<any | null>(null);
  const [followUpMsg, setFollowUpMsg] = useState('');
  const [historyTarget, setHistoryTarget] = useState<any | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{
        summary: AbandonedCartSummary;
        sevenDayTrend: TrendPoint[];
        config: any;
        carts: any[];
        pagination: { page: number; total: number; totalPages: number };
      }>(
        `/api/admin/abandoned-carts?status=${encodeURIComponent(statusFilter)}&search=${encodeURIComponent(
          search
        )}&page=${page}&limit=15`
      );
      setSummary(res.summary);
      setTrend(res.sevenDayTrend || []);
      setCarts(res.carts || []);
      setTotalPages(res.pagination?.totalPages || 1);
      setTotalCount(res.pagination?.total || 0);
      if (res.config) {
        setConfigForm({
          abandonmentThresholdMinutes: Number(res.config.abandonmentThresholdMinutes ?? 30),
          cartExpiryHours: Number(res.config.cartExpiryHours ?? 168),
          followUpCooldownHours: Number(res.config.followUpCooldownHours ?? 24),
        });
      }
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to load abandoned cart analytics.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [statusFilter, search, page]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, search]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/admin/abandoned-carts/config', {
        method: 'PUT',
        body: configForm,
      });
      setConfigOpen(false);
      setToast({ type: 'ok', text: res.message || 'Thresholds saved.' });
      await loadData();
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Failed to save configuration.',
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const openFollowUpModal = (cart: any) => {
    const itemsSummary = Array.isArray(cart.items)
      ? cart.items
          .map((it: any) => `${it.productName} (${it.quantity}${it.weightLabel ? ` × ${it.weightLabel}` : ` ${it.unit}`})`)
          .join(', ')
      : 'your selected dry fruits';
    setFollowUpTarget(cart);
    setFollowUpMsg(
      `Namaste ${cart.customerName},\n\nYour selection (${itemsSummary}) worth ${formatINR(
        cart.cartTotal
      )} is waiting at Seth And Sons DryFruits. Let us know if you would like any assistance completing your order!`
    );
  };

  const handleSendFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpTarget) return;
    setSubmittingFollowUp(true);
    try {
      const res = await apiRequest<{ whatsappUrl: string }>(`/api/admin/abandoned-carts/${followUpTarget.id}/follow-up`, {
        method: 'POST',
        body: { message: followUpMsg },
      });
      setFollowUpTarget(null);
      setToast({ type: 'ok', text: 'Follow-up recorded cleanly. Opening WhatsApp composer...' });
      if (res.whatsappUrl) {
        window.open(res.whatsappUrl, '_blank', 'noopener,noreferrer');
      }
      await loadData();
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Could not initiate WhatsApp follow-up.',
      });
    } finally {
      setSubmittingFollowUp(false);
    }
  };

  const handleExpireCart = async (cartId: string) => {
    try {
      await apiRequest(`/api/admin/abandoned-carts/${cartId}/expire`, { method: 'PUT', body: {} });
      setToast({ type: 'ok', text: 'Cart marked as expired.' });
      await loadData();
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Action failed.' });
    }
  };

  return (
    <AdminLayout
      title="Abandoned Cart Tracker"
      subtitle="Monitor inactive customer carts, track recovered orders & 7-day trends, and trigger consent-compliant WhatsApp follow-ups."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setConfigOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-[#E9E4D9] text-[#183D32] hover:bg-[#FAF3E3] cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-[#C8A96B]" />
            <span>Thresholds ({configForm.abandonmentThresholdMinutes}m)</span>
          </button>
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#183D32] text-white hover:bg-[#245746] cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#C8A96B]" />
            <span>Refresh</span>
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <AdminCard padding="p-4">
            <div className="flex items-center justify-between text-xs text-[#888B83] mb-1">
              <span>Abandoned Carts</span>
              <ShoppingCart className="w-4 h-4 text-[#C65B50]" />
            </div>
            <div className="text-2xl font-bold text-[#183D32]">
              {summary?.totalAbandonedCarts ?? 0}
            </div>
            <div className="text-[11px] text-[#5C6058] mt-1">
              {summary?.totalEverAbandoned ?? 0} total logged · {summary?.activeCartsCount ?? 0} active
            </div>
          </AdminCard>

          <AdminCard padding="p-4">
            <div className="flex items-center justify-between text-xs text-[#888B83] mb-1">
              <span>Potential Lost</span>
              <IndianRupee className="w-4 h-4 text-[#8F6C2B]" />
            </div>
            <div className="text-2xl font-bold text-[#8F6C2B]">
              {formatINR(summary?.potentialLostRevenue ?? 0)}
            </div>
            <div className="text-[11px] text-[#5C6058] mt-1">Unrecovered abandoned value</div>
          </AdminCard>

          <AdminCard padding="p-4">
            <div className="flex items-center justify-between text-xs text-[#888B83] mb-1">
              <span>Recovered Revenue</span>
              <CheckCircle2 className="w-4 h-4 text-[#245746]" />
            </div>
            <div className="text-2xl font-bold text-[#183D32]">
              {formatINR(summary?.recoveredCartRevenue ?? 0)}
            </div>
            <div className="text-[11px] text-[#245746] mt-1">
              {summary?.recoveredCartsCount ?? 0} recovered order(s)
            </div>
          </AdminCard>

          <AdminCard padding="p-4">
            <div className="flex items-center justify-between text-xs text-[#888B83] mb-1">
              <span>Recovery Rate</span>
              <TrendingUp className="w-4 h-4 text-[#C8A96B]" />
            </div>
            <div className="text-2xl font-bold text-[#183D32]">
              {summary?.cartRecoveryRate ?? 0}%
            </div>
            <div className="text-[11px] text-[#5C6058] mt-1">Excludes cancelled/test orders</div>
          </AdminCard>

          <AdminCard padding="p-4">
            <div className="flex items-center justify-between text-xs text-[#888B83] mb-1">
              <span>Avg Duration</span>
              <Clock className="w-4 h-4 text-[#183D32]" />
            </div>
            <div className="text-2xl font-bold text-[#183D32]">
              {formatDurationMinutes(summary?.avgAbandonmentDurationMinutes ?? 0)}
            </div>
            <div className="text-[11px] text-[#5C6058] mt-1">Avg abandonment window</div>
          </AdminCard>

          <AdminCard padding="p-4">
            <div className="flex items-center justify-between text-xs text-[#888B83] mb-1">
              <span>Expired Carts</span>
              <Ban className="w-4 h-4 text-[#888B83]" />
            </div>
            <div className="text-2xl font-bold text-[#5C6058]">
              {summary?.expiredCartsCount ?? 0}
            </div>
            <div className="text-[11px] text-[#5C6058] mt-1">
              After {configForm.cartExpiryHours}h inactivity
            </div>
          </AdminCard>
        </div>

        {/* 7-Day Trend Chart */}
        <AdminCard padding="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="font-admin-serif text-lg font-semibold text-[#183D32]">
                7-Day Abandoned vs Recovered Carts
              </h2>
              <p className="text-xs text-[#888B83]">
                Daily abandoned cart count compared with completed order recoveries over the past 7 days.
              </p>
            </div>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E9E4D9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#5C6058' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#5C6058' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E9E4D9',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="abandonedCount" name="Abandoned Carts" fill="#C8A96B" radius={[6, 6, 0, 0]} />
                <Bar dataKey="recoveredCount" name="Recovered Carts" fill="#183D32" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AdminCard>

        {/* Filter & Search Bar */}
        <AdminCard padding="p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'abandoned', 'recovered', 'expired', 'active'] as const).map(st => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize border cursor-pointer transition ${
                    statusFilter === st
                      ? 'bg-[#183D32] text-white border-[#183D32]'
                      : 'bg-[#F8F6F0] text-[#5C6058] border-[#E9E4D9] hover:border-[#C8A96B]'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-[#888B83] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search customer, phone, product..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923] focus:outline-none focus:border-[#183D32]"
              />
            </div>
          </div>

          <div className="mt-4">
            {loading ? (
              <LoadingSkeleton rows={4} />
            ) : carts.length === 0 ? (
              <EmptyState
                icon={ShoppingCart}
                title="No carts matched"
                description="Abandoned, active, recovered, and expired storefront carts appear here automatically once patrons add items."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E9E4D9] text-[#888B83] uppercase text-[10px]">
                      <th className="py-2.5 pr-3">Customer</th>
                      <th className="py-2.5 pr-3">Phone</th>
                      <th className="py-2.5 pr-3">Products & Quantities</th>
                      <th className="py-2.5 pr-3">Cart Total</th>
                      <th className="py-2.5 pr-3">Last Activity</th>
                      <th className="py-2.5 pr-3">Abandoned At</th>
                      <th className="py-2.5 pr-3">Status</th>
                      <th className="py-2.5 text-right">Follow-Up Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9E4D9]">
                    {carts.map(c => {
                      const elig = c.followUpEligibility || { eligible: false, reasonLabel: 'Unavailable' };
                      return (
                        <tr key={c.id} className="hover:bg-[#F8F6F0]/60 align-top">
                          <td className="py-3 pr-3">
                            <div className="font-semibold text-[#183D32]">{c.customerName}</div>
                            {c.customerEmail && (
                              <div className="text-[11px] text-[#888B83]">{c.customerEmail}</div>
                            )}
                            <div className="mt-1">
                              {c.marketingConsent ? (
                                <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-[#E7F3EE] text-[#183D32]">
                                  Consent Opt-In
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[#FCECEB] text-[#9E3D33]">
                                  <ShieldAlert className="w-3 h-3" />
                                  <span>{elig.reasonCode === 'opted_out' ? 'Opted Out / Unconsented' : 'Guest / No Consent'}</span>
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap text-[#252923]">
                            {c.customerPhone || <span className="text-[#888B83] italic">No phone</span>}
                          </td>
                          <td className="py-3 pr-3 max-w-xs">
                            <div className="space-y-1">
                              {(c.items || []).map((it: any, idx: number) => (
                                <div key={idx} className="text-[11px] text-[#252923]">
                                  <span className="font-medium text-[#183D32]">{it.productName}</span>{' '}
                                  <span className="text-[#5C6058]">
                                    ({it.quantity} {it.weightLabel || it.unit})
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 pr-3 font-bold text-[#183D32] whitespace-nowrap">
                            {formatINR(c.cartTotal || 0)}
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap text-[#5C6058]">
                            {new Date(c.lastActivityAt).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap text-[#5C6058]">
                            {c.abandonedAt ? new Date(c.abandonedAt).toLocaleString('en-IN') : '—'}
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap">
                            <StatusBadge
                              status={c.status}
                              tone={
                                c.status === 'recovered'
                                  ? 'emerald'
                                  : c.status === 'abandoned'
                                  ? 'gold'
                                  : c.status === 'expired'
                                  ? 'red'
                                  : 'blue'
                              }
                            />
                            {c.status === 'recovered' && c.recoveredOrderNumber && (
                              <div className="text-[10px] text-[#245746] font-semibold mt-1">
                                Order #{c.recoveredOrderNumber}
                              </div>
                            )}
                          </td>
                          <td className="py-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={!elig.eligible}
                                title={elig.reasonLabel}
                                onClick={() => openFollowUpModal(c)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#183D32] text-white hover:bg-[#245746] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                              >
                                <MessageCircle className="w-3.5 h-3.5 text-[#DFC471]" />
                                <span>Follow-Up</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setHistoryTarget(c)}
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium bg-[#F8F6F0] border border-[#E9E4D9] text-[#183D32] hover:bg-[#FAF3E3] cursor-pointer"
                                title="View Follow-Up History"
                              >
                                <History className="w-3.5 h-3.5" />
                                <span>({c.followUpCount || 0})</span>
                              </button>
                              {(c.status === 'active' || c.status === 'abandoned') && (
                                <button
                                  type="button"
                                  onClick={() => void handleExpireCart(c.id)}
                                  className="px-2 py-1.5 rounded-lg text-[11px] text-[#888B83] hover:text-[#C65B50] hover:bg-[#FCECEB] cursor-pointer"
                                  title="Mark Expired"
                                >
                                  Expire
                                </button>
                              )}
                            </div>
                            {!elig.eligible && c.status !== 'recovered' && (
                              <div className="text-[10px] text-[#888B83] mt-1">{elig.reasonLabel}</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
      </div>

      {/* Threshold Config Modal */}
      <AdminModal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        title="Abandoned Cart Rules"
        subtitle="Configure inactivity timing and anti-spam follow-up cooldown thresholds."
      >
        <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-[#183D32] mb-1">
              Abandonment Inactivity Threshold (minutes)
            </label>
            <input
              type="number"
              min={5}
              max={10080}
              required
              value={configForm.abandonmentThresholdMinutes}
              onChange={e =>
                setConfigForm(f => ({ ...f, abandonmentThresholdMinutes: Number(e.target.value) }))
              }
              className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3]"
            />
          </div>
          <div>
            <label className="block font-semibold text-[#183D32] mb-1">
              Cart Expiry Window (hours)
            </label>
            <input
              type="number"
              min={24}
              max={2160}
              required
              value={configForm.cartExpiryHours}
              onChange={e => setConfigForm(f => ({ ...f, cartExpiryHours: Number(e.target.value) }))}
              className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3]"
            />
          </div>
          <div>
            <label className="block font-semibold text-[#183D32] mb-1">
              WhatsApp Follow-Up Cooldown (hours)
            </label>
            <input
              type="number"
              min={1}
              max={720}
              required
              value={configForm.followUpCooldownHours}
              onChange={e =>
                setConfigForm(f => ({ ...f, followUpCooldownHours: Number(e.target.value) }))
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

      {/* WhatsApp Follow-Up Modal */}
      <AdminModal
        open={Boolean(followUpTarget)}
        onClose={() => setFollowUpTarget(null)}
        title="Initiate WhatsApp Follow-Up"
        subtitle={
          followUpTarget
            ? `Customer: ${followUpTarget.customerName} (${followUpTarget.customerPhone})`
            : ''
        }
      >
        <form onSubmit={handleSendFollowUp} className="space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-[#E7F3EE] border border-[#B7DEC9] text-[#183D32]">
            Consent verified. Logging this follow-up enforces the {configForm.followUpCooldownHours}h
            cooldown to prevent duplicate messages.
          </div>
          <div>
            <label className="block font-semibold text-[#183D32] mb-1">Message Text</label>
            <textarea
              rows={5}
              required
              value={followUpMsg}
              onChange={e => setFollowUpMsg(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#D8D1C3]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setFollowUpTarget(null)}
              className="px-4 py-2 rounded-xl bg-[#F8F6F0] text-[#5C6058] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingFollowUp}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#183D32] text-white font-semibold cursor-pointer disabled:opacity-50"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#DFC471]" />
              <span>{submittingFollowUp ? 'Recording...' : 'Log & Open WhatsApp'}</span>
            </button>
          </div>
        </form>
      </AdminModal>

      {/* Follow-Up History Modal */}
      <AdminModal
        open={Boolean(historyTarget)}
        onClose={() => setHistoryTarget(null)}
        title="Follow-Up History"
        subtitle={historyTarget ? `${historyTarget.customerName} • ${historyTarget.followUpCount || 0} touch(es)` : ''}
      >
        {!historyTarget?.followUps?.length ? (
          <p className="text-xs text-[#888B83] py-4">No WhatsApp follow-ups initiated for this cart yet.</p>
        ) : (
          <div className="space-y-2.5 text-xs">
            {historyTarget.followUps.map((f: any) => (
              <div key={f.id} className="p-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] space-y-1">
                <div className="flex items-center justify-between font-semibold text-[#183D32]">
                  <span>Sent by {f.sentByAdminName}</span>
                  <span className="text-[11px] font-normal text-[#5C6058]">
                    {new Date(f.sentAt).toLocaleString('en-IN')}
                  </span>
                </div>
                <p className="text-[#252923] whitespace-pre-wrap">{f.message}</p>
              </div>
            ))}
          </div>
        )}
      </AdminModal>
    </AdminLayout>
  );
}
