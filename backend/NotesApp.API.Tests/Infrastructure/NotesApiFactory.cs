using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using NotesApp.API.Data;
using NotesApp.API.Models.Auth;
using NotesApp.API.Services;

namespace NotesApp.API.Tests.Infrastructure;

public sealed class NotesApiFactory : WebApplicationFactory<Program>
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly FakeEmailSender _emailSender = new();
    private bool _initialized;

    public FakeEmailSender EmailSender => _emailSender;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<DbContextOptions<NotesDbContext>>();
            services.RemoveAll<NotesDbContext>();
            services.RemoveAll<IEmailSender>();

            services.AddDbContext<NotesDbContext>(options => options.UseSqlite(_connection));
            services.AddSingleton(_emailSender);
            services.AddSingleton<IEmailSender>(_emailSender);
        });
    }

    public async Task EnsureInitializedAsync()
    {
        if (_initialized)
        {
            return;
        }

        await _connection.OpenAsync();
        _ = Server;

        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<NotesDbContext>();
        await db.Database.EnsureCreatedAsync();
        _initialized = true;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _connection.Close();
            _connection.Dispose();
        }

        base.Dispose(disposing);
    }
}

public static class HttpTestClientExtensions
{
    public static async Task<(string Token, AuthResponseDto Auth)> RegisterUserAsync(
        this HttpClient client,
        string username,
        string email,
        string password = "Password123")
    {
        var response = await client.PostAsJsonAsync("/api/users/register", new RegisterUserDto
        {
            Username = username,
            Email = email,
            Password = password
        });

        response.EnsureSuccessStatusCode();
        var auth = await response.Content.ReadFromJsonAsync<AuthResponseDto>()
            ?? throw new InvalidOperationException("Пустой ответ регистрации");

        return (auth.Token, auth);
    }

    public static void SetBearerToken(this HttpClient client, string token)
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
    }

    public static string HashPassword(string password)
    {
        using var sha256 = SHA256.Create();
        var hashedBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(password));
        return BitConverter.ToString(hashedBytes).Replace("-", "").ToLowerInvariant();
    }
}
