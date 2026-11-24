import {
  AlertCircle,
  ArrowUpDown,
  Check,
  CheckCircle2,
  Clock,
  Dices,
  Library,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import {
  bggApi,
  type BggSearchResult,
  type BggSyncQuota,
} from "../api/endpoints";
import { GuestLockedView } from "../components/auth/GuestLockedView";
import { GameCard } from "../components/game/GameCard";
import { GameDetailDrawer } from "../components/game/GameDetailDrawer";
import { FilterChipBar } from "../components/ui/FilterChipBar";
import { PageLoadingSkeleton } from "../components/ui/PageLoadingSkeleton";
import { useAppState } from "../context/AppStateContext";
import { useAuth } from "../context/AuthContext";
import type { Game, GameFilterState, UserGameStatus } from "../types/domain";
import { DEFAULT_GAME_FILTERS, filterGames } from "../utils/filterGames";

type SyncPhase = "idle" | "syncing" | "done";
type SortOption = "name" | "rating" | "weight" | "time";

const STATUS_TABS: { id: "all" | UserGameStatus; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "owned", label: "Lo tengo" },
  { id: "want_to_play", label: "Quiero jugar" },
  { id: "wishlist", label: "Wishlist" },
];

function BggSearchThumbnail({
  src,
  name,
}: {
  src: string | null;
  name: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src && failedSrc !== src);

  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border bg-canvas-subtle flex items-center justify-center">
      {showImage ? (
        <img
          src={src!}
          alt={`Portada de ${name}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
          className="h-full w-full object-cover"
        />
      ) : (
        <Dices className="h-5 w-5 text-ink-subtle/70" aria-hidden="true" />
      )}
    </div>
  );
}

export function LibraryPage() {
  const { isAuthenticated, backendUser, loading: authLoading } = useAuth();
  const {
    currentUser,
    isBootstrapping,
    library,
    sessions,
    lastBggSyncLabel,
    syncWithBgg,
    searchBgg,
    importBggGame,
    updateLibraryItem,
    removeLibraryItem,
    proposeGame,
  } = useAppState();

  const [statusFilter, setStatusFilter] = useState<"all" | UserGameStatus>(
    "all",
  );
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const [filters, setFilters] = useState<GameFilterState>({
    ...DEFAULT_GAME_FILTERS,
    includeExpansions: true,
  });

  // BGG Sync state
  const [bggUsernameInput, setBggUsernameInput] = useState(
    currentUser.bggUsername ?? "",
  );
  const [editingBggUser, setEditingBggUser] = useState(
    !currentUser.bggUsername,
  );
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [bggQuota, setBggQuota] = useState<BggSyncQuota | null>(null);
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    sessionId?: string;
  } | null>(null);

  // Drawer & BGG manual search modal
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [gameToRemove, setGameToRemove] = useState<Game | null>(null);
  const [removingGame, setRemovingGame] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [bggQuery, setBggQuery] = useState("");
  const [bggResults, setBggResults] = useState<BggSearchResult[]>([]);
  const [bggSearching, setBggSearching] = useState(false);
  const [bggSearchError, setBggSearchError] = useState<string | null>(null);
  const [importingBggId, setImportingBggId] = useState<number | null>(null);

  useEffect(() => {
    if (currentUser.bggUsername) {
      setBggUsernameInput(currentUser.bggUsername);
      setEditingBggUser(false);
    }
  }, [currentUser.bggUsername]);

  useEffect(() => {
    if (!isAuthenticated || !backendUser) {
      setBggQuota(null);
      return;
    }
    let cancelled = false;
    void bggApi
      .getQuota()
      .then(({ quota }) => {
        if (!cancelled) setBggQuota(quota);
      })
      .catch(() => {
        // Ignore quota fetch errors when backend is offline
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, backendUser, lastBggSyncLabel]);

  useEffect(() => {
    if (!addModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAddModalOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [addModalOpen]);

  useEffect(() => {
    if (!gameToRemove || removingGame) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGameToRemove(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [gameToRemove, removingGame]);

  const activeVotingSession =
    sessions.find((s) => s.status === "voting") ?? sessions[0];

  const availableMechanics = useMemo(
    () =>
      Array.from(new Set(library.flatMap((g) => g.mechanics))).sort((a, b) =>
        a.localeCompare(b, "es"),
      ),
    [library],
  );

  const statusCounts = useMemo(
    () => ({
      all: library.length,
      owned: library.filter((g) => g.status === "owned").length,
      want_to_play: library.filter((g) => g.status === "want_to_play").length,
      wishlist: library.filter((g) => g.status === "wishlist").length,
      previously_owned: library.filter((g) => g.status === "previously_owned")
        .length,
    }),
    [library],
  );

  const filteredGames = useMemo(() => {
    const byStatus =
      statusFilter === "all"
        ? library
        : library.filter((g) => g.status === statusFilter);
    const matched = filterGames(byStatus, filters);

    return [...matched].sort((a, b) => {
      switch (sortBy) {
        case "rating":
          return b.bggRating - a.bggRating;
        case "weight":
          return b.weight - a.weight;
        case "time":
          return a.playingTimeMinutes - b.playingTimeMinutes;
        default:
          return a.name.localeCompare(b.name, "es");
      }
    });
  }, [library, statusFilter, filters, sortBy]);

  const selectedEntry = selectedGameId
    ? (library.find((g) => g.id === selectedGameId) ?? null)
    : null;

  if (!authLoading && !isAuthenticated) {
    return (
      <GuestLockedView
        eyebrow="Tu colección personal"
        pageTitle="Mi Ludoteca"
        pageSubtitle="Importá tus juegos desde BoardGameGeek y combinalos con los de tus grupos."
        icon={Library}
        lockTitle="Tu ludoteca requiere una cuenta"
        lockDescription="En modo invitado no es posible importar ni gestionar tu colección de juegos. Creá tu cuenta gratis para sincronizar con BGG y sumar tus cajas a las juntadas."
        benefits={[
          "Sincronizá automáticamente tu colección completa de BoardGameGeek.",
          "Buscá e importá juegos individuales y clasificá lo que tenés o querés jugar.",
          "Aportá tus juegos al pool combinado de tus grupos en cada juntada.",
        ]}
      />
    );
  }

  const handleBggSync = async (overrideUsername?: string) => {
    const targetUsername = (overrideUsername ?? bggUsernameInput).trim();
    if (!targetUsername) {
      setEditingBggUser(true);
      setSyncError(
        "Ingresá tu nombre de usuario de BoardGameGeek para sincronizar.",
      );
      return;
    }

    setSyncError(null);
    setSyncPhase("syncing");
    try {
      const summary = await syncWithBgg(targetUsername);
      if (summary.quota) {
        setBggQuota(summary.quota);
      }
      setEditingBggUser(false);
      setSyncPhase("done");
      setToastMessage({
        text: `¡Sincronizado @${summary.bggUsername}! ${summary.totalInBgg} juegos en BGG (${summary.addedToLibrary} nuevos, ${summary.metadataRefreshed} fichas actualizadas).`,
      });
      setTimeout(() => setSyncPhase("idle"), 3000);
      setTimeout(() => setToastMessage(null), 6000);
    } catch (err) {
      setSyncPhase("idle");
      setSyncError(
        err instanceof ApiError
          ? err.message
          : "Error al sincronizar con BoardGameGeek.",
      );
      if (err instanceof ApiError && err.status === 429) {
        void bggApi
          .getQuota()
          .then(({ quota }) => setBggQuota(quota))
          .catch(() => {});
      }
    }
  };

  const handleBggSearchSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (bggQuery.trim().length < 2) return;
    setBggSearching(true);
    setBggSearchError(null);
    try {
      const results = await searchBgg(bggQuery.trim());
      setBggResults(results);
    } catch (err) {
      setBggSearchError(
        err instanceof ApiError ? err.message : "No se pudo buscar en BGG.",
      );
    } finally {
      setBggSearching(false);
    }
  };

  const handleImportGame = async (
    bggId: number,
    status: UserGameStatus = "owned",
  ) => {
    setImportingBggId(bggId);
    setBggSearchError(null);
    try {
      const imported = await importBggGame(bggId, status);
      setBggResults((prev) =>
        prev.map((item) =>
          item.bggId === bggId ? { ...item, inLibraryStatus: status } : item,
        ),
      );
      setToastMessage({ text: `¡"${imported.name}" agregado a tu ludoteca!` });
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err) {
      setBggSearchError(
        err instanceof ApiError ? err.message : "No se pudo importar el juego.",
      );
    } finally {
      setImportingBggId(null);
    }
  };

  const handleProposeFromLibrary = async (game: Game) => {
    if (!activeVotingSession) return;
    try {
      await proposeGame(activeVotingSession.id, game);
      setSelectedGameId(null);
      setToastMessage({
        text: `¡${game.name} propuesto en "${activeVotingSession.title}"!`,
        sessionId: activeVotingSession.id,
      });
      setTimeout(() => setToastMessage(null), 4500);
    } catch (err) {
      setSyncError(
        err instanceof ApiError ? err.message : "No se pudo proponer el juego.",
      );
    }
  };

  const handleRemoveFromLibrary = async (game: Game) => {
    setRemovingGame(true);
    setSyncError(null);
    try {
      await removeLibraryItem(game.id);
      setBggResults((prev) =>
        prev.map((item) =>
          item.bggId === game.bggId ? { ...item, inLibraryStatus: null } : item,
        ),
      );
      if (selectedGameId === game.id) {
        setSelectedGameId(null);
      }
      setGameToRemove(null);
      setToastMessage({
        text: `Se quitó "${game.name}" de tu ludoteca.`,
      });
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err) {
      setSyncError(
        err instanceof ApiError
          ? err.message
          : "No se pudo quitar el juego de tu ludoteca.",
      );
    } finally {
      setRemovingGame(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + BGG Sync Controls */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {currentUser.bggUsername && !editingBggUser ? (
              <button
                type="button"
                onClick={() => setEditingBggUser(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-forest-200 bg-forest-50 px-3 py-0.5 text-xs font-bold text-forest-700 hover:bg-forest-100 transition"
                title="Cambiar usuario de BGG"
              >
                <span>BGG @{currentUser.bggUsername}</span>
                <Pencil className="h-3 w-3 opacity-70" aria-hidden="true" />
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-ochre-100 bg-ochre-50 px-3 py-0.5 text-xs font-bold text-ochre-700">
                Vinculá tu cuenta de BGG
              </span>
            )}
            <span className="text-xs font-medium text-ink-subtle">
              Última sincronización:{" "}
              <strong className="text-ink-muted">{lastBggSyncLabel}</strong>
            </span>
            {bggQuota && (
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold num-tabular ${
                  bggQuota.remainingToday === 0
                    ? "border-terracotta-200 bg-terracotta-50 text-terracotta-700"
                    : "border-border bg-canvas-subtle text-ink-muted"
                }`}
                title="Para cuidar la API de BoardGameGeek, podés actualizar tu biblioteca hasta 2 veces por día."
              >
                {bggQuota.remainingToday}/{bggQuota.dailyLimit}{" "}
                {bggQuota.remainingToday === 1
                  ? "actualización hoy"
                  : "actualizaciones hoy"}
              </span>
            )}
          </div>
          <h1 className="font-[var(--font-display)] text-3xl sm:text-4xl font-bold tracking-tight text-ink">
            Mi Ludoteca
          </h1>
          <p className="text-sm text-ink-muted">
            Tu colección sincronizada con BoardGameGeek, lista para cruzar en
            las juntadas.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setAddModalOpen(true);
              setBggSearchError(null);
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-bold text-ink hover:border-border-strong hover:bg-canvas-subtle transition"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Buscar en BGG
          </button>

          <button
            type="button"
            onClick={() => void handleBggSync()}
            disabled={
              syncPhase === "syncing" ||
              (bggQuota !== null && bggQuota.remainingToday === 0)
            }
            title={
              bggQuota && bggQuota.remainingToday === 0
                ? "Alcanzaste el límite de 2 actualizaciones de ludoteca por día."
                : undefined
            }
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4.5 text-sm font-bold shadow-xs transition ${
              syncPhase === "done"
                ? "bg-forest-500 text-white"
                : bggQuota && bggQuota.remainingToday === 0
                  ? "border border-border bg-canvas-subtle text-ink-subtle cursor-not-allowed"
                  : "bg-forest-600 text-white hover:bg-forest-700 disabled:opacity-90"
            }`}
          >
            {syncPhase === "syncing" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : syncPhase === "done" ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            <span>
              {syncPhase === "syncing"
                ? "Sincronizando con BGG…"
                : syncPhase === "done"
                  ? "¡Sincronizado!"
                  : bggQuota && bggQuota.remainingToday === 0
                    ? "Límite diario alcanzado (2/2)"
                    : "Sincronizar con BGG"}
            </span>
          </button>
        </div>
      </header>

      {/* Inline BGG Username Form when editing or unlinked */}
      {editingBggUser && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleBggSync(bggUsernameInput);
          }}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 rounded-2xl border border-forest-200 bg-forest-50/75 p-4"
        >
          <div className="flex-1 min-w-0">
            <label
              htmlFor="bgg-username-inline"
              className="block text-xs font-bold uppercase tracking-wider text-forest-900 mb-1"
            >
              Usuario de BoardGameGeek
            </label>
            <input
              id="bgg-username-inline"
              type="text"
              required
              value={bggUsernameInput}
              onChange={(e) => setBggUsernameInput(e.target.value)}
              placeholder="Ej. kaoskat"
              className="w-full min-h-10 rounded-xl border border-forest-200 bg-surface px-3.5 text-sm font-semibold text-ink focus:border-forest-600 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2 sm:self-end">
            {currentUser.bggUsername && (
              <button
                type="button"
                onClick={() => {
                  setBggUsernameInput(currentUser.bggUsername ?? "");
                  setEditingBggUser(false);
                }}
                className="min-h-10 rounded-xl border border-border bg-surface px-3.5 text-xs font-semibold text-ink-muted"
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={syncPhase === "syncing"}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-forest-600 px-4 text-xs font-bold text-white hover:bg-forest-700 disabled:opacity-70"
            >
              {syncPhase === "syncing" && (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              )}
              Importar colección
            </button>
          </div>
        </form>
      )}

      {/* BGG Syncing Status */}
      {syncPhase === "syncing" && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-ochre-100 bg-ochre-50/90 px-4 py-3 text-xs font-semibold text-ochre-700"
        >
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin text-ochre-500"
            aria-hidden="true"
          />
          <span>
            Sincronizando la colección de <strong>@{bggUsernameInput}</strong>{" "}
            desde BoardGameGeek… Esto puede tardar unos segundos si tenés muchos
            juegos.
          </span>
        </div>
      )}

      {/* Sync Error */}
      {syncError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-2xl border border-terracotta-200 bg-terracotta-50 px-4 py-3 text-xs font-semibold text-terracotta-700"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {syncError}
          </span>
          <button
            type="button"
            onClick={() => setSyncError(null)}
            aria-label="Cerrar error"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Toast Confirmation */}
      {toastMessage && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-forest-200 bg-forest-50 px-4 py-3 text-sm font-semibold text-forest-900"
        >
          <span className="inline-flex items-center gap-2">
            <Check
              className="h-4 w-4 text-forest-600 shrink-0"
              aria-hidden="true"
            />
            {toastMessage.text}
          </span>
          {toastMessage.sessionId && (
            <Link
              to={`/sessions/${toastMessage.sessionId}`}
              className="text-xs font-bold text-forest-700 underline hover:text-forest-900"
            >
              Ir a la juntada →
            </Link>
          )}
        </div>
      )}

      {/* Loading / Empty Library State */}
      {isBootstrapping ? (
        <PageLoadingSkeleton variant="library" />
      ) : library.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border-strong bg-surface/80 px-6 py-14 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-50 text-forest-700">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="font-[var(--font-display)] text-2xl font-bold text-ink">
              Tu ludoteca está vacía
            </h2>
            <p className="text-sm text-ink-muted max-w-md mx-auto">
              Importá automáticamente todos tus juegos desde{" "}
              <strong>BoardGameGeek</strong> o buscá títulos manualmente para
              empezar a armar el pool del grupo.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setEditingBggUser(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-forest-600 px-5 text-sm font-bold text-white hover:bg-forest-700 transition"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Sincronizar desde BGG
            </button>
            <button
              type="button"
              onClick={() => setAddModalOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-bold text-ink hover:bg-canvas-subtle transition"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              Buscar manualmente
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Status Tabs + Sort Select */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div
              role="tablist"
              aria-label="Filtrar por estado en colección"
              className="flex items-center gap-1.5 overflow-x-auto chip-scroll pb-0.5"
            >
              {STATUS_TABS.map((tab) => {
                const active = statusFilter === tab.id;
                const count = statusCounts[tab.id];
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setStatusFilter(tab.id)}
                    className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold transition ${
                      active
                        ? "border-forest-600 bg-forest-600 text-white shadow-xs"
                        : "border-border bg-surface text-ink-muted hover:border-border-strong hover:text-ink"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.25 text-[10px] num-tabular ${
                        active
                          ? "bg-white/20 text-white"
                          : "bg-canvas-subtle text-ink-subtle"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <label className="inline-flex items-center gap-2 self-start sm:self-auto text-xs font-semibold text-ink-muted">
              <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Ordenar:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="min-h-9 rounded-xl border border-border bg-surface px-2.5 text-xs font-bold text-ink focus:border-forest-600 focus:outline-none"
              >
                <option value="name">Nombre (A–Z)</option>
                <option value="rating">Mejor Rating BGG</option>
                <option value="weight">Mayor Complejidad</option>
                <option value="time">Menor Duración</option>
              </select>
            </label>
          </div>

          {/* Filter Bar */}
          <FilterChipBar
            value={filters}
            onChange={setFilters}
            availableMechanics={availableMechanics}
            resultCount={filteredGames.length}
            totalCount={statusCounts[statusFilter]}
            placeholder="Buscar en tu colección..."
          />

          {/* Game Grid */}
          {filteredGames.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-strong bg-surface/70 px-6 py-12 text-center space-y-2">
              <p className="font-[var(--font-display)] text-lg font-bold text-ink">
                No encontramos juegos con esos filtros
              </p>
              <p className="text-sm text-ink-muted">
                Probá limpiar algún filtro o agregar un título nuevo desde
                BoardGameGeek.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredGames.map((item) => (
                <GameCard
                  key={item.id}
                  game={item}
                  status={item.status}
                  personalRating={item.personalRating}
                  onSelect={(game) => setSelectedGameId(game.id)}
                  headerAction={
                    <button
                      type="button"
                      onClick={() => setGameToRemove(item)}
                      aria-label={`Quitar ${item.name} de mi ludoteca`}
                      title="Quitar de mi ludoteca"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle hover:bg-terracotta-50 hover:text-terracotta-700 transition"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Detail Drawer */}
      <GameDetailDrawer
        game={selectedEntry}
        status={selectedEntry?.status}
        notes={selectedEntry?.notes}
        onUpdateStatus={(gameId, status) => {
          setSyncError(null);
          void updateLibraryItem(gameId, { status }).catch((err) => {
            setSyncError(
              err instanceof ApiError
                ? err.message
                : "No se pudo actualizar el estado del juego. Se restauró el estado anterior.",
            );
          });
        }}
        onUpdateNotes={(gameId, notes) => {
          setSyncError(null);
          void updateLibraryItem(gameId, { notes }).catch((err) => {
            setSyncError(
              err instanceof ApiError
                ? err.message
                : "No se pudieron guardar las notas. Se restauró el estado anterior.",
            );
          });
        }}
        onRemove={
          selectedEntry
            ? () => handleRemoveFromLibrary(selectedEntry)
            : undefined
        }
        isProposed={
          selectedEntry && activeVotingSession
            ? activeVotingSession.proposals.some(
                (p) => p.game.id === selectedEntry.id,
              )
            : false
        }
        proposeLabel={
          activeVotingSession
            ? `Proponer en "${activeVotingSession.title.slice(0, 22)}…"`
            : "Proponer en una juntada"
        }
        onPropose={
          activeVotingSession
            ? (game) => void handleProposeFromLibrary(game)
            : undefined
        }
        onClose={() => setSelectedGameId(null)}
      />

      {/* Confirm Remove From Library Modal */}
      {gameToRemove && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-game-title"
        >
          <button
            type="button"
            aria-label="Cerrar"
            disabled={removingGame}
            onClick={() => setGameToRemove(null)}
            className="fixed inset-0 bg-ink/45 backdrop-blur-[2px]"
          />
          <div className="relative z-10 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-floating)] space-y-4">
            <div className="flex items-start gap-3">
              <img
                src={gameToRemove.thumbnailUrl}
                alt=""
                className="h-12 w-12 shrink-0 rounded-xl object-cover border border-border bg-canvas-subtle"
              />
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-terracotta-600">
                  Quitar de mi ludoteca
                </span>
                <h2
                  id="remove-game-title"
                  className="font-[var(--font-display)] text-lg font-bold text-ink"
                >
                  ¿Eliminar “{gameToRemove.name}”?
                </h2>
              </div>
              <button
                type="button"
                disabled={removingGame}
                onClick={() => setGameToRemove(null)}
                aria-label="Cerrar"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-canvas-subtle"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p className="text-sm text-ink-muted">
              El juego se quitará de tu colección personal y dejará de aparecer
              en el pool de tus próximas juntadas. Si lo necesitás, podés volver
              a importarlo desde BoardGameGeek.
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={removingGame}
                onClick={() => setGameToRemove(null)}
                className="min-h-10 rounded-xl border border-border bg-surface px-4 text-xs font-semibold text-ink-muted hover:bg-canvas-subtle disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={removingGame}
                onClick={() => void handleRemoveFromLibrary(gameToRemove)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-terracotta-600 px-4 text-xs font-bold text-white hover:bg-terracotta-700 disabled:opacity-70 transition"
              >
                {removingGame ? (
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
        </div>
      )}

      {/* Real BGG Search & Import Modal */}
      {addModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-bgg-title"
        >
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setAddModalOpen(false)}
            className="fixed inset-0 bg-ink/45 backdrop-blur-[2px]"
          />
          <div className="relative z-10 flex max-h-[85dvh] w-full sm:max-w-xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border border-border bg-surface shadow-[var(--shadow-floating)]">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-forest-600">
                  BoardGameGeek XML API2
                </span>
                <h2
                  id="add-bgg-title"
                  className="font-[var(--font-display)] text-xl font-bold text-ink"
                >
                  Buscar e importar juego
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                aria-label="Cerrar"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-canvas-subtle"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <form
                onSubmit={(e) => void handleBggSearchSubmit(e)}
                className="flex items-center gap-2"
              >
                <div className="relative flex-1">
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={bggQuery}
                    onChange={(e) => setBggQuery(e.target.value)}
                    placeholder="Ej. Cascadia, Wingspan, Catan..."
                    className="w-full min-h-11 rounded-xl border border-border bg-canvas/70 pl-10 pr-4 text-sm text-ink focus:border-forest-600 focus:bg-surface focus:outline-none"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={bggSearching || bggQuery.trim().length < 2}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-forest-600 px-4 text-xs font-bold text-white hover:bg-forest-700 disabled:opacity-60"
                >
                  {bggSearching ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    "Buscar"
                  )}
                </button>
              </form>

              {bggSearchError && (
                <div className="flex items-center gap-2 rounded-xl border border-terracotta-200 bg-terracotta-50 px-3 py-2 text-xs font-semibold text-terracotta-700">
                  <AlertCircle
                    className="h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{bggSearchError}</span>
                </div>
              )}

              {bggResults.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-muted">
                  {bggSearching
                    ? "Buscando en BoardGameGeek…"
                    : "Escribí el nombre de un juego y tocá Buscar para consultarlo en BGG."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {bggResults.map((item) => {
                    const isImporting = importingBggId === item.bggId;
                    const alreadyInLibrary = Boolean(item.inLibraryStatus);
                    const playersLabel =
                      item.minPlayers && item.maxPlayers
                        ? item.minPlayers === item.maxPlayers
                          ? `${item.minPlayers} jug.`
                          : `${item.minPlayers}–${item.maxPlayers} jug.`
                        : null;
                    return (
                      <li
                        key={item.bggId}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-canvas/50 p-2.5 sm:p-3"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <BggSearchThumbnail
                            src={item.thumbnailUrl}
                            name={item.name}
                          />
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="text-sm font-bold text-ink truncate">
                              {item.name}
                            </p>
                            <p className="text-xs text-ink-subtle num-tabular">
                              {item.yearPublished ?? "Sin año"} · BGG #
                              {item.bggId}
                              {item.isExpansion ? " · Expansión" : ""}
                            </p>
                            {(playersLabel || item.playingTimeMinutes) && (
                              <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] font-medium text-ink-muted num-tabular">
                                {playersLabel && (
                                  <span className="inline-flex items-center gap-1">
                                    <Users
                                      className="h-3 w-3 opacity-70"
                                      aria-hidden="true"
                                    />
                                    {playersLabel}
                                  </span>
                                )}
                                {item.playingTimeMinutes && (
                                  <span className="inline-flex items-center gap-1">
                                    <Clock
                                      className="h-3 w-3 opacity-70"
                                      aria-hidden="true"
                                    />
                                    {item.playingTimeMinutes} min
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {alreadyInLibrary ? (
                          <span className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-forest-200 bg-forest-50 px-3 py-1.5 text-xs font-bold text-forest-700">
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            En ludoteca
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isImporting}
                            onClick={() =>
                              void handleImportGame(item.bggId, "owned")
                            }
                            className="shrink-0 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-forest-600 px-3 text-xs font-bold text-white hover:bg-forest-700 disabled:opacity-70"
                          >
                            {isImporting ? (
                              <Loader2
                                className="h-3.5 w-3.5 animate-spin"
                                aria-hidden="true"
                              />
                            ) : (
                              <Plus
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                            )}
                            Sumar
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
