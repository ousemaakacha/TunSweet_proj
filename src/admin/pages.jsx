import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  ArrowUpRight,
  Package,
  ShoppingBag,
  CalendarDays,
  MessageSquare,
} from "lucide-react";
import {
  dashboardService,
  availabilityService,
  reviewService,
  customerService,
  settingsService,
  money,
  date,
  imageStorageService,
} from "./services";
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
import { OrderTable } from "./orders";
import { ImageManager } from "./images";
export function Dashboard() {
  const r = useResource(dashboardService.get),
    d = r.data;
  if (!d) return <ResourceState resource={r} />;
  const active = d.orders.filter((o) => o.status !== "Annullato"),
    stats = [
      [t.totalOrders, d.orders.length],
      [t.pending, d.orders.filter((o) => o.status === "In attesa").length],
      [t.completed, d.orders.filter((o) => o.status === "Completato").length],
      [
        t.revenue,
        money(
          active
            .filter((o) => o.paymentStatus === "paid")
            .reduce((s, o) => s + o.total, 0),
        ),
      ],
      [
        t.availableProducts,
        d.products.filter(
          (p) => p.published !== false && p.available && p.stock > 0,
        ).length,
      ],
      [t.soldOut, d.products.filter((p) => p.stock === 0).length],
      [
        t.lowStock,
        d.products.filter((p) => p.stock > 0 && p.stock <= d.settings.lowStock)
          .length,
      ],
      [
        t.pendingReviews,
        d.reviews.filter((v) => v.status === "In attesa").length,
      ],
    ];
  const totals = new Map();
  for (const o of active)
    for (const i of o.items)
      totals.set(i.title, (totals.get(i.title) || 0) + i.quantity);
  const next = active
    .filter(
      (o) =>
        o.status !== "Completato" &&
        o.pickupDate >=
          new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(
            new Date(),
          ),
    )
    .sort((a, b) =>
      (a.pickupDate + a.pickupSlot).localeCompare(b.pickupDate + b.pickupSlot),
    )
    .slice(0, 5);
  return (
    <ResourceState resource={r}>
      <section className="admin-welcome">
        <div>
          <p className="eyebrow">TUNISWEET · {t.admin}</p>
          <h2>{t.welcome}</h2>
          <p>{t.overview}</p>
        </div>
        <span className="admin-welcome-icon">
          <Package size={45} strokeWidth={1} />
        </span>
      </section>
      <div className="admin-stats">
        {stats.map(([label, value]) => (
          <article key={label}>
            <p>{label}</p>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <section className="admin-panel">
        <h2>{t.quickActions}</h2>
        <div className="admin-quick">
          {[
            ["/admin/products/new", t.newProduct, Plus],
            ["/admin/orders", t.orders, ShoppingBag],
            ["/admin/calendar", t.calendar, CalendarDays],
            ["/admin/reviews", t.reviews, MessageSquare],
          ].map(([url, label, Icon]) => (
            <Link key={url} to={url}>
              <Icon size={20} />
              <span>{label}</span>
              <ArrowUpRight size={17} />
            </Link>
          ))}
        </div>
      </section>
      <section className="admin-panel">
        <div className="admin-section-top">
          <h2>{t.latestOrders}</h2>
          <Link to="/admin/orders">{t.all} →</Link>
        </div>
        <OrderTable
          orders={[...d.orders]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 5)}
        />
      </section>
      <div className="admin-form-grid">
        <section className="admin-panel">
          <h2>{t.nextPickups}</h2>
          {next.length ? (
            next.map((o) => (
              <Link
                className="admin-summary-row"
                key={o.id}
                to={`/admin/orders/${o.id}`}
              >
                <span>
                  {date(o.pickupDate)}
                  <small>{o.pickupSlot}</small>
                </span>
                <strong>{o.customer.name}</strong>
              </Link>
            ))
          ) : (
            <Empty />
          )}
        </section>
        <section className="admin-panel">
          <h2>{t.bestsellers}</h2>
          {totals.size ? (
            [...totals]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([name, n]) => (
                <div className="admin-summary-row" key={name}>
                  <span>{name}</span>
                  <Badge>
                    {n} {t.units}
                  </Badge>
                </div>
              ))
          ) : (
            <Empty />
          )}
        </section>
      </div>
    </ResourceState>
  );
}
export function Calendar() {
  const r = useResource(async () => {
    const [days, records, orders] = await Promise.all([
      availabilityService.calendar(),
      availabilityService.list(),
      dashboardService.get().then((d) => d.orders),
    ]);
    return { days, records, orders };
  });
  const [selected, setSelected] = useState(""),
    [form, setForm] = useState(null),
    { run, busy } = useAction();
  const select = (day) => {
    setSelected(day.date);
    const existing = r.data.records.find((a) => a.date === day.date);
    setForm(
      existing
        ? structuredClone(existing)
        : {
            title: day.date,
            category: "pickup",
            date: day.date,
            enabled: day.enabled,
            notes: "",
            slots: day.slots.map(({ start, end, capacity }) => ({
              start,
              end,
              capacity,
            })),
          },
    );
  };
  const submit = async (e) => {
    e.preventDefault();
    await run(async () => {
      await availabilityService.save(form, form.id);
      await r.reload();
    });
  };
  const setSlot = (i, key, value) =>
    setForm({
      ...form,
      slots: form.slots.map((s, n) => (n === i ? { ...s, [key]: value } : s)),
    });
  return (
    <>
      <p className="admin-notice">{t.calendarIntro}</p>
      <ResourceState resource={r}>
        {r.data && (
          <div className="admin-calendar-layout">
            <section className="admin-panel">
              <h2>{t.selectDay}</h2>
              <div className="admin-calendar-grid">
                {r.data.days.map((d) => (
                  <button
                    className={selected === d.date ? "selected" : ""}
                    aria-pressed={selected === d.date}
                    key={d.date}
                    onClick={() => select(d)}
                  >
                    <small>
                      {new Intl.DateTimeFormat("it-IT", {
                        weekday: "short",
                      }).format(new Date(`${d.date}T12:00:00`))}
                    </small>
                    <strong>{d.date.slice(8)}</strong>
                    <small>
                      {new Intl.DateTimeFormat("it-IT", {
                        month: "short",
                      }).format(new Date(`${d.date}T12:00:00`))}
                    </small>
                    <span>
                      {d.enabled
                        ? `${d.slots.reduce((n, s) => n + s.occupied, 0)} / ${d.slots.reduce((n, s) => n + s.capacity, 0)}`
                        : t.closed}
                    </span>
                  </button>
                ))}
              </div>
            </section>
            {form ? (
              <form className="admin-panel" onSubmit={submit}>
                <fieldset disabled={busy}>
                  <h2>{date(selected)}</h2>
                  <label className="admin-check">
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={(e) =>
                        setForm({ ...form, enabled: e.target.checked })
                      }
                    />
                    {t.enabled}
                  </label>
                  <Field label={t.internalNotes}>
                    <textarea
                      rows={3}
                      maxLength={5000}
                      value={form.notes}
                      onChange={(e) =>
                        setForm({ ...form, notes: e.target.value })
                      }
                    />
                  </Field>
                  {form.slots.map((s, i) => {
                    const occupied = r.data.orders.filter(
                      (o) =>
                        o.status !== "Annullato" &&
                        o.pickupDate === selected &&
                        o.pickupSlot === `${s.start}–${s.end}`,
                    ).length;
                    return (
                      <div className="admin-slot" key={i}>
                        <div className="admin-form-grid">
                          <Field
                            label={t.start}
                            required
                            type="time"
                            value={s.start}
                            onChange={(e) =>
                              setSlot(i, "start", e.target.value)
                            }
                          />
                          <Field
                            label={t.end}
                            required
                            type="time"
                            value={s.end}
                            onChange={(e) => setSlot(i, "end", e.target.value)}
                          />
                          <Field
                            label={t.capacity}
                            required
                            type="number"
                            min={occupied}
                            max="1000"
                            value={s.capacity}
                            onChange={(e) =>
                              setSlot(i, "capacity", Number(e.target.value))
                            }
                          />
                        </div>
                        <p>
                          {t.occupied}: {occupied} · {t.remaining}:{" "}
                          {form.enabled
                            ? Math.max(0, s.capacity - occupied)
                            : 0}
                        </p>
                        <button
                          type="button"
                          disabled={!!occupied || form.slots.length === 1}
                          onClick={() =>
                            setForm({
                              ...form,
                              slots: form.slots.filter((_, n) => n !== i),
                            })
                          }
                        >
                          {t.remove}
                        </button>
                      </div>
                    );
                  })}
                  <div className="admin-actions">
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() =>
                        setForm({
                          ...form,
                          slots: [
                            ...form.slots,
                            { start: "16:00", end: "20:00", capacity: 4 },
                          ],
                        })
                      }
                    >
                      {t.addSlot}
                    </button>
                    <button className="button">
                      {busy ? t.saving : t.save}
                    </button>
                  </div>
                </fieldset>
                <h3>{t.pickups}</h3>
                <OrderTable
                  orders={r.data.orders.filter(
                    (o) =>
                      o.pickupDate === selected && o.status !== "Annullato",
                  )}
                />
              </form>
            ) : (
              <Empty text={t.selectDay} />
            )}
          </div>
        )}
      </ResourceState>
    </>
  );
}
export function Reviews() {
  const r = useResource(reviewService.list),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [rating, setRating] = useState(""),
    { run, busy } = useAction(),
    { confirm } = useAdminUI();
  const rows = (r.data || []).filter(
    (v) =>
      [v.author, v.text]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!status || v.status === status) &&
      (!rating || v.rating === Number(rating)),
  );
  const update = (v, status) =>
    run(async () => {
      await reviewService.save({ ...v, status }, v.id);
      await r.reload();
    });
  return (
    <>
      <div className="admin-filters">
        <Field
          label={t.reviewSearch}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Field label={t.status}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t.all}</option>
            {t.reviewStatuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label={t.rating}>
          <select value={rating} onChange={(e) => setRating(e.target.value)}>
            <option value="">{t.all}</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Field>
      </div>
      <ResourceState resource={r}>
        <div className="admin-review-grid">
          {rows.map((v) => (
            <article className="admin-panel" key={v.id}>
              <div className="admin-section-top">
                <strong>{v.author}</strong>
                <Badge>{v.status}</Badge>
              </div>
              <p
                aria-label={`${t.rating}: ${v.rating}/5`}
                className="admin-stars"
              >
                {"★".repeat(v.rating)}
                {"☆".repeat(5 - v.rating)}
              </p>
              <p className="admin-preserve">{v.text}</p>
              <small>{date(v.createdAt)}</small>
              <div className="admin-actions">
                <button disabled={busy} onClick={() => update(v, "Approvata")}>
                  {v.status === "Nascosta" ? t.showReview : t.approve}
                </button>
                <button disabled={busy} onClick={() => update(v, "Nascosta")}>
                  {t.hideReview}
                </button>
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (await confirm(t.confirmDelete))
                      run(async () => {
                        await reviewService.remove(v.id);
                        await r.reload();
                      }, t.removed);
                  }}
                >
                  {t.remove}
                </button>
              </div>
            </article>
          ))}
        </div>
        {!rows.length && <Empty text={t.noMatch} />}
      </ResourceState>
    </>
  );
}
export function Customers() {
  const r = useResource(customerService.list),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(null),
    [notes, setNotes] = useState(""),
    { run, busy } = useAction();
  const rows = (r.data || []).filter((c) =>
    [c.name, c.email, c.phone]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const save = async (e) => {
    e.preventDefault();
    await run(async () => {
      await customerService.save(
        {
          title: selected.name,
          category: "customer",
          name: selected.name,
          email: selected.email,
          phone: selected.phone,
          notes,
        },
        selected.id,
      );
      setSelected(null);
      await r.reload();
    });
  };
  return (
    <>
      <div className="admin-filters">
        <Field
          label={t.search}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <ResourceState resource={r}>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                {[
                  t.name,
                  t.email,
                  t.phone,
                  t.orderCount,
                  t.spent,
                  t.lastOrder,
                  t.actions,
                ].map((v) => (
                  <th key={v}>{v}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.email || c.phone}>
                  <td data-label={t.name}>{c.name}</td>
                  <td data-label={t.email}>{c.email}</td>
                  <td data-label={t.phone}>{c.phone}</td>
                  <td data-label={t.orderCount}>{c.orderCount}</td>
                  <td data-label={t.spent}>{money(c.totalSpent)}</td>
                  <td data-label={t.lastOrder}>{date(c.lastOrder)}</td>
                  <td data-label={t.actions}>
                    <button
                      className="admin-text-link"
                      onClick={() => {
                        setSelected(c);
                        setNotes(c.notes);
                      }}
                    >
                      {t.customerHistory}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <Empty />}
        {selected && (
          <section className="admin-panel">
            <div className="admin-section-top">
              <h2>{selected.name}</h2>
              <button onClick={() => setSelected(null)}>{t.close}</button>
            </div>
            <OrderTable orders={selected.orders} />
            <form onSubmit={save}>
              <Field label={t.internalNotes}>
                <textarea
                  maxLength={5000}
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
              <button className="button" disabled={busy}>
                {busy ? t.saving : t.save}
              </button>
            </form>
          </section>
        )}
      </ResourceState>
    </>
  );
}
export function Settings() {
  const r = useResource(settingsService.list),
    [form, setForm] = useState(null),
    [uploadBusy, setUploadBusy] = useState(false),
    { run, busy } = useAction();
  const removed = useRef([]);
  useEffect(() => {
    if (r.data) setForm(r.data);
  }, [r.data]);
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  const submit = async (e) => {
    e.preventDefault();
    if (uploadBusy) return;
    await run(async () => {
      const saved = await settingsService.save(form, form.id);
      setForm(saved);
      for (const image of removed.current) {
        if (image.publicId !== saved.logoPublicId)
          await imageStorageService.delete(image);
      }
      removed.current = [];
    });
  };
  return (
    <ResourceState resource={r}>
      {form && (
        <form className="admin-form" onSubmit={submit}>
          <p className="admin-notice">{t.settingsIntro}</p>
          <fieldset disabled={busy}>
            <div className="admin-form-grid">
              <section className="admin-panel">
                <h2>{t.settings}</h2>
                {[
                  ["name", t.shopName, "text"],
                  ["email", t.email, "email"],
                  ["whatsapp", t.whatsapp, "tel"],
                  ["instagram", t.instagram, "url"],
                  ["primaryColor", t.primaryColor, "color"],
                ].map(([key, label, type]) => (
                  <Field
                    key={key}
                    label={label}
                    type={type}
                    required={key === "name"}
                    value={form[key]}
                    onChange={(e) => set(key, e.target.value)}
                  />
                ))}
                {["pickupMessage", "contactText"].map((key) => (
                  <Field label={t[key]} key={key}>
                    <textarea
                      maxLength={5000}
                      rows={3}
                      value={form[key]}
                      onChange={(e) => set(key, e.target.value)}
                    />
                  </Field>
                ))}
              </section>
              <section className="admin-panel">
                <h2>{t.defaultSlot}</h2>
                <div className="admin-form-grid">
                  <Field
                    label={t.start}
                    type="time"
                    required
                    value={form.start}
                    onChange={(e) => set("start", e.target.value)}
                  />
                  <Field
                    label={t.end}
                    type="time"
                    required
                    value={form.end}
                    onChange={(e) => set("end", e.target.value)}
                  />
                </div>
                <h3>{t.weekdays}</h3>
                {t.days.map((day, index) => (
                  <label className="admin-check" key={day}>
                    <input
                      type="checkbox"
                      checked={form.weekdays.includes(index)}
                      onChange={(e) =>
                        set(
                          "weekdays",
                          e.target.checked
                            ? [...form.weekdays, index]
                            : form.weekdays.filter((n) => n !== index),
                        )
                      }
                    />
                    {day}
                  </label>
                ))}
                <Field
                  label={t.threshold}
                  type="number"
                  min="0"
                  max="100000"
                  required
                  value={form.lowStock}
                  onChange={(e) => set("lowStock", Number(e.target.value))}
                />
              </section>
            </div>
            <section className="admin-panel">
              <h2>{t.logo}</h2>
              <p>{t.settingsLogo}</p>
              <ImageManager
                max={1}
                value={
                  form.logo
                    ? [
                        {
                          url: form.logo,
                          publicId: form.logoPublicId,
                          source: form.logoPublicId ? "cloudinary" : "external",
                          altIt: form.name,
                          altEn: form.name,
                          isPrimary: true,
                          sortOrder: 0,
                        },
                      ]
                    : []
                }
                onChange={(images) =>
                  setForm((old) => {
                    const next = { ...old, logo: images[0]?.url || "" };
                    if (images[0]?.publicId)
                      next.logoPublicId = images[0].publicId;
                    else delete next.logoPublicId;
                    return next;
                  })
                }
                onBusy={setUploadBusy}
                onRemoved={(image, erase) => {
                  if (erase) removed.current.push(image);
                }}
              />
            </section>
          </fieldset>
          <div className="admin-save-bar">
            <button className="button" disabled={busy || uploadBusy}>
              {busy ? t.saving : t.save}
            </button>
          </div>
        </form>
      )}
    </ResourceState>
  );
}
