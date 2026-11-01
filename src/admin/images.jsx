import { useEffect, useRef, useState } from "react";
import { imageStorageService, isHttps } from "./services";
import { it as t } from "./text";
import { Field, useAdminUI } from "./ui";
export const normalizeImages = (images) =>
  images.map((i, n) => ({
    ...i,
    sortOrder: n,
    isPrimary: images.some((x) => x.isPrimary) ? i.isPrimary : n === 0,
  }));
export function ImagePreview({ url, alt = "" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return failed ? (
    <div className="admin-image-fallback">{t.imageFallback}</div>
  ) : (
    <img src={url} alt={alt} onError={() => setFailed(true)} />
  );
}
export function ImageManager({
  value,
  onChange,
  onRemoved = () => {},
  onBusy = () => {},
  max = 12,
}) {
  const [mode, setMode] = useState("url"),
    [config, setConfig] = useState(null),
    [url, setUrl] = useState(""),
    [altIt, setAltIt] = useState(""),
    [altEn, setAltEn] = useState(""),
    [busy, setBusy] = useState(false),
    [previews, setPreviews] = useState([]),
    [deleteCloud, setDeleteCloud] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    { notify } = useAdminUI();
  useEffect(() => {
    let alive = true;
    imageStorageService
      .config()
      .then((v) => alive && setConfig(v))
      .catch(() => alive && setConfig({ configured: false }));
    return () => {
      alive = false;
    };
  }, []);
  const update = (images) => onChange(normalizeImages(images));
  const addUrl = () => {
    if (!isHttps(url)) {
      setError(t.urlInvalid);
      return;
    }
    if (value.length >= max) {
      setError(t.imageInvalid);
      return;
    }
    update([
      ...value,
      {
        url,
        source: "external",
        altIt,
        altEn,
        isPrimary: value.length === 0,
        sortOrder: value.length,
      },
    ]);
    setUrl("");
    setAltIt("");
    setAltEn("");
    setError("");
  };
  const files = async (list) => {
    if (lock.current || !config?.configured) return;
    const selected = Array.from(list);
    if (!selected.length) return;
    if (
      value.length + selected.length > max ||
      selected.some(
        (f) =>
          !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
          f.size > 5 * 1024 * 1024 ||
          !f.size,
      )
    ) {
      setError(t.imageInvalid);
      return;
    }
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    const urls = selected.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    let next = [...value];
    try {
      for (const file of selected) {
        const result = await imageStorageService.upload(file);
        next = [
          ...next,
          {
            url: result.url,
            publicId: result.publicId,
            source: "cloudinary",
            altIt: file.name.replace(/\.[^.]+$/, ""),
            altEn: "",
            isPrimary: next.length === 0,
            sortOrder: next.length,
          },
        ];
        update(next);
      }
    } catch (e) {
      setError(e.status ? e.message : t.error);
    } finally {
      urls.forEach((u) => URL.revokeObjectURL(u));
      setPreviews([]);
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  };
  const move = (index, offset) => {
    const next = [...value];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    update(next);
  };
  return (
    <div className="admin-images">
      <div className="admin-tabs" role="group" aria-label={t.images}>
        <button
          type="button"
          aria-pressed={mode === "file"}
          onClick={() => setMode("file")}
        >
          {t.upload}
        </button>
        <button
          type="button"
          aria-pressed={mode === "url"}
          onClick={() => setMode("url")}
        >
          {t.urlMode}
        </button>
      </div>
      {!config?.configured && (
        <p className="admin-notice">
          {config === null ? t.loading : t.cloudMissing}
        </p>
      )}
      {mode === "file" ? (
        <label
          className={`admin-drop ${busy ? "busy" : ""}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            files(e.dataTransfer.files);
          }}
        >
          <strong>{busy ? t.uploading : t.drop}</strong>
          <span>{t.fileHelp}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple={max > 1}
            disabled={busy || !config?.configured || value.length >= max}
            onChange={(e) => {
              files(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      ) : (
        <div className="admin-form-grid">
          <Field
            label={t.url}
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError("");
            }}
          />
          <Field
            label={t.altIt}
            value={altIt}
            onChange={(e) => setAltIt(e.target.value)}
          />
          <Field
            label={t.altEn}
            value={altEn}
            onChange={(e) => setAltEn(e.target.value)}
          />
          {isHttps(url) && (
            <div className="admin-url-preview">
              <ImagePreview url={url} alt={altIt} />
            </div>
          )}
          <button
            className="button secondary"
            type="button"
            disabled={busy || value.length >= max}
            onClick={addUrl}
          >
            {t.addImage}
          </button>
        </div>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {previews.map((p) => (
        <div className="admin-url-preview" key={p}>
          <img src={p} alt={t.uploading} />
        </div>
      ))}
      <div className="admin-image-grid">
        {value.map((image, index) => (
          <div className="admin-image-card" key={`${image.url}-${index}`}>
            <ImagePreview url={image.url} alt={image.altIt} />
            {image.isPrimary && (
              <strong className="admin-badge">{t.primary}</strong>
            )}
            <Field
              label={t.altIt}
              value={image.altIt}
              disabled={busy}
              onChange={(e) =>
                update(
                  value.map((v, i) =>
                    i === index ? { ...v, altIt: e.target.value } : v,
                  ),
                )
              }
            />
            <Field
              label={t.altEn}
              value={image.altEn}
              disabled={busy}
              onChange={(e) =>
                update(
                  value.map((v, i) =>
                    i === index ? { ...v, altEn: e.target.value } : v,
                  ),
                )
              }
            />
            <div className="admin-actions">
              <button
                type="button"
                disabled={busy || image.isPrimary}
                onClick={() =>
                  update(
                    value.map((v, i) => ({ ...v, isPrimary: i === index })),
                  )
                }
              >
                {t.makePrimary}
              </button>
              <button
                type="button"
                aria-label={t.moveUp}
                disabled={busy || index === 0}
                onClick={() => move(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={t.moveDown}
                disabled={busy || index === value.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const next = value.filter((_, i) => i !== index);
                  if (image.isPrimary && next.length)
                    next[0] = { ...next[0], isPrimary: true };
                  update(next);
                  onRemoved(image, deleteCloud);
                  notify(t.imageRemoved);
                }}
              >
                {t.remove}
              </button>
            </div>
          </div>
        ))}
      </div>
      {value.some((i) => i.source === "cloudinary") && (
        <label className="admin-check">
          <input
            type="checkbox"
            checked={deleteCloud}
            onChange={(e) => setDeleteCloud(e.target.checked)}
          />
          {t.deleteCloud}
        </label>
      )}
    </div>
  );
}
