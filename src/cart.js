import { canPurchase, lineKey, purchaseOption } from "../shared/products.js";

export function normalizeCart(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const itemsByKey = new Map();
  for (const item of value) {
    if (!item) {
      continue;
    }

    const validProductId = Number.isSafeInteger(item.id) && item.id > 0;
    const validQuantity = Number.isSafeInteger(item.quantity) && item.quantity > 0;
    if (!validProductId || !validQuantity) {
      continue;
    }

    if (item.variantId !== undefined) {
      if (typeof item.variantId !== "string" || item.variantId.length === 0 || item.variantId.length > 100) {
        continue;
      }
    }

    const key = lineKey(item.id, item.variantId);
    const existingItem = itemsByKey.get(key);
    let quantity = item.quantity;
    if (existingItem) {
      quantity += existingItem.quantity;
    }

    if (!Number.isSafeInteger(quantity)) {
      return [];
    }

    const cartItem = { id: item.id, quantity };
    if (item.variantId !== undefined) {
      cartItem.variantId = item.variantId;
    }

    itemsByKey.set(key, cartItem);
  }

  return Array.from(itemsByKey.values());
}

export function cartLines(cart, products) {
  return cart.map((item) => {
    const product = products.find((product) => product.id === item.id);
    const option = purchaseOption(product, item.variantId);
    const line = {
      ...item,
      key: lineKey(item.id, item.variantId),
      product,
      option,
      valid: canPurchase(product, option, item.quantity),
      price: 0,
      format: option?.format,
      formatEn: option?.formatEn,
    };

    if (option) {
      line.price = Math.round(option.price * 100) / 100;
    }

    if (item.variantId !== undefined) {
      line.variantName = option?.name;
      line.variantNameEn = option?.nameEn;
    }

    return line;
  });
}

export function cartTotal(lines) {
  let totalCents = 0;
  for (const line of lines) {
    const priceCents = Math.round(line.price * 100);
    totalCents += priceCents * line.quantity;
  }

  return totalCents / 100;
}
