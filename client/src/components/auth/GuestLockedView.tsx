import {
  ArrowRight,
  CheckCircle2,
  Lock,
  LogIn,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface GuestLockedViewProps {
  eyebrow: string;
  pageTitle: string;
  pageSubtitle: string;
  icon: LucideIcon;
  lockTitle: string;
  lockDescription: string;
  benefits: string[];
}

export function GuestLockedView({
  eyebrow,
  pageTitle,
  pageSubtitle,
  icon: FeatureIcon,
  lockTitle,
  lockDescription,
  benefits,
}: GuestLockedViewProps) {
  const { isGuestSession, guestScope, openAuthModal } = useAuth();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <span className="text-xs font-bold uppercase tracking-wider text-forest-600">
          {eyebrow}
        </span>
        <h1 className="font-[var(--font-display)] text-3xl sm:text-4xl font-bold tracking-tight text-ink">
          {pageTitle}
        </h1>
        <p className="text-sm sm:text-base text-ink-muted max-w-xl">
          {pageSubtitle}
        </p>
      </header>

      <section
        aria-label={lockTitle}
        className="relative overflow-hidden rounded-3xl border border-border bg-surface p-6 sm:p-10 shadow-[var(--shadow-card)]"
      >
        {/* Subtle decorative warm wash */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-forest-50 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-terracotta-50 blur-2xl"
        />

        <div className="relative z-10 mx-auto max-w-xl text-center space-y-6">
          <div className="flex justify-center">
            <div className="relative inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-canvas text-forest-700 shadow-xs">
              <FeatureIcon className="h-7 w-7" aria-hidden="true" />
              <span className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-terracotta-500 text-white shadow-xs">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-terracotta-200 bg-terracotta-50 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-terracotta-700">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Bloqueado en modo invitado
            </span>
            <h2 className="font-[var(--font-display)] text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              {lockTitle}
            </h2>
            <p className="text-sm sm:text-base text-ink-muted leading-relaxed">
              {lockDescription}
            </p>
          </div>

          <ul className="mx-auto max-w-md space-y-2 rounded-2xl border border-border/80 bg-canvas/70 p-4 text-left">
            {benefits.map((benefit) => (
              <li
                key={benefit}
                className="flex items-start gap-2.5 text-xs sm:text-sm font-medium text-ink"
              >
                <CheckCircle2
                  className="h-4 w-4 shrink-0 text-forest-600 mt-0.5"
                  aria-hidden="true"
                />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => openAuthModal('signin')}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-forest-600 px-5 text-sm font-bold text-white shadow-xs hover:bg-forest-700 transition"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Iniciar sesión
            </button>
            <button
              type="button"
              onClick={() => openAuthModal('signup')}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface px-5 text-sm font-bold text-ink hover:bg-canvas-subtle transition"
            >
              <UserPlus className="h-4 w-4 text-forest-600" aria-hidden="true" />
              Crear cuenta gratis
            </button>
          </div>

          {isGuestSession && (
            <div className="border-t border-border/80 pt-4">
              <p className="text-xs text-ink-muted mb-2">
                Como invitado{guestScope?.groupName ? ` en ${guestScope.groupName}` : ''},
                podés volver a la juntada para confirmar asistencia y votar.
              </p>
              <Link
                to="/sessions"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-forest-600 hover:text-forest-700 hover:underline"
              >
                <span>Volver a Juntadas</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
