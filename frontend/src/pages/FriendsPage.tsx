import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../services/api";
import type { Friendship, User } from "../types";

export default function FriendsPage() {
  const { user, token } = useAuth();
  const [friends, setFriends] = useState<User[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Friendship[]>([]);
  const [sentRequests, setSentRequests] = useState<Friendship[]>([]);
  const [usernameInput, setUsernameInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const showStatus = (message: string, timeout = 4000) => {
    setStatus(message);
    if (timeout > 0) {
      setTimeout(() => setStatus(null), timeout);
    }
  };

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [friendsData, pendingData, allFriendships] = await Promise.all([
        api.getFriends(token),
        api.getPendingRequests(token),
        api.getFriendships(token)
      ]);

      setFriends(friendsData);
      setPendingRequests(pendingData);
      setSentRequests(
        allFriendships.filter(
          (f) => f.status === "pending" && f.requesterId === user?.id
        )
      );
    } catch (error) {
      showStatus(
        error instanceof Error ? error.message : "Ошибка загрузки данных",
        6000
      );
    } finally {
      setLoading(false);
    }
  }, [token, user?.id]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const handleSendRequest = async () => {
    if (!token || !usernameInput.trim()) return;
    try {
      await api.sendFriendRequest(token, { username: usernameInput.trim() });
      setUsernameInput("");
      showStatus("Заявка отправлена");
      loadData();
    } catch (error) {
      showStatus(
        error instanceof Error ? error.message : "Ошибка отправки заявки",
        6000
      );
    }
  };

  const handleAccept = async (id: number) => {
    if (!token) return;
    try {
      await api.acceptFriendRequest(token, id);
      showStatus("Заявка принята");
      loadData();
    } catch (error) {
      showStatus(
        error instanceof Error ? error.message : "Ошибка принятия заявки",
        6000
      );
    }
  };

  const handleReject = async (id: number) => {
    if (!token) return;
    try {
      await api.rejectFriendRequest(token, id);
      showStatus("Заявка отклонена");
      loadData();
    } catch (error) {
      showStatus(
        error instanceof Error ? error.message : "Ошибка отклонения заявки",
        6000
      );
    }
  };

  const handleDelete = async (id: number) => {
    if (!token) return;
    if (!confirm("Удалить из друзей?")) return;
    try {
      await api.deleteFriendship(token, id);
      showStatus("Удалено из друзей");
      loadData();
    } catch (error) {
      showStatus(
        error instanceof Error ? error.message : "Ошибка удаления",
        6000
      );
    }
  };

  if (loading) {
    return (
      <div className="fullscreen-center">
        <div className="spinner" />
        <p>Загружаем данные...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="user-card">
          <div>
            <p className="user-name">{user?.username}</p>
            <p className="user-email">{user?.email}</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <Link to="/app" className="btn ghost" style={{ textDecoration: "none", textAlign: "center" }}>
              Заметки
            </Link>
            <Link to="/chat" className="btn ghost" style={{ textDecoration: "none", textAlign: "center" }}>
              Чаты
            </Link>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="section-header">
            <h3>Друзья</h3>
            <span className="badge">{friends.length}</span>
          </div>

          <div className="folder-form">
            <input
              type="text"
              placeholder="Username пользователя"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSendRequest()}
            />
            <button
              type="button"
              className="btn primary"
              onClick={handleSendRequest}
            >
              Добавить в друзья
            </button>
          </div>
        </div>
      </aside>

      <section className="notes-panel" style={{ width: "100%" }}>
        <header className="panel-header">
          <div>
            <h2>Друзья и заявки</h2>
          </div>
        </header>

        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "2rem" }}>
          {/* Входящие заявки */}
          {pendingRequests.length > 0 && (
            <div>
              <h3 style={{ marginBottom: "1rem", color: "#4c3df7" }}>
                Входящие заявки ({pendingRequests.length})
              </h3>
              <ul className="notes-list">
                {pendingRequests.map((request) => (
                  <li key={request.id}>
                    <div>
                      <p className="note-title">{request.requesterUsername}</p>
                      <p className="note-meta">
                        Заявка отправлена {new Date(request.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        className="btn success"
                        onClick={() => handleAccept(request.id)}
                      >
                        Принять
                      </button>
                      <button
                        className="btn ghost"
                        onClick={() => handleReject(request.id)}
                      >
                        Отклонить
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Исходящие заявки */}
          {sentRequests.length > 0 && (
            <div>
              <h3 style={{ marginBottom: "1rem", color: "#4c3df7" }}>
                Исходящие заявки ({sentRequests.length})
              </h3>
              <ul className="notes-list">
                {sentRequests.map((request) => (
                  <li key={request.id}>
                    <div>
                      <p className="note-title">{request.addresseeUsername}</p>
                      <p className="note-meta">
                        Заявка отправлена {new Date(request.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <button
                      className="btn ghost"
                      onClick={() => handleDelete(request.id)}
                    >
                      Отменить
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Список друзей */}
          <div>
            <h3 style={{ marginBottom: "1rem", color: "#4c3df7" }}>
              Друзья ({friends.length})
            </h3>
            {friends.length === 0 ? (
              <p className="empty-state">У вас пока нет друзей</p>
            ) : (
              <ul className="notes-list">
                {friends.map((friend) => {
                  const friendship = [...pendingRequests, ...sentRequests].find(
                    (f) =>
                      (f.requesterId === friend.id || f.addresseeId === friend.id) &&
                      f.status === "accepted"
                  );
                  return (
                    <li key={friend.id}>
                      <div>
                        <p className="note-title">{friend.username}</p>
                        <p className="note-meta">{friend.email}</p>
                      </div>
                      <button
                        className="btn ghost"
                        onClick={() => friendship && handleDelete(friendship.id)}
                      >
                        Удалить
                      </button>
                    </li>
                  );
                })}
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

