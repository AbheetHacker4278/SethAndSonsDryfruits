import { useEffect, useState } from 'react';
import { BarChart3, Download, FileSpreadsheet, FileText, Eye } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AdminPdfViewerModal } from '../../components/admin/AdminPdfViewerModal';
import { AdminCard, EmptyState, LoadingSkeleton, ToastBanner } from '../../components/admin/AdminUI';
import { apiRequest, ApiError } from '../../services/api';
import { formatINR } from '../../utils/priceCalculator';

const REPORT_TYPES = [
  { id: 'daily_sales', label: 'Daily Sales Report', desc: 'Day-by-day orders, gross sales, discounts, and GST collected.' },
  { id: 'monthly_sales', label: 'Monthly Sales Report', desc: 'Month-level revenue and order volume trends.' },
  { id: 'yearly_sales', label: 'Yearly Sales Report', desc: 'Annual revenue rollup across fiscal years.' },
  { id: 'product_performance', label: 'Product Performance Report', desc: 'SKU-wise units sold, gross revenue, and share.' },
  { id: 'inventory', label: 'Inventory Valuation Report', desc: 'Stock levels, purchase cost basis, and warehouse valuation.' },
  { id: 'customer', label: 'Customer Spend Report', desc: 'Customer lifetime orders, verified status, and spend tiers.' },
  { id: 'supplier_purchase', label: 'Supplier Purchase Report', desc: 'Vendor PO totals, paid balances, and pending payables.' },
  { id: 'expense', label: 'Operating Expense Report', desc: 'Category-wise vouchers, payment modes, and vendor spend.' },
  { id: 'profit_loss', label: 'Profit & Loss Statement', desc: 'Net sales, COGS, gross profit, operating expenses, and net profit.' },
  { id: 'gst_summary', label: 'GST Tax Summary', desc: 'Output GST collected on sales vs input GST credits on purchases.' },
] as const;

const CURRENCY_KEYS = new Set([
  'grossSales',
  'discounts',
  'gst',
  'totalCollected',
  'revenue',
  'purchasePrice',
  'price',
  'valuation',
  'totalSpent',
  'totalAmount',
  'paidAmount',
  'balance',
  'amount',
  'value',
  'gstAmount',
  'total',
]);

export default function AdminReports() {
  const [selectedType, setSelectedType] = useState<string>('daily_sales');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [productId, setProductId] = useState('');

  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [report, setReport] = useState<{
    title: string;
    subtitle: string;
    columns: Array<{ header: string; key: string }>;
    rows: Array<Record<string, any>>;
    summary?: Record<string, any>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      apiRequest<{ categories: any[] }>('/api/admin/categories'),
      apiRequest<{ products: any[] }>('/api/admin/erp/products'),
    ])
      .then(([catRes, prodRes]) => {
        setCategories(catRes.categories || []);
        setProducts(prodRes.products || []);
      })
      .catch(() => {});
  }, []);

  const buildParams = (extra?: Record<string, string>) => {
    const qs = new URLSearchParams({ type: selectedType });
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (categoryId) qs.set('categoryId', categoryId);
    if (productId) qs.set('productId', productId);
    if (extra) {
      Object.entries(extra).forEach(([k, v]) => qs.set(k, v));
    }
    return qs.toString();
  };

  const loadPreview = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ report: any }>(`/api/admin/reports/preview?${buildParams()}`);
      setReport(res.report);
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to generate report preview.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPreview();
  }, [selectedType, from, to, categoryId, productId]);

  const formatCell = (key: string, val: any) => {
    if (val === null || val === undefined || val === '') return '—';
    if (typeof val === 'number' && CURRENCY_KEYS.has(key)) {
      return formatINR(val);
    }
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    return String(val);
  };

  const meta = REPORT_TYPES.find(r => r.id === selectedType) || REPORT_TYPES[0];

  return (
    <AdminLayout
      title="Reports & Business Analytics"
      subtitle="Generate audited financial, inventory, sales, tax, and procurement exports in PDF, Excel (.xlsx), or CSV."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPdfPreviewOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#E9E4D9] text-xs font-medium text-[#183D32] hover:bg-[#F8F6F0] cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-[#183D32]" />
            <span>Preview PDF</span>
          </button>
          <a
            href={`/api/admin/reports/export?${buildParams({ format: 'pdf' })}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#E9E4D9] text-xs font-medium text-[#183D32] hover:bg-[#F8F6F0]"
          >
            <FileText className="w-3.5 h-3.5 text-[#C65B50]" />
            <span>PDF</span>
          </a>
          <a
            href={`/api/admin/reports/export?${buildParams({ format: 'xlsx' })}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#183D32] text-white text-xs font-medium hover:bg-[#245746]"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#C8A96B]" />
            <span>Excel (.xlsx)</span>
          </a>
          <a
            href={`/api/admin/reports/export?${buildParams({ format: 'csv' })}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FAF3E3] border border-[#E8D5A7] text-xs font-medium text-[#8F6C2B] hover:bg-[#f2e5c7]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </a>
        </div>
      }
    >
      <div className="space-y-6">
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Report Selector */}
          <AdminCard padding="p-4" className="lg:col-span-4 space-y-1.5 h-fit">
            <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[#888B83]">
              Available Reports ({REPORT_TYPES.length})
            </div>
            {REPORT_TYPES.map(rt => (
              <button
                key={rt.id}
                type="button"
                onClick={() => setSelectedType(rt.id)}
                className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                  selectedType === rt.id
                    ? 'bg-[#183D32] text-white border-[#183D32]'
                    : 'bg-[#F8F6F0]/60 text-[#252923] border-transparent hover:border-[#E9E4D9]'
                }`}
              >
                <div className="text-xs font-semibold">{rt.label}</div>
                <div
                  className={`text-[11px] mt-0.5 ${
                    selectedType === rt.id ? 'text-white/75' : 'text-[#888B83]'
                  }`}
                >
                  {rt.desc}
                </div>
              </button>
            ))}
          </AdminCard>

          {/* Right Filters + Preview */}
          <div className="lg:col-span-8 space-y-6">
            <AdminCard padding="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-medium text-[#888B83] mb-1">From Date</label>
                  <input
                    type="date"
                    value={from}
                    onChange={e => setFrom(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] text-[#252923]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#888B83] mb-1">To Date</label>
                  <input
                    type="date"
                    value={to}
                    onChange={e => setTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] text-[#252923]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#888B83] mb-1">Category Filter</label>
                  <select
                    value={categoryId}
                    onChange={e => setCategoryId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] text-[#252923]"
                  >
                    <option value="">All Categories</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#888B83] mb-1">Product Filter</label>
                  <select
                    value={productId}
                    onChange={e => setProductId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] text-[#252923]"
                  >
                    <option value="">All Products</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </AdminCard>

            <AdminCard>
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#E9E4D9]">
                <div>
                  <h2 className="font-admin-serif text-xl font-semibold text-[#183D32]">
                    {report?.title || meta.label}
                  </h2>
                  <p className="text-xs text-[#888B83]">{report?.subtitle || meta.desc}</p>
                </div>
                <span className="text-xs font-medium text-[#245746] bg-[#E7F3EE] px-3 py-1 rounded-full">
                  {report?.rows?.length ?? 0} row(s)
                </span>
              </div>

              {loading ? (
                <div className="pt-4">
                  <LoadingSkeleton rows={5} />
                </div>
              ) : !report || report.rows.length === 0 ? (
                <EmptyState
                  icon={BarChart3}
                  title="No records for these filters"
                  description="Try widening your date range or clearing category/product filters."
                />
              ) : (
                <div className="overflow-x-auto pt-3">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-[#E9E4D9] text-[#888B83]">
                        {report.columns.map(col => (
                          <th key={col.key} className="py-2.5 px-2 font-medium whitespace-nowrap">
                            {col.header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E9E4D9]">
                      {report.rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-[#F8F6F0]/60">
                          {report.columns.map(col => (
                            <td key={col.key} className="py-3 px-2 text-[#252923] whitespace-nowrap">
                              {formatCell(col.key, row[col.key])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AdminCard>
          </div>
        </div>
      </div>

      <AdminPdfViewerModal
        open={pdfPreviewOpen}
        title={meta.label}
        subtitle={meta.desc}
        src={`/api/admin/reports/export?${buildParams({ format: 'pdf' })}`}
        onClose={() => setPdfPreviewOpen(false)}
      />
    </AdminLayout>
  );
}

