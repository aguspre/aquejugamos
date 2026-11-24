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
  useState,
  type Context,
  type ReactNode,
} from "react";
import {
  ApiError,
  getStoredGuestToken,
  setStoredGuestToken,
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
}

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  backendUser: BackendUserProfile | null;
  backendSyncStatus: BackendSyncStatus;
  backendSyncError: string | null;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [registeredUser, setRegisteredUser] =
    useState<BackendUserProfile | null>(null);
  const [guestUser, setGuestUser] = useState<BackendUserProfile | null>(null);
  const [guestScope, setGuestScope] = useState<GuestScope | null>(null);
  const [backendSyncStatus, setBackendSyncStatus] =
    useState<BackendSyncStatus>("idle");
  const [backendSyncError, setBackendSyncError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<AuthModalTab>("signin");

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
      setBackendSyncStatus("syncing");
      setBackendSyncError(null);
      try {
        const token = await user.getIdToken(forceRefreshToken);
        const { user: synced } = await authApi.sync(overrides, token);
        setRegisteredUser(synced);
        setBackendSyncStatus("synced");
      } catch (error) {
        setBackendSyncStatus("offline");
        if (error instanceof ApiError) {
          setBackendSyncError(error.message);
        } else {
          setBackendSyncError(
            "El backend no respondió para sincronizar tu perfil en PostgreSQL.",
          );
        }
      }
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
        void syncWithBackend(user);
        return;
      }

      setRegisteredUser(null);
      setBackendSyncStatus("idle");
      setBackendSyncError(null);

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

  const openAuthModal = useCallback((tab: AuthModalTab = "signin") => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const result = await signInWithPopup(firebaseAuth, googleProvider);
    clearGuestState();
    await syncWithBackend(result.user);
    setAuthModalOpen(false);
  }, [syncWithBackend, clearGuestState]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const result = await signInWithEmailAndPassword(
        firebaseAuth,
        email.trim(),
        password,
      );
      clearGuestState();
      await syncWithBackend(result.user);
      setAuthModalOpen(false);
    },
    [syncWithBackend, clearGuestState],
  );

  const signUpWithEmail = useCallback(
    async ({ email, password, displayName }: SignUpInput) => {
      const trimmedName = displayName.trim();
      const result = await createUserWithEmailAndPassword(
        firebaseAuth,
        email.trim(),
        password,
      );

      if (trimmedName) {
        await firebaseUpdateProfile(result.user, { displayName: trimmedName });
      }

      clearGuestState();

      // Refrescamos el token para que contenga el displayName recién guardado
      await syncWithBackend(
        result.user,
        trimmedName ? { displayName: trimmedName } : undefined,
        true,
      );
      setAuthModalOpen(false);
    },
    [syncWithBackend, clearGuestState],
  );

  const enterAsInvitedGuest = useCallback(async (input: GuestJoinInput) => {
    const res = await authApi.guestJoin({
      displayName: input.displayName.trim(),
      groupInviteCode: input.groupInviteCode,
      sessionInviteToken: input.sessionInviteToken,
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
    if (firebaseAuth.currentUser) {
      await firebaseSignOut(firebaseAuth);
    }
    clearGuestState();
    setRegisteredUser(null);
    setBackendSyncStatus("idle");
    setBackendSyncError(null);
  }, [clearGuestState]);

  const refreshBackendSync = useCallback(async () => {
    if (!firebaseAuth.currentUser) return;
    await syncWithBackend(firebaseAuth.currentUser, undefined, true);
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
