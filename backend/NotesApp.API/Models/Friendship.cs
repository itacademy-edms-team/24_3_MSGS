using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace NotesApp.API.Models
{
    public class Friendship
    {
        public int Id { get; set; }
        
        // Внешние ключи
        public int RequesterId { get; set; }
        public int AddresseeId { get; set; }
        
        [Required]
        [MaxLength(20)]
        public string Status { get; set; } = "pending"; // "pending", "accepted", "rejected"
        
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? UpdatedAt { get; set; }
        
        // Навигационные свойства
        [ForeignKey("RequesterId")]
        public User Requester { get; set; } = null!;
        
        [ForeignKey("AddresseeId")]
        public User Addressee { get; set; } = null!;
    }
}

