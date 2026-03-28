import type { Message } from "../types";

/** Нормализует сообщение с бэкенда (PascalCase или camelCase) в тип Message */
export function normalizeMessage(msg: Record<string, unknown>): Message {
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
