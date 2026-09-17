import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiRequestError } from "../api/client";
import { THEMES } from "../theme/themes";
import { useTheme } from "../theme/ThemeContext";
import { useAuth } from "./AuthContext";
import styles from "./LoginPage.module.css";

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "Usuário ou senha incorretos.",
  LOGIN_LOCKED: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  VALIDATION_ERROR: "Preencha usuário e senha.",
};

export function LoginPage() {
  const { login } = useAuth();
  const { theme, themeKey, setThemeKey } = useTheme();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ username, password });
      navigate("/hoje", { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(ERROR_MESSAGES[err.code] ?? err.message);
      } else {
        setError("Falha de rede. Tente novamente.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fn-root"
      style={
        {
          "--acc": theme.acc,
          "--acc2": theme.acc2,
          "--glow": theme.glow,
          "--soft": theme.soft,
        } as React.CSSProperties
      }
    >
      <div className="fn-grid-bg" />
      <div className="fn-hatch-bg" />
      <div className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.brand}>
            <div className={styles.logo}>FN</div>
            <div>
              <div className={styles.brandTitle}>
                FOCUS<span>//</span>NAGI
              </div>
              <div className={styles.brandSub}>SINGLE-OWNER TERMINAL &middot; v0.8</div>
            </div>
          </div>

          <form className={styles.panel} onSubmit={onSubmit}>
            <div className={styles.panelTopline} />
            <div className="fn-corner-tl" />
            <div className="fn-corner-br" />

            <div className={styles.panelHeader}>
              <span>// AUTENTICAÇÃO DE SESSÃO</span>
              <span className={styles.online}>
                <span className={styles.dot} />
                ONLINE
              </span>
            </div>
            <h1 className={styles.title}>
              Acesse seu console<span className={styles.caret}>_</span>
            </h1>

            {error && <div className="fn-error-banner">{error}</div>}

            <div className={styles.form}>
              <label className="fn-field">
                <span>USERNAME</span>
                <input
                  className="fn-input"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </label>
              <label className="fn-field">
                <span>PASSWORD</span>
                <input
                  className="fn-input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              <button type="submit" className={`fn-btn-primary ${styles.submit}`} disabled={submitting}>
                {submitting ? "Entrando..." : "Entrar na sessão"}
                <span className={styles.sheen} />
              </button>
            </div>

            <div className={styles.footer}>
              <span>COOKIE FOCUS_SESSION &middot; CSRF OK</span>
              <span>TTL 12h</span>
            </div>
          </form>

          <div className={styles.palettes}>
            {Object.values(THEMES).map((t) => (
              <button
                key={t.key}
                type="button"
                title={t.label}
                onClick={() => setThemeKey(t.key)}
                className={`${styles.swatch} ${t.key === themeKey ? styles.active : ""}`}
                style={{ background: t.swatch }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
