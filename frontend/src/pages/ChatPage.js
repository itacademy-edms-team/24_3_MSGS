import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import AppSidebarNav from "../components/AppSidebarNav";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as SignalR from "@microsoft/signalr";
import { useAuth } from "../auth/AuthContext";
import { api, HUB_BASE_URL } from "../services/api";
/** Нормализует сообщение с бэкенда (PascalCase или camelCase) в тип Message */
function normalizeMessage(msg) {
    return {
        id: (msg.id ?? msg.Id),
        content: (msg.content ?? msg.Content),
        sentAt: (msg.sentAt ?? msg.SentAt),
        userId: (msg.userId ?? msg.UserId),
        username: (msg.username ?? msg.Username),
        conversationId: (msg.conversationId ?? msg.ConversationId),
        noteId: (msg.noteId ?? msg.NoteId),
        selectionStart: (msg.selectionStart ?? msg.SelectionStart),
        selectionEnd: (msg.selectionEnd ?? msg.SelectionEnd)
    };
}
export default function ChatPage() {
    const { user, token } = useAuth();
    const [conversations, setConversations] = useState([]);
    const [friends, setFriends] = useState([]);
    const [selectedConversationId, setSelectedConversationId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messageInput, setMessageInput] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [status, setStatus] = useState(null);
    const [showShareNotes, setShowShareNotes] = useState(false);
    const [notes, setNotes] = useState([]);
    const [folders, setFolders] = useState([]);
    const [selectedNote, setSelectedNote] = useState(null);
    const [loadingNote, setLoadingNote] = useState(false);
    const [comments, setComments] = useState([]);
    const [showComments, setShowComments] = useState(false);
    const [selectedText, setSelectedText] = useState(null);
    const [commentInput, setCommentInput] = useState("");
    const [expandedComments, setExpandedComments] = useState(new Set());
    const [hubConnected, setHubConnected] = useState(false);
    const [hubError, setHubError] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const messagesEndRef = useRef(null);
    const userRef = useRef(user?.id);
    userRef.current = user?.id;
    const connectionRef = useRef(null);
    const selectedConvRef = useRef(null);
    const prevConversationIdRef = useRef(null);
    const loadConversationsRef = useRef(null);
    const joinedConversationIdsRef = useRef(new Set());
    const tokenRef = useRef(null);
    const notePreviewRef = useRef(null);
    tokenRef.current = token ?? null;
    selectedConvRef.current = selectedConversationId;
    /** Прокрутить заметку к месту выделенного текста (для комментария) и подсветить */
    const scrollToSelectionInNote = useCallback((selectionStart, selectionEnd) => {
        const container = notePreviewRef.current;
        const content = selectedNote?.content;
        if (!container || !content)
            return;
        const targetText = content.substring(selectionStart, selectionEnd);
        if (!targetText.trim())
            return;
        const fullText = container.textContent || "";
        let pos = fullText.indexOf(targetText);
        if (pos === -1) {
            const norm = (s) => s.replace(/\s+/g, " ").trim();
            const normFull = norm(fullText);
            const normTarget = norm(targetText);
            const posNorm = normFull.indexOf(normTarget);
            if (posNorm === -1)
                return;
            let normIdx = 0;
            for (let i = 0; i < fullText.length; i++) {
                if (normIdx === posNorm) {
                    pos = i;
                    break;
                }
                const c = fullText.charAt(i);
                if (/\s/.test(c)) {
                    if (normIdx > 0 && normFull.charAt(normIdx - 1) !== " ")
                        normIdx++;
                }
                else {
                    normIdx++;
                }
            }
        }
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
        let charCount = 0;
        let targetNode = null;
        let node;
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
    }, [selectedNote?.content]);
    const selectedConversation = conversations.find((c) => c.id === selectedConversationId);
    const totalUnread = conversations.reduce((s, c) => s + (c.unreadCount ?? 0), 0);
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };
    useEffect(() => {
        scrollToBottom();
    }, [messages]);
    const showStatus = (message, timeout = 4000) => {
        setStatus(message);
        if (timeout > 0) {
            setTimeout(() => setStatus(null), timeout);
        }
    };
    const loadConversations = useCallback(async () => {
        if (!token)
            return;
        try {
            const data = await api.getConversations(token);
            setConversations(data);
        }
        catch (error) {
            showStatus(error instanceof Error ? error.message : "Ошибка загрузки чатов", 6000);
        }
    }, [token]);
    loadConversationsRef.current = loadConversations;
    const loadFriends = useCallback(async () => {
        if (!token)
            return;
        try {
            const data = await api.getFriends(token);
            setFriends(data);
        }
        catch (error) {
            // Игнорируем ошибки загрузки друзей
        }
    }, [token]);
    const loadMessages = useCallback(async (conversationId) => {
        if (!token)
            return;
        try {
            const data = await api.getConversationMessages(token, conversationId);
            setMessages(data);
            return data;
        }
        catch (error) {
            showStatus(error instanceof Error ? error.message : "Ошибка загрузки сообщений", 6000);
        }
    }, [token]);
    const loadNotes = useCallback(async () => {
        if (!token)
            return;
        try {
            const data = await api.getNotes(token);
            setNotes(data);
        }
        catch (error) {
            // Игнорируем ошибки
        }
    }, [token]);
    const loadFolders = useCallback(async () => {
        if (!token)
            return;
        try {
            const data = await api.getFolders(token);
            setFolders(data);
        }
        catch (error) {
            // Игнорируем ошибки
        }
    }, [token]);
    // Подключение SignalR для обновления чата в реальном времени
    useEffect(() => {
        if (!token)
            return;
        setHubError(null);
        const url = `${HUB_BASE_URL}/hubs/chat`;
        console.log("[SignalR] Подключение к:", url);
        const connection = new SignalR.HubConnectionBuilder()
            .withUrl(url, { accessTokenFactory: () => token })
            .withAutomaticReconnect()
            .build();
        connection.on("ReceiveMessage", (msg) => {
            const normalized = normalizeMessage(msg);
            const currentConvId = selectedConvRef.current;
            const isCurrentChat = normalized.conversationId === currentConvId;
            const isFromOther = normalized.userId !== userRef.current;
            if (isCurrentChat) {
                setMessages((prev) => prev.some((m) => m.id === normalized.id) ? prev : [...prev, normalized]);
                if (normalized.conversationId != null && tokenRef.current) {
                    api.markConversationRead(tokenRef.current, normalized.conversationId, normalized.id).then(() => loadConversationsRef.current?.());
                }
            }
            else if (isFromOther && normalized.conversationId != null) {
                const notif = {
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
            ids.forEach((id) => connection.invoke("JoinConversation", id).catch(() => { }));
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
            connection.onclose(() => { });
            connection.onreconnecting(() => { });
            connection.onreconnected(() => { });
            setHubConnected(false);
            setHubError(null);
            joinedConversationIdsRef.current = new Set();
            connection.stop().catch(() => { });
            connectionRef.current = null;
            prevConversationIdRef.current = null;
        };
    }, [token]);
    // Подписываемся на все чаты пользователя, чтобы получать сообщения и показывать пуш
    useEffect(() => {
        const conn = connectionRef.current;
        if (!conn || !hubConnected || conversations.length === 0)
            return;
        conversations.forEach((c) => {
            if (joinedConversationIdsRef.current.has(c.id))
                return;
            joinedConversationIdsRef.current = new Set([...joinedConversationIdsRef.current, c.id]);
            conn.invoke("JoinConversation", c.id).catch(() => { });
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
            if (!selectedConversationId)
                setMessages([]);
            return;
        }
        // Тот же механизм, что при отправке: берём актуальные данные с сервера, затем отмечаем прочитанным и обновляем список.
        const markReadAndRefresh = (lastMessageId) => {
            api
                .markConversationRead(token, selectedConversationId, lastMessageId)
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
    const handleSelectConversation = (conversationId) => {
        setSelectedConversationId(conversationId);
        setShowShareNotes(false);
    };
    const dismissNotification = (id, conversationId) => {
        setNotifications((n) => n.filter((x) => x.id !== id));
        if (conversationId != null)
            setSelectedConversationId(conversationId);
    };
    const handleStartConversation = async (friendId) => {
        if (!token)
            return;
        try {
            const conversation = await api.createOrGetConversation(token, { userId: friendId });
            setConversations((prev) => {
                const exists = prev.find((c) => c.id === conversation.id);
                if (exists)
                    return prev;
                return [...prev, conversation];
            });
            setSelectedConversationId(conversation.id);
        }
        catch (error) {
            showStatus(error instanceof Error ? error.message : "Ошибка создания чата", 6000);
        }
    };
    const handleSendMessage = async () => {
        if (!token || !selectedConversationId || !messageInput.trim())
            return;
        setSending(true);
        try {
            const message = await api.sendMessage(token, {
                content: messageInput.trim(),
                conversationId: selectedConversationId
            });
            setMessages((prev) => prev.some((m) => m.id === message.id) ? prev : [...prev, message]);
            setMessageInput("");
            // Тот же механизм, что при открытии чата: отмечаем прочитанным до последнего сообщения и обновляем список
            api
                .markConversationRead(token, selectedConversationId, message.id)
                .then(() => loadConversationsRef.current?.())
                .catch(() => loadConversations());
        }
        catch (error) {
            showStatus(error instanceof Error ? error.message : "Ошибка отправки сообщения", 6000);
        }
        finally {
            setSending(false);
        }
    };
    const handleShareNote = async (noteId) => {
        if (!token || !selectedConversationId)
            return;
        try {
            await api.shareNote(token, {
                conversationId: selectedConversationId,
                noteId
            });
            setShowShareNotes(false);
            showStatus("Заметка отправлена");
            loadMessages(selectedConversationId);
            loadConversations();
        }
        catch (error) {
            showStatus(error instanceof Error ? error.message : "Ошибка отправки заметки", 6000);
        }
    };
    const folderName = (folderId) => {
        if (!folderId)
            return "Без папки";
        return folders.find((f) => f.id === folderId)?.name ?? "Без папки";
    };
    const getOtherUser = (conversation) => {
        return conversation.user1Id === user?.id
            ? conversation.user2Username
            : conversation.user1Username;
    };
    const loadComments = useCallback(async (noteId) => {
        if (!token)
            return;
        try {
            const data = await api.getNoteComments(token, noteId);
            setComments(data);
        }
        catch (error) {
            // Игнорируем ошибки загрузки комментариев
        }
    }, [token]);
    useEffect(() => {
        if (selectedNote) {
            loadComments(selectedNote.id);
            setSelectedText(null);
            setCommentInput("");
            setExpandedComments(new Set());
        }
        else {
            setComments([]);
        }
    }, [selectedNote, loadComments]);
    const handleAddComment = async () => {
        if (!token || !selectedNote || !commentInput.trim())
            return;
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
        }
        catch (error) {
            showStatus(error instanceof Error ? error.message : "Ошибка добавления комментария", 6000);
        }
    };
    if (loading) {
        return (_jsxs("div", { className: "fullscreen-center", children: [_jsx("div", { className: "spinner" }), _jsx("p", { children: "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C \u0434\u0430\u043D\u043D\u044B\u0435..." })] }));
    }
    return (_jsxs("div", { className: "dashboard chat-dashboard", children: [_jsxs("aside", { className: "sidebar", children: [_jsx(AppSidebarNav, {}), _jsxs("div", { className: "sidebar-section", children: [_jsxs("div", { className: "section-header", children: [_jsx("h3", { children: "\u0427\u0430\u0442\u044B" }), totalUnread > 0 && (_jsx("span", { style: {
                                            width: "8px",
                                            height: "8px",
                                            borderRadius: "50%",
                                            background: "#4c3df7",
                                            flexShrink: 0
                                        }, title: `${totalUnread} непрочитанных` })), _jsx("span", { className: "badge", children: conversations.length })] }), _jsx("ul", { className: "folder-list", children: conversations.map((conversation) => (_jsxs("li", { className: selectedConversationId === conversation.id ? "active" : "", onClick: () => handleSelectConversation(conversation.id), children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: "0.5rem", width: "100%" }, children: [_jsx("span", { style: { flex: 1, minWidth: 0 }, children: getOtherUser(conversation) }), (conversation.unreadCount ?? 0) > 0 && (_jsx("span", { className: "badge", style: { flexShrink: 0 }, children: conversation.unreadCount > 99 ? "99+" : conversation.unreadCount }))] }), conversation.lastMessageContent && (_jsx("p", { className: "note-meta", style: { fontSize: "0.85rem", marginTop: "0.25rem" }, children: conversation.lastMessageContent.length > 30
                                                ? conversation.lastMessageContent.substring(0, 30) + "..."
                                                : conversation.lastMessageContent }))] }, conversation.id))) }), _jsxs("div", { className: "sidebar-section", style: { marginTop: "1.5rem" }, children: [_jsx("div", { className: "section-header", children: _jsx("h3", { children: "\u0414\u0440\u0443\u0437\u044C\u044F" }) }), _jsxs("ul", { className: "folder-list", children: [friends.map((friend) => (_jsx("li", { onClick: () => handleStartConversation(friend.id), style: { cursor: "pointer" }, children: _jsx("span", { children: friend.username }) }, friend.id))), friends.length === 0 && (_jsx("p", { className: "empty-state", style: { padding: "1rem", fontSize: "0.9rem" }, children: "\u041D\u0435\u0442 \u0434\u0440\u0443\u0437\u0435\u0439. \u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0434\u0440\u0443\u0437\u0435\u0439 \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435 \"\u0414\u0440\u0443\u0437\u044C\u044F\"" }))] })] })] })] }), _jsxs("div", { style: {
                    display: "grid",
                    gridTemplateColumns: selectedNote ? "minmax(350px, 500px) 1fr" : "1fr",
                    height: "100vh",
                    gap: "0",
                    width: "100%",
                    overflow: "hidden"
                }, children: [_jsx("section", { className: "editor-panel", style: {
                            display: "flex",
                            flexDirection: "column",
                            height: "100vh",
                            overflow: "hidden"
                        }, children: selectedConversation ? (_jsxs(_Fragment, { children: [_jsxs("header", { className: "panel-header", style: { flexWrap: "nowrap", minWidth: 0 }, children: [_jsx("h2", { style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: getOtherUser(selectedConversation) }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }, children: [_jsx("span", { "data-chat-hub-status": true, style: {
                                                        fontSize: "0.75rem",
                                                        fontWeight: 600,
                                                        padding: "0.25rem 0.5rem",
                                                        borderRadius: "6px",
                                                        background: hubConnected ? "rgba(5, 150, 105, 0.15)" : "rgba(107, 114, 128, 0.15)",
                                                        color: hubConnected ? "#059669" : "#6b7280"
                                                    }, title: hubError
                                                        ? `Ошибка: ${hubError}. Откройте консоль (F12) для подробностей.`
                                                        : hubConnected
                                                            ? "Сообщения приходят в реальном времени"
                                                            : "Подключение к серверу чата...", children: hubConnected ? "● Подключено" : "○ Нет подключения" }), hubError && (_jsx("span", { style: { fontSize: "0.7rem", color: "#b91c1c", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }, title: hubError, children: hubError })), _jsx("button", { className: "btn secondary", onClick: () => setShowShareNotes(!showShareNotes), children: showShareNotes ? "Скрыть" : "Поделиться файлами" })] })] }), showShareNotes && (_jsxs("div", { style: { padding: "1rem", borderBottom: "1px solid #e5e7eb", maxHeight: "300px", overflowY: "auto" }, children: [_jsx("h3", { style: { marginBottom: "1rem", fontSize: "1rem" }, children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0437\u0430\u043C\u0435\u0442\u043A\u0443 \u0434\u043B\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438:" }), folders.map((folder) => {
                                            const folderNotes = notes.filter((n) => n.folderId === folder.id);
                                            if (folderNotes.length === 0)
                                                return null;
                                            return (_jsxs("div", { style: { marginBottom: "1rem" }, children: [_jsxs("h4", { style: { marginBottom: "0.5rem", fontSize: "0.9rem", color: "#4c3df7", fontWeight: 600 }, children: ["\uD83D\uDCC1 ", folder.name] }), _jsx("ul", { className: "notes-list", children: folderNotes.map((note) => (_jsx("li", { onClick: () => handleShareNote(note.id), style: { cursor: "pointer" }, children: _jsx("div", { children: _jsx("p", { className: "note-title", children: note.title || "Без названия" }) }) }, note.id))) })] }, folder.id));
                                        }), notes.filter((n) => !n.folderId).length > 0 && (_jsxs("div", { style: { marginBottom: "1rem" }, children: [_jsx("h4", { style: { marginBottom: "0.5rem", fontSize: "0.9rem", color: "#4c3df7", fontWeight: 600 }, children: "\uD83D\uDCC1 \u0411\u0435\u0437 \u043F\u0430\u043F\u043A\u0438" }), _jsx("ul", { className: "notes-list", children: notes
                                                        .filter((n) => !n.folderId)
                                                        .map((note) => (_jsx("li", { onClick: () => handleShareNote(note.id), style: { cursor: "pointer" }, children: _jsx("div", { children: _jsx("p", { className: "note-title", children: note.title || "Без названия" }) }) }, note.id))) })] })), notes.length === 0 && (_jsx("p", { className: "empty-state", children: "\u041D\u0435\u0442 \u0437\u0430\u043C\u0435\u0442\u043E\u043A \u0434\u043B\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438" }))] })), _jsxs("div", { style: { flex: 1, overflowY: "auto", padding: "1rem" }, children: [messages.map((message) => {
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
                                                }
                                                catch (error) {
                                                    console.error("Ошибка загрузки заметки", error);
                                                    showStatus(error instanceof Error ? error.message : "Ошибка загрузки заметки", 6000);
                                                }
                                                finally {
                                                    setLoadingNote(false);
                                                }
                                            };
                                            return (_jsx("div", { style: {
                                                    marginBottom: "1rem",
                                                    display: "flex",
                                                    flexDirection: message.userId === user?.id ? "row-reverse" : "row",
                                                    gap: "0.5rem"
                                                }, children: _jsxs("div", { onClick: message.noteId ? (e) => {
                                                        e.stopPropagation();
                                                        handleNoteClick();
                                                    } : undefined, style: {
                                                        maxWidth: "70%",
                                                        padding: "0.75rem 1rem",
                                                        borderRadius: "12px",
                                                        background: message.userId === user?.id ? "#4c3df7" : "#e5e7eb",
                                                        color: message.userId === user?.id ? "#fff" : "#101828",
                                                        cursor: message.noteId ? "pointer" : "default",
                                                        transition: message.noteId ? "all 0.2s" : "none",
                                                        position: "relative"
                                                    }, onMouseEnter: message.noteId ? (e) => {
                                                        e.currentTarget.style.opacity = "0.9";
                                                        e.currentTarget.style.transform = "scale(1.02)";
                                                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
                                                        e.currentTarget.style.border = message.userId === user?.id ? "2px solid rgba(255,255,255,0.5)" : "2px solid rgba(76, 61, 247, 0.5)";
                                                    } : undefined, onMouseLeave: message.noteId ? (e) => {
                                                        e.currentTarget.style.opacity = "1";
                                                        e.currentTarget.style.transform = "scale(1)";
                                                        e.currentTarget.style.boxShadow = "none";
                                                        e.currentTarget.style.border = "none";
                                                    } : undefined, children: [_jsx("p", { style: { margin: 0, fontSize: "0.85rem", opacity: 0.8, marginBottom: "0.25rem" }, children: message.username }), _jsx("p", { style: { margin: 0 }, children: message.content }), message.noteId && (_jsxs("div", { style: {
                                                                margin: "0.5rem 0 0 0",
                                                                fontSize: "0.85rem",
                                                                padding: "0.5rem",
                                                                borderRadius: "6px",
                                                                background: message.userId === user?.id ? "rgba(255,255,255,0.2)" : "rgba(76, 61, 247, 0.15)",
                                                                border: message.userId === user?.id ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(76, 61, 247, 0.3)",
                                                                display: "inline-block"
                                                            }, children: [_jsxs("strong", { children: ["\uD83D\uDCCE \u0417\u0430\u043C\u0435\u0442\u043A\u0430 #", message.noteId] }), loadingNote ? (_jsx("span", { style: { marginLeft: "0.5rem" }, children: "(\u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430...)" })) : (_jsx("span", { style: { marginLeft: "0.5rem", fontSize: "0.8rem" }, children: "\u2014 \u043A\u043B\u0438\u043A\u043D\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u043E\u0442\u043A\u0440\u044B\u0442\u044C" }))] })), _jsx("p", { style: { margin: "0.5rem 0 0 0", fontSize: "0.75rem", opacity: 0.7 }, children: new Date(message.sentAt).toLocaleTimeString() })] }) }, message.id));
                                        }), _jsx("div", { ref: messagesEndRef })] }), _jsx("div", { style: { padding: "1rem", borderTop: "1px solid #e5e7eb" }, children: _jsxs("div", { style: { display: "flex", gap: "0.5rem" }, children: [_jsx("input", { type: "text", value: messageInput, onChange: (e) => setMessageInput(e.target.value), onKeyPress: (e) => e.key === "Enter" && !e.shiftKey && handleSendMessage(), placeholder: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435...", style: { flex: 1, padding: "0.75rem", borderRadius: "8px", border: "1px solid #e5e7eb" } }), _jsx("button", { className: "btn primary", onClick: handleSendMessage, disabled: sending || !messageInput.trim(), children: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C" })] }) })] })) : (_jsx("div", { className: "empty-state large", children: _jsx("p", { children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0447\u0430\u0442 \u0438\u043B\u0438 \u043D\u0430\u0447\u043D\u0438\u0442\u0435 \u043D\u043E\u0432\u044B\u0439 \u0441 \u0434\u0440\u0443\u0433\u043E\u043C" }) })) }), selectedNote && (_jsxs("section", { style: {
                            background: "#fff",
                            borderLeft: "1px solid #e5e7eb",
                            display: "flex",
                            flexDirection: "column",
                            height: "100vh",
                            overflow: "hidden",
                            minWidth: 0,
                            width: "100%"
                        }, children: [_jsxs("header", { className: "panel-header", style: { padding: "1rem", borderBottom: "1px solid #e5e7eb" }, children: [_jsx("h2", { style: { margin: 0 }, children: selectedNote.title || "Без названия" }), _jsxs("div", { style: { display: "flex", gap: "0.5rem", alignItems: "center" }, children: [_jsxs("button", { className: "btn secondary", onClick: () => setShowComments(!showComments), style: { fontSize: "0.9rem" }, children: [showComments ? "Скрыть" : "Показать", " \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0438 (", comments.length, ")"] }), _jsx("button", { className: "btn ghost", onClick: () => {
                                                    setSelectedNote(null);
                                                    setSelectedText(null);
                                                    setCommentInput("");
                                                }, style: { fontSize: "1.5rem", padding: "0.25rem 0.5rem" }, children: "\u00D7" })] })] }), _jsxs("div", { style: { flex: 1, overflowY: "auto", padding: "1.5rem", position: "relative", maxWidth: "100%" }, children: [_jsx("div", { ref: notePreviewRef, className: "preview", style: { maxWidth: "100%", wordWrap: "break-word" }, onMouseUp: (e) => {
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
                                            }
                                            else {
                                                // Пробуем с нормализованными пробелами (рендер может схлопывать пробелы/переносы)
                                                const normalizedContent = markdownText.replace(/\s+/g, " ");
                                                const normalizedSelected = selectedString.replace(/\s+/g, " ");
                                                const idxNorm = normalizedContent.indexOf(normalizedSelected);
                                                if (idxNorm !== -1) {
                                                    const len = normalizedSelected.length;
                                                    // Строим маппинг: индекс в normalizedContent -> начало/конец в markdown
                                                    const normToStart = [];
                                                    const normToEnd = [];
                                                    let normIdx = 0;
                                                    let i = 0;
                                                    while (i < markdownText.length && normIdx <= idxNorm + len) {
                                                        if (/\s/.test(markdownText.charAt(i))) {
                                                            const start = i;
                                                            while (i < markdownText.length && /\s/.test(markdownText.charAt(i)))
                                                                i++;
                                                            if (normIdx > 0) {
                                                                normToStart[normIdx] = start;
                                                                normToEnd[normIdx] = i;
                                                                normIdx++;
                                                            }
                                                        }
                                                        else {
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
                                                    }
                                                    else {
                                                        setSelectedText(null);
                                                    }
                                                }
                                                else {
                                                    setSelectedText(null);
                                                }
                                            }
                                        }, children: _jsx(ReactMarkdown, { remarkPlugins: [remarkGfm], children: selectedNote.content }) }), _jsxs("div", { style: {
                                            position: "sticky",
                                            bottom: 0,
                                            padding: "0.75rem",
                                            background: selectedText ? "#eef2ff" : "#fff",
                                            borderTop: "1px solid #e5e7eb",
                                            marginTop: "1rem"
                                        }, children: [selectedText && (_jsxs("p", { style: { margin: "0 0 0.5rem 0", fontSize: "0.85rem", fontWeight: 600 }, children: ["\u0412\u044B\u0434\u0435\u043B\u0435\u043D \u0442\u0435\u043A\u0441\u0442: \"", selectedNote.content.substring(selectedText.start, selectedText.end).substring(0, 50), "...\""] })), _jsxs("div", { style: { display: "flex", gap: "0.5rem" }, children: [_jsx("input", { type: "text", value: commentInput, onChange: (e) => setCommentInput(e.target.value), placeholder: selectedText ? "Добавить комментарий к выделенному тексту..." : "Добавить комментарий к заметке...", style: { flex: 1, padding: "0.5rem", borderRadius: "6px", border: "1px solid #e5e7eb" }, onKeyPress: (e) => {
                                                            if (e.key === "Enter" && commentInput.trim()) {
                                                                handleAddComment();
                                                            }
                                                        } }), _jsx("button", { className: "btn primary", onClick: handleAddComment, disabled: !commentInput.trim() || !token, children: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C" }), selectedText && (_jsx("button", { className: "btn ghost", onClick: () => {
                                                            setSelectedText(null);
                                                            setCommentInput("");
                                                        }, children: "\u041E\u0442\u043C\u0435\u043D\u0430" }))] })] }), showComments && comments.length > 0 && (_jsxs("div", { style: { marginTop: "2rem", paddingTop: "1.5rem", borderTop: "2px solid #e5e7eb" }, children: [_jsxs("h3", { style: { marginBottom: "1rem", fontSize: "1.1rem" }, children: ["\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0438 (", comments.length, ")"] }), comments.map((comment) => {
                                                const isExpanded = expandedComments.has(comment.id);
                                                const hasSelection = comment.selectionStart != null && comment.selectionEnd != null;
                                                const selectedText = hasSelection
                                                    ? selectedNote.content.substring(comment.selectionStart, comment.selectionEnd)
                                                    : null;
                                                return (_jsxs("div", { role: hasSelection ? "button" : undefined, tabIndex: hasSelection ? 0 : undefined, onClick: hasSelection
                                                        ? () => scrollToSelectionInNote(comment.selectionStart, comment.selectionEnd)
                                                        : undefined, onKeyDown: hasSelection
                                                        ? (e) => {
                                                            if (e.key === "Enter" || e.key === " ") {
                                                                e.preventDefault();
                                                                scrollToSelectionInNote(comment.selectionStart, comment.selectionEnd);
                                                            }
                                                        }
                                                        : undefined, style: {
                                                        marginBottom: "1rem",
                                                        padding: "0.75rem",
                                                        background: "#f9fafb",
                                                        borderRadius: "8px",
                                                        border: "1px solid #e5e7eb",
                                                        ...(hasSelection && {
                                                            cursor: "pointer",
                                                            transition: "background 0.15s ease"
                                                        })
                                                    }, onMouseEnter: hasSelection
                                                        ? (e) => {
                                                            e.currentTarget.style.background = "#eef2ff";
                                                        }
                                                        : undefined, onMouseLeave: hasSelection
                                                        ? (e) => {
                                                            e.currentTarget.style.background = "#f9fafb";
                                                        }
                                                        : undefined, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "0.5rem" }, children: [_jsxs("div", { children: [_jsx("p", { style: { margin: 0, fontSize: "0.85rem", fontWeight: 600 }, children: comment.username }), _jsx("p", { style: { margin: "0.25rem 0 0 0", fontSize: "0.75rem", color: "#6b7280" }, children: new Date(comment.sentAt).toLocaleString() })] }), hasSelection && (_jsx("button", { type: "button", className: "btn ghost", onClick: (e) => {
                                                                        e.stopPropagation();
                                                                        const newExpanded = new Set(expandedComments);
                                                                        if (isExpanded) {
                                                                            newExpanded.delete(comment.id);
                                                                        }
                                                                        else {
                                                                            newExpanded.add(comment.id);
                                                                        }
                                                                        setExpandedComments(newExpanded);
                                                                    }, style: { fontSize: "0.75rem", padding: "0.25rem 0.5rem" }, children: isExpanded ? "Свернуть" : "Развернуть" }))] }), hasSelection && isExpanded && selectedText && (_jsxs("div", { style: { marginBottom: "0.5rem", padding: "0.5rem", background: "#fff", borderRadius: "4px", border: "1px solid #e5e7eb" }, children: [_jsx("p", { style: { margin: 0, fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }, children: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 \u043A \u0442\u0435\u043A\u0441\u0442\u0443:" }), _jsxs("p", { style: { margin: 0, fontStyle: "italic", color: "#4c3df7" }, children: ["\"", selectedText, "\""] })] })), _jsx("p", { style: { margin: 0 }, children: comment.content })] }, comment.id));
                                            })] }))] })] }))] }), status && (_jsx("div", { className: "toast", children: _jsx("span", { children: status }) })), _jsx("div", { className: "chat-notifications", style: {
                    position: "fixed",
                    bottom: "1rem",
                    left: "1rem",
                    zIndex: 10000,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    maxWidth: "320px"
                }, children: notifications.map((n) => (_jsxs("button", { type: "button", onClick: () => dismissNotification(n.id, n.conversationId), style: {
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
                    }, onMouseEnter: (e) => {
                        e.currentTarget.style.transform = "translateX(4px)";
                        e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.15)";
                    }, onMouseLeave: (e) => {
                        e.currentTarget.style.transform = "translateX(0)";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.12)";
                    }, children: [_jsx("div", { style: { fontSize: "0.8rem", fontWeight: 600, color: "#4c3df7", marginBottom: "0.25rem" }, children: n.username }), _jsx("div", { style: { fontSize: "0.85rem", color: "#374151", lineHeight: 1.3 }, children: n.content.length > 60 ? `${n.content.slice(0, 60)}…` : n.content }), _jsx("div", { style: { fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.25rem" }, children: new Date(n.sentAt).toLocaleTimeString() })] }, n.id))) })] }));
}
