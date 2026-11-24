import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  User as UserIcon,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import {
  formatFirebaseAuthError,
  useAuth,
  type AuthModalTab,
} from '../../context/AuthContext';

export type AuthFormMode = AuthModalTab | 'reset';

interface AuthFormProps {
  idPrefix: string;
  initialMode?: AuthModalTab;
  mode?: AuthFormMode;
  onModeChange?: (mode: AuthFormMode) => void;
  onSuccess?: () => void;
  autoFocusEmail?: boolean;
  resetSignal?: number;
}

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

export function AuthForm({
  idPrefix,
  initialMode = 'signin',
  mode: controlledMode,
  onModeChange,
  onSuccess,
  autoFocusEmail = false,
  resetSignal,
}: AuthFormProps) {
  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
  } = useAuth();

  const [internalMode, setInternalMode] = useState<AuthFormMode>(initialMode);
  const mode = controlledMode ?? internalMode;

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    if (resetSignal === undefined) return;
    setErrorMessage(null);
    setInfoMessage(null);
    setShowPassword(false);
  }, [resetSignal]);

  const switchMode = (nextMode: AuthFormMode) => {
    if (controlledMode === undefined) {
      setInternalMode(nextMode);
    }
    onModeChange?.(nextMode);
    setErrorMessage(null);
    setInfoMessage(null);
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle();
      onSuccess?.();
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
        onSuccess?.();
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
        onSuccess?.();
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

  const fullNameId = `${idPrefix}-fullname`;
  const emailId = `${idPrefix}-email`;
  const passwordId = `${idPrefix}-password`;

  return (
    <div className="space-y-4">
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
            className={`min-h-9 rounded-lg py-2 text-xs font-bold transition ${
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
            className={`min-h-9 rounded-lg py-2 text-xs font-bold transition ${
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
              <Loader2
                className="h-4.5 w-4.5 animate-spin text-forest-600"
                aria-hidden="true"
              />
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
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {mode === 'signup' && (
          <div className="space-y-1.5">
            <label htmlFor={fullNameId} className="block text-xs font-bold text-ink">
              Nombre en la mesa
            </label>
            <div className="relative">
              <UserIcon
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
                aria-hidden="true"
              />
              <input
                id={fullNameId}
                name="name"
                type="text"
                autoComplete="name"
                enterKeyHint="next"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ej. Agustín"
                className="w-full min-h-11 rounded-xl border border-border-strong bg-surface pl-10 pr-3.5 text-sm text-ink placeholder:text-ink-subtle focus:border-forest-600 focus:outline-none focus:ring-2 focus:ring-forest-600/15"
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor={emailId} className="block text-xs font-bold text-ink">
            Email
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
              aria-hidden="true"
            />
            <input
              id={emailId}
              name="email"
              type="email"
              autoComplete="username"
              spellCheck={false}
              enterKeyHint={mode === 'reset' ? 'done' : 'next'}
              required
              autoFocus={autoFocusEmail}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full min-h-11 rounded-xl border border-border-strong bg-surface pl-10 pr-3.5 text-sm text-ink placeholder:text-ink-subtle focus:border-forest-600 focus:outline-none focus:ring-2 focus:ring-forest-600/15"
            />
          </div>
        </div>

        {mode !== 'reset' && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={passwordId} className="block text-xs font-bold text-ink">
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
                id={passwordId}
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
                className="w-full min-h-11 rounded-xl border border-border-strong bg-surface pl-10 pr-11 text-sm text-ink placeholder:text-ink-subtle focus:border-forest-600 focus:outline-none focus:ring-2 focus:ring-forest-600/15"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={
                  showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                }
                aria-pressed={showPassword}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-subtle hover:bg-canvas-deep hover:text-ink transition"
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
            className="w-full min-h-9 text-center text-xs font-semibold text-ink-muted hover:text-ink transition"
          >
            Volver a iniciar sesión
          </button>
        )}
      </form>
    </div>
  );
}
