import type { CSSProperties } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

function navTabClass({ isActive }: { isActive: boolean }) {
  return ["btn ghost", isActive ? "app-nav-tab--active" : ""].filter(Boolean).join(" ");
}

const navLinkStyle: CSSProperties = {
  textDecoration: "none",
  textAlign: "center",
  width: "100%",
  boxSizing: "border-box"
};

export default function AppSidebarNav() {
  const { user, logout } = useAuth();

  return (
    <div className="user-card app-sidebar-nav-card">
      <div className="user-card-header">
        <div>
          <p className="user-name">{user?.username}</p>
          <p className="user-email">{user?.email}</p>
        </div>
      </div>
      <nav className="app-main-nav" aria-label="Разделы приложения">
        <NavLink to="/app" end className={navTabClass} style={navLinkStyle}>
          Заметки
        </NavLink>
        <NavLink to="/friends" className={navTabClass} style={navLinkStyle}>
          Друзья
        </NavLink>
        <NavLink to="/chat" className={navTabClass} style={navLinkStyle}>
          Чаты
        </NavLink>
        <button type="button" className="btn ghost" onClick={logout} style={{ width: "100%" }}>
          Выйти
        </button>
      </nav>
    </div>
  );
}
