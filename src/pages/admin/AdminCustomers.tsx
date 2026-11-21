import { useEffect, useState } from 'react';
import {
  Users,
  Search,
  Download,
  Eye,
  Edit3,
  Trash2,
  Mail,
  Tag,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Send,
  Sparkles,
  RefreshCw,
  ShoppingBag,
  Phone,
  MessageCircle,
  ExternalLink,
  User as UserIcon,
  Paperclip,
  X,
  FileText,
  Monitor,
  Smartphone,
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import {
  AdminCard,
  AdminModal,
  EmptyState,
  LoadingSkeleton,
  StatusBadge,
  ToastBanner,
} from '../../components/admin/AdminUI';
import { apiRequest, ApiError, apiUpload } from '../../services/api';
import { formatINR } from '../../utils/priceCalculator';

interface CustomerStats {
  totalCustomers: number;
  oneTimeCustomersCount?: number;
  verifiedCount: number;
  unverifiedCount: number;
  unverifiedEligibleForPurge: number;
  frequentBuyersCount: number;
  frequentBuyersRevenue: number;
  frequentBuyersAov: number;
  repeatPurchaseRate: number;
  vipCount: number;
  topFrequentBuyers: Array<{
    id: string;
    name: string;
    email: string;
    phone: string;
    tier: string;
    totalOrders: number;
    totalSpent: number;
    averageOrderValue: number;
    lastOrderAt: string | null;
    createdAt: string;
  }>;
}

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [customerType, setCustomerType] = useState<'registered' | 'one_time'>('registered');
  const [segment, setSegment] = useState<'all' | 'frequent' | 'vip' | 'new' | 'returning' | 'unverified' | 'inactive'>('all');
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Modals & Target States
  const [detail, setDetail] = useState<any | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [showFrequentLeaderboard, setShowFrequentLeaderboard] = useState(false);

  // Edit Customer
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', tier: '', isActive: true, internalNotes: '' });

  // Delete Customer
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  // Send Individual Email
  const [emailTarget, setEmailTarget] = useState<any | null>(null);
  const [emailForm, setEmailForm] = useState({
    subject: '',
    message: '',
    previewText: '',
    ctaText: '',
    ctaUrl: '',
  });

  // Send Mass Broadcast Email
  const [massEmailOpen, setMassEmailOpen] = useState(false);
  const [massEmailSelectedCustomerId, setMassEmailSelectedCustomerId] = useState<string>('');
  const [massEmailForm, setMassEmailForm] = useState({
    segment: 'all' as 'all' | 'frequent' | 'vip' | 'unverified' | 'inactive' | 'selected',
    subject: '',
    message: '',
    previewText: '',
    ctaText: '',
    ctaUrl: '',
  });

  // Email Preview Modal State
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{
    html: string;
    subject: string;
    recipientName: string;
    recipientEmail: string;
    attachmentsCount: number;
    isBroadcast: boolean;
  } | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  interface EmailAttachmentItem {
    filename: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
    publicId?: string;
    content?: string;
  }

  const [massAttachments, setMassAttachments] = useState<EmailAttachmentItem[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [directAttachments, setDirectAttachments] = useState<EmailAttachmentItem[]>([]);
  const [uploadingDirectAttachment, setUploadingDirectAttachment] = useState(false);

  // Targeted Coupon Generation
  const [couponTarget, setCouponTarget] = useState<any | null>(null);
  const [couponForm, setCouponForm] = useState({
    code: '',
    title: 'Exclusive Patron Privilege',
    description: '',
    discountType: 'percentage' as 'percentage' | 'flat',
    discountValue: 15,
    minOrderValue: 1500,
    maxDiscount: 1000,
    usageLimit: 1,
    endDate: '',
    sendEmail: true,
  });

  // Purge Unverified Confirmation
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const res = await apiRequest<CustomerStats>('/api/admin/customers/stats');
      setStats(res);
    } catch {
      // stats error handled silently or non-blocking
    } finally {
      setStatsLoading(false);
    }
  };

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ customers: any[] }>(
        `/api/admin/customers?search=${encodeURIComponent(search)}&segment=${segment}&customerType=${customerType}`
      );
      setCustomers(res.customers || []);
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to load customer directory.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStats();
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [search, segment, customerType]);

  const openProfile = async (id: string) => {
    try {
      const res = await apiRequest<any>(`/api/admin/customers/${id}`);
      setDetail(res);
      // Auto-expand first 2 orders
      const initExpanded: Record<string, boolean> = {};
      (res.orders || []).slice(0, 2).forEach((o: any) => {
        initExpanded[o.id] = true;
      });
      setExpandedOrders(initExpanded);
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to load customer profile.',
      });
    }
  };

  const toggleOrderExpand = (orderId: string) => {
    setExpandedOrders(prev => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  const openEdit = (c: any) => {
    setEditTarget(c);
    setEditForm({
      name: c.name,
      phone: c.phone || '',
      tier: c.tier || 'Privileged Patron',
      isActive: Boolean(c.isActive),
      internalNotes: c.internalNotes || '',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setActionLoading(true);
    try {
      await apiRequest(`/api/admin/customers/${editTarget.id}`, {
        method: 'PUT',
        body: editForm,
      });
      setEditTarget(null);
      setToast({ type: 'ok', text: 'Customer record updated successfully.' });
      await Promise.all([loadCustomers(), loadStats()]);
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Update failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    try {
      const res = await apiRequest<{ message: string }>(`/api/admin/customers/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      setDeleteTarget(null);
      if (detail && detail.customer?.id === deleteTarget.id) {
        setDetail(null);
      }
      setToast({ type: 'ok', text: res.message || 'Customer profile deleted.' });
      await Promise.all([loadCustomers(), loadStats()]);
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Failed to delete customer.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Helper to generate code
  const generateCouponCode = (name: string) => {
    const clean = (name || 'VIP').split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '').slice(0, 7) || 'VIP';
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `SETH-${clean}-${rand}`;
  };

  const openCouponModal = (c: any) => {
    setCouponTarget(c);
    const code = generateCouponCode(c.name);
    // Expiry default: 30 days from now
    const d = new Date();
    d.setDate(d.getDate() + 30);
    const defaultExpiry = d.toISOString().split('T')[0];

    setCouponForm({
      code,
      title: `Privileged Reserve for ${c.name}`,
      description: `Exclusive patron discount reserved for ${c.name}`,
      discountType: 'percentage',
      discountValue: 15,
      minOrderValue: 1500,
      maxDiscount: 1000,
      usageLimit: 1,
      endDate: defaultExpiry,
      sendEmail: true,
    });
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponTarget) return;
    setActionLoading(true);
    try {
      const res = await apiRequest<{ message: string }>(`/api/admin/customers/${couponTarget.id}/coupon`, {
        method: 'POST',
        body: {
          code: couponForm.code,
          title: couponForm.title,
          description: couponForm.description,
          discountType: couponForm.discountType,
          discountValue: Number(couponForm.discountValue),
          minOrderValue: Number(couponForm.minOrderValue || 0),
          maxDiscount: couponForm.maxDiscount ? Number(couponForm.maxDiscount) : null,
          usageLimit: Number(couponForm.usageLimit || 1),
          endDate: couponForm.endDate ? new Date(couponForm.endDate).toISOString() : null,
          sendEmail: Boolean(couponForm.sendEmail),
        },
      });
      setCouponTarget(null);
      setToast({ type: 'ok', text: res.message || 'Targeted coupon created.' });
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Failed to create coupon.' });
    } finally {
      setActionLoading(false);
    }
  };

  function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const ALLOWED_ATTACHMENT_EXTS = [
    '.png', '.jpg', '.jpeg', '.webp', '.gif',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.ppt', '.pptx', '.zip',
  ];

  function getPreviewUrl(item: EmailAttachmentItem): string {
    const isImg =
      item.mimeType?.startsWith('image/') ||
      /\.(png|jpe?g|webp|gif|svg)$/i.test(item.filename);
    if (isImg) return item.url;
    return `/api/media/attachment?url=${encodeURIComponent(item.url)}&name=${encodeURIComponent(item.filename)}`;
  }

  function getFileTypeTag(item: EmailAttachmentItem): { label: string; badgeClass: string } {
    const isImg =
      item.mimeType?.startsWith('image/') ||
      /\.(png|jpe?g|webp|gif|svg)$/i.test(item.filename);
    if (isImg) return { label: 'IMAGE', badgeClass: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    const ext = item.filename.slice(item.filename.lastIndexOf('.')).toLowerCase();
    if (ext === '.pdf') return { label: 'PDF', badgeClass: 'text-red-700 bg-red-50 border-red-200' };
    if (['.doc', '.docx'].includes(ext)) return { label: 'DOC', badgeClass: 'text-blue-700 bg-blue-50 border-blue-200' };
    if (['.xls', '.xlsx', '.csv'].includes(ext)) return { label: 'SHEET', badgeClass: 'text-green-700 bg-green-50 border-green-200' };
    if (['.ppt', '.pptx'].includes(ext)) return { label: 'SLIDE', badgeClass: 'text-orange-700 bg-orange-50 border-orange-200' };
    if (['.zip', '.rar'].includes(ext)) return { label: 'ARCHIVE', badgeClass: 'text-purple-700 bg-purple-50 border-purple-200' };
    return { label: 'DOC', badgeClass: 'text-[#183D32] bg-[#E9E4D9]/40 border-[#E9E4D9]' };
  }

  const handleAttachmentUpload = async (
    files: FileList | null,
    isDirect = false
  ) => {
    if (!files || files.length === 0) return;

    const currentList = isDirect ? directAttachments : massAttachments;
    const setList = isDirect ? setDirectAttachments : setMassAttachments;
    const setUploading = isDirect ? setUploadingDirectAttachment : setUploadingAttachment;

    if (currentList.length + files.length > 5) {
      setToast({ type: 'err', text: 'You can attach at most 5 files (Images & Documents).' });
      return;
    }

    setUploading(true);
    try {
      const newItems: EmailAttachmentItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 10 * 1024 * 1024) {
          setToast({ type: 'err', text: `"${file.name}" exceeds the 10 MB limit.` });
          continue;
        }

        const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        if (!ALLOWED_ATTACHMENT_EXTS.includes(ext) && !file.type.startsWith('image/') && file.type !== 'application/pdf') {
          setToast({
            type: 'err',
            text: `"${file.name}" has an unsupported format. Supported: Images, PDFs, Word, Excel, CSV, TXT, PowerPoint, ZIP.`,
          });
          continue;
        }

        const fd = new FormData();
        fd.append('file', file);
        const res = await apiUpload<{ attachment: EmailAttachmentItem }>(
          '/api/admin/customers/upload-attachment',
          fd
        );
        newItems.push(res.attachment);
      }

      if (newItems.length > 0) {
        setList(prev => [...prev, ...newItems]);
        setToast({ type: 'ok', text: `Attached ${newItems.length} file(s) successfully.` });
      }
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Failed to upload attachment.',
      });
    } finally {
      setUploading(false);
    }
  };

  const openEmailModal = (c: any) => {
    setEmailTarget(c);
    setDirectAttachments([]);
    setEmailForm({
      subject: `A Note From Seth And Sons DryFruits`,
      message: `Dear ${c.name},\n\nWe wanted to extend our sincere appreciation for being a valued patron of our heritage reserve.\n\nShould you have any inquiries regarding upcoming harvest reserves or bespoke packaging, our concierge team remains entirely at your service.`,
      previewText: 'Exclusive update regarding your Seth And Sons account',
      ctaText: 'Visit Our Private Reserve',
      ctaUrl: '/catalog',
    });
  };

  const handlePreviewIndividualEmail = async () => {
    if (!emailTarget) return;
    if (!emailForm.subject.trim() || !emailForm.message.trim()) {
      setToast({ type: 'err', text: 'Please enter a subject and message body before previewing.' });
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await apiRequest<{ html: string; subject: string; recipientName: string; recipientEmail: string; attachmentsCount: number }>(
        '/api/admin/customers/preview-email',
        {
          method: 'POST',
          body: {
            recipientName: emailTarget.name,
            recipientEmail: emailTarget.email,
            subject: emailForm.subject,
            message: emailForm.message,
            previewText: emailForm.previewText,
            ctaText: emailForm.ctaText,
            ctaUrl: emailForm.ctaUrl,
            attachments: directAttachments,
          },
        }
      );
      setPreviewData({ ...res, isBroadcast: false });
      setPreviewModalOpen(true);
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Failed to generate preview.' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePreviewMassEmail = async () => {
    if (!massEmailForm.subject.trim() || !massEmailForm.message.trim()) {
      setToast({ type: 'err', text: 'Please enter a subject and message body before previewing.' });
      return;
    }
    setPreviewLoading(true);
    try {
      let sampleName = 'Valued Patron';
      let sampleEmail = 'patron@sethandsons.com';
      if (massEmailForm.segment === 'selected' && massEmailSelectedCustomerId) {
        const found = customers.find(c => c.id === massEmailSelectedCustomerId);
        if (found) {
          sampleName = found.name;
          sampleEmail = found.email;
        }
      } else if (customers.length > 0) {
        sampleName = customers[0].name;
        sampleEmail = customers[0].email;
      }

      const res = await apiRequest<{ html: string; subject: string; recipientName: string; recipientEmail: string; attachmentsCount: number }>(
        '/api/admin/customers/preview-email',
        {
          method: 'POST',
          body: {
            recipientName: sampleName,
            recipientEmail: sampleEmail,
            subject: massEmailForm.subject,
            message: massEmailForm.message,
            previewText: massEmailForm.previewText,
            ctaText: massEmailForm.ctaText,
            ctaUrl: massEmailForm.ctaUrl,
            attachments: massAttachments,
          },
        }
      );
      setPreviewData({ ...res, isBroadcast: true });
      setPreviewModalOpen(true);
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Failed to generate preview.' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSendIndividualEmail = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!emailTarget) return;
    setActionLoading(true);
    try {
      const res = await apiRequest<{ message: string }>(`/api/admin/customers/${emailTarget.id}/send-email`, {
        method: 'POST',
        body: {
          ...emailForm,
          attachments: directAttachments,
        },
      });
      setEmailTarget(null);
      setDirectAttachments([]);
      setPreviewModalOpen(false);
      setToast({ type: 'ok', text: res.message || 'Email sent successfully.' });
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Failed to send email.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendMassEmail = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (massEmailForm.segment === 'selected' && !massEmailSelectedCustomerId) {
      setToast({ type: 'err', text: 'Please select a specific customer.' });
      return;
    }
    setActionLoading(true);
    try {
      const res = await apiRequest<{ message: string; dispatchedCount: number }>('/api/admin/customers/mass-email', {
        method: 'POST',
        body: {
          ...massEmailForm,
          customerIds: massEmailForm.segment === 'selected' ? [massEmailSelectedCustomerId] : undefined,
          attachments: massAttachments,
        },
      });
      setMassEmailOpen(false);
      setMassAttachments([]);
      setPreviewModalOpen(false);
      setToast({ type: 'ok', text: res.message || `Dispatched to ${res.dispatchedCount} patrons.` });
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Broadcast failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendUnverifiedReminders = async () => {
    setActionLoading(true);
    try {
      const res = await apiRequest<{ message: string; remindedCount: number }>(
        '/api/admin/customers/unverified/remind',
        { method: 'POST' }
      );
      setToast({ type: 'ok', text: res.message || 'Verification reminders dispatched.' });
      await loadStats();
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Failed to send verification reminders.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handlePurgeUnverified = async () => {
    setActionLoading(true);
    try {
      const res = await apiRequest<{ message: string; purgedCount: number }>(
        '/api/admin/customers/unverified/purge',
        { method: 'POST' }
      );
      setPurgeConfirmOpen(false);
      setToast({ type: 'ok', text: res.message || 'Expired unverified accounts purged.' });
      await Promise.all([loadCustomers(), loadStats()]);
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Purge failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <AdminLayout
      title="Customer Directory & Patron Intelligence"
      subtitle="Manage patron profiles, inspect ordered items, reward frequent buyers with bespoke coupons, and administer unverified account policies."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setMassEmailSelectedCustomerId('');
              setMassEmailOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#245746] text-white hover:bg-[#183D32] transition cursor-pointer shadow-xs"
            title="Send Announcement to Customer Segments"
          >
            <Mail className="w-3.5 h-3.5 text-[#C8A96B]" />
            <span>Broadcast Email</span>
            <span className="text-[10px] bg-white/20 text-[#E9E4D9] px-1.5 py-0.2 rounded-md font-medium">Segments</span>
          </button>
          <a
            href="/api/admin/customers/export.csv"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#183D32] text-white hover:opacity-95 transition"
          >
            <Download className="w-3.5 h-3.5 text-[#C8A96B]" />
            <span>Export CSV</span>
          </a>
        </div>
      }
    >
      <div className="space-y-5">
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

        {/* 1. FREQUENT BUYERS & PATRON ANALYTICS CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-white border border-[#E9E4D9] shadow-sm">
            <div className="flex items-center justify-between text-[#888B83] text-xs mb-1">
              <span>Registered Patrons</span>
              <Users className="w-4 h-4 text-[#183D32]" />
            </div>
            <div className="text-2xl font-bold text-[#183D32]">
              {statsLoading ? '—' : stats?.totalCustomers ?? 0}
            </div>
            <div className="text-[11px] text-[#5C6058] mt-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                <span>{stats?.verifiedCount ?? 0} verified</span>
              </span>
              <span className="text-[#8F6C2B] font-medium">
                {stats?.oneTimeCustomersCount ?? 0} one-time
              </span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#C8A96B]/40 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-[#C8A96B]/10 rounded-bl-full pointer-events-none" />
            <div className="flex items-center justify-between text-[#888B83] text-xs mb-1">
              <span className="font-semibold text-[#8F6C2B]">Frequent Buyers (2+ orders)</span>
              <Sparkles className="w-4 h-4 text-[#C8A96B]" />
            </div>
            <div className="text-2xl font-bold text-[#183D32]">
              {statsLoading ? '—' : stats?.frequentBuyersCount ?? 0}
            </div>
            <div className="text-[11px] text-[#8F6C2B] font-medium mt-1">
              {stats?.repeatPurchaseRate ?? 0}% repeat rate ({stats?.vipCount ?? 0} VIPs)
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#E9E4D9] shadow-sm">
            <div className="flex items-center justify-between text-[#888B83] text-xs mb-1">
              <span>Repeat Buyer Spend</span>
              <ShoppingBag className="w-4 h-4 text-[#245746]" />
            </div>
            <div className="text-2xl font-bold text-[#183D32]">
              {statsLoading ? '—' : formatINR(stats?.frequentBuyersRevenue ?? 0)}
            </div>
            <div className="text-[11px] text-[#5C6058] mt-1">
              AOV: {formatINR(stats?.frequentBuyersAov ?? 0)}
            </div>
          </div>

          <div
            className={`p-4 rounded-2xl border shadow-sm transition ${
              (stats?.unverifiedCount ?? 0) > 0
                ? 'bg-[#FFF8EE] border-[#C8A96B]/60'
                : 'bg-white border-[#E9E4D9]'
            }`}
          >
            <div className="flex items-center justify-between text-[#888B83] text-xs mb-1">
              <span className="font-semibold text-[#8F6C2B]">Unverified Accounts</span>
              <AlertTriangle className="w-4 h-4 text-[#C8A96B]" />
            </div>
            <div className="text-2xl font-bold text-[#8F6C2B]">
              {statsLoading ? '—' : stats?.unverifiedCount ?? 0}
            </div>
            <div className="text-[11px] text-[#A64B2A] font-semibold mt-1">
              {stats?.unverifiedEligibleForPurge ?? 0} eligible for 48h purge
            </div>
          </div>
        </div>

        {/* 2. UNVERIFIED ACCOUNTS PURGE & REMINDER BANNER */}
        {Boolean(stats && stats.unverifiedCount > 0) && (
          <div className="p-4 rounded-2xl bg-[#FFF8EE] border border-[#C8A96B]/50 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-[#C8A96B] shrink-0 mt-0.5" />
              <div>
                <strong className="text-[#183D32] text-sm font-bold block">
                  Action Required: {stats?.unverifiedCount} Unverified Patron Account(s)
                </strong>
                <p className="text-[#5C6058] text-[12px] mt-0.5">
                  Send a 48-hour email reminder blast urging patrons to verify their account. Accounts unverified after 2 days can be purged with a single click, permanently cleaning all database info, tokens, and uploaded images.
                </p>
                {Boolean(stats && stats.unverifiedEligibleForPurge > 0) && (
                  <span className="inline-block mt-1 font-semibold text-[#A64B2A] bg-[#A64B2A]/10 px-2 py-0.5 rounded-full text-[11px]">
                    {stats?.unverifiedEligibleForPurge} account(s) are older than 48 hours and ready to be purged.
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={handleSendUnverifiedReminders}
                disabled={actionLoading}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#183D32] text-white hover:bg-[#245746] transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Mail className="w-3.5 h-3.5 text-[#C8A96B]" />
                <span>Send 48h Reminder Blast</span>
              </button>

              <button
                onClick={() => setPurgeConfirmOpen(true)}
                disabled={actionLoading || (stats?.unverifiedEligibleForPurge ?? 0) === 0}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#8B261E] text-white hover:bg-[#A64B2A] transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                title={
                  (stats?.unverifiedEligibleForPurge ?? 0) === 0
                    ? 'No accounts older than 48 hours yet'
                    : 'Purge all expired unverified accounts'
                }
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Purge Expired ({stats?.unverifiedEligibleForPurge ?? 0})</span>
              </button>
            </div>
          </div>
        )}

        {/* 3. FREQUENT BUYERS LEADERBOARD ACCORDION */}
        <AdminCard padding="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#C8A96B]" />
              <h3 className="font-bold text-[#183D32] text-sm">Frequent Buyers Leaderboard</h3>
              <span className="px-2 py-0.5 rounded-full bg-[#C8A96B]/20 text-[#8F6C2B] text-[11px] font-semibold">
                {stats?.topFrequentBuyers?.length ?? 0} Repeat Patrons
              </span>
            </div>
            <button
              onClick={() => setShowFrequentLeaderboard(!showFrequentLeaderboard)}
              className="p-1.5 rounded-lg hover:bg-[#F8F6F0] text-[#5C6058] text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <span>{showFrequentLeaderboard ? 'Hide Leaderboard' : 'View Top Repeat Buyers'}</span>
              {showFrequentLeaderboard ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {showFrequentLeaderboard && (
            <div className="mt-4 pt-3 border-t border-[#E9E4D9] overflow-x-auto">
              {!stats?.topFrequentBuyers || stats.topFrequentBuyers.length === 0 ? (
                <p className="text-xs text-[#888B83] py-2">No frequent buyers (2+ orders) recorded yet.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E9E4D9] text-[#888B83] uppercase text-[10px]">
                      <th className="py-2 pr-3">Rank</th>
                      <th className="py-2 pr-3">Patron</th>
                      <th className="py-2 pr-3">Orders</th>
                      <th className="py-2 pr-3">Total Spend</th>
                      <th className="py-2 pr-3">Average Order</th>
                      <th className="py-2 pr-3">Tier</th>
                      <th className="py-2 pr-3">Last Order</th>
                      <th className="py-2">Reward Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9E4D9]">
                    {stats.topFrequentBuyers.map((fb, idx) => (
                      <tr key={fb.id} className="hover:bg-[#F8F6F0]/60">
                        <td className="py-2.5 pr-3 font-bold text-[#C8A96B]">#{idx + 1}</td>
                        <td className="py-2.5 pr-3">
                          <div className="font-semibold text-[#183D32]">{fb.name}</div>
                          <div className="text-[11px] text-[#888B83]">{fb.email}</div>
                        </td>
                        <td className="py-2.5 pr-3 font-bold text-[#183D32]">{fb.totalOrders}</td>
                        <td className="py-2.5 pr-3 font-bold text-[#245746]">{formatINR(fb.totalSpent)}</td>
                        <td className="py-2.5 pr-3">{formatINR(fb.averageOrderValue)}</td>
                        <td className="py-2.5 pr-3">
                          <span className="px-2 py-0.5 rounded-full bg-[#183D32]/10 text-[#183D32] font-semibold text-[10px]">
                            {fb.tier}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-[#888B83]">
                          {fb.lastOrderAt ? new Date(fb.lastOrderAt).toLocaleDateString('en-IN') : '—'}
                        </td>
                        <td className="py-2.5 flex items-center gap-1.5">
                          <button
                            onClick={() => openCouponModal(fb)}
                            className="px-2 py-1 rounded-lg bg-[#F8F6F0] hover:bg-[#E9E4D9] text-[#8F6C2B] font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                            title="Generate Custom Coupon"
                          >
                            <Tag className="w-3 h-3 text-[#C8A96B]" />
                            <span>Gift Coupon</span>
                          </button>
                          <button
                            onClick={() => openEmailModal(fb)}
                            className="p-1 rounded-lg hover:bg-[#E9E4D9] text-[#183D32] cursor-pointer"
                            title="Send Email"
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </AdminCard>

        {/* 4. CUSTOMER DIRECTORY CONTROLS & TYPE SWITCHER */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#E9E4D9] pb-3">
          <button
            type="button"
            onClick={() => setCustomerType('registered')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              customerType === 'registered'
                ? 'bg-[#183D32] text-white shadow-sm'
                : 'bg-[#F8F6F0] text-[#5C6058] hover:bg-[#E9E4D9] border border-[#E9E4D9]'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-[#C8A96B]" />
            <span>Registered App Patrons</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                customerType === 'registered'
                  ? 'bg-white/20 text-white'
                  : 'bg-[#E9E4D9] text-[#183D32]'
              }`}
            >
              {statsLoading ? '…' : stats?.totalCustomers ?? 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setCustomerType('one_time')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              customerType === 'one_time'
                ? 'bg-[#183D32] text-white shadow-sm'
                : 'bg-[#F8F6F0] text-[#5C6058] hover:bg-[#E9E4D9] border border-[#E9E4D9]'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5 text-[#C8A96B]" />
            <span>One-Time Customers (Manual Orders)</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                customerType === 'one_time'
                  ? 'bg-[#C8A96B] text-[#183D32]'
                  : 'bg-[#E9E4D9] text-[#183D32]'
              }`}
            >
              {statsLoading ? '…' : stats?.oneTimeCustomersCount ?? 0}
            </span>
          </button>
        </div>

        <AdminCard padding="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'all', label: customerType === 'one_time' ? 'All One-Time Customers' : 'All Patrons' },
                { id: 'frequent', label: 'Frequent Buyers (2+)' },
                { id: 'vip', label: 'VIP Patrons' },
                { id: 'new', label: 'New (30d)' },
                { id: 'returning', label: 'Returning' },
                ...(customerType === 'registered'
                  ? [
                      { id: 'unverified', label: 'Unverified' },
                      { id: 'inactive', label: 'Inactive' },
                    ]
                  : []),
              ].map(s => (
                <button
                  key={s.id}
                  onClick={() => setSegment(s.id as any)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer border transition ${
                    segment === s.id
                      ? 'bg-[#183D32] text-white border-[#183D32]'
                      : 'bg-[#F8F6F0] text-[#5C6058] border-[#E9E4D9] hover:bg-[#E9E4D9]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="relative sm:w-64">
              <Search className="w-4 h-4 text-[#888B83] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name, email, phone..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs focus:outline-none focus:border-[#C8A96B]"
              />
            </div>
          </div>
        </AdminCard>

        {/* 5. CUSTOMER TABLE */}
        <AdminCard>
          {loading ? (
            <LoadingSkeleton rows={5} />
          ) : customers.length === 0 ? (
            <EmptyState
              icon={customerType === 'one_time' ? ShoppingBag : Users}
              title={customerType === 'one_time' ? 'No One-Time Customers' : 'No Customers Found'}
              description={
                customerType === 'one_time'
                  ? 'No manual order patrons recorded yet. When orders are created via WhatsApp or Phone, patrons appear here without cluttering the app customer list.'
                  : 'No customer records match the selected segment or search criteria.'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E9E4D9] text-[#888B83] uppercase text-[11px]">
                    <th className="py-3 pr-3">Customer</th>
                    <th className="py-3 pr-3">Contact</th>
                    {customerType === 'one_time' ? (
                      <th className="py-3 pr-3">Channel / Source</th>
                    ) : (
                      <th className="py-3 pr-3">Verification</th>
                    )}
                    <th className="py-3 pr-3">Orders</th>
                    <th className="py-3 pr-3">Total Spend</th>
                    <th className="py-3 pr-3">{customerType === 'one_time' ? 'Added' : 'Registered'}</th>
                    <th className="py-3 pr-3">Status</th>
                    <th className="py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E4D9]">
                  {customers.map(c => {
                    const src = String(c.source || 'web').toLowerCase();
                    return (
                      <tr key={c.id} className="hover:bg-[#F8F6F0]/60 transition">
                        <td className="py-3 pr-3 font-semibold text-[#183D32]">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-[#183D32]/10 text-[#183D32] flex items-center justify-center font-bold text-xs uppercase">
                              {c.name ? c.name.charAt(0) : 'P'}
                            </div>
                            <div>
                              <div>{c.name}</div>
                              {c.isOneTime ? (
                                <span className="text-[10px] text-[#C8A96B] font-semibold flex items-center gap-1">
                                  <span>One-Time Patron</span>
                                </span>
                              ) : (
                                c.tier && (
                                  <span className="text-[10px] text-[#8F6C2B] font-normal">{c.tier}</span>
                                )
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-3">
                          <div className="text-[#5C6058]">{c.email}</div>
                          <div className="text-[11px] text-[#888B83]">{c.phone || '—'}</div>
                        </td>
                        <td className="py-3 pr-3">
                          {customerType === 'one_time' ? (
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                                src === 'whatsapp'
                                  ? 'bg-[#E7F6ED] text-[#128C7E]'
                                  : src === 'phone'
                                  ? 'bg-[#EBF5FB] text-[#2980B9]'
                                  : src === 'instagram'
                                  ? 'bg-[#F4ECF7] text-[#8E44AD]'
                                  : 'bg-[#FAF3E3] text-[#C8A96B]'
                              }`}
                            >
                              {src === 'whatsapp' ? (
                                <MessageCircle className="w-3 h-3" />
                              ) : src === 'phone' ? (
                                <Phone className="w-3 h-3" />
                              ) : src === 'instagram' ? (
                                <ExternalLink className="w-3 h-3" />
                              ) : (
                                <UserIcon className="w-3 h-3" />
                              )}
                              <span className="capitalize">{src}</span>
                            </span>
                          ) : c.emailVerified ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Verified</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-semibold text-[10px]">
                              <Clock className="w-3 h-3" />
                              <span>Unverified</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-3 font-semibold">
                          <div className="flex items-center gap-1.5">
                            <span>{c.totalOrders}</span>
                            {c.totalOrders >= 2 && (
                              <span className="px-1.5 py-0.2 rounded bg-[#C8A96B]/20 text-[#8F6C2B] text-[9px] font-bold uppercase">
                                Repeat
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 pr-3 font-bold text-[#183D32]">{formatINR(c.totalSpent)}</td>
                        <td className="py-3 pr-3 text-[#888B83]">
                          {new Date(c.createdAt).toLocaleDateString('en-IN')}
                        </td>
                        <td className="py-3 pr-3">
                          <StatusBadge status={c.isActive ? 'active' : 'inactive'} />
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openProfile(c.id)}
                              className="p-1.5 rounded-lg hover:bg-[#E9E4D9]/60 text-[#245746] cursor-pointer"
                              title="Inspect Profile & Ordered Items"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {customerType === 'registered' && (
                              <button
                                onClick={() => openCouponModal(c)}
                                className="p-1.5 rounded-lg hover:bg-[#E9E4D9]/60 text-[#8F6C2B] cursor-pointer"
                                title="Generate Custom Coupon"
                              >
                                <Tag className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => openEmailModal(c)}
                              className="px-2 py-1 rounded-lg bg-white hover:bg-[#FAF8F5] border border-[#E9E4D9] text-[#183D32] font-semibold text-[11px] flex items-center gap-1 cursor-pointer transition shadow-2xs"
                              title={`Send Individual Direct Email to ${c.name} (Strictly 1 Recipient)`}
                            >
                              <Mail className="w-3 h-3 text-[#C8A96B]" />
                              <span>Email</span>
                            </button>
                            <button
                              onClick={() => openEdit(c)}
                              className="p-1.5 rounded-lg hover:bg-[#E9E4D9]/60 text-[#5C6058] cursor-pointer"
                              title="Edit Customer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(c)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 cursor-pointer"
                              title="Delete Customer Profile"
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

        {/* ========================================================
            MODALS SECTION
        ======================================================== */}

        {/* 1. CUSTOMER DETAIL & ORDERED ITEMS MODAL */}
        <AdminModal
          open={Boolean(detail)}
          onClose={() => setDetail(null)}
          title={detail?.customer?.name || 'Customer Profile'}
          subtitle={detail?.customer?.email}
          maxWidth="max-w-2xl"
        >
          {detail && (
            <div className="space-y-4 text-xs">
              {/* Quick Actions in Detail Modal */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#183D32]">Tier: {detail.customer.tier}</span>
                  {detail.customer.emailVerified ? (
                    <span className="text-emerald-700 font-semibold text-[11px] flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Verified
                    </span>
                  ) : (
                    <span className="text-amber-700 font-semibold text-[11px] flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Unverified
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openCouponModal(detail.customer)}
                    className="px-2.5 py-1 rounded-lg bg-white border border-[#E9E4D9] hover:bg-[#E9E4D9] text-[#8F6C2B] font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    <Tag className="w-3 h-3 text-[#C8A96B]" /> Gift Coupon
                  </button>
                  <button
                    onClick={() => openEmailModal(detail.customer)}
                    className="px-2.5 py-1 rounded-lg bg-white border border-[#E9E4D9] hover:bg-[#E9E4D9] text-[#183D32] font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    <Mail className="w-3 h-3" /> Email
                  </button>
                  <button
                    onClick={() => setDeleteTarget(detail.customer)}
                    className="px-2 py-1 rounded-lg hover:bg-red-50 text-red-600 cursor-pointer"
                    title="Delete Account"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Stats Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]">
                  <div className="text-[#888B83]">Lifetime Spending</div>
                  <div className="text-lg font-bold text-[#183D32]">
                    {formatINR(detail.customer.lifetimeSpending)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]">
                  <div className="text-[#888B83]">Total Orders</div>
                  <div className="text-lg font-bold text-[#183D32]">{detail.orders.length}</div>
                </div>
                <div className="p-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9]">
                  <div className="text-[#888B83]">Loyalty Points</div>
                  <div className="text-lg font-bold text-[#8F6C2B]">{detail.customer.loyaltyPoints}</div>
                </div>
              </div>

              {/* Addresses */}
              <div>
                <h4 className="font-semibold text-[#183D32] mb-1.5">Saved Addresses ({detail.addresses.length})</h4>
                {detail.addresses.length === 0 ? (
                  <p className="text-[#888B83] italic">No saved delivery addresses.</p>
                ) : (
                  detail.addresses.map((a: any) => (
                    <div key={a.id} className="p-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] mb-1.5">
                      <strong className="text-[#183D32]">{a.label || 'Delivery Address'}:</strong> {a.fullName} • {a.phone}
                      <div className="text-[#5C6058] mt-0.5">{a.addressLine}, {a.city}, {a.state} - {a.pincode}</div>
                    </div>
                  ))
                )}
              </div>

              {/* Ordered Items History */}
              <div>
                <h4 className="font-semibold text-[#183D32] mb-1.5 flex items-center justify-between">
                  <span>Order History & Ordered Items ({detail.orders.length})</span>
                  <span className="text-[11px] text-[#888B83] font-normal">Click order to inspect items</span>
                </h4>

                {detail.orders.length === 0 ? (
                  <p className="text-[#888B83] italic">No orders placed yet.</p>
                ) : (
                  <div className="space-y-2">
                    {detail.orders.map((o: any) => {
                      const isExpanded = Boolean(expandedOrders[o.id]);
                      const items = o.items || [];
                      return (
                        <div key={o.id} className="rounded-xl border border-[#E9E4D9] bg-white overflow-hidden">
                          <button
                            type="button"
                            onClick={() => toggleOrderExpand(o.id)}
                            className="w-full p-3 flex items-center justify-between text-left hover:bg-[#F8F6F0]/60 transition cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#183D32]">#{o.orderNumber}</span>
                              <span className="text-[#888B83]">
                                {new Date(o.createdAt).toLocaleDateString('en-IN')}
                              </span>
                              <StatusBadge status={o.status} />
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="font-bold text-[#245746]">{formatINR(o.totalAmount)}</span>
                              <span className="text-[#888B83] text-[11px] flex items-center gap-1">
                                <span>{items.length} item{items.length === 1 ? '' : 's'}</span>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </span>
                            </div>
                          </button>

                          {/* Itemized Order Breakdown */}
                          {isExpanded && (
                            <div className="p-3 bg-[#F8F6F0]/50 border-t border-[#E9E4D9]">
                              {items.length === 0 ? (
                                <p className="text-[#888B83] italic text-[11px]">No item breakdown available.</p>
                              ) : (
                                <div className="space-y-2">
                                  {items.map((it: any, iIdx: number) => (
                                    <div key={iIdx} className="flex items-center justify-between text-xs py-1.5 border-b border-[#E9E4D9]/60 last:border-none">
                                      <div className="flex items-center gap-2.5">
                                        {it.productImage ? (
                                          <img
                                            src={it.productImage}
                                            alt={it.productName}
                                            className="w-9 h-9 object-cover rounded-lg border border-[#E9E4D9]"
                                          />
                                        ) : (
                                          <div className="w-9 h-9 rounded-lg bg-[#E9E4D9] flex items-center justify-center text-[#888B83]">
                                            <ShoppingBag className="w-4 h-4" />
                                          </div>
                                        )}
                                        <div>
                                          <div className="font-semibold text-[#183D32]">{it.productName}</div>
                                          <div className="text-[11px] text-[#888B83]">
                                            Pack: {it.weightLabel || '1 Unit'} • {it.category}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="text-right">
                                        <div className="font-bold text-[#183D32]">
                                          {formatINR(it.subtotal || it.unitPrice * it.quantity)}
                                        </div>
                                        <div className="text-[11px] text-[#888B83]">
                                          Qty: {it.quantity} × {formatINR(it.unitPrice)}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </AdminModal>

        {/* 2. EDIT CUSTOMER MODAL */}
        <AdminModal
          open={Boolean(editTarget)}
          onClose={() => setEditTarget(null)}
          title={`Edit Customer: ${editTarget?.name || ''}`}
          maxWidth="max-w-md"
        >
          <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
            <div>
              <label className="block text-[#5C6058] font-semibold mb-1">Full Name</label>
              <input
                type="text"
                required
                value={editForm.name}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Full Name"
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] focus:outline-none focus:border-[#C8A96B]"
              />
            </div>
            <div>
              <label className="block text-[#5C6058] font-semibold mb-1">Phone Number</label>
              <input
                type="tel"
                value={editForm.phone}
                onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder="10-digit mobile number"
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] focus:outline-none focus:border-[#C8A96B]"
              />
            </div>
            <div>
              <label className="block text-[#5C6058] font-semibold mb-1">Patron Tier</label>
              <input
                type="text"
                value={editForm.tier}
                onChange={e => setEditForm({ ...editForm, tier: e.target.value })}
                placeholder="Privileged Patron, VIP Reserve, Royal Circle..."
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] focus:outline-none focus:border-[#C8A96B]"
              />
            </div>
            <div>
              <label className="block text-[#5C6058] font-semibold mb-1">Internal Concierge Notes</label>
              <textarea
                rows={2}
                value={editForm.internalNotes}
                onChange={e => setEditForm({ ...editForm, internalNotes: e.target.value })}
                placeholder="Special preferences, packaging instructions..."
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] focus:outline-none focus:border-[#C8A96B]"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={editForm.isActive}
                onChange={e => setEditForm({ ...editForm, isActive: e.target.checked })}
                className="accent-[#183D32]"
              />
              <span className="font-semibold text-[#183D32]">Account Active (Permit login and ordering)</span>
            </label>
            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="px-4 py-2 rounded-xl border border-[#E9E4D9] hover:bg-[#F8F6F0] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl bg-[#183D32] text-white font-semibold hover:bg-[#245746] transition cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? 'Saving...' : 'Save Record'}
              </button>
            </div>
          </form>
        </AdminModal>

        {/* 3. DELETE CUSTOMER CONFIRMATION MODAL */}
        <AdminModal
          open={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          title="Permanently Delete Customer"
          maxWidth="max-w-md"
        >
          {deleteTarget && (
            <div className="space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold">Irreversible Administrative Action</strong>
                  <span>
                    You are about to permanently delete <strong>{deleteTarget.name}</strong> ({deleteTarget.email}).
                  </span>
                </div>
              </div>

              <p className="text-[#5C6058]">
                This will immediately purge all profile information, saved delivery addresses, active login sessions, verification tokens, uploaded avatar pictures, and exclusive coupons associated with this patron.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 rounded-xl border border-[#E9E4D9] hover:bg-[#F8F6F0] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteCustomer}
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-[#8B261E] text-white font-semibold hover:bg-red-800 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{actionLoading ? 'Deleting...' : 'Confirm Permanent Deletion'}</span>
                </button>
              </div>
            </div>
          )}
        </AdminModal>

        {/* 4. TARGETED COUPON GENERATOR MODAL */}
        <AdminModal
          open={Boolean(couponTarget)}
          onClose={() => setCouponTarget(null)}
          title={`Generate Exclusive Coupon for ${couponTarget?.name || ''}`}
          subtitle={`Locked exclusively to ${couponTarget?.email || ''}`}
          maxWidth="max-w-md"
        >
          {couponTarget && (
            <form onSubmit={handleCreateCoupon} className="space-y-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[#5C6058] font-semibold">Coupon Code</label>
                  <button
                    type="button"
                    onClick={() => setCouponForm({ ...couponForm, code: generateCouponCode(couponTarget.name) })}
                    className="text-[#C8A96B] hover:text-[#8F6C2B] font-semibold flex items-center gap-1 cursor-pointer text-[11px]"
                  >
                    <RefreshCw className="w-3 h-3" /> Generate Code
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={couponForm.code}
                  onChange={e => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. SETH-VIP-4A92"
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] font-mono font-bold tracking-wider text-[#183D32] focus:outline-none focus:border-[#C8A96B]"
                />
              </div>

              <div>
                <label className="block text-[#5C6058] font-semibold mb-1">Promotion Title</label>
                <input
                  type="text"
                  required
                  value={couponForm.title}
                  onChange={e => setCouponForm({ ...couponForm, title: e.target.value })}
                  placeholder="e.g. Bespoke Reserve Loyalty Reward"
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] focus:outline-none focus:border-[#C8A96B]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#5C6058] font-semibold mb-1">Discount Type</label>
                  <select
                    value={couponForm.discountType}
                    onChange={e => setCouponForm({ ...couponForm, discountType: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] focus:outline-none focus:border-[#C8A96B]"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="flat">Flat Amount (₹)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#5C6058] font-semibold mb-1">
                    {couponForm.discountType === 'percentage' ? 'Discount (%)' : 'Amount (₹)'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={couponForm.discountType === 'percentage' ? '100' : '100000'}
                    required
                    value={couponForm.discountValue}
                    onChange={e => setCouponForm({ ...couponForm, discountValue: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] font-bold text-[#183D32] focus:outline-none focus:border-[#C8A96B]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#5C6058] font-semibold mb-1">Min Order Value (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={couponForm.minOrderValue}
                    onChange={e => setCouponForm({ ...couponForm, minOrderValue: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] focus:outline-none focus:border-[#C8A96B]"
                  />
                </div>

                <div>
                  <label className="block text-[#5C6058] font-semibold mb-1">Usage Limit</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={couponForm.usageLimit}
                    onChange={e => setCouponForm({ ...couponForm, usageLimit: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] focus:outline-none focus:border-[#C8A96B]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#5C6058] font-semibold mb-1">Expiry Date</label>
                <input
                  type="date"
                  value={couponForm.endDate}
                  onChange={e => setCouponForm({ ...couponForm, endDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] focus:outline-none focus:border-[#C8A96B]"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={couponForm.sendEmail}
                  onChange={e => setCouponForm({ ...couponForm, sendEmail: e.target.checked })}
                  className="accent-[#183D32]"
                />
                <span className="font-semibold text-[#183D32]">Directly email this exclusive coupon to patron</span>
              </label>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setCouponTarget(null)}
                  className="px-4 py-2 rounded-xl border border-[#E9E4D9] hover:bg-[#F8F6F0] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-[#183D32] text-white font-semibold hover:bg-[#245746] transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Tag className="w-3.5 h-3.5 text-[#C8A96B]" />
                  <span>{actionLoading ? 'Creating...' : 'Grant Coupon'}</span>
                </button>
              </div>
            </form>
          )}
        </AdminModal>

        {/* 5. INDIVIDUAL EMAIL COMPOSER MODAL */}
        <AdminModal
          open={Boolean(emailTarget)}
          onClose={() => {
            setEmailTarget(null);
            setDirectAttachments([]);
          }}
          title={`Compose Direct Email for ${emailTarget?.name || ''}`}
          subtitle={`Sending strictly to: ${emailTarget?.email || ''}`}
          maxWidth="max-w-xl"
        >
          {emailTarget && (
            <form onSubmit={handleSendIndividualEmail} className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-[#064e3b]/10 border border-[#064e3b]/20 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-bold text-[#064e3b] tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#064e3b]" />
                    <span>Strictly Individual Direct Email (1 Recipient Only)</span>
                  </div>
                  <div className="text-xs font-semibold text-[#183D32] mt-0.5">
                    {emailTarget.name} &lt;{emailTarget.email}&gt;
                  </div>
                  <div className="text-[11px] text-[#5C6058]">
                    This email is delivered strictly to this customer. It will never be broadcast to any other patrons.
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#064e3b] text-white shrink-0">
                  1 Recipient
                </span>
              </div>

              <div>
                <label className="block text-[#5C6058] font-semibold mb-1">Subject</label>
                <input
                  type="text"
                  required
                  value={emailForm.subject}
                  onChange={e => setEmailForm({ ...emailForm, subject: e.target.value })}
                  placeholder="Subject line..."
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] focus:outline-none focus:border-[#C8A96B]"
                />
              </div>

              <div>
                <label className="block text-[#5C6058] font-semibold mb-1">Message Body</label>
                <textarea
                  rows={5}
                  required
                  value={emailForm.message}
                  onChange={e => setEmailForm({ ...emailForm, message: e.target.value })}
                  placeholder="Type your message..."
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] focus:outline-none focus:border-[#C8A96B]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#5C6058] font-semibold mb-1">Optional Button Text</label>
                  <input
                    type="text"
                    value={emailForm.ctaText}
                    onChange={e => setEmailForm({ ...emailForm, ctaText: e.target.value })}
                    placeholder="e.g. View Catalog"
                    className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] focus:outline-none focus:border-[#C8A96B]"
                  />
                </div>
                <div>
                  <label className="block text-[#5C6058] font-semibold mb-1">Button Link / URL</label>
                  <input
                    type="text"
                    value={emailForm.ctaUrl}
                    onChange={e => setEmailForm({ ...emailForm, ctaUrl: e.target.value })}
                    placeholder="e.g. /catalog or https://..."
                    className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] focus:outline-none focus:border-[#C8A96B]"
                  />
                </div>
              </div>

              {/* Attachments Section (Images, PDF) */}
              <div className="pt-2 border-t border-[#E9E4D9]">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[#5C6058] font-semibold">
                    Attachments (Images &amp; Documents)
                  </label>
                  <span className="text-[11px] text-[#888B83]">
                    {directAttachments.length}/5 files (Max 10 MB each)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-[#C8A96B] bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[#183D32] font-semibold cursor-pointer transition ${
                      uploadingDirectAttachment || directAttachments.length >= 5 ? 'opacity-50 pointer-events-none' : ''
                    }`}
                  >
                    <Paperclip className="w-4 h-4 text-[#C8A96B]" />
                    <span>
                      {uploadingDirectAttachment
                        ? 'Uploading Attachment...'
                        : 'Attach Images & Documents'}
                    </span>
                    <input
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.zip"
                      disabled={uploadingDirectAttachment || directAttachments.length >= 5}
                      onChange={e => {
                        handleAttachmentUpload(e.target.files, true);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </label>
                  {uploadingDirectAttachment && (
                    <RefreshCw className="w-4 h-4 text-[#C8A96B] animate-spin" />
                  )}
                </div>

                {directAttachments.length > 0 && (
                  <div className="mt-2.5 space-y-1.5">
                    {directAttachments.map((att, idx) => {
                      const isImg =
                        att.mimeType?.startsWith('image/') ||
                        /\.(png|jpe?g|webp|gif|svg)$/i.test(att.filename);
                      const tag = getFileTypeTag(att);
                      const previewLink = getPreviewUrl(att);
                      return (
                        <div
                          key={`${att.url}_${idx}`}
                          className="flex items-center justify-between p-2 rounded-xl bg-white border border-[#E9E4D9] shadow-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {isImg ? (
                              <img
                                src={att.url}
                                alt={att.filename}
                                className="w-8 h-8 rounded-lg object-cover border border-[#E9E4D9] shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-[#FAF8F5] border border-[#E9E4D9] text-[#183D32] flex items-center justify-center shrink-0">
                                <FileText className="w-4 h-4 text-[#C8A96B]" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-[11px] font-semibold text-[#183D32] truncate max-w-[280px]">
                                {att.filename}
                              </div>
                              <div className="text-[10px] text-[#888B83] flex items-center gap-1.5">
                                <span className={`px-1.5 py-0.2 rounded font-bold text-[9px] border ${tag.badgeClass}`}>
                                  {tag.label}
                                </span>
                                <span>·</span>
                                <span>{formatBytes(att.sizeBytes)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <a
                              href={previewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-[#5C6058] hover:text-[#183D32] transition"
                              title="Preview or Download file"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            <button
                              type="button"
                              onClick={() =>
                                setDirectAttachments(prev => prev.filter((_, i) => i !== idx))
                              }
                              className="p-1.5 text-[#C65B50] hover:bg-red-50 rounded-lg transition cursor-pointer"
                              title="Remove attachment"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <p className="text-[11px] text-[#888B83] italic">
                This email will be delivered in the official Seth And Sons luxury Deep Emerald &amp; Champagne Gold format with authentic branding.
              </p>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={handlePreviewIndividualEmail}
                  disabled={previewLoading || !emailForm.subject.trim() || !emailForm.message.trim()}
                  className="px-4 py-2 rounded-xl border border-[#C8A96B] bg-[#FAF8F5] text-[#183D32] font-semibold hover:bg-[#F3EFEA] transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  title="Preview rendered email in luxury layout"
                >
                  <Eye className="w-3.5 h-3.5 text-[#C8A96B]" />
                  <span>{previewLoading ? 'Generating Preview...' : 'Preview Email'}</span>
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEmailTarget(null);
                      setDirectAttachments([]);
                    }}
                    className="px-4 py-2 rounded-xl border border-[#E9E4D9] hover:bg-[#F8F6F0] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading || uploadingDirectAttachment}
                    className="px-5 py-2 rounded-xl bg-[#183D32] text-white font-semibold hover:bg-[#245746] transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5 text-[#C8A96B]" />
                    <span>{actionLoading ? 'Dispatching...' : 'Dispatch Email'}</span>
                  </button>
                </div>
              </div>
            </form>
          )}
        </AdminModal>

        {/* 6. MASS BROADCAST EMAIL MODAL */}
        <AdminModal
          open={massEmailOpen}
          onClose={() => {
            setMassEmailOpen(false);
            setMassAttachments([]);
          }}
          title={massEmailForm.segment === 'selected' ? 'Compose Patron Direct Email' : 'Compose Mass Broadcast Email'}
          subtitle={
            massEmailForm.segment === 'selected'
              ? 'Send official branded communication to a specific patron'
              : 'Send official branded announcements to customer segments'
          }
          maxWidth="max-w-xl"
        >
          <form onSubmit={handleSendMassEmail} className="space-y-3 text-xs">
            {massEmailForm.segment === 'selected' ? (
              <div className="p-3 rounded-xl bg-[#064e3b]/10 border border-[#064e3b]/20 text-xs">
                <div className="font-bold text-[#064e3b] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Single Patron Mode Selected</span>
                </div>
                <div className="text-[#5C6058] mt-0.5">
                  This email will be dispatched ONLY to the chosen customer below. No other customers will receive it.
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs">
                <div className="font-bold text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Mass Broadcast Mode</span>
                </div>
                <div className="text-amber-900 mt-0.5">
                  Sending announcement to <strong>{massEmailForm.segment === 'all' ? (stats?.totalCustomers || customers.length) : 'multiple'} patrons</strong> in this segment.
                </div>
              </div>
            )}

            <div>
              <label className="block text-[#5C6058] font-semibold mb-1">Target Segment</label>
              <select
                value={massEmailForm.segment}
                onChange={e => setMassEmailForm({ ...massEmailForm, segment: e.target.value as any })}
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] font-semibold text-[#183D32] focus:outline-none focus:border-[#C8A96B]"
              >
                <option value="all">All Registered Patrons ({stats?.totalCustomers || customers.length})</option>
                <option value="frequent">Frequent Buyers (2+ Orders) ({stats?.frequentBuyersCount || 0})</option>
                <option value="vip">VIP Patrons (₹10,000+ spend or 3+ orders) ({stats?.vipCount || 0})</option>
                <option value="unverified">Unverified Accounts Only ({stats?.unverifiedCount || 0})</option>
                <option value="inactive">Inactive Patrons (60+ days)</option>
                <option value="selected">Specific Single Patron (Individual Customer)</option>
              </select>
            </div>

            {massEmailForm.segment === 'selected' && (
              <div>
                <label className="block text-[#5C6058] font-semibold mb-1">Choose Recipient Patron</label>
                <select
                  required
                  value={massEmailSelectedCustomerId}
                  onChange={e => setMassEmailSelectedCustomerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#C8A96B] font-semibold text-[#183D32] focus:outline-none focus:border-[#C8A96B]"
                >
                  <option value="">-- Select Patron --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.email})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-[#5C6058] font-semibold mb-1">Subject</label>
              <input
                type="text"
                required
                value={massEmailForm.subject}
                onChange={e => setMassEmailForm({ ...massEmailForm, subject: e.target.value })}
                placeholder="Broadcast subject line..."
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] focus:outline-none focus:border-[#C8A96B]"
              />
            </div>

            <div>
              <label className="block text-[#5C6058] font-semibold mb-1">Message Body</label>
              <textarea
                rows={5}
                required
                value={massEmailForm.message}
                onChange={e => setMassEmailForm({ ...massEmailForm, message: e.target.value })}
                placeholder="Broadcast message..."
                className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] focus:outline-none focus:border-[#C8A96B]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[#5C6058] font-semibold mb-1">Button Text (Optional)</label>
                <input
                  type="text"
                  value={massEmailForm.ctaText}
                  onChange={e => setMassEmailForm({ ...massEmailForm, ctaText: e.target.value })}
                  placeholder="e.g. Explore Reserve"
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] focus:outline-none focus:border-[#C8A96B]"
                />
              </div>
              <div>
                <label className="block text-[#5C6058] font-semibold mb-1">Button Link (Optional)</label>
                <input
                  type="text"
                  value={massEmailForm.ctaUrl}
                  onChange={e => setMassEmailForm({ ...massEmailForm, ctaUrl: e.target.value })}
                  placeholder="e.g. /catalog"
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] focus:outline-none focus:border-[#C8A96B]"
                />
              </div>
            </div>

            {/* Attachments Section (Images, PDF) */}
            <div className="pt-2 border-t border-[#E9E4D9]">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[#5C6058] font-semibold">
                  Attachments (Images &amp; Documents)
                </label>
                <span className="text-[11px] text-[#888B83]">
                  {massAttachments.length}/5 files (Images, PDFs, Word, Excel, CSV, TXT, Max 10 MB each)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <label
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-[#C8A96B] bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[#183D32] font-semibold cursor-pointer transition ${
                    uploadingAttachment || massAttachments.length >= 5 ? 'opacity-50 pointer-events-none' : ''
                  }`}
                >
                  <Paperclip className="w-4 h-4 text-[#C8A96B]" />
                  <span>
                    {uploadingAttachment
                      ? 'Uploading Attachment...'
                      : 'Attach Images & Documents'}
                  </span>
                  <input
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.zip"
                    disabled={uploadingAttachment || massAttachments.length >= 5}
                    onChange={e => {
                      handleAttachmentUpload(e.target.files, false);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
                {uploadingAttachment && (
                  <RefreshCw className="w-4 h-4 text-[#C8A96B] animate-spin" />
                )}
              </div>

              {massAttachments.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  {massAttachments.map((att, idx) => {
                    const isImg =
                      att.mimeType?.startsWith('image/') ||
                      /\.(png|jpe?g|webp|gif|svg)$/i.test(att.filename);
                    const tag = getFileTypeTag(att);
                    const previewLink = getPreviewUrl(att);
                    return (
                      <div
                        key={`${att.url}_${idx}`}
                        className="flex items-center justify-between p-2 rounded-xl bg-white border border-[#E9E4D9] shadow-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isImg ? (
                            <img
                              src={att.url}
                              alt={att.filename}
                              className="w-8 h-8 rounded-lg object-cover border border-[#E9E4D9] shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-[#FAF8F5] border border-[#E9E4D9] text-[#183D32] flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4 text-[#C8A96B]" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-[11px] font-semibold text-[#183D32] truncate max-w-[280px]">
                              {att.filename}
                            </div>
                            <div className="text-[10px] text-[#888B83] flex items-center gap-1.5">
                              <span className={`px-1.5 py-0.2 rounded font-bold text-[9px] border ${tag.badgeClass}`}>
                                {tag.label}
                              </span>
                              <span>·</span>
                              <span>{formatBytes(att.sizeBytes)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <a
                            href={previewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-[#5C6058] hover:text-[#183D32] transition"
                            title="Preview or Download file"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <button
                            type="button"
                            onClick={() =>
                              setMassAttachments(prev => prev.filter((_, i) => i !== idx))
                            }
                            className="p-1.5 text-[#C65B50] hover:bg-red-50 rounded-lg transition cursor-pointer"
                            title="Remove attachment"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={handlePreviewMassEmail}
                disabled={previewLoading || !massEmailForm.subject.trim() || !massEmailForm.message.trim()}
                className="px-4 py-2 rounded-xl border border-[#C8A96B] bg-[#FAF8F5] text-[#183D32] font-semibold hover:bg-[#F3EFEA] transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                title="Preview rendered email in luxury layout"
              >
                <Eye className="w-3.5 h-3.5 text-[#C8A96B]" />
                <span>{previewLoading ? 'Generating Preview...' : 'Preview Email'}</span>
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMassEmailOpen(false);
                    setMassAttachments([]);
                  }}
                  className="px-4 py-2 rounded-xl border border-[#E9E4D9] hover:bg-[#F8F6F0] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || uploadingAttachment || (massEmailForm.segment === 'selected' && !massEmailSelectedCustomerId)}
                  className="px-5 py-2 rounded-xl bg-[#183D32] text-white font-semibold hover:bg-[#245746] transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5 text-[#C8A96B]" />
                  <span>
                    {actionLoading
                      ? 'Dispatching...'
                      : massEmailForm.segment === 'selected'
                      ? 'Dispatch to Patron'
                      : 'Broadcast to Segment'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </AdminModal>

        {/* 6B. BRANDED LUXURY EMAIL PREVIEW MODAL */}
        <AdminModal
          open={previewModalOpen}
          onClose={() => setPreviewModalOpen(false)}
          title="Branded Luxury Email Preview"
          subtitle={
            previewData?.isBroadcast
              ? `Broadcast Announcement Preview • ${massEmailForm.segment === 'selected' ? 'Delivered to 1 patron' : `Delivered to selected segment`}`
              : `Direct Email Preview • Recipient: ${previewData?.recipientName || ''} <${previewData?.recipientEmail || ''}>`
          }
          maxWidth="max-w-4xl"
        >
          {previewData && (
            <div className="space-y-4 text-xs">
              {/* Header Meta Bar */}
              <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E9E4D9] flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[#888B83] font-semibold w-16">Subject:</span>
                    <span className="font-bold text-[#183D32] text-sm">{previewData.subject}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-[#888B83] font-semibold w-16">Recipient:</span>
                    <span className="font-medium text-[#245746] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {previewData.recipientName} &lt;{previewData.recipientEmail}&gt;
                    </span>
                    {previewData.attachmentsCount > 0 && (
                      <span className="text-[#8F6C2B] bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
                        {previewData.attachmentsCount} Attachment(s)
                      </span>
                    )}
                  </div>
                </div>

                {/* Device Switcher */}
                <div className="flex items-center gap-1 p-1 bg-white rounded-lg border border-[#E9E4D9]">
                  <button
                    type="button"
                    onClick={() => setPreviewDevice('desktop')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer transition ${
                      previewDevice === 'desktop'
                        ? 'bg-[#183D32] text-white'
                        : 'text-[#5C6058] hover:text-[#183D32]'
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    <span>Desktop</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewDevice('mobile')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer transition ${
                      previewDevice === 'mobile'
                        ? 'bg-[#183D32] text-white'
                        : 'text-[#5C6058] hover:text-[#183D32]'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Mobile</span>
                  </button>
                </div>
              </div>

              {/* Email Frame Container */}
              <div className="p-4 bg-[#F2EDE4] rounded-2xl border border-[#D9C48C] flex justify-center overflow-x-auto">
                <iframe
                  title="Rendered Email Preview"
                  srcDoc={previewData.html}
                  className="rounded-xl border border-[#D9C48C] shadow-md bg-white transition-all"
                  style={{
                    width: previewDevice === 'mobile' ? '390px' : '650px',
                    height: '560px',
                  }}
                />
              </div>

              {/* Modal Actions */}
              <div className="flex justify-between items-center pt-2 border-t border-[#E9E4D9]">
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#E9E4D9] hover:bg-[#F8F6F0] cursor-pointer font-semibold text-[#5C6058]"
                >
                  Back to Composer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (previewData.isBroadcast) {
                      void handleSendMassEmail();
                    } else {
                      void handleSendIndividualEmail();
                    }
                  }}
                  disabled={actionLoading}
                  className="px-6 py-2 rounded-xl bg-[#183D32] text-white font-semibold hover:bg-[#245746] transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5 text-[#C8A96B]" />
                  <span>
                    {actionLoading
                      ? 'Dispatching...'
                      : previewData.isBroadcast
                      ? 'Confirm & Broadcast'
                      : 'Confirm & Send Email'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </AdminModal>

        {/* 7. PURGE EXPIRED UNVERIFIED CONFIRMATION MODAL */}
        <AdminModal
          open={purgeConfirmOpen}
          onClose={() => setPurgeConfirmOpen(false)}
          title="Purge Expired Unverified Accounts"
          maxWidth="max-w-md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">48-Hour Unverified Account Purge</strong>
                <span>
                  This action will permanently delete all unverified accounts created more than 48 hours ago ({stats?.unverifiedEligibleForPurge ?? 0} accounts).
                </span>
              </div>
            </div>

            <p className="text-[#5C6058]">
              All database records, addresses, authentication tokens, sessions, and uploaded profile pictures associated with these accounts will be permanently destroyed.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPurgeConfirmOpen(false)}
                className="px-4 py-2 rounded-xl border border-[#E9E4D9] hover:bg-[#F8F6F0] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePurgeUnverified}
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl bg-[#8B261E] text-white font-semibold hover:bg-red-800 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{actionLoading ? 'Purging...' : 'Confirm Purge'}</span>
              </button>
            </div>
          </div>
        </AdminModal>
      </div>
    </AdminLayout>
  );
}
