using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace NotesApp.API.Models
{
    public class Folder
    {
        public int Id { get; set; }
        
        [Required]
        [MaxLength(100)]
        public string Name { get; set; } = string.Empty;
        
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        
        // Внешние ключи
        public int UserId { get; set; }
        public int? ParentId { get; set; }
        
        // Навигационные свойства
        [ForeignKey("UserId")]
        public User User { get; set; } = null!;
        
        [ForeignKey("ParentId")]
        public Folder? Parent { get; set; }
        
        public ICollection<Folder> Subfolders { get; set; } = new List<Folder>();
        public ICollection<Note> Notes { get; set; } = new List<Note>();
    }
}
