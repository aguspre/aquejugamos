import {
  Calendar,
  CheckCircle2,
  ListOrdered,
  MapPin,
  Sparkles,
  Users,
  Vote,
  X,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { CreateSessionInput } from '../../context/AppStateContext';
import type { VotingMode } from '../../types/domain';

interface CreateSessionModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (input: CreateSessionInput) => void;
}

const VOTING_MODES: {
  id: VotingMode;
  title: string;
  subtitle: string;
  icon: typeof Vote;
}[] = [
  {
    id: 'single_choice',
    title: 'Voto simple',
    subtitle: '1 voto por persona. Rápido y directo.',
    icon: CheckCircle2,
  },
  {
    id: 'multi_vote',
    title: 'Multi-voto',
    subtitle: 'Cada asistente elige hasta N juegos.',
    icon: Vote,
  },
  {
    id: 'ranked_top3',
    title: 'Top 3 Rankeado',
    subtitle: '1° suma 3 pts, 2° suma 2 pts, 3° suma 1 pt.',
    icon: ListOrdered,
  },
];

export function CreateSessionModal({
  open,
  onClose,
  onCreate,
}: CreateSessionModalProps) {
  const [title, setTitle] = useState('');
  const [dateTime, setDateTime] = useState('2026-12-04T21:00');
  const [location, setLocation] = useState('');
  const [groupMode, setGroupMode] = useState<'group' | 'direct'>('group');
  const [votingMode, setVotingMode] = useState<VotingMode>('multi_vote');
  const [maxVotesPerUser, setMaxVotesPerUser] = useState(3);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onCreate({
      title: title.trim(),
      scheduledAt: new Date(dateTime).toISOString(),
      location: location.trim() || 'Lugar a confirmar',
      groupName:
        groupMode === 'group' ? 'Los Meeples del Viernes' : 'Invitación abierta por link',
      votingMode,
      maxVotesPerUser,
    });

    setTitle('');
    setLocation('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-session-title"
    >
      <button
        type="button"
        aria-label="Cerrar modal"
        onClick={onClose}
        className="fixed inset-0 bg-ink/45 backdrop-blur-[2px]"
      />

      <div className="relative z-10 flex max-h-[92dvh] w-full sm:max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border border-border bg-surface shadow-[var(--shadow-floating)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-forest-600">
              Organizar mesa
            </span>
            <h2
              id="create-session-title"
              className="font-[var(--font-display)] text-xl font-bold text-ink"
            >
              Nueva Juntada
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-canvas-subtle hover:text-ink"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Title */}
          <div className="space-y-1.5">
            <label
              htmlFor="session-title-input"
              className="block text-xs font-bold uppercase tracking-wider text-ink-muted"
            >
              Título de la juntada
            </label>
            <input
              id="session-title-input"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Viernes de Euros + Empanadas"
              className="w-full min-h-11 rounded-xl border border-border bg-canvas/60 px-3.5 text-sm text-ink placeholder:text-ink-subtle focus:border-forest-600 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-forest-600/15"
              autoFocus
            />
          </div>

          {/* Date & Location */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="session-date-input"
                className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-ink-muted"
              >
                <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                Fecha y hora
              </label>
              <input
                id="session-date-input"
                type="datetime-local"
                required
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
                className="w-full min-h-11 rounded-xl border border-border bg-canvas/60 px-3 text-sm text-ink num-tabular focus:border-forest-600 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-forest-600/15"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="session-location-input"
                className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-ink-muted"
              >
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                Lugar
              </label>
              <input
                id="session-location-input"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Depto de Agus / Club..."
                className="w-full min-h-11 rounded-xl border border-border bg-canvas/60 px-3.5 text-sm text-ink placeholder:text-ink-subtle focus:border-forest-600 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-forest-600/15"
              />
            </div>
          </div>

          {/* Group or Direct Link */}
          <div className="space-y-2">
            <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-ink-muted">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              Invitados
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setGroupMode('group')}
                className={`rounded-xl border p-3 text-left transition ${
                  groupMode === 'group'
                    ? 'border-forest-600 bg-forest-50/80 ring-1 ring-forest-600'
                    : 'border-border bg-canvas/50 hover:border-border-strong'
                }`}
              >
                <span className="block text-sm font-bold text-ink">
                  Los Meeples del Viernes
                </span>
                <span className="block text-[11px] text-ink-muted mt-0.5">
                  Invitar a los 5 del grupo
                </span>
              </button>
              <button
                type="button"
                onClick={() => setGroupMode('direct')}
                className={`rounded-xl border p-3 text-left transition ${
                  groupMode === 'direct'
                    ? 'border-forest-600 bg-forest-50/80 ring-1 ring-forest-600'
                    : 'border-border bg-canvas/50 hover:border-border-strong'
                }`}
              >
                <span className="block text-sm font-bold text-ink">Link directo</span>
                <span className="block text-[11px] text-ink-muted mt-0.5">
                  Compartir token por WhatsApp
                </span>
              </button>
            </div>
          </div>

          {/* Voting Mode */}
          <div className="space-y-2">
            <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-ink-muted">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Regla de votación
            </span>
            <div className="space-y-2">
              {VOTING_MODES.map((option) => {
                const Icon = option.icon;
                const active = votingMode === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setVotingMode(option.id)}
                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                      active
                        ? 'border-forest-600 bg-forest-50/80 ring-1 ring-forest-600'
                        : 'border-border bg-surface hover:border-border-strong'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        active
                          ? 'bg-forest-600 text-white'
                          : 'bg-canvas-subtle text-ink-muted'
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-ink">
                        {option.title}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        {option.subtitle}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {votingMode === 'multi_vote' && (
              <div className="mt-2 flex items-center justify-between rounded-xl border border-border bg-canvas/70 px-3.5 py-2.5">
                <span className="text-xs font-semibold text-ink">
                  Máximo de votos por asistente
                </span>
                <div className="flex items-center gap-1.5">
                  {[2, 3, 4, 5].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setMaxVotesPerUser(count)}
                      className={`h-8 w-8 rounded-lg text-xs font-bold num-tabular transition ${
                        maxVotesPerUser === count
                          ? 'bg-forest-600 text-white'
                          : 'bg-surface border border-border text-ink-muted hover:border-border-strong'
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-ink-muted hover:bg-canvas-subtle hover:text-ink"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-forest-600 px-5 text-sm font-bold text-white shadow-xs hover:bg-forest-700 transition"
            >
              Crear juntada y abrir sala
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
