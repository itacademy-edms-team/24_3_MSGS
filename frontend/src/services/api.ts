import type {
  AuthResponse,
  Conversation,
  CreateConversationPayload,
  CreateFolderPayload,
  CreateMessagePayload,
  CreateNotePayload,
  Friendship,
  Folder,
  LoginPayload,
  Message,
  Note,
  RegisterPayload,
  SendFriendRequestPayload,
  ShareNotePayload,
  UpdateFolderPayload,
  UpdateNotePayload,
  User
} from "../types";

// const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000/api";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "https://localhost:7000/api";

type RequestOptions = {
  method?: string;
  token?: string | null;
  body?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json"
  };

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (response.status === 204) {
    return null as T;
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || response.statusText);
  }

  return (await response.json()) as T;
}

export const api = {
  login: (payload: LoginPayload) =>
    request<AuthResponse>("/users/login", {
      method: "POST",
      body: payload
    }),
  register: (payload: RegisterPayload) =>
    request<AuthResponse>("/users/register", {
      method: "POST",
      body: payload
    }),
  getNotes: (token: string) =>
    request<Note[]>("/notes", {
      token
    }),
  getNote: (token: string, id: number) =>
    request<Note>(`/notes/${id}`, {
      token
    }),
  createNote: (token: string, payload: CreateNotePayload) =>
    request<Note>("/notes", {
      method: "POST",
      token,
      body: payload
    }),
  updateNote: (token: string, id: number, payload: UpdateNotePayload) =>
    request<void>("/notes/" + id, {
      method: "PUT",
      token,
      body: {
        id,
        ...payload
      }
    }),
  deleteNote: (token: string, id: number) =>
    request<void>("/notes/" + id, {
      method: "DELETE",
      token
    }),
  getFolders: (token: string) =>
    request<Folder[]>("/folders", {
      token
    }),
  createFolder: (token: string, payload: CreateFolderPayload) =>
    request<Folder>("/folders", {
      method: "POST",
      token,
      body: payload
    }),
  updateFolder: (token: string, id: number, payload: UpdateFolderPayload) =>
    request<void>("/folders/" + id, {
      method: "PUT",
      token,
      body: payload
    }),
  deleteFolder: (token: string, id: number) =>
    request<void>("/folders/" + id, {
      method: "DELETE",
      token
    }),
  // Friendships
  getFriendships: (token: string) =>
    request<Friendship[]>("/friendships", {
      token
    }),
  getPendingRequests: (token: string) =>
    request<Friendship[]>("/friendships/pending", {
      token
    }),
  getFriends: (token: string) =>
    request<User[]>("/friendships/friends", {
      token
    }),
  sendFriendRequest: (token: string, payload: SendFriendRequestPayload) =>
    request<Friendship>("/friendships/send", {
      method: "POST",
      token,
      body: payload
    }),
  acceptFriendRequest: (token: string, id: number) =>
    request<Friendship>(`/friendships/${id}/accept`, {
      method: "POST",
      token
    }),
  rejectFriendRequest: (token: string, id: number) =>
    request<Friendship>(`/friendships/${id}/reject`, {
      method: "POST",
      token
    }),
  deleteFriendship: (token: string, id: number) =>
    request<void>(`/friendships/${id}`, {
      method: "DELETE",
      token
    }),
  // Conversations
  getConversations: (token: string) =>
    request<Conversation[]>("/conversations", {
      token
    }),
  getConversation: (token: string, id: number) =>
    request<Conversation>(`/conversations/${id}`, {
      token
    }),
  createOrGetConversation: (token: string, payload: CreateConversationPayload) =>
    request<Conversation>("/conversations", {
      method: "POST",
      token,
      body: payload
    }),
  // Messages
  getConversationMessages: (token: string, conversationId: number, limit?: number) =>
    request<Message[]>(`/messages/conversation/${conversationId}${limit ? `?limit=${limit}` : ""}`, {
      token
    }),
  getNoteComments: (token: string, noteId: number) =>
    request<Message[]>(`/messages/note/${noteId}`, {
      token
    }),
  sendMessage: (token: string, payload: CreateMessagePayload) =>
    request<Message>("/messages", {
      method: "POST",
      token,
      body: payload
    }),
  shareNote: (token: string, payload: ShareNotePayload) =>
    request<Message>("/messages/share-note", {
      method: "POST",
      token,
      body: payload
    })
};

