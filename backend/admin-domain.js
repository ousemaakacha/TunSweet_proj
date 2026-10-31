import z from "zod";
import { ownsImage } from "./image-storage.js";
export const orderStatuses = [
  "In attesa",
  "Confermato",
  "In preparazione",
  "Pronto per il ritiro",
  "Completato",
  "Annullato",
];
const text = z.string().trim().max(5000);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const httpsUrl = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
};
const imageUrl = (v) => httpsUrl(v) || /^\/images\/[a-zA-Z0-9_./-]+$/.test(v);
const image = z
  .object({
    url: text.refine(imageUrl, "Usa un URL HTTPS valido."),
    publicId: text.optional(),
    source: z.enum(["external", "cloudinary"]),
    altIt: text,
    altEn: text,
    isPrimary: z.boolean(),
    sortOrder: z.number().int().min(0),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.source === "cloudinary" ? !ownsImage(v.publicId, v.url) : !!v.publicId
    )
      c.addIssue({
        code: "custom",
        message: "Riferimento immagine non valido.",
      });
  });
export function validateDomain(type, value) {
  if (type === "product") {
    z.object({
      title: text.min(1),
      category: text.min(1),
      price: z.number().finite().min(0).max(100000),
      stock: z.number().int().min(0).max(100000),
      images: z.array(image).min(1).max(12).optional(),
      image: text.refine(imageUrl),
      variants: z
        .array(
          z.object({
            name: text.min(1),
            format: text,
            price: z.number().finite().min(0),
            stock: z.number().int().min(0),
            available: z.boolean(),
          }),
        )
        .max(30)
        .optional(),
    }).parse(value);
    if (value.images && value.images.filter((i) => i.isPrimary).length !== 1)
      throw new Error("Seleziona una sola immagine principale.");
  }
  if (type === "availability") {
    z.object({
      date: z.string().date(),
      enabled: z.boolean(),
      notes: text,
      slots: z
        .array(
          z
            .object({
              start: time,
              end: time,
              capacity: z.number().int().min(0).max(1000),
            })
            .refine(
              (v) => v.start < v.end,
              "L’orario finale deve seguire quello iniziale.",
            ),
        )
        .min(1)
        .max(20),
    }).parse(value);
    const sorted = [...value.slots].sort((a, b) =>
      a.start.localeCompare(b.start),
    );
    if (sorted.some((s, i) => i && s.start < sorted[i - 1].end))
      throw new Error("Le fasce non possono sovrapporsi.");
  }
  if (type === "storesetting") {
    z.object({
      name: text.min(1),
      email: z.union([z.literal(""), z.string().email()]),
      whatsapp: z.string().regex(/^\+?\d{0,20}$/),
      instagram: z.string().refine((v) => !v || httpsUrl(v)),
      start: time,
      end: time,
      weekdays: z.array(z.number().int().min(0).max(6)).max(7),
      lowStock: z.number().int().min(0).max(100000),
      logo: z.string().refine((v) => !v || imageUrl(v)),
      primaryColor: z.string().regex(/^#[a-fA-F0-9]{6}$/),
    })
      .refine((v) => v.start < v.end, "Orari non validi.")
      .parse(value);
    if (value.logoPublicId && !ownsImage(value.logoPublicId, value.logo))
      throw new Error("Logo non gestito.");
  }
  if (type === "customer")
    z.object({
      name: text.min(1),
      email: z.string().email(),
      phone: z.string().max(25),
      notes: text,
    }).parse(value);
  if (type === "review")
    z.object({
      author: text.min(1),
      text: text.min(1),
      rating: z.number().int().min(1).max(5),
      status: z.enum(["In attesa", "Approvata", "Nascosta"]),
    }).parse(value);
}
