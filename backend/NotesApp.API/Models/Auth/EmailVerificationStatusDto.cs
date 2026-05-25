namespace NotesApp.API.Models.Auth;

public class EmailVerificationStatusDto
{
    public bool EmailConfirmed { get; set; }
    public string Email { get; set; } = string.Empty;
    public bool CanResend { get; set; }
    public int? ResendAvailableInSeconds { get; set; }
}
