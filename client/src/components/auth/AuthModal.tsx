import {
  AlertCircle,
  CheckCircle2,
  Dices,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  formatFirebaseAuthError,
  useAuth,
  type AuthModalTab,
} from '../../context/AuthContext';

type ModalMode = AuthModalTab | 'reset';

function GoogleGlyph() {
  return (
    <svg className="h-4.5 w-4.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
      />
    </svg>
  );
}

export function AuthModal() {
  const {
    authModalOpen,
    authModalTab,
    closeAuthModal,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
  } = useAuth();

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [mode, setMode] = useState<ModalMode>(authModalTab);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (authModalOpen) {
      setMode(authModalTab);
      setErrorMessage(null);
      setInfoMessage(null);
      setShowPassword(false);
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

  const switchMode = (nextMode: ModalMode) => {
    setMode(nextMode);
    setErrorMessage(null);
    setInfoMessage(null);
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      setErrorMessage(formatFirebaseAuthError(error));
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);
    setSubmitting(true);

    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else if (mode === 'signup') {
        if (displayName.trim().length < 2) {
          setErrorMessage('Ingresá tu nombre (al menos 2 caracteres).');
          setSubmitting(false);
          return;
        }
        await signUpWithEmail({
          email,
          password,
          displayName,
        });
      } else {
        await sendPasswordReset(email);
        setInfoMessage(
          'Te enviamos un correo para restablecer tu contraseña. Revisá tu bandeja de entrada o spam.',
        );
      }
    } catch (error) {
      setErrorMessage(formatFirebaseAuthError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const isBusy = submitting || googleSubmitting;

  return (
    <dialog
      ref={dialogRef}
      // @ts-expect-error `closedby` es estándar HTML moderno con fallback en useEffect
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
        {/* Segmented tabs (Iniciar sesión / Crear cuenta) */}
        {mode !== 'reset' && (
          <div
            role="tablist"
            aria-label="Modo de acceso"
            className="grid grid-cols-2 rounded-xl bg-canvas-subtle p-1 border border-border/80"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              onClick={() => switchMode('signin')}
              className={`rounded-lg py-2 text-xs font-bold transition ${
                mode === 'signin'
                  ? 'bg-surface text-forest-700 shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              onClick={() => switchMode('signup')}
              className={`rounded-lg py-2 text-xs font-bold transition ${
                mode === 'signup'
                  ? 'bg-surface text-forest-700 shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Crear cuenta
            </button>
          </div>
        )}

        {/* Google Sign-In */}
        {mode !== 'reset' && (
          <>
            <button
              type="button"
              disabled={isBusy}
              onClick={handleGoogleSignIn}
              className="w-full inline-flex min-h-11 items-center justify-center gap-2.5 rounded-xl border border-border-strong bg-surface px-4 text-sm font-semibold text-ink shadow-xs hover:bg-canvas-subtle disabled:opacity-60 transition"
            >
              {googleSubmitting ? (
                <Loader2 className="h-4.5 w-4.5 animate-spin text-forest-600" aria-hidden="true" />
              ) : (
                <GoogleGlyph />
              )}
              <span>Continuar con Google</span>
            </button>

            <div className="relative flex items-center py-0.5">
              <span className="flex-1 border-t border-border" />
              <span className="px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                o con tu email
              </span>
              <span className="flex-1 border-t border-border" />
            </div>
          </>
        )}

        {/* Feedback Banners */}
        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-terracotta-200 bg-terracotta-50 px-3.5 py-3 text-xs font-medium text-terracotta-700"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        {infoMessage && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-forest-200 bg-forest-50 px-3.5 py-3 text-xs font-medium text-forest-700"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{infoMessage}</span>
          </div>
        )}

        {/* Email / Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div className="space-y-1.5">
              <label
                htmlFor="auth-fullname"
                className="block text-xs font-bold text-ink"
              >
                Nombre en la mesa
              </label>
              <div className="relative">
                <UserIcon
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
                  aria-hidden="true"
                />
                <input
                  id="auth-fullname"
                  name="name"
                  type="text"
                  autoComplete="name"
                  enterKeyHint="next"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ej. Agustín"
                  className="w-full min-h-11 rounded-xl border border-border-strong bg-canvas/50 pl-10 pr-3.5 text-sm text-ink placeholder:text-ink-subtle focus:border-forest-600 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-forest-600/15"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="auth-email" className="block text-xs font-bold text-ink">
              Email
            </label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
                aria-hidden="true"
              />
              <input
                id="auth-email"
                name="email"
                type="email"
                autoComplete="username"
                spellCheck={false}
                enterKeyHint={mode === 'reset' ? 'done' : 'next'}
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full min-h-11 rounded-xl border border-border-strong bg-canvas/50 pl-10 pr-3.5 text-sm text-ink placeholder:text-ink-subtle focus:border-forest-600 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-forest-600/15"
              />
            </div>
          </div>

          {mode !== 'reset' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-bold text-ink"
                >
                  Contraseña
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => switchMode('reset')}
                    className="text-xs font-semibold text-forest-600 hover:text-forest-700 hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                )}
              </div>

              <div className="relative">
                <KeyRound
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
                  aria-hidden="true"
                />
                <input
                  id="auth-password"
                  name={mode === 'signup' ? 'new-password' : 'current-password'}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={
                    mode === 'signup' ? 'new-password' : 'current-password'
                  }
                  enterKeyHint="done"
                  minLength={mode === 'signup' ? 6 : undefined}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    mode === 'signup' ? 'Mínimo 6 caracteres' : 'Tu contraseña'
                  }
                  className="w-full min-h-11 rounded-xl border border-border-strong bg-canvas/50 pl-10 pr-11 text-sm text-ink placeholder:text-ink-subtle focus:border-forest-600 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-forest-600/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={
                    showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                  }
                  aria-pressed={showPassword}
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle hover:bg-canvas-deep hover:text-ink transition"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isBusy}
            className="w-full inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-forest-600 px-4 text-sm font-bold text-white shadow-xs hover:bg-forest-700 disabled:opacity-60 transition"
          >
            {submitting && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            <span>
              {mode === 'signin'
                ? 'Iniciar sesión'
                : mode === 'signup'
                  ? 'Crear cuenta'
                  : 'Enviar enlace de recuperación'}
            </span>
          </button>

          {mode === 'reset' && (
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="w-full text-center text-xs font-semibold text-ink-muted hover:text-ink transition"
            >
              Volver a iniciar sesión
            </button>
          )}
        </form>

        <p className="border-t border-border pt-4 text-center text-[11px] text-ink-subtle">
          Podés seguir explorando la app en modo demo sin iniciar sesión.
        </p>
      </div>
    </dialog>
  );
}
