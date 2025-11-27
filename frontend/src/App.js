import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
const ProtectedRoute = ({ children }) => {
    const { token, loading } = useAuth();
    if (loading) {
        return (_jsxs("div", { className: "fullscreen-center", children: [_jsx("div", { className: "spinner" }), _jsx("p", { children: "\u041F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u043C \u0441\u0435\u0441\u0441\u0438\u044E..." })] }));
    }
    if (!token) {
        return _jsx(Navigate, { to: "/login", replace: true });
    }
    return children;
};
const AppRoutes = () => (_jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsx(Route, { path: "/register", element: _jsx(RegisterPage, {}) }), _jsx(Route, { path: "/app", element: _jsx(ProtectedRoute, { children: _jsx(DashboardPage, {}) }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/app", replace: true }) })] }));
export default function App() {
    return (_jsx(AuthProvider, { children: _jsx(BrowserRouter, { children: _jsx(AppRoutes, {}) }) }));
}
