import { request } from "../services";
export const adminAuthService = {
  session: () =>
    request("/admin/session").catch((error) => {
      if (error.status === 401) return null;
      throw error;
    }),
  login: (email, password) =>
    request("/admin/session", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request("/admin/session", { method: "DELETE" }),
};
export async function adminRequest(path, options = {}) {
  try {
    return await request(path, options);
  } catch (error) {
    if (error.status === 401)
      window.dispatchEvent(new Event("admin-session-expired"));
    throw error;
  }
}
const resource = (name) => ({
  list: () => adminRequest(`/admin/${name}`),
  get: (id) => adminRequest(`/admin/${name}/${id}`),
  save: async (data, id) => {
    const result = await adminRequest(`/admin/${name}${id ? `/${id}` : ""}`, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(data),
    });
    window.dispatchEvent(new Event("admin-data-changed"));
    return result;
  },
  remove: async (id) => {
    const result = await adminRequest(`/admin/${name}/${id}`, {
      method: "DELETE",
    });
    window.dispatchEvent(new Event("admin-data-changed"));
    return result;
  },
});
export const productService = resource("products");
export const orderService = resource("orders");
export const reviewService = resource("reviews");
export const customerService = resource("customers");
export const availabilityService = {
  ...resource("availability"),
  calendar: () => adminRequest("/admin/calendar"),
};
export const settingsService = resource("settings");
export const dashboardService = { get: () => adminRequest("/admin/overview") };
export const imageStorageService = {
  config: () => adminRequest("/uploads/config"),
  upload(file) {
    const body = new FormData();
    body.append("image", file);
    return adminRequest("/uploads/images", { method: "POST", body });
  },
  delete(image) {
    if (image.source !== "cloudinary" || !image.publicId)
      return Promise.resolve();
    return adminRequest(
      `/uploads/images/${encodeURIComponent(image.publicId)}`,
      { method: "DELETE" },
    );
  },
};
export const money = (n) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(
    n || 0,
  );
export const date = (value) =>
  value
    ? new Intl.DateTimeFormat("it-IT", {
        dateStyle: "medium",
        ...(value.includes("T") ? { timeStyle: "short" } : {}),
        timeZone: "Europe/Rome",
      }).format(new Date(value.includes("T") ? value : `${value}T12:00:00Z`))
    : "—";
export const isHttps = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
};
export function exportOrders(rows) {
  const cell = (v) => {
    let s = String(v ?? "");
    if (/^[=+@\-\t\r\n]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  const body = [
    [
      "Codice",
      "Cliente",
      "Email",
      "Telefono",
      "Ritiro",
      "Fascia",
      "Stato",
      "Pagamento",
      "Totale",
    ],
    ...rows.map((o) => [
      o.reference,
      o.customer.name,
      o.customer.email,
      o.customer.phone,
      o.pickupDate,
      o.pickupSlot,
      o.status,
      o.paymentStatus,
      o.total.toFixed(2).replace(".", ","),
    ]),
  ]
    .map((r) => r.map(cell).join(";"))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", body], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "tunisweet-ordini.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
