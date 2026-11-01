import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { orderService, money, date, exportOrders } from "./services";
import { it as t } from "./text";
import {
  useResource,
  ResourceState,
  useAction,
  useAdminUI,
  Field,
  Badge,
  Empty,
} from "./ui";
export function OrderTable({ orders }) {
  return orders.length ? (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {[t.reference, t.customer, t.pickupDate, t.status, t.total].map(
              (v) => (
                <th key={v}>{v}</th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td data-label={t.reference}>
                <Link className="admin-text-link" to={`/admin/orders/${o.id}`}>
                  {o.reference}
                </Link>
              </td>
              <td data-label={t.customer}>
                {o.customer.name}
                <small>{o.customer.email}</small>
              </td>
              <td data-label={t.pickupDate}>
                {date(o.pickupDate)}
                <small>{o.pickupSlot}</small>
              </td>
              <td data-label={t.status}>
                <Badge>{o.status}</Badge>
              </td>
              <td data-label={t.total}>{money(o.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty />
  );
}
export function Orders() {
  const r = useResource(orderService.list);
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [payment, setPayment] = useState(""),
    [pickup, setPickup] = useState(""),
    [sort, setSort] = useState("createdAt"),
    [direction, setDirection] = useState("desc");
  const rows = (r.data || [])
    .filter(
      (o) =>
        [o.reference, o.customer.name, o.customer.email, o.customer.phone]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (!status || o.status === status) &&
        (!payment || o.paymentStatus === payment) &&
        (!pickup || o.pickupDate === pickup),
    )
    .sort(
      (a, b) =>
        (sort === "total"
          ? a.total - b.total
          : String(a[sort]).localeCompare(String(b[sort]))) *
        (direction === "asc" ? 1 : -1),
    );
  return (
    <>
      <div className="admin-section-top">
        <p>
          {rows.length} {t.orders.toLowerCase()}
        </p>
        <button
          className="button secondary"
          disabled={!rows.length}
          onClick={() => exportOrders(rows)}
        >
          {t.csv}
        </button>
      </div>
      <div className="admin-filters">
        <Field
          label={t.orderSearch}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Field label={t.status}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t.all}</option>
            {t.statuses.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label={t.payment}>
          <select value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="">{t.all}</option>
            {[...new Set((r.data || []).map((o) => o.paymentStatus))].map(
              (v) => (
                <option key={v} value={v}>
                  {v === "paid" ? t.paid : v === "unpaid" ? t.unpaid : v}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field
          label={t.pickupDate}
          type="date"
          value={pickup}
          onChange={(e) => setPickup(e.target.value)}
        />
        <Field label={t.sort}>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {[
              ["createdAt", t.created],
              ["pickupDate", t.pickupDate],
              ["total", t.total],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.sort}>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
          >
            <option value="desc">{t.desc}</option>
            <option value="asc">{t.asc}</option>
          </select>
        </Field>
      </div>
      <ResourceState resource={r}>
        <OrderTable orders={rows} />
      </ResourceState>
    </>
  );
}
export function OrderDetail() {
  const { id } = useParams(),
    r = useResource(() => orderService.get(id), id),
    { run, busy } = useAction(),
    { confirm } = useAdminUI();
  const [status, setStatus] = useState("");
  useEffect(() => setStatus(""), [id]);
  const o = r.data;
  const update = async (value) => {
    if (value === "Annullato" && !(await confirm(t.cancelOrderNotice))) return;
    await run(async () => {
      await orderService.save({ status: value }, id);
      setStatus("");
      await r.reload();
    });
  };
  return (
    <ResourceState resource={r}>
      {o && (
        <>
          <div className="admin-section-top no-print">
            <Link to="/admin/orders">← {t.orders}</Link>
            <div className="admin-actions">
              <button
                className="button secondary"
                onClick={() => window.print()}
              >
                {t.print}
              </button>
              <button
                className="button secondary"
                onClick={() => exportOrders([o])}
              >
                {t.csv}
              </button>
            </div>
          </div>
          <section className="admin-panel admin-order-heading">
            <p className="eyebrow">TUNISWEET</p>
            <h2>{o.reference}</h2>
            <Badge>{o.status}</Badge>
            <p>
              {date(o.createdAt)} · {t.updated}: {date(o.updatedAt)}
            </p>
          </section>
          <div className="admin-form-grid">
            <section className="admin-panel">
              <h2>{t.customer}</h2>
              <p>
                <strong>{o.customer.name}</strong>
              </p>
              <p>{o.customer.email}</p>
              <p>{o.customer.phone}</p>
              <h3>{t.notes}</h3>
              <p className="admin-preserve">{o.customer.notes || "—"}</p>
            </section>
            <section className="admin-panel">
              <h2>{t.pickupDate}</h2>
              <p>
                {date(o.pickupDate)} · {o.pickupSlot}
              </p>
              <p>
                {t.paymentMethod}:{" "}
                {o.paymentMethod === "pay_on_pickup"
                  ? t.payOnPickup
                  : o.paymentMethod}
              </p>
              <p>
                {t.payment}:{" "}
                {o.paymentStatus === "paid"
                  ? t.paid
                  : o.paymentStatus === "unpaid"
                    ? t.unpaid
                    : o.paymentStatus}
              </p>
              {o.paymentMethod === "pay_on_pickup" &&
                o.paymentStatus === "unpaid" &&
                o.status !== "Annullato" && (
                  <button
                    className="button secondary no-print"
                    disabled={busy}
                    onClick={async () => {
                      if (!(await confirm(t.markPaidNotice))) return;
                      await run(async () => {
                        await orderService.save({ paymentStatus: "paid" }, id);
                        await r.reload();
                      });
                    }}
                  >
                    {t.markPaid}
                  </button>
                )}
              <div className="admin-notice">{t.calendarIntro}</div>
            </section>
          </div>
          <section className="admin-panel">
            <h2>{t.products}</h2>
            {o.items.map((i) => (
              <div className="admin-summary-row" key={i.productId}>
                <span>
                  {i.quantity} × {i.title}
                </span>
                <strong>{money(i.price * i.quantity)}</strong>
              </div>
            ))}
            <div className="admin-summary-row">
              <strong>{t.total}</strong>
              <strong>{money(o.total)}</strong>
            </div>
          </section>
          <form
            className="admin-panel no-print"
            onSubmit={(e) => {
              e.preventDefault();
              update(status || o.status);
            }}
          >
            <Field label={t.status}>
              <select
                disabled={busy || o.status === "Annullato"}
                value={status || o.status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {t.statuses.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <div className="admin-actions">
              <button
                className="button"
                disabled={busy || o.status === "Annullato"}
              >
                {busy ? t.saving : t.save}
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={busy || o.status === "Annullato"}
                onClick={() => update("Annullato")}
              >
                {t.cancelOrder}
              </button>
            </div>
          </form>
        </>
      )}
    </ResourceState>
  );
}
