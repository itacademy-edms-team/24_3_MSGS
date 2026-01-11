namespace NotesApp.API.Models.Messages
{
    public class MessageDto
    {
        public int Id { get; set; }
        public string Content { get; set; } = string.Empty;
        public DateTime SentAt { get; set; }
        public int UserId { get; set; }
        public string Username { get; set; } = string.Empty;
        public int? ConversationId { get; set; }
        public int? NoteId { get; set; }
        public int? SelectionStart { get; set; }
        public int? SelectionEnd { get; set; }
    }
}

