import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
const AuthContext = createContext(undefined);
const STORAGE_KEY = "notes-app-auth";
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        const persisted = localStorage.getItem(STORAGE_KEY);
        if (persisted) {
            try {
                const data = JSON.parse(persisted);
                setUser(data.user);
                setToken(data.token);
            }
            catch {
                localStorage.removeItem(STORAGE_KEY);
            }
        }
        setLoading(false);
    }, []);
    const persist = (data) => {
        setUser(data.user);
        setToken(data.token);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    };
    const handleAuth = useCallback(async (action) => {
        setError(null);
        try {
            const response = await action();
            persist(response);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Ошибка авторизации";
            setError(message);
            throw err;
        }
    }, []);
    const login = useCallback(async (payload) => {
        await handleAuth(() => api.login(payload));
    }, [handleAuth]);
    const register = useCallback(async (payload) => {
        await handleAuth(() => api.register(payload));
    }, [handleAuth]);
    const logout = useCallback(() => {
        setUser(null);
        setToken(null);
        localStorage.removeItem(STORAGE_KEY);
    }, []);
    const refreshUser = useCallback(async () => {
        if (!token)
            return;
        try {
            const me = await api.getMe(token);
            setUser(me);
            const persisted = localStorage.getItem(STORAGE_KEY);
            if (persisted) {
                const data = JSON.parse(persisted);
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, user: me }));
            }
        }
        catch {
            /* ignore — профиль обновится при следующем входе */
        }
    }, [token]);
    useEffect(() => {
        const handleStorage = (event) => {
            if (event.key === STORAGE_KEY && !event.newValue) {
                logout();
            }
        };
        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
    }, [logout]);
    const value = useMemo(() => ({
        user,
        token,
        loading,
        error,
        login,
        register,
        logout,
        refreshUser
    }), [user, token, loading, error, login, register, logout, refreshUser]);
    return _jsx(AuthContext.Provider, { value: value, children: children });
};
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error("useAuth must be used within AuthProvider");
    }
    return ctx;
};
