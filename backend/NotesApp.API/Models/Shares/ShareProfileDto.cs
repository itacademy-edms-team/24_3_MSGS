namespace NotesApp.API.Models.Shares
{
    public class ShareProfileDto
    {
        public List<ReceivedShareDto> Received { get; set; } = new();
        public List<SentShareGroupDto> Sent { get; set; } = new();
    }

    public class ReceivedShareDto
    {
        public int ShareId { get; set; }
        public int NoteId { get; set; }
        public string NoteTitle { get; set; } = string.Empty;
        public string OwnerUsername { get; set; } = string.Empty;
        public string Permission { get; set; } = "read";
        public DateTime SharedAt { get; set; }
    }

    public class SentShareGroupDto
    {
        public int NoteId { get; set; }
        public string NoteTitle { get; set; } = string.Empty;
        public List<ShareRecipientDto> Recipients { get; set; } = new();
    }

    public class ShareRecipientDto
    {
        public int ShareId { get; set; }
        public int UserId { get; set; }
        public string Username { get; set; } = string.Empty;
        public string Permission { get; set; } = "read";
        public DateTime SharedAt { get; set; }
    }
}
