import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as SignalR from "@microsoft/signalr";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, HUB_BASE_URL } from "../services/api";
import { normalizeMessage } from "./normalizeMessage";
const ChatHubContext = createContext(undefined);
export function ChatHubProvider({ children }) {
    const { token, user } = useAuth();
    const navigate = useNavigate();
    const [hubConnected, setHubConnected] = useState(false);
    const [hubError, setHubError] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [pendingOpenConversationId, setPendingOpenConversationId] = useState(null);
    const connectionRef = useRef(null);
    const activeConversationIdRef = useRef(null);
    const userRef = useRef(user?.id);
    userRef.current = user?.id;
    const tokenRef = useRef(token);
    tokenRef.current = token;
    const incomingHandlerRef = useRef(null);
    const refreshConversationsRef = useRef(null);
    const joinedIdsRef = useRef(new Set());
    const setActiveConversationId = useCallback((id) => {
        activeConversationIdRef.current = id;
    }, []);
    const setIncomingMessageHandler = useCallback((handler) => {
        incomingHandlerRef.current = handler;
    }, []);
    const setRefreshConversationsHandler = useCallback((handler) => {
        refreshConversationsRef.current = handler;
    }, []);
    const clearPendingOpenConversation = useCallback(() => {
        setPendingOpenConversationId(null);
    }, []);
    const syncConversationGroups = useCallback((conversationIds) => {
        const conn = connectionRef.current;
        if (!conn || conn.state !== SignalR.HubConnectionState.Connected)
            return;
        conversationIds.forEach((id) => {
            if (joinedIdsRef.current.has(id))
                return;
            joinedIdsRef.current.add(id);
            conn.invoke("JoinConversation", id).catch(() => { });
        });
    }, []);
    const dismissNotification = useCallback((id, conversationId) => {
        setNotifications((n) => n.filter((x) => x.id !== id));
        if (conversationId != null) {
            setPendingOpenConversationId(conversationId);
            navigate("/chat");
        }
    }, [navigate]);
    useEffect(() => {
        if (!token)
            return;
        setHubError(null);
        const url = `${HUB_BASE_URL}/hubs/chat`;
        const connection = new SignalR.HubConnectionBuilder()
            .withUrl(url, { accessTokenFactory: () => token })
            .withAutomaticReconnect()
            .build();
        connection.on("ReceiveMessage", (msg) => {
            const normalized = normalizeMessage(msg);
            const currentConvId = activeConversationIdRef.current;
            const isCurrentChat = normalized.conversationId === currentConvId;
            const isFromOther = normalized.userId !== userRef.current;
            if (isCurrentChat) {
                incomingHandlerRef.current?.(normalized);
                if (normalized.conversationId != null && tokenRef.current) {
                    api
                        .markConversationRead(tokenRef.current, normalized.conversationId, normalized.id)
                        .then(() => refreshConversationsRef.current?.());
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
            refreshConversationsRef.current?.();
        });
        const updateConnected = () => {
            setHubConnected(connection.state === SignalR.HubConnectionState.Connected);
            if (connection.state === SignalR.HubConnectionState.Disconnected) {
                setHubError(null);
            }
        };
        connection.onclose(updateConnected);
        connection.onreconnecting(updateConnected);
        connection.onreconnected(() => {
            updateConnected();
            const ids = Array.from(joinedIdsRef.current);
            ids.forEach((id) => connection.invoke("JoinConversation", id).catch(() => { }));
        });
        connection
            .start()
            .then(() => {
            setHubConnected(true);
            setHubError(null);
        })
            .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            setHubError(message);
            console.error("[SignalR] Ошибка подключения:", message, "\nURL:", url, "\nПолная ошибка:", err);
        });
        connectionRef.current = connection;
        return () => {
            connection.off("ReceiveMessage");
            connection.onclose(() => { });
            connection.onreconnecting(() => { });
            connection.onreconnected(() => { });
            setHubConnected(false);
            setHubError(null);
            joinedIdsRef.current = new Set();
            connection.stop().catch(() => { });
            connectionRef.current = null;
        };
    }, [token]);
    useEffect(() => {
        if (!token || !hubConnected)
            return;
        api
            .getConversations(token)
            .then((list) => syncConversationGroups(list.map((c) => c.id)))
            .catch(() => { });
    }, [token, hubConnected, syncConversationGroups]);
    const value = {
        hubConnected,
        hubError,
        setActiveConversationId,
        setIncomingMessageHandler,
        setRefreshConversationsHandler,
        syncConversationGroups,
        dismissNotification,
        pendingOpenConversationId,
        clearPendingOpenConversation
    };
    return (_jsxs(ChatHubContext.Provider, { value: value, children: [children, _jsx("div", { className: "chat-notifications", style: {
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
                    }, children: [_jsx("div", { style: {
                                fontSize: "0.8rem",
                                fontWeight: 600,
                                color: "#4c3df7",
                                marginBottom: "0.25rem"
                            }, children: n.username }), _jsx("div", { style: { fontSize: "0.85rem", color: "#374151", lineHeight: 1.3 }, children: n.content.length > 60 ? `${n.content.slice(0, 60)}…` : n.content }), _jsx("div", { style: { fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.25rem" }, children: new Date(n.sentAt).toLocaleTimeString() })] }, n.id))) })] }));
}
export function useChatHub() {
    const ctx = useContext(ChatHubContext);
    if (!ctx) {
        throw new Error("useChatHub должен использоваться внутри ChatHubProvider");
    }
    return ctx;
}
