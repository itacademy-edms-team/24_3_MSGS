using System.ComponentModel.DataAnnotations.Schema;

namespace NotesApp.API.Models;

/// <summary>
/// До какого сообщения пользователь прочитал чат (непрочитанные = сообщения с Id больше LastReadMessageId).
/// </summary>
public class ConversationReadState
{
    public int UserId { get; set; }
    public int ConversationId { get; set; }
    public int LastReadMessageId { get; set; }

    [ForeignKey("UserId")]
    public User User { get; set; } = null!;

    [ForeignKey("ConversationId")]
    public Conversation Conversation { get; set; } = null!;
}
