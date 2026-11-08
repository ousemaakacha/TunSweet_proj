import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LogOut, ShieldCheck } from "lucide-react";
import { useStore } from "./state";
import { authService } from "./services";
import { Empty } from "./components";

const orderStatusKeys = {
  "In attesa": "pending",
  Confermato: "orderConfirmed",
  "In preparazione": "orderPreparing",
  "Pronto per il ritiro": "orderReady",
  Completato: "orderCompleted",
  Annullato: "orderCancelled",
};

function MyOrders({ onSessionExpired }) {
  const { t, lang, local, money } = useStore();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setOrders(null);
    setError(false);
    authService.orders()
      .then((rows) => {
        if (active) setOrders(rows);
      })
      .catch((err) => {
        if (!active) return;
        if (err.status === 401) onSessionExpired();
        else setError(true);
      });
    return () => {
      active = false;
    };
  }, [attempt, onSessionExpired]);
  const dates = new Intl.DateTimeFormat(lang === "it" ? "it-IT" : "en-GB", {
    dateStyle: "long",
    timeZone: "Europe/Rome",
  });
  return (
    <section
      className="container account-orders"
      aria-labelledby="my-orders-title"
      aria-busy={!orders && !error}
    >
      <h2 id="my-orders-title" tabIndex={-1}>
        {t("myOrders")}
      </h2>
      <p className="muted small">{t("myOrdersIntro")}</p>
      {error ? (
        <div className="status-box error" role="alert">
          <p>{t("myOrdersError")}</p>
          <button
            className="button secondary"
            onClick={() => setAttempt((n) => n + 1)}
          >
            {t("retry")}
          </button>
        </div>
      ) : !orders ? (
        <p className="status-box" role="status">{t("loading")}</p>
      ) : !orders.length ? (
        <div role="status">
          <Empty title={t("myOrdersEmpty")} text={t("myOrdersEmptyText")} />
        </div>
      ) : (
        <ol className="account-orders-list">
          {orders.map((order) => (
            <li key={order.id}>
              <article
                className="confirmation-card"
                aria-labelledby={`order-${order.id}`}
              >
                <h3 id={`order-${order.id}`}>
                  <span className="sr-only">{t("reference")} </span>
                  {order.reference}
                </h3>
                <dl>
                  <div className="summary-row">
                    <dt>{t("orderedOn")}</dt>
                    <dd>
                      {order.createdAt ? (
                        <time dateTime={order.createdAt}>
                          {dates.format(new Date(order.createdAt))}
                        </time>
                      ) : "—"}
                    </dd>
                  </div>
                  <div className="summary-row">
                    <dt>{t("date")}</dt>
                    <dd>
                      <time dateTime={order.pickupDate}>
                        {dates.format(new Date(`${order.pickupDate}T12:00:00`))}
                      </time>
                    </dd>
                  </div>
                  <div className="summary-row">
                    <dt>{t("slot")}</dt><dd>{order.pickupSlot}</dd>
                  </div>
                  <div className="summary-row">
                    <dt>{t("orderStatus")}</dt>
                    <dd>{t(orderStatusKeys[order.status] || "orderStatusUnknown")}</dd>
                  </div>
                  <div className="summary-row">
                    <dt>{t("payment")}</dt>
                    <dd>
                      {t(order.paymentStatus === "paid"
                        ? "paymentPaid"
                        : order.paymentStatus === "unpaid"
                          ? "paymentStatus"
                          : "orderStatusUnknown")}
                    </dd>
                  </div>
                </dl>
                <ul className="confirmation-items" aria-label={t("orderProducts")}>
                  {order.items.map((item) => (
                    <li className="summary-row" key={item.productId}>
                      <span>
                        {item.quantity} × {local(item, "title")}
                      </span>
                      <strong>{money(item.price * item.quantity)}</strong>
                    </li>
                  ))}
                </ul>
                <div className="summary-row total">
                  <span>{t("total")}</span><strong>{money(order.total)}</strong>
                </div>
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function Account() {
  const { t, session, sessionLoading, setSession } = useStore();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const sessionExpired = useCallback(() => {
    setSession(null);
    setMode("login");
    setMessage("");
    setError("authSessionExpired");
  }, [setSession]);
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
            <p>
              <a className="text-button" href="#my-orders-title">{t("myOrders")}</a>
            </p>
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
      {!sessionLoading && session?.verified && (
        <MyOrders key={session.id} onSessionExpired={sessionExpired} />
      )}
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
