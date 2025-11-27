using Microsoft.AspNetCore.Mvc.ModelBinding.Validation;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

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
        [JsonIgnore]
        [ValidateNever]
        public User? User { get; set; }
        
        [ForeignKey("FolderId")]
        [JsonIgnore]
        [ValidateNever]
        public Folder? Folder { get; set; }
        
        [JsonIgnore]
        [ValidateNever]
        public ICollection<NoteShare> Shares { get; set; } = new List<NoteShare>();
        
        [JsonIgnore]
        [ValidateNever]
        public ICollection<Message> Messages { get; set; } = new List<Message>();
    }
}
