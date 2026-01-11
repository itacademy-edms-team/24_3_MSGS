namespace NotesApp.API.Models.Friendships
{
    public class FriendshipDto
    {
        public int Id { get; set; }
        public int RequesterId { get; set; }
        public string RequesterUsername { get; set; } = string.Empty;
        public int AddresseeId { get; set; }
        public string AddresseeUsername { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }
}

