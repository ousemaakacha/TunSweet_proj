import { shop, dateKey } from "./config.js";
export const defaultSettings = {
  title: "Negozio",
  category: "store",
  name: shop.name,
  email: shop.email,
  whatsapp: shop.whatsapp,
  instagram: shop.instagram,
  pickupMessage: "Indirizzo comunicato privatamente dopo la conferma.",
  contactText: "",
  start: "16:00",
  end: "20:00",
  weekdays: [...shop.pickup.weekdays],
  lowStock: 5,
  logo: "",
  primaryColor: "#536348",
};
export const slotLabel = (slot) => `${slot.start}–${slot.end}`;
export function calendarDays(
  orders = [],
  availability = [],
  settings = defaultSettings,
  now = new Date(),
  includeClosed = false,
) {
  const today = dateKey(now),
    dates = [];
  for (
    let i = includeClosed ? 0 : shop.pickup.leadDays;
    i <= shop.pickup.horizonDays;
    i++
  ) {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10),
      custom = availability.find((a) => a.date === date);
    const enabled = custom
      ? custom.enabled
      : settings.weekdays.includes(d.getUTCDay()) &&
        !shop.pickup.excludedDates.includes(date);
    const minutes = (value) =>
      Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
    const clock = (n) =>
      `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
    const defaults = [];
    for (let m = minutes(settings.start); m < minutes(settings.end); m += 60)
      defaults.push({
        start: clock(m),
        end: clock(Math.min(m + 60, minutes(settings.end))),
        capacity: shop.pickup.capacity,
      });
    const slots = [...(custom?.slots || defaults)];
    // Historical bookings stay visible when the default opening hours change.
    for (const order of orders.filter(
      (o) => o.pickupDate === date && o.status !== "Annullato",
    )) {
      if (!slots.some((s) => slotLabel(s) === order.pickupSlot)) {
        const [start, end] = order.pickupSlot.split("–");
        if (start && end)
          slots.push({
            start,
            end,
            capacity: orders.filter(
              (o) =>
                o.pickupDate === date &&
                o.pickupSlot === order.pickupSlot &&
                o.status !== "Annullato",
            ).length,
          });
      }
    }
    if (enabled || includeClosed)
      dates.push({
        date,
        enabled,
        slots: slots.map((s) => {
          const occupied = orders.filter(
            (o) =>
              o.pickupDate === date &&
              o.pickupSlot === slotLabel(s) &&
              o.status !== "Annullato",
          ).length;
          return {
            ...s,
            time: slotLabel(s),
            occupied,
            remaining: enabled ? Math.max(0, s.capacity - occupied) : 0,
          };
        }),
      });
  }
  return dates;
}
