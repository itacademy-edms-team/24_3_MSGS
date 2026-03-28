import * as SignalR from "@microsoft/signalr";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, HUB_BASE_URL } from "../services/api";
import type { Message } from "../types";
import { normalizeMessage } from "./normalizeMessage";

export type ChatNotification = {
  id: string;
  conversationId: number;
  username: string;
  content: string;
  sentAt: string;
  noteId?: number;
};

type ChatHubContextValue = {
  hubConnected: boolean;
  hubError: string | null;
  /** Активный открытый чат (только на /chat); иначе null — все входящие показываются как уведомления */
  setActiveConversationId: (id: number | null) => void;
  setIncomingMessageHandler: (handler: ((msg: Message) => void) | null) => void;
  setRefreshConversationsHandler: (handler: (() => Promise<void>) | null) => void;
  syncConversationGroups: (conversationIds: number[]) => void;
  dismissNotification: (id: string, conversationId?: number) => void;
  pendingOpenConversationId: number | null;
  clearPendingOpenConversation: () => void;
};

const ChatHubContext = createContext<ChatHubContextValue | undefined>(undefined);

export function ChatHubProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [hubConnected, setHubConnected] = useState(false);
  const [hubError, setHubError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<ChatNotification[]>([]);
  const [pendingOpenConversationId, setPendingOpenConversationId] = useState<number | null>(null);

  const connectionRef = useRef<SignalR.HubConnection | null>(null);
  const activeConversationIdRef = useRef<number | null>(null);
  const userRef = useRef(user?.id);
  userRef.current = user?.id;
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const incomingHandlerRef = useRef<((msg: Message) => void) | null>(null);
  const refreshConversationsRef = useRef<(() => Promise<void>) | null>(null);
  const joinedIdsRef = useRef<Set<number>>(new Set());

  const setActiveConversationId = useCallback((id: number | null) => {
    activeConversationIdRef.current = id;
  }, []);

  const setIncomingMessageHandler = useCallback((handler: ((msg: Message) => void) | null) => {
    incomingHandlerRef.current = handler;
  }, []);

  const setRefreshConversationsHandler = useCallback((handler: (() => Promise<void>) | null) => {
    refreshConversationsRef.current = handler;
  }, []);

  const clearPendingOpenConversation = useCallback(() => {
    setPendingOpenConversationId(null);
  }, []);

  const syncConversationGroups = useCallback((conversationIds: number[]) => {
    const conn = connectionRef.current;
    if (!conn || conn.state !== SignalR.HubConnectionState.Connected) return;
    conversationIds.forEach((id) => {
      if (joinedIdsRef.current.has(id)) return;
      joinedIdsRef.current.add(id);
      conn.invoke("JoinConversation", id).catch(() => {});
    });
  }, []);

  const dismissNotification = useCallback(
    (id: string, conversationId?: number) => {
      setNotifications((n) => n.filter((x) => x.id !== id));
      if (conversationId != null) {
        setPendingOpenConversationId(conversationId);
        navigate("/chat");
      }
    },
    [navigate]
  );

  useEffect(() => {
    if (!token) return;
    setHubError(null);
    const url = `${HUB_BASE_URL}/hubs/chat`;
    const connection = new SignalR.HubConnectionBuilder()
      .withUrl(url, { accessTokenFactory: () => token })
      .withAutomaticReconnect()
      .build();

    connection.on("ReceiveMessage", (msg: Record<string, unknown>) => {
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
      ids.forEach((id) => connection.invoke("JoinConversation", id).catch(() => {}));
    });

    connection
      .start()
      .then(() => {
        setHubConnected(true);
        setHubError(null);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setHubError(message);
        console.error("[SignalR] Ошибка подключения:", message, "\nURL:", url, "\nПолная ошибка:", err);
      });

    connectionRef.current = connection;

    return () => {
      connection.off("ReceiveMessage");
      connection.onclose(() => {});
      connection.onreconnecting(() => {});
      connection.onreconnected(() => {});
      setHubConnected(false);
      setHubError(null);
      joinedIdsRef.current = new Set();
      connection.stop().catch(() => {});
      connectionRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !hubConnected) return;
    api
      .getConversations(token)
      .then((list) => syncConversationGroups(list.map((c) => c.id)))
      .catch(() => {});
  }, [token, hubConnected, syncConversationGroups]);

  const value: ChatHubContextValue = {
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

  return (
    <ChatHubContext.Provider value={value}>
      {children}
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
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "#4c3df7",
                marginBottom: "0.25rem"
              }}
            >
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
    </ChatHubContext.Provider>
  );
}

export function useChatHub(): ChatHubContextValue {
  const ctx = useContext(ChatHubContext);
  if (!ctx) {
    throw new Error("useChatHub должен использоваться внутри ChatHubProvider");
  }
  return ctx;
}
