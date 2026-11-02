import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../backend/package.json", import.meta.url),
);
test("Cloudinary adapter validates real bytes, returns metadata and deletes only owned assets (provider mocked)", async (t) => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "tunisweet-storage-test-"),
  );
  process.env.DATABASE_DIR = dir;
  process.env.CLOUDINARY_CLOUD_NAME = "storage-test";
  process.env.CLOUDINARY_API_KEY = "test-only";
  process.env.CLOUDINARY_API_SECRET = "test-only";
  const cloudinary = require("cloudinary").v2,
    sharp = require("sharp");
  let uploaded = 0,
    deleted = 0;
  t.mock.method(cloudinary.uploader, "upload_stream", (options, callback) => ({
    end(buffer) {
      uploaded++;
      assert.ok(buffer.length);
      assert.match(options.public_id, /^tunisweet\/products\//);
      callback(null, {
        secure_url:
          "https://res.cloudinary.com/storage-test/image/upload/test.webp",
        public_id: options.public_id,
        format: "webp",
        width: 20,
        height: 10,
      });
    },
  }));
  t.mock.method(cloudinary.uploader, "destroy", async () => {
    deleted++;
    return { result: "ok" };
  });
  try {
    const { cloudinaryStorageAdapter: adapter, ownsImage } =
      await import("../backend/image-storage.js");
    await assert.rejects(adapter.upload({ buffer: Buffer.from("fake image") }));
    assert.equal(uploaded, 0);
    const buffer = await sharp({
      create: { width: 20, height: 10, channels: 3, background: "#536348" },
    })
      .png()
      .toBuffer();
    const image = await adapter.upload({ buffer });
    assert.equal(image.width, 20);
    assert.equal(image.height, 10);
    assert.equal(image.format, "webp");
    assert.equal(uploaded, 1);
    assert.ok(ownsImage(image.publicId, image.url));
    assert.equal(adapter.getUrl(image.publicId), image.url);
    assert.equal(adapter.metadata(image.publicId).width, 20);
    await assert.rejects(adapter.delete("another-app/image"));
    assert.equal(deleted, 0);
    await adapter.delete(image.publicId);
    assert.equal(deleted, 1);
    assert.equal(ownsImage(image.publicId), false);
    await assert.rejects(adapter.delete(image.publicId));
    assert.equal(deleted, 1);
  } finally {
    t.mock.restoreAll();
    if (
      path.dirname(dir) === os.tmpdir() &&
      path.basename(dir).startsWith("tunisweet-storage-test-")
    )
      await fs.rm(dir, { recursive: true, force: true });
  }
});
