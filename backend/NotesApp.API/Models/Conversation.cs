using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace NotesApp.API.Models
{
    public class Conversation
    {
        public int Id { get; set; }
        
        // Внешние ключи - чат между двумя пользователями
        public int User1Id { get; set; }
        public int User2Id { get; set; }
        
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        
        // Навигационные свойства
        [ForeignKey("User1Id")]
        public User User1 { get; set; } = null!;
        
        [ForeignKey("User2Id")]
        public User User2 { get; set; } = null!;
        
        public ICollection<Message> Messages { get; set; } = new List<Message>();
    }
}

