import { useId, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiRequestError } from "../api/client";
import { ParticleAnchor, ParticleScene } from "../components/particles/ParticleScene";
import { useAuth } from "./AuthContext";
import styles from "./LoginPage.module.css";

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "Usuário ou senha incorretos.",
  LOGIN_LOCKED: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  VALIDATION_ERROR: "Preencha e-mail e senha.",
  ACCESS_DENIED: "Esta conta não tem acesso a este console.",
};

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Synchronous guard: state updates land too late to stop a second submit in the same tick.
  const inFlight = useRef(false);
  const ids = useId();
  const titleId = `${ids}-title`;
  const emailId = `${ids}-email`;
  const passwordId = `${ids}-password`;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate("/hoje", { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(ERROR_MESSAGES[err.code] ?? err.message);
      } else {
        setError("Falha de rede. Tente novamente.");
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.root}>
      <ParticleScene>
        <div className={styles.stage}>
          <ParticleAnchor
            className={styles.anchor}
            shape={submitting ? "ring" : "cloud"}
            progress={submitting ? 1 : 0}
            running={submitting}
            aria-hidden="true"
          />

          <div className={styles.eyebrow}>
            <span className={styles.eyebrowLine} aria-hidden="true" />
            Single-owner terminal · v0.8
            <span className={`${styles.eyebrowLine} ${styles.eyebrowLineEnd}`} aria-hidden="true" />
          </div>
          <h1 className={styles.headline}>Focus Nagi</h1>

          <form
            className={styles.card}
            onSubmit={onSubmit}
            aria-labelledby={titleId}
            aria-busy={submitting}
          >
            <div className={styles.cardHeader}>
              <span>Autenticação de sessão</span>
              <span className={styles.online}>
                <span className={styles.onlineDot} aria-hidden="true" />
                Online
              </span>
            </div>
            <h2 id={titleId} className={styles.title}>
              Acesse seu console
              <span className={styles.caret} aria-hidden="true">
                _
              </span>
            </h2>

            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}

            <div className={styles.fields}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={emailId}>
                  E-mail
                </label>
                <input
                  id={emailId}
                  className={styles.input}
                  type="email"
                  autoComplete="email"
                  placeholder="voce@dominio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <label className={styles.label} htmlFor={passwordId}>
                    Senha
                  </label>
                  <span className={styles.hint} aria-hidden="true">
                    Supabase Auth
                  </span>
                </div>
                <input
                  id={passwordId}
                  className={styles.input}
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className={styles.submit} disabled={submitting}>
                {submitting ? "Entrando..." : "Entrar na sessão"}
                <span className={styles.sheen} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.footer}>
              <span>Bearer JWT · RLS</span>
              <span className={styles.footerAccent}>Auto refresh</span>
            </div>
          </form>

          <p className={styles.note}>Sem cadastro público. Acesso restrito ao owner.</p>
        </div>
      </ParticleScene>
    </div>
  );
}
