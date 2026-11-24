import {
  AlertCircle,
  Calendar,
  Loader2,
  MapPin,
  Pencil,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import type { UpdateSessionInput } from '../../context/AppStateContext';
import type { GameSession } from '../../types/domain';

interface EditSessionModalProps {
  session: GameSession | null;
  onClose: () => void;
  onSave: (sessionId: string, input: UpdateSessionInput) => Promise<void>;
}

function toDateTimeLocalValue(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EditSessionModal({
  session,
  onClose,
  onSave,
}: EditSessionModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const initializedSessionIdRef = useRef<string | null>(null);
  const pointerDownOnBackdropRef = useRef(false);

  const [title, setTitle] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [location, setLocation] = useState('');
  const [maxProposalsPerUser, setMaxProposalsPerUser] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (session) {
      if (initializedSessionIdRef.current !== session.id || !dialog.open) {
        initializedSessionIdRef.current = session.id;
        setTitle(session.title);
        setDateTime(toDateTimeLocalValue(session.scheduledAt));
        setLocation(session.location === 'Lugar a confirmar' ? '' : session.location);
        setMaxProposalsPerUser(session.maxProposalsPerUser ?? null);
        setError(null);
      }
      if (!dialog.open) {
        dialog.showModal();
        titleInputRef.current?.focus();
      }
    } else {
      initializedSessionIdRef.current = null;
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [session]);

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!session || submitting) return;

    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2) {
      setError('El título debe tener al menos 2 caracteres.');
      return;
    }

    const parsedDate = new Date(dateTime);
    if (!dateTime || Number.isNaN(parsedDate.getTime())) {
      setError('Ingresá una fecha y hora válidas.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSave(session.id, {
        title: trimmedTitle,
        scheduledAt: parsedDate.toISOString(),
        location: location.trim() || null,
        maxProposalsPerUser,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudieron guardar los cambios de la juntada.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="edit-session-eyebrow edit-session-title"
      onCancel={(e) => {
        e.preventDefault();
        handleClose();
      }}
      onPointerDown={(e) => {
        pointerDownOnBackdropRef.current = e.target === e.currentTarget;
      }}
      onPointerUp={(e) => {
        if (pointerDownOnBackdropRef.current && e.target === e.currentTarget) {
          handleClose();
        }
        pointerDownOnBackdropRef.current = false;
      }}
      className="m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-3xl border border-border bg-surface p-0 text-ink shadow-[var(--shadow-floating)] overflow-hidden"
    >
      {session && (
        <div className="flex max-h-[90dvh] flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <span
                  id="edit-session-eyebrow"
                  className="block text-[11px] font-bold uppercase tracking-wider text-forest-600"
                >
                  Editar juntada
                </span>
                <h2
                  id="edit-session-title"
                  className="font-[var(--font-display)] text-lg font-bold text-ink truncate"
                >
                  {session.title}
                </h2>
              </div>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={handleClose}
              aria-label="Cerrar"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-canvas-subtle hover:text-ink disabled:opacity-50"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Form */}
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="flex-1 overflow-y-auto p-5 space-y-5"
          >
            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-terracotta-200 bg-terracotta-50 px-3 py-2 text-xs font-semibold text-terracotta-700"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <fieldset disabled={submitting} className="space-y-5">
            <div className="space-y-1.5">
              <label
                htmlFor="edit-session-title-input"
                className="block text-xs font-bold uppercase tracking-wider text-ink-muted"
              >
                Título de la juntada
              </label>
              <input
                ref={titleInputRef}
                id="edit-session-title-input"
                type="text"
                required
                minLength={2}
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej. Viernes de Euros + Empanadas"
                className="w-full min-h-11 rounded-xl border border-border bg-canvas/60 px-3.5 text-sm text-ink placeholder:text-ink-subtle focus:border-forest-600 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-forest-600/15"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <label
                  htmlFor="edit-session-date-input"
                  className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-ink-muted"
                >
                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                  Fecha y hora
                </label>
                <input
                  id="edit-session-date-input"
                  type="datetime-local"
                  max="9999-12-31T23:59"
                  required
                  value={dateTime}
                  onChange={(e) => setDateTime(e.target.value)}
                  className="w-full min-h-11 rounded-xl border border-border bg-canvas/60 px-3 text-sm text-ink num-tabular focus:border-forest-600 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-forest-600/15"
                />
              </div>

              <div className="min-w-0 space-y-1.5">
                <label
                  htmlFor="edit-session-location-input"
                  className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-ink-muted"
                >
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  Lugar
                </label>
                <input
                  id="edit-session-location-input"
                  type="text"
                  maxLength={200}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Lugar a confirmar"
                  className="w-full min-h-11 rounded-xl border border-border bg-canvas/60 px-3.5 text-sm text-ink placeholder:text-ink-subtle focus:border-forest-600 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-forest-600/15"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-canvas/70 px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="flex items-center gap-1 text-xs font-semibold text-ink">
                    <Sparkles className="h-3.5 w-3.5 text-forest-600" aria-hidden="true" />
                    Límite de propuestas por integrante
                  </span>
                  <span className="block text-[11px] text-ink-muted">
                    Opcional · Aplicará para nuevas propuestas.
                  </span>
                </div>
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  role="group"
                  aria-label="Límite de propuestas por integrante"
                >
                  {([null, 1, 2, 3, 4, 5] as const).map((limit) => {
                    const active = maxProposalsPerUser === limit;
                    return (
                      <button
                        key={limit === null ? 'unlimited' : limit}
                        type="button"
                        aria-pressed={active}
                        aria-label={
                          limit === null
                            ? 'Sin límite de propuestas por integrante'
                            : `Máximo ${limit} ${limit === 1 ? 'propuesta' : 'propuestas'} por integrante`
                        }
                        onClick={() => setMaxProposalsPerUser(limit)}
                        className={`min-h-9 min-w-9 rounded-lg px-2.5 text-xs font-bold num-tabular transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 focus-visible:ring-offset-1 ${
                          active
                            ? 'bg-forest-600 text-white'
                            : 'bg-surface border border-border text-ink-muted hover:border-border-strong'
                        }`}
                      >
                        {limit === null ? 'Sin límite' : limit}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            </fieldset>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
              <button
                type="button"
                disabled={submitting}
                onClick={handleClose}
                className="min-h-11 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-ink-muted hover:bg-canvas-subtle hover:text-ink disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-forest-600 px-5 text-sm font-bold text-white shadow-xs hover:bg-forest-700 disabled:opacity-70 transition"
              >
                {submitting && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                )}
                Guardar cambios
              </button>
            </div>
          </form>
        </div>
      )}
    </dialog>
  );
}
