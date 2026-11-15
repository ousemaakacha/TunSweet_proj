export function isPastryAtlas(url) {
  return (
    url === "/images/pastries-atlas.png" ||
    url === "/images/pastries-atlas.webp"
  );
}

// I dati già salvati possono ancora indicare gli originali PNG.
export function optimizedImageUrl(url) {
  if (url === "/images/hero.png") return "/images/hero.webp";
  if (isPastryAtlas(url)) return "/images/pastries-atlas.webp";
  return url;
}
