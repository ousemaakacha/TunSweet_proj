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
import { canPurchase, lineKey, purchaseOption } from "../shared/products.js";
import { cartLines, cartTotal, normalizeCart } from "./cart.js";
const Store = createContext(null);
export function StoreProvider({ children }) {
  const [lang, setLang] = useState(() =>
    readLocal("ts-lang", "it") === "en" ? "en" : "it",
  );
  const [cart, setCart] = useState(() => normalizeCart(readLocal("ts-cart", [])));
  const [favorites, setFavorites] = useState(() => {
    const value = readLocal("ts-favorites", []);
    return Array.isArray(value) ? value.filter(Number.isSafeInteger) : [];
  });
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState("");
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
  function add(product, quantity = 1, variantId) {
    const key = lineKey(product.id, variantId);
    const option = purchaseOption(product, variantId);
    const existingItem = cart.find((item) => lineKey(item.id, item.variantId) === key);
    let currentQuantity = 0;
    if (existingItem) {
      currentQuantity = existingItem.quantity;
    }

    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      setToast("stockLimit");
      return false;
    }

    if (!canPurchase(product, option, currentQuantity + quantity)) {
      setToast("stockLimit");
      return false;
    }

    setCart((currentCart) => {
      const savedItem = currentCart.find((item) => lineKey(item.id, item.variantId) === key);
      let savedQuantity = 0;
      if (savedItem) {
        savedQuantity = savedItem.quantity;
      }

      if (!canPurchase(product, option, savedQuantity + quantity)) {
        return currentCart;
      }

      if (!savedItem) {
        const newItem = { id: product.id, quantity };
        if (variantId !== undefined) {
          newItem.variantId = variantId;
        }
        return [...currentCart, newItem];
      }

      return currentCart.map((item) => {
        if (lineKey(item.id, item.variantId) !== key) {
          return item;
        }
        return { ...item, quantity: item.quantity + quantity };
      });
    });
    setToast("added");
    return true;
  }

  function change(productId, quantity, variantId) {
    const product = products.find((product) => product.id === productId);
    const option = purchaseOption(product, variantId);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || !canPurchase(product, option)) {
      setToast("stockLimit");
      return;
    }

    const nextQuantity = Math.min(quantity, option.stock);
    if (nextQuantity !== quantity) {
      setToast("stockLimit");
    }

    const key = lineKey(productId, variantId);
    setCart((currentCart) => {
      return currentCart.map((item) => {
        if (lineKey(item.id, item.variantId) !== key) {
          return item;
        }
        return { ...item, quantity: nextQuantity };
      });
    });
  }

  function remove(productId, variantId) {
    const key = lineKey(productId, variantId);
    setCart((currentCart) => {
      return currentCart.filter((item) => lineKey(item.id, item.variantId) !== key);
    });
  }
  const favorite = (id) =>
    setFavorites((old) =>
      old.includes(id) ? old.filter((i) => i !== id) : [...old, id],
    );
  const lines = cartLines(cart, products);
  const total = cartTotal(lines);
  const invalidCart = lines.some((line) => !line.valid);
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
