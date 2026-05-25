namespace NotesApp.API.Models.Auth;

public class PasswordResetStatusDto
{
    public bool EmailConfirmed { get; set; }
    public bool CanResend { get; set; }
    public int? ResendAvailableInSeconds { get; set; }
    public int ProtectedNotesCount { get; set; }
    public int ProtectedFoldersCount { get; set; }
}
