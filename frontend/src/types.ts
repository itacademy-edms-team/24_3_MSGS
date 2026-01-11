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

export type Friendship = {
  id: number;
  requesterId: number;
  requesterUsername: string;
  addresseeId: number;
  addresseeUsername: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  updatedAt: string | null;
};

export type Conversation = {
  id: number;
  user1Id: number;
  user1Username: string;
  user2Id: number;
  user2Username: string;
  createdAt: string;
  updatedAt: string;
  lastMessageId?: number | null;
  lastMessageContent?: string | null;
  lastMessageSentAt?: string | null;
};

export type Message = {
  id: number;
  content: string;
  sentAt: string;
  userId: number;
  username: string;
  conversationId?: number | null;
  noteId?: number | null;
  selectionStart?: number | null;
  selectionEnd?: number | null;
};

export type SendFriendRequestPayload = {
  username: string;
};

export type CreateConversationPayload = {
  userId: number;
};

export type CreateMessagePayload = {
  content: string;
  conversationId?: number | null;
  noteId?: number | null;
  selectionStart?: number | null;
  selectionEnd?: number | null;
};

export type ShareNotePayload = {
  conversationId: number;
  noteId: number;
};

