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
