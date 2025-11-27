using System.ComponentModel.DataAnnotations;

namespace NotesApp.API.Models.Folders
{
    public class UpdateFolderDto
    {
        [Required]
        [MaxLength(100)]
        public string Name { get; set; } = string.Empty;

        public int? ParentId { get; set; }
    }
}

