/** Нормализует сообщение с бэкенда (PascalCase или camelCase) в тип Message */
export function normalizeMessage(msg) {
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
