import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  RefreshCw,
  Server,
  ShieldAlert,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { statusApi, type BackendStatusMetricsResponse } from '../api/endpoints';
import {
  clearClientApiTelemetry,
  getClientApiTelemetrySnapshot,
  subscribeClientApiTelemetry,
} from '../api/telemetry';
import { useAuth } from '../context/AuthContext';

type RouteSortKey = 'p95Ms' | 'count' | 'avgDbQueries' | 'avgPayloadBytes';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ${seconds % 60}s`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function latencyBadgeClass(ms: number): string {
  if (ms >= 1000) return 'border-terracotta-200 bg-terracotta-50 text-terracotta-700';
  if (ms >= 400) return 'border-ochre-100 bg-ochre-50 text-ochre-700';
  return 'border-forest-200 bg-forest-50 text-forest-700';
}

export function StatusMonitorPage() {
  const { isAuthenticated, backendUser, loading: authLoading, openAuthModal } = useAuth();

  const clientCalls = useSyncExternalStore(
    subscribeClientApiTelemetry,
    getClientApiTelemetrySnapshot,
    getClientApiTelemetrySnapshot,
  );

  const [metrics, setMetrics] = useState<BackendStatusMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [forbiddenAccess, setForbiddenAccess] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [sortBy, setSortBy] = useState<RouteSortKey>('p95Ms');
  const fetchSeqRef = useRef(0);

  const fetchMetrics = useCallback(async (fresh = false) => {
    const seq = ++fetchSeqRef.current;
    if (fresh) setRefreshing(true);
    setErrorMsg(null);
    try {
      const data = await statusApi.getMetrics(fresh);
      if (seq !== fetchSeqRef.current) return;
      setMetrics(data);
      setForbiddenAccess(false);
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      if (err instanceof ApiError && err.status === 403) {
        setForbiddenAccess(true);
      } else {
        setErrorMsg(
          err instanceof ApiError
            ? err.message
            : 'No se pudo obtener el estado del backend.',
        );
      }
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !backendUser) {
      setLoading(false);
      return;
    }
    void fetchMetrics(false);
  }, [authLoading, isAuthenticated, backendUser, fetchMetrics]);

  // Auto-refresh every 10s, pausing automatically when browser tab is hidden
  useEffect(() => {
    if (!autoRefresh || !isAuthenticated || !backendUser || forbiddenAccess) {
      return;
    }

    let timer: number | null = null;
    const schedule = () => {
      if (timer !== null) window.clearInterval(timer);
      if (document.visibilityState === 'visible') {
        timer = window.setInterval(() => {
          if (document.visibilityState === 'visible') {
            void fetchMetrics(false);
          }
        }, 10_000);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchMetrics(false);
        schedule();
      } else if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };

    schedule();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [autoRefresh, isAuthenticated, backendUser, forbiddenAccess, fetchMetrics]);

  const sortedRoutes = useMemo(() => {
    if (!metrics) return [];
    return [...metrics.routes].sort((a, b) => b[sortBy] - a[sortBy]);
  }, [metrics, sortBy]);

  if (!authLoading && !isAuthenticated) {
    return (
      <div className="rounded-3xl border border-border bg-surface p-8 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-50 text-forest-700">
          <Activity className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="font-[var(--font-display)] text-2xl font-bold text-ink">
          Monitor de Estado del Backend
        </h1>
        <p className="text-sm text-ink-muted max-w-md mx-auto">
          Iniciá sesión con una cuenta administradora para consultar métricas de
          latencia, base de datos y telemetría en tiempo real.
        </p>
        <button
          type="button"
          onClick={() => openAuthModal('signin')}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-forest-600 px-5 text-sm font-bold text-white hover:bg-forest-700 transition"
        >
          Iniciar sesión
        </button>
      </div>
    );
  }

  if (forbiddenAccess) {
    return (
      <div className="rounded-3xl border border-border bg-surface p-8 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-terracotta-50 text-terracotta-600">
          <ShieldAlert className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="font-[var(--font-display)] text-2xl font-bold text-ink">
          Acceso restringido a administradores
        </h1>
        <p className="text-sm text-ink-muted max-w-lg mx-auto">
          Para consultar las métricas internas, tu email verificado debe figurar en{' '}
          <code className="rounded bg-canvas-subtle px-1.5 py-0.5 text-xs font-mono">
            ADMIN_EMAILS
          </code>{' '}
          dentro de las variables de entorno del servidor.
        </p>
        <Link
          to="/sessions"
          className="inline-flex min-h-10 items-center rounded-xl border border-border px-4 text-xs font-bold text-ink hover:bg-canvas-subtle transition"
        >
          Volver a Juntadas
        </Link>
      </div>
    );
  }

  const dbHealth = metrics?.health.db;
  const statusTone =
    loading && !metrics
      ? {
          label: 'Consultando…',
          badge: 'border-border bg-canvas-subtle text-ink-muted',
        }
      : metrics?.status === 'ok'
        ? {
            label: 'Operativo',
            badge: 'border-forest-200 bg-forest-50 text-forest-700',
          }
        : metrics?.status === 'degraded'
          ? {
              label: 'Latencia elevada',
              badge: 'border-ochre-100 bg-ochre-50 text-ochre-700',
            }
          : {
              label: 'Sin respuesta',
              badge: 'border-terracotta-200 bg-terracotta-50 text-terracotta-700',
            };

  return (
    <div className="space-y-7">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-forest-600">
              Observabilidad & Diagnóstico
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusTone.badge}`}
            >
              <Activity className="h-3.5 w-3.5" aria-hidden="true" />
              {statusTone.label}
            </span>
          </div>
          <h1 className="font-[var(--font-display)] text-3xl sm:text-4xl font-bold tracking-tight text-ink">
            Monitor del Backend
          </h1>
          <p className="text-sm text-ink-muted max-w-2xl">
            Desglose real de latencia en red, autenticación, queries PostgreSQL/Neon y
            compresión de respuestas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <label className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-ink-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4 rounded accent-forest-600"
            />
            <span>Auto (10s)</span>
          </label>

          <button
            type="button"
            disabled={refreshing || loading}
            onClick={() => void fetchMetrics(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-forest-600 px-4 text-xs font-bold text-white hover:bg-forest-700 disabled:opacity-60 transition"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Ping en vivo</span>
          </button>
        </div>
      </header>

      {errorMsg && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-terracotta-200 bg-terracotta-50 px-4 py-3 text-xs font-semibold text-terracotta-700"
        >
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </span>
          <button
            type="button"
            onClick={() => void fetchMetrics(true)}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-terracotta-500 px-3 text-xs font-bold text-white hover:bg-terracotta-600 transition"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Reintentar
          </button>
        </div>
      )}

      {dbHealth?.regionMismatchWarning && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-ochre-100 bg-ochre-50 px-4 py-3.5 text-xs text-ochre-700"
        >
          <AlertTriangle className="h-4.5 w-4.5 shrink-0 mt-0.5 text-ochre-500" aria-hidden="true" />
          <div className="space-y-0.5">
            <p className="font-bold">Diferencia de región detectada entre Backend y Neon</p>
            <p className="font-medium">{dbHealth.regionMismatchWarning}</p>
          </div>
        </div>
      )}

      {/* 4 Summary Cards (with initial loading skeleton) */}
      {loading && !metrics ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="h-28 rounded-2xl border border-border bg-surface p-4 animate-pulse space-y-3"
            >
              <div className="h-3.5 w-28 rounded bg-canvas-subtle" />
              <div className="h-7 w-24 rounded bg-canvas-subtle" />
              <div className="h-3 w-36 rounded bg-canvas-subtle" />
            </div>
          ))}
        </section>
      ) : metrics ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Card 1: API Latency */}
          <div className="rounded-2xl border border-border bg-surface p-4 space-y-3 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-ink-muted">
                <Zap className="h-4 w-4 text-forest-600" aria-hidden="true" />
                Latencia API ({metrics.windowMinutes}m)
              </span>
              <span className="text-[11px] font-bold text-ink-muted num-tabular">
                {metrics.summary.totalRequests} req
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-ink num-tabular">
                {metrics.summary.p95Ms} ms
              </span>
              <span className="text-xs font-semibold text-ink-muted">P95</span>
            </div>
            <p className="text-xs text-ink-muted num-tabular">
              P50: <strong>{metrics.summary.p50Ms} ms</strong> · P99:{' '}
              <strong>{metrics.summary.p99Ms} ms</strong> · 5xx:{' '}
              <strong>{metrics.summary.error5xxCount}</strong>
            </p>
          </div>

          {/* Card 2: Postgres / Neon */}
          <div className="rounded-2xl border border-border bg-surface p-4 space-y-3 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-ink-muted">
                <Database className="h-4 w-4 text-teal-600" aria-hidden="true" />
                PostgreSQL / Neon
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                  !dbHealth?.ok
                    ? 'border-terracotta-200 bg-terracotta-50 text-terracotta-700'
                    : dbHealth.pooled
                      ? 'border-forest-200 bg-forest-50 text-forest-700'
                      : 'border-ochre-100 bg-ochre-50 text-ochre-700'
                }`}
              >
                {!dbHealth?.ok
                  ? 'Sin conexión'
                  : dbHealth.pooled
                    ? 'Pooler activo'
                    : 'Conexión directa'}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-ink num-tabular">
                {dbHealth?.pingMs ?? 0} ms
              </span>
              <span className="text-xs font-semibold text-ink-muted">SELECT 1</span>
            </div>
            <p className="text-xs text-ink-muted">
              DB: <strong>{dbHealth?.dbRegionHint ?? 'n/d'}</strong> · Host:{' '}
              <strong>{dbHealth?.serverRegionHint ?? 'local/custom'}</strong>
              {dbHealth?.coldStartSuspected ? ' · Cold start detectado' : ''}
            </p>
          </div>

          {/* Card 3: Node Process & Event Loop */}
          <div className="rounded-2xl border border-border bg-surface p-4 space-y-3 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-ink-muted">
                <Cpu className="h-4 w-4 text-ochre-500" aria-hidden="true" />
                Proceso Node
              </span>
              <span className="text-[11px] font-semibold text-ink-muted num-tabular">
                Up {formatUptime(metrics.uptimeSeconds)}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-ink num-tabular">
                {metrics.process.heapUsedMb} MB
              </span>
              <span className="text-xs font-semibold text-ink-muted">
                heap ({metrics.process.rssMb} MB RSS)
              </span>
            </div>
            <p className="text-xs text-ink-muted num-tabular">
              Event Loop P95:{' '}
              <strong>{metrics.process.eventLoopLagMs?.p95 ?? 0} ms</strong> ·{' '}
              {metrics.process.nodeVersion}
            </p>
          </div>

          {/* Card 4: Egress & Compression */}
          <div className="rounded-2xl border border-border bg-surface p-4 space-y-3 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-ink-muted">
                <Server className="h-4 w-4 text-terracotta-500" aria-hidden="true" />
                Tráfico & Red
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-forest-700">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Brotli/Gzip + CORS 24h
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-ink num-tabular">
                {formatBytes(metrics.summary.totalWireBytes)}
              </span>
              <span className="text-xs font-semibold text-ink-muted">en red</span>
            </div>
            <p className="text-xs text-ink-muted num-tabular">
              Sin comprimir: <strong>{formatBytes(metrics.summary.totalPayloadBytes)}</strong>{' '}
              (ahorro {formatBytes(metrics.summary.compressionSavedBytes)})
            </p>
          </div>
        </section>
      ) : null}

      {/* Client Live Waterfall Inspector (Server-Timing) */}
      <section className="rounded-3xl border border-border bg-surface p-5 space-y-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">
              Inspector en vivo de tu sesión (
              {clientCalls.length > 20
                ? `últimas 20 de ${clientCalls.length}`
                : clientCalls.length}
              )
            </h2>
            <p className="text-xs text-ink-muted">
              Compara el tiempo percibido en el navegador contra{' '}
              <code className="font-mono text-[11px]">Server-Timing</code> para aislar
              red/CORS vs base de datos.
            </p>
          </div>
          {clientCalls.length > 0 && (
            <button
              type="button"
              onClick={() => clearClientApiTelemetry()}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border bg-canvas px-2.5 text-xs font-semibold text-ink-muted hover:text-ink transition"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Limpiar
            </button>
          )}
        </div>

        {clientCalls.length === 0 ? (
          <p className="text-xs text-ink-muted py-4 text-center">
            Navegá por la app o ejecutá acciones para ver el desglose de cada llamada en
            vivo.
          </p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {clientCalls.slice(0, 20).map((call) => {
              const st = call.serverTiming;
              const total = Math.max(1, call.clientTotalMs);
              const pct = (val: number) =>
                Math.min(100, Math.max(0, Math.round((val / total) * 100)));

              return (
                <div
                  key={`${call.id}-${call.timestamp}`}
                  className="rounded-xl border border-border/80 bg-canvas/55 px-3.5 py-2.5 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0 max-w-full">
                      <span className="shrink-0 rounded-md bg-surface border border-border px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink">
                        {call.method}
                      </span>
                      <span className="font-mono font-semibold text-ink truncate">
                        {call.path}
                      </span>
                      <span
                        className={`shrink-0 text-[10px] font-bold num-tabular ${
                          call.ok ? 'text-forest-700' : 'text-terracotta-600'
                        }`}
                      >
                        {call.status || 'ERR'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 num-tabular">
                      <span className="text-[11px] text-ink-muted">
                        {formatBytes(call.responseBytes)}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-extrabold ${latencyBadgeClass(
                          call.clientTotalMs,
                        )}`}
                      >
                        {Math.round(call.clientTotalMs)} ms
                      </span>
                    </div>
                  </div>

                  {/* Stacked Timing Bar (decorative visual mirror of the accessible labels below) */}
                  <div
                    aria-hidden="true"
                    className="h-2 w-full overflow-hidden rounded-full bg-canvas-deep flex"
                  >
                    {call.tokenAcquireMs > 0 && (
                      <div
                        style={{ width: `${pct(call.tokenAcquireMs)}%` }}
                        className="bg-ochre-500"
                      />
                    )}
                    <div
                      style={{ width: `${pct(call.networkOverheadMs)}%` }}
                      className="bg-teal-500"
                    />
                    {st && (
                      <>
                        <div
                          style={{ width: `${pct(st.authMs)}%` }}
                          className="bg-forest-500"
                        />
                        <div
                          style={{ width: `${pct(st.dbMs)}%` }}
                          className="bg-terracotta-500"
                        />
                        <div
                          style={{ width: `${pct(st.appMs)}%` }}
                          className="bg-forest-900"
                        />
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-muted num-tabular">
                    <span>
                      <strong className="text-teal-700">Red/CORS:</strong>{' '}
                      {Math.round(call.networkOverheadMs)} ms
                    </span>
                    {call.tokenAcquireMs > 1 && (
                      <span>
                        <strong className="text-ochre-700">Token:</strong>{' '}
                        {Math.round(call.tokenAcquireMs)} ms
                      </span>
                    )}
                    {st && (
                      <>
                        <span>
                          <strong className="text-terracotta-700">
                            DB ({st.dbQueries}q):
                          </strong>{' '}
                          {Math.round(st.dbMs)} ms
                        </span>
                        <span>
                          <strong className="text-forest-600">Auth srv:</strong>{' '}
                          {Math.round(st.authMs)} ms
                        </span>
                        <span>
                          <strong className="text-forest-900">App:</strong>{' '}
                          {Math.round(st.appMs)} ms
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Server Aggregated Routes Table */}
      {metrics && (
        <section className="rounded-3xl border border-border bg-surface p-5 space-y-4 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2
                id="routes-metrics-heading"
                className="text-sm font-extrabold uppercase tracking-wider text-ink"
              >
                Rendimiento por Endpoint (últimos {metrics.windowMinutes} min)
              </h2>
              <p className="text-xs text-ink-muted">
                Percentiles y promedio de queries Prisma por ruta en el servidor.
              </p>
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink-muted">
              <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Ordenar:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as RouteSortKey)}
                className="min-h-8 rounded-lg border border-border bg-canvas px-2.5 text-xs font-bold text-ink"
              >
                <option value="p95Ms">Mayor P95 (ms)</option>
                <option value="avgDbQueries">Más queries DB</option>
                <option value="avgPayloadBytes">Mayor payload promedio</option>
                <option value="count">Más llamadas</option>
              </select>
            </label>
          </div>

          {sortedRoutes.length === 0 ? (
            <p className="text-xs text-ink-muted py-4 text-center">
              Todavía no hay muestras registradas en esta ventana.
            </p>
          ) : (
            <div
              tabIndex={0}
              role="region"
              aria-labelledby="routes-metrics-heading"
              className="overflow-x-auto max-h-96 rounded-2xl border border-border focus-visible:outline-2 focus-visible:outline-forest-600"
            >
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-canvas-subtle text-[11px] font-extrabold uppercase tracking-wider text-ink-muted border-b border-border">
                  <tr>
                    <th scope="col" className="px-3.5 py-2.5">
                      Ruta
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right">
                      Llamadas
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right">
                      P50
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right">
                      P95
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right">
                      Máx
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right">
                      DB Q/req
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right">
                      DB ms
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right">
                      Payload prom.
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface num-tabular">
                  {sortedRoutes.map((row) => (
                    <tr key={row.key} className="hover:bg-canvas/60">
                      <th
                        scope="row"
                        className="px-3.5 py-2.5 font-mono font-semibold text-ink whitespace-nowrap"
                      >
                        <span className="mr-1.5 rounded bg-canvas-subtle px-1.5 py-0.5 text-[10px] font-bold text-ink-muted">
                          {row.method}
                        </span>
                        {row.route}
                      </th>
                      <td className="px-3 py-2.5 text-right font-semibold text-ink-muted">
                        {row.count}
                        {row.error5xxCount > 0 && (
                          <span className="ml-1 text-terracotta-600 font-bold">
                            ({row.error5xxCount} err)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-ink-muted">
                        {row.p50Ms} ms
                      </td>
                      <td className="px-3 py-2.5 text-right font-extrabold text-ink">
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${latencyBadgeClass(
                            row.p95Ms,
                          )}`}
                        >
                          {row.p95Ms} ms
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-ink-muted">
                        {row.maxMs} ms
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-ink">
                        {row.avgDbQueries}
                      </td>
                      <td className="px-3 py-2.5 text-right text-ink-muted">
                        {row.avgDbMs} ms
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-ink-muted">
                        {formatBytes(row.avgPayloadBytes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Notable Slow Requests & Errors */}
      {metrics && metrics.recentNotableRequests.length > 0 && (
        <section className="rounded-3xl border border-border bg-surface p-5 space-y-3 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-terracotta-500" aria-hidden="true" />
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">
              Requests lentas o errores recientes ({metrics.recentNotableRequests.length})
            </h2>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {metrics.recentNotableRequests.map((item) => (
              <div
                key={`${item.requestId}-${item.timestamp}`}
                className="rounded-xl border border-border bg-canvas/50 p-3 text-xs space-y-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-bold text-ink min-w-0 break-all">
                    {item.method} {item.route}{' '}
                    <span className="text-ink-muted font-normal">
                      ({item.statusCode})
                    </span>
                  </span>
                  <span className="font-extrabold text-terracotta-700 num-tabular shrink-0">
                    {item.totalMs} ms total · {item.dbMs} ms DB ({item.dbQueryCount}q)
                  </span>
                </div>
                {item.slowQueries.length > 0 && (
                  <p className="text-[11px] text-ink-muted font-mono break-all">
                    Slow SQL:{' '}
                    {item.slowQueries
                      .map((q) => `${q.target} (${q.durationMs}ms)`)
                      .join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
