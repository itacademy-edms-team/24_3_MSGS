using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.Extensions.Options;
using NotesApp.API.Models;
using NotesApp.API.Options;
using NotesApp.API.Services;

namespace NotesApp.API.Tests;

public class JwtTokenServiceTests
{
    [Fact]
    public void GenerateAccessToken_ContainsUserClaims()
    {
        var settings = Microsoft.Extensions.Options.Options.Create(new JwtSettings
        {
            Issuer = "NotesApp",
            Audience = "NotesAppClient",
            SecretKey = "super_secret_test_key_1234567890!@#",
            AccessTokenLifetimeMinutes = 60
        });

        var service = new JwtTokenService(settings);
        var user = new User
        {
            Id = 42,
            Username = "tester",
            Email = "tester@example.com"
        };

        var token = service.GenerateAccessToken(user);
        Assert.False(string.IsNullOrWhiteSpace(token));

        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);

        Assert.Equal("NotesApp", jwt.Issuer);
        Assert.Contains(jwt.Audiences, a => a == "NotesAppClient");
        Assert.Contains(jwt.Claims, c => c.Type == ClaimTypes.NameIdentifier && c.Value == "42");
        Assert.Contains(jwt.Claims, c => c.Type == ClaimTypes.Name && c.Value == "tester");
        Assert.Contains(jwt.Claims, c => c.Type == JwtRegisteredClaimNames.Email && c.Value == "tester@example.com");
    }
}
