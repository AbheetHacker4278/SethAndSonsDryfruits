import { useEffect, useState } from 'react';
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  Eye,
  Send,
  RotateCcw,
  Upload,
  RefreshCw,
  ShieldAlert,
  ExternalLink,
  Save,
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AdminCard, StatusBadge } from '../../components/admin/AdminUI';
import {
  apiRequest,
  ApiError,
  apiUpload,
  EmailLogItem,
  EmailTemplateItem,
} from '../../services/api';

const ALL_VARIABLE_CHIPS = [
  '{{customer_name}}',
  '{{customer_email}}',
  '{{new_email}}',
  '{{verification_url}}',
  '{{reset_url}}',
  '{{admin_name}}',
  '{{admin_email}}',
  '{{otp_code}}',
  '{{expires_minutes}}',
  '{{assigned_role}}',
  '{{permissions_list}}',
  '{{admin_portal_url}}',
  '{{ticket_number}}',
  '{{ticket_category}}',
  '{{ticket_subject}}',
  '{{attachment_count}}',
  '{{order_id}}',
  '{{order_date}}',
  '{{product_name}}',
  '{{order_total}}',
  '{{delivery_address}}',
  '{{courier_partner}}',
  '{{tracking_number}}',
  '{{tracking_url}}',
  '{{estimated_delivery}}',
  '{{refund_amount}}',
  '{{brand_name}}',
  '{{support_email}}',
];

export default function AdminCommunications() {
  const [subTab, setSubTab] = useState<'templates' | 'logs' | 'suppressions'>('templates');
  const [stats, setStats] = useState<any>(null);
  const [templates, setTemplates] = useState<EmailTemplateItem[]>([]);
  const [selectedTpl, setSelectedTpl] = useState<EmailTemplateItem | null>(null);
  const [subject, setSubject] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [textContent, setTextContent] = useState('');
  const [enabled, setEnabled] = useState(true);

  const [previewData, setPreviewData] = useState<{ subject: string; html: string; text: string } | null>(null);
  const [previewMode, setPreviewMode] = useState<'html' | 'text'>('html');
  const [testRecipient, setTestRecipient] = useState('');
  const [logs, setLogs] = useState<EmailLogItem[]>([]);
  const [logStatusFilter, setLogStatusFilter] = useState('all');
  const [suppressions, setSuppressions] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string; previewUrl?: string | null } | null>(null);

  const loadAll = async () => {
    try {
      const [st, tplRes, logRes, supRes] = await Promise.all([
        apiRequest<any>('/api/admin/communications/stats'),
        apiRequest<{ templates: EmailTemplateItem[] }>('/api/admin/communications/templates'),
        apiRequest<{ logs: EmailLogItem[] }>(`/api/admin/communications/logs?status=${encodeURIComponent(logStatusFilter)}`),
        apiRequest<{ suppressions: any[] }>('/api/admin/communications/suppressions'),
      ]);
      setStats(st);
      setTemplates(tplRes.templates);
      setLogs(logRes.logs);
      setSuppressions(supRes.suppressions);

      if (!selectedTpl && tplRes.templates.length > 0) {
        selectTemplate(tplRes.templates[0]);
      }
    } catch {
      // handled
    }
  };

  useEffect(() => {
    void loadAll();
  }, [logStatusFilter]);

  const selectTemplate = (tpl: EmailTemplateItem) => {
    setSelectedTpl(tpl);
    setSubject(tpl.subject);
    setHtmlContent(tpl.htmlContent);
    setTextContent(tpl.textContent);
    setEnabled(tpl.enabled);
    setPreviewData(null);
  };

  const handleSaveTemplate = async () => {
    if (!selectedTpl) return;
    setFeedback(null);
    try {
      const res = await apiRequest<{ message: string; template: EmailTemplateItem }>(
        `/api/admin/communications/templates/${encodeURIComponent(selectedTpl.templateKey)}`,
        {
          method: 'PUT',
          body: { subject, htmlContent, textContent, enabled },
        }
      );
      setFeedback({ type: 'ok', text: res.message });
      setTemplates(prev => prev.map(t => (t.templateKey === res.template.templateKey ? res.template : t)));
      setSelectedTpl(res.template);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof ApiError ? err.message : 'Save failed.' });
    }
  };

  const handlePreview = async () => {
    if (!selectedTpl) return;
    const res = await apiRequest<{ subject: string; html: string; text: string }>(
      `/api/admin/communications/templates/${encodeURIComponent(selectedTpl.templateKey)}/preview`,
      {
        method: 'POST',
        body: { subject, htmlContent, textContent },
      }
    );
    setPreviewData(res);
  };

  const handleSendTest = async () => {
    if (!selectedTpl) return;
    setFeedback(null);
    try {
      const res = await apiRequest<{ message: string; log?: EmailLogItem }>(
        `/api/admin/communications/templates/${encodeURIComponent(selectedTpl.templateKey)}/test`,
        {
          method: 'POST',
          body: { recipient: testRecipient.trim() || undefined },
        }
      );
      setFeedback({
        type: 'ok',
        text: `${res.message} Status: ${res.log?.status?.toUpperCase() || 'QUEUED'}`,
        previewUrl: res.log?.previewUrl || null,
      });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof ApiError ? err.message : 'Test send failed.' });
    }
  };

  const handleRestoreDefault = async () => {
    if (!selectedTpl) return;
    setFeedback(null);
    try {
      const res = await apiRequest<{ message: string; template: EmailTemplateItem }>(
        `/api/admin/communications/templates/${encodeURIComponent(selectedTpl.templateKey)}/restore`,
        { method: 'POST' }
      );
      selectTemplate(res.template);
      setTemplates(prev => prev.map(t => (t.templateKey === res.template.templateKey ? res.template : t)));
      setFeedback({ type: 'ok', text: res.message });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof ApiError ? err.message : 'Restore failed.' });
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeedback(null);
    const fd = new FormData();
    fd.append('logo', file);
    try {
      const res = await apiUpload<{ message: string; brandLogoUrl: string }>(
        '/api/admin/communications/logo',
        fd
      );
      setFeedback({ type: 'ok', text: res.message });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof ApiError ? err.message : 'Logo upload failed.' });
    }
  };

  const handleToggleTracking = async (next: boolean) => {
    try {
      await apiRequest('/api/admin/communications/settings', {
        method: 'PUT',
        body: { trackingEnabled: next },
      });
      await loadAll();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to update tracking setting.',
      });
    }
  };

  const handleRetryJob = async (jobId: string) => {
    try {
      await apiRequest(`/api/admin/communications/jobs/${encodeURIComponent(jobId)}/retry`, {
        method: 'POST',
      });
      setFeedback({ type: 'ok', text: 'Email job retried.' });
      await loadAll();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Failed to retry email job.',
      });
    }
  };

  const handleRemoveSuppression = async (email: string) => {
    try {
      await apiRequest(`/api/admin/communications/suppressions/${encodeURIComponent(email)}`, {
        method: 'DELETE',
      });
      await loadAll();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Unable to remove suppressed address.',
      });
    }
  };

  return (
    <AdminLayout
      title="Email Automation & Template Studio"
      subtitle="Manage all 14 transactional and marketing templates, brand logo, SMTP/provider health, delivery logs, and suppressions."
    >
      <div className="space-y-6">
        {/* Metrics Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <AdminCard padding="p-4">
              <div className="text-[11px] font-medium text-[#888B83]">Total Sent</div>
              <div className="text-2xl font-bold text-[#183D32] mt-1 tabular-nums">{stats.metrics.totalSent}</div>
            </AdminCard>
            <AdminCard padding="p-4">
              <div className="text-[11px] font-medium text-[#888B83]">Delivered</div>
              <div className="text-2xl font-bold text-[#245746] mt-1 tabular-nums">{stats.metrics.delivered}</div>
            </AdminCard>
            <AdminCard padding="p-4">
              <div className="text-[11px] font-medium text-[#888B83]">Failed / Bounced</div>
              <div className="text-2xl font-bold text-[#C65B50] mt-1 tabular-nums">{stats.metrics.failed}</div>
            </AdminCard>
            <AdminCard padding="p-4">
              <div className="text-[11px] font-medium text-[#888B83]">Pending Queue</div>
              <div className="text-2xl font-bold text-[#8F6C2B] mt-1 tabular-nums">{stats.metrics.pending}</div>
            </AdminCard>
            <AdminCard padding="p-4">
              <div className="text-[11px] font-medium text-[#888B83]">Open Rate</div>
              <div className="text-lg font-bold text-[#252923] mt-1 tabular-nums">
                {stats.metrics.trackingEnabled && stats.metrics.openRate !== null
                  ? `${stats.metrics.openRate}%`
                  : 'Off'}
              </div>
            </AdminCard>
            <AdminCard padding="p-4">
              <div className="text-[11px] font-medium text-[#888B83]">Click Rate</div>
              <div className="text-lg font-bold text-[#252923] mt-1 tabular-nums">
                {stats.metrics.trackingEnabled && stats.metrics.clickRate !== null
                  ? `${stats.metrics.clickRate}%`
                  : 'Off'}
              </div>
            </AdminCard>
          </div>
        )}

        {/* Provider & Logo Bar */}
        {stats && (
          <AdminCard padding="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <span className="px-3 py-1 rounded-full bg-[#E7F3EE] border border-[#B7DEC9] text-[#183D32] font-semibold">
                  Provider: {stats.provider.mode} {stats.provider.hostHint ? `(${stats.provider.hostHint})` : ''}
                </span>
                <span className="text-[#5C6058]">
                  From: <strong className="text-[#183D32]">{stats.provider.fromEmail}</strong>
                </span>
                <span className="text-[#5C6058]">
                  Queue: <strong className="text-[#8F6C2B]">{stats.queue.backend}</strong>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-[#252923]">
                  <input
                    type="checkbox"
                    checked={Boolean(stats.metrics.trackingEnabled)}
                    onChange={e => handleToggleTracking(e.target.checked)}
                    className="accent-[#183D32]"
                  />
                  <span>Provider Open/Click Tracking</span>
                </label>

                <label className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#FAF3E3] hover:bg-[#f4e8cd] border border-[#E8D5A7] text-[#8F6C2B] font-medium cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Email Logo</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoUpload} />
                </label>
              </div>
            </div>
          </AdminCard>
        )}

        {feedback && (
          <div
            className={`p-4 rounded-xl text-xs sm:text-sm flex flex-wrap items-center justify-between gap-2 border ${
              feedback.type === 'ok'
                ? 'bg-[#E7F3EE] border-[#B7DEC9] text-[#183D32]'
                : 'bg-[#FCECEB] border-[#F2C3BE] text-[#9E3D33]'
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              {feedback.type === 'ok' ? <CheckCircle2 className="w-4 h-4 text-[#245746]" /> : <AlertCircle className="w-4 h-4 text-[#C65B50]" />}
              <span>{feedback.text}</span>
            </div>
            {feedback.previewUrl && (
              <a
                href={feedback.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline font-semibold text-[#183D32]"
              >
                <span>Open Sandbox Email Preview</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}

        {/* Sub-Tabs */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'templates', label: `Email Templates (${templates.length})` },
            { id: 'logs', label: `Delivery Logs (${logs.length})` },
            { id: 'suppressions', label: `Suppression List (${suppressions.length})` },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer border transition-colors ${
                subTab === t.id
                  ? 'bg-[#183D32] text-white border-[#183D32]'
                  : 'bg-white text-[#5C6058] border-[#E9E4D9] hover:text-[#183D32]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* TEMPLATES EDITOR */}
        {subTab === 'templates' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <AdminCard padding="p-4" className="lg:col-span-4 space-y-1.5 max-h-[680px] overflow-y-auto">
              {templates.map(tpl => (
                <button
                  key={tpl.templateKey}
                  onClick={() => selectTemplate(tpl)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                    selectedTpl?.templateKey === tpl.templateKey
                      ? 'bg-[#F8F6F0] border-[#C8A96B]'
                      : 'bg-transparent border-transparent hover:bg-[#F8F6F0]/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs text-[#183D32]">{tpl.templateName}</span>
                    <StatusBadge status={tpl.enabled ? 'active' : 'disabled'} tone={tpl.enabled ? 'emerald' : 'red'} />
                  </div>
                  <div className="text-[11px] text-[#888B83] uppercase mt-0.5">{tpl.category}</div>
                </button>
              ))}
            </AdminCard>

            {selectedTpl && (
              <AdminCard className="lg:col-span-8 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E9E4D9] pb-3">
                  <div>
                    <h2 className="font-admin-serif text-2xl font-semibold text-[#183D32]">{selectedTpl.templateName}</h2>
                    <span className="text-xs text-[#888B83]">Key: {selectedTpl.templateKey}</span>
                  </div>

                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={e => setEnabled(e.target.checked)}
                      className="accent-[#183D32] w-4 h-4"
                    />
                    <span className="font-semibold text-[#183D32]">Automation Enabled</span>
                  </label>
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase text-[#888B83] mb-1">Email Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-sm text-[#252923] focus:outline-none focus:border-[#183D32]"
                  />
                </div>

                <div>
                  <div className="text-[11px] font-medium uppercase text-[#8F6C2B] mb-1.5">
                    Reusable Variables (Click to insert into HTML body)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_VARIABLE_CHIPS.map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setHtmlContent(prev => `${prev} ${v}`)}
                        className="px-2 py-1 rounded-lg bg-[#FAF3E3] hover:bg-[#f2e5c7] border border-[#E8D5A7] text-[11px] font-mono text-[#8F6C2B] cursor-pointer"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase text-[#888B83] mb-1">
                    HTML Body Content (Sanitized — executable scripts stripped automatically)
                  </label>
                  <textarea
                    rows={8}
                    value={htmlContent}
                    onChange={e => setHtmlContent(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs font-mono text-[#252923] focus:outline-none focus:border-[#183D32]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase text-[#888B83] mb-1">Plain-Text Fallback</label>
                  <textarea
                    rows={4}
                    value={textContent}
                    onChange={e => setTextContent(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs font-mono text-[#252923] focus:outline-none focus:border-[#183D32]"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#E9E4D9]">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleSaveTemplate}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#183D32] hover:bg-[#245746] text-white cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5 text-[#C8A96B]" />
                      <span>Save Template</span>
                    </button>
                    <button
                      onClick={handlePreview}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#FAF3E3] text-[#8F6C2B] border border-[#E8D5A7] hover:bg-[#f2e5c7] cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Preview</span>
                    </button>
                    <button
                      onClick={handleRestoreDefault}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs bg-[#F8F6F0] text-[#5C6058] border border-[#E9E4D9] hover:bg-[#EFECE4] cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore Default</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      value={testRecipient}
                      onChange={e => setTestRecipient(e.target.value)}
                      placeholder="Test recipient email..."
                      className="px-3 py-2 rounded-xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs text-[#252923]"
                    />
                    <button
                      onClick={handleSendTest}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-[#F8F6F0] text-[#183D32] border border-[#183D32] cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send Test</span>
                    </button>
                  </div>
                </div>

                {/* Live Sandboxed Preview */}
                {previewData && (
                  <div className="mt-4 pt-4 border-t border-[#E9E4D9] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-[#252923]">
                        <strong className="text-[#183D32]">Subject Preview:</strong> {previewData.subject}
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setPreviewMode('html')}
                          className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                            previewMode === 'html' ? 'bg-[#183D32] text-white' : 'bg-[#F8F6F0] text-[#5C6058]'
                          }`}
                        >
                          HTML View
                        </button>
                        <button
                          onClick={() => setPreviewMode('text')}
                          className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                            previewMode === 'text' ? 'bg-[#183D32] text-white' : 'bg-[#F8F6F0] text-[#5C6058]'
                          }`}
                        >
                          Plain Text
                        </button>
                      </div>
                    </div>

                    {previewMode === 'html' ? (
                      <iframe
                        title="Email Template Preview"
                        sandbox=""
                        srcDoc={previewData.html}
                        className="w-full h-[540px] rounded-2xl border border-[#E9E4D9] bg-white"
                      />
                    ) : (
                      <pre className="p-4 rounded-2xl bg-[#F8F6F0] border border-[#E9E4D9] text-xs whitespace-pre-wrap text-[#252923]">
                        {previewData.text}
                      </pre>
                    )}
                  </div>
                )}
              </AdminCard>
            )}
          </div>
        )}

        {/* DELIVERY LOGS */}
        {subTab === 'logs' && (
          <AdminCard className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-admin-serif text-2xl font-semibold text-[#183D32]">Email Delivery Logs</h2>
              <div className="flex flex-wrap gap-1.5">
                {['all', 'queued', 'sent', 'delivered', 'failed', 'bounced', 'suppressed'].map(st => (
                  <button
                    key={st}
                    onClick={() => setLogStatusFilter(st)}
                    className={`px-3 py-1 rounded-lg text-xs capitalize cursor-pointer border ${
                      logStatusFilter === st
                        ? 'bg-[#183D32] text-white border-[#183D32] font-semibold'
                        : 'bg-[#F8F6F0] text-[#5C6058] border-[#E9E4D9]'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E9E4D9] text-[#888B83]">
                    <th className="py-2.5 pr-3 font-medium">Recipient</th>
                    <th className="py-2.5 pr-3 font-medium">Type</th>
                    <th className="py-2.5 pr-3 font-medium">Subject</th>
                    <th className="py-2.5 pr-3 font-medium">Status</th>
                    <th className="py-2.5 pr-3 font-medium">Provider / ID</th>
                    <th className="py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E4D9]">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-[#F8F6F0]/60">
                      <td className="py-3 pr-3 font-medium text-[#183D32]">{log.recipient}</td>
                      <td className="py-3 pr-3 text-[#5C6058]">{log.emailType}</td>
                      <td className="py-3 pr-3 max-w-xs truncate text-[#252923]">{log.subject}</td>
                      <td className="py-3 pr-3">
                        <StatusBadge status={log.status} />
                        {log.errorMessage && (
                          <div className="text-[10px] text-[#C65B50] mt-0.5 max-w-xs truncate">{log.errorMessage}</div>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-[11px] text-[#888B83]">
                        {log.provider}
                        {log.providerMessageId && <div className="truncate max-w-[140px]">{log.providerMessageId}</div>}
                      </td>
                      <td className="py-3 flex items-center gap-2">
                        {log.previewUrl && (
                          <a
                            href={log.previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#245746] hover:underline inline-flex items-center gap-1 font-medium"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>View</span>
                          </a>
                        )}
                        {log.jobId && (log.status === 'failed' || log.status === 'queued') && (
                          <button
                            onClick={() => handleRetryJob(log.jobId!)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FAF3E3] text-[#8F6C2B] border border-[#E8D5A7] cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Retry</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AdminCard>
        )}

        {/* SUPPRESSION LIST */}
        {subTab === 'suppressions' && (
          <AdminCard className="space-y-4">
            <div className="flex items-center gap-2 text-[#183D32]">
              <ShieldAlert className="w-5 h-5 text-[#C65B50]" />
              <h2 className="font-admin-serif text-2xl font-semibold">Bounced &amp; Complained Address Suppression</h2>
            </div>
            {suppressions.length === 0 ? (
              <p className="text-xs text-[#888B83]">No suppressed email addresses.</p>
            ) : (
              <div className="divide-y divide-[#E9E4D9] text-xs">
                {suppressions.map(s => (
                  <div key={s.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-[#183D32]">{s.email}</div>
                      <div className="text-[#888B83]">
                        Reason: {s.reason} ({s.bounceCount} event(s)) • {s.details}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveSuppression(s.email)}
                      className="px-3 py-1 rounded-lg bg-[#FCECEB] text-[#C65B50] border border-[#F2C3BE] font-medium cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </AdminCard>
        )}
      </div>
    </AdminLayout>
  );
}

