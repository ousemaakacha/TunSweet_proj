import { randomUUID } from "node:crypto";
import { pickupDates, pickupSlots, shop } from "../shared/config.js";
import { canPurchase, hasVariants, lineKey, purchaseOption } from "../shared/products.js";
export function createOrder(
  input,
  products,
  orders,
  now = new Date(),
  calendar = null,
  accountId = null,
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
  if (existing) {
    if ((existing.accountId ?? null) !== accountId) fail("invalidOrder");
    return { order: existing, existing: true };
  }
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
      item.productId < 1 ||
      (item.variantId !== undefined &&
        (typeof item.variantId !== "string" || !item.variantId.length || item.variantId.length > 100)) ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1
    )
      fail("invalidOrder");
    const key = lineKey(item.productId, item.variantId);
    const quantity = (quantities.get(key)?.quantity || 0) + item.quantity;
    if (!Number.isSafeInteger(quantity)) fail("invalidOrder");
    quantities.set(key, { productId: item.productId, variantId: item.variantId, quantity });
  }
  const items = [...quantities.values()].map(({ productId, variantId, quantity }) => {
    const p = products.find((p) => p.id === productId);
    if (hasVariants(p) && variantId === undefined) fail("variantRequired");
    const option = purchaseOption(p, variantId);
    if (!canPurchase(p, option, quantity)) fail("stockChanged");
    if (!Number.isFinite(option.price) || option.price < 0) fail("stockChanged");
    const cents = Math.round(option.price * 100);
    if (!Number.isSafeInteger(cents) || cents < 0) fail("stockChanged");
    return {
      productId,
      ...(variantId !== undefined && {
        variantId,
        variantName: option.name,
        variantNameEn: option.nameEn || option.name,
      }),
      title: p.title,
      titleEn: p.titleEn,
      format: option.format,
      formatEn: option.formatEn || option.format,
      quantity,
      price: cents / 100,
    };
  });
  const totalCents = items.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0);
  if (!Number.isSafeInteger(totalCents)) fail("invalidOrder");
  const reference = `TS-${now.getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  return {
    existing: false,
    order: {
      ...(accountId ? { accountId } : {}),
      title: reference,
      category: "pickup",
      reference,
      items,
      total: totalCents / 100,
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
