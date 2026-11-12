import { useEffect, useState } from 'react';
import {
  LifeBuoy,
  Search,
  Mail,
  Send,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  CheckCircle2,
  Clock,
  Paperclip,
  Save,
  Eye,
  X,
  Upload,
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AdminPdfCanvas } from '../../components/admin/AdminPdfViewerModal';
import { AdminCard, AdminModal, StatusBadge, ToastBanner } from '../../components/admin/AdminUI';
import {
  apiRequest,
  apiUpload,
  ApiError,
  formatFileBytes,
  SUPPORT_UPLOAD_ACCEPT,
  SUPPORT_UPLOAD_LIMITS,
  SupportAttachmentItem,
  SupportTicketItem,
  validateSupportFiles,
} from '../../services/api';

const PRIORITY_BADGE_MAP: Record<string, 'neutral' | 'gold' | 'red'> = {
  normal: 'neutral',
  high: 'gold',
  urgent: 'red',
};

const QUICK_MAIL_SNIPPETS = [
  {
    label: 'Acknowledging & Investigating',
    subjectPrefix: 'Update on Your Complaint',
    body: `Namaste,\n\nThank you for reaching out to Seth And Sons DryFruits. We have reviewed the files and details you shared and are verifying this batch directly with our Jammu packing team.\n\nWe will update you with the exact resolution shortly.`,
  },
  {
    label: 'Replacement / Dispatch Approved',
    subjectPrefix: 'Replacement Approved',
    body: `Namaste,\n\nAfter inspecting the evidence you uploaded, we have approved a complimentary fresh replacement harvest box from our Jammu cellar.\n\nPlease find any supporting documents attached below. Our dispatch team will share tracking details shortly.`,
  },
  {
    label: 'Request Additional Document',
    subjectPrefix: 'Additional Detail Requested',
    body: `Namaste,\n\nThank you for contacting our concierge desk. To finalize this review, please upload a clear batch photo or invoice PDF via your Complaint Tracker link below.`,
  },
];

function getAdminTicketAttachmentUrl(ticketId: string, attId: string, download = false): string {
  return `/api/admin/support/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(attId)}/file${download ? '?download=1' : ''}`;
}

function AttachmentGrid({
  ticketId,
  items,
  emptyLabel,
  onInspect,
}: {
  ticketId: string;
  items?: SupportAttachmentItem[];
  emptyLabel: string;
  onInspect: (att: SupportAttachmentItem) => void;
}) {
  if (!items || items.length === 0) {
    return (
      <div className="p-3 rounded-xl bg-[#F8F6F0]/60 border border-[#E9E4D9] text-xs text-[#888B83]">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {items.map(att => {
        const isImage = att.mimeType.startsWith('image/');
        const inlineUrl = getAdminTicketAttachmentUrl(ticketId, att.id, false);
        const downloadUrl = getAdminTicketAttachmentUrl(ticketId, att.id, true);
        return (
          <div key={att.id} className="p-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] flex items-center gap-3">
            {isImage ? (
              <img
                src={inlineUrl}
                alt={att.filename}
                className="w-12 h-12 rounded-lg object-cover border border-[#E9E4D9] shrink-0 cursor-pointer"
                onClick={() => onInspect(att)}
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-[#FAF3E3] border border-[#E8D5A7] flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6 text-[#8F6C2B]" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-[#183D32] truncate">{att.filename}</div>
              <div className="text-[11px] text-[#888B83]">
                {att.mimeType.split('/').pop()?.toUpperCase()} · {formatFileBytes(att.sizeBytes)}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <button
                  type="button"
                  onClick={() => onInspect(att)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#183D32] hover:underline cursor-pointer"
                >
                  <Eye className="w-3 h-3" />
                  <span>Inspect</span>
                </button>
                <a
                  href={downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#8F6C2B] hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Open / Download</span>
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminSupport() {
  const [tickets, setTickets] = useState<SupportTicketItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ all: 0, open: 0, in_review: 0, responded: 0, resolved: 0 });
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketItem | null>(null);
  const [emailLogs, setEmailLogs] = useState<any[]>([]);

  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const [editStatus, setEditStatus] = useState<SupportTicketItem['status']>('open');
  const [editPriority, setEditPriority] = useState<SupportTicketItem['priority']>('normal');
  const [adminNotes, setAdminNotes] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  const [standaloneFiles, setStandaloneFiles] = useState<File[]>([]);
  const [uploadingStandalone, setUploadingStandalone] = useState(false);

  const [mailSubject, setMailSubject] = useState('');
  const [mailMessage, setMailMessage] = useState('');
  const [mailFiles, setMailFiles] = useState<File[]>([]);
  const [nextStatusOnSend, setNextStatusOnSend] = useState<SupportTicketItem['status']>('responded');
  const [sendingMail, setSendingMail] = useState(false);

  const [previewAtt, setPreviewAtt] = useState<SupportAttachmentItem | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const adminLimits = SUPPORT_UPLOAD_LIMITS.admin;

  const loadTickets = async (preserveId?: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (priorityFilter !== 'all') qs.set('priority', priorityFilter);
      if (searchQuery.trim()) qs.set('q', searchQuery.trim());

      const res = await apiRequest<{ tickets: SupportTicketItem[]; counts: Record<string, number> }>(
        `/api/admin/support?${qs.toString()}`
      );
      setTickets(res.tickets || []);
      setCounts(res.counts || {});

      const targetId = preserveId || selectedTicket?.id;
      if (targetId) {
        const refreshed = (res.tickets || []).find(t => t.id === targetId);
        if (refreshed) {
          await openTicketDetail(refreshed);
        } else if (res.tickets?.length > 0 && !preserveId) {
          await openTicketDetail(res.tickets[0]);
        } else if (!refreshed) {
          setSelectedTicket(null);
        }
      } else if (res.tickets?.length > 0) {
        await openTicketDetail(res.tickets[0]);
      }
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Unable to load support requests.' });
    } finally {
      setLoading(false);
    }
  };

  const openTicketDetail = async (ticket: SupportTicketItem) => {
    try {
      const detail = await apiRequest<{ ticket: SupportTicketItem; emailLogs: any[] }>(
        `/api/admin/support/${ticket.id}`
      );
      const t = detail.ticket;
      setSelectedTicket(t);
      setEmailLogs(detail.emailLogs || []);
      setEditStatus(t.status);
      setEditPriority(t.priority);
      setAdminNotes(t.adminNotes || '');
      setMailSubject(`Re: [#${t.ticketNumber}] ${t.subject}`);
      setNextStatusOnSend(t.status === 'resolved' || t.status === 'closed' ? t.status : 'responded');
    } catch {
      setSelectedTicket(ticket);
    }
  };

  useEffect(() => {
    void loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, priorityFilter]);

  const handleSaveReview = async () => {
    if (!selectedTicket) return;
    setSavingReview(true);
    setToast(null);
    try {
      const res = await apiRequest<{ message: string; ticket: SupportTicketItem }>(
        `/api/admin/support/${selectedTicket.id}`,
        {
          method: 'PATCH',
          body: {
            status: editStatus,
            priority: editPriority,
            adminNotes,
          },
        }
      );
      setToast({ type: 'ok', text: 'Ticket review details and status saved.' });
      await loadTickets(res.ticket.id);
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Failed to update ticket.' });
    } finally {
      setSavingReview(false);
    }
  };

  const handleStandaloneAdminUpload = async () => {
    if (!selectedTicket || standaloneFiles.length === 0) return;
    const fd = new FormData();
    for (const f of standaloneFiles) {
      fd.append('attachments', f);
    }
    setUploadingStandalone(true);
    setToast(null);
    try {
      const res = await apiUpload<{ message: string; ticket: SupportTicketItem }>(
        `/api/admin/support/${selectedTicket.id}/attachments`,
        fd
      );
      setToast({ type: 'ok', text: res.message });
      setStandaloneFiles([]);
      await loadTickets(res.ticket.id);
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Unable to upload admin files.' });
    } finally {
      setUploadingStandalone(false);
    }
  };

  const handleSendCustomMail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;
    if (mailSubject.trim().length < 3 || mailMessage.trim().length < 5) {
      setToast({ type: 'err', text: 'Please enter a valid custom email subject and message body.' });
      return;
    }

    setSendingMail(true);
    setToast(null);
    try {
      let res: { message: string; ticket: SupportTicketItem };
      if (mailFiles.length > 0) {
        const fd = new FormData();
        fd.append('subject', mailSubject.trim());
        fd.append('message', mailMessage.trim());
        fd.append('nextStatus', nextStatusOnSend);
        for (const f of mailFiles) {
          fd.append('attachments', f);
        }
        res = await apiUpload<{ message: string; ticket: SupportTicketItem }>(
          `/api/admin/support/${selectedTicket.id}/reply`,
          fd
        );
      } else {
        res = await apiRequest<{ message: string; ticket: SupportTicketItem }>(
          `/api/admin/support/${selectedTicket.id}/reply`,
          {
            method: 'POST',
            body: {
              subject: mailSubject.trim(),
              message: mailMessage.trim(),
              nextStatus: nextStatusOnSend,
            },
          }
        );
      }
      setToast({ type: 'ok', text: res.message });
      setMailMessage('');
      setMailFiles([]);
      await loadTickets(res.ticket.id);
    } catch (err) {
      setToast({ type: 'err', text: err instanceof ApiError ? err.message : 'Unable to send custom email.' });
    } finally {
      setSendingMail(false);
    }
  };

  return (
    <AdminLayout
      title="Customer Service Desk"
      subtitle="Review complaints, inspect & attach high-limit files/PDFs, and send custom emails directly to concerned customers."
    >
      <div className="space-y-6">
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />

        {/* Summary KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total Tickets', key: 'all', value: counts.all || 0 },
            { label: 'Open', key: 'open', value: counts.open || 0 },
            { label: 'In Review', key: 'in_review', value: counts.in_review || 0 },
            { label: 'Responded', key: 'responded', value: counts.responded || 0 },
            { label: 'Resolved', key: 'resolved', value: counts.resolved || 0 },
          ].map(card => (
            <button
              key={card.key}
              type="button"
              onClick={() => setStatusFilter(card.key)}
              className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === card.key
                  ? 'bg-[#183D32] text-white border-[#183D32] shadow-md'
                  : 'bg-white border-[#E9E4D9] text-[#252923] hover:border-[#C8A96B]'
              }`}
            >
              <div className={`text-[11px] uppercase tracking-wider ${statusFilter === card.key ? 'text-[#C8A96B]' : 'text-[#888B83]'}`}>
                {card.label}
              </div>
              <div className="font-admin-serif text-2xl font-semibold mt-1">{card.value}</div>
            </button>
          ))}
        </div>

        {/* Filter Bar */}
        <AdminCard padding="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-[#888B83] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void loadTickets();
                }}
                placeholder="Search by Ticket #, customer name, email, order #, subject..."
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923] focus:outline-none focus:border-[#183D32]"
              />
            </div>

            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
            </select>

            <button
              type="button"
              onClick={() => void loadTickets()}
              className="px-4 py-2 rounded-xl bg-[#183D32] hover:bg-[#245746] text-white text-xs font-semibold cursor-pointer"
            >
              Search
            </button>
          </div>
        </AdminCard>

        {/* Master-Detail Review Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Queue */}
          <AdminCard className="lg:col-span-4 space-y-2 max-h-[880px] overflow-y-auto" padding="p-3">
            <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#888B83]">
              Complaints Queue ({tickets.length})
            </div>
            {loading && tickets.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#888B83]">Loading tickets...</div>
            ) : tickets.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <LifeBuoy className="w-7 h-7 text-[#C8A96B] mx-auto opacity-70" />
                <div className="text-xs text-[#888B83]">No customer service complaints match your filters.</div>
              </div>
            ) : (
              tickets.map(t => {
                const active = selectedTicket?.id === t.id;
                const attTotal = (t.attachments?.length || 0) + (t.adminAttachments?.length || 0);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => void openTicketDetail(t)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer space-y-1.5 ${
                      active
                        ? 'bg-[#E7F3EE]/80 border-[#183D32] shadow-sm'
                        : 'bg-[#F8F6F0]/60 border-[#E9E4D9] hover:border-[#C8A96B]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold text-[#183D32]">#{t.ticketNumber}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="font-medium text-xs text-[#252923] line-clamp-1">{t.subject}</div>
                    <div className="text-[11px] text-[#5C6058] truncate">
                      {t.name} · {t.email}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-[#888B83] pt-0.5">
                      <span>{t.category}</span>
                      <span className="inline-flex items-center gap-1">
                        <Paperclip className="w-3 h-3" />
                        {attTotal}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </AdminCard>

          {/* Right Detail Review + Custom Email Composer */}
          <div className="lg:col-span-8 space-y-6">
            {!selectedTicket ? (
              <AdminCard className="py-16 text-center space-y-2">
                <LifeBuoy className="w-10 h-10 text-[#C8A96B] mx-auto opacity-80" />
                <h3 className="font-admin-serif text-lg text-[#183D32]">Select a Customer Service Complaint</h3>
                <p className="text-xs text-[#888B83]">
                  Click any ticket on the left to inspect uploaded files, attach high-limit admin PDFs/documents, and write a custom email.
                </p>
              </AdminCard>
            ) : (
              <>
                <AdminCard className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[#E9E4D9]">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#183D32] px-2.5 py-1 rounded-lg bg-[#E7F3EE]">
                          #{selectedTicket.ticketNumber}
                        </span>
                        <StatusBadge status={selectedTicket.status} />
                        <StatusBadge
                          status={`${selectedTicket.priority} priority`}
                          tone={PRIORITY_BADGE_MAP[selectedTicket.priority] || 'neutral'}
                        />
                      </div>
                      <h2 className="font-admin-serif text-xl text-[#183D32] pt-1">{selectedTicket.subject}</h2>
                      <div className="text-xs text-[#5C6058] flex flex-wrap gap-x-4 gap-y-1">
                        <span>
                          <strong>Customer:</strong> {selectedTicket.name} ({selectedTicket.email})
                        </span>
                        {selectedTicket.phone && (
                          <span>
                            <strong>Phone:</strong> {selectedTicket.phone}
                          </span>
                        )}
                        {selectedTicket.orderNumber && (
                          <span>
                            <strong>Order #:</strong> {selectedTicket.orderNumber}
                          </span>
                        )}
                        <span>
                          <strong>Category:</strong> {selectedTicket.category}
                        </span>
                      </div>
                    </div>
                    <div className="text-[11px] text-[#888B83] flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{new Date(selectedTicket.createdAt).toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[#888B83] mb-1.5">
                      Customer Problem Description
                    </div>
                    <div className="p-4 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-sm text-[#252923] whitespace-pre-line leading-relaxed">
                      {selectedTicket.description}
                    </div>
                  </div>

                  {/* Customer Attachments */}
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[#888B83] mb-2">
                      Customer Uploaded Files ({selectedTicket.attachments?.length || 0})
                    </div>
                    <AttachmentGrid
                      ticketId={selectedTicket.id}
                      items={selectedTicket.attachments}
                      emptyLabel="No files were uploaded with the initial complaint."
                      onInspect={setPreviewAtt}
                    />
                  </div>

                  {/* Admin Reference Files & High-Limit Uploader */}
                  <div className="pt-2 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#183D32]">
                        Admin Uploaded PDFs &amp; Resolution Files ({selectedTicket.adminAttachments?.length || 0})
                      </div>
                      <span className="text-[11px] text-[#8F6C2B] font-medium">
                        Admin Limit: Up to 15 files · 25 MB/file · 100 MB total
                      </span>
                    </div>
                    <AttachmentGrid
                      ticketId={selectedTicket.id}
                      items={selectedTicket.adminAttachments}
                      emptyLabel="No admin documents attached to this complaint yet."
                      onInspect={setPreviewAtt}
                    />

                    <div className="p-3.5 rounded-xl bg-[#F8F6F0] border border-dashed border-[#C8A96B] flex flex-wrap items-center justify-between gap-3">
                      <label className="inline-flex items-center gap-2 text-xs font-medium text-[#183D32] cursor-pointer">
                        <Upload className="w-4 h-4 text-[#8F6C2B]" />
                        <span>
                          Attach Admin PDFs, Lab Reports, Invoices, ZIP, Video or Images ({standaloneFiles.length}/{adminLimits.maxFiles})
                        </span>
                        <input
                          type="file"
                          multiple
                          accept={SUPPORT_UPLOAD_ACCEPT}
                          onChange={e => {
                            if (e.target.files) {
                              const { accepted, error: valErr } = validateSupportFiles(
                                e.target.files,
                                standaloneFiles,
                                adminLimits
                              );
                              if (valErr) setToast({ type: 'err', text: valErr });
                              setStandaloneFiles(accepted);
                            }
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>

                      {standaloneFiles.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[#5C6058]">
                            {standaloneFiles.length} selected ({formatFileBytes(standaloneFiles.reduce((s, f) => s + f.size, 0))})
                          </span>
                          <button
                            type="button"
                            disabled={uploadingStandalone}
                            onClick={handleStandaloneAdminUpload}
                            className="px-3.5 py-1.5 rounded-lg bg-[#183D32] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                          >
                            {uploadingStandalone ? 'Uploading...' : 'Upload to Ticket'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setStandaloneFiles([])}
                            className="text-xs text-[#C65B50] hover:underline cursor-pointer"
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Admin Triage / Notes */}
                  <div className="pt-4 border-t border-[#E9E4D9] grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block text-[11px] font-medium uppercase text-[#888B83] mb-1">
                        Review Status
                      </label>
                      <select
                        value={editStatus}
                        onChange={e => setEditStatus(e.target.value as SupportTicketItem['status'])}
                        className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
                      >
                        <option value="open">Open</option>
                        <option value="in_review">In Review</option>
                        <option value="responded">Responded</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium uppercase text-[#888B83] mb-1">
                        Priority
                      </label>
                      <select
                        value={editPriority}
                        onChange={e => setEditPriority(e.target.value as SupportTicketItem['priority'])}
                        className="w-full px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
                      >
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      disabled={savingReview}
                      onClick={handleSaveReview}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#FAF3E3] hover:bg-[#f2e5c7] text-[#8F6C2B] border border-[#E8D5A7] text-xs font-semibold cursor-pointer disabled:opacity-60"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{savingReview ? 'Saving...' : 'Save Review & Notes'}</span>
                    </button>

                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-medium uppercase text-[#888B83] mb-1">
                        Internal Admin Review Notes (Private)
                      </label>
                      <textarea
                        rows={2}
                        value={adminNotes}
                        onChange={e => setAdminNotes(e.target.value)}
                        placeholder="Record internal verification findings, batch checks, or courier follow-up notes..."
                        className="w-full px-3.5 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923] focus:outline-none focus:border-[#183D32]"
                      />
                    </div>
                  </div>
                </AdminCard>

                {/* Custom Email Composer with Admin High-Limit Attachments */}
                <AdminCard className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E9E4D9]">
                    <div>
                      <h3 className="font-admin-serif text-lg text-[#183D32] flex items-center gap-2">
                        <Mail className="w-4 h-4 text-[#C8A96B]" />
                        <span>Write Custom Mail to Concerned User</span>
                      </h3>
                      <p className="text-xs text-[#888B83]">
                        Dispatches via Brevo/SMTP directly to{' '}
                        <strong className="text-[#183D32]">{selectedTicket.email}</strong> (with download links for any attached PDFs/files).
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-medium text-[#888B83]">Quick starters:</span>
                    {QUICK_MAIL_SNIPPETS.map(s => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => {
                          setMailSubject(`${s.subjectPrefix} – [#${selectedTicket.ticketNumber}]`);
                          setMailMessage(s.body.replace('Namaste,', `Namaste ${selectedTicket.name},`));
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#FAF3E3] hover:bg-[#f2e5c7] border border-[#E8D5A7] text-[11px] font-medium text-[#8F6C2B] cursor-pointer"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={handleSendCustomMail} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-[11px] font-medium uppercase text-[#888B83] mb-1">
                          Email Subject *
                        </label>
                        <input
                          type="text"
                          required
                          value={mailSubject}
                          onChange={e => setMailSubject(e.target.value)}
                          placeholder="Enter custom subject for this customer..."
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-sm text-[#252923] focus:outline-none focus:border-[#183D32]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium uppercase text-[#888B83] mb-1">
                          Update Ticket Status
                        </label>
                        <select
                          value={nextStatusOnSend}
                          onChange={e => setNextStatusOnSend(e.target.value as SupportTicketItem['status'])}
                          className="w-full px-3 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-sm text-[#252923]"
                        >
                          <option value="responded">Mark as Responded</option>
                          <option value="in_review">Keep In Review</option>
                          <option value="resolved">Mark as Resolved</option>
                          <option value="closed">Mark as Closed</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium uppercase text-[#888B83] mb-1">
                        Custom Mail Body to {selectedTicket.name} *
                      </label>
                      <textarea
                        rows={6}
                        required
                        minLength={5}
                        maxLength={8000}
                        value={mailMessage}
                        onChange={e => setMailMessage(e.target.value)}
                        placeholder={`Write your personalized email response to ${selectedTicket.name}...`}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-sm text-[#252923] focus:outline-none focus:border-[#183D32]"
                      />
                    </div>

                    {/* Admin Attachments inside Custom Mail (Higher Limit) */}
                    <div className="p-3 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#183D32] cursor-pointer">
                          <Paperclip className="w-3.5 h-3.5 text-[#8F6C2B]" />
                          <span>
                            Attach PDFs / Reports / Files to Custom Email ({mailFiles.length}/{adminLimits.maxFiles} · 25 MB max/file)
                          </span>
                          <input
                            type="file"
                            multiple
                            accept={SUPPORT_UPLOAD_ACCEPT}
                            onChange={e => {
                              if (e.target.files) {
                                const { accepted, error: valErr } = validateSupportFiles(
                                  e.target.files,
                                  mailFiles,
                                  adminLimits
                                );
                                if (valErr) setToast({ type: 'err', text: valErr });
                                setMailFiles(accepted);
                              }
                              e.target.value = '';
                            }}
                            className="hidden"
                          />
                        </label>
                        <span className="text-[11px] text-[#888B83]">
                          {formatFileBytes(mailFiles.reduce((s, f) => s + f.size, 0))} / 100 MB
                        </span>
                      </div>

                      {mailFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {mailFiles.map((f, idx) => (
                            <span
                              key={`${f.name}_${idx}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-[#E9E4D9] text-[11px] text-[#252923]"
                            >
                              <span>{f.name} ({formatFileBytes(f.size)})</span>
                              <button
                                type="button"
                                onClick={() => setMailFiles(prev => prev.filter((_, i) => i !== idx))}
                                className="text-[#C65B50] cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-[#888B83]">
                        Recipient: <strong>{selectedTicket.email}</strong>
                      </span>
                      <button
                        type="submit"
                        disabled={sendingMail}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#183D32] hover:bg-[#245746] text-white text-xs font-semibold shadow-sm cursor-pointer disabled:opacity-60"
                      >
                        <Send className="w-3.5 h-3.5 text-[#C8A96B]" />
                        <span>{sendingMail ? 'Uploading & Sending Email...' : 'Send Custom Email'}</span>
                      </button>
                    </div>
                  </form>
                </AdminCard>

                {/* Conversation & Reply History */}
                <AdminCard className="space-y-4">
                  <h3 className="font-admin-serif text-lg text-[#183D32]">
                    Conversation &amp; Reply History ({selectedTicket.replies?.length || 0})
                  </h3>

                  {!selectedTicket.replies || selectedTicket.replies.length === 0 ? (
                    <div className="text-xs text-[#888B83]">
                      No custom admin emails or follow-up replies recorded yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedTicket.replies.map(rep => (
                        <div
                          key={rep.id}
                          className={`p-4 rounded-xl border space-y-2 ${
                            rep.senderType === 'admin'
                              ? 'bg-[#E7F3EE]/50 border-[#B7DEC9]'
                              : 'bg-[#F8F6F0] border-[#E9E4D9]'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-semibold text-[#183D32]">
                              [{rep.senderType === 'admin' ? 'Admin Email' : 'Customer Follow-Up'}] {rep.subject}
                            </div>
                            <div className="flex items-center gap-2">
                              {rep.emailStatus && <StatusBadge status={rep.emailStatus} />}
                              <span className="text-[11px] text-[#888B83]">
                                {new Date(rep.createdAt).toLocaleString('en-IN')}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-[#252923] whitespace-pre-line">{rep.message}</p>
                          {rep.attachments && rep.attachments.length > 0 && (
                            <AttachmentGrid
                              ticketId={selectedTicket.id}
                              items={rep.attachments}
                              emptyLabel=""
                              onInspect={setPreviewAtt}
                            />
                          )}
                          <div className="text-[11px] text-[#888B83] flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#245746]" />
                            <span>{rep.senderName} ({rep.senderEmail})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {emailLogs.length > 0 && (
                    <div className="pt-3 border-t border-[#E9E4D9]">
                      <div className="text-[11px] font-semibold uppercase text-[#888B83] mb-2">
                        Email Dispatch Logs
                      </div>
                      <div className="space-y-1.5">
                        {emailLogs.map(log => (
                          <div key={log.id} className="flex items-center justify-between text-[11px] text-[#5C6058]">
                            <span className="truncate">
                              {log.emailType} · {log.subject} → {log.recipient}
                            </span>
                            <StatusBadge status={log.status} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </AdminCard>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Multi-Format Inspection Modal (Images, EmbedPDF Viewer, Video, Documents) */}
      <AdminModal
        open={Boolean(previewAtt)}
        title={previewAtt?.filename || 'Attachment Preview'}
        subtitle={previewAtt ? `${previewAtt.mimeType} · ${formatFileBytes(previewAtt.sizeBytes)}` : ''}
        onClose={() => setPreviewAtt(null)}
        maxWidth={previewAtt?.mimeType === 'application/pdf' ? 'max-w-5xl' : 'max-w-3xl'}
      >
        {previewAtt && selectedTicket && (() => {
          const inlinePreviewUrl = getAdminTicketAttachmentUrl(selectedTicket.id, previewAtt.id, false);
          const downloadFileUrl = getAdminTicketAttachmentUrl(selectedTicket.id, previewAtt.id, true);
          return (
            <div className="space-y-4">
              {previewAtt.mimeType === 'application/pdf' ? (
                <AdminPdfCanvas
                  src={inlinePreviewUrl}
                  className="h-[620px] w-full rounded-xl overflow-hidden border border-[#E9E4D9] bg-[#F8F6F0]"
                />
              ) : previewAtt.mimeType.startsWith('image/') ? (
                <div className="rounded-xl overflow-hidden border border-[#E9E4D9] bg-[#F8F6F0] flex items-center justify-center max-h-[540px]">
                  <img src={inlinePreviewUrl} alt={previewAtt.filename} className="max-h-[520px] w-auto object-contain" />
                </div>
              ) : previewAtt.mimeType.startsWith('video/') ? (
                <video src={inlinePreviewUrl} controls className="w-full max-h-[520px] rounded-xl bg-black" />
              ) : (
                <div className="p-10 rounded-xl border border-[#E9E4D9] bg-[#F8F6F0] text-center space-y-2">
                  <FileText className="w-10 h-10 text-[#8F6C2B] mx-auto" />
                  <div className="text-sm font-semibold text-[#183D32]">{previewAtt.filename}</div>
                  <div className="text-xs text-[#5C6058]">
                    Document / Archive ({previewAtt.mimeType} · {formatFileBytes(previewAtt.sizeBytes)}). Click Open / Download to inspect locally.
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-1.5 text-xs text-[#888B83]">
                  {previewAtt.mimeType.startsWith('image/') ? (
                    <ImageIcon className="w-4 h-4 text-[#183D32]" />
                  ) : (
                    <FileText className="w-4 h-4 text-[#8F6C2B]" />
                  )}
                  <span>Verified &amp; streamed via Admin Portal proxy</span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={downloadFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#183D32] text-white text-xs font-semibold hover:bg-[#245746]"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open / Download</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setPreviewAtt(null)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-[#E9E4D9] text-xs text-[#5C6058] hover:bg-[#F8F6F0] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Close</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </AdminModal>
    </AdminLayout>
  );
}
