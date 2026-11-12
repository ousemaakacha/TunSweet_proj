import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  CalendarDays,
  Clock3,
  ShieldCheck,
  Banknote,
  ArrowRight,
  Check,
  LockKeyhole,
} from "lucide-react";
import { useStore } from "./state";
import { api } from "./services";
import { PageHeading, ProductsState, Empty } from "./components";
import { OrderSummary } from "./pages";
import { itemDescription, lineKey } from "../shared/products.js";
import { cartLines, cartTotal } from "./cart.js";
export function Checkout() {
  const {
    t,
    lang,
    money,
    cart,
    lines,
    total,
    invalidCart,
    setCart,
    refresh,
    session,
    setSession,
  } = useStore();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState({
    name: session?.name || "",
    email: session?.email || "",
    phone: "",
    notes: "",
  });
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotsError, setSlotsError] = useState(false);
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [busy, setBusy] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const isSubmitting = useRef(false);
  const orderAttempt = useRef({ signature: "", key: "", sent: false });
  const loadSlots = async () => {
    setSlotsLoading(true);
    setSlotsError(false);
    try {
      setSlots(await api.slots());
    } catch {
      setSlotsError(true);
    } finally {
      setSlotsLoading(false);
    }
  };
  useEffect(() => {
    loadSlots();
  }, []);
  const selectedDay = slots.find((day) => day.date === date);
  const availableSlots = selectedDay?.slots || [];
  const hasCheckoutErrors = invalidCart || slotsLoading || slotsError;
  const submitDisabled = Boolean(busy) || (!orderAttempt.current.sent && hasCheckoutErrors);

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting.current) {
      return;
    }

    const orderItems = cart.map((item) => {
      const orderItem = { productId: item.id, quantity: item.quantity };
      if (item.variantId !== undefined) {
        orderItem.variantId = item.variantId;
      }
      return orderItem;
    });
    const orderData = {
      customer,
      items: orderItems,
      pickupDate: date,
      pickupSlot: slot,
      paymentMethod: "pay_on_pickup",
    };
    const signature = JSON.stringify(orderData);
    const isSameRequest = orderAttempt.current.signature === signature;
    const isRetry = isSameRequest && orderAttempt.current.sent;

    if (cart.length === 0 || (invalidCart && !isRetry)) {
      setError("stockChanged");
      return;
    }
    const validPickup = availableSlots.some((pickup) => pickup.time === slot && pickup.remaining > 0);
    if (!isRetry && !validPickup) {
      setError("invalidPickup");
      return;
    }
    isSubmitting.current = true;
    setBusy("saving");
    setError("");
    try {
      if (!isRetry) {
        const freshProducts = await refresh({ silent: true });
        if (!freshProducts) {
          throw new Error("apiError");
        }

        const freshLines = cartLines(cart, freshProducts);
        const hasUnavailableItems = freshLines.some((line) => !line.valid);
        if (hasUnavailableItems) {
          throw new Error("stockChanged");
        }

        const totalChanged = cartTotal(freshLines) !== total;
        const itemPriceChanged = freshLines.some((line, index) => {
          const previousLine = lines[index];
          return line.price !== previousLine.price;
        });
        if (totalChanged || itemPriceChanged) {
          throw new Error("priceChanged");
        }
      }

      if (!isSameRequest) {
        orderAttempt.current = { signature, key: crypto.randomUUID(), sent: false };
      }
      // A lost response must retry the same key even if this purchase exhausted stock.
      orderAttempt.current.sent = true;
      const order = await api.order({
        ...orderData,
        idempotencyKey: orderAttempt.current.key,
      });
      setCart([]);
      await refresh({ silent: true });
      navigate("/conferma", { state: { order }, replace: true });
    } catch (requestError) {
      setError(requestError.message);
      if (requestError.status && requestError.status < 500) {
        orderAttempt.current.sent = false;
      }
      if (requestError.status === 401) {
        setSession(null);
      }
      if (["slotFull", "invalidPickup"].includes(requestError.message)) {
        setSlot("");
        await loadSlots();
      }
    } finally {
      setBusy("");
      isSubmitting.current = false;
    }
  }
  return (
    <>
      <PageHeading
        eyebrow={t("checkout")}
        title={t("checkoutTitle")}
        text={t("checkoutIntro")}
      />
      <section className="section">
        <div className="container">
          <ProductsState>
            {!lines.length ? (
              <Empty title={t("cartEmpty")} text={t("cartEmptyText")} />
            ) : (
              <div className="checkout-layout">
                <form onSubmit={handleSubmit} className="checkout-form">
                  <fieldset disabled={!!busy}>
                    <legend>
                      <span>01</span>
                      {t("yourDetails")}
                    </legend>
                    <div className="form-grid">
                      <label className="full">
                        {t("name")}
                        <input
                          name="name"
                          autoComplete="name"
                          required
                          minLength={2}
                          maxLength={120}
                          value={customer.name}
                          onChange={(e) =>
                            setCustomer({ ...customer, name: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        {t("email")}
                        <input
                          name="email"
                          type="email"
                          autoComplete="email"
                          required
                          maxLength={200}
                          value={customer.email}
                          onChange={(e) =>
                            setCustomer({ ...customer, email: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        {t("phone")}
                        <input
                          name="phone"
                          type="tel"
                          autoComplete="tel"
                          required
                          pattern="[+0-9\s().\-]{7,25}"
                          value={customer.phone}
                          onChange={(e) =>
                            setCustomer({ ...customer, phone: e.target.value })
                          }
                        />
                      </label>
                      <label className="full">
                        {t("notes")}{" "}
                        <span className="optional">({t("optional")})</span>
                        <textarea
                          name="notes"
                          rows={3}
                          maxLength={1000}
                          placeholder={t("notesPlaceholder")}
                          value={customer.notes}
                          onChange={(e) =>
                            setCustomer({ ...customer, notes: e.target.value })
                          }
                        />
                      </label>
                    </div>
                  </fieldset>
                  <fieldset disabled={!!busy}>
                    <legend>
                      <span>02</span>
                      {t("pickupTitle")}
                    </legend>
                    {slotsLoading ? (
                      <p role="status">{t("loading")}</p>
                    ) : slotsError ? (
                      <div role="alert">
                        <p>{t("slotsError")}</p>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={loadSlots}
                        >
                          {t("retry")}
                        </button>
                      </div>
                    ) : (
                      <div className="form-grid">
                        <label>
                          {t("date")}
                          <select
                            required
                            value={date}
                            onChange={(e) => {
                              setDate(e.target.value);
                              setSlot("");
                            }}
                          >
                            <option value="">{t("chooseDate")}</option>
                            {slots.map((s) => (
                              <option
                                value={s.date}
                                key={s.date}
                                disabled={!s.slots.some((x) => x.remaining > 0)}
                              >
                                {new Intl.DateTimeFormat(
                                  lang === "it" ? "it-IT" : "en-GB",
                                  {
                                    weekday: "short",
                                    day: "numeric",
                                    month: "long",
                                    timeZone: "Europe/Rome",
                                  },
                                ).format(new Date(`${s.date}T12:00:00Z`))}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          {t("slot")}
                          <select
                            required
                            value={slot}
                            disabled={!date}
                            onChange={(e) => setSlot(e.target.value)}
                          >
                            <option value="">{t("chooseSlot")}</option>
                            {availableSlots.map((s) => (
                              <option
                                key={s.time}
                                value={s.time}
                                disabled={s.remaining === 0}
                              >
                                {s.time}
                                {s.remaining === 0 ? ` · ${t("full")}` : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                    <div className="notice">
                      <LockKeyhole size={18} />
                      <p>{t("privateAddress")}</p>
                    </div>
                  </fieldset>
                  <fieldset disabled={!!busy}>
                    <legend>
                      <span>03</span>
                      {t("payment")}
                    </legend>
                    <p className="small muted">{t("paymentNotice")}</p>
                    <div className="payment-option selected">
                      <Banknote size={22} />
                      <span>{t("payOnPickup")}</span>
                      <Check size={18} />
                    </div>
                  </fieldset>
                  <div className="checkout-bottom">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        required
                        checked={accepted}
                        onChange={(e) => setAccepted(e.target.checked)}
                        disabled={!!busy}
                      />
                      <span>
                        {t("accept")}{" "}
                        <Link to="/terms" target="_blank">
                          {t("terms")}
                        </Link>{" "}
                        {t("and")}{" "}
                        <Link to="/privacy" target="_blank">
                          {t("privacy")}
                        </Link>
                        .
                      </span>
                    </label>
                    {error && (
                      <p className="inline-error" role="alert">
                        {t(error) == error ? t("saveFailed") : t(error)}
                      </p>
                    )}
                    {invalidCart && (
                      <p className="inline-error">
                        {t("unavailableItems")}{" "}
                        <Link to="/carrello">{t("cart")}</Link>
                      </p>
                    )}
                    <button
                      className="button order-button"
                      type="submit"
                      disabled={submitDisabled}
                    >
                      {busy ? (
                        <>
                          <span className="spinner" />
                          {t(busy)}
                        </>
                      ) : (
                        <>
                          {t("orderButton")} ·{" "}
                          {money(total)}
                          <ArrowRight size={17} />
                        </>
                      )}
                    </button>
                  </div>
                </form>
                <OrderSummary>
                  <span className="secure-note">
                    <ShieldCheck size={15} />
                    {t("payOnPickup")}
                  </span>
                </OrderSummary>
              </div>
            )}
          </ProductsState>
        </div>
      </section>
    </>
  );
}
export function Confirmation() {
  const { t, lang, local, money } = useStore();
  const order = useLocation().state?.order;
  if (!order) return <Empty title={t("noOrder")} text={t("noOrderText")} />;
  return (
    <section className="section">
      <div className="container confirmation">
        <div className="success-icon">
          <Check size={35} />
        </div>
        <p className="eyebrow">{t("successEyebrow")}</p>
        <h1>{t("successTitle")}</h1>
        <p className="confirmation-intro">{t("successText")}</p>
        <div className="confirmation-card">
          <div className="summary-row">
            <span>{t("reference")}</span>
            <strong>{order.reference}</strong>
          </div>
          <div className="summary-row">
            <span>{t("orderStatus")}</span>
            <span className="status-pill">{t("pending")}</span>
          </div>
          <div className="confirmation-items">
            {order.items.map((item) => {
              const description = itemDescription(item, lang);
              return (
                <div className="summary-row" key={lineKey(item.productId, item.variantId)}>
                  <span>
                    {item.quantity} × {local(item, "title")}
                    {description && <small className="muted"> · {description}</small>}
                  </span>
                  <strong>{money(item.price * item.quantity)}</strong>
                </div>
              );
            })}
          </div>
          <div className="summary-row total">
            <span>{t("total")}</span>
            <strong>{money(order.total)}</strong>
          </div>
          <p>
            <CalendarDays size={16} />
            {new Intl.DateTimeFormat(lang === "it" ? "it-IT" : "en-GB", {
              dateStyle: "long",
            }).format(new Date(`${order.pickupDate}T12:00:00`))}
          </p>
          <p>
            <Clock3 size={16} />
            {order.pickupSlot}
          </p>
          <p className="muted small">
            <ShieldCheck size={16} />
            {t("paymentStatus")}
          </p>
          <div className="notice">
            <LockKeyhole size={18} />
            <p>{t("privateAddress")}</p>
          </div>
        </div>
        <Link className="button" to="/catalogo">
          {t("continue")}
          <ArrowRight size={17} />
        </Link>
      </div>
    </section>
  );
}
