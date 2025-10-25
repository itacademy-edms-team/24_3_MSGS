using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace NotesApp.API.Models
{
    public class NoteShare
    {
        public int Id { get; set; }
        
        // Внешние ключи
        public int NoteId { get; set; }
        public int UserId { get; set; }
        
        [Required]
        [MaxLength(20)]
        public string Permission { get; set; } = "read"; // "read" или "write"
        
        public DateTime SharedAt { get; set; } = DateTime.UtcNow;
        
        // Навигационные свойства
        [ForeignKey("NoteId")]
        public Note Note { get; set; } = null!;
        
        [ForeignKey("UserId")]
        public User User { get; set; } = null!;
    }
}
