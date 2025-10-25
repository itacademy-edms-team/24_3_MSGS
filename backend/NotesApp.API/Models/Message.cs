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
        public int NoteId { get; set; }
        
        // Навигационные свойства
        [ForeignKey("UserId")]
        public User User { get; set; } = null!;
        
        [ForeignKey("NoteId")]
        public Note Note { get; set; } = null!;
    }
}
