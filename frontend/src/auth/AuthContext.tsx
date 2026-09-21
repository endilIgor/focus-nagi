import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { authApi, type LoginRequest } from "../api/auth";
import { ApiRequestError, setUnauthorizedHandler } from "../api/client";
import { getSupabase } from "../api/supabase";
import type { OwnerResponse } from "../api/types";

interface AuthContextValue {
  owner: OwnerResponse | null;
  status: "loading" | "authenticated" | "anonymous" | "unavailable";
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  retrySession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Drops the local Supabase session without failing the caller (e.g. when already signed out). */
async function clearLocalSession(): Promise<void> {
  await authApi.logout().catch(() => undefined);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [owner, setOwner] = useState<OwnerResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "authenticated" | "anonymous" | "unavailable">("loading");
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setOwner(null);
      setStatus("anonymous");
      void clearLocalSession();
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    const { data } = getSupabase().auth.onAuthStateChange((event) => {
      // Sign-outs in another tab (or an unrecoverable refresh) end this tab's session too.
      if (event === "SIGNED_OUT") {
        setOwner(null);
        setStatus("anonymous");
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await getSupabase().auth.getSession();
        if (!data.session) {
          if (!cancelled) setStatus("anonymous");
          return;
        }
        const me = await authApi.me();
        if (cancelled) return;
        setOwner(me);
        setStatus("authenticated");
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) {
          await clearLocalSession();
          if (!cancelled) setStatus("anonymous");
          return;
        }
        // Keep a valid Supabase refresh session through Worker, database, and network outages.
        setStatus("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrapAttempt]);

  const retrySession = () => {
    setStatus("loading");
    setBootstrapAttempt((attempt) => attempt + 1);
  };

  const login = async (credentials: LoginRequest) => {
    try {
      const me = await authApi.login(credentials);
      setOwner(me);
      setStatus("authenticated");
    } catch (err) {
      await clearLocalSession();
      throw err;
    }
  };

  const logout = async () => {
    await authApi.logout();
    setOwner(null);
    setStatus("anonymous");
  };

  return (
    <AuthContext.Provider value={{ owner, status, login, logout, retrySession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
