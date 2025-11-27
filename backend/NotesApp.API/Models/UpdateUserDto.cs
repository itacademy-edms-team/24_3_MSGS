using System.ComponentModel.DataAnnotations;

namespace NotesApp.API.Models
{
    public class UpdateUserDto
    {
        [Required]
        public string Username { get; set; } = string.Empty;

        [Required]
        [EmailAddress]
        public string Email { get; set; } = string.Empty;

        [MinLength(6)]
        [MaxLength(100)]
        public string? Password { get; set; }
    }
}

