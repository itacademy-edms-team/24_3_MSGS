using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace NotesApp.API.Models
{
    public class Message
    {
        public int Id { get; set; }
        
        [Required]
        public string Content { get; set; } = string.Empty;
        
        public DateTime SentAt { get; set; } = DateTime.UtcNow;
        
        // Внешние ключи
        public int UserId { get; set; }
        
        // ConversationId - для сообщений в чате между пользователями
        public int? ConversationId { get; set; }
        
        // NoteId - для комментариев к заметкам (опционально)
        public int? NoteId { get; set; }
        
        // Поля для комментариев к конкретной части заметки
        // Если указаны, то это комментарий к выделенному тексту
        public int? SelectionStart { get; set; }
        public int? SelectionEnd { get; set; }
        
        // Навигационные свойства
        [ForeignKey("UserId")]
        public User User { get; set; } = null!;
        
        [ForeignKey("ConversationId")]
        public Conversation? Conversation { get; set; }
        
        [ForeignKey("NoteId")]
        public Note? Note { get; set; }
    }
}
