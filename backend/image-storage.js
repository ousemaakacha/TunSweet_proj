import { v2 as cloudinary } from "cloudinary";
import sharp from "sharp";
import multer from "multer";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const storageDirectory =
  process.env.DATABASE_DIR ||
  fileURLToPath(new URL("./database/", import.meta.url));
const registryFile = path.join(storageDirectory, "managed-images.json");
let assets = {};
try {
  assets = JSON.parse(await fs.readFile(registryFile, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
let write = Promise.resolve();
const persist = () => {
  const body = JSON.stringify(assets);
  write = write
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(storageDirectory, { recursive: true });
      await fs.writeFile(`${registryFile}.tmp`, body);
      await fs.rename(`${registryFile}.tmp`, registryFile);
    });
  return write;
};
export const configured = () =>
  [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ].every((k) => !!process.env[k]);
const setup = () =>
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype));
  },
}).single("image");
export const ownsImage = (id, url) =>
  !!assets[id] && (!url || assets[id].url === url);
export const cloudinaryStorageAdapter = {
  async upload(file) {
    if (!file)
      throw Object.assign(
        new Error("Seleziona un file JPEG, PNG o WebP, massimo 5 MB."),
        { status: 400 },
      );
    let data;
    try {
      const image = sharp(file.buffer, {
        limitInputPixels: 40000000,
        animated: false,
      });
      const metadata = await image.metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format)) throw new Error();
      data = await image.webp({ quality: 90 }).toBuffer();
    } catch {
      throw Object.assign(
        new Error(
          "Il contenuto del file non è un’immagine valida o è troppo grande.",
        ),
        { status: 400 },
      );
    }
    if (!configured())
      throw Object.assign(
        new Error(
          "Cloudinary non configurato. Usa Inserisci URL oppure configura il backend.",
        ),
        { status: 503 },
      );
    setup();
    const uploaded = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: `tunisweet/products/${randomUUID()}`,
          resource_type: "image",
          overwrite: false,
        },
        (error, result) => (error ? reject(error) : resolve(result)),
      );
      stream.end(data);
    });
    const record = {
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
      format: uploaded.format,
      width: uploaded.width,
      height: uploaded.height,
    };
    assets[record.publicId] = record;
    await persist();
    return record;
  },
  async delete(publicId) {
    if (!ownsImage(publicId) || !publicId.startsWith("tunisweet/products/"))
      throw Object.assign(new Error("Immagine non gestita da TUNISWEET."), {
        status: 400,
      });
    if (!configured())
      throw Object.assign(new Error("Cloudinary non configurato."), {
        status: 503,
      });
    setup();
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true,
    });
    if (!["ok", "not found"].includes(result.result))
      throw new Error("Cloudinary deletion failed");
    delete assets[publicId];
    await persist();
  },
  getUrl(publicId) {
    return assets[publicId]?.url;
  },
  metadata(publicId) {
    return assets[publicId];
  },
};
