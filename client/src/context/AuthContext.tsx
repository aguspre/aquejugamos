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
  type ReactNode,
} from "react";
import { ApiError } from "../api/client";
import { authApi, type AuthUserResponse } from "../api/endpoints";
import { firebaseAuth, googleProvider } from "../lib/firebase";

export type BackendUserProfile = AuthUserResponse;

export type AuthModalTab = "signin" | "signup";
export type BackendSyncStatus = "idle" | "syncing" | "synced" | "offline";

interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
}

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  backendUser: BackendUserProfile | null;
  backendSyncStatus: BackendSyncStatus;
  backendSyncError: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  authModalOpen: boolean;
  authModalTab: AuthModalTab;
  openAuthModal: (tab?: AuthModalTab) => void;
  closeAuthModal: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (input: SignUpInput) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshBackendSync: () => Promise<void>;
  updateAccountProfile: (patch: {
    displayName?: string;
    bggUsername?: string | null;
  }) => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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
  const [backendUser, setBackendUser] = useState<BackendUserProfile | null>(
    null,
  );
  const [backendSyncStatus, setBackendSyncStatus] =
    useState<BackendSyncStatus>("idle");
  const [backendSyncError, setBackendSyncError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<AuthModalTab>("signin");

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
        setBackendUser(synced);
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
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      setFirebaseUser(user);
      setLoading(false);

      if (user) {
        void syncWithBackend(user);
      } else {
        setBackendUser(null);
        setBackendSyncStatus("idle");
        setBackendSyncError(null);
      }
    });

    return () => unsubscribe();
  }, [syncWithBackend]);

  const openAuthModal = useCallback((tab: AuthModalTab = "signin") => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const result = await signInWithPopup(firebaseAuth, googleProvider);
    await syncWithBackend(result.user);
    setAuthModalOpen(false);
  }, [syncWithBackend]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const result = await signInWithEmailAndPassword(
        firebaseAuth,
        email.trim(),
        password,
      );
      await syncWithBackend(result.user);
      setAuthModalOpen(false);
    },
    [syncWithBackend],
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

      // Refrescamos el token para que contenga el displayName recién guardado
      await syncWithBackend(
        result.user,
        trimmedName ? { displayName: trimmedName } : undefined,
        true,
      );
      setAuthModalOpen(false);
    },
    [syncWithBackend],
  );

  const sendPasswordReset = useCallback(async (email: string) => {
    await sendPasswordResetEmail(firebaseAuth, email.trim());
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(firebaseAuth);
    setBackendUser(null);
    setBackendSyncStatus("idle");
    setBackendSyncError(null);
  }, []);

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
      setBackendUser(updated);
      setBackendSyncStatus("synced");
      setBackendSyncError(null);
    },
    [],
  );

  const getIdToken = useCallback(async (forceRefresh = false) => {
    if (!firebaseAuth.currentUser) return null;
    return firebaseAuth.currentUser.getIdToken(forceRefresh);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      firebaseUser,
      backendUser,
      backendSyncStatus,
      backendSyncError,
      loading,
      isAuthenticated: firebaseUser !== null,
      authModalOpen,
      authModalTab,
      openAuthModal,
      closeAuthModal,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
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
      authModalOpen,
      authModalTab,
      openAuthModal,
      closeAuthModal,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
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
