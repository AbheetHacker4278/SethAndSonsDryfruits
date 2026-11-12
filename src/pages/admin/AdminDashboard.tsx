import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingCart,
  Users,
  IndianRupee,
  Package,
  Boxes,
  Mail,
  TrendingUp,
  ArrowRight,
  Calendar,
  Megaphone,
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
import { AdminCard, LoadingSkeleton, StatusBadge, ToastBanner } from '../../components/admin/AdminUI';
import { ApiError, apiRequest } from '../../services/api';
import { formatINR } from '../../utils/priceCalculator';

const PIE_COLORS = ['#183D32', '#245746', '#C8A96B', '#6B8F71', '#888B83', '#C65B50'];

export default function AdminDashboard() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadAnalytics = async (targetPeriod: typeof period) => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiRequest(`/api/admin/dashboard/analytics?period=${targetPeriod}`);
      setData(res);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : 'Unable to load dashboard analytics right now.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAnalytics(period);
  }, [period]);

  return (
    <AdminLayout
      title="Admin Dashboard"
      subtitle="Welcome back! Real-time store performance, inventory valuation, and order telemetry."
      actions={
        <div className="inline-flex items-center gap-1 bg-white border border-[#E9E4D9] rounded-xl p-1 text-xs">
          {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(p => (
            <button
              key={p}
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
      }
    >
      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : !data ? (
        <div className="space-y-4">
          <ToastBanner
            toast={{ type: 'err', text: loadError || 'Unable to load dashboard analytics.' }}
            onDismiss={() => setLoadError('')}
          />
          <AdminCard className="text-center py-10 space-y-3">
            <p className="text-sm text-[#5C6058]">
              {loadError || 'Unable to connect to analytics service.'}
            </p>
            <button
              type="button"
              onClick={() => void loadAnalytics(period)}
              className="px-4 py-2 rounded-xl bg-[#183D32] text-white text-xs font-semibold cursor-pointer hover:bg-[#245746]"
            >
              Retry Loading Dashboard
            </button>
          </AdminCard>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 5 Luxury KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <AdminCard padding="p-5">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-full bg-[#183D32] text-[#C8A96B] flex items-center justify-center shrink-0">
                  <IndianRupee className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-[#888B83]">Total Revenue</div>
                  <div className="text-xl font-bold text-[#252923] tabular-nums">
                    {formatINR(data.kpis.revenue.total)}
                  </div>
                  <div className="text-[11px] font-semibold text-[#245746] flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    <span>{data.kpis.revenue.growthPercent >= 0 ? '+' : ''}{data.kpis.revenue.growthPercent}% vs prev 30d</span>
                  </div>
                </div>
              </div>
            </AdminCard>

            <AdminCard padding="p-5">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-full bg-[#183D32] text-[#C8A96B] flex items-center justify-center shrink-0">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-[#888B83]">Total Orders</div>
                  <div className="text-xl font-bold text-[#252923] tabular-nums">
                    {data.kpis.orders.total}
                  </div>
                  <div className="text-[11px] text-[#888B83]">
                    {data.kpis.orders.completed} delivered • {data.kpis.orders.pending} pending
                  </div>
                </div>
              </div>
            </AdminCard>

            <AdminCard padding="p-5">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-full bg-[#183D32] text-[#C8A96B] flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-[#888B83]">Total Products</div>
                  <div className="text-xl font-bold text-[#252923] tabular-nums">
                    {data.kpis.products.active} Active
                  </div>
                  <div className="text-[11px] text-[#C65B50] font-medium">
                    {data.kpis.products.outOfStock} out • {data.kpis.products.lowStock} low stock
                  </div>
                </div>
              </div>
            </AdminCard>

            <AdminCard padding="p-5">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-full bg-[#183D32] text-[#C8A96B] flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-[#888B83]">Total Customers</div>
                  <div className="text-xl font-bold text-[#252923] tabular-nums">
                    {data.kpis.customers.total}
                  </div>
                  <div className="text-[11px] text-[#245746]">
                    +{data.kpis.customers.newThisMonth} this month • {data.kpis.customers.returning} returning
                  </div>
                </div>
              </div>
            </AdminCard>

            <AdminCard padding="p-5">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-full bg-[#183D32] text-[#C8A96B] flex items-center justify-center shrink-0">
                  <Boxes className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-[#888B83]">Inventory Value</div>
                  <div className="text-xl font-bold text-[#252923] tabular-nums">
                    {formatINR(data.kpis.inventory.valuation)}
                  </div>
                  <div className="text-[11px] text-[#888B83]">
                    {data.kpis.inventory.totalStockQty} units • {data.kpis.inventory.lowStockAlerts} alerts
                  </div>
                </div>
              </div>
            </AdminCard>
          </div>

          {/* Primary Row: Revenue Overview Chart + Recent Orders */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <AdminCard className="lg:col-span-7">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-admin-serif text-lg font-semibold text-[#183D32]">
                    Revenue &amp; Profit Overview
                  </h2>
                  <p className="text-xs text-[#888B83] capitalize">{period} trend from real orders</p>
                </div>
                <Link to="/admin/sales" className="text-xs font-semibold text-[#245746] hover:underline">
                  Financials →
                </Link>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.charts.revenueSeries}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
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
                      fill="url(#revGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="profit"
                      name="Gross Margin (₹)"
                      stroke="#C8A96B"
                      strokeWidth={2}
                      fillOpacity={0}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </AdminCard>

            <AdminCard className="lg:col-span-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-admin-serif text-lg font-semibold text-[#183D32]">Recent Orders</h2>
                <Link to="/admin/orders" className="text-xs font-semibold text-[#245746] hover:underline">
                  View All →
                </Link>
              </div>
              <div className="divide-y divide-[#E9E4D9]">
                {data.recentOrders.length === 0 ? (
                  <p className="text-xs text-[#888B83] py-6 text-center">No orders yet.</p>
                ) : (
                  data.recentOrders.map((ord: any) => (
                    <div key={ord.id} className="py-3 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-semibold text-[#183D32] truncate">#{ord.orderNumber}</div>
                        <div className="text-[#888B83] truncate">{ord.customerName}</div>
                      </div>
                      <div className="font-bold text-[#252923] tabular-nums">
                        {formatINR(ord.totalAmount)}
                      </div>
                      <StatusBadge status={ord.status} />
                    </div>
                  ))
                )}
              </div>
            </AdminCard>
          </div>

          {/* Secondary Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AdminCard>
              <h3 className="font-admin-serif text-lg font-semibold text-[#183D32] mb-3">
                Category Revenue
              </h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.charts.categoryRevenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E9E4D9" />
                    <XAxis dataKey="category" tick={{ fontSize: 10, fill: '#888B83' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#888B83' }} />
                    <Tooltip />
                    <Bar dataKey="revenue" name="Revenue (₹)" fill="#245746" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </AdminCard>

            <AdminCard>
              <h3 className="font-admin-serif text-lg font-semibold text-[#183D32] mb-3">
                Profit vs. Operating Expenses
              </h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.charts.profitVsExpense || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E9E4D9" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#888B83' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#888B83' }} />
                    <Tooltip />
                    <Bar dataKey="grossProfit" name="Gross Profit (₹)" fill="#183D32" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="expenses" name="Expenses (₹)" fill="#C65B50" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="netProfit" name="Net Profit (₹)" fill="#C8A96B" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </AdminCard>

            <AdminCard>
              <h3 className="font-admin-serif text-lg font-semibold text-[#183D32] mb-3">
                Order Status Distribution
              </h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.charts.orderStatusDistribution}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={72}
                      paddingAngle={3}
                    >
                      {(data.charts.orderStatusDistribution || []).map((_: any, i: number) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </AdminCard>

            <AdminCard>
              <h3 className="font-admin-serif text-lg font-semibold text-[#183D32] mb-3">
                Customer Acquisition
              </h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.charts.customerAcquisition}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E9E4D9" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#888B83' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#888B83' }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="customers" name="New Patrons" fill="#C8A96B" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </AdminCard>
          </div>

          {/* Bottom Trio: Email Communications + Best-Selling Products + Upcoming Campaigns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <AdminCard>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-admin-serif text-lg font-semibold text-[#183D32]">
                  Email Communications
                </h3>
                <Link to="/admin/communications" className="text-xs font-semibold text-[#245746] hover:underline">
                  View Details →
                </Link>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#E7F3EE] text-[#183D32] flex items-center justify-center">
                  <Mail className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#183D32]">{data.kpis.email.deliveryRate}%</div>
                  <div className="text-xs text-[#888B83]">
                    Delivery Rate ({data.kpis.email.totalSent} emails)
                  </div>
                  <div className="text-[11px] text-[#245746] mt-0.5">
                    Provider: {data.provider.mode}
                  </div>
                </div>
              </div>
            </AdminCard>

            <AdminCard>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-admin-serif text-lg font-semibold text-[#183D32]">Top Products</h3>
                <Link to="/admin/products" className="text-xs font-semibold text-[#245746] hover:underline">
                  View All →
                </Link>
              </div>
              <div className="space-y-3">
                {data.charts.bestSellingProducts.slice(0, 3).map((p: any) => (
                  <div key={p.productId} className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img src={p.productImage} alt={p.productName} className="w-9 h-9 rounded-lg object-cover border border-[#E9E4D9]" />
                      <div className="truncate">
                        <div className="font-semibold text-[#252923] truncate">{p.productName}</div>
                        <div className="text-[#888B83]">{p.unitsSold} units sold</div>
                      </div>
                    </div>
                    <span className="font-bold text-[#183D32]">{formatINR(p.revenue)}</span>
                  </div>
                ))}
              </div>
            </AdminCard>

            <AdminCard>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-admin-serif text-lg font-semibold text-[#183D32]">
                  Upcoming Campaigns
                </h3>
                <Megaphone className="w-4 h-4 text-[#C8A96B]" />
              </div>
              {data.upcomingCampaigns.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-[#888B83]">No scheduled festival campaigns queued.</p>
                  <Link
                    to="/admin/marketing"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#183D32] text-white"
                  >
                    <span>Manage Campaigns</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.upcomingCampaigns.map((c: any) => (
                    <div key={c.id} className="p-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs">
                      <div className="font-semibold text-[#183D32]">{c.campaignName}</div>
                      <div className="text-[#888B83] flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        <span>{c.scheduledAt ? new Date(c.scheduledAt).toLocaleDateString('en-IN') : 'Draft'}</span>
                      </div>
                    </div>
                  ))}
                  <Link
                    to="/admin/marketing"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#183D32] text-white"
                  >
                    <span>Manage Campaigns</span>
                  </Link>
                </div>
              )}
            </AdminCard>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
