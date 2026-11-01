import { createContext, useContext, useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { adminAuthService } from "./services";
const AdminAuthContext = createContext(null);
export function AdminAuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const sync = () =>
      adminAuthService
        .session()
        .then((s) => {
          if (active) setSession(s);
        })
        .catch(() => {
          if (active) setSession(null);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    sync();
    const expired = () => setSession(null);
    window.addEventListener("admin-session-expired", expired);
    const timer = setInterval(() => {
      sync();
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("admin-session-expired", expired);
    };
  }, []);
  return (
    <AdminAuthContext.Provider
      value={{
        session,
        loading,
        login: async (email, password) => {
          const s = await adminAuthService.login(email, password);
          setSession(s);
        },
        logout: async () => {
          try {
            await adminAuthService.logout();
          } finally {
            setSession(null);
          }
        },
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}
export const useAdminAuth = () => useContext(AdminAuthContext);
export function ProtectedAdminRoute() {
  const { session, loading } = useAdminAuth(),
    location = useLocation();
  if (loading)
    return (
      <div className="status-box" role="status">
        Caricamento…
      </div>
    );
  return session ? (
    <Outlet />
  ) : (
    <Navigate
      to="/admin/login"
      replace
      state={{ from: location.pathname + location.search }}
    />
  );
}
