import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  LifeBuoy,
  Upload,
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
  Send,
  ShieldCheck,
  Clock,
  ExternalLink,
  Mail,
  Search,
  MessageSquarePlus,
  Paperclip,
} from 'lucide-react';
import ScrollReveal from '../components/ScrollReveal';
import { useAuth } from '../context/AuthContext';
import {
  apiRequest,
  apiUpload,
  ApiError,
  formatFileBytes,
  PersistedOrder,
  SUPPORT_UPLOAD_ACCEPT,
  SUPPORT_UPLOAD_LIMITS,
  SupportAttachmentItem,
  SupportTicketItem,
  validateSupportFiles,
} from '../services/api';

const CATEGORIES = [
  'Order Issue',
  'Quality / Packaging',
  'Delivery & Tracking',
  'Payment / Refund',
  'Bulk / Corporate Inquiry',
  'Other',
];

const STATUS_STEPS: Array<{ key: SupportTicketItem['status']; label: string }> = [
  { key: 'open', label: 'Submitted' },
  { key: 'in_review', label: 'In Review' },
  { key: 'responded', label: 'Responded' },
  { key: 'resolved', label: 'Resolved' },
];

function AttachmentChipList({
  items,
  ticketNumber,
  email,
}: {
  items?: SupportAttachmentItem[];
  ticketNumber?: string;
  email?: string;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(att => {
        const href =
          ticketNumber && email
            ? `/api/support/${encodeURIComponent(ticketNumber)}/attachments/${encodeURIComponent(att.id)}/file?email=${encodeURIComponent(email)}&download=1`
            : att.url;
        return (
          <a
            key={att.id}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#150d09] border border-[#38281d] text-[11px] text-[#dfc471] hover:border-[#dfc471]"
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate max-w-[180px]">{att.filename}</span>
            <span className="text-[10px] text-[#d5c4b4]/60">({formatFileBytes(att.sizeBytes)})</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>
        );
      })}
    </div>
  );
}

function TicketProgressBar({ status }: { status: SupportTicketItem['status'] }) {
  if (status === 'closed') {
    return (
      <div className="text-xs px-3 py-1.5 rounded-lg bg-[#251a13] border border-[#38281d] text-[#d5c4b4] inline-block">
        Complaint Closed
      </div>
    );
  }
  const activeIdx = Math.max(0, STATUS_STEPS.findIndex(s => s.key === status));
  return (
    <div className="grid grid-cols-4 gap-2 pt-1">
      {STATUS_STEPS.map((step, i) => {
        const done = i <= activeIdx;
        return (
          <div key={step.key} className="space-y-1">
            <div className={`h-1.5 rounded-full ${done ? 'bg-[#dfc471]' : 'bg-[#2a1d14]'}`} />
            <div className={`text-[10px] font-medium ${done ? 'text-[#dfc471]' : 'text-[#d5c4b4]/45'}`}>
              {step.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function CustomerService() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTicketParam = searchParams.get('ticket') || '';
  const initialEmailParam = searchParams.get('email') || '';
  const [activeTab, setActiveTab] = useState<'submit' | 'track'>(initialTicketParam ? 'track' : 'submit');

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [category, setCategory] = useState('Order Issue');
  const [orderNumber, setOrderNumber] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const [myOrders, setMyOrders] = useState<PersistedOrder[]>([]);
  const [myTickets, setMyTickets] = useState<SupportTicketItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submittedTicket, setSubmittedTicket] = useState<SupportTicketItem | null>(null);

  // Complaint tracking & customer follow-up state
  const [trackTicketInput, setTrackTicketInput] = useState(initialTicketParam);
  const [trackEmailInput, setTrackEmailInput] = useState(initialEmailParam || user?.email || '');
  const [trackedTicket, setTrackedTicket] = useState<SupportTicketItem | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackError, setTrackError] = useState('');

  const [followupTarget, setFollowupTarget] = useState<string | null>(null);
  const [followupMsg, setFollowupMsg] = useState('');
  const [followupFiles, setFollowupFiles] = useState<File[]>([]);
  const [followupErr, setFollowupErr] = useState('');
  const [followupOk, setFollowupOk] = useState('');
  const [sendingFollowup, setSendingFollowup] = useState(false);

  const userLimits = SUPPORT_UPLOAD_LIMITS.user;
  const totalSelectedBytes = selectedFiles.reduce((sum, f) => sum + f.size, 0);

  const fetchMyTickets = async () => {
    try {
      const res = await apiRequest<{ tickets: SupportTicketItem[] }>('/api/support/my-tickets');
      setMyTickets(res.tickets || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (user) {
      setName(prev => prev || user.name);
      setEmail(prev => prev || user.email);
      setPhone(prev => prev || user.phone || '');
      setTrackEmailInput(prev => prev || user.email);
      void fetchMyTickets();
      apiRequest<{ orders: PersistedOrder[] }>('/api/orders')
        .then(r => setMyOrders(r.orders || []))
        .catch(() => {});
    }
  }, [user]);

  const handleTrackLookup = async (tNum: string, tEmail: string) => {
    const cleanNum = tNum.trim();
    const cleanEmail = tEmail.trim();
    if (!cleanNum) {
      setTrackError('Please enter your complaint ticket number (e.g. AS-SUP-2026-12345).');
      return;
    }
    setTrackingLoading(true);
    setTrackError('');
    try {
      const qs = new URLSearchParams({ ticketNumber: cleanNum });
      if (cleanEmail) qs.set('email', cleanEmail);
      const res = await apiRequest<{ ticket: SupportTicketItem }>(`/api/support/track?${qs.toString()}`);
      setTrackedTicket(res.ticket);
      setFollowupTarget(res.ticket.ticketNumber);
    } catch (err) {
      setTrackedTicket(null);
      setTrackError(
        err instanceof ApiError
          ? err.message
          : 'No complaint found matching that ticket number and email.'
      );
    } finally {
      setTrackingLoading(false);
    }
  };

  useEffect(() => {
    if (initialTicketParam) {
      void handleTrackLookup(initialTicketParam, initialEmailParam || user?.email || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTicketParam]);

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const { accepted, error: valErr } = validateSupportFiles(fileList, selectedFiles, userLimits);
    setError(valErr);
    setSelectedFiles(accepted);
  };

  const handleFollowupFilesSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const { accepted, error: valErr } = validateSupportFiles(fileList, followupFiles, userLimits);
    setFollowupErr(valErr);
    setFollowupFiles(accepted);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmittedTicket(null);

    if (name.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (subject.trim().length < 3) {
      setError('Please enter a brief subject for your issue.');
      return;
    }
    if (description.trim().length < 10) {
      setError('Please describe your problem in at least 10 characters.');
      return;
    }

    const fd = new FormData();
    fd.append('name', name.trim());
    fd.append('email', email.trim());
    if (phone.trim()) fd.append('phone', phone.trim());
    fd.append('category', category);
    if (orderNumber.trim()) fd.append('orderNumber', orderNumber.trim());
    fd.append('subject', subject.trim());
    fd.append('description', description.trim());
    for (const file of selectedFiles) {
      fd.append('attachments', file);
    }

    setSubmitting(true);
    try {
      const res = await apiUpload<{ message: string; ticket: SupportTicketItem }>('/api/support', fd);
      setSubmittedTicket(res.ticket);
      setTrackTicketInput(res.ticket.ticketNumber);
      setTrackEmailInput(res.ticket.email);
      setSubject('');
      setDescription('');
      setOrderNumber('');
      setSelectedFiles([]);
      if (user) {
        setMyTickets(prev => [res.ticket, ...prev]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to submit Customer Service request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendFollowup = async (ticket: SupportTicketItem) => {
    setFollowupErr('');
    setFollowupOk('');
    if (followupMsg.trim().length < 2 && followupFiles.length === 0) {
      setFollowupErr('Please enter a follow-up message or attach at least one PDF/file.');
      return;
    }

    const fd = new FormData();
    if (followupMsg.trim()) fd.append('message', followupMsg.trim());
    fd.append('email', ticket.email);
    for (const f of followupFiles) {
      fd.append('attachments', f);
    }

    setSendingFollowup(true);
    try {
      const res = await apiUpload<{ message: string; ticket: SupportTicketItem }>(
        `/api/support/${encodeURIComponent(ticket.ticketNumber)}/reply`,
        fd
      );
      setFollowupOk(res.message);
      setFollowupMsg('');
      setFollowupFiles([]);
      if (trackedTicket?.ticketNumber === res.ticket.ticketNumber) {
        setTrackedTicket(res.ticket);
      }
      if (user) {
        setMyTickets(prev => prev.map(t => (t.id === res.ticket.id ? res.ticket : t)));
      }
    } catch (err) {
      setFollowupErr(err instanceof ApiError ? err.message : 'Unable to send follow-up.');
    } finally {
      setSendingFollowup(false);
    }
  };

  const renderTicketCard = (tkt: SupportTicketItem) => {
    const isReplyingHere = followupTarget === tkt.ticketNumber;
    return (
      <div key={tkt.id} className="p-5 sm:p-6 rounded-2xl bg-[#1c120c] border border-[#38281d] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-xs font-bold text-[#dfc471] px-2.5 py-1 rounded-lg bg-[#150d09] border border-[#38281d]">
              #{tkt.ticketNumber}
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/35 text-emerald-200 capitalize">
              {tkt.status.replace(/_/g, ' ')}
            </span>
            <span className="text-[11px] text-[#d5c4b4]/70">{tkt.category}</span>
            {tkt.orderNumber && (
              <span className="text-[11px] text-[#dfc471]/80">Order #{tkt.orderNumber}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-[#d5c4b4]/60">
            <Clock className="w-3.5 h-3.5" />
            <span>{new Date(tkt.createdAt).toLocaleString('en-IN')}</span>
          </div>
        </div>

        <TicketProgressBar status={tkt.status} />

        <div>
          <div className="font-serif text-lg text-[#f9f6f2]">{tkt.subject}</div>
          <p className="text-xs sm:text-sm text-[#d5c4b4]/85 mt-1 whitespace-pre-line">{tkt.description}</p>
        </div>

        {tkt.attachments?.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wider text-[#d5c4b4]/60">Your Uploaded Files</div>
            <AttachmentChipList items={tkt.attachments} ticketNumber={tkt.ticketNumber} email={tkt.email} />
          </div>
        )}

        {tkt.adminAttachments && tkt.adminAttachments.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wider text-emerald-300/80">
              Concierge Shared PDFs &amp; Documents
            </div>
            <AttachmentChipList items={tkt.adminAttachments} ticketNumber={tkt.ticketNumber} email={tkt.email} />
          </div>
        )}

        {tkt.replies?.length > 0 && (
          <div className="pt-3 border-t border-[#2a1d14] space-y-2.5">
            <div className="text-[11px] uppercase tracking-wider text-[#dfc471]">
              Complaint Conversation Thread ({tkt.replies.length})
            </div>
            {tkt.replies.map(rep => {
              const isAdminReply = rep.senderType === 'admin';
              return (
                <div
                  key={rep.id}
                  className={`p-3.5 rounded-xl border space-y-2 ${
                    isAdminReply
                      ? 'bg-emerald-950/35 border-emerald-500/30'
                      : 'bg-[#150d09] border-[#38281d]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span
                      className={`inline-flex items-center gap-1.5 font-semibold ${
                        isAdminReply ? 'text-emerald-300' : 'text-[#dfc471]'
                      }`}
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>
                        {isAdminReply ? `Concierge (${rep.senderName})` : 'Your Follow-Up'} · {rep.subject}
                      </span>
                    </span>
                    <span className="text-[#d5c4b4]/60">{new Date(rep.createdAt).toLocaleString('en-IN')}</span>
                  </div>
                  <p className="text-xs text-[#ede4dc]/90 whitespace-pre-line">{rep.message}</p>
                  <AttachmentChipList items={rep.attachments} ticketNumber={tkt.ticketNumber} email={tkt.email} />
                </div>
              );
            })}
          </div>
        )}

        {/* Follow-up / Upload More Files Trigger */}
        <div className="pt-2 border-t border-[#2a1d14]">
          {!isReplyingHere ? (
            <button
              type="button"
              onClick={() => {
                setFollowupTarget(tkt.ticketNumber);
                setFollowupErr('');
                setFollowupOk('');
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#dfc471] hover:underline cursor-pointer"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span>Add Follow-Up Note or Upload More Files / PDFs</span>
            </button>
          ) : (
            <div className="mt-2 p-4 rounded-xl bg-[#150d09] border border-[#38281d] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#dfc471]">
                  Follow-Up on #{tkt.ticketNumber} (Up to {userLimits.maxFiles} files · 5 MB/file)
                </span>
                <button
                  type="button"
                  onClick={() => setFollowupTarget(null)}
                  className="text-xs text-[#d5c4b4]/60 hover:text-[#ede4dc] cursor-pointer"
                >
                  Close
                </button>
              </div>

              {followupErr && (
                <div className="p-2.5 rounded-lg bg-red-950/60 border border-red-500/40 text-red-200 text-xs">
                  {followupErr}
                </div>
              )}
              {followupOk && (
                <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs">
                  {followupOk}
                </div>
              )}

              <textarea
                rows={3}
                value={followupMsg}
                onChange={e => setFollowupMsg(e.target.value)}
                placeholder="Write additional information or questions for our Jammu concierge..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#1c120c] border border-[#38281d] text-xs text-[#f9f6f2] focus:outline-none focus:border-[#dfc471]"
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1c120c] border border-[#38281d] hover:border-[#dfc471]/60 text-xs text-[#ede4dc] cursor-pointer">
                  <Paperclip className="w-3.5 h-3.5 text-[#dfc471]" />
                  <span>Attach PDFs / Files ({followupFiles.length}/{userLimits.maxFiles})</span>
                  <input
                    type="file"
                    multiple
                    accept={SUPPORT_UPLOAD_ACCEPT}
                    onChange={e => {
                      handleFollowupFilesSelected(e.target.files);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  disabled={sendingFollowup}
                  onClick={() => void handleSendFollowup(tkt)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] text-xs font-bold cursor-pointer disabled:opacity-60"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{sendingFollowup ? 'Sending...' : 'Send Follow-Up'}</span>
                </button>
              </div>

              {followupFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {followupFiles.map((file, idx) => (
                    <span
                      key={`${file.name}_${idx}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1c120c] border border-[#38281d] text-[11px] text-[#ede4dc]"
                    >
                      <span>{file.name} ({formatFileBytes(file.size)})</span>
                      <button
                        type="button"
                        onClick={() => setFollowupFiles(prev => prev.filter((_, i) => i !== idx))}
                        className="text-red-300 hover:text-red-200 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0d0805] text-[#ede4dc] pt-28 pb-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <ScrollReveal>
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold uppercase tracking-[0.22em]">
              <LifeBuoy className="w-3.5 h-3.5 text-[#dfc471]" />
              <span>Seth And Sons DryFruits • Jammu Concierge Desk</span>
            </div>
            <h1 className="font-serif text-3xl sm:text-5xl font-normal text-[#f9f6f2]">
              Customer Service &amp; Complaint Tracker
            </h1>
            <p className="text-xs sm:text-sm text-[#d5c4b4]/80 max-w-2xl mx-auto leading-relaxed">
              Submit complaints with relevant PDFs, images, documents, or clips, receive instant email alerts, and track real-time concierge responses here.
            </p>
          </div>
        </ScrollReveal>

        {/* Mode Switcher */}
        <div className="flex justify-center">
          <div className="inline-flex p-1.5 rounded-full bg-[#150d09] border border-[#38281d] gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('submit')}
              className={`px-5 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'submit'
                  ? 'bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805]'
                  : 'text-[#d5c4b4] hover:text-[#f9f6f2]'
              }`}
            >
              Submit Complaint
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('track')}
              className={`px-5 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'track'
                  ? 'bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805]'
                  : 'text-[#d5c4b4] hover:text-[#f9f6f2]'
              }`}
            >
              Track Complaints {myTickets.length > 0 ? `(${myTickets.length})` : ''}
            </button>
          </div>
        </div>

        {activeTab === 'submit' && (
          <>
            {submittedTicket && (
              <div className="p-6 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-100 space-y-3 shadow-xl">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h2 className="font-serif text-xl text-[#f9f6f2]">
                        Complaint #{submittedTicket.ticketNumber} Registered
                      </h2>
                      <p className="text-xs sm:text-sm text-emerald-100/85">
                        Confirmation sent to <strong>{submittedTicket.email}</strong> and an immediate alert was sent to our Admin team.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('track');
                      setTrackedTicket(submittedTicket);
                      setFollowupTarget(submittedTicket.ticketNumber);
                      setSearchParams({ ticket: submittedTicket.ticketNumber, email: submittedTicket.email });
                    }}
                    className="px-4 py-2 rounded-full bg-[#dfc471] text-[#0d0805] text-xs font-bold cursor-pointer"
                  >
                    Track Complaint Status →
                  </button>
                </div>
                <AttachmentChipList
                  items={submittedTicket.attachments}
                  ticketNumber={submittedTicket.ticketNumber}
                  email={submittedTicket.email}
                />
              </div>
            )}

            <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-6 sm:p-10 shadow-2xl">
              <div className="mb-6 p-4 rounded-2xl bg-[#1c120c] border border-[#38281d] flex flex-wrap items-center justify-between gap-3 text-xs text-[#d5c4b4]/85">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#dfc471] shrink-0" />
                  <span>
                    Customer upload limits: up to <strong className="text-[#dfc471]">5 files</strong> ·{' '}
                    <strong className="text-[#dfc471]">5 MB max/file</strong> ·{' '}
                    <strong className="text-[#dfc471]">15 MB total</strong> (PDF, PNG/JPG/WEBP/GIF, DOC/XLS/CSV/TXT, ZIP, MP4/WEBM)
                  </span>
                </div>
                <span className="text-[11px] font-mono text-[#dfc471]">
                  {selectedFiles.length}/{userLimits.maxFiles} files · {formatFileBytes(totalSelectedBytes)} / 15 MB
                </span>
              </div>

              {error && (
                <div className="mb-6 p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wider text-[#d5c4b4] mb-1.5">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Your full name"
                      className="w-full px-4 py-3 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2] placeholder-[#d5c4b4]/40 focus:outline-none focus:border-[#dfc471]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wider text-[#d5c4b4] mb-1.5">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-4 py-3 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2] placeholder-[#d5c4b4]/40 focus:outline-none focus:border-[#dfc471]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wider text-[#d5c4b4] mb-1.5">
                      Mobile Number (Optional)
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="10-digit mobile"
                      className="w-full px-4 py-3 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2] placeholder-[#d5c4b4]/40 focus:outline-none focus:border-[#dfc471]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wider text-[#d5c4b4] mb-1.5">
                      Issue Category *
                    </label>
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2] focus:outline-none focus:border-[#dfc471]"
                    >
                      {CATEGORIES.map(c => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wider text-[#d5c4b4] mb-1.5">
                      Related Order Number (Optional)
                    </label>
                    <input
                      type="text"
                      list="my-order-numbers"
                      value={orderNumber}
                      onChange={e => setOrderNumber(e.target.value)}
                      placeholder="e.g. AS-ORD-2026-..."
                      className="w-full px-4 py-3 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2] placeholder-[#d5c4b4]/40 focus:outline-none focus:border-[#dfc471]"
                    />
                    {myOrders.length > 0 && (
                      <datalist id="my-order-numbers">
                        {myOrders.map(o => (
                          <option key={o.id} value={o.orderNumber} />
                        ))}
                      </datalist>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-[#d5c4b4] mb-1.5">
                    Subject *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    maxLength={160}
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Brief summary of your complaint or inquiry"
                    className="w-full px-4 py-3 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2] placeholder-[#d5c4b4]/40 focus:outline-none focus:border-[#dfc471]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-[#d5c4b4] mb-1.5">
                    Describe Your Problem *
                  </label>
                  <textarea
                    rows={5}
                    required
                    minLength={10}
                    maxLength={4000}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Write complete details about your batch, packaging, delivery, invoice, or billing concern..."
                    className="w-full px-4 py-3 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2] placeholder-[#d5c4b4]/40 focus:outline-none focus:border-[#dfc471]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-[#d5c4b4] mb-2">
                    Attach PDFs, Images, Documents or Clips (Up to 5 files · max 5 MB each)
                  </label>
                  <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 border-dashed border-[#38281d] hover:border-[#dfc471]/60 bg-[#1c120c]/70 cursor-pointer transition-colors text-center">
                    <Upload className="w-6 h-6 text-[#dfc471]" />
                    <div className="text-xs sm:text-sm text-[#ede4dc] font-medium">
                      Click to upload PDFs, Images, Office Docs (DOCX/XLSX/CSV/TXT), ZIP or MP4
                    </div>
                    <div className="text-[11px] text-[#d5c4b4]/60">
                      Invoices, product batch photos, unboxing videos, or supporting documents
                    </div>
                    <input
                      type="file"
                      multiple
                      accept={SUPPORT_UPLOAD_ACCEPT}
                      onChange={e => {
                        handleFilesSelected(e.target.files);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </label>

                  {selectedFiles.length > 0 && (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {selectedFiles.map((file, idx) => (
                        <div
                          key={`${file.name}_${file.size}_${idx}`}
                          className="flex items-center gap-3 p-3 rounded-xl bg-[#1c120c] border border-[#38281d]"
                        >
                          <div className="w-10 h-10 rounded-lg bg-[#251a13] border border-[#dfc471]/30 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5 text-[#dfc471]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-[#f9f6f2] truncate">{file.name}</div>
                            <div className="text-[11px] text-[#d5c4b4]/60">{formatFileBytes(file.size)}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))}
                            aria-label={`Remove ${file.name}`}
                            className="p-1.5 rounded-lg hover:bg-red-950/60 text-[#d5c4b4]/70 hover:text-red-300 cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
                  <Link to="/" className="text-xs text-[#d5c4b4]/75 hover:text-[#dfc471]">
                    ← Return to Home Page
                  </Link>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-xs font-bold tracking-wider uppercase bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] hover:brightness-110 shadow-xl transition-all cursor-pointer disabled:opacity-60"
                  >
                    <Send className="w-4 h-4" />
                    <span>{submitting ? 'Uploading & Submitting...' : 'Submit Complaint'}</span>
                  </button>
                </div>
              </form>
            </div>
          </>
        )}

        {activeTab === 'track' && (
          <div className="space-y-8">
            {/* Lookup any complaint by Ticket Number + Email */}
            <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
              <div>
                <h2 className="font-serif text-2xl text-[#f9f6f2]">Track a Complaint by Reference Number</h2>
                <p className="text-xs text-[#d5c4b4]/70 mt-1">
                  Enter your complaint ticket ID (e.g. AS-SUP-2026-12345) and email address to view live progress, attached PDFs, and admin replies.
                </p>
              </div>

              <form
                onSubmit={e => {
                  e.preventDefault();
                  void handleTrackLookup(trackTicketInput, trackEmailInput);
                }}
                className="grid grid-cols-1 md:grid-cols-12 gap-3"
              >
                <div className="md:col-span-5">
                  <input
                    type="text"
                    required
                    value={trackTicketInput}
                    onChange={e => setTrackTicketInput(e.target.value)}
                    placeholder="Ticket Number (e.g. AS-SUP-2026-12345)"
                    className="w-full px-4 py-3 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2] focus:outline-none focus:border-[#dfc471]"
                  />
                </div>
                <div className="md:col-span-5">
                  <input
                    type="email"
                    required={!user}
                    value={trackEmailInput}
                    onChange={e => setTrackEmailInput(e.target.value)}
                    placeholder="Registered Email Address"
                    className="w-full px-4 py-3 rounded-xl bg-[#1c120c] border border-[#38281d] text-sm text-[#f9f6f2] focus:outline-none focus:border-[#dfc471]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={trackingLoading}
                  className="md:col-span-2 inline-flex items-center justify-center gap-1.5 px-5 py-3 rounded-xl bg-gradient-to-r from-[#b99225] via-[#dfc471] to-[#b99225] text-[#0d0805] text-xs font-bold cursor-pointer disabled:opacity-60"
                >
                  <Search className="w-4 h-4" />
                  <span>{trackingLoading ? 'Checking...' : 'Track'}</span>
                </button>
              </form>

              {trackError && (
                <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{trackError}</span>
                </div>
              )}

              {trackedTicket && <div className="pt-2">{renderTicketCard(trackedTicket)}</div>}
            </div>

            {user && (
              <div className="bg-[#150d09] border border-[#38281d] rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-serif text-2xl text-[#f9f6f2]">All My Submitted Complaints</h2>
                    <p className="text-xs text-[#d5c4b4]/70 mt-0.5">
                      Complete history, status milestones, and shared documents on your account.
                    </p>
                  </div>
                  <span className="text-xs px-3 py-1 rounded-full bg-[#1c120c] border border-[#38281d] text-[#dfc471]">
                    {myTickets.length} complaint(s)
                  </span>
                </div>

                {myTickets.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#d5c4b4]/60">
                    You have not submitted any Customer Service complaints yet.
                  </div>
                ) : (
                  <div className="space-y-4">{myTickets.map(tkt => renderTicketCard(tkt))}</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
