import test from "node:test";
import assert from "node:assert/strict";
import { createOrder } from "../backend/order-domain.js";
import { pickupDates, pickupSlots, shop } from "../shared/config.js";
import { calendarDays, defaultSettings } from "../shared/calendar.js";
const now = new Date("2026-10-22T10:00:00Z");
const product = {
  id: 1,
  title: "Makroudh",
  titleEn: "Makroudh",
  price: 8.5,
  stock: 3,
  available: true,
};
const input = () => ({
  idempotencyKey: "test-order-123",
  items: [{ productId: 1, quantity: 2 }],
  customer: {
    name: "Cliente Test",
    email: "test@example.com",
    phone: "+39 320 0000000",
    notes: "",
  },
  pickupDate: pickupDates(now)[0],
  pickupSlot: pickupSlots()[0],
  paymentMethod: "pay_on_pickup",
  total: 0.01,
});
test("admin calendar includes imminent bookings and retains filled historical slots after an hours change", () => {
  const booking = {
    pickupDate: "2026-10-23",
    pickupSlot: "16:00–17:00",
    status: "Confermato",
  };
  const days = calendarDays(
    [booking],
    [],
    { ...defaultSettings, start: "18:00", end: "20:00" },
    now,
    true,
  );
  assert.equal(days[0].date, "2026-10-22");
  const slot = days
    .find((d) => d.date === booking.pickupDate)
    .slots.find((s) => s.time === booking.pickupSlot);
  assert.equal(slot.occupied, 1);
  assert.equal(slot.remaining, 0);
  assert.equal(slot.capacity, 1);
  assert.ok(
    !calendarDays([booking], [], defaultSettings, now).some(
      (d) => d.date === booking.pickupDate,
    ),
  );
});
test("server uses catalog prices and initial pending state", () => {
  const { order } = createOrder(input(), [product], [], now);
  assert.equal(order.total, 17);
  assert.equal(order.status, "In attesa");
  assert.equal(order.paymentStatus, "unpaid");
  assert.match(order.reference, /^TS-2026-/);
});
test("online methods are rejected and a customer cannot declare an order paid", () => {
  assert.throws(
    () =>
      createOrder({ ...input(), paymentMethod: "card" }, [product], [], now),
    /invalidPayment/,
  );
  assert.equal(
    createOrder({ ...input(), paymentStatus: "paid" }, [product], [], now).order
      .paymentStatus,
    "unpaid",
  );
});
test("repeated submissions with same key return original order", () => {
  const first = createOrder(input(), [product], [], now).order;
  const result = createOrder(input(), [], [first], now);
  assert.equal(result.existing, true);
  assert.equal(result.order.reference, first.reference);
});
test("combines duplicated products before checking stock", () => {
  const data = input();
  data.items.push({ productId: 1, quantity: 2 });
  assert.throws(() => createOrder(data, [product], [], now), /stockChanged/);
});
test("rejects unavailable product and invalid quantities", () => {
  assert.throws(
    () => createOrder(input(), [{ ...product, available: false }], [], now),
    /stockChanged/,
  );
  for (const quantity of [0, -1, 1.5, "2"]) {
    const data = input();
    data.items[0].quantity = quantity;
    assert.throws(() => createOrder(data, [product], [], now), /invalidOrder/);
  }
});
test("slot capacity is enforced centrally", () => {
  const data = input();
  const orders = Array.from({ length: shop.pickup.capacity }, (_, i) => ({
    idempotencyKey: `other-${i}`,
    pickupDate: data.pickupDate,
    pickupSlot: data.pickupSlot,
    status: "In attesa",
  }));
  assert.throws(() => createOrder(data, [product], orders, now), /slotFull/);
});
test("rejects past dates, unknown slots and incomplete customer details", () => {
  const data = input();
  assert.throws(
    () =>
      createOrder({ ...data, pickupDate: "2020-01-01" }, [product], [], now),
    /invalidPickup/,
  );
  assert.throws(
    () => createOrder({ ...data, pickupSlot: "03:00" }, [product], [], now),
    /invalidPickup/,
  );
  assert.throws(
    () =>
      createOrder(
        { ...data, customer: { ...data.customer, email: "invalid" } },
        [product],
        [],
        now,
      ),
    /invalidCustomer/,
  );
});
test("rejects non-numeric phone numbers and malformed items", () => {
  const data = input();
  assert.throws(
    () =>
      createOrder(
        { ...data, customer: { ...data.customer, phone: "-------" } },
        [product],
        [],
        now,
      ),
    /invalidCustomer/,
  );
  assert.throws(
    () => createOrder({ ...data, items: [null] }, [product], [], now),
    /invalidOrder/,
  );
});
test("pickup dates respect lead time, weekdays and excluded dates", () => {
  const dates = pickupDates(now);
  assert.ok(dates.length > 0);
  assert.ok(
    dates.every(
      (d) =>
        d >= "2026-10-24" &&
        shop.pickup.weekdays.includes(new Date(`${d}T12:00:00Z`).getUTCDay()) &&
        !shop.pickup.excludedDates.includes(d),
    ),
  );
  assert.deepEqual(pickupSlots(), [
    "16:00–17:00",
    "17:00–18:00",
    "18:00–19:00",
    "19:00–20:00",
  ]);
});

const withVariants = () => ({
  ...product, price: 99, stock: 0,
  variants: [
    { id: "small", name: "Piccola", nameEn: "Small", format: "6 pezzi", formatEn: "6 pieces", price: 7.35, stock: 3, available: true },
    { id: "large", name: "Grande", format: "12 pezzi", price: 12.4, stock: 4, available: true },
    { id: "disabled", name: "Sospesa", format: "", price: 1, stock: 10, available: false },
    { id: "empty", name: "Esaurita", format: "", price: 1, stock: 0, available: true },
  ],
});

test("variant prices and snapshots come from the catalog; only identical variants are merged", () => {
  const p = withVariants();
  const data = { ...input(), items: [
    { productId: 1, variantId: "small", quantity: 1, price: 0.01, variantName: "Forged", format: "Forged" },
    { productId: 1, variantId: "large", quantity: 2, price: -100 },
    { productId: 1, variantId: "small", quantity: 1 },
    { productId: 2, quantity: 1 },
  ] };
  const { order } = createOrder(data, [p, { ...product, id: 2 }], [], now);
  assert.equal(order.total, 48);
  assert.deepEqual(order.items[0], {
    productId: 1, variantId: "small", variantName: "Piccola", variantNameEn: "Small",
    title: "Makroudh", titleEn: "Makroudh", format: "6 pezzi", formatEn: "6 pieces", quantity: 2, price: 7.35,
  });
  assert.equal(order.items[1].variantId, "large");
  assert.equal(order.items[1].variantNameEn, "Grande");
  assert.equal(order.items[1].formatEn, "12 pezzi");
  assert.equal(order.items[2].variantId, undefined);
  p.title = "Changed";
  Object.assign(p.variants[0], { name: "Changed", format: "Changed", price: 100 });
  assert.equal(order.items[0].variantName, "Piccola");
  assert.equal(order.items[0].format, "6 pezzi");
  assert.equal(order.items[0].price, 7.35);
  assert.equal(createOrder(data, [], [order], now).order, order);
});

test("missing, unknown, disabled, empty and cross-product variants cannot fall back to the base product", () => {
  const p = withVariants();
  const place = (items, catalog = [p]) => createOrder({ ...input(), items }, catalog, [], now);
  assert.throws(() => place([{ productId: 1, quantity: 1 }]), /variantRequired/);
  for (const variantId of ["unknown", "disabled", "empty"])
    assert.throws(() => place([{ productId: 1, variantId, quantity: 1 }]), /stockChanged/);
  assert.throws(() => place([{ productId: 1, variantId: "small", quantity: 4 }]), /stockChanged/);
  assert.throws(() => place([
    { productId: 1, variantId: "small", quantity: 2 },
    { productId: 1, variantId: "small", quantity: 2 },
  ]), /stockChanged/);
  assert.throws(() => place([{ productId: 2, variantId: "small", quantity: 1 }], [p, { ...product, id: 2 }]), /stockChanged/);
  for (const fields of [{ published: false }, { available: false }])
    assert.throws(() => place([{ productId: 1, variantId: "small", quantity: 1 }], [{ ...p, ...fields }]), /stockChanged/);
});

test("variant quantities and identifiers reject malformed values and unsafe duplicate sums", () => {
  const place = (items) => createOrder({ ...input(), items }, [withVariants()], [], now);
  for (const quantity of [0, -1, 1.5, "2", null, undefined, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => place([{ productId: 1, variantId: "small", quantity }]), /invalidOrder/);
  for (const variantId of [null, 0, {}, [], "", "x".repeat(101)])
    assert.throws(() => place([{ productId: 1, variantId, quantity: 1 }]), /invalidOrder/);
  assert.throws(() => place([
    { productId: 1, variantId: "small", quantity: Number.MAX_SAFE_INTEGER },
    { productId: 1, variantId: "small", quantity: 1 },
  ]), /invalidOrder/);
});

test("variant money calculations reject corrupt prices and unsafe totals", () => {
  const p = withVariants();
  const data = { ...input(), items: [{ productId: 1, variantId: "small", quantity: 2 }] };
  for (const price of [-0.001, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    p.variants[0].price = price;
    assert.throws(() => createOrder(data, [p], [], now), /stockChanged/);
  }
  p.variants[0].price = Number.MAX_SAFE_INTEGER / 100;
  assert.throws(() => createOrder(data, [p], [], now), /invalidOrder/);
  p.variants[0].price = 0.1;
  data.items[0].quantity = 3;
  const { order } = createOrder(data, [p], [], now);
  assert.equal(order.items[0].price, 0.1);
  assert.equal(order.total, 0.3);
});
