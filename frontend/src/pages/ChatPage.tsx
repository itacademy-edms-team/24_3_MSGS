import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "../auth/AuthContext";
import { api } from "../services/api";
import type { Conversation, Message, Note, Folder, User } from "../types";

export default function ChatPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [showShareNotes, setShowShareNotes] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const showStatus = (message: string, timeout = 4000) => {
    setStatus(message);
    if (timeout > 0) {
      setTimeout(() => setStatus(null), timeout);
    }
  };

  const loadConversations = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getConversations(token);
      setConversations(data);
    } catch (error) {
      showStatus(
        error instanceof Error ? error.message : "Ошибка загрузки чатов",
        6000
      );
    }
  }, [token]);

  const loadFriends = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getFriends(token);
      setFriends(data);
    } catch (error) {
      // Игнорируем ошибки загрузки друзей
    }
  }, [token]);

  const loadMessages = useCallback(async (conversationId: number) => {
    if (!token) return;
    try {
      const data = await api.getConversationMessages(token, conversationId);
      setMessages(data);
    } catch (error) {
      showStatus(
        error instanceof Error ? error.message : "Ошибка загрузки сообщений",
        6000
      );
    }
  }, [token]);

  const loadNotes = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getNotes(token);
      setNotes(data);
    } catch (error) {
      // Игнорируем ошибки
    }
  }, [token]);

  const loadFolders = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getFolders(token);
      setFolders(data);
    } catch (error) {
      // Игнорируем ошибки
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadConversations(), loadFriends()])
      .finally(() => setLoading(false));
  }, [loadConversations, loadFriends]);

  useEffect(() => {
    if (selectedConversationId) {
      loadMessages(selectedConversationId);
    } else {
      setMessages([]);
    }
  }, [selectedConversationId, loadMessages]);

  useEffect(() => {
    if (showShareNotes) {
      Promise.all([loadNotes(), loadFolders()]);
    }
  }, [showShareNotes, loadNotes, loadFolders]);

  const handleSelectConversation = (conversationId: number) => {
    setSelectedConversationId(conversationId);
    setShowShareNotes(false);
  };

  const handleStartConversation = async (friendId: number) => {
    if (!token) return;
    try {
      const conversation = await api.createOrGetConversation(token, { userId: friendId });
      setConversations((prev) => {
        const exists = prev.find((c) => c.id === conversation.id);
        if (exists) return prev;
        return [...prev, conversation];
      });
      setSelectedConversationId(conversation.id);
    } catch (error) {
      showStatus(
        error instanceof Error ? error.message : "Ошибка создания чата",
        6000
      );
    }
  };

  const handleSendMessage = async () => {
    if (!token || !selectedConversationId || !messageInput.trim()) return;
    setSending(true);
    try {
      const message = await api.sendMessage(token, {
        content: messageInput.trim(),
        conversationId: selectedConversationId
      });
      setMessages((prev) => [...prev, message]);
      setMessageInput("");
      loadConversations(); // Обновляем список чатов для обновления последнего сообщения
    } catch (error) {
      showStatus(
        error instanceof Error ? error.message : "Ошибка отправки сообщения",
        6000
      );
    } finally {
      setSending(false);
    }
  };

  const handleShareNote = async (noteId: number) => {
    if (!token || !selectedConversationId) return;
    try {
      await api.shareNote(token, {
        conversationId: selectedConversationId,
        noteId
      });
      setShowShareNotes(false);
      showStatus("Заметка отправлена");
      loadMessages(selectedConversationId);
      loadConversations();
    } catch (error) {
      showStatus(
        error instanceof Error ? error.message : "Ошибка отправки заметки",
        6000
      );
    }
  };

  const folderName = (folderId: number | null) => {
    if (!folderId) return "Без папки";
    return folders.find((f) => f.id === folderId)?.name ?? "Без папки";
  };

  const getOtherUser = (conversation: Conversation) => {
    return conversation.user1Id === user?.id
      ? conversation.user2Username
      : conversation.user1Username;
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
            <Link to="/friends" className="btn ghost" style={{ textDecoration: "none", textAlign: "center" }}>
              Друзья
            </Link>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="section-header">
            <h3>Чаты</h3>
            <span className="badge">{conversations.length}</span>
          </div>

          <ul className="folder-list">
            {conversations.map((conversation) => (
              <li
                key={conversation.id}
                className={selectedConversationId === conversation.id ? "active" : ""}
                onClick={() => handleSelectConversation(conversation.id)}
              >
                <div>
                  <span>{getOtherUser(conversation)}</span>
                  {conversation.lastMessageContent && (
                    <p className="note-meta" style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
                      {conversation.lastMessageContent.length > 30
                        ? conversation.lastMessageContent.substring(0, 30) + "..."
                        : conversation.lastMessageContent}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="sidebar-section" style={{ marginTop: "1.5rem" }}>
            <div className="section-header">
              <h3>Друзья</h3>
            </div>
            <ul className="folder-list">
              {friends.map((friend) => (
                <li
                  key={friend.id}
                  onClick={() => handleStartConversation(friend.id)}
                  style={{ cursor: "pointer" }}
                >
                  <span>{friend.username}</span>
                </li>
              ))}
              {friends.length === 0 && (
                <p className="empty-state" style={{ padding: "1rem", fontSize: "0.9rem" }}>
                  Нет друзей. Добавьте друзей на странице "Друзья"
                </p>
              )}
            </ul>
          </div>
        </div>
      </aside>

      <div style={{ display: "grid", gridTemplateColumns: selectedNote ? "1fr 400px" : "1fr", height: "100vh" }}>
        <section className="editor-panel" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
          {selectedConversation ? (
          <>
            <header className="panel-header">
              <h2>{getOtherUser(selectedConversation)}</h2>
              <button
                className="btn secondary"
                onClick={() => setShowShareNotes(!showShareNotes)}
              >
                {showShareNotes ? "Скрыть" : "Поделиться файлами"}
              </button>
            </header>

            {showShareNotes && (
              <div style={{ padding: "1rem", borderBottom: "1px solid #e5e7eb", maxHeight: "300px", overflowY: "auto" }}>
                <h3 style={{ marginBottom: "1rem", fontSize: "1rem" }}>Выберите заметку для отправки:</h3>
                {folders.map((folder) => {
                  const folderNotes = notes.filter((n) => n.folderId === folder.id);
                  if (folderNotes.length === 0) return null;
                  return (
                    <div key={folder.id} style={{ marginBottom: "1rem" }}>
                      <h4 style={{ marginBottom: "0.5rem", fontSize: "0.9rem", color: "#4c3df7", fontWeight: 600 }}>
                        📁 {folder.name}
                      </h4>
                      <ul className="notes-list">
                        {folderNotes.map((note) => (
                          <li
                            key={note.id}
                            onClick={() => handleShareNote(note.id)}
                            style={{ cursor: "pointer" }}
                          >
                            <div>
                              <p className="note-title">{note.title || "Без названия"}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                {notes.filter((n) => !n.folderId).length > 0 && (
                  <div style={{ marginBottom: "1rem" }}>
                    <h4 style={{ marginBottom: "0.5rem", fontSize: "0.9rem", color: "#4c3df7", fontWeight: 600 }}>
                      📁 Без папки
                    </h4>
                    <ul className="notes-list">
                      {notes
                        .filter((n) => !n.folderId)
                        .map((note) => (
                          <li
                            key={note.id}
                            onClick={() => handleShareNote(note.id)}
                            style={{ cursor: "pointer" }}
                          >
                            <div>
                              <p className="note-title">{note.title || "Без названия"}</p>
                            </div>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
                {notes.length === 0 && (
                  <p className="empty-state">Нет заметок для отправки</p>
                )}
              </div>
            )}

            <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
              {messages.map((message) => (
                <div
                  key={message.id}
                  style={{
                    marginBottom: "1rem",
                    display: "flex",
                    flexDirection: message.userId === user?.id ? "row-reverse" : "row",
                    gap: "0.5rem"
                  }}
                >
                  <div
                    style={{
                      maxWidth: "70%",
                      padding: "0.75rem 1rem",
                      borderRadius: "12px",
                      background: message.userId === user?.id ? "#4c3df7" : "#e5e7eb",
                      color: message.userId === user?.id ? "#fff" : "#101828"
                    }}
                  >
                    <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.8, marginBottom: "0.25rem" }}>
                      {message.username}
                    </p>
                    <p style={{ margin: 0 }}>{message.content}</p>
                    {message.noteId && (
                      <div
                        onClick={async () => {
                          if (!token || !message.noteId) return;
                          setLoadingNote(true);
                          try {
                            const note = await api.getNote(token, message.noteId);
                            setSelectedNote(note);
                          } catch (error) {
                            showStatus(
                              error instanceof Error ? error.message : "Ошибка загрузки заметки",
                              6000
                            );
                          } finally {
                            setLoadingNote(false);
                          }
                        }}
                        style={{
                          margin: "0.5rem 0 0 0",
                          fontSize: "0.85rem",
                          opacity: 0.9,
                          cursor: "pointer",
                          padding: "0.5rem",
                          borderRadius: "6px",
                          background: message.userId === user?.id ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.05)",
                          transition: "background 0.2s",
                          display: "inline-block"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = message.userId === user?.id ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.1)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = message.userId === user?.id ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.05)";
                        }}
                      >
                        📎 Заметка #{message.noteId} {loadingNote ? "(загрузка...)" : "(кликните, чтобы открыть)"}
                      </div>
                    )}
                    <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.75rem", opacity: 0.7 }}>
                      {new Date(message.sentAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: "1rem", borderTop: "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                  placeholder="Введите сообщение..."
                  style={{ flex: 1, padding: "0.75rem", borderRadius: "8px", border: "1px solid #e5e7eb" }}
                />
                <button
                  className="btn primary"
                  onClick={handleSendMessage}
                  disabled={sending || !messageInput.trim()}
                >
                  Отправить
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state large">
            <p>Выберите чат или начните новый с другом</p>
          </div>
        )}
        </section>

        {selectedNote && (
          <section style={{ background: "#fff", borderLeft: "1px solid #e5e7eb", display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
            <header className="panel-header" style={{ padding: "1rem", borderBottom: "1px solid #e5e7eb" }}>
              <h2 style={{ margin: 0 }}>{selectedNote.title || "Без названия"}</h2>
              <button
                className="btn ghost"
                onClick={() => setSelectedNote(null)}
                style={{ fontSize: "1.5rem", padding: "0.25rem 0.5rem" }}
              >
                ×
              </button>
            </header>
            <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
              <div className="preview">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedNote.content}</ReactMarkdown>
              </div>
            </div>
          </section>
        )}
      </div>

      {status && (
        <div className="toast">
          <span>{status}</span>
        </div>
      )}
    </div>
  );
}

