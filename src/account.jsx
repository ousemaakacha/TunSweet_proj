import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LogOut, ShieldCheck } from "lucide-react";
import { useStore } from "./state";
import { authService } from "./services";

export function Account() {
  const { t, session, sessionLoading, setSession } = useStore();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const changeMode = (next) => {
    setMode(next);
    setError("");
    setMessage("");
  };
  const submit = async (event) => {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (mode === "register" && data.password !== data.confirmPassword) {
      setError("authPasswordMismatch");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "register") {
        await authService.register({
          name: data.name,
          email,
          password: data.password,
        });
        form.reset();
        setMode("resend");
        setMessage("authCheckInbox");
      } else if (mode === "resend") {
        await authService.resend(email);
        setMessage("authResent");
      } else {
        setSession(
          await authService.signIn({ email, password: data.password }),
        );
        form.reset();
      }
    } catch (err) {
      setError(t(err.message) !== err.message ? err.message : "apiError");
      if (
        ["authVerificationRequired", "authEmailUnavailable"].includes(
          err.message,
        )
      )
        setMode("resend");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const logout = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await authService.signOut();
      setSession(null);
    } catch {
      setError("apiError");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="section account-section">
      <div className="container account-card">
        <p className="eyebrow">TUNISWEET · {t("account")}</p>
        {sessionLoading ? (
          <p role="status">{t("loading")}</p>
        ) : session?.verified ? (
          <>
            <ShieldCheck size={35} aria-hidden="true" />
            <h1>
              {t("welcome")}, {session.name}.
            </h1>
            <p>{t("signedIn")}</p>
            <p>{session.email}</p>
            <Link className="button" to="/catalogo">
              {t("discover")}
              <ArrowRight size={16} />
            </Link>
            <button
              className="link-button logout"
              disabled={busy}
              onClick={logout}
            >
              <LogOut size={16} />
              {t("logout")}
            </button>
          </>
        ) : (
          <>
            <h1>
              {t(
                mode === "resend"
                  ? "authVerifyTitle"
                  : mode === "register"
                    ? "registerTitle"
                    : "loginTitle",
              )}
            </h1>
            <p>{t(mode === "resend" ? "authVerifyIntro" : "loginIntro")}</p>
            <form onSubmit={submit} key={mode}>
              <fieldset disabled={busy}>
                {mode === "register" && (
                  <label>
                    {t("name")}
                    <input
                      name="name"
                      autoComplete="name"
                      required
                      minLength={2}
                      maxLength={120}
                    />
                  </label>
                )}
                <label>
                  {t("email")}
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                {mode !== "resend" && (
                  <label>
                    {t("password")}
                    <input
                      name="password"
                      type="password"
                      autoComplete={
                        mode === "register"
                          ? "new-password"
                          : "current-password"
                      }
                      required
                      minLength={mode === "register" ? 12 : 1}
                      maxLength={128}
                    />
                  </label>
                )}
                {mode === "register" && (
                  <>
                    <p className="small muted">{t("passwordHelp")}</p>
                    <label>
                      {t("authConfirmPassword")}
                      <input
                        name="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={12}
                        maxLength={128}
                      />
                    </label>
                  </>
                )}
                <button className="button" type="submit">
                  {t(
                    busy
                      ? "authBusy"
                      : mode === "resend"
                        ? "authResend"
                        : mode === "register"
                          ? "register"
                          : "login",
                  )}
                  <ArrowRight size={16} />
                </button>
              </fieldset>
            </form>
            <p className="small">
              <button
                disabled={busy}
                className="text-button"
                onClick={() =>
                  changeMode(mode === "login" ? "register" : "login")
                }
              >
                {t(mode === "login" ? "register" : "login")}
              </button>
            </p>
            {mode !== "resend" && (
              <p className="small">
                <button
                  disabled={busy}
                  className="text-button"
                  onClick={() => changeMode("resend")}
                >
                  {t("authResend")}
                </button>
              </p>
            )}
          </>
        )}
        {message && <p role="status">{t(message)}</p>}
        {error && (
          <p className="inline-error" role="alert">
            {t(error)}
          </p>
        )}
      </div>
    </section>
  );
}

export function VerifyEmail() {
  const { t } = useStore();
  const [token] = useState(() =>
    new URLSearchParams(window.location.hash.slice(1)).get("token"),
  );
  const [status, setStatus] = useState(token ? "" : "authInvalidLink");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname,
    );
  }, []);
  const verify = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await authService.verify(token);
      setStatus("authVerified");
    } catch (err) {
      setStatus(t(err.message) !== err.message ? err.message : "apiError");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const invalid = ["authInvalidLink", "authExpiredLink"].includes(status);
  return (
    <section className="section account-section">
      <div className="container account-card">
        <h1>{t("authVerifyTitle")}</h1>
        {!invalid && status !== "authVerified" && (
          <p>{t("authVerifyLinkIntro")}</p>
        )}
        {status && (
          <p role={status === "authVerified" ? "status" : "alert"}>
            {t(status)}
          </p>
        )}
        {token && status !== "authVerified" && !invalid && (
          <button className="button" disabled={busy} onClick={verify}>
            {t(busy ? "authBusy" : "authVerifyButton")}
          </button>
        )}
        <p>
          <Link className="text-button" to="/account">
            {t(status === "authVerified" ? "login" : "authBackAccount")}
          </Link>
        </p>
      </div>
    </section>
  );
}
