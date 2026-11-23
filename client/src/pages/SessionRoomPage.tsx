import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock,
  Crown,
  Dices,
  Library,
  Link2,
  Lock,
  MapPin,
  MessageSquareQuote,
  Plus,
  Sparkles,
  ThumbsUp,
  Trophy,
  Unlock,
  Users,
  Vote,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { GameCard } from '../components/game/GameCard';
import { GameDetailDrawer } from '../components/game/GameDetailDrawer';
import { FilterChipBar } from '../components/ui/FilterChipBar';
import { OwnerAvatarStack } from '../components/ui/OwnerAvatarStack';
import { PlayerCountBadge } from '../components/ui/PlayerCountBadge';
import { WeightIndicator } from '../components/ui/WeightIndicator';
import { useAppState } from '../context/AppStateContext';
import type { Game, GameFilterState, RsvpStatus } from '../types/domain';
import { DEFAULT_GAME_FILTERS, filterGames } from '../utils/filterGames';
import { formatSessionDate } from '../utils/formatDate';

type ActiveTab = 'proposals' | 'pool';

const RSVP_OPTIONS: { id: RsvpStatus; label: string; activeClass: string }[] = [
  {
    id: 'going',
    label: 'Voy',
    activeClass: 'bg-forest-600 text-white border-forest-600',
  },
  {
    id: 'maybe',
    label: 'Tal vez',
    activeClass: 'bg-ochre-500 text-white border-ochre-500',
  },
  {
    id: 'not_going',
    label: 'No voy',
    activeClass: 'bg-ink text-white border-ink',
  },
];

const RSVP_RING: Record<RsvpStatus, string> = {
  going: 'ring-forest-500',
  maybe: 'ring-ochre-500',
  not_going: 'ring-border-strong opacity-45 grayscale',
};

export function SessionRoomPage() {
  const { id } = useParams<{ id: string }>();
  const {
    currentUser,
    sessions,
    ownershipByGame,
    updateRsvp,
    proposeGame,
    toggleVote,
    toggleSessionLock,
    getSessionPool,
    openLogPlayModal,
  } = useAppState();

  const session = sessions.find((s) => s.id === id) ?? sessions[0];
  const [activeTab, setActiveTab] = useState<ActiveTab>('proposals');
  const [smartPlayerFilter, setSmartPlayerFilter] = useState(true);
  const [poolFilters, setPoolFilters] = useState<GameFilterState>(DEFAULT_GAME_FILTERS);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [proposingGame, setProposingGame] = useState<Game | null>(null);
  const [proposalNote, setProposalNote] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);

  if (!session) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center space-y-3">
        <h1 className="font-[var(--font-display)] text-2xl font-bold text-ink">
          Juntada no encontrada
        </h1>
        <Link
          to="/sessions"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-forest-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Juntadas
        </Link>
      </div>
    );
  }

  const goingParticipants = session.participants.filter((p) => p.rsvp === 'going');
  const confirmedCount = goingParticipants.length;
  const myParticipation = session.participants.find(
    (p) => p.user.id === currentUser.id,
  );
  const myRsvp = myParticipation?.rsvp ?? 'going';

  const isLocked = session.status === 'locked';
  const isHost = session.host.id === currentUser.id;

  const sortedProposals = useMemo(
    () =>
      [...session.proposals].sort(
        (a, b) => b.score - a.score || b.voteCount - a.voteCount,
      ),
    [session.proposals],
  );

  const maxScore = Math.max(1, ...sortedProposals.map((p) => p.score));
  const topScore = sortedProposals[0]?.score ?? 0;
  const winners =
    topScore > 0 ? sortedProposals.filter((p) => p.score === topScore) : [];

  const userVotesUsed = session.proposals.filter((p) => p.userVoted).length;
  const votesRemaining = Math.max(0, session.maxVotesPerUser - userVotesUsed);

  const sessionPool = useMemo(
    () => getSessionPool(session.id),
    [getSessionPool, session.id],
  );

  const poolMechanics = useMemo(
    () =>
      Array.from(new Set(sessionPool.flatMap((g) => g.mechanics))).sort((a, b) =>
        a.localeCompare(b, 'es'),
      ),
    [sessionPool],
  );

  const filteredPool = useMemo(() => {
    const baseFiltered = filterGames(sessionPool, poolFilters);
    if (!smartPlayerFilter || confirmedCount === 0) {
      return baseFiltered;
    }
    return baseFiltered.filter(
      (game) =>
        game.minPlayers <= confirmedCount && game.maxPlayers >= confirmedCount,
    );
  }, [sessionPool, poolFilters, smartPlayerFilter, confirmedCount]);

  const handleCopyInvite = () => {
    const url = `${window.location.origin}/sessions/${session.id}?invite=${session.inviteToken}`;
    void navigator.clipboard?.writeText(url);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  const handleConfirmProposal = (game: Game, note?: string) => {
    proposeGame(session.id, game, note);
    setProposingGame(null);
    setProposalNote('');
  };

  const handleLogWinnerPlay = (gameId?: string) => {
    openLogPlayModal({
      gameId: gameId ?? winners[0]?.game.id,
      sessionId: session.id,
      sessionTitle: session.title,
      playerIds: goingParticipants.map((p) => p.user.id),
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb + Host Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/sessions"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-muted hover:text-forest-600 transition"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver a Juntadas
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyInvite}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-ink hover:border-border-strong transition"
          >
            {copiedInvite ? (
              <>
                <Check className="h-3.5 w-3.5 text-forest-600" aria-hidden="true" />
                <span className="text-forest-700">¡Link copiado!</span>
              </>
            ) : (
              <>
                <Link2 className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
                <span>Copiar link</span>
              </>
            )}
          </button>

          {isHost && (
            <button
              type="button"
              onClick={() => toggleSessionLock(session.id)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition ${
                isLocked
                  ? 'border border-border bg-surface text-ink hover:bg-canvas-subtle'
                  : 'bg-ink text-white hover:bg-forest-900'
              }`}
            >
              {isLocked ? (
                <>
                  <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                  Reabrir votación
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  Cerrar votación
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Session Hero Card */}
      <section className="rounded-3xl border border-border bg-surface p-5 sm:p-6 shadow-[var(--shadow-card)] space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-bold ${
                  isLocked
                    ? 'border-forest-200 bg-forest-50 text-forest-700'
                    : 'border-terracotta-100 bg-terracotta-50 text-terracotta-700'
                }`}
              >
                {isLocked ? (
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Vote className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {isLocked ? 'Votación cerrada' : 'Votación abierta'}
              </span>
              <span className="text-xs font-semibold text-ink-subtle">
                {session.groupName}
              </span>
            </div>

            <h1 className="font-[var(--font-display)] text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              {session.title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
              <span className="inline-flex items-center gap-1.5 font-medium num-tabular">
                <CalendarDays
                  className="h-4 w-4 text-forest-600"
                  aria-hidden="true"
                />
                {formatSessionDate(session.scheduledAt)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-terracotta-500" aria-hidden="true" />
                {session.location}
              </span>
            </div>
          </div>

          {/* Highlighted Confirmed Counter */}
          <div className="self-start flex items-center gap-3 rounded-2xl border border-forest-200 bg-forest-50/80 px-4 py-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-600 text-white font-extrabold text-lg num-tabular">
              {confirmedCount}
            </span>
            <div>
              <span className="block text-xs font-extrabold text-forest-900">
                {confirmedCount === 1 ? 'confirmado' : 'confirmados'}
              </span>
              <span className="block text-[11px] font-medium text-forest-700 num-tabular">
                {sessionPool.filter((g) => !g.isExpansion).length} juegos en el pool
              </span>
            </div>
          </div>
        </div>

        {/* Attendees Row + My RSVP Selector */}
        <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between border-t border-border/80 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {session.participants.map(({ user, rsvp }) => {
              const rsvpText =
                rsvp === 'going' ? 'Voy' : rsvp === 'maybe' ? 'Tal vez' : 'No voy';
              return (
                <div
                  key={user.id}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-canvas/70 py-1 pl-1 pr-2.5"
                  title={`${user.displayName}: ${rsvpText}`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ${RSVP_RING[rsvp]}`}
                    style={{ backgroundColor: user.accentColor }}
                  >
                    {user.initials}
                  </span>
                  <span className="text-xs font-semibold text-ink">
                    {user.displayName}
                  </span>
                  <span
                    className={`text-[10px] font-bold ${
                      rsvp === 'going'
                        ? 'text-forest-700'
                        : rsvp === 'maybe'
                          ? 'text-ochre-700'
                          : 'text-ink-subtle'
                    }`}
                  >
                    {rsvpText}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Interactive Current User RSVP */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold text-ink-subtle">Tu RSVP:</span>
            <div className="inline-flex rounded-xl border border-border bg-canvas p-0.5">
              {RSVP_OPTIONS.map((opt) => {
                const active = myRsvp === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateRsvp(session.id, currentUser.id, opt.id)}
                    className={`min-h-8 rounded-lg px-2.5 text-xs font-bold transition border ${
                      active
                        ? opt.activeClass
                        : 'border-transparent text-ink-muted hover:text-ink'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Main 2-Tab Navigation */}
      <div
        role="tablist"
        aria-label="Secciones de la juntada"
        className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-surface p-1.5 shadow-xs"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'proposals'}
          onClick={() => setActiveTab('proposals')}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition ${
            activeTab === 'proposals'
              ? 'bg-forest-600 text-white shadow-xs'
              : 'text-ink-muted hover:bg-canvas-subtle hover:text-ink'
          }`}
        >
          <Vote className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Propuestas y Votación</span>
          <span
            className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold num-tabular ${
              activeTab === 'proposals'
                ? 'bg-white/20 text-white'
                : 'bg-canvas-deep text-ink-muted'
            }`}
          >
            {session.proposals.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'pool'}
          onClick={() => setActiveTab('pool')}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition ${
            activeTab === 'pool'
              ? 'bg-forest-600 text-white shadow-xs'
              : 'text-ink-muted hover:bg-canvas-subtle hover:text-ink'
          }`}
        >
          <Library className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Pool de Asistentes</span>
          <span
            className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold num-tabular ${
              activeTab === 'pool'
                ? 'bg-white/20 text-white'
                : 'bg-canvas-deep text-ink-muted'
            }`}
          >
            {sessionPool.filter((g) => !g.isExpansion).length}
          </span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: PROPUESTAS Y VOTACIÓN                                         */}
      {/* ==================================================================== */}
      {activeTab === 'proposals' && (
        <section className="space-y-4">
          {/* Status / Voting Quota Banner */}
          {isLocked && winners.length > 0 ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-ochre-500/40 bg-gradient-to-r from-ochre-50 via-surface to-forest-50 p-4 sm:p-5 shadow-xs">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ochre-500 text-white shadow-xs">
                  <Trophy className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-ochre-700">
                    ¡Mesa definida!
                  </span>
                  <h2 className="font-[var(--font-display)] text-lg sm:text-xl font-bold text-ink">
                    {winners.map((w) => w.game.name).join(' · ')}
                  </h2>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Cuando terminen la partida, registrala para sumar al historial y tabla
                    de victorias del grupo.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleLogWinnerPlay(winners[0]?.game.id)}
                className="shrink-0 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-terracotta-500 px-4.5 text-sm font-bold text-white shadow-xs hover:bg-terracotta-600 transition"
              >
                <Dices className="h-4 w-4" aria-hidden="true" />
                Registrar partida jugada
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-xs">
              <div className="flex items-center gap-2.5 text-sm">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  {session.votingMode === 'ranked_top3' ? (
                    <p className="font-semibold text-ink">
                      Modo Top 3 Rankeado ·{' '}
                      <span className="text-forest-700 font-bold num-tabular">
                        1° = 3 pts · 2° = 2 pts · 3° = 1 pt
                      </span>
                    </p>
                  ) : session.votingMode === 'single_choice' ? (
                    <p className="font-semibold text-ink">
                      Voto simple ·{' '}
                      <span className="text-forest-700 font-bold">
                        {votesRemaining === 1
                          ? 'Tenés 1 voto disponible'
                          : 'Ya elegiste tu favorito (podés cambiarlo)'}
                      </span>
                    </p>
                  ) : (
                    <p className="font-semibold text-ink">
                      Multi-voto ·{' '}
                      <span className="text-forest-700 font-bold num-tabular">
                        Te quedan {votesRemaining} de {session.maxVotesPerUser} votos
                      </span>
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('pool')}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-forest-200 bg-forest-50 px-3 text-xs font-bold text-forest-700 hover:bg-forest-100 transition"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Proponer otro juego
              </button>
            </div>
          )}

          {/* Proposals List */}
          {sortedProposals.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-strong bg-surface/70 px-6 py-12 text-center space-y-3">
              <p className="font-[var(--font-display)] text-xl font-bold text-ink">
                Todavía no hay juegos propuestos
              </p>
              <p className="text-sm text-ink-muted max-w-md mx-auto">
                Entrá al <strong>Pool de Asistentes</strong> para ver todos los juegos que
                llevan los {confirmedCount} confirmados y postular tus favoritos.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('pool')}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-forest-600 px-5 text-sm font-bold text-white hover:bg-forest-700 transition"
              >
                <Library className="h-4 w-4" aria-hidden="true" />
                Explorar Pool de Asistentes
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedProposals.map((proposal, index) => {
                const isWinner =
                  topScore > 0 && proposal.score === topScore;
                const progressPct = Math.round((proposal.score / maxScore) * 100);
                const cannotAddVote =
                  !proposal.userVoted &&
                  session.votingMode === 'multi_vote' &&
                  votesRemaining === 0;

                return (
                  <article
                    key={proposal.id}
                    className={`rounded-2xl border bg-surface p-4 sm:p-5 transition shadow-[var(--shadow-card)] ${
                      isLocked && isWinner
                        ? 'border-ochre-500 ring-2 ring-ochre-500/20'
                        : proposal.userVoted
                          ? 'border-forest-500/60'
                          : 'border-border'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row gap-4">
                      {/* Cover + Rank Pill */}
                      <div className="relative sm:w-40 aspect-[16/10] sm:aspect-[4/3] shrink-0 overflow-hidden rounded-xl bg-canvas-subtle">
                        <img
                          src={proposal.game.imageUrl}
                          alt={`Portada de ${proposal.game.name}`}
                          className="h-full w-full object-cover"
                        />
                        <span
                          className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-extrabold shadow-xs num-tabular ${
                            index === 0 && proposal.score > 0
                              ? 'bg-ochre-500 text-white'
                              : 'bg-surface/92 text-ink'
                          }`}
                        >
                          {index === 0 && proposal.score > 0 && (
                            <Crown className="h-3 w-3" aria-hidden="true" />
                          )}
                          #{index + 1}
                        </span>
                      </div>

                      {/* Middle Info */}
                      <div className="flex-1 min-w-0 space-y-2.5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <button
                              type="button"
                              onClick={() => setSelectedGame(proposal.game)}
                              className="text-left font-[var(--font-display)] text-lg sm:text-xl font-bold text-ink hover:text-forest-600 transition-colors"
                            >
                              {proposal.game.name}
                            </button>
                            <p className="text-xs text-ink-subtle">
                              Propuesto por{' '}
                              <strong className="text-ink-muted">
                                {proposal.proposedBy.displayName}
                              </strong>
                            </p>
                          </div>

                          {/* Score Pill */}
                          <div className="text-right">
                            <span className="inline-flex items-baseline gap-1 rounded-xl bg-canvas-subtle px-3 py-1 num-tabular">
                              <span className="text-lg font-extrabold text-ink">
                                {proposal.score}
                              </span>
                              <span className="text-xs font-semibold text-ink-muted">
                                {session.votingMode === 'ranked_top3'
                                  ? 'pts'
                                  : proposal.voteCount === 1
                                    ? 'voto'
                                    : 'votos'}
                              </span>
                            </span>
                          </div>
                        </div>

                        {/* Metadata Pills */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <PlayerCountBadge
                            minPlayers={proposal.game.minPlayers}
                            maxPlayers={proposal.game.maxPlayers}
                            bestPlayers={proposal.game.bestPlayers}
                            targetPlayers={confirmedCount}
                          />
                          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-canvas-subtle px-2 py-0.5 text-[11px] font-semibold text-ink-muted num-tabular">
                            <Clock className="h-3 w-3 opacity-75" aria-hidden="true" />
                            {proposal.game.playingTimeMinutes} min
                          </span>
                          <WeightIndicator weight={proposal.game.weight} />
                        </div>

                        {/* Optional Proposal Note */}
                        {proposal.note && (
                          <div className="flex items-start gap-2 rounded-xl bg-canvas px-3 py-2 text-xs text-ink-muted border border-border/70">
                            <MessageSquareQuote
                              className="h-3.5 w-3.5 mt-0.5 shrink-0 text-terracotta-500"
                              aria-hidden="true"
                            />
                            <p className="italic">“{proposal.note}”</p>
                          </div>
                        )}

                        {/* Progress Bar */}
                        <div
                          className="h-2 w-full overflow-hidden rounded-full bg-canvas-subtle"
                          aria-hidden="true"
                        >
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isWinner ? 'bg-terracotta-500' : 'bg-forest-500'
                            }`}
                            style={{ width: `${proposal.score > 0 ? Math.max(8, progressPct) : 0}%` }}
                          />
                        </div>

                        {/* Footer: Owners + Vote Action */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                          <OwnerAvatarStack owners={proposal.owners} size="sm" />

                          {isLocked ? (
                            <button
                              type="button"
                              onClick={() => handleLogWinnerPlay(proposal.game.id)}
                              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-canvas px-3.5 text-xs font-bold text-ink hover:border-forest-600 hover:text-forest-700 transition"
                            >
                              <Dices className="h-3.5 w-3.5" aria-hidden="true" />
                              Registrar partida
                            </button>
                          ) : session.votingMode === 'ranked_top3' ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-bold text-ink-subtle mr-1">
                                Tu puesto:
                              </span>
                              {[1, 2, 3].map((rank) => {
                                const isSelected =
                                  proposal.userVoted && proposal.userRank === rank;
                                return (
                                  <button
                                    key={rank}
                                    type="button"
                                    onClick={() =>
                                      toggleVote(session.id, proposal.id, rank)
                                    }
                                    className={`inline-flex min-h-9 min-w-11 items-center justify-center rounded-xl border px-2.5 text-xs font-extrabold num-tabular transition ${
                                      isSelected
                                        ? 'border-terracotta-500 bg-terracotta-500 text-white shadow-xs'
                                        : 'border-border bg-canvas text-ink-muted hover:border-forest-600 hover:text-ink'
                                    }`}
                                  >
                                    {rank}°
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={cannotAddVote}
                              onClick={() => toggleVote(session.id, proposal.id)}
                              className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-xs font-bold transition ${
                                proposal.userVoted
                                  ? 'border border-terracotta-200 bg-terracotta-50 text-terracotta-700 hover:bg-terracotta-100'
                                  : cannotAddVote
                                    ? 'bg-canvas-subtle text-ink-subtle cursor-not-allowed'
                                    : 'bg-forest-600 text-white hover:bg-forest-700 shadow-xs'
                              }`}
                            >
                              <ThumbsUp
                                className={`h-3.5 w-3.5 ${
                                  proposal.userVoted ? 'fill-terracotta-500 text-terracotta-500' : ''
                                }`}
                                aria-hidden="true"
                              />
                              {proposal.userVoted
                                ? 'Votado (quitar)'
                                : cannotAddVote
                                  ? 'Sin votos disponibles'
                                  : 'Votar este juego'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: LUDOTECA COMBINADA DEL GRUPO (POOL DE ASISTENTES)             */}
      {/* ==================================================================== */}
      {activeTab === 'pool' && (
        <section className="space-y-4">
          {/* Smart Compatibility Banner (ON by default) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-forest-200 bg-forest-50/75 px-4 py-3.5">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-forest-600 text-white">
                <Users className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-bold text-forest-900">
                  Ludoteca combinada de los {confirmedCount} confirmados
                </p>
                <p className="text-xs text-forest-700">
                  {smartPlayerFilter
                    ? `Mostrando juegos compatibles con ${confirmedCount} jugadores (expansiones ocultas por defecto).`
                    : 'Mostrando toda la colección combinada sin restringir por cantidad de asistentes.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={smartPlayerFilter}
              onClick={() => setSmartPlayerFilter((prev) => !prev)}
              className={`self-start sm:self-center inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-xs font-bold transition ${
                smartPlayerFilter
                  ? 'border-forest-600 bg-surface text-forest-700 shadow-xs'
                  : 'border-border bg-surface/70 text-ink-muted'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-ochre-500" aria-hidden="true" />
              <span className="num-tabular">
                Compatibles con {confirmedCount} jug.
              </span>
              <span
                className={`inline-flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${
                  smartPlayerFilter ? 'bg-forest-600' : 'bg-canvas-deep'
                }`}
              >
                <span
                  className={`h-3 w-3 rounded-full bg-white transition-transform ${
                    smartPlayerFilter ? 'translate-x-3' : 'translate-x-0'
                  }`}
                />
              </span>
            </button>
          </div>

          <FilterChipBar
            value={poolFilters}
            onChange={setPoolFilters}
            availableMechanics={poolMechanics}
            resultCount={filteredPool.length}
            totalCount={
              poolFilters.includeExpansions
                ? sessionPool.length
                : sessionPool.filter((g) => !g.isExpansion).length
            }
            smartPlayerCount={confirmedCount}
            placeholder="Buscar en el pool combinado..."
          />

          {filteredPool.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-strong bg-surface/70 px-6 py-12 text-center space-y-2">
              <p className="font-[var(--font-display)] text-lg font-bold text-ink">
                No hay juegos compatibles con esos filtros
              </p>
              <p className="text-sm text-ink-muted">
                Probá desactivar el filtro de {confirmedCount} jugadores o limpiar las
                mecánicas.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredPool.map((item) => (
                <GameCard
                  key={item.id}
                  game={item}
                  owners={item.owners}
                  targetPlayers={confirmedCount}
                  onSelect={setSelectedGame}
                  actionSlot={
                    item.isProposed ? (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-forest-200 bg-forest-50 px-3 py-2 text-xs font-bold text-forest-700">
                        <span className="inline-flex items-center gap-1.5">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          Ya propuesto
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveTab('proposals')}
                          className="underline hover:text-forest-900"
                        >
                          Ver votos
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={isLocked}
                        onClick={() => {
                          setProposingGame(item);
                          setProposalNote('');
                        }}
                        className="w-full inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-forest-600 px-3 text-xs font-bold text-white shadow-xs hover:bg-forest-700 disabled:opacity-50 transition"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        Proponer para votar
                      </button>
                    )
                  }
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Quick Propose Note Mini-Modal */}
      {proposingGame && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="propose-note-title"
        >
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setProposingGame(null)}
            className="fixed inset-0 bg-ink/40 backdrop-blur-[2px]"
          />
          <div className="relative z-10 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-floating)] space-y-4">
            <div className="flex items-center gap-3">
              <img
                src={proposingGame.thumbnailUrl}
                alt=""
                className="h-12 w-16 rounded-xl object-cover"
              />
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-forest-600">
                  Proponer para esta juntada
                </span>
                <h3
                  id="propose-note-title"
                  className="font-[var(--font-display)] text-lg font-bold text-ink"
                >
                  {proposingGame.name}
                </h3>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="proposal-note-input"
                className="block text-xs font-bold uppercase tracking-wider text-ink-muted"
              >
                Nota opcional para el grupo
              </label>
              <input
                id="proposal-note-input"
                type="text"
                value={proposalNote}
                onChange={(e) => setProposalNote(e.target.value)}
                placeholder="Ej. Llevo la expansión / Lo explico en 5 minutos"
                className="w-full min-h-11 rounded-xl border border-border bg-canvas/70 px-3.5 text-sm text-ink placeholder:text-ink-subtle focus:border-forest-600 focus:bg-surface focus:outline-none"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setProposingGame(null)}
                className="min-h-10 rounded-xl border border-border px-4 text-xs font-semibold text-ink-muted hover:bg-canvas-subtle"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleConfirmProposal(proposingGame, proposalNote)}
                className="min-h-10 rounded-xl bg-forest-600 px-4 text-xs font-bold text-white hover:bg-forest-700"
              >
                Confirmar propuesta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      <GameDetailDrawer
        game={selectedGame}
        owners={selectedGame ? ownershipByGame[selectedGame.id] : undefined}
        isProposed={
          selectedGame
            ? session.proposals.some((p) => p.game.id === selectedGame.id)
            : false
        }
        onPropose={
          !isLocked
            ? (game) => {
                setSelectedGame(null);
                setProposingGame(game);
              }
            : undefined
        }
        onClose={() => setSelectedGame(null)}
      />
    </div>
  );
}
