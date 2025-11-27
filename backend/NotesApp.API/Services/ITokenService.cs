using NotesApp.API.Models;

namespace NotesApp.API.Services
{
    public interface ITokenService
    {
        string GenerateAccessToken(User user);
    }
}

