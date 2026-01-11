import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../services/api";
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
    const messagesEndRef = useRef(null);
    const selectedConversation = conversations.find((c) => c.id === selectedConversationId);
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
    useEffect(() => {
        setLoading(true);
        Promise.all([loadConversations(), loadFriends()])
            .finally(() => setLoading(false));
    }, [loadConversations, loadFriends]);
    useEffect(() => {
        if (selectedConversationId) {
            loadMessages(selectedConversationId);
        }
        else {
            setMessages([]);
        }
    }, [selectedConversationId, loadMessages]);
    useEffect(() => {
        if (showShareNotes) {
            Promise.all([loadNotes(), loadFolders()]);
        }
    }, [showShareNotes, loadNotes, loadFolders]);
    const handleSelectConversation = (conversationId) => {
        setSelectedConversationId(conversationId);
        setShowShareNotes(false);
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
            setMessages((prev) => [...prev, message]);
            setMessageInput("");
            loadConversations(); // Обновляем список чатов для обновления последнего сообщения
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
    if (loading) {
        return (_jsxs("div", { className: "fullscreen-center", children: [_jsx("div", { className: "spinner" }), _jsx("p", { children: "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C \u0434\u0430\u043D\u043D\u044B\u0435..." })] }));
    }
    return (_jsxs("div", { className: "dashboard", children: [_jsxs("aside", { className: "sidebar", children: [_jsxs("div", { className: "user-card", children: [_jsxs("div", { children: [_jsx("p", { className: "user-name", children: user?.username }), _jsx("p", { className: "user-email", children: user?.email })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "0.5rem" }, children: [_jsx(Link, { to: "/app", className: "btn ghost", style: { textDecoration: "none", textAlign: "center" }, children: "\u0417\u0430\u043C\u0435\u0442\u043A\u0438" }), _jsx(Link, { to: "/friends", className: "btn ghost", style: { textDecoration: "none", textAlign: "center" }, children: "\u0414\u0440\u0443\u0437\u044C\u044F" })] })] }), _jsxs("div", { className: "sidebar-section", children: [_jsxs("div", { className: "section-header", children: [_jsx("h3", { children: "\u0427\u0430\u0442\u044B" }), _jsx("span", { className: "badge", children: conversations.length })] }), _jsx("ul", { className: "folder-list", children: conversations.map((conversation) => (_jsx("li", { className: selectedConversationId === conversation.id ? "active" : "", onClick: () => handleSelectConversation(conversation.id), children: _jsxs("div", { children: [_jsx("span", { children: getOtherUser(conversation) }), conversation.lastMessageContent && (_jsx("p", { className: "note-meta", style: { fontSize: "0.85rem", marginTop: "0.25rem" }, children: conversation.lastMessageContent.length > 30
                                                    ? conversation.lastMessageContent.substring(0, 30) + "..."
                                                    : conversation.lastMessageContent }))] }) }, conversation.id))) }), _jsxs("div", { className: "sidebar-section", style: { marginTop: "1.5rem" }, children: [_jsx("div", { className: "section-header", children: _jsx("h3", { children: "\u0414\u0440\u0443\u0437\u044C\u044F" }) }), _jsxs("ul", { className: "folder-list", children: [friends.map((friend) => (_jsx("li", { onClick: () => handleStartConversation(friend.id), style: { cursor: "pointer" }, children: _jsx("span", { children: friend.username }) }, friend.id))), friends.length === 0 && (_jsx("p", { className: "empty-state", style: { padding: "1rem", fontSize: "0.9rem" }, children: "\u041D\u0435\u0442 \u0434\u0440\u0443\u0437\u0435\u0439. \u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0434\u0440\u0443\u0437\u0435\u0439 \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435 \"\u0414\u0440\u0443\u0437\u044C\u044F\"" }))] })] })] })] }), _jsx("section", { className: "editor-panel", style: { display: "flex", flexDirection: "column", height: "100vh" }, children: selectedConversation ? (_jsxs(_Fragment, { children: [_jsxs("header", { className: "panel-header", children: [_jsx("h2", { children: getOtherUser(selectedConversation) }), _jsx("button", { className: "btn secondary", onClick: () => setShowShareNotes(!showShareNotes), children: showShareNotes ? "Скрыть" : "Поделиться файлами" })] }), showShareNotes && (_jsxs("div", { style: { padding: "1rem", borderBottom: "1px solid #e5e7eb", maxHeight: "300px", overflowY: "auto" }, children: [_jsx("h3", { style: { marginBottom: "1rem", fontSize: "1rem" }, children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0437\u0430\u043C\u0435\u0442\u043A\u0443 \u0434\u043B\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438:" }), folders.map((folder) => {
                                    const folderNotes = notes.filter((n) => n.folderId === folder.id);
                                    if (folderNotes.length === 0)
                                        return null;
                                    return (_jsxs("div", { style: { marginBottom: "1rem" }, children: [_jsxs("h4", { style: { marginBottom: "0.5rem", fontSize: "0.9rem", color: "#4c3df7", fontWeight: 600 }, children: ["\uD83D\uDCC1 ", folder.name] }), _jsx("ul", { className: "notes-list", children: folderNotes.map((note) => (_jsx("li", { onClick: () => handleShareNote(note.id), style: { cursor: "pointer" }, children: _jsx("div", { children: _jsx("p", { className: "note-title", children: note.title || "Без названия" }) }) }, note.id))) })] }, folder.id));
                                }), notes.filter((n) => !n.folderId).length > 0 && (_jsxs("div", { style: { marginBottom: "1rem" }, children: [_jsx("h4", { style: { marginBottom: "0.5rem", fontSize: "0.9rem", color: "#4c3df7", fontWeight: 600 }, children: "\uD83D\uDCC1 \u0411\u0435\u0437 \u043F\u0430\u043F\u043A\u0438" }), _jsx("ul", { className: "notes-list", children: notes
                                                .filter((n) => !n.folderId)
                                                .map((note) => (_jsx("li", { onClick: () => handleShareNote(note.id), style: { cursor: "pointer" }, children: _jsx("div", { children: _jsx("p", { className: "note-title", children: note.title || "Без названия" }) }) }, note.id))) })] })), notes.length === 0 && (_jsx("p", { className: "empty-state", children: "\u041D\u0435\u0442 \u0437\u0430\u043C\u0435\u0442\u043E\u043A \u0434\u043B\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438" }))] })), _jsxs("div", { style: { flex: 1, overflowY: "auto", padding: "1rem" }, children: [messages.map((message) => (_jsx("div", { style: {
                                        marginBottom: "1rem",
                                        display: "flex",
                                        flexDirection: message.userId === user?.id ? "row-reverse" : "row",
                                        gap: "0.5rem"
                                    }, children: _jsxs("div", { style: {
                                            maxWidth: "70%",
                                            padding: "0.75rem 1rem",
                                            borderRadius: "12px",
                                            background: message.userId === user?.id ? "#4c3df7" : "#e5e7eb",
                                            color: message.userId === user?.id ? "#fff" : "#101828"
                                        }, children: [_jsx("p", { style: { margin: 0, fontSize: "0.85rem", opacity: 0.8, marginBottom: "0.25rem" }, children: message.username }), _jsx("p", { style: { margin: 0 }, children: message.content }), message.noteId && (_jsxs("p", { style: { margin: "0.5rem 0 0 0", fontSize: "0.85rem", opacity: 0.9 }, children: ["\uD83D\uDCCE \u0417\u0430\u043C\u0435\u0442\u043A\u0430 #", message.noteId] })), _jsx("p", { style: { margin: "0.5rem 0 0 0", fontSize: "0.75rem", opacity: 0.7 }, children: new Date(message.sentAt).toLocaleTimeString() })] }) }, message.id))), _jsx("div", { ref: messagesEndRef })] }), _jsx("div", { style: { padding: "1rem", borderTop: "1px solid #e5e7eb" }, children: _jsxs("div", { style: { display: "flex", gap: "0.5rem" }, children: [_jsx("input", { type: "text", value: messageInput, onChange: (e) => setMessageInput(e.target.value), onKeyPress: (e) => e.key === "Enter" && !e.shiftKey && handleSendMessage(), placeholder: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435...", style: { flex: 1, padding: "0.75rem", borderRadius: "8px", border: "1px solid #e5e7eb" } }), _jsx("button", { className: "btn primary", onClick: handleSendMessage, disabled: sending || !messageInput.trim(), children: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C" })] }) })] })) : (_jsx("div", { className: "empty-state large", children: _jsx("p", { children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0447\u0430\u0442 \u0438\u043B\u0438 \u043D\u0430\u0447\u043D\u0438\u0442\u0435 \u043D\u043E\u0432\u044B\u0439 \u0441 \u0434\u0440\u0443\u0433\u043E\u043C" }) })) }), status && (_jsx("div", { className: "toast", children: _jsx("span", { children: status }) }))] }));
}
