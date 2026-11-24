import { AlertCircle, Ban, Loader2, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import type { GameSession } from '../../types/domain';

interface CancelOrDeleteSessionDialogProps {
  session: GameSession | null;
  onClose: () => void;
  onCancelSession?: (session: GameSession) => Promise<void>;
  onDeleteSession: (session: GameSession) => Promise<void>;
}

export function CancelOrDeleteSessionDialog({
  session,
  onClose,
  onCancelSession,
  onDeleteSession,
}: CancelOrDeleteSessionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const initializedSessionIdRef = useRef<string | null>(null);
  const pointerDownOnBackdropRef = useRef(false);

  const [busyAction, setBusyAction] = useState<'cancel' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (session) {
      if (initializedSessionIdRef.current !== session.id || !dialog.open) {
        initializedSessionIdRef.current = session.id;
        setError(null);
        setBusyAction(null);
      }
      if (!dialog.open) {
        dialog.showModal();
        cancelBtnRef.current?.focus();
      }
    } else {
      initializedSessionIdRef.current = null;
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [session]);

  const handleClose = () => {
    if (busyAction) return;
    onClose();
  };

  const canCancel = Boolean(
    session &&
      onCancelSession &&
      session.status !== 'cancelled' &&
      session.status !== 'completed',
  );

  const handleCancelClick = async () => {
    if (!session || !onCancelSession || busyAction) return;
    setBusyAction('cancel');
    setError(null);
    try {
      await onCancelSession(session);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo cancelar la juntada.',
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteClick = async () => {
    if (!session || busyAction) return;
    setBusyAction('delete');
    setError(null);
    try {
      await onDeleteSession(session);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo eliminar la juntada.',
      );
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="manage-session-delete-eyebrow manage-session-delete-title"
      aria-describedby="manage-session-delete-desc"
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
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-border bg-surface p-0 text-ink shadow-[var(--shadow-floating)]"
    >
      {session && (
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span
                id="manage-session-delete-eyebrow"
                className="text-[11px] font-bold uppercase tracking-wider text-terracotta-600"
              >
                {canCancel ? 'Cancelar o eliminar juntada' : 'Eliminar juntada'}
              </span>
              <h2
                id="manage-session-delete-title"
                className="font-[var(--font-display)] text-lg font-bold text-ink"
              >
                “{session.title}”
              </h2>
            </div>
            <button
              type="button"
              disabled={Boolean(busyAction)}
              onClick={handleClose}
              aria-label="Cerrar"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-canvas-subtle disabled:opacity-50"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-terracotta-200 bg-terracotta-50 px-3 py-2 text-xs font-semibold text-terracotta-700"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div id="manage-session-delete-desc" className="space-y-2.5 text-xs text-ink-muted leading-relaxed">
            {canCancel ? (
              <p>
                Podés <strong>cancelarla</strong> para que el grupo vea que no se
                va a realizar (y reabrirla si cambian de idea), o{' '}
                <strong>eliminarla definitivamente</strong> si fue creada por error.
              </p>
            ) : (
              <p>
                Esta acción eliminará la juntada, sus propuestas y votos de forma
                permanente. Las partidas ya registradas en el historial se conservan.
              </p>
            )}
          </div>

          <div className="space-y-2 pt-1">
            {canCancel && (
              <button
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() => void handleCancelClick()}
                className="w-full inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-ochre-500/40 bg-ochre-50 px-4 text-xs font-bold text-ochre-700 hover:bg-ochre-100 disabled:opacity-60 transition"
              >
                {busyAction === 'cancel' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Ban className="h-4 w-4" aria-hidden="true" />
                )}
                Cancelar juntada (mantener aviso)
              </button>
            )}

            <button
              type="button"
              disabled={Boolean(busyAction)}
              onClick={() => void handleDeleteClick()}
              className="w-full inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-terracotta-600 px-4 text-xs font-bold text-white hover:bg-terracotta-700 disabled:opacity-70 transition"
            >
              {busyAction === 'delete' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              )}
              Eliminar definitivamente
            </button>

            <button
              ref={cancelBtnRef}
              type="button"
              disabled={Boolean(busyAction)}
              onClick={handleClose}
              className="w-full min-h-10 rounded-xl border border-border bg-surface px-4 text-xs font-semibold text-ink-muted hover:bg-canvas-subtle disabled:opacity-60"
            >
              Volver
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
