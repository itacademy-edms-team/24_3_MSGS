using System.Net;
using System.Net.Http.Json;
using NotesApp.API.Models;
using NotesApp.API.Models.Folders;
using NotesApp.API.Tests.Infrastructure;

namespace NotesApp.API.Tests;

public class NotesControllerTests : IClassFixture<NotesApiFixture>
{
    private readonly HttpClient _client;

    public NotesControllerTests(NotesApiFixture fixture)
    {
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task CreateAndGetNote_WorksForOwner()
    {
        var (token, _) = await _client.RegisterUserAsync("note_user", "note@example.com");
        _client.SetBearerToken(token);

        var createResponse = await _client.PostAsJsonAsync("/api/notes", new CreateNoteDto
        {
            Title = "Моя заметка",
            Content = "Текст",
            UserId = 0
        });

        createResponse.EnsureSuccessStatusCode();
        var created = await createResponse.Content.ReadFromJsonAsync<Note>();
        Assert.NotNull(created);
        Assert.Equal("Моя заметка", created!.Title);

        var getResponse = await _client.GetAsync($"/api/notes/{created.Id}");
        getResponse.EnsureSuccessStatusCode();
        var fetched = await getResponse.Content.ReadFromJsonAsync<Note>();
        Assert.Equal("Текст", fetched!.Content);
        Assert.True(fetched.CanEdit);
    }

    [Fact]
    public async Task GetNotes_ReturnsOnlyAccessibleNotes()
    {
        var (tokenA, authA) = await _client.RegisterUserAsync("owner", "owner@example.com");
        _client.SetBearerToken(tokenA);
        await _client.PostAsJsonAsync("/api/notes", new CreateNoteDto
        {
            Title = "Приватная",
            Content = "секрет",
            UserId = 0
        });

        var (tokenB, _) = await _client.RegisterUserAsync("stranger", "stranger@example.com");
        _client.SetBearerToken(tokenB);

        var listResponse = await _client.GetAsync("/api/notes");
        listResponse.EnsureSuccessStatusCode();
        var notes = await listResponse.Content.ReadFromJsonAsync<List<Note>>();

        Assert.NotNull(notes);
        Assert.Empty(notes!);
        Assert.True(authA.User.Id > 0);
    }

    [Fact]
    public async Task GetNote_OtherUsersNote_ReturnsForbidden()
    {
        var (tokenA, _) = await _client.RegisterUserAsync("owner2", "owner2@example.com");
        _client.SetBearerToken(tokenA);

        var createResponse = await _client.PostAsJsonAsync("/api/notes", new CreateNoteDto
        {
            Title = "Чужая",
            Content = "нельзя",
            UserId = 0
        });
        var created = await createResponse.Content.ReadFromJsonAsync<Note>();

        var (tokenB, _) = await _client.RegisterUserAsync("intruder", "intruder@example.com");
        _client.SetBearerToken(tokenB);

        var response = await _client.GetAsync($"/api/notes/{created!.Id}");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task DeleteNote_RemovesNote()
    {
        var (token, _) = await _client.RegisterUserAsync("deleter", "deleter@example.com");
        _client.SetBearerToken(token);

        var createResponse = await _client.PostAsJsonAsync("/api/notes", new CreateNoteDto
        {
            Title = "На удаление",
            Content = "",
            UserId = 0
        });
        var created = await createResponse.Content.ReadFromJsonAsync<Note>();

        var deleteResponse = await _client.DeleteAsync($"/api/notes/{created!.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);

        var getResponse = await _client.GetAsync($"/api/notes/{created.Id}");
        Assert.Equal(HttpStatusCode.NotFound, getResponse.StatusCode);
    }
}

public class FoldersControllerTests : IClassFixture<NotesApiFixture>
{
    private readonly HttpClient _client;

    public FoldersControllerTests(NotesApiFixture fixture)
    {
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task CreateAndListFolders_Works()
    {
        var (token, _) = await _client.RegisterUserAsync("folder_user", "folder@example.com");
        _client.SetBearerToken(token);

        var createResponse = await _client.PostAsJsonAsync("/api/folders", new CreateFolderDto
        {
            Name = "Работа"
        });
        createResponse.EnsureSuccessStatusCode();

        var listResponse = await _client.GetAsync("/api/folders");
        listResponse.EnsureSuccessStatusCode();
        var folders = await listResponse.Content.ReadFromJsonAsync<List<FolderDto>>();

        Assert.NotNull(folders);
        Assert.Single(folders!);
        Assert.Equal("Работа", folders![0].Name);
    }
}
