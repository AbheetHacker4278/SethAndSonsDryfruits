import { type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, X } from 'lucide-react';

export const ADMIN_THEME = {
  primary: '#183D32',
  secondary: '#245746',
  accent: '#C8A96B',
  bg: '#F8F6F0',
  card: '#FFFFFF',
  text: '#252923',
  muted: '#888B83',
  border: '#E9E4D9',
  danger: '#C65B50',
};

export function AdminCard({
  children,
  className = '',
  padding = 'p-6',
}: {
  children: ReactNode;
  className?: string;
  padding?: string;
}) {
  return (
    <div
      className={`bg-white border border-[#E9E4D9] rounded-2xl shadow-[0_2px_14px_rgba(24,61,50,0.04)] ${padding} ${className}`}
    >
      {children}
    </div>
  );
}

export function StatusBadge({
  status,
  tone,
}: {
  status: string;
  tone?: 'emerald' | 'gold' | 'red' | 'blue' | 'neutral';
}) {
  const s = status.toLowerCase();
  const resolvedTone =
    tone ||
    (s === 'delivered' || s === 'paid' || s === 'published' || s === 'active' || s === 'received' || s === 'sent'
      ? 'emerald'
      : s === 'cancelled' || s === 'failed' || s === 'bounced' || s === 'returned' || s === 'out_of_stock'
      ? 'red'
      : s === 'dispatched' || s === 'shipped' || s === 'out_for_delivery' || s === 'processing'
      ? 'blue'
      : s === 'placed' || s === 'pending' || s === 'confirmed' || s === 'partial' || s === 'low_stock' || s === 'draft'
      ? 'gold'
      : 'neutral');

  const classes: Record<string, string> = {
    emerald: 'bg-[#E7F3EE] text-[#183D32] border-[#B7DEC9]',
    gold: 'bg-[#FAF3E3] text-[#8F6C2B] border-[#E8D5A7]',
    red: 'bg-[#FCECEB] text-[#C65B50] border-[#F2C3BE]',
    blue: 'bg-[#EAF2FA] text-[#1E568A] border-[#C3DCF2]',
    neutral: 'bg-[#F3F1EC] text-[#5C6058] border-[#E2DDD2]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border capitalize ${classes[resolvedTone]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      <span>{status.replace(/_/g, ' ')}</span>
    </span>
  );
}

export function ToastBanner({
  toast,
  onDismiss,
}: {
  toast: { type: 'ok' | 'err'; text: string; link?: { label: string; href: string } } | null;
  onDismiss?: () => void;
}) {
  if (!toast) return null;
  return (
    <div
      className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm ${
        toast.type === 'ok'
          ? 'bg-[#E7F3EE] border-[#B7DEC9] text-[#183D32]'
          : 'bg-[#FCECEB] border-[#F2C3BE] text-[#9E3D33]'
      }`}
    >
      <div className="flex items-center gap-2.5">
        {toast.type === 'ok' ? (
          <CheckCircle2 className="w-4 h-4 shrink-0 text-[#245746]" />
        ) : (
          <AlertCircle className="w-4 h-4 shrink-0 text-[#C65B50]" />
        )}
        <span className="font-medium">{toast.text}</span>
      </div>
      <div className="flex items-center gap-3">
        {toast.link && (
          <a
            href={toast.link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-semibold"
          >
            {toast.link.label}
          </a>
        )}
        {onDismiss && (
          <button onClick={onDismiss} className="opacity-70 hover:opacity-100 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function AdminModal({
  open,
  title,
  subtitle,
  onClose,
  maxWidth = 'max-w-2xl',
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  maxWidth?: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-[#183D32]/45 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidth} bg-white border border-[#E9E4D9] rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 bg-[#F8F6F0] border-b border-[#E9E4D9] flex items-center justify-between gap-4">
          <div>
            <h3 className="font-admin-serif text-xl font-semibold text-[#183D32]">{title}</h3>
            {subtitle && <p className="text-xs text-[#888B83] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#888B83] hover:text-[#183D32] hover:bg-[#E9E4D9]/50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-[#183D32]/45 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-[#E9E4D9] rounded-2xl p-6 shadow-2xl space-y-4">
        <h3 className="font-admin-serif text-xl font-semibold text-[#183D32]">{title}</h3>
        <p className="text-sm text-[#5C6058] leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-[#F8F6F0] text-[#252923] border border-[#E9E4D9] hover:bg-[#E9E4D9]/50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2 rounded-xl text-xs font-semibold text-white cursor-pointer ${
              danger ? 'bg-[#C65B50] hover:bg-[#b14c42]' : 'bg-[#183D32] hover:bg-[#245746]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: any;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="py-12 px-6 text-center space-y-3">
      <div className="w-12 h-12 rounded-2xl bg-[#F8F6F0] border border-[#E9E4D9] flex items-center justify-center mx-auto text-[#245746]">
        <Icon className="w-6 h-6" />
      </div>
      <h4 className="font-admin-serif text-lg font-semibold text-[#183D32]">{title}</h4>
      <p className="text-xs text-[#888B83] max-w-sm mx-auto">{description}</p>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 rounded-xl bg-[#EFECE4]" />
      ))}
    </div>
  );
}

export function PaginationBar({
  page,
  totalPages,
  totalItems,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-4 border-t border-[#E9E4D9] text-xs text-[#888B83]">
      <span>
        Page {page} of {totalPages} ({totalItems} records)
      </span>
      <div className="flex items-center gap-1.5">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="p-1.5 rounded-lg border border-[#E9E4D9] disabled:opacity-40 hover:bg-[#F8F6F0] cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="p-1.5 rounded-lg border border-[#E9E4D9] disabled:opacity-40 hover:bg-[#F8F6F0] cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

