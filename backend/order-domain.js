import { randomUUID } from "node:crypto";
import { pickupDates, pickupSlots, shop } from "../shared/config.js";
export function createOrder(
  input,
  products,
  orders,
  now = new Date(),
  calendar = null,
) {
  const fail = (code) => {
    const error = new Error(code);
    error.status = 409;
    throw error;
  };
  if (
    !input ||
    typeof input.idempotencyKey !== "string" ||
    input.idempotencyKey.length < 8 ||
    input.idempotencyKey.length > 200
  )
    fail("invalidOrder");
  const existing = orders.find(
    (o) => o.idempotencyKey === input.idempotencyKey,
  );
  if (existing) return { order: existing, existing: true };
  const c = input.customer;
  if (
    !c ||
    typeof c.name !== "string" ||
    c.name.trim().length < 2 ||
    c.name.length > 120 ||
    typeof c.email !== "string" ||
    c.email.length > 200 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email || "") ||
    typeof c.phone !== "string" ||
    !/^[+\d\s().-]{7,25}$/.test(c.phone || "") ||
    c.phone.replace(/\D/g, "").length < 7 ||
    typeof c.notes !== "string" ||
    c.notes.length > 1000
  )
    fail("invalidCustomer");
  const selectedSlot = calendar
    ?.find((d) => d.date === input.pickupDate)
    ?.slots.find((s) => s.time === input.pickupSlot);
  if (
    calendar
      ? !selectedSlot
      : !pickupDates(now).includes(input.pickupDate) ||
        !pickupSlots().includes(input.pickupSlot)
  )
    fail("invalidPickup");
  if (
    orders.filter(
      (o) =>
        o.pickupDate === input.pickupDate &&
        o.pickupSlot === input.pickupSlot &&
        o.status !== "Annullato",
    ).length >= (selectedSlot?.capacity ?? shop.pickup.capacity)
  )
    fail("slotFull");
  if (input.paymentMethod !== "pay_on_pickup") fail("invalidPayment");
  if (
    !Array.isArray(input.items) ||
    !input.items.length ||
    input.items.length > 100
  )
    fail("invalidOrder");
  const quantities = new Map();
  for (const item of input.items) {
    if (
      !item ||
      !Number.isSafeInteger(item.productId) ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1
    )
      fail("invalidOrder");
    quantities.set(
      item.productId,
      (quantities.get(item.productId) || 0) + item.quantity,
    );
  }
  const items = [...quantities].map(([id, quantity]) => {
    const p = products.find((p) => p.id === id);
    if (!p || p.published === false || !p.available || quantity > p.stock)
      fail("stockChanged");
    return {
      productId: id,
      title: p.title,
      titleEn: p.titleEn,
      quantity,
      price: p.price,
    };
  });
  const reference = `TS-${now.getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  return {
    existing: false,
    order: {
      title: reference,
      category: "pickup",
      reference,
      items,
      total:
        items.reduce(
          (sum, i) => sum + Math.round(i.price * 100) * i.quantity,
          0,
        ) / 100,
      customer: {
        name: c.name.trim(),
        email: c.email.trim(),
        phone: c.phone.trim(),
        notes: c.notes.trim(),
      },
      pickupDate: input.pickupDate,
      pickupSlot: input.pickupSlot,
      paymentMethod: input.paymentMethod,
      paymentStatus: "unpaid",
      status: "In attesa",
      idempotencyKey: input.idempotencyKey,
      id: Math.max(0, ...orders.map((o) => o.id)) + 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  };
}
