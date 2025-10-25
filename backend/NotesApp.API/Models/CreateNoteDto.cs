using System.ComponentModel.DataAnnotations;

namespace NotesApp.API.Models
{
    public class CreateNoteDto
    {
        [Required]
        [MaxLength(200)]
        public string Title { get; set; } = string.Empty;
        
        [Required]
        public string Content { get; set; } = string.Empty;
        
        [Required]
        public int UserId { get; set; }
        
        public int? FolderId { get; set; }
    }
}
