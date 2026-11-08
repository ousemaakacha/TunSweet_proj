const base = (import.meta.env.VITE_API_URL || "/api").replace(
  /\/$/,
  "",
);
export async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
    signal: options.signal || AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(new Error(data.error || "apiError"), {
      status: response.status,
    });
  return data;
}
export const api = {
  products: () => request("/products?full=true"),
  reviews: () => request("/reviews?full=true"),
  slots: () => request("/pickup-slots"),
  settings: () => request("/store-settings"),
  order: async (data) =>
    (await request("/orders", { method: "POST", body: JSON.stringify(data) }))
      .order,
};
export const authService = {
  signIn: (data) => request("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  register: (data) => request("/auth/register", { method: "POST", body: JSON.stringify(data), signal: AbortSignal.timeout(45000) }),
  resend: (email) => request("/auth/resend", { method: "POST", body: JSON.stringify({ email }), signal: AbortSignal.timeout(45000) }),
  verify: (token) => request("/auth/verify", { method: "POST", body: JSON.stringify({ token }) }),
  session: () => request("/auth/session"),
  orders: () => request("/account/orders"),
  signOut: () => request("/auth/session", { method: "DELETE" }),
};
export function readLocal(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
export function saveLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage may be disabled in a private browser. */
  }
}
