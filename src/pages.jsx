import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Leaf,
  Heart,
  HandHeart,
  Clock3,
  PackageCheck,
  ArrowRight,
  ArrowUpRight,
  Search,
  SlidersHorizontal,
  ShieldCheck,
  MessageCircle,
  Mail,
  Instagram,
  Flower2,
  ShoppingBag,
} from "lucide-react";
import { useStore } from "./state";
import {
  ProductCard,
  ProductsState,
  Empty,
  Quantity,
  ReviewCards,
  FinalCTA,
  PageHeading,
  Photo,
} from "./components";
export function Home() {
  const { t, products, reviews } = useStore();
  const [category, setCategory] = useState("all");
  const featured = products
    .filter((p) => (category === "all" ? p.featured : p.category === category))
    .slice(0, 4);
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="little-line" />
              {t("heroEyebrow")}
            </p>
            <h1>
              {t("heroTitle")}
              <br />
              <em>{t("heroTitle2")}</em>
            </h1>
            <p className="hero-description">{t("heroText")}</p>
            <div className="hero-actions">
              <Link className="button" to="/catalogo">
                {t("discover")}
                <ArrowRight size={17} />
              </Link>
              <a className="link-button" href="#come-ordinare">
                {t("how")}
                <ArrowUpRight size={17} />
              </a>
            </div>
            <div className="hero-features">
              <span>
                <HandHeart size={16} />
                {t("handcrafted")}
              </span>
              <i />
              <span>
                <Leaf size={16} />
                {t("familyRecipes")}
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <img
              className="hero-image"
              src="/images/hero.png"
              alt={t("pastryPhotoAlt")}
            />
            <div className="handmade-seal">
              <Flower2 size={22} strokeWidth={1} />
              <span>{t("handmadeSeal")}</span>
              <small>TUNISWEET</small>
            </div>
            <div className="hero-caption">
              <span>✳</span>
              {t("heroNote")}
            </div>
          </div>
        </div>
      </section>
      <section className="trust-strip">
        <div className="container trust-grid">
          {[
            [Leaf, "trust1", "trust1Text"],
            [Heart, "trust2", "trust2Text"],
            [HandHeart, "trust3", "trust3Text"],
            [Clock3, "trust4", "trust4Text"],
          ].map(([Icon, title, text]) => (
            <div key={title}>
              <Icon size={25} strokeWidth={1.2} />
              <span>
                <strong>{t(title)}</strong>
                <small>{t(text)}</small>
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="section featured-section">
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t("favoritesEyebrow")}</p>
              <h2>{t("favoritesTitle")}</h2>
              <p>{t("favoritesText")}</p>
            </div>
            <Link className="link-button" to="/catalogo">
              {t("viewAll")}
              <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="category-tabs" aria-label={t("catalog")}>
            {["all", "makroudh", "baklawa", "almond", "sables"].map((c) => (
              <button
                className={category === c ? "active" : ""}
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
                key={c}
              >
                {c === "all" ? t("all") : t("categories")[c] || c}
              </button>
            ))}
          </div>
          <ProductsState>
            <div className="product-grid">
              {featured.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </ProductsState>
        </div>
      </section>
      <section className="story-section">
        <div className="container story-grid">
          <div className="story-photo">
            <img
              src="/images/hero.png"
              alt={t("pastryPhotoAlt")}
              loading="lazy"
            />
          </div>
          <div className="story-copy">
            <p className="eyebrow">{t("storyEyebrow")}</p>
            <h2>
              {t("storyTitle")}
              <br />
              <em>{t("storyTitle2")}</em>
            </h2>
            <p>{t("storyText")}</p>
            <Link className="link-button" to="/chi-siamo">
              {t("storyLink")}
              <ArrowUpRight size={17} />
            </Link>
          </div>
        </div>
      </section>
      <section className="section how-section" id="come-ordinare">
        <div className="container">
          <div className="center-heading">
            <p className="eyebrow">{t("howEyebrow")}</p>
            <h2>{t("howTitle")}</h2>
          </div>
          <div className="steps-grid">
            {t("steps").map(([title, text], i) => (
              <div key={title}>
                <span className="step-number">0{i + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      {reviews.length > 0 && (
        <section className="section reviews-section">
          <div className="container">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t("reviewEyebrow")}</p>
                <h2>{t("reviewTitle")}</h2>
              </div>
              <Link className="link-button" to="/recensioni">
                {t("allReviews")}
                <ArrowUpRight size={17} />
              </Link>
            </div>
            <ProductsState>
              <ReviewCards limit={3} />
            </ProductsState>
          </div>
        </section>
      )}
      <FinalCTA />
    </>
  );
}
export function Catalog() {
  const { t, lang, products, local } = useStore();
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [available, setAvailable] = useState("all"),
    [sort, setSort] = useState("recommended");
  const categories = [...new Set(products.map((p) => p.category))];
  let filtered = products.filter(
    (p) =>
      (category === "all" || p.category === category) &&
      (available === "all" || p.available) &&
      local(p, "title")
        .toLocaleLowerCase(lang)
        .includes(query.toLocaleLowerCase(lang)),
  );
  filtered.sort((a, b) =>
    sort === "priceLow"
      ? a.price - b.price
      : sort === "priceHigh"
        ? b.price - a.price
        : sort === "nameSort"
          ? local(a, "title").localeCompare(local(b, "title"), lang)
          : Number(b.featured) - Number(a.featured),
  );
  return (
    <>
      <PageHeading
        eyebrow={t("catalogEyebrow")}
        title={t("catalogTitle")}
        text={t("catalogText")}
      />
      <section className="section catalog-section">
        <div className="container">
          <div className="catalog-toolbar">
            <label className="search-field">
              <span className="sr-only">{t("search")}</span>
              <Search size={18} />
              <input
                type="search"
                placeholder={t("searchPlaceholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label>
              <span>{t("availability")}</span>
              <select
                value={available}
                onChange={(e) => setAvailable(e.target.value)}
              >
                <option value="all">{t("allAvailability")}</option>
                <option value="available">{t("availableOnly")}</option>
              </select>
            </label>
            <label>
              <span>{t("sort")}</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                {["recommended", "priceLow", "priceHigh", "nameSort"].map(
                  (s) => (
                    <option key={s} value={s}>
                      {t(s)}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
          <div className="category-tabs wrap">
            <button
              className={category === "all" ? "active" : ""}
              onClick={() => setCategory("all")}
            >
              {t("all")}
            </button>
            {categories.map((c) => (
              <button
                className={category === c ? "active" : ""}
                onClick={() => setCategory(c)}
                key={c}
              >
                {t("categories")[c] || c}
              </button>
            ))}
          </div>
          <ProductsState>
            <div className="results-count">
              <span>
                {filtered.length} {t("results")}
              </span>
              <button
                className="text-button"
                onClick={() => {
                  setQuery("");
                  setCategory("all");
                  setAvailable("all");
                  setSort("recommended");
                }}
              >
                <SlidersHorizontal size={13} />
                {t("reset")}
              </button>
            </div>
            {filtered.length ? (
              <div className="product-grid">
                {filtered.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            ) : (
              <Empty
                icon={Search}
                title={t("noResults")}
                text={t("noResultsText")}
              />
            )}
          </ProductsState>
        </div>
      </section>
    </>
  );
}
export function Product() {
  const { id } = useParams();
  const { t, products } = useStore();
  const p = products.find((p) => p.id === Number(id));
  return (
    <ProductsState>
      {p ? (
        <ProductDetail key={p.id} p={p} />
      ) : (
        <Empty title={t("notFound")} text="" />
      )}
    </ProductsState>
  );
}
function ProductDetail({ p }) {
  const { t, local, money, add, favorites, favorite, products } = useStore();
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(null);
  const liked = favorites.includes(p.id);
  return (
    <>
      <section className="section product-detail">
        <div className="container">
          <nav className="breadcrumbs">
            <Link to="/">{t("home")}</Link>
            <span>/</span>
            <Link to="/catalogo">{t("catalog")}</Link>
            <span>/</span>
            <span>{local(p, "title")}</span>
          </nav>
          <div className="detail-grid">
            <div>
              <Photo
                product={
                  selectedImage
                    ? {
                        ...p,
                        image: selectedImage.url,
                        images: [{ ...selectedImage, isPrimary: true }],
                      }
                    : p
                }
                className="detail-photo"
              />
              {p.images?.length > 1 && (
                <div className="product-gallery">
                  {p.images.map((image, index) => (
                    <button
                      key={`${image.url}-${index}`}
                      type="button"
                      aria-pressed={
                        selectedImage
                          ? selectedImage.url === image.url
                          : image.isPrimary
                      }
                      aria-label={
                        image.altIt || `${local(p, "title")} ${index + 1}`
                      }
                      onClick={() => setSelectedImage(image)}
                    >
                      <img
                        src={image.url}
                        alt={image.altIt || local(p, "title")}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="detail-copy">
              <p className="eyebrow">
                {t("categories")[p.category] || p.category}
              </p>
              <h1>{local(p, "title")}</h1>
              <p className="detail-description">{local(p, "description")}</p>
              <div className="detail-price">
                {money(p.price)}
                <small>{t("perBox")}</small>
              </div>
              <p>
                <span className={`stock-dot ${p.available ? "" : "off"}`} />
                {p.available
                  ? `${t("available")} · ${p.stock} ${t("stock")}`
                  : t("soldOut")}
              </p>
              <div className="format-box">
                <PackageCheck size={20} />
                <span>
                  <small>{t("format")}</small>
                  {local(p, "format")}
                </span>
              </div>
              <div className="detail-add">
                <Quantity
                  value={quantity}
                  max={p.stock}
                  onChange={setQuantity}
                />
                <button
                  className="button"
                  disabled={!p.available}
                  onClick={() => add(p, quantity)}
                >
                  {t("add")}
                  <ShoppingBag size={18} />
                </button>
                <button
                  className={`icon-button favorite-detail ${liked ? "liked" : ""}`}
                  aria-label={liked ? t("favoriteRemove") : t("favoriteAdd")}
                  aria-pressed={liked}
                  onClick={() => favorite(p.id)}
                >
                  <Heart fill={liked ? "currentColor" : "none"} size={22} />
                </button>
              </div>
              <p className="muted small">
                <Clock3 size={14} />
                {t("pickupOnly")}
              </p>
              <details open>
                <summary>{t("ingredients")}</summary>
                <p>{local(p, "ingredients").join(", ")}.</p>
              </details>
              <details open>
                <summary>{t("allergens")}</summary>
                <p>
                  <strong>{local(p, "allergens").join(", ")}.</strong>
                </p>
                <p className="small">{t("allergenNotice")}</p>
              </details>
              <Link className="link-button" to="/contatti">
                <MessageCircle size={16} />
                {t("question")}
                <ArrowUpRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>
      <section className="section related-section">
        <div className="container">
          <h2>{t("related")}</h2>
          <div className="product-grid">
            {products
              .filter((x) => x.id !== p.id)
              .sort(
                (a, b) =>
                  Number(b.category === p.category) -
                  Number(a.category === p.category),
              )
              .slice(0, 4)
              .map((p) => (
                <ProductCard product={p} key={p.id} />
              ))}
          </div>
        </div>
      </section>
    </>
  );
}
export function Favorites() {
  const { t, products, favorites } = useStore();
  const selected = products.filter((p) => favorites.includes(p.id));
  return (
    <>
      <PageHeading eyebrow={t("favorites")} title={t("favoriteTitle")} />
      <section className="section">
        <div className="container">
          <ProductsState>
            {selected.length ? (
              <div className="product-grid">
                {selected.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            ) : (
              <Empty
                icon={Heart}
                title={t("favoriteEmpty")}
                text={t("favoriteEmptyText")}
              />
            )}
          </ProductsState>
        </div>
      </section>
    </>
  );
}
export function OrderSummary({ children }) {
  const { t, lines, local, money, total } = useStore();
  return (
    <aside className="order-summary">
      <p className="eyebrow">TUNISWEET</p>
      <h2>{t("summary")}</h2>
      <div className="summary-products">
        {lines.map(
          ({ product: p, id, quantity }) =>
            p && (
              <div key={id}>
                <Photo product={p} />
                <span>
                  {local(p, "title")}
                  <small>
                    {quantity} × {money(p.price)}
                  </small>
                </span>
                <strong>{money(p.price * quantity)}</strong>
              </div>
            ),
        )}
      </div>
      <div className="summary-row">
        <span>{t("subtotal")}</span>
        <span>{money(total)}</span>
      </div>
      <div className="summary-row">
        <span>{t("pickup")}</span>
        <span>{t("free")}</span>
      </div>
      <div className="summary-row total">
        <span>{t("total")}</span>
        <strong>{money(total)}</strong>
      </div>
      {children}
    </aside>
  );
}
export function Cart() {
  const { t, lines, local, money, change, remove, invalidCart } = useStore();
  return (
    <>
      <PageHeading eyebrow={t("cart")} title={t("cartTitle")} />
      <section className="section">
        <div className="container">
          <ProductsState>
            {!lines.length ? (
              <Empty title={t("cartEmpty")} text={t("cartEmptyText")} />
            ) : (
              <div className="cart-layout">
                <div>
                  {invalidCart && (
                    <p className="inline-error" role="alert">
                      {t("unavailableItems")}
                    </p>
                  )}
                  <div className="cart-lines">
                    {lines.map(({ id, quantity, product: p }) => (
                      <article className="cart-line" key={id}>
                        {p ? (
                          <>
                            <Link to={`/dolci/${id}`}>
                              <Photo product={p} />
                            </Link>
                            <div className="cart-line-info">
                              <Link to={`/dolci/${id}`}>
                                <h3>{local(p, "title")}</h3>
                              </Link>
                              <p>{local(p, "format")}</p>
                              <span>{money(p.price)}</span>
                              <button
                                className="text-button remove-button"
                                onClick={() => remove(id)}
                              >
                                {t("remove")}
                              </button>
                              {(!p.available || quantity > p.stock) && (
                                <span className="inline-error">
                                  {t("stockChanged")}
                                </span>
                              )}
                            </div>
                            <div className="cart-line-controls">
                              <Quantity
                                value={quantity}
                                onChange={(n) => change(id, n)}
                                max={p.stock}
                              />
                              <strong>{money(p.price * quantity)}</strong>
                            </div>
                          </>
                        ) : (
                          <>
                            <p>{t("soldOut")}</p>
                            <button onClick={() => remove(id)}>
                              {t("remove")}
                            </button>
                          </>
                        )}
                      </article>
                    ))}
                  </div>
                  <Link className="link-button" to="/catalogo">
                    ← {t("continue")}
                  </Link>
                </div>
                <OrderSummary>
                  {invalidCart ? (
                    <button className="button" disabled>
                      {t("checkout")}
                    </button>
                  ) : (
                    <Link className="button" to="/checkout">
                      {t("checkout")}
                      <ArrowRight size={16} />
                    </Link>
                  )}
                  <p className="small muted">{t("cartNote")}</p>
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
export function About() {
  const { t, lang, shop } = useStore();
  return (
    <>
      <PageHeading
        eyebrow={t("storyEyebrow")}
        title={t("aboutTitle")}
        text={t("aboutIntro")}
      />
      <section className="section">
        <div className="container about-grid">
          <img src="/images/hero.png" alt={t("pastryPhotoAlt")} />
          <div>
            <p className="eyebrow">TUNISWEET</p>
            <h2>{t("aboutValue1")}</h2>
            <p>{shop.story[lang]}</p>
            <p>{t("aboutValueText1")}</p>
            <h2>{t("aboutValue2")}</h2>
            <p>{t("aboutValueText2")}</p>
            <Link className="button" to="/catalogo">
              {t("discover")}
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
      <FinalCTA />
    </>
  );
}
export function Reviews() {
  const { t } = useStore();
  return (
    <>
      <PageHeading
        eyebrow={t("reviewEyebrow")}
        title={t("reviewTitle")}
        text={t("reviewIntro")}
      />
      <section className="section">
        <div className="container">
          <ProductsState>
            <ReviewCards />
          </ProductsState>
        </div>
      </section>
      <FinalCTA />
    </>
  );
}
export function Contact() {
  const { t, lang, settings, shop } = useStore();
  const cards = [
    [
      MessageCircle,
      "whatsapp",
      shop.whatsapp
        ? "https://wa.me/" + shop.whatsapp.replace(/\D/g, "")
        : null,
      shop.whatsapp,
    ],
    [Instagram, "instagram", shop.instagram || null, shop.instagram],
    [
      Mail,
      "writeEmail",
      shop.email ? "mailto:" + shop.email : null,
      shop.email,
    ],
  ].filter(([, , url]) => url);
  return (
    <>
      <PageHeading
        eyebrow={t("contact")}
        title={t("contactTitle")}
        text={settings?.contactText || t("contactText")}
      />
      <section className="section">
        <div className="container">
          {cards.length > 0 && (
            <div className="contact-grid">
              {cards.map(([Icon, key, url, label]) => (
                <div className="contact-card" key={key}>
                  <Icon size={28} strokeWidth={1.3} />
                  <h2>{t(key)}</h2>
                  <p>{label}</p>
                  <a
                    className="link-button"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("ask")}
                    <ArrowUpRight size={16} />
                  </a>
                </div>
              ))}
            </div>
          )}
          <div className="pickup-info">
            <Clock3 size={30} />
            <div>
              <h2>{t("pickupInfo")}</h2>
              <p>{settings?.pickupMessage || t("pickupContact")}</p>
              <p>
                {shop.location[lang]} · {shop.hours[lang]}
              </p>
              <strong>{t("privateAddress")}</strong>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
export function Legal({ type }) {
  const { t } = useStore();
  return (
    <>
      <PageHeading
        eyebrow={t("legalEyebrow")}
        title={t(type)}
        text={t("legalIntro")}
      />
      <section className="section">
        <div className="container legal-copy">
          {t("legalSections")[type].map(([title, text], i) => (
            <section key={title}>
              <h2>
                {i + 1}. {title}
              </h2>
              <p>{text}</p>
            </section>
          ))}
        </div>
      </section>
    </>
  );
}
export function NotFound() {
  const { t } = useStore();
  return (
    <Empty
      icon={Search}
      title={t("page404")}
      text={t("page404Text")}
      to="/"
      button="backHome"
    />
  );
}
