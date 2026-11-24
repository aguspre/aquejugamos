import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Dices,
  History,
  Library,
  Loader2,
  LogOut,
  Sparkles,
  Ticket,
  User as UserIcon,
  Users,
  Vote,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  authApi,
  groupsApi,
  sessionsApi,
  type InvitePreview,
} from '../api/endpoints';
import { AuthForm, type AuthFormMode } from '../components/auth/AuthForm';
import { useAppState } from '../context/AppStateContext';
import { useAuth } from '../context/AuthContext';
import { formatSessionDate } from '../utils/formatDate';

const PROJECT_PILLARS = [
  {
    icon: Library,
    title: 'Ludoteca grupal + BGG',
    description:
      'Sincronizá tu colección desde BoardGameGeek y unila con la de tus amigos en un solo catálogo.',
    accentClass: 'bg-ochre-500/20 text-ochre-100 border-ochre-500/35',
  },
  {
    icon: Vote,
    title: 'Juntadas y votación',
    description:
      'Filtrá juegos compatibles según quiénes confirman y voten con voto simple, multi-voto o Top 3.',
    accentClass: 'bg-terracotta-500/25 text-terracotta-100 border-terracotta-500/35',
  },
  {
    icon: History,
    title: 'Historial y estadísticas',
    description:
      'Registrá partidas, puntajes y ganadores para saber qué títulos ven más mesa en tu grupo.',
    accentClass: 'bg-teal-700/35 text-teal-100 border-teal-100/25',
  },
] as const;

export function WelcomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    isAuthenticated,
    isGuestSession,
    guestScope,
    firebaseUser,
    signOut,
    enterAsInvitedGuest,
  } = useAuth();
  const { currentUser, refreshAll } = useAppState();

  const groupInviteCode = searchParams.get('groupInvite')?.trim() || '';
  const sessionInviteToken = searchParams.get('sessionInvite')?.trim() || '';
  const hasInvite = Boolean(groupInviteCode || sessionInviteToken);

  const [authMode, setAuthMode] = useState<AuthFormMode>('signin');
  const [invitePreview, setInvitePreview] = useState<InvitePreview | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [guestName, setGuestName] = useState('');
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [joiningRegistered, setJoiningRegistered] = useState(false);

  useEffect(() => {
    if (!hasInvite) {
      setInvitePreview(null);
      setInviteError(null);
      setInviteLoading(false);
      return;
    }

    let cancelled = false;
    setInviteLoading(true);
    setInviteError(null);

    void authApi
      .invitePreview({
        groupCode: groupInviteCode || undefined,
        sessionToken: sessionInviteToken || undefined,
      })
      .then(({ preview }) => {
        if (!cancelled) {
          setInvitePreview(preview);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setInvitePreview(null);
          setInviteError(
            err instanceof ApiError
              ? err.message
              : 'No se pudo validar el link de invitación.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setInviteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasInvite, groupInviteCode, sessionInviteToken]);

  const completeInviteAsRegistered = async () => {
    if (groupInviteCode) {
      setJoiningRegistered(true);
      try {
        await groupsApi.join(groupInviteCode);
        await refreshAll();
        if (invitePreview?.kind === 'group' && invitePreview.activeSession) {
          navigate(`/sessions/${invitePreview.activeSession.id}`, { replace: true });
          return;
        }
        navigate('/sessions', { replace: true });
      } catch {
        navigate(`/join/${encodeURIComponent(groupInviteCode)}`, { replace: true });
      } finally {
        setJoiningRegistered(false);
      }
      return;
    }

    if (sessionInviteToken) {
      setJoiningRegistered(true);
      try {
        const { session } = await sessionsApi.joinByToken(sessionInviteToken, 'going');
        await refreshAll();
        navigate(`/sessions/${session.id}`, { replace: true });
      } catch {
        navigate('/sessions', { replace: true });
      } finally {
        setJoiningRegistered(false);
      }
      return;
    }

    navigate('/sessions', { replace: true });
  };

  const handleAuthSuccess = () => {
    void completeInviteAsRegistered();
  };

  const handleContinueAsGuest = () => {
    navigate('/sessions');
  };

  const handleInvitedGuestSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = guestName.trim();
    if (trimmed.length < 2) {
      setGuestError('Ingresá tu nombre (al menos 2 caracteres) para entrar a la juntada.');
      return;
    }

    setGuestError(null);
    setGuestSubmitting(true);
    try {
      const { targetSessionId } = await enterAsInvitedGuest({
        displayName: trimmed,
        groupInviteCode: groupInviteCode || undefined,
        sessionInviteToken: sessionInviteToken || undefined,
      });

      if (targetSessionId) {
        navigate(`/sessions/${targetSessionId}`, { replace: true });
      } else {
        navigate('/sessions', { replace: true });
      }
    } catch (err) {
      setGuestError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo ingresar como invitado. Verificá la conexión.',
      );
    } finally {
      setGuestSubmitting(false);
    }
  };

  const authHeading =
    authMode === 'signin'
      ? 'Iniciá sesión'
      : authMode === 'signup'
        ? 'Creá tu cuenta'
        : 'Recuperar contraseña';

  const authSubtitle = hasInvite
    ? 'Iniciá sesión para sumarte con tu cuenta completa, o entrá abajo como invitado con tu nombre para votar.'
    : authMode === 'signin'
      ? 'Guardá tu ludoteca, sincronizá BGG y votá en las juntadas de tu grupo.'
      : authMode === 'signup'
        ? 'Sumá tus juegos de mesa y armá la próxima juntada en minutos.'
        : 'Ingresá tu email y te enviaremos un enlace seguro para restablecerla.';

  return (
    <div className="min-h-dvh grid grid-cols-1 lg:grid-cols-3 bg-canvas text-ink">
      {/* ================================================================
          LEFT 2/3 — PORTADA TIPO LUDOTECA (IMAGEN CON BACKDROP Y TEXTO)
         ================================================================ */}
      <section
        aria-label="Presentación de ¿A qué jugamos?"
        className="relative lg:col-span-2 overflow-hidden flex flex-col justify-between min-h-[26rem] sm:min-h-[30rem] lg:min-h-dvh bg-forest-900 text-white"
      >
        {/* Full-bleed Ludoteca Cover Image (LCP candidate) */}
        <img
          src="/images/welcome-ludoteca.svg"
          alt="Estanterías de madera de una ludoteca llena de cajas de juegos de mesa y una mesa con dados, meeples y losetas hexagonales"
          fetchPriority="high"
          decoding="async"
          width={1600}
          height={1100}
          className="absolute inset-0 h-full w-full object-cover object-center select-none pointer-events-none"
        />

        {/* Layered Backdrop Scrim + Soft Glass Wash for Crisp Readability */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-[#0B1E17]/88 via-[#102920]/72 to-[#1B1D1A]/58 backdrop-blur-[1.5px]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-[#081611]/92 via-transparent to-[#0A1A14]/45"
        />

        {/* Foreground Editorial Content */}
        <div className="relative z-10 flex flex-1 flex-col justify-between gap-8 px-6 py-7 sm:px-10 sm:py-10 xl:px-14 xl:py-12">
          {/* Top Brand Bar */}
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-forest-600 text-white shadow-md ring-1 ring-white/20">
                <Dices className="h-5.5 w-5.5" aria-hidden="true" />
              </span>
              <div>
                <span className="block font-[var(--font-display)] text-xl font-bold leading-tight tracking-tight text-white">
                  ¿A qué jugamos?
                </span>
                <span className="block text-[11px] font-semibold uppercase tracking-widest text-white/70">
                  Ludoteca Colaborativa
                </span>
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-ochre-100" aria-hidden="true" />
              <span>Integrado con BoardGameGeek</span>
            </span>
          </header>

          {/* Main Project Pitch */}
          <div className="my-auto max-w-2xl space-y-5 py-2 lg:py-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-ochre-100/25 bg-[#0E261D]/65 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-ochre-100 backdrop-blur-md">
              <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {invitePreview
                  ? invitePreview.kind === 'group'
                    ? `Invitación al grupo ${invitePreview.groupName}`
                    : `Invitación a ${invitePreview.sessionTitle}`
                  : 'Tu grupo, tus juegos, una sola mesa'}
              </span>
            </div>

            <h1 className="font-[var(--font-display)] text-3xl sm:text-4xl xl:text-[3.15rem] font-bold tracking-tight leading-[1.08] text-white drop-shadow-xs">
              La ludoteca compartida para decidir juntos qué sale a la mesa.
            </h1>

            <p className="text-sm sm:text-base xl:text-lg text-white/85 leading-relaxed max-w-xl">
              Reuní las colecciones de juegos de mesa de tu grupo, armá juntadas con
              confirmación de asistencia, cruzá automáticamente qué juegos encajan con
              quienes van y voten en equipo antes de abrir las cajas.
            </p>
          </div>

          {/* Bottom Frosted Backdrop Feature Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {PROJECT_PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <article
                  key={pillar.title}
                  className="rounded-2xl border border-white/15 bg-[#0C2119]/65 p-4 backdrop-blur-md transition hover:border-white/25 hover:bg-[#0E261D]/75"
                >
                  <span
                    className={`mb-2.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border ${pillar.accentClass}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <h2 className="text-sm font-bold text-white leading-snug">
                    {pillar.title}
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-white/75">
                    {pillar.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================================================================
          RIGHT 1/3 — PANEL DE LOGIN Y ACCESO COMO INVITADO
         ================================================================ */}
      <aside
        aria-label="Acceso a la cuenta"
        className="relative lg:col-span-1 flex flex-col justify-center bg-[#FDFBF7] border-t lg:border-t-0 lg:border-l border-border px-6 py-8 pb-[max(2rem,env(safe-area-inset-bottom,0px))] sm:px-10 lg:px-7 xl:px-10 min-w-0"
      >
        {/* Subtle tabletop warmth glow behind panel */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-forest-50/70 to-transparent"
        />

        <div className="relative z-10 mx-auto w-full max-w-sm space-y-5">
          {/* Invite Context Banner (when arriving via group or session invite link) */}
          {hasInvite && (
            <div className="rounded-2xl border border-forest-200 bg-forest-50/90 p-4 space-y-2 shadow-2xs">
              {inviteLoading ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-forest-700">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
                  <span>Verificando link de invitación…</span>
                </div>
              ) : inviteError ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 text-xs font-semibold text-terracotta-700"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{inviteError}</span>
                </div>
              ) : invitePreview ? (
                <>
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-forest-700">
                    <Ticket className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {invitePreview.kind === 'group'
                        ? 'Invitación a un grupo'
                        : 'Invitación a una juntada'}
                    </span>
                  </div>

                  <p className="font-[var(--font-display)] text-lg font-bold text-ink leading-snug">
                    {invitePreview.kind === 'group'
                      ? invitePreview.groupName
                      : invitePreview.sessionTitle}
                  </p>

                  {invitePreview.kind === 'group' && invitePreview.activeSession && (
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-forest-800">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        Próxima juntada: {invitePreview.activeSession.title}
                      </span>
                    </p>
                  )}

                  {invitePreview.kind === 'session' && (
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-forest-800 num-tabular">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {invitePreview.groupName} ·{' '}
                        {formatSessionDate(invitePreview.scheduledAt)}
                      </span>
                    </p>
                  )}
                </>
              ) : null}
            </div>
          )}

          {isAuthenticated ? (
            /* Signed-in registered user state */
            <div className="space-y-6">
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-forest-200 bg-forest-50 px-3 py-1 text-xs font-bold text-forest-700">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Sesión activa</span>
                </span>
                <h2 className="font-[var(--font-display)] text-2xl sm:text-[1.75rem] font-bold tracking-tight text-ink">
                  ¡Hola de nuevo, {currentUser.displayName}!
                </h2>
                <p className="text-sm text-ink-muted">
                  {hasInvite
                    ? 'Confirmá para sumarte a esta invitación con tu cuenta.'
                    : 'Tu ludoteca, tus grupos y tus próximas juntadas están listos para continuar.'}
                </p>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-xs">
                {currentUser.avatarUrl ? (
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser.displayName}
                    referrerPolicy="no-referrer"
                    className="h-11 w-11 shrink-0 rounded-full object-cover border border-border"
                  />
                ) : (
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: currentUser.accentColor }}
                  >
                    {currentUser.initials}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink truncate">
                    {currentUser.displayName}
                  </p>
                  <p className="text-xs text-ink-muted truncate">
                    {currentUser.bggUsername
                      ? `@${currentUser.bggUsername} · BGG`
                      : firebaseUser?.email}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  disabled={joiningRegistered}
                  onClick={() => void completeInviteAsRegistered()}
                  className="w-full inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-forest-600 px-4 text-sm font-bold text-white shadow-xs hover:bg-forest-700 disabled:opacity-60 transition"
                >
                  {joiningRegistered && (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                  <span>
                    {hasInvite ? 'Aceptar invitación y entrar' : 'Ir a mis juntadas'}
                  </span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="w-full inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface px-4 text-sm font-semibold text-ink-muted hover:bg-canvas-subtle hover:text-terracotta-600 transition"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  <span>Cambiar de cuenta</span>
                </button>
              </div>
            </div>
          ) : (
            /* Unauthenticated or Guest Login / Invited-Guest Panel */
            <>
              {/* If invited via link, make named Guest Entry super clear & easy right below or alongside login */}
              {hasInvite && !inviteError && (
                <form
                  onSubmit={handleInvitedGuestSubmit}
                  className="rounded-2xl border border-border-strong bg-surface p-4 shadow-xs space-y-3"
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-terracotta-600">
                      Acceso rápido a la juntada
                    </p>
                    <h2 className="font-[var(--font-display)] text-lg font-bold text-ink leading-snug">
                      Entrar como invitado para votar
                    </h2>
                    <p className="text-xs text-ink-muted leading-snug">
                      Elegí cómo querés aparecer en la mesa. Podrás confirmar asistencia,
                      proponer juegos y votar, con el resto de las secciones bloqueadas
                      hasta registrarte.
                    </p>
                  </div>

                  {guestError && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-xl border border-terracotta-200 bg-terracotta-50 px-3 py-2 text-xs font-medium text-terracotta-700"
                    >
                      <AlertCircle
                        className="h-3.5 w-3.5 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>{guestError}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label
                      htmlFor="welcome-guest-name"
                      className="block text-xs font-bold text-ink"
                    >
                      Tu nombre en la mesa
                    </label>
                    <div className="relative">
                      <UserIcon
                        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
                        aria-hidden="true"
                      />
                      <input
                        id="welcome-guest-name"
                        name="guest-name"
                        type="text"
                        autoComplete="name"
                        enterKeyHint="done"
                        required
                        minLength={2}
                        maxLength={60}
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="Ej. Lucas"
                        className="w-full min-h-11 rounded-xl border border-border-strong bg-canvas/50 pl-10 pr-3.5 text-sm text-ink placeholder:text-ink-subtle focus:border-forest-600 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-forest-600/15"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={guestSubmitting || inviteLoading}
                    className="w-full inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-terracotta-500 px-4 text-sm font-bold text-white shadow-xs hover:bg-terracotta-600 disabled:opacity-60 transition"
                  >
                    {guestSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Vote className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span>Entrar como invitado y votar</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </form>
              )}

              {hasInvite && !inviteError && (
                <div className="relative flex items-center">
                  <span className="flex-1 border-t border-border" />
                  <span className="px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                    o ingresá con tu cuenta
                  </span>
                  <span className="flex-1 border-t border-border" />
                </div>
              )}

              {/* Active Guest Session Return Chip (when revisiting /welcome without a new invite) */}
              {!hasInvite && isGuestSession && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-forest-200 bg-forest-50/80 px-3.5 py-2.5 text-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-forest-900 truncate">
                      Invitado: {currentUser.displayName}
                    </p>
                    {guestScope?.groupName && (
                      <p className="text-[11px] text-forest-700 truncate">
                        Acceso a juntadas de {guestScope.groupName}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/sessions')}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-forest-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-forest-700 transition"
                  >
                    <span>Volver</span>
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              )}

              <div className="space-y-1">
                {!hasInvite && (
                  <p className="text-xs font-bold uppercase tracking-wider text-forest-600">
                    Bienvenido a la mesa
                  </p>
                )}
                <h2 className="font-[var(--font-display)] text-2xl sm:text-[1.7rem] font-bold tracking-tight text-ink">
                  {authHeading}
                </h2>
                <p className="text-xs sm:text-sm text-ink-muted leading-snug">
                  {authSubtitle}
                </p>
              </div>

              <AuthForm
                idPrefix="welcome-auth"
                mode={authMode}
                onModeChange={setAuthMode}
                onSuccess={handleAuthSuccess}
              />

              {/* Standard Limited Guest Entry (only when NOT coming from an invite link) */}
              {!hasInvite && (
                <div className="space-y-2.5 pt-1">
                  <div className="relative flex items-center">
                    <span className="flex-1 border-t border-border" />
                    <span className="px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                      o explorá primero
                    </span>
                    <span className="flex-1 border-t border-border" />
                  </div>

                  <button
                    type="button"
                    onClick={handleContinueAsGuest}
                    className="w-full inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-strong bg-canvas-subtle/80 px-4 text-sm font-bold text-ink hover:bg-canvas-deep hover:border-ink-subtle/40 transition"
                  >
                    <span>Continuar como invitado</span>
                    <ArrowRight className="h-4 w-4 text-forest-600" aria-hidden="true" />
                  </button>

                  <p className="text-center text-xs text-ink-subtle leading-relaxed">
                    Modo invitado limitado: para crear grupos, importar tu ludoteca o ver
                    el historial necesitás iniciar sesión.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
