import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Crown,
  Dices,
  Library,
  Link2,
  Loader2,
  Lock,
  MapPin,
  MessageSquareQuote,
  Plus,
  RotateCcw,
  Sparkles,
  ThumbsUp,
  Trash2,
  Trophy,
  Unlock,
  Users,
  Vote,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { applyOptimisticRsvp, applyOptimisticVote } from "../api/mappers";
import { GuestLockedView } from "../components/auth/GuestLockedView";
import { GameCard } from "../components/game/GameCard";
import { GameDetailDrawer } from "../components/game/GameDetailDrawer";
import { FilterChipBar } from "../components/ui/FilterChipBar";
import { OwnerAvatarStack } from "../components/ui/OwnerAvatarStack";
import { UserAvatar } from "../components/ui/UserAvatar";
import { PlayerCountBadge } from "../components/ui/PlayerCountBadge";
import { WeightIndicator } from "../components/ui/WeightIndicator";
import { useAppState } from "../context/AppStateContext";
import { useAuth } from "../context/AuthContext";
import type {
  Game,
  GameFilterState,
  GameSession,
  RsvpStatus,
  SessionGameItem,
  SessionProposal,
} from "../types/domain";
import { DEFAULT_GAME_FILTERS, filterGames } from "../utils/filterGames";
import { formatSessionDate } from "../utils/formatDate";

type ActiveTab = "proposals" | "pool";

const RSVP_OPTIONS: { id: RsvpStatus; label: string; activeClass: string }[] = [
  {
    id: "going",
    label: "Voy",
    activeClass: "bg-forest-600 text-white border-forest-600",
  },
  {
    id: "maybe",
    label: "Tal vez",
    activeClass: "bg-ochre-500 text-white border-ochre-500",
  },
  {
    id: "not_going",
    label: "No voy",
    activeClass: "bg-ink text-white border-ink",
  },
];

const RSVP_RING: Record<RsvpStatus, string> = {
  going: "ring-forest-500",
  maybe: "ring-ochre-500",
  not_going: "ring-border-strong opacity-45 grayscale",
};

export function SessionRoomPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    isAuthenticated,
    isGuestSession,
    loading: authLoading,
    openAuthModal,
  } = useAuth();
  const {
    currentUser,
    sessions,
    loadSessionDetail,
    loadSessionPool,
    joinSessionByToken,
    updateRsvp,
    proposeGame,
    removeProposal,
    updateProposalStatus,
    toggleVote,
    toggleSessionLock,
    openLogPlayModal,
  } = useAppState();

  const [session, setSession] = useState<GameSession | null>(
    () => sessions.find((s) => s.id === id) ?? null,
  );
  const [sessionPool, setSessionPool] = useState<SessionGameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("proposals");
  const [smartPlayerFilter, setSmartPlayerFilter] = useState(true);
  const [poolFilters, setPoolFilters] =
    useState<GameFilterState>(DEFAULT_GAME_FILTERS);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [proposingGame, setProposingGame] = useState<Game | null>(null);
  const [proposalNote, setProposalNote] = useState("");
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [proposalToRemoveId, setProposalToRemoveId] = useState<string | null>(
    null,
  );
  const [removingProposal, setRemovingProposal] = useState(false);
  const [removeProposalError, setRemoveProposalError] = useState<string | null>(
    null,
  );
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const removeDialogRef = useRef<HTMLDialogElement | null>(null);
  const voteSeqRef = useRef(0);
  const voteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const rsvpSeqRef = useRef(0);
  const rsvpQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastConfirmedSessionRef = useRef<GameSession | null>(session);

  const inviteTokenParam = searchParams.get("invite");
  const shouldRedirectInviteToWelcome = Boolean(
    !authLoading && !isAuthenticated && inviteTokenParam,
  );
  const canLoadRoom = Boolean(
    !authLoading &&
    (isAuthenticated || isGuestSession) &&
    !shouldRedirectInviteToWelcome,
  );

  const fetchRoomData = useCallback(async () => {
    if (!id || !canLoadRoom) return;
    setErrorMsg(null);

    try {
      const inviteToken = searchParams.get("invite");
      let loadedSession: GameSession;
      let pool: SessionGameItem[];

      if (inviteToken) {
        loadedSession = await joinSessionByToken(inviteToken, "going");
        setSearchParams({}, { replace: true });
        pool = await loadSessionPool(loadedSession.id);
      } else {
        [loadedSession, pool] = await Promise.all([
          loadSessionDetail(id),
          loadSessionPool(id),
        ]);
      }

      lastConfirmedSessionRef.current = loadedSession;
      setSession(loadedSession);
      setSessionPool(pool);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : "No se pudo cargar la sala de la juntada.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    id,
    canLoadRoom,
    searchParams,
    setSearchParams,
    joinSessionByToken,
    loadSessionDetail,
    loadSessionPool,
  ]);

  useEffect(() => {
    if (!canLoadRoom) return;
    setLoading(true);
    void fetchRoomData();
  }, [canLoadRoom, fetchRoomData]);

  const proposalToRemove = useMemo(
    () =>
      proposalToRemoveId && session
        ? (session.proposals.find((p) => p.id === proposalToRemoveId) ?? null)
        : null,
    [proposalToRemoveId, session],
  );

  useEffect(() => {
    const dialog = removeDialogRef.current;
    if (!dialog) return;
    if (proposalToRemove) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [proposalToRemove]);

  useEffect(() => {
    if (!proposingGame || busyAction) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setProposingGame(null);
        setProposeError(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [proposingGame, busyAction]);

  const poolMechanics = useMemo(
    () =>
      Array.from(new Set(sessionPool.flatMap((g) => g.mechanics))).sort(
        (a, b) => a.localeCompare(b, "es"),
      ),
    [sessionPool],
  );

  const goingParticipants = useMemo(
    () => session?.participants.filter((p) => p.rsvp === "going") ?? [],
    [session],
  );
  const confirmedCount = goingParticipants.length;

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

  if (shouldRedirectInviteToWelcome && inviteTokenParam) {
    return (
      <Navigate
        to={`/welcome?sessionInvite=${encodeURIComponent(inviteTokenParam)}`}
        replace
      />
    );
  }

  if (!authLoading && !isAuthenticated && !isGuestSession) {
    return (
      <GuestLockedView
        eyebrow="Sala de juntada"
        pageTitle="Acceso restringido"
        pageSubtitle="Esta juntada requiere una cuenta o un link de invitación válido."
        icon={CalendarDays}
        lockTitle="Necesitás una invitación o cuenta para entrar"
        lockDescription="Si un amigo te invitó, abrí su link de invitación para ingresar con tu nombre como invitado y votar. También podés iniciar sesión con tu cuenta."
        benefits={[
          "Confirmá asistencia (Voy / Tal vez / No voy) en las juntadas de tu grupo.",
          "Votá qué juegos salen a la mesa en tiempo real.",
          "Con cuenta registrada además podés proponer juegos y sumar tu ludoteca.",
        ]}
      />
    );
  }

  if ((authLoading || loading) && !session) {
    return (
      <div className="flex items-center justify-center py-20 text-ink-muted gap-2">
        <Loader2
          className="h-5 w-5 animate-spin text-forest-600"
          aria-hidden="true"
        />
        <span className="text-sm font-semibold">Cargando sala de juntada…</span>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center space-y-3">
        <h1 className="font-[var(--font-display)] text-2xl font-bold text-ink">
          {errorMsg ?? "Juntada no encontrada"}
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

  const myParticipation = session.participants.find(
    (p) => p.user.id === currentUser.id,
  );
  const myRsvp = myParticipation?.rsvp ?? "going";

  const isLocked = session.status === "locked";
  const isClosed =
    session.status === "completed" || session.status === "cancelled";
  const isHost = session.host.id === currentUser.id;
  const canManage = Boolean(
    isAuthenticated && (session.canManageSession ?? isHost),
  );
  const canAcceptOrRevert = canManage && !isClosed;

  const acceptedProposals = session.proposals.filter(
    (p) => p.status === "accepted",
  );
  const openProposals = [
    ...session.proposals.filter((p) => p.status !== "accepted"),
  ].sort((a, b) => b.score - a.score || b.voteCount - a.voteCount);

  const totalAcceptedMinutes = acceptedProposals.reduce(
    (sum, p) => sum + (p.game.playingTimeMinutes || 0),
    0,
  );

  const maxOpenScore = Math.max(1, ...openProposals.map((p) => p.score));
  const topOpenScore = openProposals[0]?.score ?? 0;
  const openWinners =
    topOpenScore > 0
      ? openProposals.filter((p) => p.score === topOpenScore)
      : [];
  const finalLineup =
    acceptedProposals.length > 0 ? acceptedProposals : openWinners;

  const userVotesUsed = session.proposals.filter((p) => p.userVoted).length;
  const votesRemaining = Math.max(0, session.maxVotesPerUser - userVotesUsed);
  const lockedVotesCount =
    session.lockedVotesCount ??
    acceptedProposals.filter((p) => p.userVoted).length;
  const lockedRanks = new Set<number>(
    session.lockedRanks ??
      acceptedProposals
        .filter((p) => p.userVoted && p.userRank !== undefined)
        .map((p) => p.userRank!),
  );
  const hasLockedSingleVote =
    session.votingMode === "single_choice" && lockedVotesCount > 0;

  const maxProposalsPerUser = session.maxProposalsPerUser ?? null;
  const hasProposalQuotaDetail = session.userProposalsCount !== undefined;
  const userProposalsCount = hasProposalQuotaDetail
    ? session.userProposalsCount!
    : 0;
  const proposalsRemaining =
    maxProposalsPerUser !== null && hasProposalQuotaDetail
      ? (session.proposalsRemaining ??
        Math.max(0, maxProposalsPerUser - userProposalsCount))
      : null;
  const reachedProposalLimit = proposalsRemaining === 0;
  const myOpenProposalsCount = hasProposalQuotaDetail
    ? session.proposals.filter(
        (p) => p.status !== "accepted" && p.proposedBy.id === currentUser.id,
      ).length
    : 0;
  const proposalStatusByGameId = new Map(
    session.proposals.map((p) => [p.game.id, p.status]),
  );

  const runSessionAction = async (
    action: () => Promise<GameSession>,
    refreshPoolToo = false,
  ) => {
    setBusyAction(true);
    setErrorMsg(null);
    setActionNotice(null);
    try {
      const updated = await action();
      lastConfirmedSessionRef.current = updated;
      setSession(updated);
      if (refreshPoolToo) {
        const pool = await loadSessionPool(updated.id);
        setSessionPool(pool);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : "No se pudo completar la acción.",
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleRsvpChange = (nextRsvp: RsvpStatus) => {
    if (!session || myRsvp === nextRsvp) return;
    const seq = ++rsvpSeqRef.current;
    const baseSnapshot = session;
    const optimistic = applyOptimisticRsvp(baseSnapshot, currentUser, nextRsvp);

    setErrorMsg(null);
    setSession(optimistic);

    rsvpQueueRef.current = rsvpQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const updated = await updateRsvp(
            baseSnapshot.id,
            currentUser.id,
            nextRsvp,
            baseSnapshot,
          );
          lastConfirmedSessionRef.current = updated;
          if (seq === rsvpSeqRef.current) {
            setSession(updated);
            try {
              const pool = await loadSessionPool(updated.id);
              if (seq === rsvpSeqRef.current) {
                setSessionPool(pool);
              }
            } catch {
              // Pool refresh failure does not revert a confirmed RSVP update
            }
          }
        } catch (err) {
          if (seq === rsvpSeqRef.current && lastConfirmedSessionRef.current) {
            setSession(lastConfirmedSessionRef.current);
          }
          setErrorMsg(
            err instanceof ApiError
              ? err.message
              : "No se pudo actualizar tu estado de asistencia. Se restauró el estado anterior.",
          );
        }
      });
  };

  const handleVote = (proposalId: string, requestedRank?: number) => {
    if (!session || busyAction || removingProposal) return;
    const seq = ++voteSeqRef.current;
    const baseSnapshot = session;
    const targetProposal = baseSnapshot.proposals.find(
      (p) => p.id === proposalId,
    );
    const isRanked = baseSnapshot.votingMode === "ranked_top3";
    const rank = requestedRank ?? 1;
    const shouldRemove = isRanked
      ? Boolean(targetProposal?.userVoted && targetProposal?.userRank === rank)
      : Boolean(targetProposal?.userVoted);

    setErrorMsg(null);
    setSession(
      applyOptimisticVote(baseSnapshot, proposalId, shouldRemove, rank),
    );

    voteQueueRef.current = voteQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const updated = await toggleVote(
            baseSnapshot.id,
            proposalId,
            requestedRank,
            baseSnapshot,
          );
          lastConfirmedSessionRef.current = updated;
          if (seq === voteSeqRef.current) {
            setSession(updated);
          }
        } catch (err) {
          if (seq === voteSeqRef.current && lastConfirmedSessionRef.current) {
            setSession(lastConfirmedSessionRef.current);
          }
          setErrorMsg(
            err instanceof ApiError
              ? err.message
              : "No se pudo registrar tu voto.",
          );
        }
      });
  };

  const handleCopyInvite = () => {
    const url = `${window.location.origin}/sessions/${session.id}?invite=${session.inviteToken}`;
    void navigator.clipboard?.writeText(url);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  const handleConfirmProposal = async (game: Game, note?: string) => {
    setBusyAction(true);
    setErrorMsg(null);
    setProposeError(null);
    setActionNotice(null);
    try {
      const updated = await proposeGame(session.id, game, note);
      lastConfirmedSessionRef.current = updated;
      setSession(updated);
      setProposingGame(null);
      setProposalNote("");
      try {
        const pool = await loadSessionPool(updated.id);
        setSessionPool(pool);
      } catch {
        // Pool refresh failure does not revert a confirmed proposal
      }
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "No se pudo proponer el juego.";
      const isTerminalProposalError =
        err instanceof ApiError &&
        (err.code === "MAX_PROPOSALS_REACHED" ||
          err.code === "DUPLICATE_PROPOSAL" ||
          err.code === "SESSION_VOTING_CLOSED");

      if (isTerminalProposalError) {
        setProposingGame(null);
        setProposalNote("");
        setProposeError(null);
        setErrorMsg(message);
        try {
          const [fresh, freshPool] = await Promise.all([
            loadSessionDetail(session.id),
            loadSessionPool(session.id),
          ]);
          lastConfirmedSessionRef.current = fresh;
          setSession(fresh);
          setSessionPool(freshPool);
        } catch {
          // Keep error message even if background resync fails
        }
      } else {
        setProposeError(message);
      }
    } finally {
      setBusyAction(false);
    }
  };

  const closeRemoveProposalModal = () => {
    if (removingProposal) return;
    setProposalToRemoveId(null);
    setRemoveProposalError(null);
  };

  const handleConfirmRemoveProposal = async (proposal: SessionProposal) => {
    setRemovingProposal(true);
    setBusyAction(true);
    setRemoveProposalError(null);
    setActionNotice(null);
    try {
      // Wait for any in-flight optimistic vote or RSVP to settle before deleting the proposal
      await Promise.all([
        voteQueueRef.current.catch(() => undefined),
        rsvpQueueRef.current.catch(() => undefined),
      ]);
      voteSeqRef.current += 1;
      rsvpSeqRef.current += 1;

      const { session: updated, refundedVotesCount } = await removeProposal(
        session.id,
        proposal.id,
      );
      lastConfirmedSessionRef.current = updated;
      setSession(updated);
      setErrorMsg(null);
      setProposalToRemoveId(null);
      setRemoveProposalError(null);

      const votesMsg =
        refundedVotesCount > 0
          ? ` y se ${refundedVotesCount === 1 ? "devolvió 1 voto disponible" : `devolvieron ${refundedVotesCount} votos disponibles`}`
          : "";
      setActionNotice(
        `Se quitó “${proposal.game.name}” de la votación${votesMsg}.`,
      );

      void loadSessionPool(updated.id)
        .then((pool) => setSessionPool(pool))
        .catch(() => {
          // Pool refresh failure does not revert a confirmed removal
        });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "No se pudo quitar el juego de la votación.";
      setRemoveProposalError(message);

      if (
        err instanceof ApiError &&
        (err.code === "PROPOSAL_NOT_FOUND" ||
          err.code === "PROPOSAL_ALREADY_ACCEPTED" ||
          err.code === "SESSION_VOTING_CLOSED")
      ) {
        void loadSessionDetail(session.id)
          .then((fresh) => {
            lastConfirmedSessionRef.current = fresh;
            setSession(fresh);
          })
          .catch(() => undefined);
      }
    } finally {
      setRemovingProposal(false);
      setBusyAction(false);
    }
  };

  const handleLogWinnerPlay = (gameId?: string) => {
    openLogPlayModal({
      gameId: gameId ?? finalLineup[0]?.game.id,
      sessionId: session.id,
      sessionTitle: session.title,
      groupId: session.groupId,
      playerIds: goingParticipants.map((p) => p.user.id),
    });
  };

  const selectedGameOwners = selectedGame
    ? (sessionPool.find((g) => g.id === selectedGame.id)?.owners ??
      session.proposals.find((p) => p.game.id === selectedGame.id)?.owners)
    : undefined;

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
          {isAuthenticated && (
            <button
              type="button"
              onClick={handleCopyInvite}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-ink hover:border-border-strong transition"
            >
              {copiedInvite ? (
                <>
                  <Check
                    className="h-3.5 w-3.5 text-forest-600"
                    aria-hidden="true"
                  />
                  <span className="text-forest-700">¡Link copiado!</span>
                </>
              ) : (
                <>
                  <Link2
                    className="h-3.5 w-3.5 text-ink-muted"
                    aria-hidden="true"
                  />
                  <span>Copiar link</span>
                </>
              )}
            </button>
          )}

          {canManage && !isClosed && (
            <button
              type="button"
              disabled={busyAction}
              onClick={() =>
                void runSessionAction(() => toggleSessionLock(session.id))
              }
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition disabled:opacity-60 ${
                isLocked
                  ? "border border-border bg-surface text-ink hover:bg-canvas-subtle"
                  : "bg-ink text-white hover:bg-forest-900"
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

      {errorMsg && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-2xl border border-terracotta-200 bg-terracotta-50 px-4 py-3 text-xs font-semibold text-terracotta-700"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {actionNotice && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-2xl border border-forest-200 bg-forest-50 px-4 py-3 text-xs font-semibold text-forest-800"
        >
          <span className="inline-flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-forest-600" aria-hidden="true" />
            <span>{actionNotice}</span>
          </span>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            aria-label="Cerrar aviso"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-forest-700 hover:bg-forest-100 hover:text-forest-900 transition"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Session Hero Card */}
      <section className="rounded-3xl border border-border bg-surface p-5 sm:p-6 shadow-[var(--shadow-card)] space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-bold ${
                  isLocked
                    ? "border-forest-200 bg-forest-50 text-forest-700"
                    : "border-terracotta-100 bg-terracotta-50 text-terracotta-700"
                }`}
              >
                {isLocked ? (
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Vote className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {isLocked ? "Votación cerrada" : "Votación abierta"}
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
                <MapPin
                  className="h-4 w-4 text-terracotta-500"
                  aria-hidden="true"
                />
                {session.location}
              </span>
            </div>
          </div>

          <div className="self-start flex items-center gap-3 rounded-2xl border border-forest-200 bg-forest-50/80 px-4 py-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-600 text-white font-extrabold text-lg num-tabular">
              {confirmedCount}
            </span>
            <div>
              <span className="block text-xs font-extrabold text-forest-900">
                {confirmedCount === 1 ? "confirmado" : "confirmados"}
              </span>
              <span className="block text-[11px] font-medium text-forest-700 num-tabular">
                {sessionPool.filter((g) => !g.isExpansion).length} juegos en el
                pool
              </span>
            </div>
          </div>
        </div>

        {/* Attendees Row + My RSVP Selector */}
        <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between border-t border-border/80 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {session.participants.map(({ user, rsvp }) => {
              const rsvpText =
                rsvp === "going"
                  ? "Voy"
                  : rsvp === "maybe"
                    ? "Tal vez"
                    : "No voy";
              return (
                <div
                  key={user.id}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-canvas/70 py-1 pl-1 pr-2.5"
                  title={`${user.displayName}: ${rsvpText}`}
                >
                  <UserAvatar
                    user={user}
                    className={`h-6 w-6 text-[10px] ring-2 ${RSVP_RING[rsvp]}`}
                  />
                  <span className="text-xs font-semibold text-ink">
                    {user.displayName}
                  </span>
                  <span
                    className={`text-[10px] font-bold ${
                      rsvp === "going"
                        ? "text-forest-700"
                        : rsvp === "maybe"
                          ? "text-ochre-700"
                          : "text-ink-subtle"
                    }`}
                  >
                    {rsvpText}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold text-ink-subtle">Tu RSVP:</span>
            <div className="inline-flex rounded-xl border border-border bg-canvas p-0.5">
              {RSVP_OPTIONS.map((opt) => {
                const active = myRsvp === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleRsvpChange(opt.id)}
                    className={`min-h-8 rounded-lg px-2.5 text-xs font-bold transition border ${
                      active
                        ? opt.activeClass
                        : "border-transparent text-ink-muted hover:text-ink"
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

      {/* 2-Tab Switch */}
      <div
        role="tablist"
        aria-label="Secciones de la juntada"
        className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-surface p-1.5 shadow-xs"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "proposals"}
          onClick={() => setActiveTab("proposals")}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition ${
            activeTab === "proposals"
              ? "bg-forest-600 text-white shadow-xs"
              : "text-ink-muted hover:bg-canvas-subtle hover:text-ink"
          }`}
        >
          <Vote className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Propuestas y Votación</span>
          <span
            className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold num-tabular ${
              activeTab === "proposals"
                ? "bg-white/20 text-white"
                : "bg-canvas-deep text-ink-muted"
            }`}
          >
            {session.proposals.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "pool"}
          onClick={() => setActiveTab("pool")}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition ${
            activeTab === "pool"
              ? "bg-forest-600 text-white shadow-xs"
              : "text-ink-muted hover:bg-canvas-subtle hover:text-ink"
          }`}
        >
          <Library className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Pool de Asistentes</span>
          <span
            className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold num-tabular ${
              activeTab === "pool"
                ? "bg-white/20 text-white"
                : "bg-canvas-deep text-ink-muted"
            }`}
          >
            {sessionPool.filter((g) => !g.isExpansion).length}
          </span>
        </button>
      </div>

      {/* TAB 1: PROPOSALS & VOTING */}
      {activeTab === "proposals" && (
        <section className="space-y-5">
          {isLocked && finalLineup.length > 0 ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-ochre-500/40 bg-gradient-to-r from-ochre-50 via-surface to-forest-50 p-4 sm:p-5 shadow-xs">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ochre-500 text-white shadow-xs">
                  <Trophy className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-ochre-700">
                    {acceptedProposals.length > 0
                      ? "¡Mesa definida!"
                      : "¡Mesa definida por votación!"}
                  </span>
                  <h2 className="font-[var(--font-display)] text-lg sm:text-xl font-bold text-ink">
                    {finalLineup.map((w) => w.game.name).join(" · ")}
                  </h2>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Cuando terminen la partida, registrala para sumar al
                    historial y tabla de victorias del grupo.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  isAuthenticated
                    ? handleLogWinnerPlay(finalLineup[0]?.game.id)
                    : openAuthModal("signin")
                }
                className={`shrink-0 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4.5 text-sm font-bold shadow-xs transition ${
                  isAuthenticated
                    ? "bg-terracotta-500 text-white hover:bg-terracotta-600"
                    : "border border-border-strong bg-surface text-ink-muted hover:bg-canvas-subtle"
                }`}
              >
                {isAuthenticated ? (
                  <Dices className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Lock className="h-4 w-4" aria-hidden="true" />
                )}
                {isAuthenticated
                  ? "Registrar partida jugada"
                  : "Iniciá sesión para registrar"}
              </button>
            </div>
          ) : !isLocked && !isClosed ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-xs">
              <div className="flex items-center gap-2.5 text-sm">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  {session.votingMode === "ranked_top3" ? (
                    <p className="font-semibold text-ink">
                      Modo Top 3 Rankeado ·{" "}
                      <span className="text-forest-700 font-bold num-tabular">
                        1° = 3 pts · 2° = 2 pts · 3° = 1 pt
                      </span>
                      {lockedRanks.size > 0 && (
                        <span className="ml-1.5 text-xs font-semibold text-ink-subtle num-tabular">
                          (ya usado en confirmados:{" "}
                          {Array.from(lockedRanks)
                            .sort((a, b) => a - b)
                            .map((r) => `${r}°`)
                            .join(", ")}
                          )
                        </span>
                      )}
                    </p>
                  ) : session.votingMode === "single_choice" ? (
                    <p className="font-semibold text-ink">
                      Voto simple ·{" "}
                      <span className="text-forest-700 font-bold">
                        {hasLockedSingleVote
                          ? "Tu voto ya se usó en un juego confirmado"
                          : votesRemaining === 1
                            ? "Tenés 1 voto disponible"
                            : "Ya elegiste tu favorito (podés cambiarlo)"}
                      </span>
                    </p>
                  ) : (
                    <p className="font-semibold text-ink">
                      Multi-voto ·{" "}
                      <span className="text-forest-700 font-bold num-tabular">
                        Te quedan {votesRemaining} de {session.maxVotesPerUser}{" "}
                        votos
                      </span>
                      {lockedVotesCount > 0 && (
                        <span className="ml-1.5 text-xs font-semibold text-ink-subtle num-tabular">
                          ({lockedVotesCount}{" "}
                          {lockedVotesCount === 1
                            ? "usado en confirmados"
                            : "usados en confirmados"}
                          )
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {maxProposalsPerUser !== null && hasProposalQuotaDetail && (
                  <span
                    className={`inline-flex min-h-9 items-center rounded-xl border px-3 text-xs font-bold num-tabular ${
                      reachedProposalLimit
                        ? "border-ochre-500/40 bg-ochre-50 text-ochre-700"
                        : "border-border bg-canvas-subtle text-ink-muted"
                    }`}
                  >
                    Tus propuestas: {userProposalsCount}/{maxProposalsPerUser}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab("pool")}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-forest-200 bg-forest-50 px-3 text-xs font-bold text-forest-700 hover:bg-forest-100 transition"
                >
                  {reachedProposalLimit ? (
                    <Library className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {reachedProposalLimit
                    ? "Ver pool de juegos"
                    : "Proponer otro juego"}
                </button>
              </div>
            </div>
          ) : null}

          {/* Confirmed / Accepted Lineup */}
          {acceptedProposals.length > 0 && (
            <div className="rounded-3xl border border-forest-200 bg-forest-50/55 p-4 sm:p-5 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-forest-600 text-white shadow-xs">
                    <CheckCircle2 className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="font-[var(--font-display)] text-base sm:text-lg font-bold text-forest-900 leading-tight">
                      Confirmados para la mesa ({acceptedProposals.length})
                    </h2>
                    <p className="text-xs text-forest-700 num-tabular">
                      {totalAcceptedMinutes > 0
                        ? `~${totalAcceptedMinutes} min estimados en total`
                        : "Juegos ya confirmados para esta juntada"}
                      {!isLocked && !isClosed && openProposals.length > 0
                        ? " · La votación sigue abierta para el resto"
                        : ""}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                {acceptedProposals.map((proposal) => (
                  <article
                    key={proposal.id}
                    className="rounded-2xl border border-forest-200/90 bg-surface p-3.5 sm:p-4 shadow-xs"
                  >
                    <div className="flex flex-col sm:flex-row gap-3.5">
                      <div className="relative sm:w-32 aspect-[16/10] sm:aspect-[4/3] shrink-0 overflow-hidden rounded-xl bg-canvas-subtle">
                        <img
                          src={proposal.game.imageUrl}
                          alt={`Portada de ${proposal.game.name}`}
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-forest-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-xs">
                          <CheckCircle2
                            className="h-3 w-3"
                            aria-hidden="true"
                          />
                          Confirmado
                        </span>
                      </div>

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <button
                              type="button"
                              onClick={() => setSelectedGame(proposal.game)}
                              className="text-left font-[var(--font-display)] text-base sm:text-lg font-bold text-ink hover:text-forest-600 transition-colors"
                            >
                              {proposal.game.name}
                            </button>
                            <p className="text-xs text-ink-subtle">
                              Propuesto por{" "}
                              <strong className="text-ink-muted">
                                {proposal.proposedBy.displayName}
                              </strong>
                              {proposal.acceptedBy && (
                                <>
                                  {" "}
                                  · Confirmado por{" "}
                                  <strong className="text-forest-700">
                                    {proposal.acceptedBy.displayName}
                                  </strong>
                                </>
                              )}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {proposal.userVoted && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-terracotta-200 bg-terracotta-50 px-2.5 py-0.5 text-[11px] font-bold text-terracotta-700 num-tabular">
                                <ThumbsUp
                                  className="h-3 w-3 fill-terracotta-500 text-terracotta-500"
                                  aria-hidden="true"
                                />
                                {session.votingMode === "ranked_top3" &&
                                proposal.userRank
                                  ? `Tu ${proposal.userRank}°`
                                  : "Tu voto"}
                              </span>
                            )}
                            {proposal.score > 0 && (
                              <span className="inline-flex items-baseline gap-1 rounded-xl bg-forest-50 border border-forest-200/80 px-2.5 py-0.5 num-tabular">
                                <span className="text-sm font-extrabold text-forest-800">
                                  {proposal.score}
                                </span>
                                <span className="text-[11px] font-semibold text-forest-700">
                                  {session.votingMode === "ranked_top3"
                                    ? "pts"
                                    : proposal.voteCount === 1
                                      ? "voto"
                                      : "votos"}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <PlayerCountBadge
                            minPlayers={proposal.game.minPlayers}
                            maxPlayers={proposal.game.maxPlayers}
                            bestPlayers={proposal.game.bestPlayers}
                            targetPlayers={confirmedCount}
                          />
                          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-canvas-subtle px-2 py-0.5 text-[11px] font-semibold text-ink-muted num-tabular">
                            <Clock
                              className="h-3 w-3 opacity-75"
                              aria-hidden="true"
                            />
                            {proposal.game.playingTimeMinutes} min
                          </span>
                          <WeightIndicator weight={proposal.game.weight} />
                        </div>

                        {proposal.note && (
                          <div className="flex items-start gap-2 rounded-xl bg-canvas px-3 py-1.5 text-xs text-ink-muted border border-border/70">
                            <MessageSquareQuote
                              className="h-3.5 w-3.5 mt-0.5 shrink-0 text-terracotta-500"
                              aria-hidden="true"
                            />
                            <p className="italic">“{proposal.note}”</p>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <OwnerAvatarStack
                            owners={proposal.owners}
                            size="sm"
                          />

                          <div className="flex flex-wrap items-center gap-2">
                            {canAcceptOrRevert && (
                              <button
                                type="button"
                                disabled={busyAction}
                                onClick={() =>
                                  void runSessionAction(
                                    () =>
                                      updateProposalStatus(
                                        session.id,
                                        proposal.id,
                                        "open",
                                      ),
                                    true,
                                  )
                                }
                                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border bg-canvas px-3 text-xs font-semibold text-ink-muted hover:border-border-strong hover:text-ink disabled:opacity-60 transition"
                              >
                                <RotateCcw
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                Volver a votación
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                isAuthenticated
                                  ? handleLogWinnerPlay(proposal.game.id)
                                  : openAuthModal("signin")
                              }
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-forest-200 bg-forest-50 px-3 text-xs font-bold text-forest-800 hover:bg-forest-100 transition"
                            >
                              {isAuthenticated ? (
                                <Dices
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Lock
                                  className="h-3.5 w-3.5 text-ink-subtle"
                                  aria-hidden="true"
                                />
                              )}
                              Registrar partida
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {/* Open Proposals in Voting */}
          {session.proposals.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-strong bg-surface/70 px-6 py-12 text-center space-y-3">
              <p className="font-[var(--font-display)] text-xl font-bold text-ink">
                Todavía no hay juegos propuestos
              </p>
              <p className="text-sm text-ink-muted max-w-md mx-auto">
                Entrá al <strong>Pool de Asistentes</strong> para ver todos los
                juegos que llevan los {confirmedCount} confirmados y postular
                tus favoritos.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("pool")}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-forest-600 px-5 text-sm font-bold text-white hover:bg-forest-700 transition"
              >
                <Library className="h-4 w-4" aria-hidden="true" />
                Explorar Pool de Asistentes
              </button>
            </div>
          ) : openProposals.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-strong bg-surface/70 px-6 py-8 text-center space-y-2.5">
              <p className="font-[var(--font-display)] text-lg font-bold text-ink">
                Todos los juegos propuestos ya están confirmados
              </p>
              {!isLocked && !isClosed && !reachedProposalLimit && (
                <>
                  <p className="text-xs sm:text-sm text-ink-muted max-w-md mx-auto">
                    Si quieren sumar otro juego (un filler o segunda partida),
                    podés proponerlo desde el Pool de Asistentes.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("pool")}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-forest-600 px-4 text-xs font-bold text-white hover:bg-forest-700 transition"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Proponer otro juego
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {acceptedProposals.length > 0 && (
                <div className="flex items-center justify-between pt-1">
                  <h2 className="text-xs font-extrabold uppercase tracking-wider text-ink-subtle">
                    En votación ({openProposals.length})
                  </h2>
                </div>
              )}

              {openProposals.map((proposal, index) => {
                const isWinner =
                  topOpenScore > 0 && proposal.score === topOpenScore;
                const progressPct = Math.round(
                  (proposal.score / maxOpenScore) * 100,
                );
                const cannotAddVote =
                  (!proposal.userVoted &&
                    session.votingMode === "multi_vote" &&
                    votesRemaining === 0) ||
                  hasLockedSingleVote;
                const canRemoveProposal =
                  !isLocked &&
                  !isClosed &&
                  (proposal.proposedBy.id === currentUser.id || canManage);

                return (
                  <article
                    key={proposal.id}
                    className={`rounded-2xl border bg-surface p-4 sm:p-5 transition shadow-[var(--shadow-card)] ${
                      isLocked && acceptedProposals.length === 0 && isWinner
                        ? "border-ochre-500 ring-2 ring-ochre-500/20"
                        : proposal.userVoted
                          ? "border-forest-500/60"
                          : "border-border"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="relative sm:w-40 aspect-[16/10] sm:aspect-[4/3] shrink-0 overflow-hidden rounded-xl bg-canvas-subtle">
                        <img
                          src={proposal.game.imageUrl}
                          alt={`Portada de ${proposal.game.name}`}
                          className="h-full w-full object-cover"
                        />
                        <span
                          className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-extrabold shadow-xs num-tabular ${
                            index === 0 && proposal.score > 0
                              ? "bg-ochre-500 text-white"
                              : "bg-surface/92 text-ink"
                          }`}
                        >
                          {index === 0 && proposal.score > 0 && (
                            <Crown className="h-3 w-3" aria-hidden="true" />
                          )}
                          #{index + 1}
                        </span>
                      </div>

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
                              Propuesto por{" "}
                              <strong className="text-ink-muted">
                                {proposal.proposedBy.displayName}
                              </strong>
                            </p>
                          </div>

                          <div className="text-right">
                            <span className="inline-flex items-baseline gap-1 rounded-xl bg-canvas-subtle px-3 py-1 num-tabular">
                              <span className="text-lg font-extrabold text-ink">
                                {proposal.score}
                              </span>
                              <span className="text-xs font-semibold text-ink-muted">
                                {session.votingMode === "ranked_top3"
                                  ? "pts"
                                  : proposal.voteCount === 1
                                    ? "voto"
                                    : "votos"}
                              </span>
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <PlayerCountBadge
                            minPlayers={proposal.game.minPlayers}
                            maxPlayers={proposal.game.maxPlayers}
                            bestPlayers={proposal.game.bestPlayers}
                            targetPlayers={confirmedCount}
                          />
                          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-canvas-subtle px-2 py-0.5 text-[11px] font-semibold text-ink-muted num-tabular">
                            <Clock
                              className="h-3 w-3 opacity-75"
                              aria-hidden="true"
                            />
                            {proposal.game.playingTimeMinutes} min
                          </span>
                          <WeightIndicator weight={proposal.game.weight} />
                        </div>

                        {proposal.note && (
                          <div className="flex items-start gap-2 rounded-xl bg-canvas px-3 py-2 text-xs text-ink-muted border border-border/70">
                            <MessageSquareQuote
                              className="h-3.5 w-3.5 mt-0.5 shrink-0 text-terracotta-500"
                              aria-hidden="true"
                            />
                            <p className="italic">“{proposal.note}”</p>
                          </div>
                        )}

                        <div
                          className="h-2 w-full overflow-hidden rounded-full bg-canvas-subtle"
                          aria-hidden="true"
                        >
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isWinner ? "bg-terracotta-500" : "bg-forest-500"
                            }`}
                            style={{
                              width: `${proposal.score > 0 ? Math.max(8, progressPct) : 0}%`,
                            }}
                          />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                          <OwnerAvatarStack
                            owners={proposal.owners}
                            size="sm"
                          />

                          <div className="flex flex-wrap items-center gap-2">
                            {canRemoveProposal && (
                              <button
                                type="button"
                                disabled={busyAction}
                                onClick={() => {
                                  setRemoveProposalError(null);
                                  setProposalToRemoveId(proposal.id);
                                }}
                                aria-label={`Quitar ${proposal.game.name} de la votación`}
                                title="Quitar de la votación y devolver votos"
                                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-canvas px-3 text-xs font-semibold text-ink-muted hover:border-terracotta-200 hover:bg-terracotta-50 hover:text-terracotta-700 disabled:opacity-60 transition"
                              >
                                <Trash2
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                Quitar
                              </button>
                            )}

                            {canAcceptOrRevert && (
                              <button
                                type="button"
                                disabled={busyAction}
                                onClick={() =>
                                  void runSessionAction(
                                    () =>
                                      updateProposalStatus(
                                        session.id,
                                        proposal.id,
                                        "accepted",
                                      ),
                                    true,
                                  )
                                }
                                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-forest-200 bg-forest-50 px-3 text-xs font-bold text-forest-800 hover:bg-forest-100 disabled:opacity-60 transition"
                              >
                                <CheckCircle2
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                Aceptar juego
                              </button>
                            )}

                            {isLocked || isClosed ? (
                              <button
                                type="button"
                                onClick={() =>
                                  isAuthenticated
                                    ? handleLogWinnerPlay(proposal.game.id)
                                    : openAuthModal("signin")
                                }
                                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-canvas px-3.5 text-xs font-bold text-ink hover:border-forest-600 hover:text-forest-700 transition"
                              >
                                {isAuthenticated ? (
                                  <Dices
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Lock
                                    className="h-3.5 w-3.5 text-ink-subtle"
                                    aria-hidden="true"
                                  />
                                )}
                                Registrar partida
                              </button>
                            ) : session.votingMode === "ranked_top3" ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-bold text-ink-subtle mr-1">
                                  Tu puesto:
                                </span>
                                {[1, 2, 3].map((rank) => {
                                  const isSelected =
                                    proposal.userVoted &&
                                    proposal.userRank === rank;
                                  const isRankLocked = lockedRanks.has(rank);
                                  return (
                                    <button
                                      key={rank}
                                      type="button"
                                      disabled={busyAction || isRankLocked}
                                      title={
                                        isRankLocked
                                          ? `Tu puesto ${rank}° ya se usó en un juego confirmado`
                                          : undefined
                                      }
                                      onClick={() =>
                                        handleVote(proposal.id, rank)
                                      }
                                      className={`inline-flex min-h-9 min-w-11 items-center justify-center rounded-xl border px-2.5 text-xs font-extrabold num-tabular transition ${
                                        isSelected
                                          ? "border-terracotta-500 bg-terracotta-500 text-white shadow-xs"
                                          : isRankLocked
                                            ? "border-border bg-canvas-subtle text-ink-subtle opacity-55 cursor-not-allowed line-through"
                                            : "border-border bg-canvas text-ink-muted hover:border-forest-600 hover:text-ink"
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
                                disabled={busyAction || cannotAddVote}
                                onClick={() => handleVote(proposal.id)}
                                className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-xs font-bold transition ${
                                  proposal.userVoted
                                    ? "border border-terracotta-200 bg-terracotta-50 text-terracotta-700 hover:bg-terracotta-100"
                                    : cannotAddVote
                                      ? "bg-canvas-subtle text-ink-subtle cursor-not-allowed"
                                      : "bg-forest-600 text-white hover:bg-forest-700 shadow-xs"
                                }`}
                              >
                                <ThumbsUp
                                  className={`h-3.5 w-3.5 ${
                                    proposal.userVoted
                                      ? "fill-terracotta-500 text-terracotta-500"
                                      : ""
                                  }`}
                                  aria-hidden="true"
                                />
                                {proposal.userVoted
                                  ? "Votado (quitar)"
                                  : hasLockedSingleVote
                                    ? "Voto usado en confirmado"
                                    : cannotAddVote
                                      ? "Sin votos disponibles"
                                      : "Votar este juego"}
                              </button>
                            )}
                          </div>
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

      {/* TAB 2: COMBINED POOL */}
      {activeTab === "pool" && (
        <section className="space-y-4">
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
                    : "Mostrando toda la colección combinada sin restringir por cantidad de asistentes."}
                </p>
                {maxProposalsPerUser !== null && hasProposalQuotaDetail && (
                  <p
                    className={`mt-1 text-xs font-semibold num-tabular ${
                      reachedProposalLimit
                        ? "text-terracotta-700"
                        : "text-forest-700"
                    }`}
                  >
                    {reachedProposalLimit
                      ? myOpenProposalsCount > 0
                        ? `Alcanzaste tu límite de ${maxProposalsPerUser} ${maxProposalsPerUser === 1 ? "propuesta" : "propuestas"} en esta juntada. Podés quitar alguna propuesta abierta para proponer otro juego.`
                        : `Alcanzaste tu límite de ${maxProposalsPerUser} ${maxProposalsPerUser === 1 ? "propuesta" : "propuestas"} en esta juntada (tus propuestas ya están confirmadas).`
                      : `Podés proponer ${proposalsRemaining} de ${maxProposalsPerUser} ${maxProposalsPerUser === 1 ? "juego" : "juegos"} en esta juntada.`}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={smartPlayerFilter}
              onClick={() => setSmartPlayerFilter((prev) => !prev)}
              className={`self-start sm:self-center inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-xs font-bold transition ${
                smartPlayerFilter
                  ? "border-forest-600 bg-surface text-forest-700 shadow-xs"
                  : "border-border bg-surface/70 text-ink-muted"
              }`}
            >
              <Sparkles
                className="h-3.5 w-3.5 text-ochre-500"
                aria-hidden="true"
              />
              <span className="num-tabular">
                Compatibles con {confirmedCount} jug.
              </span>
              <span
                className={`inline-flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${
                  smartPlayerFilter ? "bg-forest-600" : "bg-canvas-deep"
                }`}
              >
                <span
                  className={`h-3 w-3 rounded-full bg-white transition-transform ${
                    smartPlayerFilter ? "translate-x-3" : "translate-x-0"
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
                No hay juegos compatibles en el pool
              </p>
              <p className="text-sm text-ink-muted">
                {sessionPool.length === 0
                  ? "Sincronizá tu colección de BGG en Mi Ludoteca para que aparezcan juegos aquí."
                  : `Probá desactivar el filtro de ${confirmedCount} jugadores o limpiar las mecánicas.`}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredPool.map((item) => {
                const liveProposalStatus = hasProposalQuotaDetail
                  ? (proposalStatusByGameId.get(item.id) ?? null)
                  : (item.proposalStatus ?? null);
                const liveIsProposed = hasProposalQuotaDetail
                  ? liveProposalStatus !== null
                  : item.isProposed;

                return (
                <GameCard
                  key={item.id}
                  game={item}
                  owners={item.owners}
                  targetPlayers={confirmedCount}
                  onSelect={setSelectedGame}
                  actionSlot={
                    liveProposalStatus === "accepted" ? (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-forest-300 bg-forest-100/80 px-3 py-2 text-xs font-bold text-forest-700">
                        <span className="inline-flex items-center gap-1.5">
                          <CheckCircle2
                            className="h-3.5 w-3.5 text-forest-700"
                            aria-hidden="true"
                          />
                          Confirmado
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveTab("proposals")}
                          className="underline hover:text-forest-900"
                        >
                          Ver mesa
                        </button>
                      </div>
                    ) : liveIsProposed ? (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-forest-200 bg-forest-50 px-3 py-2 text-xs font-bold text-forest-700">
                        <span className="inline-flex items-center gap-1.5">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          Ya propuesto
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveTab("proposals")}
                          className="underline hover:text-forest-900"
                        >
                          Ver votos
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={
                          isLocked ||
                          isClosed ||
                          busyAction ||
                          reachedProposalLimit
                        }
                        title={
                          reachedProposalLimit && maxProposalsPerUser !== null
                            ? `Alcanzaste el límite de ${maxProposalsPerUser} ${maxProposalsPerUser === 1 ? "propuesta" : "propuestas"} por integrante`
                            : undefined
                        }
                        onClick={() => {
                          setProposeError(null);
                          setProposingGame(item);
                          setProposalNote("");
                        }}
                        className="w-full inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-forest-600 px-3 text-xs font-bold text-white shadow-xs hover:bg-forest-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        {reachedProposalLimit ? (
                          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {reachedProposalLimit && maxProposalsPerUser !== null
                          ? `Límite alcanzado (${userProposalsCount}/${maxProposalsPerUser})`
                          : "Proponer para votar"}
                      </button>
                    )
                  }
                />
                );
              })}
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
            disabled={busyAction}
            onClick={() => {
              setProposingGame(null);
              setProposeError(null);
            }}
            className="fixed inset-0 bg-ink/40 backdrop-blur-[2px]"
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleConfirmProposal(proposingGame, proposalNote);
            }}
            className="relative z-10 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-floating)] space-y-4"
          >
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

            {proposeError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-terracotta-200 bg-terracotta-50 px-3 py-2 text-xs font-semibold text-terracotta-700"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{proposeError}</span>
              </div>
            )}

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
                disabled={busyAction}
                onClick={() => {
                  setProposingGame(null);
                  setProposeError(null);
                }}
                className="min-h-10 rounded-xl border border-border px-4 text-xs font-semibold text-ink-muted hover:bg-canvas-subtle disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busyAction}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-forest-600 px-4 text-xs font-bold text-white hover:bg-forest-700 disabled:opacity-70"
              >
                {busyAction && (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                )}
                Confirmar propuesta
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirm Remove Proposal Modal */}
      <dialog
        ref={removeDialogRef}
        aria-labelledby="remove-proposal-title"
        aria-describedby="remove-proposal-description"
        onCancel={(e) => {
          e.preventDefault();
          closeRemoveProposalModal();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            closeRemoveProposalModal();
          }
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-border bg-surface p-0 text-ink shadow-[var(--shadow-floating)]"
      >
        {proposalToRemove && (
          <div className="p-5 space-y-4">
            <div className="flex items-start gap-3">
              <img
                src={proposalToRemove.game.thumbnailUrl}
                alt=""
                className="h-12 w-12 shrink-0 rounded-xl object-cover border border-border bg-canvas-subtle"
              />
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-terracotta-600">
                  Quitar de la votación
                </span>
                <h3
                  id="remove-proposal-title"
                  className="font-[var(--font-display)] text-lg font-bold text-ink"
                >
                  ¿Quitar “{proposalToRemove.game.name}”?
                </h3>
              </div>
              <button
                type="button"
                disabled={removingProposal}
                onClick={closeRemoveProposalModal}
                aria-label="Cerrar"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-canvas-subtle disabled:opacity-50"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {removeProposalError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-terracotta-200 bg-terracotta-50 px-3 py-2 text-xs font-semibold text-terracotta-700"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{removeProposalError}</span>
              </div>
            )}

            <div id="remove-proposal-description">
              {proposalToRemove.voteCount > 0 ? (
                <div className="rounded-xl border border-ochre-100 bg-ochre-50/80 px-3.5 py-2.5 text-xs text-ochre-700 leading-relaxed">
                  Este juego tiene{" "}
                  <strong className="num-tabular">
                    {proposalToRemove.voteCount}{" "}
                    {proposalToRemove.voteCount === 1 ? "voto" : "votos"}
                  </strong>
                  . Al quitarlo de la votación, se devolverán automáticamente
                  los votos disponibles a quienes lo votaron.
                </div>
              ) : (
                <p className="text-sm text-ink-muted">
                  El juego dejará de aparecer en la votación de esta juntada y
                  podrá volver a proponerse desde el pool si lo desean.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                autoFocus
                disabled={removingProposal}
                onClick={closeRemoveProposalModal}
                className="min-h-10 rounded-xl border border-border bg-surface px-4 text-xs font-semibold text-ink-muted hover:bg-canvas-subtle disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={removingProposal}
                onClick={() => void handleConfirmRemoveProposal(proposalToRemove)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-terracotta-600 px-4 text-xs font-bold text-white hover:bg-terracotta-700 disabled:opacity-70 transition"
              >
                {removingProposal ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Sí, quitar juego
              </button>
            </div>
          </div>
        )}
      </dialog>

      {/* Detail Drawer */}
      <GameDetailDrawer
        game={selectedGame}
        owners={selectedGameOwners}
        isProposed={
          selectedGame
            ? session.proposals.some((p) => p.game.id === selectedGame.id)
            : false
        }
        proposeDisabled={reachedProposalLimit}
        proposeLabel={
          reachedProposalLimit && maxProposalsPerUser !== null
            ? `Límite alcanzado (${userProposalsCount}/${maxProposalsPerUser})`
            : "Proponer para votar"
        }
        onPropose={
          !isLocked && !isClosed
            ? (game) => {
                if (reachedProposalLimit) return;
                setSelectedGame(null);
                setProposeError(null);
                setProposingGame(game);
              }
            : undefined
        }
        onClose={() => setSelectedGame(null)}
      />
    </div>
  );
}
