import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin,
  Building2,
  Globe,
  ShoppingBag,
  IndianRupee,
  Users,
  TrendingUp,
  Download,
  RefreshCw,
  Search,
  ArrowUpDown,
  Award,
  ChevronRight,
  Truck,
  Sparkles,
} from 'lucide-react';
import {
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import AdminLayout from '../../components/AdminLayout';
import { AdminCard, EmptyState, LoadingSkeleton, ToastBanner } from '../../components/admin/AdminUI';
import InteractiveOrderLocationMap, {
  MapFocusTarget,
} from '../../components/admin/InteractiveOrderLocationMap';
import { apiRequest, ApiError } from '../../services/api';
import { formatINR } from '../../utils/priceCalculator';

interface StateStat {
  state: string;
  orderCount: number;
  totalRevenue: number;
  uniqueCustomers: number;
  averageOrderValue: number;
  orderShare: number;
  revenueShare: number;
  topCities: Array<{ city: string; count: number }>;
  latestOrderAt: string;
}

interface CityStat {
  city: string;
  state: string;
  orderCount: number;
  totalRevenue: number;
  uniqueCustomers: number;
  averageOrderValue: number;
  orderShare: number;
  revenueShare: number;
  isSurat: boolean;
  latestOrderAt: string;
}

interface LocationSummary {
  totalOrders: number;
  totalRevenue: number;
  totalCustomers: number;
  totalStates: number;
  totalCities: number;
  topState: StateStat | null;
  topCity: CityStat | null;
  suratOrders: number;
  suratRevenue: number;
  otherCitiesOrders: number;
  otherCitiesRevenue: number;
  averageOrderValue: number;
}

const PIE_COLORS = ['#183D32', '#C8A96B', '#245746', '#888B83', '#5C6058'];

export default function AdminOrderLocations() {
  const [period, setPeriod] = useState<'all' | '30d' | '90d' | 'year'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [activeTab, setActiveTab] = useState<'states' | 'cities'>('states');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'orders' | 'revenue'>('orders');

  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [summary, setSummary] = useState<LocationSummary | null>(null);
  const [states, setStates] = useState<StateStat[]>([]);
  const [cities, setCities] = useState<CityStat[]>([]);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [focusedLocation, setFocusedLocation] = useState<MapFocusTarget | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from || to) {
        if (from) qs.set('from', from);
        if (to) qs.set('to', to);
      } else {
        qs.set('period', period);
      }

      const res = await apiRequest<{
        period: string;
        summary: LocationSummary;
        states: StateStat[];
        cities: CityStat[];
      }>(`/api/admin/analytics/order-locations?${qs.toString()}`);

      setSummary(res.summary);
      setStates(res.states || []);
      setCities(res.cities || []);
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to load location order analytics.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [period, from, to]);

  // Client-side search and sorting
  const filteredStates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let result = states;
    if (q) {
      result = states.filter(
        s =>
          s.state.toLowerCase().includes(q) ||
          s.topCities.some(c => c.city.toLowerCase().includes(q))
      );
    }
    return [...result].sort((a, b) =>
      sortBy === 'orders' ? b.orderCount - a.orderCount : b.totalRevenue - a.totalRevenue
    );
  }, [states, searchQuery, sortBy]);

  const filteredCities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let result = cities;
    if (q) {
      result = cities.filter(
        c => c.city.toLowerCase().includes(q) || c.state.toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) =>
      sortBy === 'orders' ? b.orderCount - a.orderCount : b.totalRevenue - a.totalRevenue
    );
  }, [cities, searchQuery, sortBy]);

  // Surat vs Other Cities Hub Distribution
  const hubDistribution = useMemo(() => {
    if (!summary) return [];
    return [
      { name: 'Surat (Home Mandi)', value: summary.suratOrders, revenue: summary.suratRevenue },
      { name: 'Other Cities', value: summary.otherCitiesOrders, revenue: summary.otherCitiesRevenue },
    ].filter(d => d.value > 0);
  }, [summary]);

  const maxStateOrders = useMemo(() => {
    return states.length > 0 ? Math.max(...states.map(s => s.orderCount), 1) : 1;
  }, [states]);

  const maxCityOrders = useMemo(() => {
    return cities.length > 0 ? Math.max(...cities.map(c => c.orderCount), 1) : 1;
  }, [cities]);

  // Export CSV
  const handleExportCsv = () => {
    if (!cities.length && !states.length) {
      setToast({ type: 'err', text: 'No order location data to export.' });
      return;
    }

    const headers = [
      'Type',
      'Location Name',
      'State',
      'Order Count',
      'Total Revenue (INR)',
      'Unique Customers',
      'Average Order Value (INR)',
      'National Order Share (%)',
    ];

    const stateRows = states.map(s => [
      'State',
      `"${s.state}"`,
      `"${s.state}"`,
      s.orderCount,
      s.totalRevenue,
      s.uniqueCustomers,
      s.averageOrderValue,
      `${s.orderShare}%`,
    ]);

    const cityRows = cities.map(c => [
      'City',
      `"${c.city}"`,
      `"${c.state}"`,
      c.orderCount,
      c.totalRevenue,
      c.uniqueCustomers,
      c.averageOrderValue,
      `${c.orderShare}%`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...stateRows.map(r => r.join(',')), ...cityRows.map(r => r.join(','))].join(
        '\n'
      );

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `most_customer_ordered_locations_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setToast({ type: 'ok', text: 'Downloaded location order rankings as CSV.' });
  };

  return (
    <AdminLayout
      title="Most Customer Ordered State & City"
      subtitle="Live geographic distribution of customer demand, regional order volumes, and top purchasing hubs across India."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Period Filter Buttons */}
          <div className="inline-flex items-center gap-1 bg-white border border-[#E9E4D9] rounded-xl p-1 text-xs">
            {(
              [
                { id: 'all', label: 'All-Time' },
                { id: '30d', label: '30 Days' },
                { id: '90d', label: '90 Days' },
                { id: 'year', label: 'This Year' },
              ] as const
            ).map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setFrom('');
                  setTo('');
                  setPeriod(p.id);
                }}
                className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
                  period === p.id && !from && !to
                    ? 'bg-[#183D32] text-white shadow-xs'
                    : 'text-[#5C6058] hover:text-[#183D32]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Export CSV Button */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-[#E9E4D9] text-[#183D32] hover:bg-[#F8F6F0] cursor-pointer transition-all"
            title="Download CSV Spreadsheet of Most Ordered States and Cities"
          >
            <Download className="w-3.5 h-3.5 text-[#C8A96B]" />
            <span className="hidden sm:inline">Export</span> CSV
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={loadData}
            title="Refresh Location Telemetry"
            className="p-2 rounded-xl border border-[#E9E4D9] bg-white text-[#5C6058] hover:text-[#183D32] cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

        {loading && !summary ? (
          <LoadingSkeleton rows={6} />
        ) : (
          <>
            {/* Top 4 Luxury KPI Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Top State */}
              <AdminCard padding="p-5" className="relative overflow-hidden group hover:border-[#C8A96B]/50 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 rounded-xl bg-[#FAF3E3] text-[#8F6C2B] border border-[#E8D5A7]/60">
                    <Award className="w-5 h-5 text-[#C8A96B]" />
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#183D32] text-[#F8F6F0]">
                    #1 State
                  </span>
                </div>
                <div className="text-[11px] uppercase tracking-wider text-[#888B83] font-medium">
                  Most Ordered State
                </div>
                <div className="text-xl font-bold text-[#183D32] truncate mt-0.5">
                  {summary?.topState?.state || 'None Yet'}
                </div>
                <div className="mt-2.5 pt-2.5 border-t border-[#E9E4D9]/80 flex items-center justify-between text-xs">
                  <span className="text-[#5C6058] font-semibold">
                    {summary?.topState?.orderCount || 0} Orders
                  </span>
                  <span className="text-[#8F6C2B] font-semibold">
                    {formatINR(summary?.topState?.totalRevenue || 0)}
                  </span>
                </div>
              </AdminCard>

              {/* Card 2: Top City */}
              <AdminCard padding="p-5" className="relative overflow-hidden group hover:border-[#C8A96B]/50 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 rounded-xl bg-[#E7F3EE] text-[#183D32] border border-[#B7DEC9]/60">
                    <Building2 className="w-5 h-5 text-[#183D32]" />
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#245746] text-[#F8F6F0]">
                    #1 City
                  </span>
                </div>
                <div className="text-[11px] uppercase tracking-wider text-[#888B83] font-medium">
                  Most Ordered City
                </div>
                <div className="text-xl font-bold text-[#183D32] truncate mt-0.5">
                  {summary?.topCity?.city || 'None Yet'}
                </div>
                <div className="text-[11px] text-[#888B83] truncate">
                  {summary?.topCity?.state ? `State: ${summary.topCity.state}` : 'Direct Deliveries'}
                </div>
                <div className="mt-2 pt-2 border-t border-[#E9E4D9]/80 flex items-center justify-between text-xs">
                  <span className="text-[#183D32] font-semibold">
                    {summary?.topCity?.orderCount || 0} Orders
                  </span>
                  <span className="text-[#8F6C2B] font-semibold">
                    {formatINR(summary?.topCity?.totalRevenue || 0)}
                  </span>
                </div>
              </AdminCard>

              {/* Card 3: Reach / Geographic Spread */}
              <AdminCard padding="p-5" className="relative overflow-hidden group hover:border-[#C8A96B]/50 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 rounded-xl bg-[#EAF2FA] text-[#1E568A] border border-[#C3DCF2]/60">
                    <Globe className="w-5 h-5 text-[#1E568A]" />
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1E568A]">
                    Nationwide Reach
                  </span>
                </div>
                <div className="text-[11px] uppercase tracking-wider text-[#888B83] font-medium">
                  Covered Locations
                </div>
                <div className="text-xl font-bold text-[#183D32] mt-0.5">
                  {summary?.totalStates || 0} States &bull; {summary?.totalCities || 0} Cities
                </div>
                <div className="mt-2.5 pt-2.5 border-t border-[#E9E4D9]/80 flex items-center justify-between text-xs text-[#5C6058]">
                  <span>Surat: {summary?.suratOrders || 0} orders</span>
                  <span>Interstate: {summary?.otherCitiesOrders || 0}</span>
                </div>
              </AdminCard>

              {/* Card 4: Orders & Revenue */}
              <AdminCard padding="p-5" className="relative overflow-hidden group hover:border-[#C8A96B]/50 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2.5 rounded-xl bg-[#FAF3E3] text-[#8F6C2B] border border-[#E8D5A7]/60">
                    <ShoppingBag className="w-5 h-5 text-[#C8A96B]" />
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#8F6C2B]">
                    AOV: {formatINR(summary?.averageOrderValue || 0)}
                  </span>
                </div>
                <div className="text-[11px] uppercase tracking-wider text-[#888B83] font-medium">
                  Analyzed Order Value
                </div>
                <div className="text-xl font-bold text-[#183D32] mt-0.5">
                  {formatINR(summary?.totalRevenue || 0)}
                </div>
                <div className="mt-2.5 pt-2.5 border-t border-[#E9E4D9]/80 flex items-center justify-between text-xs text-[#5C6058]">
                  <span>{summary?.totalOrders || 0} Total Orders</span>
                  <span>{summary?.totalCustomers || 0} Customers</span>
                </div>
              </AdminCard>
            </div>

            {/* Interactive World & Indian States Map + Hub Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Interactive World Map including Indian States */}
              <AdminCard className={mapExpanded ? 'lg:col-span-3' : 'lg:col-span-2'}>
                <InteractiveOrderLocationMap
                  states={states}
                  cities={cities}
                  summary={summary}
                  focusedLocation={focusedLocation}
                  isExpanded={mapExpanded}
                  onToggleExpand={() => setMapExpanded(v => !v)}
                />
              </AdminCard>

              {/* Chart 2: Regional Hub Distribution (Surat vs Other Cities) */}
              <AdminCard className={mapExpanded ? 'lg:col-span-3' : ''}>
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-[#183D32]">Hub Distribution</h3>
                  <p className="text-xs text-[#888B83]">Surat Free Shipping vs Interstate Orders.</p>
                </div>

                {hubDistribution.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[#888B83]">No data available.</div>
                ) : (
                  <div className="h-52 w-full flex flex-col items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={hubDistribution}
                          innerRadius={50}
                          outerRadius={75}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {hubDistribution.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val: any) => [`${val} Orders`, 'Volume']}
                          contentStyle={{
                            backgroundColor: '#183D32',
                            color: '#F8F6F0',
                            borderRadius: '12px',
                            border: '1px solid #C8A96B',
                            fontSize: '12px',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>

                    <div className="w-full space-y-2 mt-2 pt-2 border-t border-[#E9E4D9] text-xs">
                      {hubDistribution.map((item, idx) => (
                        <div key={item.name} className="flex items-center justify-between text-[#5C6058]">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                            />
                            <span className="truncate">{item.name}</span>
                          </div>
                          <span className="font-semibold text-[#183D32]">
                            {item.value} ({summary?.totalOrders ? Math.round((item.value / summary.totalOrders) * 100) : 0}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </AdminCard>
            </div>

            {/* Dual Tabbed Ranking Section: States vs Cities */}
            <AdminCard padding="p-0" className="overflow-hidden">
              {/* Tab Header & Filter Controls */}
              <div className="p-4 sm:p-5 border-b border-[#E9E4D9] flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#FBF9F5]">
                {/* View Switcher Pills */}
                <div className="inline-flex items-center p-1 bg-white border border-[#E9E4D9] rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setActiveTab('states')}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg cursor-pointer transition-all ${
                      activeTab === 'states'
                        ? 'bg-[#183D32] text-white shadow-xs'
                        : 'text-[#5C6058] hover:text-[#183D32]'
                    }`}
                  >
                    <MapPin className="w-3.5 h-3.5 text-[#C8A96B]" />
                    <span>Rankings by State ({states.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('cities')}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg cursor-pointer transition-all ${
                      activeTab === 'cities'
                        ? 'bg-[#183D32] text-white shadow-xs'
                        : 'text-[#5C6058] hover:text-[#183D32]'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5 text-[#C8A96B]" />
                    <span>Rankings by City ({cities.length})</span>
                  </button>
                </div>

                {/* Search & Sort Controls */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Search Input */}
                  <div className="relative flex-1 sm:w-64">
                    <Search className="w-3.5 h-3.5 text-[#888B83] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder={activeTab === 'states' ? 'Search state or city...' : 'Search city or state...'}
                      className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white border border-[#E9E4D9] text-xs text-[#252923] placeholder-[#888B83] focus:outline-none focus:border-[#183D32]"
                    />
                  </div>

                  {/* Sort Toggle */}
                  <div className="inline-flex items-center gap-1 bg-white border border-[#E9E4D9] rounded-xl p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setSortBy('orders')}
                      className={`px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${
                        sortBy === 'orders'
                          ? 'bg-[#245746] text-white font-semibold'
                          : 'text-[#5C6058] hover:text-[#183D32]'
                      }`}
                      title="Sort by highest order count"
                    >
                      Most Orders
                    </button>
                    <button
                      type="button"
                      onClick={() => setSortBy('revenue')}
                      className={`px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${
                        sortBy === 'revenue'
                          ? 'bg-[#245746] text-white font-semibold'
                          : 'text-[#5C6058] hover:text-[#183D32]'
                      }`}
                      title="Sort by highest total revenue"
                    >
                      Highest Revenue
                    </button>
                  </div>
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto">
                {activeTab === 'states' ? (
                  // STATE RANKINGS TABLE
                  <table className="w-full text-left text-xs text-[#252923]">
                    <thead className="bg-[#F8F6F0] text-[#5C6058] font-semibold border-b border-[#E9E4D9]">
                      <tr>
                        <th className="py-3 px-4 w-14">Rank</th>
                        <th className="py-3 px-4">State</th>
                        <th className="py-3 px-4 w-44">Order Density</th>
                        <th className="py-3 px-4 text-right">Orders</th>
                        <th className="py-3 px-4 text-right">Revenue (INR)</th>
                        <th className="py-3 px-4 text-right">Customers</th>
                        <th className="py-3 px-4 text-right">Avg Order Value</th>
                        <th className="py-3 px-4 text-right">Share</th>
                        <th className="py-3 px-4">Top Cities in State</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E9E4D9]">
                      {filteredStates.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-[#888B83]">
                            No state orders matched your criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredStates.map((st, idx) => {
                          const percentOfMax = Math.round((st.orderCount / maxStateOrders) * 100);
                          const isTop3 = idx < 3;
                          return (
                            <tr
                              key={st.state}
                              onClick={() => {
                                setFocusedLocation({ type: 'state', name: st.state, ts: Date.now() });
                                window.scrollTo({ top: 180, behavior: 'smooth' });
                              }}
                              title={`Click to locate ${st.state} on the interactive map`}
                              className={`hover:bg-[#FAF8F3] transition-colors cursor-pointer ${
                                idx === 0 ? 'bg-[#FAF3E3]/20 font-medium' : ''
                              }`}
                            >
                              <td className="py-3.5 px-4 font-bold">
                                {idx === 0 ? (
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#FAF3E3] text-[#8F6C2B] border border-[#E8D5A7] text-[11px]">
                                    #1
                                  </span>
                                ) : idx === 1 ? (
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#F3F4F6] text-[#4B5563] border border-[#D1D5DB] text-[11px]">
                                    #2
                                  </span>
                                ) : idx === 2 ? (
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#FFF7ED] text-[#C2410C] border border-[#FED7AA] text-[11px]">
                                    #3
                                  </span>
                                ) : (
                                  <span className="text-[#888B83] pl-1">#{idx + 1}</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 font-semibold text-[#183D32]">
                                <div className="flex items-center gap-1.5">
                                  <MapPin className="w-3.5 h-3.5 text-[#C8A96B] shrink-0" />
                                  <span>{st.state}</span>
                                </div>
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="space-y-1">
                                  <div className="w-full bg-[#E9E4D9] h-2 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        isTop3 ? 'bg-[#C8A96B]' : 'bg-[#183D32]'
                                      }`}
                                      style={{ width: `${Math.max(percentOfMax, 6)}%` }}
                                    />
                                  </div>
                                  <div className="text-[10px] text-[#888B83]">
                                    {st.orderShare}% of national volume
                                  </div>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 text-right font-bold text-[#183D32]">
                                {st.orderCount}
                              </td>
                              <td className="py-3.5 px-4 text-right font-semibold text-[#8F6C2B]">
                                {formatINR(st.totalRevenue)}
                              </td>
                              <td className="py-3.5 px-4 text-right text-[#5C6058]">
                                {st.uniqueCustomers}
                              </td>
                              <td className="py-3.5 px-4 text-right font-medium text-[#183D32]">
                                {formatINR(st.averageOrderValue)}
                              </td>
                              <td className="py-3.5 px-4 text-right text-[#5C6058] font-semibold">
                                {st.orderShare}%
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="flex flex-wrap gap-1">
                                  {st.topCities.map(c => (
                                    <span
                                      key={c.city}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-white border border-[#E9E4D9] text-[#5C6058]"
                                    >
                                      <span>{c.city}</span>
                                      <span className="font-semibold text-[#183D32]">({c.count})</span>
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                ) : (
                  // CITY RANKINGS TABLE
                  <table className="w-full text-left text-xs text-[#252923]">
                    <thead className="bg-[#F8F6F0] text-[#5C6058] font-semibold border-b border-[#E9E4D9]">
                      <tr>
                        <th className="py-3 px-4 w-14">Rank</th>
                        <th className="py-3 px-4">City</th>
                        <th className="py-3 px-4">State</th>
                        <th className="py-3 px-4 w-44">Order Density</th>
                        <th className="py-3 px-4 text-right">Orders</th>
                        <th className="py-3 px-4 text-right">Revenue (INR)</th>
                        <th className="py-3 px-4 text-right">Customers</th>
                        <th className="py-3 px-4 text-right">Avg Order Value</th>
                        <th className="py-3 px-4 text-right">Share</th>
                        <th className="py-3 px-4 text-center">Shipping Zone</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E9E4D9]">
                      {filteredCities.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="py-12 text-center text-[#888B83]">
                            No city orders matched your criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredCities.map((ct, idx) => {
                          const percentOfMax = Math.round((ct.orderCount / maxCityOrders) * 100);
                          const isTop3 = idx < 3;
                          return (
                            <tr
                              key={`${ct.city}-${ct.state}`}
                              onClick={() => {
                                setFocusedLocation({
                                  type: 'city',
                                  name: ct.city,
                                  state: ct.state,
                                  ts: Date.now(),
                                });
                                window.scrollTo({ top: 180, behavior: 'smooth' });
                              }}
                              title={`Click to locate ${ct.city} on the interactive map`}
                              className={`hover:bg-[#FAF8F3] transition-colors cursor-pointer ${
                                idx === 0 ? 'bg-[#FAF3E3]/20 font-medium' : ''
                              }`}
                            >
                              <td className="py-3.5 px-4 font-bold">
                                {idx === 0 ? (
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#FAF3E3] text-[#8F6C2B] border border-[#E8D5A7] text-[11px]">
                                    #1
                                  </span>
                                ) : idx === 1 ? (
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#F3F4F6] text-[#4B5563] border border-[#D1D5DB] text-[11px]">
                                    #2
                                  </span>
                                ) : idx === 2 ? (
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#FFF7ED] text-[#C2410C] border border-[#FED7AA] text-[11px]">
                                    #3
                                  </span>
                                ) : (
                                  <span className="text-[#888B83] pl-1">#{idx + 1}</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 font-semibold text-[#183D32]">
                                <div className="flex items-center gap-1.5">
                                  <Building2 className="w-3.5 h-3.5 text-[#183D32] shrink-0" />
                                  <span>{ct.city}</span>
                                  {ct.isSurat && (
                                    <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#E7F3EE] text-[#183D32] border border-[#B7DEC9]">
                                      Home Mandi
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3.5 px-4 text-[#5C6058]">{ct.state}</td>
                              <td className="py-3.5 px-4">
                                <div className="space-y-1">
                                  <div className="w-full bg-[#E9E4D9] h-2 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        isTop3 ? 'bg-[#C8A96B]' : 'bg-[#245746]'
                                      }`}
                                      style={{ width: `${Math.max(percentOfMax, 6)}%` }}
                                    />
                                  </div>
                                  <div className="text-[10px] text-[#888B83]">
                                    {ct.orderShare}% of total orders
                                  </div>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 text-right font-bold text-[#183D32]">
                                {ct.orderCount}
                              </td>
                              <td className="py-3.5 px-4 text-right font-semibold text-[#8F6C2B]">
                                {formatINR(ct.totalRevenue)}
                              </td>
                              <td className="py-3.5 px-4 text-right text-[#5C6058]">
                                {ct.uniqueCustomers}
                              </td>
                              <td className="py-3.5 px-4 text-right font-medium text-[#183D32]">
                                {formatINR(ct.averageOrderValue)}
                              </td>
                              <td className="py-3.5 px-4 text-right text-[#5C6058] font-semibold">
                                {ct.orderShare}%
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                {ct.isSurat ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#E7F3EE] text-[#183D32] border border-[#B7DEC9]">
                                    <Truck className="w-3 h-3 text-[#183D32]" />
                                    <span>Surat ₹0 Free</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#F3F1EC] text-[#5C6058] border border-[#E2DDD2]">
                                    <span>Interstate / ₹158</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                <Link
                                  to="/admin/orders"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#183D32] hover:bg-[#E7F3EE] border border-transparent hover:border-[#B7DEC9] transition-all"
                                  title={`Inspect Orders from ${ct.city}`}
                                >
                                  <span>Orders</span>
                                  <ChevronRight className="w-3 h-3" />
                                </Link>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </AdminCard>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
