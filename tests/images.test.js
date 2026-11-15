import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { isPastryAtlas, optimizedImageUrl } from "../shared/images.js";

const require = createRequire(new URL("../backend/package.json", import.meta.url));
const sharp = require("sharp");

test("legacy PNG paths use WebP; panel URLs are preserved", () => {
  assert.equal(optimizedImageUrl("/images/hero.png"), "/images/hero.webp");
  for (const extension of ["png", "webp"]) {
    const url = `/images/pastries-atlas.${extension}`;
    assert.equal(isPastryAtlas(url), true);
    assert.equal(optimizedImageUrl(url), "/images/pastries-atlas.webp");
  }
  for (const url of [
    "https://example.com/pastries-atlas.png",
    "https://res.cloudinary.com/shop/image/upload/photo.webp",
    "/images/custom.png",
    "blob:preview",
    undefined,
  ]) {
    assert.equal(isPastryAtlas(url), false);
    assert.equal(optimizedImageUrl(url), url);
  }
});

test("optimized images keep the original resolution and atlas grid", async () => {
  for (const name of ["hero", "pastries-atlas"]) {
    const png = await fs.readFile(new URL(`../public/images/${name}.png`, import.meta.url));
    const webp = await fs.readFile(new URL(`../public/images/${name}.webp`, import.meta.url));
    const original = await sharp(png).metadata();
    const optimized = await sharp(webp).metadata();
    assert.equal(optimized.format, "webp");
    assert.equal(optimized.width, original.width);
    assert.equal(optimized.height, original.height);
    assert.ok(webp.length < png.length);
    if (name === "pastries-atlas") {
      assert.equal(optimized.width / 4, 362);
      assert.equal(optimized.height / 3, 362);
    }
  }
});
