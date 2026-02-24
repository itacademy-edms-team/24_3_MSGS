import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as SignalR from "@microsoft/signalr";
import { useAuth } from "../auth/AuthContext";
import { api, HUB_BASE_URL } from "../services/api";
import type { Conversation, Message, Note, Folder, User } from "../types";

/** Нормализует сообщение с бэкенда (PascalCase или camelCase) в тип Message */
function normalizeMessage(msg: Record<string, unknown>): Message {
  return {
    id: (msg.id ?? msg.Id) as number,
    content: (msg.content ?? msg.Content) as string,
    sentAt: (msg.sentAt ?? msg.SentAt) as string,
    userId: (msg.userId ?? msg.UserId) as number,
    username: (msg.username ?? msg.Username) as string,
    conversationId: (msg.conversationId ?? msg.ConversationId) as number | null | undefined,
    noteId: (msg.noteId ?? msg.NoteId) as number | null | undefined,
    selectionStart: (msg.selectionStart ?? msg.SelectionStart) as number | null | undefined,
    selectionEnd: (msg.selectionEnd ?? msg.SelectionEnd) as number | null | undefined
  };
}

type ChatNotification = {
  id: string;
  conversationId: number;
  username: string;
  content: string;
  sentAt: string;
  noteId?: number;
};

export default function ChatPage() {
  const { user, token } = useAuth();
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
  const [comments, setComments] = useState<Message[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [selectedText, setSelectedText] = useState<{ start: number; end: number } | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
  const [hubConnected, setHubConnected] = useState(false);
  const [hubError, setHubError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<ChatNotification[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<number | undefined>(user?.id);
  userRef.current = user?.id;
  const connectionRef = useRef<SignalR.HubConnection | null>(null);
  const selectedConvRef = useRef<number | null>(null);
  const prevConversationIdRef = useRef<number | null>(null);
  const loadConversationsRef = useRef<( () => Promise<void>) | null>(null);
  const joinedConversationIdsRef = useRef<Set<number>>(new Set());
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token ?? null;
  selectedConvRef.current = selectedConversationId;

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);
  const totalUnread = conversations.reduce((s, c) => s + (c.unreadCount ?? 0), 0);

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
  loadConversationsRef.current = loadConversations;

  const loadFriends = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getFriends(token);
      setFriends(data);
    } catch (error) {
      // Игнорируем ошибки загрузки друзей
    }
  }, [token]);

  const loadMessages = useCallback(async (conversationId: number): Promise<Message[] | void> => {
    if (!token) return;
    try {
      const data = await api.getConversationMessages(token, conversationId);
      setMessages(data);
      return data;
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

  // Подключение SignalR для обновления чата в реальном времени
  useEffect(() => {
    if (!token) return;
    setHubError(null);
    const url = `${HUB_BASE_URL}/hubs/chat`;
    console.log("[SignalR] Подключение к:", url);
    const connection = new SignalR.HubConnectionBuilder()
      .withUrl(url, { accessTokenFactory: () => token })
      .withAutomaticReconnect()
      .build();

    connection.on("ReceiveMessage", (msg: Record<string, unknown>) => {
      const normalized = normalizeMessage(msg);
      const currentConvId = selectedConvRef.current;
      const isCurrentChat = normalized.conversationId === currentConvId;
      const isFromOther = normalized.userId !== userRef.current;

      if (isCurrentChat) {
        setMessages((prev) =>
          prev.some((m) => m.id === normalized.id) ? prev : [...prev, normalized]
        );
        if (normalized.conversationId != null && tokenRef.current) {
          api.markConversationRead(tokenRef.current, normalized.conversationId, normalized.id).then(
            () => loadConversationsRef.current?.()
          );
        }
      } else if (isFromOther && normalized.conversationId != null) {
        const notif: ChatNotification = {
          id: `msg-${normalized.id}-${Date.now()}`,
          conversationId: normalized.conversationId,
          username: normalized.username,
          content: normalized.noteId ? "Поделился заметкой" : normalized.content,
          sentAt: normalized.sentAt,
          noteId: normalized.noteId ?? undefined
        };
        setNotifications((prev) => [...prev.slice(-4), notif]);
        setTimeout(() => {
          setNotifications((n) => n.filter((x) => x.id !== notif.id));
        }, 5000);
      }
      loadConversationsRef.current?.();
    });

    const updateConnected = () => {
      setHubConnected(connection.state === SignalR.HubConnectionState.Connected);
      if (connection.state === SignalR.HubConnectionState.Disconnected) {
        setHubError(null); // очищаем при разрыве, чтобы не путать с первой ошибкой
      }
    };
    connection.onclose(updateConnected);
    connection.onreconnecting(updateConnected);
    connection.onreconnected(updateConnected);

    // После переподключения снова вступаем во все чаты
    connection.onreconnected(() => {
      const ids = Array.from(joinedConversationIdsRef.current);
      ids.forEach((id) => connection.invoke("JoinConversation", id).catch(() => {}));
    });

    connection
      .start()
      .then(() => {
        setHubConnected(true);
        setHubError(null);
        // Подписку на все чаты делаем в отдельном эффекте после загрузки списка
      })
      .catch((err) => {
        const message = err?.message ?? String(err);
        setHubError(message);
        console.error("[SignalR] Ошибка подключения:", message, "\nURL:", url, "\nПолная ошибка:", err);
      });

    connectionRef.current = connection;
    prevConversationIdRef.current = selectedConversationId;

    return () => {
      connection.off("ReceiveMessage");
      connection.onclose(() => {});
      connection.onreconnecting(() => {});
      connection.onreconnected(() => {});
      setHubConnected(false);
      setHubError(null);
      joinedConversationIdsRef.current = new Set();
      connection.stop().catch(() => {});
      connectionRef.current = null;
      prevConversationIdRef.current = null;
    };
  }, [token]);

  // Подписываемся на все чаты пользователя, чтобы получать сообщения и показывать пуш
  useEffect(() => {
    const conn = connectionRef.current;
    if (!conn || !hubConnected || conversations.length === 0) return;
    conversations.forEach((c) => {
      if (joinedConversationIdsRef.current.has(c.id)) return;
      joinedConversationIdsRef.current = new Set([...joinedConversationIdsRef.current, c.id]);
      conn.invoke("JoinConversation", c.id).catch(() => {});
    });
  }, [hubConnected, conversations]);

  // При смене выбранного чата только обновляем ref (все группы уже подключены)
  useEffect(() => {
    prevConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadConversations(), loadFriends()])
      .finally(() => setLoading(false));
  }, [loadConversations, loadFriends]);

  useEffect(() => {
    if (!selectedConversationId || !token) {
      if (!selectedConversationId) setMessages([]);
      return;
    }
    // Тот же механизм, что при отправке: берём актуальные данные с сервера, затем отмечаем прочитанным и обновляем список.
    const markReadAndRefresh = (lastMessageId: number) => {
      api
        .markConversationRead(token!, selectedConversationId!, lastMessageId)
        .then(() => loadConversationsRef.current?.());
    };
    api
      .getConversation(token, selectedConversationId)
      .then((conv) => {
        const lastMessageId = conv?.lastMessageId ?? 0;
        markReadAndRefresh(lastMessageId);
      })
      .catch(() => markReadAndRefresh(0));
    loadMessages(selectedConversationId);
  }, [selectedConversationId, token]);

  useEffect(() => {
    if (showShareNotes) {
      Promise.all([loadNotes(), loadFolders()]);
    }
  }, [showShareNotes, loadNotes, loadFolders]);

  const handleSelectConversation = (conversationId: number) => {
    setSelectedConversationId(conversationId);
    setShowShareNotes(false);
  };

  const dismissNotification = (id: string, conversationId?: number) => {
    setNotifications((n) => n.filter((x) => x.id !== id));
    if (conversationId != null) setSelectedConversationId(conversationId);
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
      setMessages((prev) =>
        prev.some((m) => m.id === message.id) ? prev : [...prev, message]
      );
      setMessageInput("");
      // Тот же механизм, что при открытии чата: отмечаем прочитанным до последнего сообщения и обновляем список
      api
        .markConversationRead(token, selectedConversationId, message.id)
        .then(() => loadConversationsRef.current?.())
        .catch(() => loadConversations());
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

  const loadComments = useCallback(async (noteId: number) => {
    if (!token) return;
    try {
      const data = await api.getNoteComments(token, noteId);
      setComments(data);
    } catch (error) {
      // Игнорируем ошибки загрузки комментариев
    }
  }, [token]);

  useEffect(() => {
    if (selectedNote) {
      loadComments(selectedNote.id);
      setSelectedText(null);
      setCommentInput("");
      setExpandedComments(new Set());
    } else {
      setComments([]);
    }
  }, [selectedNote, loadComments]);

  const handleAddComment = async () => {
    if (!token || !selectedNote || !commentInput.trim()) return;
    
    try {
      await api.sendMessage(token, {
        content: commentInput.trim(),
        noteId: selectedNote.id,
        selectionStart: selectedText?.start ?? null,
        selectionEnd: selectedText?.end ?? null
      });
      setCommentInput("");
      setSelectedText(null);
      showStatus("Комментарий добавлен");
      loadComments(selectedNote.id);
    } catch (error) {
      showStatus(
        error instanceof Error ? error.message : "Ошибка добавления комментария",
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
    <div className="dashboard chat-dashboard">
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
            {totalUnread > 0 && (
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#4c3df7",
                  flexShrink: 0
                }}
                title={`${totalUnread} непрочитанных`}
              />
            )}
            <span className="badge">{conversations.length}</span>
          </div>

          <ul className="folder-list">
            {conversations.map((conversation) => (
              <li
                key={conversation.id}
                className={selectedConversationId === conversation.id ? "active" : ""}
                onClick={() => handleSelectConversation(conversation.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%" }}>
                  <span style={{ flex: 1, minWidth: 0 }}>{getOtherUser(conversation)}</span>
                  {(conversation.unreadCount ?? 0) > 0 && (
                    <span className="badge" style={{ flexShrink: 0 }}>
                      {conversation.unreadCount! > 99 ? "99+" : conversation.unreadCount}
                    </span>
                  )}
                </div>
                {conversation.lastMessageContent && (
                  <p className="note-meta" style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
                    {conversation.lastMessageContent.length > 30
                      ? conversation.lastMessageContent.substring(0, 30) + "..."
                      : conversation.lastMessageContent}
                  </p>
                )}
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

      <div style={{ 
        display: "grid", 
        gridTemplateColumns: selectedNote ? "minmax(350px, 500px) 1fr" : "1fr", 
        height: "100vh", 
        gap: "0",
        width: "100%",
        overflow: "hidden"
      }}>
      <section className="editor-panel" style={{ 
        display: "flex", 
        flexDirection: "column", 
        height: "100vh",
        overflow: "hidden"
      }}>
        {selectedConversation ? (
          <>
            <header className="panel-header" style={{ flexWrap: "nowrap", minWidth: 0 }}>
              <h2 style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {getOtherUser(selectedConversation)}
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
                <span
                  data-chat-hub-status
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    padding: "0.25rem 0.5rem",
                    borderRadius: "6px",
                    background: hubConnected ? "rgba(5, 150, 105, 0.15)" : "rgba(107, 114, 128, 0.15)",
                    color: hubConnected ? "#059669" : "#6b7280"
                  }}
                  title={
                    hubError
                      ? `Ошибка: ${hubError}. Откройте консоль (F12) для подробностей.`
                      : hubConnected
                        ? "Сообщения приходят в реальном времени"
                        : "Подключение к серверу чата..."
                  }
                >
                  {hubConnected ? "● Подключено" : "○ Нет подключения"}
                </span>
                {hubError && (
                  <span style={{ fontSize: "0.7rem", color: "#b91c1c", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }} title={hubError}>
                    {hubError}
                  </span>
                )}
                <button
                className="btn secondary"
                onClick={() => setShowShareNotes(!showShareNotes)}
                >
                  {showShareNotes ? "Скрыть" : "Поделиться файлами"}
                </button>
              </div>
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
              {messages.map((message) => {
                const handleNoteClick = async () => {
                  if (!token || !message.noteId) {
                    console.log("Нет token или noteId", { token: !!token, noteId: message.noteId });
                    return;
                  }
                  console.log("=== КЛИК ПО ЗАМЕТКЕ ===", message.noteId, message);
                  setLoadingNote(true);
                  try {
                    const note = await api.getNote(token, message.noteId);
                    console.log("Заметка загружена", note);
                    console.log("Устанавливаем selectedNote:", note);
                    setSelectedNote(note);
                    console.log("selectedNote установлен");
                  } catch (error) {
                    console.error("Ошибка загрузки заметки", error);
                    showStatus(
                      error instanceof Error ? error.message : "Ошибка загрузки заметки",
                      6000
                    );
                  } finally {
                    setLoadingNote(false);
                  }
                };

                return (
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
                      onClick={message.noteId ? (e) => {
                        e.stopPropagation();
                        handleNoteClick();
                      } : undefined}
                      style={{
                        maxWidth: "70%",
                        padding: "0.75rem 1rem",
                        borderRadius: "12px",
                        background: message.userId === user?.id ? "#4c3df7" : "#e5e7eb",
                        color: message.userId === user?.id ? "#fff" : "#101828",
                        cursor: message.noteId ? "pointer" : "default",
                        transition: message.noteId ? "all 0.2s" : "none",
                        position: "relative"
                      }}
                      onMouseEnter={message.noteId ? (e) => {
                        e.currentTarget.style.opacity = "0.9";
                        e.currentTarget.style.transform = "scale(1.02)";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
                        e.currentTarget.style.border = message.userId === user?.id ? "2px solid rgba(255,255,255,0.5)" : "2px solid rgba(76, 61, 247, 0.5)";
                      } : undefined}
                      onMouseLeave={message.noteId ? (e) => {
                        e.currentTarget.style.opacity = "1";
                        e.currentTarget.style.transform = "scale(1)";
                        e.currentTarget.style.boxShadow = "none";
                        e.currentTarget.style.border = "none";
                      } : undefined}
                    >
                      <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.8, marginBottom: "0.25rem" }}>
                        {message.username}
                      </p>
                      <p style={{ margin: 0 }}>{message.content}</p>
                      {message.noteId && (
                        <div
                          style={{
                            margin: "0.5rem 0 0 0",
                            fontSize: "0.85rem",
                            padding: "0.5rem",
                            borderRadius: "6px",
                            background: message.userId === user?.id ? "rgba(255,255,255,0.2)" : "rgba(76, 61, 247, 0.15)",
                            border: message.userId === user?.id ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(76, 61, 247, 0.3)",
                            display: "inline-block"
                          }}
                        >
                          <strong>📎 Заметка #{message.noteId}</strong>
                          {loadingNote ? (
                            <span style={{ marginLeft: "0.5rem" }}>(загрузка...)</span>
                          ) : (
                            <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem" }}>— кликните, чтобы открыть</span>
                          )}
                        </div>
                      )}
                      <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.75rem", opacity: 0.7 }}>
                        {new Date(message.sentAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                );
              })}
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
          <section style={{ 
            background: "#fff", 
            borderLeft: "1px solid #e5e7eb", 
            display: "flex", 
            flexDirection: "column", 
            height: "100vh", 
            overflow: "hidden",
            minWidth: 0,
            width: "100%"
          }}>
            <header className="panel-header" style={{ padding: "1rem", borderBottom: "1px solid #e5e7eb" }}>
              <h2 style={{ margin: 0 }}>{selectedNote.title || "Без названия"}</h2>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <button
                  className="btn secondary"
                  onClick={() => setShowComments(!showComments)}
                  style={{ fontSize: "0.9rem" }}
                >
                  {showComments ? "Скрыть" : "Показать"} комментарии ({comments.length})
                </button>
                <button
                  className="btn ghost"
                  onClick={() => {
                    setSelectedNote(null);
                    setSelectedText(null);
                    setCommentInput("");
                  }}
                  style={{ fontSize: "1.5rem", padding: "0.25rem 0.5rem" }}
                >
                  ×
                </button>
              </div>
            </header>
            <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem", position: "relative", maxWidth: "100%" }}>
              <div 
                className="preview"
                style={{ maxWidth: "100%", wordWrap: "break-word" }}
                onMouseUp={(e) => {
                  const selection = window.getSelection();
                  if (selection && selection.toString().trim()) {
                    const range = selection.getRangeAt(0);
                    const previewElement = e.currentTarget;
                    const textContent = previewElement.textContent || "";
                    
                    // Находим позиции в исходном тексте заметки
                    const walker = document.createTreeWalker(
                      previewElement,
                      NodeFilter.SHOW_TEXT,
                      null
                    );
                    
                    let charCount = 0;
                    let start = -1;
                    let end = -1;
                    
                    const rangeStartContainer = range.startContainer;
                    const rangeEndContainer = range.endContainer;
                    const rangeStartOffset = range.startOffset;
                    const rangeEndOffset = range.endOffset;
                    
                    let node;
                    while (node = walker.nextNode()) {
                      const nodeLength = node.textContent?.length || 0;
                      
                      if (node === rangeStartContainer && start === -1) {
                        start = charCount + rangeStartOffset;
                      }
                      if (node === rangeEndContainer && end === -1) {
                        end = charCount + rangeEndOffset;
                        break;
                      }
                      
                      charCount += nodeLength;
                    }
                    
                    if (start !== -1 && end !== -1 && start !== end) {
                      // Находим соответствующие позиции в исходном Markdown
                      const markdownText = selectedNote.content;
                      setSelectedText({ start, end });
                    } else {
                      setSelectedText(null);
                    }
                  } else {
                    setSelectedText(null);
                  }
                }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedNote.content}</ReactMarkdown>
              </div>
              
              <div style={{ 
                position: "sticky", 
                bottom: 0, 
                padding: "0.75rem", 
                background: selectedText ? "#eef2ff" : "#fff", 
                borderTop: "1px solid #e5e7eb",
                marginTop: "1rem"
              }}>
                {selectedText && (
                  <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.85rem", fontWeight: 600 }}>
                    Выделен текст: "{selectedNote.content.substring(selectedText.start, selectedText.end).substring(0, 50)}..."
                  </p>
                )}
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    type="text"
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    placeholder={selectedText ? "Добавить комментарий к выделенному тексту..." : "Добавить комментарий к заметке..."}
                    style={{ flex: 1, padding: "0.5rem", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                    onKeyPress={(e) => {
                      if (e.key === "Enter" && commentInput.trim()) {
                        handleAddComment();
                      }
                    }}
                  />
                  <button
                    className="btn primary"
                    onClick={handleAddComment}
                    disabled={!commentInput.trim() || !token}
                  >
                    Отправить
                  </button>
                  {selectedText && (
                    <button
                      className="btn ghost"
                      onClick={() => {
                        setSelectedText(null);
                        setCommentInput("");
                      }}
                    >
                      Отмена
                    </button>
                  )}
                </div>
              </div>
              
              {showComments && comments.length > 0 && (
                <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "2px solid #e5e7eb" }}>
                  <h3 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>Комментарии ({comments.length})</h3>
                  {comments.map((comment) => {
                    const isExpanded = expandedComments.has(comment.id);
                    const hasSelection = comment.selectionStart != null && comment.selectionEnd != null;
                    const selectedText = hasSelection
                      ? selectedNote.content.substring(comment.selectionStart!, comment.selectionEnd!)
                      : null;

                    return (
                      <div
                        key={comment.id}
                        style={{
                          marginBottom: "1rem",
                          padding: "0.75rem",
                          background: "#f9fafb",
                          borderRadius: "8px",
                          border: "1px solid #e5e7eb"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "0.5rem" }}>
                          <div>
                            <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600 }}>{comment.username}</p>
                            <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.75rem", color: "#6b7280" }}>
                              {new Date(comment.sentAt).toLocaleString()}
                            </p>
                          </div>
                          {hasSelection && (
                            <button
                              className="btn ghost"
                              onClick={() => {
                                const newExpanded = new Set(expandedComments);
                                if (isExpanded) {
                                  newExpanded.delete(comment.id);
                                } else {
                                  newExpanded.add(comment.id);
                                }
                                setExpandedComments(newExpanded);
                              }}
                              style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                            >
                              {isExpanded ? "Свернуть" : "Развернуть"}
                            </button>
                          )}
                        </div>
                        {hasSelection && isExpanded && selectedText && (
                          <div style={{ marginBottom: "0.5rem", padding: "0.5rem", background: "#fff", borderRadius: "4px", border: "1px solid #e5e7eb" }}>
                            <p style={{ margin: 0, fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                              Комментарий к тексту:
                            </p>
                            <p style={{ margin: 0, fontStyle: "italic", color: "#4c3df7" }}>"{selectedText}"</p>
                          </div>
                        )}
                        <p style={{ margin: 0 }}>{comment.content}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {status && (
        <div className="toast">
          <span>{status}</span>
        </div>
      )}

      {/* Пуш-уведомления о новых сообщениях — левый нижний угол */}
      <div
        className="chat-notifications"
        style={{
          position: "fixed",
          bottom: "1rem",
          left: "1rem",
          zIndex: 10000,
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          maxWidth: "320px"
        }}
      >
        {notifications.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => dismissNotification(n.id, n.conversationId)}
            style={{
              display: "block",
              textAlign: "left",
              width: "100%",
              padding: "0.75rem 1rem",
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
              cursor: "pointer",
              transition: "transform 0.15s ease, box-shadow 0.15s ease"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateX(4px)";
              e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateX(0)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.12)";
            }}
          >
            <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#4c3df7", marginBottom: "0.25rem" }}>
              {n.username}
            </div>
            <div style={{ fontSize: "0.85rem", color: "#374151", lineHeight: 1.3 }}>
              {n.content.length > 60 ? `${n.content.slice(0, 60)}…` : n.content}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.25rem" }}>
              {new Date(n.sentAt).toLocaleTimeString()}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

