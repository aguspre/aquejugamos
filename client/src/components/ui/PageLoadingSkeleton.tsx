import { CloudOff, RefreshCw } from 'lucide-react';
import type { CSSProperties } from 'react';

export type SkeletonVariant =
  | 'generic'
  | 'sessions'
  | 'library'
  | 'history'
  | 'groups'
  | 'session-room';

interface LoadingSpinnerProps {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SPINNER_SIZES: Record<
  NonNullable<LoadingSpinnerProps['size']>,
  { size: string; thickness: string }
> = {
  sm: { size: '20px', thickness: '2.5px' },
  md: { size: '28px', thickness: '3px' },
  lg: { size: '36px', thickness: '3.5px' },
};

export function LoadingSpinner({
  label = 'Cargando',
  size = 'md',
  className = '',
}: LoadingSpinnerProps) {
  const dims = SPINNER_SIZES[size];
  const style = {
    '--size': dims.size,
    '--thickness': dims.thickness,
  } as CSSProperties;

  return (
    <progress
      aria-label={label}
      style={style}
      className={`loading-spinner ${className}`}
    />
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-xl bg-canvas-deep/80 animate-pulse motion-reduce:animate-none ${className}`}
    />
  );
}

interface PageLoadingSkeletonProps {
  variant?: SkeletonVariant;
  title?: string;
  subtitle?: string;
  slow?: boolean;
  showHeader?: boolean;
}

const DEFAULT_COPY: Record<
  SkeletonVariant,
  { title: string; subtitle: string }
> = {
  generic: {
    title: 'Preparando tu mesa…',
    subtitle: 'Cargando tus grupos, ludoteca y juntadas.',
  },
  sessions: {
    title: 'Cargando juntadas…',
    subtitle: 'Buscando tus próximas mesas y votaciones activas.',
  },
  library: {
    title: 'Cargando tu ludoteca…',
    subtitle: 'Reuniendo tu colección de juegos de mesa.',
  },
  history: {
    title: 'Cargando historial…',
    subtitle: 'Calculando partidas jugadas y estadísticas del grupo.',
  },
  groups: {
    title: 'Cargando tus grupos…',
    subtitle: 'Sincronizando miembros y colecciones compartidas.',
  },
  'session-room': {
    title: 'Abriendo sala de juntada…',
    subtitle: 'Cargando asistentes, propuestas y pool de juegos.',
  },
};

export function PageLoadingSkeleton({
  variant = 'generic',
  title,
  subtitle,
  slow = false,
  showHeader = false,
}: PageLoadingSkeletonProps) {
  const defaults = DEFAULT_COPY[variant];
  const resolvedTitle = slow
    ? 'Despertando el servidor…'
    : (title ?? defaults.title);
  const resolvedSubtitle = slow
    ? 'La primera conexión puede demorar unos segundos. Ya casi estamos.'
    : (subtitle ?? defaults.subtitle);

  return (
    <div
      className="space-y-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {/* Calm tabletop loading banner with native spinner */}
      <div className="flex items-center gap-3.5 rounded-2xl border border-forest-200/80 bg-surface/90 px-4 py-3.5 shadow-[var(--shadow-card)]">
        <LoadingSpinner label={resolvedTitle} size="md" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">{resolvedTitle}</p>
          <p className="text-xs text-ink-muted">{resolvedSubtitle}</p>
        </div>
      </div>

      {/* Optional header skeleton (used when AppShell replaces the full page) */}
      {showHeader && (
        <div
          aria-hidden="true"
          className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
        >
          <div className="space-y-2.5">
            <SkeletonBlock className="h-3.5 w-28 rounded-full" />
            <SkeletonBlock className="h-9 w-52 sm:w-64" />
            <SkeletonBlock className="h-4 w-72 max-w-full" />
          </div>
          <div className="flex items-center gap-2.5">
            <SkeletonBlock className="h-11 w-36" />
          </div>
        </div>
      )}

      {/* Route-matched skeleton body */}
      {variant === 'library' && (
        <div aria-hidden="true" className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <SkeletonBlock className="h-9 w-24 rounded-full" />
            <SkeletonBlock className="h-9 w-28 rounded-full" />
            <SkeletonBlock className="h-9 w-32 rounded-full" />
            <SkeletonBlock className="h-9 w-24 rounded-full" />
          </div>
          <SkeletonBlock className="h-12 w-full rounded-2xl" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-border bg-surface p-4 space-y-3.5 shadow-[var(--shadow-card)]"
              >
                <SkeletonBlock className="aspect-[16/10] w-full rounded-xl" />
                <div className="space-y-2">
                  <SkeletonBlock className="h-5 w-3/4" />
                  <SkeletonBlock className="h-3.5 w-1/2" />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <SkeletonBlock className="h-6 w-16 rounded-full" />
                  <SkeletonBlock className="h-6 w-16 rounded-full" />
                  <SkeletonBlock className="h-6 w-14 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {variant === 'history' && (
        <div aria-hidden="true" className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-border bg-surface p-5 space-y-4 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-center justify-between">
                  <SkeletonBlock className="h-4 w-28" />
                  <SkeletonBlock className="h-5 w-20 rounded-full" />
                </div>
                <div className="space-y-2.5">
                  <SkeletonBlock className="h-10 w-full" />
                  <SkeletonBlock className="h-10 w-full" />
                  <SkeletonBlock className="h-10 w-5/6" />
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-[var(--shadow-card)] flex flex-col sm:flex-row gap-4"
              >
                <SkeletonBlock className="sm:w-32 aspect-[16/10] sm:aspect-[4/3] shrink-0" />
                <div className="flex-1 space-y-3">
                  <SkeletonBlock className="h-4 w-44" />
                  <SkeletonBlock className="h-6 w-56" />
                  <div className="flex flex-wrap gap-2">
                    <SkeletonBlock className="h-8 w-24" />
                    <SkeletonBlock className="h-8 w-24" />
                    <SkeletonBlock className="h-8 w-24" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {variant === 'groups' && (
        <div
          aria-hidden="true"
          className="grid gap-5 lg:grid-cols-12 items-start"
        >
          <div className="lg:col-span-5 space-y-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-border bg-surface p-4 space-y-3 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <SkeletonBlock className="h-5 w-40" />
                  <SkeletonBlock className="h-6 w-20 rounded-lg" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex -space-x-2">
                    <SkeletonBlock className="h-7 w-7 rounded-full" />
                    <SkeletonBlock className="h-7 w-7 rounded-full" />
                    <SkeletonBlock className="h-7 w-7 rounded-full" />
                  </div>
                  <SkeletonBlock className="h-4 w-28" />
                </div>
              </div>
            ))}
          </div>
          <div className="lg:col-span-7 rounded-3xl border border-border bg-surface p-6 space-y-5 shadow-[var(--shadow-card)]">
            <div className="space-y-2">
              <SkeletonBlock className="h-3.5 w-28" />
              <SkeletonBlock className="h-8 w-56" />
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <SkeletonBlock className="h-20 w-full rounded-2xl" />
              <SkeletonBlock className="h-20 w-full rounded-2xl" />
              <SkeletonBlock className="h-20 w-full rounded-2xl" />
            </div>
            <SkeletonBlock className="h-24 w-full rounded-2xl" />
            <div className="space-y-2.5">
              <SkeletonBlock className="h-14 w-full rounded-2xl" />
              <SkeletonBlock className="h-14 w-full rounded-2xl" />
            </div>
          </div>
        </div>
      )}

      {variant === 'session-room' && (
        <div aria-hidden="true" className="space-y-5">
          <div className="rounded-3xl border border-border bg-surface p-5 sm:p-6 space-y-4 shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <SkeletonBlock className="h-6 w-28 rounded-full" />
                  <SkeletonBlock className="h-6 w-24 rounded-full" />
                </div>
                <SkeletonBlock className="h-8 w-64 sm:w-80" />
                <SkeletonBlock className="h-4 w-56" />
              </div>
              <div className="flex gap-2">
                <SkeletonBlock className="h-10 w-20" />
                <SkeletonBlock className="h-10 w-20" />
                <SkeletonBlock className="h-10 w-20" />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-border/70">
              <SkeletonBlock className="h-8 w-8 rounded-full" />
              <SkeletonBlock className="h-8 w-8 rounded-full" />
              <SkeletonBlock className="h-8 w-8 rounded-full" />
              <SkeletonBlock className="h-4 w-32 ml-2" />
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-border bg-surface p-4 flex items-center gap-3.5 shadow-[var(--shadow-card)]"
              >
                <SkeletonBlock className="h-16 w-16 shrink-0" />
                <div className="flex-1 space-y-2">
                  <SkeletonBlock className="h-5 w-44" />
                  <SkeletonBlock className="h-3.5 w-32" />
                  <SkeletonBlock className="h-2.5 w-full rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(variant === 'sessions' || variant === 'generic') && (
        <div aria-hidden="true" className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-border bg-surface p-5 space-y-4 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SkeletonBlock className="h-6 w-28 rounded-full" />
                  <SkeletonBlock className="h-6 w-20 rounded-full" />
                </div>
                <SkeletonBlock className="h-4 w-24" />
              </div>
              <div className="space-y-2">
                <SkeletonBlock className="h-6 w-3/4" />
                <SkeletonBlock className="h-4 w-1/2" />
              </div>
              <SkeletonBlock className="h-16 w-full rounded-xl" />
              <div className="flex items-center justify-between pt-3 border-t border-border/70">
                <div className="flex items-center gap-2">
                  <SkeletonBlock className="h-7 w-7 rounded-full" />
                  <SkeletonBlock className="h-7 w-7 rounded-full" />
                  <SkeletonBlock className="h-4 w-24" />
                </div>
                <SkeletonBlock className="h-9 w-24 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ConnectionRetryStateProps {
  message?: string | null;
  onRetry: () => void;
}

export function ConnectionRetryState({
  message,
  onRetry,
}: ConnectionRetryStateProps) {
  return (
    <div
      role="status"
      className="mx-auto max-w-lg rounded-3xl border border-ochre-100 bg-surface px-6 py-12 text-center shadow-[var(--shadow-card)] space-y-4"
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-ochre-50 text-ochre-700 border border-ochre-100">
        <CloudOff className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="space-y-1.5">
        <h1 className="font-[var(--font-display)] text-2xl font-bold text-ink">
          No pudimos conectar con el servidor
        </h1>
        <p className="text-sm text-ink-muted leading-relaxed">
          {message ??
            'El servidor puede estar iniciándose o hubo un problema temporal de conexión. Probá reintentar en unos segundos.'}
        </p>
      </div>
      <div className="pt-1">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-forest-600 px-5 text-sm font-bold text-white shadow-xs hover:bg-forest-700 transition"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Reintentar conexión
        </button>
      </div>
    </div>
  );
}

