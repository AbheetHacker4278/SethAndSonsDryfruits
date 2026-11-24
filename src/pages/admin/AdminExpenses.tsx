import { useEffect, useState, useMemo } from 'react';
import {
  Receipt,
  Plus,
  Edit3,
  Trash2,
  Upload,
  Eye,
  IndianRupee,
  Gift,
  Building2,
  User,
  Calculator,
  Scale,
  Sparkles,
  Package,
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AdminPdfViewerModal, toAdminMediaUrl } from '../../components/admin/AdminPdfViewerModal';
import {
  AdminCard,
  AdminModal,
  ConfirmDialog,
  EmptyState,
  LoadingSkeleton,
  StatusBadge,
  ToastBanner,
} from '../../components/admin/AdminUI';
import { apiRequest, ApiError, apiUpload, fetchPublishedProducts } from '../../services/api';
import { formatINR, getProductBaseCost, parseWeightGrams } from '../../utils/priceCalculator';

const EXPENSE_CATEGORIES = [
  'Packaging',
  'Sampling',
  'Rent',
  'Staff Salary',
  'Shipping',
  'Marketing',
  'Utilities',
  'Maintenance',
  'Miscellaneous',
];

const PAYMENT_MODES = ['UPI', 'Bank Transfer', 'Cash', 'Corporate Card', 'Cheque', 'Owner Sampling'];

interface SamplingItemState {
  id: string;
  categoryId: string;
  productId: string;
  sampleWeight: string;
  sampleUnit: 'g' | 'kg';
}

export default function AdminExpenses() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<{ title: string; subtitle: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    category: 'Packaging',
    title: '',
    amount: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    vendor: '',
    paymentMode: 'UPI',
    receiptUrl: '',
    notes: '',
    // Product Sampling fields
    recipientName: '',
    companyName: '',
    miscExpenseAmount: '',
    miscExpenseNote: '',
    samplingItems: [
      {
        id: 'sample_item_0',
        categoryId: '',
        productId: '',
        sampleWeight: '1',
        sampleUnit: 'g' as 'g' | 'kg',
      },
    ] as SamplingItemState[],
  });

  const load = async () => {
    setLoading(true);
    try {
      const qs = categoryFilter ? `?category=${encodeURIComponent(categoryFilter)}` : '';
      const [expRes, catRes] = await Promise.all([
        apiRequest<{ expenses: any[] }>(`/api/admin/expenses${qs}`),
        apiRequest<{ categories: any[] }>('/api/categories').catch(() => ({ categories: [] })),
      ]);
      setExpenses(expRes.expenses || []);
      if (Array.isArray(catRes.categories) && catRes.categories.length > 0) {
        setCategories(catRes.categories);
      }

      // Fetch products for sampling selection
      try {
        const prodRes = await apiRequest<{ products: any[] }>('/api/admin/erp/products');
        if (Array.isArray(prodRes.products) && prodRes.products.length > 0) {
          setProducts(prodRes.products);
        } else {
          const pubProds = await fetchPublishedProducts();
          setProducts(pubProds || []);
        }
      } catch {
        const pubProds = await fetchPublishedProducts();
        setProducts(pubProds || []);
      }
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to load expenses.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [categoryFilter]);

  // Derived available categories from product list & fetched categories
  const availableCategories = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) {
      map.set(String(c.id), c.name);
    }
    for (const p of products) {
      if (p.categoryId && !map.has(String(p.categoryId))) {
        map.set(String(p.categoryId), p.categoryName || p.category || 'Other');
      } else if (p.category && !map.has(String(p.category))) {
        map.set(String(p.category), p.categoryName || p.category);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [categories, products]);

  // Compute live sampling costing for all items
  const computedSamplingItems = useMemo(() => {
    return form.samplingItems.map(item => {
      const prod = products.find(p => p.id === item.productId) || null;
      if (!prod) {
        return {
          ...item,
          product: null,
          costPerKg: 0,
          costPerGram: 0,
          totalGrams: 0,
          itemCost: 0,
          formula: '',
        };
      }
      const weightNum = Math.max(0, Number(item.sampleWeight) || 0);
      const totalGrams = item.sampleUnit === 'kg' ? weightNum * 1000 : weightNum;
      const baseUnit = prod.unit || 'kg';
      const baseWeightGrams =
        baseUnit === 'gram'
          ? parseWeightGrams(prod.weightLabel || '1g') || 1
          : parseWeightGrams(prod.weightLabel || '1kg') || 1000;

      const baseCost = getProductBaseCost(prod);
      const costPerGram = baseWeightGrams > 0 ? baseCost / baseWeightGrams : 0;
      const costPerKg = Number((costPerGram * 1000).toFixed(2));
      const itemCost = Number((costPerGram * totalGrams).toFixed(2));
      const formula =
        baseUnit === 'gram'
          ? `₹${costPerGram.toFixed(2)}/g × ${totalGrams}g = ₹${itemCost.toFixed(2)}`
          : `(₹${costPerKg}/kg ÷ 1000g) × ${totalGrams}g = ₹${itemCost.toFixed(2)}`;

      return {
        ...item,
        product: prod,
        costPerKg,
        costPerGram,
        totalGrams,
        itemCost,
        formula,
      };
    });
  }, [form.samplingItems, products]);

  const samplingSummary = useMemo(() => {
    const productsCost = Number(computedSamplingItems.reduce((acc, it) => acc + it.itemCost, 0).toFixed(2));
    const totalGrams = Number(computedSamplingItems.reduce((acc, it) => acc + it.totalGrams, 0).toFixed(2));
    const validItems = computedSamplingItems.filter(it => Boolean(it.product));
    const miscAmount = Math.max(0, Number(form.miscExpenseAmount) || 0);
    const totalCost = Number((productsCost + miscAmount).toFixed(2));
    return {
      productsCost,
      miscAmount,
      totalCost,
      totalGrams,
      validItems,
      itemsCount: validItems.length,
    };
  }, [computedSamplingItems, form.miscExpenseAmount]);

  // Sync sampling items, recipient, misc expense, costing amount, and title
  const syncSamplingState = (
    newItems: SamplingItemState[],
    recName: string,
    compName: string,
    miscAmountStr = form.miscExpenseAmount,
    miscNoteStr = form.miscExpenseNote,
    explicitTitle?: string
  ) => {
    let productsTotal = 0;
    const itemSummaries: string[] = [];

    for (const it of newItems) {
      const prod = products.find(p => p.id === it.productId);
      if (prod) {
        const weightNum = Math.max(0, Number(it.sampleWeight) || 0);
        const totalGrams = it.sampleUnit === 'kg' ? weightNum * 1000 : weightNum;
        const baseUnit = prod.unit || 'kg';
        const baseWeightGrams =
          baseUnit === 'gram'
            ? parseWeightGrams(prod.weightLabel || '1g') || 1
            : parseWeightGrams(prod.weightLabel || '1kg') || 1000;
        const baseCost = getProductBaseCost(prod);
        const costPerGram = baseWeightGrams > 0 ? baseCost / baseWeightGrams : 0;
        const itemCost = Number((costPerGram * totalGrams).toFixed(2));
        productsTotal += itemCost;
        itemSummaries.push(`${prod.name} (${weightNum}${it.sampleUnit})`);
      }
    }

    const miscAmountNum = Math.max(0, Number(miscAmountStr) || 0);
    const grandTotal = Number((productsTotal + miscAmountNum).toFixed(2));
    const vendorFormatted = [recName.trim(), compName.trim() ? `(${compName.trim()})` : ''].filter(Boolean).join(' ');

    let generatedTitle = explicitTitle !== undefined ? explicitTitle : form.title;
    if (explicitTitle === undefined && itemSummaries.length > 0) {
      if (itemSummaries.length <= 2) {
        generatedTitle = `Product Sampling — ${itemSummaries.join(', ')}`;
      } else {
        generatedTitle = `Product Sampling — ${itemSummaries.length} Products (${itemSummaries.slice(0, 2).join(', ')} +${itemSummaries.length - 2} more)`;
      }
      if (miscAmountNum > 0 && miscNoteStr.trim()) {
        generatedTitle = `${generatedTitle} + Misc (${miscNoteStr.trim()})`;
      } else if (miscAmountNum > 0) {
        generatedTitle = `${generatedTitle} + Misc`;
      }
    }

    setForm(prev => ({
      ...prev,
      samplingItems: newItems,
      recipientName: recName,
      companyName: compName,
      miscExpenseAmount: miscAmountStr,
      miscExpenseNote: miscNoteStr,
      amount: grandTotal > 0 ? String(grandTotal) : prev.amount,
      title: generatedTitle,
      vendor: vendorFormatted || prev.vendor,
      paymentMode: prev.paymentMode === 'UPI' ? 'Owner Sampling' : prev.paymentMode,
    }));
  };

  const handleSamplingItemChange = (id: string, updates: Partial<SamplingItemState>) => {
    const updated = form.samplingItems.map(it => {
      if (it.id !== id) return it;
      const next = { ...it, ...updates };
      if (updates.productId) {
        const prod = products.find(p => p.id === updates.productId);
        if (prod && !next.categoryId) {
          next.categoryId = prod.categoryId || '';
        }
      }
      return next;
    });
    syncSamplingState(updated, form.recipientName, form.companyName, form.miscExpenseAmount, form.miscExpenseNote);
  };

  const handleMiscExpenseChange = (amountStr: string, noteStr: string) => {
    syncSamplingState(form.samplingItems, form.recipientName, form.companyName, amountStr, noteStr);
  };

  const addSamplingItem = () => {
    const lastItem = form.samplingItems[form.samplingItems.length - 1];
    const newItem: SamplingItemState = {
      id: `sample_item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      categoryId: lastItem?.categoryId || '',
      productId: '',
      sampleWeight: '1',
      sampleUnit: 'g',
    };
    syncSamplingState([...form.samplingItems, newItem], form.recipientName, form.companyName, form.miscExpenseAmount, form.miscExpenseNote);
  };

  const removeSamplingItem = (id: string) => {
    if (form.samplingItems.length <= 1) {
      const resetItem: SamplingItemState = {
        id: `sample_item_${Date.now()}`,
        categoryId: '',
        productId: '',
        sampleWeight: '1',
        sampleUnit: 'g',
      };
      syncSamplingState([resetItem], form.recipientName, form.companyName, form.miscExpenseAmount, form.miscExpenseNote);
      return;
    }
    const filtered = form.samplingItems.filter(it => it.id !== id);
    syncSamplingState(filtered, form.recipientName, form.companyName, form.miscExpenseAmount, form.miscExpenseNote);
  };

  const handleRecipientChange = (rec: string, comp: string) => {
    syncSamplingState(form.samplingItems, rec, comp, form.miscExpenseAmount, form.miscExpenseNote);
  };

  const openCreate = (isSamplingOnly = false) => {
    setEditingId(null);
    setForm({
      category: isSamplingOnly ? 'Sampling' : 'Packaging',
      title: '',
      amount: '',
      expenseDate: new Date().toISOString().slice(0, 10),
      vendor: '',
      paymentMode: isSamplingOnly ? 'Owner Sampling' : 'UPI',
      receiptUrl: '',
      notes: '',
      recipientName: '',
      companyName: '',
      miscExpenseAmount: '',
      miscExpenseNote: '',
      samplingItems: [
        {
          id: `sample_item_${Date.now()}`,
          categoryId: '',
          productId: '',
          sampleWeight: '1',
          sampleUnit: 'g',
        },
      ],
    });
    setModalOpen(true);
  };

  const openEdit = (exp: any) => {
    setEditingId(exp.id);
    const isSampling = exp.category === 'Sampling' || exp.category === 'Product Sampling';

    let initialItems: SamplingItemState[] = [];
    if (Array.isArray(exp.samplingItems) && exp.samplingItems.length > 0) {
      initialItems = exp.samplingItems.map((it: any, idx: number) => ({
        id: `sample_item_${idx}_${Date.now()}`,
        categoryId: it.categoryId || '',
        productId: it.productId || '',
        sampleWeight: String(it.sampleWeight ?? '1'),
        sampleUnit: (it.sampleUnit === 'kg' ? 'kg' : 'g') as 'g' | 'kg',
      }));
    } else if (exp.productId) {
      initialItems = [
        {
          id: `sample_item_0_${Date.now()}`,
          categoryId: exp.categoryId || '',
          productId: exp.productId || '',
          sampleWeight: String(exp.sampleWeight ?? '250'),
          sampleUnit: (exp.sampleUnit === 'kg' ? 'kg' : 'g') as 'g' | 'kg',
        },
      ];
    } else {
      initialItems = [
        {
          id: `sample_item_0_${Date.now()}`,
          categoryId: '',
          productId: '',
          sampleWeight: '1',
          sampleUnit: 'g',
        },
      ];
    }

    setForm({
      category: isSampling ? 'Sampling' : exp.category || 'Miscellaneous',
      title: exp.title || '',
      amount: String(exp.amount ?? ''),
      expenseDate: (exp.expenseDate || new Date().toISOString()).slice(0, 10),
      vendor: exp.vendor || '',
      paymentMode: exp.paymentMode || (isSampling ? 'Owner Sampling' : 'UPI'),
      receiptUrl: exp.receiptUrl || '',
      notes: exp.notes || '',
      recipientName: exp.recipientName || '',
      companyName: exp.companyName || '',
      miscExpenseAmount: exp.miscExpenseAmount ? String(exp.miscExpenseAmount) : '',
      miscExpenseNote: exp.miscExpenseNote || '',
      samplingItems: initialItems,
    });
    setModalOpen(true);
  };

  const handleUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('receipt', f);
      const res = await apiUpload<{ receiptUrl: string }>('/api/admin/expenses/upload-receipt', fd);
      setForm(prev => ({ ...prev, receiptUrl: res.receiptUrl }));
      setToast({ type: 'ok', text: 'Expense receipt uploaded.' });
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Upload failed.' });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const isSampling = form.category === 'Sampling';
      if (isSampling && !form.recipientName.trim() && !form.companyName.trim() && !form.vendor.trim()) {
        setToast({ type: 'err', text: 'Please mention either the Recipient Name or Company Name for the sample.' });
        return;
      }

      const vendorFormatted = isSampling
        ? [form.recipientName.trim(), form.companyName.trim() ? `(${form.companyName.trim()})` : '']
            .filter(Boolean)
            .join(' ') || form.vendor.trim() || 'Owner Sample'
        : form.vendor.trim();

      const validItems = computedSamplingItems.filter(it => it.product);
      if (isSampling && validItems.length === 0) {
        setToast({ type: 'err', text: 'Please select at least one product for sampling.' });
        return;
      }

      const payload: Record<string, any> = {
        category: form.category,
        title:
          form.title.trim() ||
          (isSampling && validItems.length > 0
            ? `Product Sampling — ${validItems.map(i => i.product?.name).join(', ')}`
            : 'Expense'),
        amount: Number(form.amount),
        expenseDate: form.expenseDate,
        vendor: vendorFormatted,
        paymentMode: form.paymentMode,
        receiptUrl: form.receiptUrl.trim() || null,
        notes: form.notes.trim(),
      };

      if (isSampling) {
        const itemsPayload = validItems.map(it => ({
          productId: it.productId,
          productName: it.product?.name || null,
          categoryId: it.categoryId || it.product?.categoryId || null,
          categoryName:
            categories.find(c => c.id === it.categoryId)?.name || it.product?.categoryName || null,
          sampleWeight: Number(it.sampleWeight) || 0,
          sampleUnit: it.sampleUnit,
          sampleGrams: it.totalGrams,
          costPerKg: it.costPerKg,
          itemCost: it.itemCost,
        }));

        payload.samplingItems = itemsPayload;
        payload.productId = itemsPayload[0]?.productId || null;
        payload.productName = itemsPayload.map(i => i.productName).filter(Boolean).join(', ');
        payload.categoryId = itemsPayload[0]?.categoryId || null;
        payload.categoryName = itemsPayload[0]?.categoryName || null;
        payload.sampleWeight = itemsPayload[0]?.sampleWeight || null;
        payload.sampleUnit = itemsPayload[0]?.sampleUnit || null;
        payload.sampleGrams = samplingSummary.totalGrams;
        payload.costPerKg = itemsPayload[0]?.costPerKg || null;
        payload.recipientName = form.recipientName.trim() || null;
        payload.companyName = form.companyName.trim() || null;
        payload.miscExpenseAmount = Number(form.miscExpenseAmount) || 0;
        payload.miscExpenseNote = form.miscExpenseNote.trim();
      }

      if (editingId) {
        await apiRequest(`/api/admin/expenses/${editingId}`, { method: 'PUT', body: payload });
        setToast({ type: 'ok', text: 'Expense entry updated.' });
      } else {
        await apiRequest('/api/admin/expenses', { method: 'POST', body: payload });
        setToast({ type: 'ok', text: isSampling ? 'Product sampling expense recorded.' : 'Expense recorded.' });
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Could not save expense.' });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiRequest(`/api/admin/expenses/${deleteId}`, { method: 'DELETE' });
      setToast({ type: 'ok', text: 'Expense deleted.' });
      setDeleteId(null);
      await load();
    } catch (err) {
      setDeleteId(null);
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Delete failed.' });
    }
  };

  const totalSpend = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const samplingTotalSpend = expenses
    .filter(e => e.category === 'Sampling' || e.category === 'Product Sampling')
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  return (
    <AdminLayout
      title="Operating Expenses"
      subtitle="Track product sampling done by owner, rent, packaging, logistics, and operational receipts."
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openCreate(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#C8A96B] text-[#183D32] text-xs font-bold hover:bg-[#b59556] transition-colors cursor-pointer shadow-sm"
          >
            <Gift className="w-4 h-4" />
            <span>+ Add Sampling</span>
          </button>
          <button
            type="button"
            onClick={() => openCreate(false)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#183D32] text-white text-xs font-semibold hover:bg-[#245746] transition-colors cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4 text-[#C8A96B]" />
            <span>Add Expense</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

        {/* Summary & Filter Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <AdminCard padding="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#183D32] text-[#C8A96B] flex items-center justify-center">
                <IndianRupee className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs text-[#888B83]">Total Operating Spend</div>
                <div className="text-xl font-bold text-[#252923] tabular-nums">{formatINR(totalSpend)}</div>
              </div>
            </div>
          </AdminCard>

          <AdminCard padding="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#C8A96B]/20 text-[#183D32] flex items-center justify-center">
                <Gift className="w-4 h-4 text-[#C8A96B]" />
              </div>
              <div>
                <div className="text-xs text-[#888B83]">Product Sampling Cost</div>
                <div className="text-xl font-bold text-[#183D32] tabular-nums">{formatINR(samplingTotalSpend)}</div>
              </div>
            </div>
          </AdminCard>

          <AdminCard padding="p-5">
            <div className="text-xs text-[#888B83]">Recorded Vouchers</div>
            <div className="text-xl font-bold text-[#183D32] mt-1 tabular-nums">{expenses.length}</div>
          </AdminCard>

          <AdminCard padding="p-5">
            <label className="block text-xs font-medium text-[#888B83] mb-1.5">Filter by Category</label>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] text-xs text-[#252923] focus:outline-none focus:border-[#183D32]"
            >
              <option value="">All Categories</option>
              {EXPENSE_CATEGORIES.map(c => (
                <option key={c} value={c}>
                  {c === 'Sampling' ? '🎁 Product Sampling' : c}
                </option>
              ))}
            </select>
          </AdminCard>
        </div>

        {/* Table */}
        <AdminCard>
          {loading ? (
            <LoadingSkeleton rows={5} />
          ) : expenses.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No expenses found"
              description="Record operating costs and product sampling vouchers to compute net profit accurately."
              action={
                <button
                  type="button"
                  onClick={() => openCreate(false)}
                  className="px-4 py-2 rounded-xl bg-[#183D32] text-white text-xs font-semibold cursor-pointer"
                >
                  Record First Expense
                </button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-[#E9E4D9] text-[#888B83]">
                    <th className="py-3 px-2 font-medium">Date</th>
                    <th className="py-3 px-2 font-medium">Title &amp; Notes</th>
                    <th className="py-3 px-2 font-medium">Category</th>
                    <th className="py-3 px-2 font-medium">Recipient / Vendor</th>
                    <th className="py-3 px-2 font-medium">Mode</th>
                    <th className="py-3 px-2 font-medium text-right">Cost Amount</th>
                    <th className="py-3 px-2 font-medium">Receipt</th>
                    <th className="py-3 px-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E4D9]">
                  {expenses.map(exp => {
                    const isSampling = exp.category === 'Sampling' || exp.category === 'Product Sampling';
                    const sampleRecipient = [
                      exp.recipientName,
                      exp.companyName ? `(${exp.companyName})` : '',
                    ]
                      .filter(Boolean)
                      .join(' ');

                    return (
                      <tr key={exp.id} className="hover:bg-[#F8F6F0]/60">
                        <td className="py-3.5 px-2 whitespace-nowrap text-[#5C6058]">
                          {String(exp.expenseDate || '').slice(0, 10)}
                        </td>
                        <td className="py-3.5 px-2">
                          <div className="font-semibold text-[#183D32] flex items-center gap-1.5">
                            {isSampling && <Gift className="w-3.5 h-3.5 text-[#C8A96B] shrink-0" />}
                            <span>{exp.title}</span>
                          </div>
                          {isSampling && (
                            <div className="mt-1 space-y-1">
                              {Array.isArray(exp.samplingItems) && exp.samplingItems.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {exp.samplingItems.map((si: any, idx: number) => (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#F8F6F0] border border-[#E9E4D9] text-[10px] text-[#183D32] font-medium"
                                    >
                                      <span>{si.productName || 'Product'}</span>
                                      <span className="font-bold text-[#725a25]">({si.sampleWeight}{si.sampleUnit || 'g'})</span>
                                      {typeof si.itemCost === 'number' && (
                                        <span className="text-[#888B83]">· {formatINR(si.itemCost)}</span>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              ) : exp.productName ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#F8F6F0] border border-[#E9E4D9] text-[10px] text-[#183D32] font-medium">
                                  <span>{exp.productName}</span>
                                  <span className="font-bold text-[#725a25]">({exp.sampleWeight}{exp.sampleUnit || 'g'})</span>
                                </span>
                              ) : null}
                              {exp.miscExpenseAmount && Number(exp.miscExpenseAmount) > 0 ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[10px] text-[#725a25] font-medium">
                                  <span>📦 Misc:</span>
                                  <span className="font-bold">{formatINR(Number(exp.miscExpenseAmount))}</span>
                                  {exp.miscExpenseNote && (
                                    <span className="text-[#888B83]">({exp.miscExpenseNote})</span>
                                  )}
                                </span>
                              ) : null}
                              {sampleRecipient && (
                                <div className="text-[10px] text-[#245746] font-medium">
                                  Sample provided to: <span className="font-semibold">{sampleRecipient}</span>
                                </div>
                              )}
                            </div>
                          )}
                          {exp.notes && (
                            <div className="text-[11px] text-[#888B83] truncate max-w-sm mt-0.5">{exp.notes}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-2">
                          {isSampling ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#C8A96B]/15 text-[#725a25] border border-[#C8A96B]/30 font-bold text-[10px]">
                              🎁 Sampling
                            </span>
                          ) : (
                            <StatusBadge status={exp.category} tone="gold" />
                          )}
                        </td>
                        <td className="py-3.5 px-2 text-[#5C6058]">
                          {isSampling ? sampleRecipient || exp.vendor || 'Owner Sample' : exp.vendor || '—'}
                        </td>
                        <td className="py-3.5 px-2 text-[#5C6058]">{exp.paymentMode || 'UPI'}</td>
                        <td className="py-3.5 px-2 text-right font-bold text-[#252923] tabular-nums">
                          {formatINR(Number(exp.amount || 0))}
                        </td>
                        <td className="py-3.5 px-2">
                          {exp.receiptUrl ? (
                            <button
                              type="button"
                              onClick={() =>
                                setReceiptPreview({
                                  title: `Receipt: ${exp.title}`,
                                  subtitle: `${exp.category} · ${exp.expenseDate || ''}`,
                                  url: toAdminMediaUrl(exp.receiptUrl),
                                })
                              }
                              className="inline-flex items-center gap-1 text-[#245746] hover:underline font-medium cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View</span>
                            </button>
                          ) : (
                            <span className="text-[#888B83]">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(exp)}
                              className="p-1.5 rounded-lg text-[#245746] hover:bg-[#E7F3EE] cursor-pointer"
                              title="Edit expense"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteId(exp.id)}
                              className="p-1.5 rounded-lg text-[#C65B50] hover:bg-[#FCECEB] cursor-pointer"
                              title="Delete expense"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      </div>

      {/* Add / Edit Expense Modal */}
      <AdminModal
        open={modalOpen}
        title={editingId ? 'Edit Expense Entry' : 'Record Operating Expense'}
        subtitle="Expenses deduct from Gross Profit to compute true Net Profit in P&L."
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-[#252923] mb-1">Category *</label>
              <select
                value={form.category}
                onChange={e => {
                  const cat = e.target.value;
                  setForm(prev => ({
                    ...prev,
                    category: cat,
                    paymentMode: cat === 'Sampling' ? 'Owner Sampling' : prev.paymentMode === 'Owner Sampling' ? 'UPI' : prev.paymentMode,
                  }));
                }}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
              >
                {EXPENSE_CATEGORIES.map(c => (
                  <option key={c} value={c}>
                    {c === 'Sampling' ? '🎁 Sampling (Owner Product Sampling)' : c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-[#252923] mb-1">Expense Date *</label>
              <input
                type="date"
                required
                value={form.expenseDate}
                onChange={e => setForm({ ...form, expenseDate: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
              />
            </div>
          </div>

          {/* DEDICATED MULTI-PRODUCT SAMPLING SECTION */}
          {form.category === 'Sampling' && (
            <div className="p-4 rounded-2xl bg-[#F8F6F0] border-2 border-[#C8A96B]/50 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#E9E4D9]">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#183D32] text-[#C8A96B] flex items-center justify-center">
                    <Gift className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-sm text-[#183D32]">Owner Product Sampling Specification</span>
                    <p className="text-[10px] text-[#70746B]">
                      Select multiple dry fruit products by category, specify custom grams/kg for each, and auto-calculate combined costing.
                    </p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-[#C8A96B]/20 text-[#183D32] font-semibold text-[10px]">
                  Sampling Ledger
                </span>
              </div>

              {/* Sampled Products List */}
              <div className="space-y-3">
                {form.samplingItems.map((item, idx) => {
                  const compItem = computedSamplingItems[idx];
                  const prod = compItem?.product;
                  const filteredProds = item.categoryId
                    ? products.filter(
                        p => String(p.categoryId) === item.categoryId || String(p.category) === item.categoryId
                      )
                    : products;

                  return (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl bg-white border border-[#E9E4D9] space-y-3 shadow-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-[#183D32] text-[#C8A96B] font-bold text-[10px] flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-[#183D32] text-xs">
                            Product Sample #{idx + 1}
                          </span>
                          {prod && (
                            <span className="text-[10px] text-[#70746B] font-medium hidden sm:inline">
                              ({prod.name})
                            </span>
                          )}
                        </div>
                        {form.samplingItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSamplingItem(item.id)}
                            className="text-[#C65B50] hover:text-red-700 p-1 rounded-md hover:bg-red-50 cursor-pointer flex items-center gap-1 text-[11px]"
                            title="Remove this product sample"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>

                      {/* Category & Product Select */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-medium text-[#252923] mb-1">Filter by Category</label>
                          <select
                            value={item.categoryId}
                            onChange={e => handleSamplingItemChange(item.id, { categoryId: e.target.value })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-[#E9E4D9] bg-[#F8F6F0] text-xs focus:outline-none focus:border-[#183D32]"
                          >
                            <option value="">-- All Product Categories --</option>
                            {availableCategories.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-[#252923] mb-1">
                            Select Available Product *
                          </label>
                          <select
                            value={item.productId}
                            onChange={e => handleSamplingItemChange(item.id, { productId: e.target.value })}
                            required={form.category === 'Sampling'}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-[#E9E4D9] bg-[#F8F6F0] text-xs font-medium focus:outline-none focus:border-[#183D32]"
                          >
                            <option value="">-- Choose Product to Sample --</option>
                            {filteredProds.map(p => {
                              const cost = getProductBaseCost(p);
                              return (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.categoryName || p.category}) — Base Cost: ₹{cost}/{p.unit}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>

                      {/* Selected Product Card */}
                      {prod && (
                        <div className="flex items-center gap-2.5 p-2 rounded-lg bg-[#F8F6F0] border border-[#E9E4D9]">
                          {prod.image && (
                            <img
                              src={prod.image}
                              alt={prod.name}
                              className="w-9 h-9 rounded object-cover border border-[#E9E4D9]"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-[#183D32] truncate text-xs">{prod.name}</div>
                            <div className="text-[10px] text-[#888B83]">
                              SKU: {prod.sku || 'N/A'} • Category: {prod.categoryName || prod.category} • In Stock: {prod.stock} {prod.unit}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-[#888B83]">Base Purchase Cost</div>
                            <div className="font-bold text-[#183D32] text-xs">₹{getProductBaseCost(prod)}/{prod.unit}</div>
                          </div>
                        </div>
                      )}

                      {/* Quantity & Unit & Preset Chips */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-medium text-[#252923] flex items-center gap-1">
                            <Scale className="w-3 h-3 text-[#C8A96B]" />
                            <span>Sample Quantity (Custom Grams or Kg) *</span>
                          </label>
                          <div className="flex items-center gap-1 bg-[#F8F6F0] p-0.5 rounded-md border border-[#E9E4D9]">
                            <button
                              type="button"
                              onClick={() => handleSamplingItemChange(item.id, { sampleUnit: 'g' })}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                                item.sampleUnit === 'g'
                                  ? 'bg-[#183D32] text-white'
                                  : 'text-[#5C6058] hover:text-[#183D32]'
                              }`}
                            >
                              Grams (g)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSamplingItemChange(item.id, { sampleUnit: 'kg' })}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                                item.sampleUnit === 'kg'
                                  ? 'bg-[#183D32] text-white'
                                  : 'text-[#5C6058] hover:text-[#183D32]'
                              }`}
                            >
                              Kilograms (kg)
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                          <div className="relative">
                            <input
                              type="number"
                              step={item.sampleUnit === 'kg' ? '0.01' : '0.1'}
                              min="0.01"
                              required={form.category === 'Sampling'}
                              value={item.sampleWeight}
                              onChange={e => handleSamplingItemChange(item.id, { sampleWeight: e.target.value })}
                              placeholder={item.sampleUnit === 'kg' ? 'e.g. 0.05' : 'e.g. 1 or 2'}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-[#E9E4D9] bg-white font-bold text-[#183D32] text-xs focus:outline-none focus:border-[#183D32]"
                            />
                            <span className="absolute right-2.5 top-1.5 text-[#888B83] text-xs font-medium pointer-events-none">
                              {item.sampleUnit}
                            </span>
                          </div>

                          {/* Quick Chips (including 1g, 2g, 5g, 10g, etc.) */}
                          <div className="flex flex-wrap items-center gap-1">
                            {[
                              { label: '1g', val: '1', unit: 'g' },
                              { label: '2g', val: '2', unit: 'g' },
                              { label: '5g', val: '5', unit: 'g' },
                              { label: '10g', val: '10', unit: 'g' },
                              { label: '50g', val: '50', unit: 'g' },
                              { label: '100g', val: '100', unit: 'g' },
                              { label: '250g', val: '250', unit: 'g' },
                              { label: '500g', val: '500', unit: 'g' },
                              { label: '1kg', val: '1', unit: 'kg' },
                            ].map(chip => (
                              <button
                                key={chip.label}
                                type="button"
                                onClick={() =>
                                  handleSamplingItemChange(item.id, {
                                    sampleWeight: chip.val,
                                    sampleUnit: chip.unit as 'g' | 'kg',
                                  })
                                }
                                className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border cursor-pointer transition-all ${
                                  item.sampleWeight === chip.val && item.sampleUnit === chip.unit
                                    ? 'bg-[#183D32] text-white border-[#183D32]'
                                    : 'bg-[#F8F6F0] text-[#5C6058] border-[#E9E4D9] hover:border-[#183D32]'
                                }`}
                              >
                                {chip.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Item Costing Pill */}
                      {prod ? (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50/70 border border-emerald-200 text-xs">
                          <div className="text-[11px] text-[#245746] font-mono">
                            {compItem.formula}
                          </div>
                          <div className="font-bold text-[#183D32]">
                            Cost: {formatINR(compItem.itemCost)}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                {/* + Add Another Product for Sampling */}
                <button
                  type="button"
                  onClick={addSamplingItem}
                  className="w-full py-2.5 px-3 rounded-xl border-2 border-dashed border-[#C8A96B] hover:border-[#183D32] bg-white hover:bg-[#F8F6F0] text-[#183D32] font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4 text-[#C8A96B]" />
                  <span>+ Add Another Product for Sampling</span>
                </button>
              </div>

              {/* Miscellaneous Sampling Expense (Courier, sample pouches, special box, etc.) */}
              <div className="p-3.5 rounded-xl bg-white border border-[#E9E4D9] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-amber-100 text-[#725a25] font-bold text-xs flex items-center justify-center">
                      ₹
                    </div>
                    <span className="font-bold text-[#183D32] text-xs">
                      Miscellaneous Sampling Expense (Optional)
                    </span>
                  </div>
                  <span className="text-[10px] text-[#70746B] italic">
                    Courier, sample pouch, luxury box, incidental charges
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
                  <div>
                    <label className="block text-[11px] font-medium text-[#252923] mb-1">
                      Misc. Expense Amount (INR)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.miscExpenseAmount}
                        onChange={e => handleMiscExpenseChange(e.target.value, form.miscExpenseNote)}
                        placeholder="e.g. 50 or 100"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[#E9E4D9] bg-[#F8F6F0] font-bold text-[#183D32] text-xs focus:outline-none focus:border-[#183D32]"
                      />
                      <span className="absolute right-2.5 top-1.5 text-[#888B83] text-xs font-semibold pointer-events-none">
                        ₹
                      </span>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-medium text-[#252923] mb-1">
                      Misc. Expense Note / Purpose
                    </label>
                    <input
                      value={form.miscExpenseNote}
                      onChange={e => handleMiscExpenseChange(form.miscExpenseAmount, e.target.value)}
                      placeholder="e.g. Courier charges to client, luxury sample pouch, tasting containers..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[#E9E4D9] bg-[#F8F6F0] text-xs focus:outline-none focus:border-[#183D32]"
                    />
                  </div>
                </div>
              </div>

              {/* Grand Total Costing Breakdown Card */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-50 via-[#F8F6F0] to-amber-50 border border-emerald-300/70">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                      <Calculator className="w-4 h-4 text-[#183D32]" />
                      <span>Dynamically Calculated Total Sampling Cost</span>
                    </div>
                    <div className="text-[11px] text-[#5C6058] space-y-0.5">
                      <div>
                        Sampled Products ({samplingSummary.itemsCount}): <strong>{formatINR(samplingSummary.productsCost)}</strong> ({samplingSummary.totalGrams}g)
                        {samplingSummary.miscAmount > 0 && (
                          <span> • Misc Expense: <strong>{formatINR(samplingSummary.miscAmount)}</strong>{form.miscExpenseNote ? ` (${form.miscExpenseNote})` : ''}</span>
                        )}
                      </div>
                      {samplingSummary.miscAmount > 0 && (
                        <div className="text-[10px] text-[#70746B] italic font-mono">
                          Breakdown: {formatINR(samplingSummary.productsCost)} (Products) + {formatINR(samplingSummary.miscAmount)} (Misc) = {formatINR(samplingSummary.totalCost)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-[#70746B] tracking-wider">Total Voucher Cost</span>
                    <div className="text-xl font-extrabold text-[#183D32] tabular-nums">
                      {formatINR(samplingSummary.totalCost)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Recipient Person & Company Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-medium text-[#252923] mb-1 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-[#C8A96B]" />
                    <span>Recipient Person Name</span>
                  </label>
                  <input
                    value={form.recipientName}
                    onChange={e => handleRecipientChange(e.target.value, form.companyName)}
                    placeholder="e.g., Rajesh Patel, Chef Vikram"
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E4D9] bg-white focus:outline-none focus:border-[#183D32]"
                  />
                </div>

                <div>
                  <label className="block font-medium text-[#252923] mb-1 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-[#C8A96B]" />
                    <span>Recipient Company / Firm Name</span>
                  </label>
                  <input
                    value={form.companyName}
                    onChange={e => handleRecipientChange(form.recipientName, e.target.value)}
                    placeholder="e.g., Ambika Traders, Taj Hotel Mumbai"
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E4D9] bg-white focus:outline-none focus:border-[#183D32]"
                  />
                </div>
              </div>
              <p className="text-[10px] text-[#70746B]">
                * Admin must mention either the recipient person name or company name to record where the owner provided the samples.
              </p>
            </div>
          )}

          {/* Standard Expense Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-[#252923] mb-1">Expense Title *</label>
              <input
                required
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder={form.category === 'Sampling' ? 'e.g., Product Sampling — Badam (250g)' : 'e.g., Custom Gold Tin Boxes (500 pcs)'}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#252923] mb-1">
                {form.category === 'Sampling' ? 'Sample Costing Amount (INR) *' : 'Amount (INR) *'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="4500"
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] font-bold text-[#183D32] focus:outline-none focus:border-[#183D32]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#252923] mb-1">
                {form.category === 'Sampling' ? 'Recipient / Organization' : 'Vendor / Payee'}
              </label>
              <input
                value={form.vendor}
                onChange={e => setForm({ ...form, vendor: e.target.value })}
                placeholder={form.category === 'Sampling' ? 'e.g., Rajesh Patel (Ambika Traders)' : 'e.g., Jammu Packaging Works'}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#252923] mb-1">Payment / Sourcing Mode</label>
              <select
                value={form.paymentMode}
                onChange={e => setForm({ ...form, paymentMode: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
              >
                {PAYMENT_MODES.map(m => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-[#252923] mb-1">Receipt / Proof Upload (Optional)</label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] hover:bg-[#EFECE4] cursor-pointer font-medium text-[#183D32]">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploading ? 'Uploading...' : 'Upload Receipt / Proof'}</span>
                <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleUploadReceipt} />
              </label>
              <input
                value={form.receiptUrl}
                onChange={e => setForm({ ...form, receiptUrl: e.target.value })}
                placeholder="or paste receipt / proof URL..."
                className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0]"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-[#252923] mb-1">
              {form.category === 'Sampling' ? 'Sampling Notes & Feedback Remarks' : 'Notes'}
            </label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder={
                form.category === 'Sampling'
                  ? 'Mention notes: client tasting feedback, prospective bulk order quantity, sample packaging remarks...'
                  : 'Invoice reference or remarks...'
              }
              className="w-full px-3 py-2.5 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] focus:outline-none focus:border-[#183D32]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-[#E9E4D9] text-[#5C6058] hover:bg-[#F8F6F0] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[#183D32] text-white font-semibold hover:bg-[#245746] cursor-pointer flex items-center gap-1.5"
            >
              {form.category === 'Sampling' && <Gift className="w-3.5 h-3.5 text-[#C8A96B]" />}
              <span>{editingId ? 'Save Changes' : form.category === 'Sampling' ? 'Save Sampling Expense' : 'Save Expense'}</span>
            </button>
          </div>
        </form>
      </AdminModal>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete Expense Record?"
        message="This will permanently remove the expense voucher and recalculate operating totals."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />

      <AdminPdfViewerModal
        open={Boolean(receiptPreview)}
        title={receiptPreview?.title || 'Expense Receipt'}
        subtitle={receiptPreview?.subtitle}
        src={receiptPreview?.url || null}
        onClose={() => setReceiptPreview(null)}
      />
    </AdminLayout>
  );
}
