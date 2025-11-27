export type User = {
  id: number;
  username: string;
  email: string;
  createdAt: string;
  lastLoginAt: string | null;
};

export type Note = {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  folderId: number | null;
};

export type Folder = {
  id: number;
  name: string;
  createdAt: string;
  parentId: number | null;
};

export type AuthResponse = {
  token: string;
  user: User;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = {
  username: string;
  email: string;
  password: string;
};

export type CreateNotePayload = {
  title: string;
  content: string;
  folderId?: number | null;
};

export type UpdateNotePayload = {
  title: string;
  content: string;
  folderId?: number | null;
};

export type CreateFolderPayload = {
  name: string;
  parentId?: number | null;
};

export type UpdateFolderPayload = CreateFolderPayload;

