using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace NotesApp.API.Models
{
    public class Note
    {
        public int Id { get; set; }
        
        [Required]
        [MaxLength(200)]
        public string Title { get; set; } = string.Empty;
        
        [Required]
        public string Content { get; set; } = string.Empty;
        
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        
        // Внешние ключи
        public int UserId { get; set; }
        public int? FolderId { get; set; }
        
        // Навигационные свойства
        [ForeignKey("UserId")]
        public User User { get; set; } = null!;
        
        [ForeignKey("FolderId")]
        public Folder? Folder { get; set; }
        
        public ICollection<NoteShare> Shares { get; set; } = new List<NoteShare>();
        public ICollection<Message> Messages { get; set; } = new List<Message>();
    }
}
