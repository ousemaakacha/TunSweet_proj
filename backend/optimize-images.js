import assert from "node:assert/strict";
import fs from "node:fs/promises";
import sharp from "sharp";

const results = [];
for (const name of ["hero", "pastries-atlas"]) {
  const original = new URL(`../public/images/${name}.png`, import.meta.url);
  const optimized = new URL(`../public/images/${name}.webp`, import.meta.url);
  const input = await fs.readFile(original);
  const metadata = await sharp(input).metadata();
  const { data, info } = await sharp(input)
    .webp({ quality: 90, effort: 6 })
    .toBuffer({ resolveWithObject: true });

  assert.equal(info.width, metadata.width);
  assert.equal(info.height, metadata.height);
  assert.ok(data.length < input.length, `${name}: nessuna riduzione di peso`);
  await fs.writeFile(optimized, data);
  results.push({
    image: name,
    dimensions: `${info.width}×${info.height}`,
    pngBytes: input.length,
    webpBytes: data.length,
    reduction: `${((1 - data.length / input.length) * 100).toFixed(2)}%`,
  });
}
console.table(results);
