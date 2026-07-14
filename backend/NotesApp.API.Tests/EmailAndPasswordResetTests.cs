using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using NotesApp.API.Data;
using NotesApp.API.Models;
using NotesApp.API.Models.Auth;
using NotesApp.API.Models.Folders;
using NotesApp.API.Tests.Infrastructure;

namespace NotesApp.API.Tests;

public class EmailVerificationTests : IClassFixture<NotesApiFixture>
{
    private readonly NotesApiFactory _factory;
    private readonly HttpClient _client;

    public EmailVerificationTests(NotesApiFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task SendAndConfirmEmail_ConfirmsUser()
    {
        var (token, auth) = await _client.RegisterUserAsync("email_user", "email_user@example.com");
        _client.SetBearerToken(token);

        var sendResponse = await _client.PostAsync("/api/users/me/email/send-code", null);
        sendResponse.EnsureSuccessStatusCode();
        Assert.Single(_factory.EmailSender.Sent);

        var code = _factory.EmailSender.ExtractLastCode();
        Assert.NotNull(code);
        Assert.Matches(@"^\d{6}$", code!);

        var confirmResponse = await _client.PostAsJsonAsync("/api/users/me/email/confirm", new ConfirmEmailDto
        {
            Code = code!
        });
        confirmResponse.EnsureSuccessStatusCode();

        var user = await confirmResponse.Content.ReadFromJsonAsync<UserDto>();
        Assert.True(user!.EmailConfirmed);

        var meResponse = await _client.GetAsync("/api/users/me");
        var me = await meResponse.Content.ReadFromJsonAsync<UserDto>();
        Assert.True(me!.EmailConfirmed);
        Assert.Equal(auth.User.Id, me.Id);
    }

    [Fact]
    public async Task ConfirmEmail_WrongCode_ReturnsBadRequest()
    {
        var (token, _) = await _client.RegisterUserAsync("wrong_code", "wrong_code@example.com");
        _client.SetBearerToken(token);

        await _client.PostAsync("/api/users/me/email/send-code", null);

        var response = await _client.PostAsJsonAsync("/api/users/me/email/confirm", new ConfirmEmailDto
        {
            Code = "000000"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task SendEmailCode_WhenAlreadyConfirmed_ReturnsBadRequest()
    {
        var (token, _) = await _client.RegisterUserAsync("confirmed", "confirmed@example.com");
        _client.SetBearerToken(token);

        await _client.PostAsync("/api/users/me/email/send-code", null);
        var code = _factory.EmailSender.ExtractLastCode();
        await _client.PostAsJsonAsync("/api/users/me/email/confirm", new ConfirmEmailDto { Code = code! });

        var secondSend = await _client.PostAsync("/api/users/me/email/send-code", null);
        Assert.Equal(HttpStatusCode.BadRequest, secondSend.StatusCode);
    }
}

public class PasswordResetTests : IClassFixture<NotesApiFixture>
{
    private readonly NotesApiFactory _factory;
    private readonly HttpClient _client;

    public PasswordResetTests(NotesApiFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task PasswordReset_WithoutConfirmedEmail_ReturnsBadRequest()
    {
        var (token, _) = await _client.RegisterUserAsync("unconfirmed", "unconfirmed@example.com");
        _client.SetBearerToken(token);

        var response = await _client.PostAsync("/api/users/me/password-reset/send-code", null);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task PasswordReset_ClearsNoteAndFolderPasswords()
    {
        var (token, auth) = await _client.RegisterUserAsync("reset_user", "reset_user@example.com");
        _client.SetBearerToken(token);

        await ConfirmEmailAsync();

        await _client.PostAsJsonAsync("/api/notes", new CreateNoteDto
        {
            Title = "Защищённая",
            Content = "x",
            UserId = 0,
            Password = "note1234"
        });

        await _client.PostAsJsonAsync("/api/folders", new CreateFolderDto
        {
            Name = "Защищённая папка",
            Password = "fold1234"
        });

        var statusBefore = await _client.GetFromJsonAsync<PasswordResetStatusDto>("/api/users/me/password-reset/status");
        Assert.Equal(1, statusBefore!.ProtectedNotesCount);
        Assert.Equal(1, statusBefore.ProtectedFoldersCount);

        _factory.EmailSender.Clear();
        var sendResponse = await _client.PostAsync("/api/users/me/password-reset/send-code", null);
        sendResponse.EnsureSuccessStatusCode();

        var code = _factory.EmailSender.ExtractLastCode();
        Assert.NotNull(code);

        var confirmResponse = await _client.PostAsJsonAsync(
            "/api/users/me/password-reset/confirm",
            new ConfirmEmailDto { Code = code! });
        confirmResponse.EnsureSuccessStatusCode();

        var result = await confirmResponse.Content.ReadFromJsonAsync<PasswordResetResultDto>();
        Assert.Equal(1, result!.NotesReset);
        Assert.Equal(1, result.FoldersReset);

        var statusAfter = await _client.GetFromJsonAsync<PasswordResetStatusDto>("/api/users/me/password-reset/status");
        Assert.Equal(0, statusAfter!.ProtectedNotesCount);
        Assert.Equal(0, statusAfter.ProtectedFoldersCount);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<NotesDbContext>();
        var note = await db.Notes.FirstAsync(n => n.UserId == auth.User.Id);
        var folder = await db.Folders.FirstAsync(f => f.UserId == auth.User.Id);
        Assert.Null(note.PasswordHash);
        Assert.Null(folder.PasswordHash);
    }

    private async Task ConfirmEmailAsync()
    {
        await _client.PostAsync("/api/users/me/email/send-code", null);
        var code = _factory.EmailSender.ExtractLastCode();
        await _client.PostAsJsonAsync("/api/users/me/email/confirm", new ConfirmEmailDto { Code = code! });
    }
}
