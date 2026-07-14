using System.Net;
using System.Net.Http.Json;
using NotesApp.API.Models;
using NotesApp.API.Models.Auth;
using NotesApp.API.Tests.Infrastructure;

namespace NotesApp.API.Tests;

public class UsersControllerTests : IClassFixture<NotesApiFixture>
{
    private readonly HttpClient _client;

    public UsersControllerTests(NotesApiFixture fixture)
    {
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task Register_ReturnsTokenAndUser()
    {
        var (token, auth) = await _client.RegisterUserAsync("alice", "alice@example.com");

        Assert.False(string.IsNullOrWhiteSpace(token));
        Assert.Equal("alice", auth.User.Username);
        Assert.Equal("alice@example.com", auth.User.Email);
        Assert.False(auth.User.EmailConfirmed);
    }

    [Fact]
    public async Task Register_DuplicateUsername_ReturnsConflict()
    {
        await _client.RegisterUserAsync("bob", "bob1@example.com");

        var response = await _client.PostAsJsonAsync("/api/users/register", new RegisterUserDto
        {
            Username = "bob",
            Email = "bob2@example.com",
            Password = "Password123"
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Register_DuplicateEmail_ReturnsConflict()
    {
        await _client.RegisterUserAsync("carol", "carol@example.com");

        var response = await _client.PostAsJsonAsync("/api/users/register", new RegisterUserDto
        {
            Username = "carol2",
            Email = "carol@example.com",
            Password = "Password123"
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Login_ValidCredentials_ReturnsToken()
    {
        await _client.RegisterUserAsync("dave", "dave@example.com", "Secret123");

        var response = await _client.PostAsJsonAsync("/api/users/login", new LoginRequestDto
        {
            Email = "dave@example.com",
            Password = "Secret123"
        });

        response.EnsureSuccessStatusCode();
        var auth = await response.Content.ReadFromJsonAsync<AuthResponseDto>();
        Assert.NotNull(auth);
        Assert.Equal("dave", auth!.User.Username);
    }

    [Fact]
    public async Task Login_InvalidPassword_ReturnsUnauthorized()
    {
        await _client.RegisterUserAsync("erin", "erin@example.com");

        var response = await _client.PostAsJsonAsync("/api/users/login", new LoginRequestDto
        {
            Email = "erin@example.com",
            Password = "WrongPassword"
        });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetMe_WithoutToken_ReturnsUnauthorized()
    {
        var response = await _client.GetAsync("/api/users/me");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetMe_WithToken_ReturnsCurrentUser()
    {
        var (token, auth) = await _client.RegisterUserAsync("frank", "frank@example.com");
        _client.SetBearerToken(token);

        var response = await _client.GetAsync("/api/users/me");
        response.EnsureSuccessStatusCode();

        var user = await response.Content.ReadFromJsonAsync<UserDto>();
        Assert.NotNull(user);
        Assert.Equal(auth.User.Id, user!.Id);
        Assert.Equal("frank", user.Username);
    }
}
