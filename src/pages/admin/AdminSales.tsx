import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  IndianRupee,
  TrendingUp,
  TrendingDown,
  Receipt,
  Percent,
  Download,
  BarChart3,
  Eye,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import AdminLayout from '../../components/AdminLayout';
import { AdminPdfViewerModal } from '../../components/admin/AdminPdfViewerModal';
import { AdminCard, EmptyState, LoadingSkeleton, ToastBanner } from '../../components/admin/AdminUI';
import { apiRequest, ApiError } from '../../services/api';
import { formatINR } from '../../utils/priceCalculator';

interface FinanceSummary {
  grossSales: number;
  totalDiscounts: number;
  totalRefunds: number;
  netSales: number;
  gstCollected: number;
  cogs: number;
  purchaseCosts: number;
  operatingExpenses: number;
  estimatedGrossProfit: number;
  estimatedNetProfit: number;
  expensesByCategory: Array<{ category: string; total: number }>;
}

const EXP_COLORS = ['#183D32', '#245746', '#C8A96B', '#6B8F71', '#888B83', '#C65B50'];

export default function AdminSales() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const [finRes, anaRes] = await Promise.all([
        apiRequest<{ summary: FinanceSummary }>(`/api/admin/finance/summary?${qs.toString()}`),
        apiRequest<any>(`/api/admin/dashboard/analytics?period=${period}`),
      ]);
      setSummary(finRes.summary);
      setAnalytics(anaRes);
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to load sales & financial telemetry.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [from, to, period]);

  const exportUrl = (format: 'pdf' | 'xlsx' | 'csv') => {
    const qs = new URLSearchParams({ type: 'profit_loss', format });
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return `/api/admin/reports/export?${qs.toString()}`;
  };

  return (
    <AdminLayout
      title="Sales, Revenue & Profit"
      subtitle="Transparent P&L accounting separating gross sales, GST, COGS, purchase inflow, and operating expenses."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPdfPreviewOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#E9E4D9] text-xs font-medium text-[#183D32] hover:bg-[#F8F6F0] cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-[#183D32]" />
            <span>View P&amp;L PDF</span>
          </button>
          <a
            href={exportUrl('pdf')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#E9E4D9] text-xs font-medium text-[#183D32] hover:bg-[#F8F6F0]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>P&amp;L PDF</span>
          </a>
          <a
            href={exportUrl('xlsx')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#183D32] text-white text-xs font-medium hover:bg-[#245746]"
          >
            <Download className="w-3.5 h-3.5 text-[#C8A96B]" />
            <span>Export Excel</span>
          </a>
        </div>
      }
    >
      <div className="space-y-6">
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

        {/* Filters */}
        <AdminCard padding="p-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#888B83] mb-1">From Date</label>
                <input
                  type="date"
                  value={from}
                  onChange={e => setFrom(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] text-xs text-[#252923] focus:outline-none focus:border-[#183D32]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#888B83] mb-1">To Date</label>
                <input
                  type="date"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] text-xs text-[#252923] focus:outline-none focus:border-[#183D32]"
                />
              </div>
              {(from || to) && (
                <button
                  type="button"
                  onClick={() => {
                    setFrom('');
                    setTo('');
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-medium text-[#C65B50] bg-[#FCECEB] hover:bg-[#f9dfdd] cursor-pointer"
                >
                  Clear Dates
                </button>
              )}
            </div>

            <div className="inline-flex items-center gap-1 bg-[#F8F6F0] border border-[#E9E4D9] rounded-xl p-1 text-xs">
              {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg capitalize font-medium cursor-pointer transition-colors ${
                    period === p
                      ? 'bg-[#183D32] text-white'
                      : 'text-[#5C6058] hover:text-[#183D32]'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </AdminCard>

        {loading ? (
          <LoadingSkeleton rows={6} />
        ) : !summary ? (
          <AdminCard className="text-center py-10 space-y-3">
            <p className="text-sm text-[#5C6058]">
              {toast?.text || 'Unable to load sales & financial telemetry.'}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="px-4 py-2 rounded-xl bg-[#183D32] text-white text-xs font-semibold cursor-pointer hover:bg-[#245746]"
            >
              Retry
            </button>
          </AdminCard>
        ) : (
          <>
            {/* Top 5 Financial KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <AdminCard padding="p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#183D32] text-[#C8A96B] flex items-center justify-center shrink-0">
                    <IndianRupee className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] text-[#888B83]">Net Sales (excl. Tax)</div>
                    <div className="text-lg font-bold text-[#252923] tabular-nums">
                      {formatINR(summary.netSales)}
                    </div>
                    <div className="text-[11px] text-[#888B83]">
                      Gross {formatINR(summary.grossSales)}
                    </div>
                  </div>
                </div>
              </AdminCard>

              <AdminCard padding="p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#245746] text-[#C8A96B] flex items-center justify-center shrink-0">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] text-[#888B83]">Est. Gross Profit</div>
                    <div className="text-lg font-bold text-[#183D32] tabular-nums">
                      {formatINR(summary.estimatedGrossProfit)}
                    </div>
                    <div className="text-[11px] text-[#888B83]">
                      COGS {formatINR(summary.cogs)}
                    </div>
                  </div>
                </div>
              </AdminCard>

              <AdminCard padding="p-5">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      summary.estimatedNetProfit >= 0
                        ? 'bg-[#E7F3EE] text-[#183D32]'
                        : 'bg-[#FCECEB] text-[#C65B50]'
                    }`}
                  >
                    {summary.estimatedNetProfit >= 0 ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] text-[#888B83]">Est. Net Profit</div>
                    <div
                      className={`text-lg font-bold tabular-nums ${
                        summary.estimatedNetProfit >= 0 ? 'text-[#183D32]' : 'text-[#C65B50]'
                      }`}
                    >
                      {formatINR(summary.estimatedNetProfit)}
                    </div>
                    <div className="text-[11px] text-[#888B83]">
                      After OpEx {formatINR(summary.operatingExpenses)}
                    </div>
                  </div>
                </div>
              </AdminCard>

              <AdminCard padding="p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#FAF3E3] text-[#8F6C2B] flex items-center justify-center shrink-0">
                    <Percent className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] text-[#888B83]">GST Collected</div>
                    <div className="text-lg font-bold text-[#252923] tabular-nums">
                      {formatINR(summary.gstCollected)}
                    </div>
                    <div className="text-[11px] text-[#888B83]">
                      Discounts {formatINR(summary.totalDiscounts)}
                    </div>
                  </div>
                </div>
              </AdminCard>

              <AdminCard padding="p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#FCECEB] text-[#C65B50] flex items-center justify-center shrink-0">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] text-[#888B83]">Operating Expenses</div>
                    <div className="text-lg font-bold text-[#252923] tabular-nums">
                      {formatINR(summary.operatingExpenses)}
                    </div>
                    <div className="text-[11px] text-[#888B83]">
                      Stock Purchases {formatINR(summary.purchaseCosts)}
                    </div>
                  </div>
                </div>
              </AdminCard>
            </div>

            {/* Revenue & Category Performance Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <AdminCard className="lg:col-span-7">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-admin-serif text-lg font-semibold text-[#183D32]">
                      Revenue vs Gross Margin Trend
                    </h2>
                    <p className="text-xs text-[#888B83] capitalize">
                      {period} order revenue &amp; estimated gross profit
                    </p>
                  </div>
                  <Link to="/admin/reports" className="text-xs font-semibold text-[#245746] hover:underline">
                    Full Reports →
                  </Link>
                </div>
                {analytics?.charts?.revenueSeries?.length ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analytics.charts.revenueSeries}>
                        <defs>
                          <linearGradient id="salesRevGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#183D32" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#183D32" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E9E4D9" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888B83' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#888B83' }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#FFFFFF',
                            borderColor: '#E9E4D9',
                            borderRadius: '12px',
                            fontSize: '12px',
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          name="Revenue (₹)"
                          stroke="#183D32"
                          strokeWidth={2.5}
                          fill="url(#salesRevGrad)"
                        />
                        <Area
                          type="monotone"
                          dataKey="profit"
                          name="Est. Margin (₹)"
                          stroke="#C8A96B"
                          strokeWidth={2}
                          fillOpacity={0}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState
                    icon={BarChart3}
                    title="No revenue points yet"
                    description="Completed orders will automatically plot revenue and gross margin curves."
                  />
                )}
              </AdminCard>

              <AdminCard className="lg:col-span-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-admin-serif text-lg font-semibold text-[#183D32]">
                      Operating Expenses Breakdown
                    </h2>
                    <p className="text-xs text-[#888B83]">Cost centers across selected period</p>
                  </div>
                  <Link to="/admin/expenses" className="text-xs font-semibold text-[#245746] hover:underline">
                    Manage →
                  </Link>
                </div>
                {summary.expensesByCategory.length === 0 ? (
                  <EmptyState
                    icon={Receipt}
                    title="No expenses recorded"
                    description="Log Rent, Packaging, Staff Salary, or Shipping expenses to track net margins."
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={summary.expensesByCategory}
                            dataKey="total"
                            nameKey="category"
                            cx="50%"
                            cy="50%"
                            innerRadius={38}
                            outerRadius={68}
                            paddingAngle={3}
                          >
                            {summary.expensesByCategory.map((_, i) => (
                              <Cell key={i} fill={EXP_COLORS[i % EXP_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-2 text-xs">
                      {summary.expensesByCategory.map((item, i) => (
                        <div key={item.category} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: EXP_COLORS[i % EXP_COLORS.length] }}
                            />
                            <span className="truncate text-[#252923] font-medium">{item.category}</span>
                          </div>
                          <span className="font-semibold text-[#183D32] tabular-nums">
                            {formatINR(item.total)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </AdminCard>
            </div>

            {/* Category Revenue + P&L Statement */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <AdminCard className="lg:col-span-5">
                <h3 className="font-admin-serif text-lg font-semibold text-[#183D32] mb-1">
                  Category Revenue Split
                </h3>
                <p className="text-xs text-[#888B83] mb-4">Top performing dry-fruit collections</p>
                {analytics?.charts?.categoryRevenue?.length ? (
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.charts.categoryRevenue}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E9E4D9" />
                        <XAxis dataKey="category" tick={{ fontSize: 10, fill: '#888B83' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#888B83' }} />
                        <Tooltip />
                        <Bar dataKey="revenue" name="Revenue (₹)" fill="#245746" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState
                    icon={BarChart3}
                    title="No category sales"
                    description="Category totals populate automatically from placed orders."
                  />
                )}
              </AdminCard>

              <AdminCard className="lg:col-span-7">
                <h3 className="font-admin-serif text-lg font-semibold text-[#183D32] mb-1">
                  Profit &amp; Loss Statement (Estimated)
                </h3>
                <p className="text-xs text-[#888B83] mb-4">
                  Accrual-aligned summary separating inventory asset purchases from direct COGS
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#E9E4D9] text-[#888B83] text-left">
                        <th className="py-2.5 font-medium">Ledger Line</th>
                        <th className="py-2.5 font-medium">Basis</th>
                        <th className="py-2.5 font-medium text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E9E4D9]">
                      <tr>
                        <td className="py-3 font-medium text-[#252923]">Gross Sales</td>
                        <td className="py-3 text-[#888B83]">Pre-discount item subtotal (excl. cancelled)</td>
                        <td className="py-3 text-right font-semibold tabular-nums">{formatINR(summary.grossSales)}</td>
                      </tr>
                      <tr>
                        <td className="py-3 font-medium text-[#C65B50]">Less: Discounts &amp; Coupons</td>
                        <td className="py-3 text-[#888B83]">Promotional deductions</td>
                        <td className="py-3 text-right font-semibold text-[#C65B50] tabular-nums">
                          -{formatINR(summary.totalDiscounts)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 font-medium text-[#C65B50]">Less: Returns &amp; Refunds</td>
                        <td className="py-3 text-[#888B83]">Returned/cancelled/refunded orders</td>
                        <td className="py-3 text-right font-semibold text-[#C65B50] tabular-nums">
                          -{formatINR(summary.totalRefunds)}
                        </td>
                      </tr>
                      <tr className="bg-[#F8F6F0]">
                        <td className="py-3 px-2 font-bold text-[#183D32]">Net Sales (excl. GST)</td>
                        <td className="py-3 text-[#5C6058]">Recognized product revenue</td>
                        <td className="py-3 px-2 text-right font-bold text-[#183D32] tabular-nums">
                          {formatINR(summary.netSales)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 font-medium text-[#C65B50]">Less: Cost of Goods Sold (COGS)</td>
                        <td className="py-3 text-[#888B83]">Weighted unit purchase cost of sold qty</td>
                        <td className="py-3 text-right font-semibold text-[#C65B50] tabular-nums">
                          -{formatINR(summary.cogs)}
                        </td>
                      </tr>
                      <tr className="bg-[#FAF3E3]/50">
                        <td className="py-3 px-2 font-bold text-[#183D32]">Estimated Gross Profit</td>
                        <td className="py-3 text-[#5C6058]">Net Sales - COGS</td>
                        <td className="py-3 px-2 text-right font-bold text-[#183D32] tabular-nums">
                          {formatINR(summary.estimatedGrossProfit)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 font-medium text-[#C65B50]">Less: Operating Expenses</td>
                        <td className="py-3 text-[#888B83]">Rent, packaging, salaries, freight, marketing</td>
                        <td className="py-3 text-right font-semibold text-[#C65B50] tabular-nums">
                          -{formatINR(summary.operatingExpenses)}
                        </td>
                      </tr>
                      <tr className="bg-[#E7F3EE]">
                        <td className="py-3.5 px-2 font-bold text-[#183D32]">Estimated Net Profit</td>
                        <td className="py-3.5 text-[#245746]">Gross Profit - Operating Expenses</td>
                        <td className="py-3.5 px-2 text-right font-bold text-[#183D32] text-sm tabular-nums">
                          {formatINR(summary.estimatedNetProfit)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 font-medium text-[#5C6058]">Memo: GST Collected (Output Tax)</td>
                        <td className="py-3 text-[#888B83]">Pass-through tax liability (excluded from sales)</td>
                        <td className="py-3 text-right font-medium text-[#5C6058] tabular-nums">
                          {formatINR(summary.gstCollected)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 font-medium text-[#5C6058]">Memo: Inventory Purchase Costs</td>
                        <td className="py-3 text-[#888B83]">Supplier PO outflow (capitalized to stock)</td>
                        <td className="py-3 text-right font-medium text-[#5C6058] tabular-nums">
                          {formatINR(summary.purchaseCosts)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </AdminCard>
            </div>
          </>
        )}
      </div>

      <AdminPdfViewerModal
        open={pdfPreviewOpen}
        title="Profit & Loss Statement (PDF)"
        subtitle="Audited P&L summary exported from Admin Sales & Revenue"
        src={exportUrl('pdf')}
        onClose={() => setPdfPreviewOpen(false)}
      />
    </AdminLayout>
  );
}

