import test from "node:test";
import assert from "node:assert/strict";
import { cartLines, cartTotal, normalizeCart } from "../src/cart.js";
import { itemDescription, productAvailable, productPrice } from "../shared/products.js";
import { translations } from "../src/i18n.js";

const product = {
  id: 1, price: 100, stock: 0, available: true,
  variants: [
    { id: "small", name: "Piccola", nameEn: "Small", format: "6 pezzi", formatEn: "6 pieces", price: 7.35, stock: 3, available: true },
    { id: "large", name: "Grande", format: "12 pezzi", price: 12.4, stock: 4, available: true },
    { id: "disabled", name: "Sospesa", price: 1, stock: 10, available: false },
  ],
};
const base = { id: 2, price: 8.5, stock: 3, available: true, format: "Confezione", formatEn: "Box" };

test("saved carts retain only identifiers and valid quantities, merging identical variant lines", () => {
  const cart = normalizeCart([
    null, {}, { id: -1, quantity: 1 }, { id: 1, quantity: "1" },
    { id: 1, quantity: 0 }, { id: 1, quantity: 1, variantId: null },
    { id: 1, quantity: 1, variantId: "" }, { id: 1, quantity: 1, variantId: 2 },
    { id: 1, quantity: 1, variantId: "small", price: 0.01, name: "Forged" },
    { id: 1, quantity: 2, variantId: "small" },
    { id: 1, quantity: 1, variantId: "large" },
    { id: 2, quantity: 1 },
  ]);
  assert.deepEqual(cart, [
    { id: 1, variantId: "small", quantity: 3 },
    { id: 1, variantId: "large", quantity: 1 },
    { id: 2, quantity: 1 },
  ]);
  assert.deepEqual(normalizeCart(JSON.parse(JSON.stringify(cart))), cart);
  assert.deepEqual(normalizeCart({}), []);
  assert.deepEqual(normalizeCart([{ id: 2, quantity: Number.MAX_SAFE_INTEGER }, { id: 2, quantity: 1 }]), []);
  const lines = cartLines(cart, [product, base]);
  assert.ok(lines.every((line) => line.valid));
  assert.equal(new Set(lines.map((line) => line.key)).size, 3);
  assert.equal(cartTotal(lines), 42.95);
});

test("legacy base lines keep working; a newly required, removed or unavailable variant blocks purchase", () => {
  const old = normalizeCart([{ id: 1, quantity: 1 }, { id: 2, quantity: 1 }]);
  const lines = cartLines(old, [product, base]);
  assert.equal(lines[0].valid, false);
  assert.equal(lines[0].option, undefined);
  assert.equal(lines[0].price, 0);
  assert.equal(lines[1].valid, true);
  for (const variantId of ["removed", "disabled"])
    assert.equal(cartLines([{ id: 1, variantId, quantity: 1 }], [product])[0].valid, false);
  assert.equal(cartLines([{ id: 1, variantId: "small", quantity: 4 }], [product])[0].valid, false);
  assert.equal(cartLines([{ id: 1, variantId: "small", quantity: 1 }], [{ ...product, variants: [] }])[0].valid, false);
  assert.equal(cartLines([{ id: 2, quantity: 1 }], [])[0].valid, false);
});

test("catalog and IT/EN summaries reflect purchasable variants and snapshot fallbacks", () => {
  assert.equal(productAvailable(product), true);
  assert.equal(productPrice(product), 7.35);
  assert.equal(productAvailable({ ...product, available: false }), false);
  assert.equal(productAvailable({ ...product, variants: product.variants.map((variant) => ({ ...variant, stock: 0 })) }), false);
  const lines = cartLines([{ id: 1, variantId: "small", quantity: 1 }], [product]);
  assert.equal(itemDescription(lines[0], "it"), "Piccola · 6 pezzi");
  assert.equal(itemDescription(lines[0], "en"), "Small · 6 pieces");
  assert.equal(itemDescription({ variantName: "Grande", variantNameEn: "", format: "12 pezzi" }, "en"), "Grande · 12 pezzi");
  assert.equal(itemDescription({}), "");
  for (const lang of ["it", "en"])
    for (const key of ["variant", "chooseVariant", "variantRequired", "fromPrice"])
      assert.ok(translations[lang][key]);
});
