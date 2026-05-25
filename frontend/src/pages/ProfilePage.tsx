import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import AppSidebarNav from "../components/AppSidebarNav";
import { api } from "../services/api";
import type { ReceivedShare, SentShareGroup, ShareProfile } from "../types";

function formatPermission(permission: string) {
  const normalized = permission.toLowerCase();
  if (normalized === "edit" || normalized === "write") {
    return "Редактирование";
  }
  return "Только просмотр";
}

export default function ProfilePage() {
  const { user, token } = useAuth();
  const [profile, setProfile] = useState<ShareProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const showStatus = (message: string, timeout = 4000) => {
    setStatus(message);
    if (timeout > 0) {
      setTimeout(() => setStatus(null), timeout);
    }
  };

  const loadProfile = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getShareProfile(token);
      setProfile(data);
    } catch (error) {
      showStatus(
        error instanceof Error ? error.message : "Ошибка загрузки профиля",
        6000
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    loadProfile();
  }, [loadProfile]);

  if (loading) {
    return (
      <div className="fullscreen-center">
        <div className="spinner" />
        <p>Загружаем профиль...</p>
      </div>
    );
  }

  const received = profile?.received ?? [];
  const sent = profile?.sent ?? [];

  return (
    <div className="dashboard profile-dashboard">
      <aside className="sidebar">
        <AppSidebarNav />
      </aside>

      <section className="notes-panel profile-panel">
        <header className="panel-header">
          <div>
            <h2>Профиль</h2>
            <p className="note-meta">
              {user?.username} • {user?.email}
            </p>
          </div>
        </header>

        <div className="profile-shares-grid">
          <div className="profile-shares-column">
            <h3 className="profile-shares-heading">
              Со мной поделились ({received.length})
            </h3>
            {received.length === 0 ? (
              <p className="empty-state">Пока никто не поделился с вами заметками</p>
            ) : (
              <ul className="notes-list">
                {received.map((share: ReceivedShare) => (
                  <li key={share.shareId}>
                    <div>
                      <p className="note-title">{share.noteTitle}</p>
                      <p className="note-meta">
                        От {share.ownerUsername} • {formatPermission(share.permission)} •{" "}
                        {new Date(share.sharedAt).toLocaleString()}
                      </p>
                    </div>
                    <Link className="btn ghost" to={`/app?noteId=${share.noteId}`}>
                      Открыть
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="profile-shares-column">
            <h3 className="profile-shares-heading">
              Я поделился ({sent.length})
            </h3>
            {sent.length === 0 ? (
              <p className="empty-state">Вы ещё не делились своими заметками</p>
            ) : (
              <ul className="notes-list">
                {sent.map((group: SentShareGroup) => (
                  <li key={group.noteId}>
                    <div style={{ flex: 1 }}>
                      <p className="note-title">{group.noteTitle}</p>
                      <ul className="profile-recipients-list">
                        {group.recipients.map((recipient) => (
                          <li key={recipient.shareId} className="note-meta">
                            {recipient.username} — {formatPermission(recipient.permission)} •{" "}
                            {new Date(recipient.sharedAt).toLocaleString()}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Link className="btn ghost" to={`/app?noteId=${group.noteId}`}>
                      Открыть
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {status && (
        <div className="toast">
          <span>{status}</span>
        </div>
      )}
    </div>
  );
}
