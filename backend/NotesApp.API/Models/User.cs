using System.ComponentModel.DataAnnotations;

namespace NotesApp.API.Models
{
    public class User
    {
        public int Id { get; set; }
        
        [Required]
        [MaxLength(100)]
        public string Username { get; set; } = string.Empty;
        
        [Required]
        [EmailAddress]
        [MaxLength(255)]
        public string Email { get; set; } = string.Empty;
        
        [Required]
        public string PasswordHash { get; set; } = string.Empty;
        
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        
        public DateTime? LastLoginAt { get; set; }
        
        // Навигационные свойства
        public ICollection<Note> Notes { get; set; } = new List<Note>();
        public ICollection<Folder> Folders { get; set; } = new List<Folder>();
        public ICollection<NoteShare> SharedNotes { get; set; } = new List<NoteShare>();
        public ICollection<Message> Messages { get; set; } = new List<Message>();
    }
}
