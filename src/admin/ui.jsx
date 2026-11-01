import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { it as t } from "./text";
const AdminUI = createContext(null);
export function AdminUIProvider({ children }) {
  const [toast, setToast] = useState(null),
    [confirmation, setConfirmation] = useState(null);
  const dialog = useRef(null),
    resolve = useRef(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (confirmation) dialog.current?.showModal();
  }, [confirmation]);
  const finish = (value) => {
    dialog.current?.close();
    setConfirmation(null);
    resolve.current?.(value);
  };
  return (
    <AdminUI.Provider
      value={{
        notify: (message, error = false) => setToast({ message, error }),
        confirm: (message) =>
          new Promise((r) => {
            resolve.current = r;
            setConfirmation(message);
          }),
      }}
    >
      {children}
      {toast && (
        <div
          className={`toast admin-toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.message}
        </div>
      )}
      <dialog
        ref={dialog}
        className="admin-dialog"
        onCancel={(e) => {
          e.preventDefault();
          finish(false);
        }}
      >
        <h2>{t.confirmTitle}</h2>
        <p>{confirmation}</p>
        <div className="admin-actions">
          <button
            className="button secondary"
            autoFocus
            onClick={() => finish(false)}
          >
            {t.cancel}
          </button>
          <button className="button" onClick={() => finish(true)}>
            {t.confirm}
          </button>
        </div>
      </dialog>
    </AdminUI.Provider>
  );
}
export const useAdminUI = () => useContext(AdminUI);
export function useResource(loader, resourceKey) {
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const alive = useRef(true),
    latest = useRef(loader),
    version = useRef(0);
  latest.current = loader;
  const reload = useCallback(async () => {
    const v = ++version.current;
    setLoading(true);
    setError("");
    try {
      const value = await latest.current();
      if (alive.current && v === version.current) setData(value);
    } catch (e) {
      if (alive.current && v === version.current)
        setError(e.status ? e.message : t.error);
    } finally {
      if (alive.current && v === version.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    reload();
    return () => {
      alive.current = false;
    };
  }, [reload, resourceKey]);
  return { data, setData, loading, error, reload };
}
export function useAction() {
  const [busy, setBusy] = useState(false),
    lock = useRef(false),
    { notify } = useAdminUI();
  const run = async (fn, message = t.saved) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    try {
      await fn();
      if (message) notify(message);
      return true;
    } catch (e) {
      notify(
        e.status
          ? e.message
          : e.message && e.message !== "Failed to fetch"
            ? e.message
            : t.error,
        true,
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, run };
}
export function ResourceState({ resource, children }) {
  if (resource.loading)
    return (
      <div className="admin-state" role="status">
        <span className="spinner" />
        {t.loading}
      </div>
    );
  if (resource.error)
    return (
      <div className="admin-state" role="alert">
        <p>{resource.error}</p>
        <button className="button secondary" onClick={resource.reload}>
          {t.retry}
        </button>
      </div>
    );
  return children;
}
export function Badge({ children }) {
  return (
    <span
      className={`admin-badge ${["In attesa", "Bozza", "Nascosta", "Annullato"].includes(children) ? "warm" : ""}`}
    >
      {children}
    </span>
  );
}
export function Field({ label, children, ...props }) {
  return (
    <label className={props.className || ""}>
      <span>{label}</span>
      {children || <input {...props} />}
    </label>
  );
}
export function Empty({ text = t.empty }) {
  return <p className="admin-empty">{text}</p>;
}
