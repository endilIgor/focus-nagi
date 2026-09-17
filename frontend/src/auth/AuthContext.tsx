import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { authApi, type LoginRequest } from "../api/auth";
import { ApiRequestError } from "../api/client";
import { setUnauthorizedHandler } from "../api/client";
import type { OwnerResponse } from "../api/types";

interface AuthContextValue {
  owner: OwnerResponse | null;
  status: "loading" | "authenticated" | "anonymous";
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [owner, setOwner] = useState<OwnerResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "authenticated" | "anonymous">("loading");

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setOwner(null);
      setStatus("anonymous");
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    authApi
      .me()
      .then((me) => {
        if (cancelled) return;
        setOwner(me);
        setStatus("authenticated");
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiRequestError && err.status === 401) {
          setStatus("anonymous");
        } else {
          // Network/server error on boot: treat as anonymous so the user can retry via login.
          setStatus("anonymous");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (credentials: LoginRequest) => {
    const me = await authApi.login(credentials);
    setOwner(me);
    setStatus("authenticated");
  };

  const logout = async () => {
    await authApi.logout();
    setOwner(null);
    setStatus("anonymous");
  };

  return (
    <AuthContext.Provider value={{ owner, status, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
