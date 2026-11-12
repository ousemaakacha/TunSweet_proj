export function hasVariants(product) {
  if (!product || !product.variants) {
    return false;
  }

  return product.variants.length > 0;
}

export function purchaseOption(product, variantId) {
  if (hasVariants(product)) {
    if (variantId === undefined) {
      return undefined;
    }

    return product.variants.find((variant) => variant.id === variantId);
  }

  if (variantId !== undefined) {
    return undefined;
  }

  return product;
}

export function canPurchase(product, option, quantity = 1) {
  if (!product || !option) {
    return false;
  }

  if (product.published === false || !product.available || !option.available) {
    return false;
  }

  if (!Number.isSafeInteger(option.stock)) {
    return false;
  }

  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    return false;
  }

  return quantity <= option.stock;
}

export function productAvailable(product) {
  if (hasVariants(product)) {
    return product.variants.some((variant) => canPurchase(product, variant));
  }

  return canPurchase(product, product);
}

export function productPrice(product) {
  if (!hasVariants(product)) {
    return product.price;
  }

  let variants = product.variants.filter((variant) => canPurchase(product, variant));
  if (variants.length === 0) {
    variants = product.variants;
  }

  let lowestPrice = variants[0].price;
  for (const variant of variants) {
    if (variant.price < lowestPrice) {
      lowestPrice = variant.price;
    }
  }

  return lowestPrice;
}

export function lineKey(productId, variantId) {
  return `${productId}:${variantId ?? ""}`;
}

export function itemDescription(item, lang = "it") {
  let variantName = item.variantName;
  let format = item.format;

  if (lang === "en") {
    variantName = item.variantNameEn || variantName;
    format = item.formatEn || format;
  }

  const parts = [];
  if (variantName) {
    parts.push(variantName);
  }
  if (format) {
    parts.push(format);
  }

  return parts.join(" · ");
}
