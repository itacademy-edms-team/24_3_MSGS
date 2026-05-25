namespace NotesApp.API.Models.Auth;

public class PasswordResetResultDto
{
    public string Message { get; set; } = string.Empty;
    public int NotesReset { get; set; }
    public int FoldersReset { get; set; }
}
