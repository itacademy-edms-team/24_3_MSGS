import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
function navTabClass({ isActive }) {
    return ["btn ghost", isActive ? "app-nav-tab--active" : ""].filter(Boolean).join(" ");
}
const navLinkStyle = {
    textDecoration: "none",
    textAlign: "center",
    width: "100%",
    boxSizing: "border-box"
};
export default function AppSidebarNav() {
    const { user, logout } = useAuth();
    return (_jsxs("div", { className: "user-card app-sidebar-nav-card", children: [_jsx("div", { className: "user-card-header", children: _jsxs("div", { children: [_jsx("p", { className: "user-name", children: user?.username }), _jsx("p", { className: "user-email", children: user?.email })] }) }), _jsxs("nav", { className: "app-main-nav", "aria-label": "\u0420\u0430\u0437\u0434\u0435\u043B\u044B \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F", children: [_jsx(NavLink, { to: "/app", end: true, className: navTabClass, style: navLinkStyle, children: "\u0417\u0430\u043C\u0435\u0442\u043A\u0438" }), _jsx(NavLink, { to: "/friends", className: navTabClass, style: navLinkStyle, children: "\u0414\u0440\u0443\u0437\u044C\u044F" }), _jsx(NavLink, { to: "/chat", className: navTabClass, style: navLinkStyle, children: "\u0427\u0430\u0442\u044B" }), _jsx(NavLink, { to: "/profile", className: navTabClass, style: navLinkStyle, children: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C" }), _jsx("button", { type: "button", className: "btn ghost", onClick: logout, style: { width: "100%" }, children: "\u0412\u044B\u0439\u0442\u0438" })] })] }));
}
