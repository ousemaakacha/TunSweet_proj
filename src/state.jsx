import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { api, authService, readLocal, saveLocal } from "./services";
import { translations } from "./i18n";
import { shop as shopDefaults } from "../shared/config";
const Store = createContext(null);
export function StoreProvider({ children }) {
  const [lang, setLang] = useState(() =>
    readLocal("ts-lang", "it") === "en" ? "en" : "it",
  );
  const [cart, setCart] = useState(() => {
    const value = readLocal("ts-cart", []);
    return Array.isArray(value)
      ? value.filter(
          (i) =>
            Number.isSafeInteger(i.id) &&
            Number.isSafeInteger(i.quantity) &&
            i.quantity > 0,
        )
      : [];
  });
  const [favorites, setFavorites] = useState(() => {
    const value = readLocal("ts-favorites", []);
    return Array.isArray(value) ? value.filter(Number.isSafeInteger) : [];
  });
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [products, setProducts] = useState([]),
    [reviews, setReviews] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [toast, setToast] = useState("");
  const [settings, setSettings] = useState(null);
  const [cookieOpen, setCookieOpen] = useState(
    () => !readLocal("ts-cookies", null),
  );
  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(false);
    try {
      const [catalog, customerReviews, storeSettings] = await Promise.all([
        api.products(),
        api.reviews(),
        api.settings().catch(() => null),
      ]);
      setProducts(catalog);
      setReviews(customerReviews);
      if (storeSettings) setSettings(storeSettings);
      return catalog;
    } catch {
      setError(true);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (settings?.primaryColor)
      document.documentElement.style.setProperty(
        "--green",
        settings.primaryColor,
      );
  }, [settings?.primaryColor]);
  useEffect(() => {
    saveLocal("ts-lang", lang);
    document.documentElement.lang = lang;
    document.title = translations[lang].pageTitle;
  }, [lang]);
  useEffect(() => {
    saveLocal("ts-cart", cart);
  }, [cart]);
  useEffect(() => {
    saveLocal("ts-favorites", favorites);
  }, [favorites]);
  useEffect(() => {
    let active = true;
    try {
      localStorage.removeItem("ts-session");
    } catch {}
    const check = () =>
      authService
        .session()
        .then((user) => {
          if (active) setSession(user);
        })
        .catch(() => {
          if (active) setSession(null);
        })
        .finally(() => {
          if (active) setSessionLoading(false);
        });
    check();
    window.addEventListener("focus", check);
    return () => {
      active = false;
      window.removeEventListener("focus", check);
    };
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const t = (key) => translations[lang][key] ?? key;
  const local = (p, key) =>
    lang === "en" ? (p[`${key}En`] ?? p[key]) : p[key];
  const money = (n) =>
    new Intl.NumberFormat(lang === "it" ? "it-IT" : "en-IE", {
      style: "currency",
      currency: "EUR",
    }).format(n);
  const add = (p, quantity = 1) => {
    const current = cart.find((i) => i.id === p.id)?.quantity || 0;
    if (!p.available || current + quantity > p.stock) {
      setToast("stockLimit");
      return false;
    }
    setCart((old) => {
      const found = old.find((i) => i.id === p.id);
      return found
        ? old.map((i) =>
            i.id === p.id ? { ...i, quantity: i.quantity + quantity } : i,
          )
        : [...old, { id: p.id, quantity }];
    });
    setToast("added");
    return true;
  };
  const change = (id, quantity) => {
    const p = products.find((p) => p.id === id);
    if (!p || !p.available || quantity < 1 || p.stock < 1) {
      setToast("stockLimit");
      return;
    }
    const nextQuantity = Math.min(quantity, p.stock);
    if (nextQuantity !== quantity) setToast("stockLimit");
    setCart((old) =>
      old.map((i) => (i.id === id ? { ...i, quantity: nextQuantity } : i)),
    );
  };
  const remove = (id) => setCart((old) => old.filter((i) => i.id !== id));
  const favorite = (id) =>
    setFavorites((old) =>
      old.includes(id) ? old.filter((i) => i !== id) : [...old, id],
    );
  const lines = cart.map((i) => ({
    ...i,
    product: products.find((p) => p.id === i.id),
  }));
  const total =
    lines.reduce(
      (sum, i) =>
        sum + (i.product ? Math.round(i.product.price * 100) * i.quantity : 0),
      0,
    ) / 100;
  const invalidCart = lines.some(
    (i) => !i.product || !i.product.available || i.quantity > i.product.stock,
  );
  const shop = {
    ...shopDefaults,
    ...(settings && {
      name: settings.name,
      email: settings.email,
      whatsapp: settings.whatsapp,
      instagram: settings.instagram,
      hours: {
        it: `Ritiro dalle ${settings.start} alle ${settings.end}`,
        en: `Pickup ${settings.start}–${settings.end}`,
      },
    }),
  };
  return (
    <Store.Provider
      value={{
        lang,
        setLang,
        t,
        local,
        money,
        cart,
        setCart,
        lines,
        total,
        invalidCart,
        add,
        change,
        remove,
        favorites,
        favorite,
        session,
        sessionLoading,
        setSession,
        products,
        settings,
        shop,
        reviews,
        loading,
        error,
        refresh,
        toast,
        setToast,
        cookieOpen,
        setCookieOpen,
      }}
    >
      {children}
    </Store.Provider>
  );
}
export const useStore = () => useContext(Store);
