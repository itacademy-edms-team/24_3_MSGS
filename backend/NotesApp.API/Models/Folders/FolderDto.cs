namespace NotesApp.API.Models.Folders
{
    public class FolderDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public int? ParentId { get; set; }
    }
}

