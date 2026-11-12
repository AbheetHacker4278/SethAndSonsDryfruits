import { PDFViewer } from '@embedpdf/viewer-react';
import { ExternalLink, FileText, X } from 'lucide-react';
import { AdminModal } from './AdminUI';

export function adminPdfFetch(url: string, init?: RequestInit): Promise<Response> {
  const isSameOriginApi =
    url.startsWith('/api/') ||
    (typeof window !== 'undefined' && url.startsWith(`${window.location.origin}/api/`));

  if (!isSameOriginApi) {
    return fetch(url, init);
  }

  const headers = new Headers(init?.headers || undefined);
  headers.set('X-Portal-Scope', 'admin');
  return fetch(url, {
    ...init,
    credentials: 'include',
    headers,
  });
}

export function toAdminMediaUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  if (rawUrl.startsWith('https://res.cloudinary.com/')) {
    return `/api/admin/media/proxy?url=${encodeURIComponent(rawUrl)}`;
  }
  return rawUrl;
}

export function isLikelyPdfUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    if (url.startsWith('/api/admin/media/proxy')) {
      const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
      const inner = u.searchParams.get('url') || '';
      return isLikelyPdfUrl(inner);
    }
  } catch {
    // ignore URL parse error
  }
  const clean = url.split('?')[0].toLowerCase();
  return clean.endsWith('.pdf') || clean.includes('/raw/upload/') || clean.endsWith('/invoice.pdf');
}

function appendDownloadParam(url: string): string {
  return url.includes('download=1') ? url : `${url}${url.includes('?') ? '&' : '?'}download=1`;
}

export function AdminPdfCanvas({
  src,
  className = 'h-[620px] w-full rounded-xl overflow-hidden border border-[#E9E4D9] bg-[#F8F6F0]',
}: {
  src: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <PDFViewer
        key={src}
        src={src}
        theme="light"
        fetch={adminPdfFetch}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}

export function AdminPdfViewerModal({
  open,
  title,
  subtitle,
  src,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  src: string | null;
  onClose: () => void;
}) {
  return (
    <AdminModal
      open={open && Boolean(src)}
      title={title}
      subtitle={subtitle || 'Interactive PDF Viewer (@embedpdf/viewer-react)'}
      onClose={onClose}
      maxWidth="max-w-5xl"
    >
      {src && (
        <div className="space-y-4">
          {isLikelyPdfUrl(src) || src.includes('format=pdf') ? (
            <AdminPdfCanvas src={src} />
          ) : (
            <div className="rounded-xl overflow-hidden border border-[#E9E4D9] bg-[#F8F6F0] flex items-center justify-center max-h-[600px]">
              <img src={src} alt={title} className="max-h-[580px] w-auto object-contain" />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="inline-flex items-center gap-1.5 text-xs text-[#888B83]">
              <FileText className="w-4 h-4 text-[#8F6C2B]" />
              <span>Rendered via EmbedPDF inside Admin Portal</span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={appendDownloadParam(src)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#183D32] text-white text-xs font-semibold hover:bg-[#245746]"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open / Download</span>
              </a>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-[#E9E4D9] text-xs text-[#5C6058] hover:bg-[#F8F6F0] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Close</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminModal>
  );
}
