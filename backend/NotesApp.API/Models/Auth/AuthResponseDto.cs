namespace NotesApp.API.Models.Auth
{
    public class AuthResponseDto
    {
        public string Token { get; set; } = string.Empty;
        public UserDto User { get; set; } = new();
    }
}

