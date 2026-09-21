import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, retrySession } = useAuth();

  if (status === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#06060A" }}>
        <span className="fn-spinner" />
      </div>
    );
  }

  if (status === "anonymous") {
    return <Navigate to="/login" replace />;
  }

  if (status === "unavailable") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#06060A", color: "#E4E0EF" }}>
        <div style={{ display: "grid", gap: 16, justifyItems: "center", textAlign: "center" }}>
          <p>Não foi possível confirmar sua sessão.</p>
          <button className="fn-btn-ghost" type="button" onClick={retrySession}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
