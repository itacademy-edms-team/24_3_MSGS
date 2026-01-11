namespace NotesApp.API.Models.Conversations
{
    public class ConversationDto
    {
        public int Id { get; set; }
        public int User1Id { get; set; }
        public string User1Username { get; set; } = string.Empty;
        public int User2Id { get; set; }
        public string User2Username { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public int? LastMessageId { get; set; }
        public string? LastMessageContent { get; set; }
        public DateTime? LastMessageSentAt { get; set; }
    }
}

