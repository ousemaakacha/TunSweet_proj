import { useState, useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Heart,
  ShoppingBag,
  UserRound,
  Menu,
  X,
  Plus,
  Minus,
  Leaf,
  ArrowUpRight,
  Globe,
  Sparkles,
} from "lucide-react";
import { useStore } from "./state";
import { saveLocal } from "./services";
export function Logo() {
  const { t, settings } = useStore();
  return (
    <Link to="/" className="brand" aria-label="TUNISWEET">
      {settings?.logo ? (
        <img className="store-logo" src={settings.logo} alt={settings.name} />
      ) : (
        <span className="brand-mark">
          <Sparkles size={21} strokeWidth={1.3} />
        </span>
      )}
      <span>
        {settings?.name && settings.name !== "TUNISWEET" ? (
          settings.name
        ) : (
          <>
            TUNI<span className="brand-light">SWEET</span>
          </>
        )}
        <small>{t("brandTagline")}</small>
      </span>
    </Link>
  );
}
export function Header() {
  const { t, lang, setLang, cart, favorites } = useStore();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  return (
    <>
      <a className="skip-link" href="#main">
        {t("skip")}
      </a>
      <div className="announcement">
        <span>{t("announcement")}</span>
        <span className="announcement-right">
          <Leaf size={12} />
          {t("pickupOnly")}
        </span>
      </div>
      <header className="header">
        <div className="container header-inner">
          <Logo />
          <nav className="desktop-nav" aria-label={t("menu")}>
            {[
              ["/catalogo", "catalog"],
              ["/chi-siamo", "about"],
              ["/recensioni", "reviews"],
              ["/contatti", "contact"],
            ].map(([url, key]) => (
              <NavLink to={url} key={url}>
                {t(key)}
              </NavLink>
            ))}
          </nav>
          <div className="header-tools">
            <button
              className="language"
              onClick={() => setLang(lang === "it" ? "en" : "it")}
              aria-label={t("language")}
            >
              <Globe size={14} />
              {lang.toUpperCase()}
            </button>
            <Link
              className="icon-button favorites-header"
              to="/preferiti"
              aria-label={t("favorites")}
            >
              <Heart size={20} />
              {favorites.length > 0 && (
                <span className="count">{favorites.length}</span>
              )}
            </Link>
            <Link
              className="icon-button"
              to="/account"
              aria-label={t("account")}
            >
              <UserRound size={20} />
            </Link>
            <Link className="icon-button" to="/carrello" aria-label={t("cart")}>
              <ShoppingBag size={20} />
              <span className="count">
                {cart.reduce((s, i) => s + i.quantity, 0)}
              </span>
            </Link>
            <button
              className="icon-button mobile-toggle"
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? t("close") : t("menu")}
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {open && (
          <nav id="mobile-menu" className="mobile-menu">
            {[
              ["/catalogo", "catalog"],
              ["/chi-siamo", "about"],
              ["/recensioni", "reviews"],
              ["/contatti", "contact"],
              ["/preferiti", "favorites"],
            ].map(([url, key]) => (
              <NavLink key={url} to={url}>
                {t(key)}
                <ArrowUpRight size={16} />
              </NavLink>
            ))}
          </nav>
        )}
      </header>
    </>
  );
}
export function Footer() {
  const { t, lang, shop, setCookieOpen } = useStore();
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Logo />
          <p>{t("footerText")}</p>
          <span className="tiny-badge">
            <Leaf size={13} />
            {t("handcrafted")}
          </span>
        </div>
        <div>
          <h3>{t("explore")}</h3>
          {[
            ["/catalogo", "catalog"],
            ["/chi-siamo", "about"],
            ["/recensioni", "reviews"],
            ["/contatti", "contact"],
          ].map(([url, key]) => (
            <Link key={url} to={url}>
              {t(key)}
            </Link>
          ))}
        </div>
        <div>
          <h3>{t("help")}</h3>
          {shop.whatsapp && (
            <a
              href={`https://wa.me/${shop.whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
            >
              {t("whatsapp")}
              <ArrowUpRight size={12} />
            </a>
          )}
          {shop.instagram && (
            <a href={shop.instagram} target="_blank" rel="noreferrer">
              {t("instagram")}
              <ArrowUpRight size={12} />
            </a>
          )}
          {shop.email && <a href={`mailto:${shop.email}`}>{t("writeEmail")}</a>}
          <span>{shop.hours[lang]}</span>
        </div>
        <div>
          <h3>{t("legal")}</h3>
          {["privacy", "cookies", "terms"].map((key) => (
            <Link key={key} to={`/${key}`}>
              {t(key)}
            </Link>
          ))}
          <button className="text-button" onClick={() => setCookieOpen(true)}>
            {t("cookieSettings")}
          </button>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>
          © {new Date().getFullYear()} TUNISWEET. {t("footerNote")}
        </span>
        <span>
          {t("payOnPickup")} <span className="mini-flower">✳</span>
        </span>
      </div>
    </footer>
  );
}
export function Photo({ product, className = "" }) {
  const { local, lang, t } = useStore();
  const [failed, setFailed] = useState(false);
  const primary =
    product.images?.find((i) => i.isPrimary) || product.images?.[0];
  const url = primary?.url || product.image;
  useEffect(() => setFailed(false), [url]);
  if (!url?.includes("pastries-atlas.png"))
    return (
      <div className={`product-photo individual-photo ${className}`}>
        {failed ? (
          <span role="img" aria-label={local(product, "title")}>
            {t("photoUnavailable")}
          </span>
        ) : (
          <img
            src={url}
            alt={
              (lang === "en" ? primary?.altEn : primary?.altIt) ||
              local(product, "title")
            }
            onError={() => setFailed(true)}
          />
        )}
      </div>
    );
  return (
    <div
      className={`product-photo ${className}`}
      role="img"
      aria-label={local(product, "title")}
      style={{
        backgroundImage: `url("${product.image}")`,
        backgroundPosition: product.imagePosition,
      }}
    />
  );
}
export function ProductCard({ product: p }) {
  const { t, local, money, add, favorite, favorites } = useStore();
  const liked = favorites.includes(p.id);
  return (
    <article className="product-card">
      <div className="card-image">
        <Link to={`/dolci/${p.id}`} aria-label={local(p, "title")}>
          <Photo product={p} />
        </Link>
        {p.featured && (
          <span className="product-tag">{t("featuredLabel")}</span>
        )}
        {!p.available && (
          <span className="product-tag sold-out">{t("soldOut")}</span>
        )}
        <button
          className={`favorite-button ${liked ? "liked" : ""}`}
          aria-label={liked ? t("favoriteRemove") : t("favoriteAdd")}
          aria-pressed={liked}
          onClick={() => favorite(p.id)}
        >
          <Heart size={18} fill={liked ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="card-body">
        <span className="category-label">{t("categories")[p.category]}</span>
        <Link to={`/dolci/${p.id}`}>
          <h3>{local(p, "title")}</h3>
        </Link>
        <p className="product-format">{local(p, "format")}</p>
        <div className="card-bottom">
          <strong>{money(p.price)}</strong>
          <button
            onClick={() => add(p)}
            disabled={!p.available}
            className="add-button"
            aria-label={`${t("add")} ${local(p, "title")}`}
          >
            {t("add")}
            <Plus size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}
export function ProductsState({ children }) {
  const { t, loading, error, refresh } = useStore();
  if (loading)
    return (
      <div className="status-box" role="status">
        <span className="spinner" />
        {t("loading")}
      </div>
    );
  if (error)
    return (
      <div className="status-box error" role="alert">
        <p>{t("apiError")}</p>
        <button className="button secondary" onClick={refresh}>
          {t("retry")}
        </button>
      </div>
    );
  return children;
}
export function Empty({
  icon: Icon = ShoppingBag,
  title,
  text,
  to = "/catalogo",
  button = "discover",
}) {
  const { t } = useStore();
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={36} strokeWidth={1} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      <Link className="button" to={to}>
        {t(button)}
        <ArrowRight size={16} />
      </Link>
    </div>
  );
}
export function Quantity({ value, onChange, max = 99 }) {
  const { t } = useStore();
  return (
    <div className="quantity">
      <button
        type="button"
        aria-label={t("decrease")}
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={14} />
      </button>
      <span aria-live="polite">{value}</span>
      <button
        type="button"
        aria-label={t("increase")}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
export function ReviewCards({ limit }) {
  const { t, reviews } = useStore();
  return (
    <>
      <div className="review-grid">
        {reviews.slice(0, limit).map((r) => (
          <Review key={r.id} review={r} />
        ))}
      </div>
      {!reviews.length && <p className="muted">{t("noReviews")}</p>}
    </>
  );
}
function Review({ review: r }) {
  const { local } = useStore();
  return (
    <figure className="review-card">
      <div className="stars" aria-label={`${r.rating}/5`}>
        {"★".repeat(r.rating)}
      </div>
      <blockquote>“{local(r, "text")}”</blockquote>
      <figcaption>
        <span className="avatar">{r.author[0]}</span>
        <span>
          {r.author}
          <small>TUNISWEET</small>
        </span>
        <span className="quote-mark">”</span>
      </figcaption>
    </figure>
  );
}
export function FinalCTA() {
  const { t } = useStore();
  return (
    <section className="final-cta">
      <div className="container">
        <p className="eyebrow">TUNISWEET</p>
        <h2>
          {t("finalTitle")}
          <br />
          <em>{t("finalTitle2")}</em>
        </h2>
        <p>{t("finalText")}</p>
        <Link className="button" to="/catalogo">
          {t("discover")}
          <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}
export function CookieBanner() {
  const { t, cookieOpen, setCookieOpen, setToast } = useStore();
  if (!cookieOpen) return null;
  const choose = (value) => {
    saveLocal("ts-cookies", { value, at: new Date().toISOString() });
    setCookieOpen(false);
    setToast("cookieSaved");
  };
  return (
    <aside className="cookie-banner" aria-label={t("cookieSettings")}>
      <div>
        <span className="eyebrow">TUNISWEET</span>
        <h2>{t("cookieTitle")}</h2>
        <p>
          {t("cookieText")} <Link to="/cookies">{t("cookies")}</Link>
        </p>
      </div>
      <div className="cookie-actions">
        <button
          className="button secondary"
          onClick={() => choose("necessary")}
        >
          {t("necessary")}
        </button>
        <button className="button" onClick={() => choose("preferences")}>
          {t("acceptCookies")}
        </button>
      </div>
    </aside>
  );
}
export function PageHeading({ eyebrow, title, text, children }) {
  return (
    <div className="page-heading">
      <div className="container">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {text && <p>{text}</p>}
        {children}
      </div>
    </div>
  );
}
