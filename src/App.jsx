import { useEffect, useRef, lazy, Suspense } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { useStore } from "./state";
import { Header, Footer, CookieBanner } from "./components";
import {
  Home,
  Catalog,
  Product,
  Favorites,
  Cart,
  About,
  Reviews,
  Contact,
  Legal,
  NotFound,
} from "./pages";
import { Checkout, Confirmation } from "./checkout";
import { Account, VerifyEmail } from "./account";
const Admin = lazy(() => import("./admin/Admin"));
export default function App() {
  const { toast, t, refresh } = useStore();
  const location = useLocation();
  const previous = useRef(location.pathname);
  useEffect(() => {
    window.scrollTo(0, 0);
    if (
      previous.current.startsWith("/admin") &&
      !location.pathname.startsWith("/admin")
    )
      refresh({ silent: true });
    previous.current = location.pathname;
  }, [location.pathname]);
  if (/^\/admin(?:\/|$)/.test(location.pathname))
    return (
      <Suspense fallback={<p role="status">{t("loading")}</p>}>
        <Routes>
          <Route path="/admin/*" element={<Admin />} />
        </Routes>
      </Suspense>
    );
  return (
    <>
      <Header />
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/catalogo" element={<Catalog />} />
          <Route path="/dolci/:id" element={<Product />} />
          <Route path="/preferiti" element={<Favorites />} />
          <Route path="/carrello" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/conferma" element={<Confirmation />} />
          <Route path="/account" element={<Account />} />
          <Route path="/account/verifica" element={<VerifyEmail />} />
          <Route path="/chi-siamo" element={<About />} />
          <Route path="/recensioni" element={<Reviews />} />
          <Route path="/contatti" element={<Contact />} />
          {["privacy", "cookies", "terms"].map((type) => (
            <Route
              key={type}
              path={`/${type}`}
              element={<Legal type={type} />}
            />
          ))}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      <CookieBanner />
      {toast && (
        <div className="toast" role="status">
          {t(toast)}
        </div>
      )}
    </>
  );
}
