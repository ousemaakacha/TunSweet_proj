import { useEffect, useState, useRef } from "react";
import {
  Routes,
  Route,
  NavLink,
  Link,
  Outlet,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  CalendarDays,
  MessageSquare,
  Users,
  Settings as SettingsIcon,
  Menu,
  X,
  LogOut,
  ExternalLink,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";
import { AdminAuthProvider, ProtectedAdminRoute, useAdminAuth } from "./auth";
import { AdminUIProvider, useResource, useAction } from "./ui";
import { dashboardService } from "./services";
import { it as t } from "./text";
import { Products, ProductForm } from "./products";
import { Orders, OrderDetail } from "./orders";
import { Dashboard, Calendar, Reviews, Customers, Settings } from "./pages";
import "./styles.css";
const navigation = [
  ["", t.dashboard, LayoutDashboard],
  ["products", t.products, Package],
  ["orders", t.orders, ShoppingBag],
  ["calendar", t.calendar, CalendarDays],
  ["reviews", t.reviews, MessageSquare],
  ["customers", t.customers, Users],
  ["settings", t.settings, SettingsIcon],
];
function AdminBrand() {
  return (
    <Link className="brand admin-brand" to="/admin">
      <span className="brand-mark">
        <Sparkles size={21} strokeWidth={1.3} />
      </span>
      <span>
        TUNI<span className="brand-light">SWEET</span>
        <small>{t.admin}</small>
      </span>
    </Link>
  );
}
function Login() {
  const { session, login, loading } = useAdminAuth(),
    location = useLocation(),
    navigate = useNavigate();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [show, setShow] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    lock = useRef(false);
  const from = location.state?.from;
  const destination =
    typeof from === "string" &&
    /^\/admin(?:\/|$)/.test(from) &&
    !from.startsWith("/admin/login")
      ? from
      : "/admin";
  if (loading)
    return (
      <div className="status-box" role="status">
        {t.loading}
      </div>
    );
  if (session) return <Navigate to={destination} replace />;
  return (
    <div className="admin-login">
      <section className="admin-login-story">
        <AdminBrand />
        <div>
          <p className="eyebrow">FATTO IN CASA, CON CURA</p>
          <h1>{t.loginIntro}</h1>
          <p>{t.overview}</p>
        </div>
        <span>© TUNISWEET</span>
      </section>
      <main id="main" className="admin-login-main">
        <div className="admin-login-card">
          <p className="eyebrow">{t.admin}</p>
          <h2>{t.login}</h2>
          <p className="admin-notice">{t.loginNotice}</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (lock.current) return;
              lock.current = true;
              setBusy(true);
              setError("");
              try {
                await login(email.trim(), password);
                navigate(destination, { replace: true });
              } catch (e) {
                setError(e.status ? e.message : t.error);
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy}>
              <label>
                {t.email}
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                {t.password}
                <span className="admin-password">
                  <input
                    type={show ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={show ? t.hide : t.show}
                    onClick={() => setShow(!show)}
                  >
                    {show ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </span>
              </label>
              {error && (
                <p role="alert" className="inline-error">
                  {error}
                </p>
              )}
              <button className="button" disabled={busy}>
                {busy ? t.logging : t.login}
              </button>
            </fieldset>
          </form>
          <Link className="admin-text-link" to="/">
            {t.store} <ExternalLink size={14} />
          </Link>
        </div>
      </main>
    </div>
  );
}
function Layout() {
  const [open, setOpen] = useState(false),
    location = useLocation(),
    { session, logout } = useAdminAuth(),
    { run, busy } = useAction(),
    overview = useResource(dashboardService.get),
    menuButton = useRef(null),
    drawer = useRef(null);
  useEffect(() => {
    setOpen(false);
    overview.reload();
  }, [location.pathname]);
  useEffect(() => {
    window.addEventListener("admin-data-changed", overview.reload);
    return () =>
      window.removeEventListener("admin-data-changed", overview.reload);
  }, [overview.reload]);
  useEffect(() => {
    if (!open) return;
    drawer.current?.querySelector("nav a")?.focus();
    const close = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  const section = location.pathname.split("/")[2] || "",
    baseTitle = navigation.find((n) => n[0] === section)?.[1] || t.dashboard,
    title = location.pathname.endsWith("/new")
      ? t.newProduct
      : location.pathname.endsWith("/edit")
        ? t.editProduct
        : section === "orders" && location.pathname.split("/")[3]
          ? t.orderDetail
          : baseTitle;
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#main">
        {t.admin}
      </a>
      <aside
        className={`admin-sidebar ${open ? "open" : ""}`}
        id="admin-menu"
        ref={drawer}
      >
        <AdminBrand />
        <p className="admin-nav-caption">{t.admin}</p>
        <nav aria-label={t.menu}>
          {navigation.map(([path, label, Icon]) => (
            <NavLink
              key={path}
              to={`/admin${path ? `/${path}` : ""}`}
              end={!path}
              onClick={() => setOpen(false)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {path === "orders" &&
                !!overview.data?.orders.filter((o) => o.status === "In attesa")
                  .length && (
                  <b>
                    {
                      overview.data.orders.filter(
                        (o) => o.status === "In attesa",
                      ).length
                    }
                  </b>
                )}
              {path === "reviews" &&
                !!overview.data?.reviews.filter((v) => v.status === "In attesa")
                  .length && (
                  <b>
                    {
                      overview.data.reviews.filter(
                        (v) => v.status === "In attesa",
                      ).length
                    }
                  </b>
                )}
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <p>{t.admin}</p>
          <Link to="/">
            <ExternalLink size={17} />
            {t.store}
          </Link>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <button
            ref={menuButton}
            className="admin-menu-toggle"
            aria-expanded={open}
            aria-controls="admin-menu"
            aria-label={open ? t.close : t.menu}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
          <span className="admin-topbar-label">{t.admin}</span>
          <div className="admin-profile">
            <span className="admin-avatar">TS</span>
            <span>
              {session.name}
              <small>{t.admin}</small>
            </span>
          </div>
          <button
            className="admin-logout"
            disabled={busy}
            onClick={() => run(logout, "")}
          >
            <LogOut size={17} />
            <span>{t.logout}</span>
          </button>
        </header>
        <main id="main" className="admin-main" tabIndex={-1}>
          <nav className="admin-breadcrumb" aria-label="Breadcrumb">
            <Link to="/admin">TUNISWEET</Link>
            <span>/</span>
            <Link to={`/admin${section ? `/${section}` : ""}`}>
              {baseTitle}
            </Link>
            {title !== baseTitle && (
              <>
                <span>/</span>
                <span>{title}</span>
              </>
            )}
          </nav>
          <div className="admin-page-title">
            <h1>{title}</h1>
            <span className="admin-today">
              {new Intl.DateTimeFormat("it-IT", {
                dateStyle: "full",
                timeZone: "Europe/Rome",
              }).format(new Date())}
            </span>
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
export default function Admin() {
  return (
    <AdminAuthProvider>
      <AdminUIProvider>
        <Routes>
          <Route path="login" element={<Login />} />
          <Route element={<ProtectedAdminRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="products" element={<Products />} />
              <Route path="products/new" element={<ProductForm />} />
              <Route path="products/:id/edit" element={<ProductForm />} />
              <Route path="orders" element={<Orders />} />
              <Route path="orders/:id" element={<OrderDetail />} />
              <Route path="calendar" element={<Calendar />} />
              <Route path="reviews" element={<Reviews />} />
              <Route path="customers" element={<Customers />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Route>
          </Route>
        </Routes>
      </AdminUIProvider>
    </AdminAuthProvider>
  );
}
