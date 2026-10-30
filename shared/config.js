// Public information only. Never put the home address here.
export const shop = {
  name: "TUNISWEET",
  email: "",
  whatsapp: "",
  instagram: "",
  location: {
    it: "Ritiro su appuntamento · Italia",
    en: "Pickup by appointment · Italy",
  },
  hours: {
    it: "Ritiro dalle 16:00 alle 20:00",
    en: "Pickup from 4 pm to 8 pm",
  },
  story: {
    it: "Prepariamo dolci tunisini in confezioni da ritirare su appuntamento: makroudh, baklawa, dolci alle mandorle e biscotti.",
    en: "We prepare Tunisian pastries in boxes for pickup by appointment: makroudh, baklava, almond pastries and biscuits.",
  },
  pickup: {
    timezone: "Europe/Rome",
    weekdays: [2, 3, 4, 5, 6],
    excludedDates: [],
    startHour: 16,
    endHour: 20,
    slotMinutes: 60,
    capacity: 4,
    leadDays: 2,
    horizonDays: 21,
  },
};
export function dateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: shop.pickup.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function pickupDates(now = new Date()) {
  const result = [],
    today = dateKey(now);
  for (let i = shop.pickup.leadDays; i <= shop.pickup.horizonDays; i++) {
    const day = new Date(`${today}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() + i);
    const key = day.toISOString().slice(0, 10);
    if (
      shop.pickup.weekdays.includes(day.getUTCDay()) &&
      !shop.pickup.excludedDates.includes(key)
    )
      result.push(key);
  }
  return result;
}
export function pickupSlots() {
  const result = [];
  for (
    let m = shop.pickup.startHour * 60;
    m < shop.pickup.endHour * 60;
    m += shop.pickup.slotMinutes
  ) {
    const time = (x) =>
      `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
    result.push(
      `${time(m)}–${time(Math.min(m + shop.pickup.slotMinutes, shop.pickup.endHour * 60))}`,
    );
  }
  return result;
}
