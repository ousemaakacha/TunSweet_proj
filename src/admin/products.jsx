import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus, Copy, PenLine, Trash2 } from "lucide-react";
import { productService, money, imageStorageService } from "./services";
import { it as t } from "./text";
import {
  ResourceState,
  useResource,
  useAction,
  useAdminUI,
  Field,
  Badge,
  Empty,
} from "./ui";
import { ImageManager, ImagePreview } from "./images";
export function Products() {
  const r = useResource(productService.list),
    { run, busy } = useAction(),
    { confirm } = useAdminUI();
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [availability, setAvailability] = useState(""),
    [publication, setPublication] = useState(""),
    [sort, setSort] = useState("title"),
    [direction, setDirection] = useState("asc");
  const rows = (r.data || [])
    .filter(
      (p) =>
        p.title.toLowerCase().includes(query.toLowerCase()) &&
        (!category || p.category === category) &&
        (!availability ||
          (availability === "yes"
            ? p.available && p.stock > 0
            : !p.available || p.stock === 0)) &&
        (!publication ||
          (publication === "published"
            ? p.published !== false
            : p.published === false)),
    )
    .sort(
      (a, b) =>
        (typeof a[sort] === "number"
          ? a[sort] - b[sort]
          : String(a[sort] || "").localeCompare(String(b[sort] || ""), "it")) *
        (direction === "asc" ? 1 : -1),
    );
  const change = (p, fields) =>
    run(async () => {
      await productService.save({ ...p, ...fields }, p.id);
      await r.reload();
    });
  return (
    <>
      <div className="admin-section-top">
        <p>
          {rows.length} {t.products.toLowerCase()}
        </p>
        <Link className="button" to="/admin/products/new">
          <Plus size={17} />
          {t.newProduct}
        </Link>
      </div>
      <div className="admin-filters">
        <Field
          label={t.search}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Field label={t.category}>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">{t.all}</option>
            {[...new Set((r.data || []).map((p) => p.category))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label={t.availability}>
          <select
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
          >
            <option value="">{t.all}</option>
            <option value="yes">{t.available}</option>
            <option value="no">{t.unavailable}</option>
          </select>
        </Field>
        <Field label={t.publication}>
          <select
            value={publication}
            onChange={(e) => setPublication(e.target.value)}
          >
            <option value="">{t.all}</option>
            <option value="published">{t.published}</option>
            <option value="draft">{t.draft}</option>
          </select>
        </Field>
        <Field label={t.sort}>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {[
              ["title", t.name],
              ["price", t.price],
              ["stock", t.stock],
              ["createdAt", t.created],
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
            <option value="asc">{t.asc}</option>
            <option value="desc">{t.desc}</option>
          </select>
        </Field>
      </div>
      <ResourceState resource={r}>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                {[t.products, t.price, t.stock, t.publication, t.actions].map(
                  (s) => (
                    <th key={s}>{s}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td data-label={t.products}>
                    <div className="admin-product-cell">
                      <ImagePreview url={p.image} alt={p.title} />
                      <div>
                        <Link to={`/admin/products/${p.id}/edit`}>
                          <strong>{p.title}</strong>
                        </Link>
                        <small>{p.category}</small>
                        {p.featured && <Badge>{t.featured}</Badge>}
                      </div>
                    </div>
                  </td>
                  <td data-label={t.price}>{money(p.price)}</td>
                  <td data-label={t.stock}>
                    {p.stock}
                    <small>{p.available ? t.available : t.unavailable}</small>
                  </td>
                  <td data-label={t.publication}>
                    <Badge>
                      {p.published === false ? t.draft : t.published}
                    </Badge>
                  </td>
                  <td data-label={t.actions}>
                    <div className="admin-actions">
                      <Link
                        title={t.edit}
                        aria-label={`${t.edit} ${p.title}`}
                        to={`/admin/products/${p.id}/edit`}
                      >
                        <PenLine size={17} />
                      </Link>
                      <button
                        disabled={busy}
                        title={t.duplicate}
                        aria-label={`${t.duplicate} ${p.title}`}
                        onClick={() =>
                          run(async () => {
                            const { id, createdAt, updatedAt, ...copy } = p;
                            await productService.save({
                              ...copy,
                              title: p.title + t.duplicateSuffix,
                              published: false,
                            });
                            await r.reload();
                          })
                        }
                      >
                        <Copy size={17} />
                      </button>
                      <button
                        disabled={busy}
                        aria-label={`${t.remove} ${p.title}`}
                        onClick={async () => {
                          if (await confirm(t.confirmDelete))
                            run(async () => {
                              await productService.remove(p.id);
                              await r.reload();
                            }, t.removed);
                        }}
                      >
                        <Trash2 size={17} />
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => change(p, { available: !p.available })}
                      >
                        {p.available ? t.unavailable : t.available}
                      </button>
                      <button
                        disabled={busy}
                        aria-pressed={p.featured}
                        onClick={() => change(p, { featured: !p.featured })}
                      >
                        {t.featured}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <Empty text={t.noMatch} />}
      </ResourceState>
    </>
  );
}
const blank = {
  title: "",
  titleEn: "",
  category: "",
  description: "",
  descriptionEn: "",
  price: 0,
  stock: 0,
  format: "",
  formatEn: "",
  ingredients: [],
  ingredientsEn: [],
  allergens: [],
  allergensEn: [],
  available: true,
  featured: false,
  published: false,
  image: "",
  imagePosition: "center",
  images: [],
  variants: [],
};
export function ProductForm() {
  const { id } = useParams(),
    navigate = useNavigate(),
    r = useResource(
      () => (id ? productService.get(id) : Promise.resolve(blank)),
      id,
    );
  const [form, setForm] = useState(blank),
    [uploadBusy, setUploadBusy] = useState(false),
    [error, setError] = useState("");
  const removed = useRef([]),
    { run, busy } = useAction(),
    { notify } = useAdminUI();
  useEffect(() => {
    if (r.data) {
      const p = r.data;
      setForm({
        ...blank,
        ...p,
        published: p.published !== false,
        images: p.images?.length
          ? p.images
          : p.image
            ? [
                {
                  url: p.image,
                  source: "external",
                  altIt: p.title,
                  altEn: p.titleEn || "",
                  isPrimary: true,
                  sortOrder: 0,
                },
              ]
            : [],
      });
      removed.current = [];
    }
  }, [r.data]);
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));

  function updateVariant(variantIndex, field, value) {
    setForm((currentForm) => {
      const variants = currentForm.variants.map((variant, index) => {
        if (index !== variantIndex) {
          return variant;
        }
        return { ...variant, [field]: value };
      });

      return { ...currentForm, variants };
    });
  }

  const submit = async (e) => {
    e.preventDefault();
    if (uploadBusy) return;
    if (
      !form.title.trim() ||
      !form.category.trim() ||
      !Number.isFinite(form.price) ||
      form.price < 0 ||
      !Number.isSafeInteger(form.stock) ||
      form.stock < 0 ||
      !form.images.length ||
      form.images.filter((i) => i.isPrimary).length !== 1
    ) {
      setError(t.productRequired);
      return;
    }
    setError("");
    let cleanupFailed = false;
    const ok = await run(async () => {
      await productService.save(
        {
          ...form,
          image: form.images.find((i) => i.isPrimary).url,
          imagePosition: form.images
            .find((i) => i.isPrimary)
            .url.includes("pastries-atlas.png")
            ? form.imagePosition
            : "center",
          ...Object.fromEntries(
            ["ingredients", "ingredientsEn", "allergens", "allergensEn"].map(
              (key) => [
                key,
                form[key].map((value) => value.trim()).filter(Boolean),
              ],
            ),
          ),
        },
        id,
      );
      for (const image of removed.current.filter(
        (i) => !form.images.some((v) => v.publicId === i.publicId),
      )) {
        try {
          await imageStorageService.delete(image);
        } catch (e) {
          cleanupFailed = true;
          notify(e.message, true);
        }
      }
    }, "");
    if (ok) {
      if (!cleanupFailed) notify(t.saved);
      navigate("/admin/products");
    }
  };
  return (
    <ResourceState resource={r}>
      <form className="admin-form" onSubmit={submit}>
        <fieldset disabled={busy || uploadBusy}>
          <div className="admin-form-grid">
            <section className="admin-panel">
              <h2>{id ? t.editProduct : t.newProduct}</h2>
              {[
                "title",
                "titleEn",
                "description",
                "descriptionEn",
                "category",
                "format",
                "formatEn",
              ].map((key) => (
                <Field key={key} label={t[key]}>
                  {key.startsWith("description") ? (
                    <textarea
                      maxLength={5000}
                      rows={4}
                      value={form[key]}
                      onChange={(e) => set(key, e.target.value)}
                    />
                  ) : (
                    <input
                      required={["title", "category"].includes(key)}
                      maxLength={200}
                      value={form[key]}
                      onChange={(e) => set(key, e.target.value)}
                    />
                  )}
                </Field>
              ))}
              <div className="admin-form-grid">
                {["price", "stock"].map((key) => (
                  <Field
                    key={key}
                    label={t[key]}
                    type="number"
                    required
                    min="0"
                    step={key === "price" ? ".01" : "1"}
                    value={form[key]}
                    onChange={(e) =>
                      set(
                        key,
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                  />
                ))}
              </div>
            </section>
            <section className="admin-panel">
              <h2>{t.publication}</h2>
              {["available", "featured", "published"].map((key) => (
                <label className="admin-check" key={key}>
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => set(key, e.target.checked)}
                  />
                  {t[key]}
                </label>
              ))}
              {["ingredients", "ingredientsEn", "allergens", "allergensEn"].map(
                (key) => (
                  <Field
                    key={key}
                    label={t[key]}
                    value={form[key].join(",")}
                    onChange={(e) => set(key, e.target.value.split(","))}
                  />
                ),
              )}
              <h2>{t.variants}</h2>
              {form.variants.map((variant, index) => (
                <div className="admin-variant" key={variant.id || index}>
                  {["name", "nameEn", "format", "formatEn", "price", "stock"].map((field) => {
                    let label = t[field];
                    if (field === "name") {
                      label = t.variantName;
                    } else if (field === "nameEn") {
                      label = t.variantNameEn;
                    }

                    const isNumber = field === "price" || field === "stock";
                    const isRequired = field !== "nameEn" && field !== "formatEn";

                    return (
                      <Field
                        key={field}
                        label={label}
                        type={isNumber ? "number" : "text"}
                        min="0"
                        step={field === "price" ? ".01" : "1"}
                        required={isRequired}
                        value={variant[field] ?? ""}
                        onChange={(event) => {
                          let value = event.target.value;
                          if (isNumber) {
                            value = Number(value);
                          }
                          updateVariant(index, field, value);
                        }}
                      />
                    );
                  })}
                  <label className="admin-check">
                    <input
                      type="checkbox"
                      checked={variant.available}
                      onChange={(event) =>
                        updateVariant(index, "available", event.target.checked)
                      }
                    />
                    {t.available}
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      set(
                        "variants",
                        form.variants.filter((_, currentIndex) => currentIndex !== index),
                      )
                    }
                  >
                    {t.remove}
                  </button>
                </div>
              ))}
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  set("variants", [
                    ...form.variants,
                    {
                      name: "",
                      format: "",
                      price: 0,
                      stock: 0,
                      available: true,
                    },
                  ])
                }
              >
                {t.addVariant}
              </button>
            </section>
          </div>
        </fieldset>
        <fieldset disabled={busy}>
          <section className="admin-panel">
            <h2>{t.images}</h2>
            <ImageManager
              value={form.images}
              onChange={(v) => set("images", v)}
              onBusy={setUploadBusy}
              onRemoved={(image, erase) => {
                if (erase && image.source === "cloudinary")
                  removed.current.push(image);
              }}
            />
          </section>
        </fieldset>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="admin-save-bar">
          <Link to="/admin/products">{t.cancel}</Link>
          <button className="button" disabled={busy || uploadBusy}>
            {busy ? t.saving : t.save}
          </button>
        </div>
      </form>
    </ResourceState>
  );
}
