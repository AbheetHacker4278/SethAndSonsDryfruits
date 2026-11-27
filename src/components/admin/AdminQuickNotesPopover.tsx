import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Loader2,
  NotebookPen,
  Pencil,
  Pin,
  Plus,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import { apiRequest, ApiError } from '../../services/api';

export type QuickNoteStatus = 'note' | 'pending' | 'done';

export interface AdminQuickNote {
  id: string;
  adminId: string;
  title: string;
  description: string;
  pinned: boolean;
  status: QuickNoteStatus;
  createdAt: string;
  updatedAt: string;
}

interface AdminQuickNotesPopoverProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

const MAX_COMPACT_NOTES = 3;

function formatNoteTimestamp(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const datePart = date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const timePart = date
    .toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .toUpperCase();
  return `${datePart} • ${timePart}`;
}

function wasUpdatedAfterCreation(createdAt?: string, updatedAt?: string): boolean {
  if (!createdAt || !updatedAt) return false;
  const createdMs = new Date(createdAt).getTime();
  const updatedMs = new Date(updatedAt).getTime();
  if (Number.isNaN(createdMs) || Number.isNaN(updatedMs)) return createdAt !== updatedAt;
  return updatedMs - createdMs >= 1000;
}

/** Floating Quick Notes trigger button and popover panel for the Admin top navigation bar. */
export default function AdminQuickNotesPopover({
  isOpen,
  onToggle,
  onClose,
}: AdminQuickNotesPopoverProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const [notes, setNotes] = useState<AdminQuickNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyNoteId, setBusyNoteId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);

  const [showAllNotes, setShowAllNotes] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pinned, setPinned] = useState(false);
  const [status, setStatus] = useState<QuickNoteStatus>('note');

  const loadNotes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiRequest<{ notes: AdminQuickNote[] }>('/api/admin/quick-notes');
      setNotes(Array.isArray(res.notes) ? res.notes : []);
      setErrorMsg(null);
    } catch (err) {
      if (!silent) {
        setErrorMsg(err instanceof ApiError ? err.message : 'Unable to load quick notes.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotes(true);
  }, [loadNotes]);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      void loadNotes(notes.length > 0);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      return () => cancelAnimationFrame(raf);
    }
    setIsVisible(false);
    const timer = setTimeout(() => {
      setShouldRender(false);
      setConfirmDeleteId(null);
    }, 200);
    return () => clearTimeout(timer);
  }, [isOpen, loadNotes]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (formOpen && isOpen) {
      const timer = setTimeout(() => titleInputRef.current?.focus(), 40);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [formOpen, isOpen]);

  const resetForm = () => {
    setFormOpen(false);
    setEditingNoteId(null);
    setTitle('');
    setDescription('');
    setPinned(false);
    setStatus('note');
    setErrorMsg(null);
  };

  const openCreateForm = () => {
    setConfirmDeleteId(null);
    setEditingNoteId(null);
    setTitle('');
    setDescription('');
    setPinned(false);
    setStatus('note');
    setErrorMsg(null);
    setFormOpen(true);
  };

  const openEditForm = (note: AdminQuickNote) => {
    setConfirmDeleteId(null);
    setEditingNoteId(note.id);
    setTitle(note.title);
    setDescription(note.description || '');
    setPinned(Boolean(note.pinned));
    setStatus(note.status || 'note');
    setErrorMsg(null);
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedDesc = description.trim();
    if (!trimmedTitle) {
      setErrorMsg('Please enter a note title.');
      titleInputRef.current?.focus();
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      if (editingNoteId) {
        const res = await apiRequest<{ note: AdminQuickNote }>(`/api/admin/quick-notes/${editingNoteId}`, {
          method: 'PUT',
          body: {
            title: trimmedTitle,
            description: trimmedDesc,
            pinned,
            status,
          },
        });
        setNotes(prev => {
          const next = prev.map(n => (n.id === editingNoteId ? res.note : n));
          return sortNotesClient(next);
        });
      } else {
        const res = await apiRequest<{ note: AdminQuickNote }>('/api/admin/quick-notes', {
          method: 'POST',
          body: {
            title: trimmedTitle,
            description: trimmedDesc,
            pinned,
            status,
          },
        });
        setNotes(prev => sortNotesClient([res.note, ...prev]));
      }
      resetForm();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Could not save quick note.');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePin = async (note: AdminQuickNote) => {
    setBusyNoteId(note.id);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ note: AdminQuickNote }>(`/api/admin/quick-notes/${note.id}`, {
        method: 'PUT',
        body: { pinned: !note.pinned },
      });
      setNotes(prev => sortNotesClient(prev.map(n => (n.id === note.id ? res.note : n))));
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Unable to update pin state.');
    } finally {
      setBusyNoteId(null);
    }
  };

  const handleDelete = async (noteId: string) => {
    setBusyNoteId(noteId);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/admin/quick-notes/${noteId}`, { method: 'DELETE' });
      setNotes(prev => prev.filter(n => n.id !== noteId));
      setConfirmDeleteId(null);
      if (editingNoteId === noteId) {
        resetForm();
      }
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Unable to delete quick note.');
    } finally {
      setBusyNoteId(null);
    }
  };

  const visibleNotes = showAllNotes ? notes : notes.slice(0, MAX_COMPACT_NOTES);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Quick Notes${notes.length > 0 ? `, ${notes.length} saved` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title="Quick Notes"
        className={`relative p-2 rounded-xl border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32] ${
          isOpen
            ? 'bg-[#FAF3E3] border-[#C8A96B] text-[#183D32]'
            : 'bg-white border-[#E9E4D9] text-[#183D32] hover:bg-[#FAF3E3]'
        }`}
      >
        <NotebookPen className="w-4 h-4" />
        {notes.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-1 rounded-full bg-[#183D32] text-[#DFC471] text-[10px] font-bold flex items-center justify-center border border-[#F8F6F0]">
            {notes.length > 9 ? '9+' : notes.length}
          </span>
        )}
      </button>

      {shouldRender && (
        <div
          role="dialog"
          aria-label="Quick Notes"
          className={`fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-[68px] sm:top-full sm:mt-2.5 sm:w-[390px] bg-[#FAF8F2] border border-[#DFD7C8] rounded-2xl shadow-[0_20px_50px_rgba(24,61,50,0.22)] z-50 overflow-hidden origin-top-right transition-all duration-200 ease-out ${
            isVisible
              ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 scale-95 -translate-y-1.5 pointer-events-none'
          }`}
        >
          {/* Dark Emerald Header */}
          <div className="bg-[#183D32] px-4 py-3 flex items-center justify-between text-white">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-[#245746]/80 border border-[#C8A96B]/40 flex items-center justify-center">
                <NotebookPen className="w-4 h-4 text-[#DFC471]" />
              </span>
              <span className="font-admin-serif font-semibold text-base tracking-wide text-[#F8F6F0]">
                Quick Notes
              </span>
              {notes.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[#245746] text-[#DFC471] text-[10px] font-semibold">
                  {notes.length}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Quick Notes"
              className="p-1.5 rounded-lg text-[#F8F6F0]/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DFC471]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Subheader Toolbar */}
          <div className="px-4 py-3 flex items-center justify-between border-b border-[#E9E4D9]/80 bg-[#F8F6F0]/80">
            <span className="font-admin-serif font-semibold text-base text-[#183D32]">
              My Notes
            </span>
            <button
              type="button"
              onClick={formOpen ? resetForm : openCreateForm}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#F3E4BC] hover:bg-[#EAD49A] text-[#183D32] border border-[#D4BA76] transition-colors cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
            >
              {formOpen ? (
                <>
                  <X className="w-3.5 h-3.5 text-[#183D32]" />
                  <span>Close Editor</span>
                </>
              ) : (
                <>
                  <span className="w-4 h-4 rounded-full bg-[#183D32] text-[#F3E4BC] inline-flex items-center justify-center">
                    <Plus className="w-2.5 h-2.5" />
                  </span>
                  <span>Add New Note</span>
                </>
              )}
            </button>
          </div>

          {/* Inline Error Banner */}
          {errorMsg && (
            <div
              role="alert"
              className="mx-3.5 mt-3 px-3 py-2 rounded-xl bg-[#FCECEB] border border-[#F2C3BE] text-[11px] font-medium text-[#9E3D33] flex items-center justify-between gap-2"
            >
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                aria-label="Dismiss error"
                className="text-[#9E3D33] hover:opacity-75 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Create / Edit Note Form */}
          {formOpen && (
            <form
              onSubmit={handleSubmit}
              className="mx-3.5 mt-3 p-3 rounded-xl bg-white border border-[#C8A96B]/60 shadow-sm space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#183D32]">
                  {editingNoteId ? 'Edit Note' : 'New Quick Note'}
                </span>
                <button
                  type="button"
                  onClick={() => setPinned(p => !p)}
                  aria-pressed={pinned}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
                    pinned
                      ? 'bg-[#EAF3EC] border-[#183D32]/30 text-[#183D32]'
                      : 'bg-[#F8F6F0] border-[#E2DDD2] text-[#5C6058] hover:text-[#183D32]'
                  }`}
                >
                  <Pin className="w-3 h-3" />
                  <span>{pinned ? 'Pinned' : 'Pin'}</span>
                </button>
              </div>

              <div>
                <label htmlFor="quick-note-title" className="sr-only">
                  Note title
                </label>
                <input
                  id="quick-note-title"
                  ref={titleInputRef}
                  type="text"
                  maxLength={120}
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Note title (e.g. Purchase reminder)"
                  className="w-full px-3 py-1.5 rounded-lg bg-[#FAF8F2] border border-[#DDD5C5] text-xs font-medium text-[#252923] placeholder-[#888B83] focus:outline-none focus:border-[#183D32]"
                />
              </div>

              <div>
                <label htmlFor="quick-note-desc" className="sr-only">
                  Note description
                </label>
                <textarea
                  id="quick-note-desc"
                  rows={3}
                  maxLength={2000}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Write description, checklists, or supplier follow-ups..."
                  className="w-full px-3 py-1.5 rounded-lg bg-[#FAF8F2] border border-[#DDD5C5] text-xs text-[#252923] placeholder-[#888B83] focus:outline-none focus:border-[#183D32] resize-y"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <div className="inline-flex items-center gap-1" role="group" aria-label="Note status">
                  {(['note', 'pending', 'done'] as QuickNoteStatus[]).map(st => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatus(st)}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-medium capitalize transition-colors cursor-pointer border ${
                        status === st
                          ? 'bg-[#183D32] text-white border-[#183D32]'
                          : 'bg-[#F8F6F0] text-[#5C6058] border-[#E2DDD2] hover:border-[#C8A96B]'
                      }`}
                    >
                      {st === 'done' ? 'Done' : st === 'pending' ? 'Pending' : 'General'}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={resetForm}
                    disabled={saving}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#5C6058] hover:bg-[#F3EFE6] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-semibold bg-[#183D32] hover:bg-[#245746] text-white disabled:opacity-60 cursor-pointer"
                  >
                    {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>{editingNoteId ? 'Update Note' : 'Save Note'}</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Notes List Body */}
          <div className="max-h-[360px] sm:max-h-[390px] overflow-y-auto p-3.5 space-y-2.5">
            {loading && notes.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center gap-2 text-xs text-[#888B83]">
                <Loader2 className="w-5 h-5 animate-spin text-[#183D32]" />
                <span>Loading your quick notes...</span>
              </div>
            ) : notes.length === 0 && !formOpen ? (
              <div className="py-8 px-4 text-center space-y-2.5 bg-white/70 rounded-xl border border-dashed border-[#D8D1C3]">
                <div className="w-10 h-10 rounded-full bg-[#FAF3E3] border border-[#C8A96B]/40 mx-auto flex items-center justify-center">
                  <StickyNote className="w-5 h-5 text-[#183D32]" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#183D32]">No quick notes yet</div>
                  <p className="text-xs text-[#70746B] mt-1 leading-relaxed">
                    Save purchase reminders, pending tasks, or quick follow-ups for your account.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openCreateForm}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#183D32] hover:bg-[#245746] text-white cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-[#DFC471]" />
                  <span>Create First Note</span>
                </button>
              </div>
            ) : (
              visibleNotes.map(note => {
                const updated = wasUpdatedAfterCreation(note.createdAt, note.updatedAt);
                const isConfirming = confirmDeleteId === note.id;
                const isBusy = busyNoteId === note.id;

                return (
                  <article
                    key={note.id}
                    className={`rounded-xl border p-3 transition-shadow hover:shadow-sm ${
                      note.pinned
                        ? 'bg-[#EDF4EE] border-[#C5D8C8] border-l-4 border-l-[#183D32]'
                        : 'bg-white border-[#E6E0D3]'
                    }`}
                  >
                    {/* Title Row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {note.pinned ? (
                          <Pin className="w-3.5 h-3.5 shrink-0 text-[#5D4424]" />
                        ) : note.status === 'done' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[#1F7A4C]" />
                        ) : note.status === 'pending' ? (
                          <span className="w-2.5 h-2.5 shrink-0 rounded-full bg-[#E69D18]" aria-hidden="true" />
                        ) : (
                          <span className="w-2.5 h-2.5 shrink-0 rounded-full bg-[#C8A96B]" aria-hidden="true" />
                        )}
                        <h3 className="font-semibold text-sm text-[#183D32] leading-snug break-words">
                          {note.title}
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleTogglePin(note)}
                        disabled={isBusy}
                        aria-label={note.pinned ? `Unpin ${note.title}` : `Pin ${note.title}`}
                        title={note.pinned ? 'Unpin note' : 'Pin note'}
                        className={`p-1 rounded-md transition-colors cursor-pointer shrink-0 ${
                          note.pinned
                            ? 'text-[#183D32] bg-[#DCEADF]'
                            : 'text-[#888B83] hover:text-[#183D32] hover:bg-[#F3EFE6]'
                        }`}
                      >
                        <Pin className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Timestamps */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[#666960]">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3 shrink-0" />
                        <span>Created {formatNoteTimestamp(note.createdAt)}</span>
                      </span>
                      {updated && (
                        <span className="text-[#5C6058]">
                          · Updated {formatNoteTimestamp(note.updatedAt)}
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    {note.description && (
                      <p className="mt-2 text-xs text-[#252923] leading-relaxed whitespace-pre-wrap break-words">
                        {note.description}
                      </p>
                    )}

                    {/* Card Action Row */}
                    <div className="mt-2.5 flex items-center justify-end gap-1.5">
                      {isConfirming ? (
                        <div className="flex items-center gap-1.5 bg-[#FCECEB] border border-[#F2C3BE] rounded-lg px-2 py-1">
                          <span className="text-[11px] font-medium text-[#9E3D33]">Delete?</span>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleDelete(note.id)}
                            className="px-2 py-0.5 rounded bg-[#C65B50] hover:bg-[#A8453B] text-white text-[11px] font-semibold cursor-pointer disabled:opacity-60"
                          >
                            {isBusy ? '...' : 'Yes'}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-1.5 py-0.5 rounded text-[11px] font-medium text-[#5C6058] hover:bg-white/70 cursor-pointer"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditForm(note)}
                            disabled={isBusy}
                            aria-label={`Edit ${note.title}`}
                            title="Edit note"
                            className="p-1.5 rounded-lg text-[#183D32] hover:bg-[#E7F0EA] transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(note.id)}
                            disabled={isBusy}
                            aria-label={`Delete ${note.title}`}
                            title="Delete note"
                            className="p-1.5 rounded-lg text-[#C65B50] hover:bg-[#FCECEB] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>

          {/* Footer Action Bar */}
          {notes.length > MAX_COMPACT_NOTES && (
            <div className="px-3.5 pb-3.5 pt-1 border-t border-[#E9E4D9]/70 bg-[#FAF8F2]">
              <button
                type="button"
                onClick={() => setShowAllNotes(v => !v)}
                className="w-full py-2.5 px-4 rounded-xl bg-[#183D32] hover:bg-[#245746] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#183D32]"
              >
                {showAllNotes ? (
                  <span>Show Recent Notes</span>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 text-[#DFC471]" />
                    <span>View All Notes ({notes.length})</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function sortNotesClient(items: AdminQuickNote[]): AdminQuickNote[] {
  return [...items].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt));
  });
}
