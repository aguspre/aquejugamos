import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile as firebaseUpdateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Context,
  type ReactNode,
} from "react";
import {
  ApiError,
  getStoredGuestToken,
  setStoredGuestToken,
  warmUpBackend,
} from "../api/client";
import {
  authApi,
  type AuthUserResponse,
  type GuestScope,
} from "../api/endpoints";
import { firebaseAuth, googleProvider } from "../lib/firebase";

export type BackendUserProfile = AuthUserResponse;

export type AuthModalTab = "signin" | "signup";
export type BackendSyncStatus = "idle" | "syncing" | "synced" | "offline";

interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
}

interface GuestJoinInput {
  displayName: string;
  groupInviteCode?: string;
  sessionInviteToken?: string;
  seriesShareToken?: string;
}

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  backendUser: BackendUserProfile | null;
  backendSyncStatus: BackendSyncStatus;
  backendSyncError: string | null;
  backendSyncSlow: boolean;
  loading: boolean;
  /** True solo cuando el usuario inició sesión con cuenta registrada (Firebase). */
  isAuthenticated: boolean;
  /** True cuando el usuario ingresó como invitado con nombre mediante link de invitación. */
  isGuestSession: boolean;
  guestScope: GuestScope | null;
  authModalOpen: boolean;
  authModalTab: AuthModalTab;
  openAuthModal: (tab?: AuthModalTab) => void;
  closeAuthModal: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (input: SignUpInput) => Promise<void>;
  enterAsInvitedGuest: (
    input: GuestJoinInput,
  ) => Promise<{ targetSessionId: string | null; guestScope: GuestScope }>;
  exitGuestSession: () => void;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshBackendSync: () => Promise<void>;
  updateAccountProfile: (patch: {
    displayName?: string;
    bggUsername?: string | null;
  }) => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
}

const AuthContext: Context<AuthContextValue | null> =
  (import.meta.hot?.data?.AuthContext as
    | Context<AuthContextValue | null>
    | undefined) ?? createContext<AuthContextValue | null>(null);

if (import.meta.hot) {
  import.meta.hot.data.AuthContext = AuthContext;
}

export function formatFirebaseAuthError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "Email o contraseña incorrectos.";
      case "auth/invalid-email":
        return "El formato del email no es válido.";
      case "auth/email-already-in-use":
        return "Ya existe una cuenta registrada con ese email.";
      case "auth/weak-password":
        return "La contraseña debe tener al menos 6 caracteres.";
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
        return "Se cerró la ventana de acceso con Google antes de completar.";
      case "auth/popup-blocked":
        return "El navegador bloqueó la ventana emergente de Google. Permití popups para este sitio.";
      case "auth/unauthorized-domain":
        return "Este dominio no está autorizado en Firebase Console (Authentication → Settings → Authorized domains).";
      case "auth/operation-not-allowed":
        return "Este método de acceso todavía no está habilitado en Firebase Console (Authentication → Sign-in method).";
      case "auth/too-many-requests":
        return "Demasiados intentos seguidos. Esperá unos minutos antes de volver a intentar.";
      case "auth/network-request-failed":
        return "No se pudo conectar con Firebase. Revisá tu conexión a internet.";
      default:
        return `Error de autenticación (${error.code}).`;
    }
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrió un error inesperado al autenticar.";
}

const SYNC_RETRY_DELAYS_MS = [1500, 3000] as const;
const SLOW_SYNC_THRESHOLD_MS = 3500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isTransientSyncError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return (
      error.code === "NETWORK_ERROR" ||
      error.code === "REQUEST_TIMEOUT" ||
      error.status === 408 ||
      error.status === 502 ||
      error.status === 503 ||
      error.status === 504
    );
  }
  return true;
}

function shouldWarmUpOnMount(): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  if (path !== "/" && path !== "/welcome") return true;
  if (window.location.search.includes("Invite=")) return true;
  if (getStoredGuestToken()) return true;
  try {
    return Boolean(localStorage.getItem("aquejugamos_active_group"));
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [registeredUser, setRegisteredUser] =
    useState<BackendUserProfile | null>(null);
  const [guestUser, setGuestUser] = useState<BackendUserProfile | null>(null);
  const [guestScope, setGuestScope] = useState<GuestScope | null>(null);
  const [backendSyncStatus, setBackendSyncStatus] =
    useState<BackendSyncStatus>("idle");
  const [backendSyncError, setBackendSyncError] = useState<string | null>(null);
  const [backendSyncSlow, setBackendSyncSlow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<AuthModalTab>("signin");

  const syncRunIdRef = useRef(0);
  const syncInFlightRef = useRef<{
    uid: string;
    promise: Promise<void>;
  } | null>(null);
  const manualAuthInProgressRef = useRef(false);

  useEffect(() => {
    if (shouldWarmUpOnMount()) {
      warmUpBackend();
    }
  }, []);

  const clearGuestState = useCallback(() => {
    setStoredGuestToken(null);
    setGuestUser(null);
    setGuestScope(null);
  }, []);

  const syncWithBackend = useCallback(
    async (
      user: FirebaseUser,
      overrides?: { displayName?: string; bggUsername?: string | null },
      forceRefreshToken = false,
    ) => {
      if (
        !overrides &&
        !forceRefreshToken &&
        syncInFlightRef.current?.uid === user.uid
      ) {
        return syncInFlightRef.current.promise;
      }

      const runId = ++syncRunIdRef.current;

      let task!: Promise<void>;
      task = (async () => {
        setBackendSyncStatus("syncing");
        setBackendSyncError(null);
        setBackendSyncSlow(false);

        const slowTimer = window.setTimeout(() => {
          if (syncRunIdRef.current === runId) {
            setBackendSyncSlow(true);
          }
        }, SLOW_SYNC_THRESHOLD_MS);

        let shouldForceRefresh = forceRefreshToken;
        let lastError: unknown = null;

        try {
          for (
            let attempt = 0;
            attempt <= SYNC_RETRY_DELAYS_MS.length;
            attempt += 1
          ) {
            if (syncRunIdRef.current !== runId) return;

            try {
              const token = await user.getIdToken(shouldForceRefresh);
              if (syncRunIdRef.current !== runId) return;

              const { user: synced } = await authApi.sync(overrides, token);
              if (syncRunIdRef.current !== runId) return;

              setRegisteredUser(synced);
              setBackendSyncStatus("synced");
              setBackendSyncError(null);
              return;
            } catch (error) {
              lastError = error;

              // Si falló con 401 usando token cacheado, reintentamos una vez refrescando el token
              if (
                !shouldForceRefresh &&
                error instanceof ApiError &&
                error.status === 401
              ) {
                shouldForceRefresh = true;
                continue;
              }

              const retryDelay = SYNC_RETRY_DELAYS_MS[attempt];
              if (retryDelay !== undefined && isTransientSyncError(error)) {
                await sleep(retryDelay);
                continue;
              }

              break;
            }
          }

          if (syncRunIdRef.current !== runId) return;

          setBackendSyncStatus("offline");
          if (lastError instanceof ApiError) {
            setBackendSyncError(lastError.message);
          } else {
            setBackendSyncError(
              "No pudimos conectar con el servidor en este momento. Intentá de nuevo en unos segundos.",
            );
          }
        } finally {
          window.clearTimeout(slowTimer);
          if (syncRunIdRef.current === runId) {
            setBackendSyncSlow(false);
          }
          if (syncInFlightRef.current?.promise === task) {
            syncInFlightRef.current = null;
          }
        }
      })();

      if (!overrides && !forceRefreshToken) {
        syncInFlightRef.current = { uid: user.uid, promise: task };
      }

      return task;
    },
    [],
  );

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      if (!active) return;

      setFirebaseUser(user);

      if (user) {
        clearGuestState();
        setLoading(false);
        if (manualAuthInProgressRef.current) {
          setBackendSyncStatus("syncing");
          return;
        }
        void syncWithBackend(user);
        return;
      }

      syncRunIdRef.current += 1;
      syncInFlightRef.current = null;
      setRegisteredUser(null);
      setBackendSyncStatus("idle");
      setBackendSyncError(null);
      setBackendSyncSlow(false);

      const storedGuestToken = getStoredGuestToken();
      if (!storedGuestToken) {
        setGuestUser(null);
        setGuestScope(null);
        setLoading(false);
        return;
      }

      void authApi
        .me()
        .then((res) => {
          if (!active) return;
          if (res.isGuest) {
            setGuestUser(res.user);
            setGuestScope(res.guestScope ?? null);
          } else {
            clearGuestState();
          }
        })
        .catch(() => {
          if (!active) return;
          clearGuestState();
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [syncWithBackend, clearGuestState]);

  // Reintentar automáticamente cuando el navegador recupera conectividad
  useEffect(() => {
    const handleOnline = () => {
      if (backendSyncStatus === "offline" && firebaseAuth.currentUser) {
        void syncWithBackend(firebaseAuth.currentUser);
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [backendSyncStatus, syncWithBackend]);

  const openAuthModal = useCallback((tab: AuthModalTab = "signin") => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    manualAuthInProgressRef.current = true;
    try {
      const result = await signInWithPopup(firebaseAuth, googleProvider);
      clearGuestState();
      await syncWithBackend(result.user);
      setAuthModalOpen(false);
    } finally {
      manualAuthInProgressRef.current = false;
    }
  }, [syncWithBackend, clearGuestState]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      manualAuthInProgressRef.current = true;
      try {
        const result = await signInWithEmailAndPassword(
          firebaseAuth,
          email.trim(),
          password,
        );
        clearGuestState();
        await syncWithBackend(result.user);
        setAuthModalOpen(false);
      } finally {
        manualAuthInProgressRef.current = false;
      }
    },
    [syncWithBackend, clearGuestState],
  );

  const signUpWithEmail = useCallback(
    async ({ email, password, displayName }: SignUpInput) => {
      const trimmedName = displayName.trim();
      manualAuthInProgressRef.current = true;
      try {
        const result = await createUserWithEmailAndPassword(
          firebaseAuth,
          email.trim(),
          password,
        );

        if (trimmedName) {
          await firebaseUpdateProfile(result.user, {
            displayName: trimmedName,
          });
        }

        clearGuestState();

        // Refrescamos el token para que contenga el displayName recién guardado
        await syncWithBackend(
          result.user,
          trimmedName ? { displayName: trimmedName } : undefined,
          true,
        );
        setAuthModalOpen(false);
      } catch (error) {
        // Si la cuenta se creó pero falló un paso posterior, igual sincronizamos
        // para no dejar el estado en "syncing" indefinidamente.
        manualAuthInProgressRef.current = false;
        if (firebaseAuth.currentUser) {
          void syncWithBackend(firebaseAuth.currentUser);
        }
        throw error;
      } finally {
        manualAuthInProgressRef.current = false;
      }
    },
    [syncWithBackend, clearGuestState],
  );

  const enterAsInvitedGuest = useCallback(async (input: GuestJoinInput) => {
    const res = await authApi.guestJoin({
      displayName: input.displayName.trim(),
      groupInviteCode: input.groupInviteCode,
      sessionInviteToken: input.sessionInviteToken,
      seriesShareToken: input.seriesShareToken,
    });

    setStoredGuestToken(res.token);
    setGuestUser(res.user);
    setGuestScope(res.guestScope);
    setAuthModalOpen(false);

    return {
      targetSessionId: res.guestScope.targetSessionId ?? null,
      guestScope: res.guestScope,
    };
  }, []);

  const exitGuestSession = useCallback(() => {
    clearGuestState();
  }, [clearGuestState]);

  const sendPasswordReset = useCallback(async (email: string) => {
    await sendPasswordResetEmail(firebaseAuth, email.trim());
  }, []);

  const signOut = useCallback(async () => {
    syncRunIdRef.current += 1;
    syncInFlightRef.current = null;
    if (firebaseAuth.currentUser) {
      await firebaseSignOut(firebaseAuth);
    }
    clearGuestState();
    setRegisteredUser(null);
    setBackendSyncStatus("idle");
    setBackendSyncError(null);
    setBackendSyncSlow(false);
  }, [clearGuestState]);

  const refreshBackendSync = useCallback(async () => {
    if (!firebaseAuth.currentUser) return;
    await syncWithBackend(firebaseAuth.currentUser);
  }, [syncWithBackend]);

  const updateAccountProfile = useCallback(
    async (patch: { displayName?: string; bggUsername?: string | null }) => {
      const current = firebaseAuth.currentUser;
      if (!current) return;

      if (
        patch.displayName &&
        patch.displayName.trim() !== current.displayName
      ) {
        await firebaseUpdateProfile(current, {
          displayName: patch.displayName.trim(),
        });
      }

      const { user: updated } = await authApi.updateMe(patch);
      setRegisteredUser(updated);
      setBackendSyncStatus("synced");
      setBackendSyncError(null);
    },
    [],
  );

  const getIdToken = useCallback(async (forceRefresh = false) => {
    if (!firebaseAuth.currentUser) return null;
    return firebaseAuth.currentUser.getIdToken(forceRefresh);
  }, []);

  const isAuthenticated = firebaseUser !== null;
  const isGuestSession = !isAuthenticated && guestUser !== null;
  const backendUser = isAuthenticated ? registeredUser : guestUser;

  const value = useMemo<AuthContextValue>(
    () => ({
      firebaseUser,
      backendUser,
      backendSyncStatus,
      backendSyncError,
      backendSyncSlow,
      loading,
      isAuthenticated,
      isGuestSession,
      guestScope,
      authModalOpen,
      authModalTab,
      openAuthModal,
      closeAuthModal,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      enterAsInvitedGuest,
      exitGuestSession,
      sendPasswordReset,
      signOut,
      refreshBackendSync,
      updateAccountProfile,
      getIdToken,
    }),
    [
      firebaseUser,
      backendUser,
      backendSyncStatus,
      backendSyncError,
      backendSyncSlow,
      loading,
      isAuthenticated,
      isGuestSession,
      guestScope,
      authModalOpen,
      authModalTab,
      openAuthModal,
      closeAuthModal,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      enterAsInvitedGuest,
      exitGuestSession,
      sendPasswordReset,
      signOut,
      refreshBackendSync,
      updateAccountProfile,
      getIdToken,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return ctx;
}
