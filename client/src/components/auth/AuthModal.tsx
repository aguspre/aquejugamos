import { Dices, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AuthForm, type AuthFormMode } from './AuthForm';

export function AuthModal() {
  const { authModalOpen, authModalTab, closeAuthModal } = useAuth();

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [mode, setMode] = useState<AuthFormMode>(authModalTab);
  const [openCount, setOpenCount] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (authModalOpen) {
      setMode(authModalTab);
      setOpenCount((c) => c + 1);
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [authModalOpen, authModalTab]);

  // Fallback de light-dismiss para navegadores sin soporte nativo de `closedby="any"` (Safari)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;

    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      return (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e) && dialog.open) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('pointerup', onPointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="auth-dialog-title"
      onClose={() => {
        if (dialogRef.current) {
          dialogRef.current.returnValue = '';
        }
        closeAuthModal();
      }}
      className="m-auto w-[min(100%-2rem,28rem)] max-h-[92dvh] overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-ink shadow-[var(--shadow-floating)]"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-border bg-canvas/70 px-6 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-forest-600 text-white shadow-xs">
            <Dices className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1
              id="auth-dialog-title"
              className="font-[var(--font-display)] text-xl font-bold leading-tight text-ink"
            >
              {mode === 'signin'
                ? 'Iniciar sesión'
                : mode === 'signup'
                  ? 'Crear cuenta'
                  : 'Recuperar contraseña'}
            </h1>
            <p className="mt-0.5 text-xs text-ink-muted">
              {mode === 'reset'
                ? 'Ingresá tu email y te enviaremos un enlace seguro.'
                : 'Guardá tu ludoteca, grupos y votos en la nube.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Cerrar ventana de acceso"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-subtle hover:bg-canvas-deep hover:text-ink transition"
        >
          <X className="h-4.5 w-4.5" aria-hidden="true" />
        </button>
      </div>

      <div className="px-6 py-5 space-y-5">
        <AuthForm
          idPrefix="modal-auth"
          mode={mode}
          onModeChange={setMode}
          autoFocusEmail
          resetSignal={openCount}
        />

        <p className="border-t border-border pt-4 text-center text-[11px] text-ink-subtle">
          Podés seguir explorando la app como invitado sin iniciar sesión.
        </p>
      </div>
    </dialog>
  );
}
