import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import AppSidebarNav from "../components/AppSidebarNav";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "../auth/AuthContext";
import { useChatHub } from "../chat/ChatHubContext";
import { api } from "../services/api";
import type { Conversation, Message, Note, Folder, User } from "../types";
import { applyNoteCommentHighlights } from "../utils/noteCommentHighlights";

/** Экраны уже ~1145px ломают сетку чата — переключаемся на полноэкранные панели */
const CHAT_NARROW_MAX_PX = 1144;

type ChatMobilePane = "list" | "thread" | "note";

export default function ChatPage() {
  const { user, token } = useAuth();
  const {
    hubConnected,
    hubError,
    setActiveConversationId,
    setIncomingMessageHandler,
    setRefreshConversationsHandler,
    syncConversationGroups,
    pendingOpenConversationId,
    clearPendingOpenConversation
  } = useChatHub();
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
  const [expandedInlineCommentIds, setExpandedInlineCommentIds] = useState<Set<number>>(
    () => new Set()
  );
  const [isNarrowChat, setIsNarrowChat] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(`(max-width: ${CHAT_NARROW_MAX_PX}px)`).matches
  );
  const [chatMobilePane, setChatMobilePane] = useState<ChatMobilePane>("list");
  const isNarrowChatRef = useRef(false);
  isNarrowChatRef.current = isNarrowChat;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<number | undefined>(user?.id);
  userRef.current = user?.id;
  const notePreviewRef = useRef<HTMLDivElement | null>(null);

  /** Прокрутить заметку к месту выделенного текста (для комментария) и подсветить */
  const scrollToSelectionInNote = useCallback(
    (selectionStart: number, selectionEnd: number) => {
      const container = notePreviewRef.current;
      const content = selectedNote?.content;
      if (!container || !content) return;
      const targetText = content.substring(selectionStart, selectionEnd);
      if (!targetText.trim()) return;
      const fullText = container.textContent || "";
      let pos = fullText.indexOf(targetText);
      if (pos === -1) {
        const norm = (s: string) => s.replace(/\s+/g, " ").trim();
        const normFull = norm(fullText);
        const normTarget = norm(targetText);
        const posNorm = normFull.indexOf(normTarget);
        if (posNorm === -1) return;
        let normIdx = 0;
        for (let i = 0; i < fullText.length; i++) {
          if (normIdx === posNorm) {
            pos = i;
            break;
          }
          const c = fullText.charAt(i);
          if (/\s/.test(c)) {
            if (normIdx > 0 && normFull.charAt(normIdx - 1) !== " ") normIdx++;
          } else {
            normIdx++;
          }
        }
      }
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
      let charCount = 0;
      let targetNode: Node | null = null;
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const len = node.textContent?.length || 0;
        if (charCount + len > pos) {
          targetNode = node;
          break;
        }
        charCount += len;
      }
      if (targetNode?.parentElement) {
        const el = targetNode.parentElement;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("comment-highlight");
        setTimeout(() => el.classList.remove("comment-highlight"), 2000);
      }
    },
    [selectedNote?.content]
  );

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);
  const totalUnread = conversations.reduce((s, c) => s + (c.unreadCount ?? 0), 0);

  /** Прокрутка после отрисовки списка (важно при открытии чата с другой вкладки: overflow-контейнер уже в DOM) */
  useLayoutEffect(() => {
    if (!selectedConversationId || messages.length === 0) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      const wrap = messagesScrollRef.current;
      if (wrap) {
        wrap.scrollTop = wrap.scrollHeight;
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }
    };
    run();
    const id1 = requestAnimationFrame(() => {
      if (cancelled) return;
      run();
      requestAnimationFrame(() => {
        if (!cancelled) run();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id1);
    };
  }, [messages, selectedConversationId]);

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

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${CHAT_NARROW_MAX_PX}px)`);
    const apply = () => setIsNarrowChat(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!isNarrowChat) setChatMobilePane("list");
  }, [isNarrowChat]);

  useEffect(() => {
    setRefreshConversationsHandler(loadConversations);
    return () => setRefreshConversationsHandler(null);
  }, [loadConversations, setRefreshConversationsHandler]);

  useEffect(() => {
    setIncomingMessageHandler((msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    });
    return () => setIncomingMessageHandler(null);
  }, [setIncomingMessageHandler]);

  useEffect(() => {
    setActiveConversationId(selectedConversationId);
    return () => setActiveConversationId(null);
  }, [selectedConversationId, setActiveConversationId]);

  useEffect(() => {
    syncConversationGroups(conversations.map((c) => c.id));
  }, [conversations, syncConversationGroups]);

  useEffect(() => {
    if (pendingOpenConversationId == null) return;
    const id = pendingOpenConversationId;
    clearPendingOpenConversation();
    setSelectedConversationId(id);
    if (isNarrowChatRef.current) setChatMobilePane("thread");
  }, [pendingOpenConversationId, clearPendingOpenConversation]);

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
        .then(() => loadConversations());
    };
    api
      .getConversation(token, selectedConversationId)
      .then((conv) => {
        const lastMessageId = conv?.lastMessageId ?? 0;
        markReadAndRefresh(lastMessageId);
      })
      .catch(() => markReadAndRefresh(0));
    loadMessages(selectedConversationId);
  }, [selectedConversationId, token, loadConversations, loadMessages]);

  useEffect(() => {
    if (showShareNotes) {
      Promise.all([loadNotes(), loadFolders()]);
    }
  }, [showShareNotes, loadNotes, loadFolders]);

  const handleSelectConversation = (conversationId: number) => {
    setSelectedConversationId(conversationId);
    setShowShareNotes(false);
    if (isNarrowChat) setChatMobilePane("thread");
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
      if (isNarrowChatRef.current) setChatMobilePane("thread");
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
        .then(() => loadConversations())
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

  const closeNotePanel = useCallback(() => {
    setSelectedNote(null);
    setSelectedText(null);
    setCommentInput("");
    if (isNarrowChatRef.current) setChatMobilePane("thread");
  }, []);

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
      setExpandedInlineCommentIds(new Set());
    } else {
      setComments([]);
    }
  }, [selectedNote, loadComments]);

  useLayoutEffect(() => {
    const el = notePreviewRef.current;
    const note = selectedNote;
    if (!el || !note?.content) return;
    applyNoteCommentHighlights(el, note.content, comments, expandedInlineCommentIds);
  }, [selectedNote?.id, selectedNote?.content, comments, expandedInlineCommentIds]);

  useEffect(() => {
    const root = notePreviewRef.current;
    if (!root || !selectedNote) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const pin = t.closest?.(".note-comment-pin");
      if (!pin || !root.contains(pin)) return;
      e.preventDefault();
      e.stopPropagation();
      const wrap = pin.closest("[data-comment-id]");
      const raw = wrap?.getAttribute("data-comment-id");
      const id = raw ? parseInt(raw, 10) : NaN;
      if (Number.isNaN(id)) return;
      setExpandedInlineCommentIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [selectedNote?.id]);

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

  const sidebarHidden = isNarrowChat && chatMobilePane !== "list";
  const mainGridHidden = isNarrowChat && chatMobilePane === "list";
  const threadPanelHidden = isNarrowChat && chatMobilePane === "note";
  const gridTemplateColumns = isNarrowChat
    ? "1fr"
    : selectedNote
      ? "minmax(350px, 500px) 1fr"
      : "1fr";

  return (
    <div className="dashboard chat-dashboard">
      <aside className={`sidebar chat-sidebar${sidebarHidden ? " chat-mobile-hidden" : ""}`}>
        <AppSidebarNav />

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

      <div
        className={`chat-content-grid${mainGridHidden ? " chat-mobile-hidden" : ""}`}
        style={{
          display: "grid",
          gridTemplateColumns,
          height: "100vh",
          maxHeight: "100dvh",
          gap: "0",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          overflow: "hidden",
          boxSizing: "border-box"
        }}
      >
      <section
        className={`editor-panel chat-thread-panel${threadPanelHidden ? " chat-mobile-hidden" : ""}`}
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          maxHeight: "100dvh",
          overflow: "hidden",
          minWidth: 0,
          boxSizing: "border-box"
        }}
      >
        {selectedConversation ? (
          <>
            <header
              className="panel-header chat-thread-header"
              style={{ flexWrap: isNarrowChat ? "wrap" : "nowrap", minWidth: 0, alignItems: "center" }}
            >
              {isNarrowChat && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setChatMobilePane("list")}
                  style={{ flexShrink: 0 }}
                >
                  ← Чаты
                </button>
              )}
              <h2 style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {getOtherUser(selectedConversation)}
              </h2>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  flexShrink: 0,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                  marginLeft: isNarrowChat ? 0 : undefined
                }}
              >
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
                  type="button"
                  className="btn secondary"
                  onClick={() => setShowShareNotes(!showShareNotes)}
                >
                  {showShareNotes ? "Скрыть" : isNarrowChat ? "Файлы" : "Поделиться файлами"}
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

            <div ref={messagesScrollRef} style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
              {messages.map((message) => {
                const handleNoteClick = async () => {
                  if (!token || !message.noteId) return;
                  setLoadingNote(true);
                  try {
                    const note = await api.getNote(token, message.noteId);
                    setSelectedNote(note);
                    if (isNarrowChatRef.current) setChatMobilePane("note");
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
                        maxWidth: isNarrowChat ? "min(92%, 100%)" : "70%",
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
          <section
            className={`chat-note-panel${isNarrowChat && chatMobilePane !== "note" ? " chat-mobile-hidden" : ""}`}
            style={{
              background: "#fff",
              borderLeft: isNarrowChat ? "none" : "1px solid #e5e7eb",
              display: "flex",
              flexDirection: "column",
              height: "100vh",
              maxHeight: "100dvh",
              overflow: "hidden",
              minWidth: 0,
              width: "100%",
              boxSizing: "border-box"
            }}
          >
            <header
              className="panel-header chat-thread-header"
              style={{
                padding: "1rem",
                borderBottom: "1px solid #e5e7eb",
                flexWrap: "wrap",
                gap: "0.5rem",
                alignItems: "center"
              }}
            >
              {isNarrowChat && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={closeNotePanel}
                  style={{ flexShrink: 0 }}
                >
                  ← К чату
                </button>
              )}
              <h2 style={{ margin: 0, flex: 1, minWidth: "120px", overflow: "hidden", textOverflow: "ellipsis" }}>
                {selectedNote.title || "Без названия"}
              </h2>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setShowComments(!showComments)}
                  style={{ fontSize: "0.9rem" }}
                >
                  {showComments ? "Скрыть" : "Показать"} ({comments.length})
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={closeNotePanel}
                  style={{ fontSize: "1.5rem", padding: "0.25rem 0.5rem" }}
                  aria-label="Закрыть заметку"
                >
                  ×
                </button>
              </div>
            </header>
            <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem", position: "relative", maxWidth: "100%" }}>
              <div 
                ref={notePreviewRef}
                className="preview"
                style={{ maxWidth: "100%", wordWrap: "break-word" }}
                onMouseUp={(e) => {
                  const selection = window.getSelection();
                  const selectedString = selection?.toString().trim();
                  if (!selection || !selectedString) {
                    setSelectedText(null);
                    return;
                  }
                  // Позиции из TreeWalker относятся к отрендеренному textContent, а не к markdown.
                  // Ищем выделенный текст в исходном markdown — так координаты совпадают с контентом заметки.
                  const markdownText = selectedNote.content;
                  const idx = markdownText.indexOf(selectedString);
                  if (idx !== -1) {
                    setSelectedText({ start: idx, end: idx + selectedString.length });
                  } else {
                    // Пробуем с нормализованными пробелами (рендер может схлопывать пробелы/переносы)
                    const normalizedContent = markdownText.replace(/\s+/g, " ");
                    const normalizedSelected = selectedString.replace(/\s+/g, " ");
                    const idxNorm = normalizedContent.indexOf(normalizedSelected);
                    if (idxNorm !== -1) {
                      const len = normalizedSelected.length;
                      // Строим маппинг: индекс в normalizedContent -> начало/конец в markdown
                      const normToStart: number[] = [];
                      const normToEnd: number[] = [];
                      let normIdx = 0;
                      let i = 0;
                      while (i < markdownText.length && normIdx <= idxNorm + len) {
                        if (/\s/.test(markdownText.charAt(i))) {
                          const start = i;
                          while (i < markdownText.length && /\s/.test(markdownText.charAt(i))) i++;
                          if (normIdx > 0) {
                            normToStart[normIdx] = start;
                            normToEnd[normIdx] = i;
                            normIdx++;
                          }
                        } else {
                          normToStart[normIdx] = i;
                          normToEnd[normIdx] = i + 1;
                          normIdx++;
                          i++;
                        }
                      }
                      const startInOriginal = normToStart[idxNorm];
                      const endInOriginal = normToEnd[idxNorm + len - 1];
                      if (startInOriginal != null && endInOriginal != null) {
                        setSelectedText({ start: startInOriginal, end: endInOriginal });
                      } else {
                        setSelectedText(null);
                      }
                    } else {
                      setSelectedText(null);
                    }
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
                        role={hasSelection ? "button" : undefined}
                        tabIndex={hasSelection ? 0 : undefined}
                        onClick={
                          hasSelection
                            ? () => {
                                scrollToSelectionInNote(comment.selectionStart!, comment.selectionEnd!);
                                setExpandedInlineCommentIds((prev) => {
                                  const next = new Set(prev);
                                  next.add(comment.id);
                                  return next;
                                });
                              }
                            : undefined
                        }
                        onKeyDown={
                          hasSelection
                            ? (e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  scrollToSelectionInNote(comment.selectionStart!, comment.selectionEnd!);
                                  setExpandedInlineCommentIds((prev) => {
                                    const next = new Set(prev);
                                    next.add(comment.id);
                                    return next;
                                  });
                                }
                              }
                            : undefined
                        }
                        style={{
                          marginBottom: "1rem",
                          padding: "0.75rem",
                          background: "#f9fafb",
                          borderRadius: "8px",
                          border: "1px solid #e5e7eb",
                          ...(hasSelection && {
                            cursor: "pointer",
                            transition: "background 0.15s ease"
                          })
                        }}
                        onMouseEnter={
                          hasSelection
                            ? (e) => {
                                e.currentTarget.style.background = "#eef2ff";
                              }
                            : undefined
                        }
                        onMouseLeave={
                          hasSelection
                            ? (e) => {
                                e.currentTarget.style.background = "#f9fafb";
                              }
                            : undefined
                        }
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
                              type="button"
                              className="btn ghost"
                              onClick={(e) => {
                                e.stopPropagation();
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
    </div>
  );
}

