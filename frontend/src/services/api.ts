import type {
  AuthResponse,
  CreateFolderPayload,
  CreateNotePayload,
  Folder,
  LoginPayload,
  Note,
  RegisterPayload,
  UpdateFolderPayload,
  UpdateNotePayload
} from "../types";

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
    })
};

