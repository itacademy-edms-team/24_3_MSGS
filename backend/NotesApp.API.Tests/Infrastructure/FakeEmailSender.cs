using System.Text.RegularExpressions;
using NotesApp.API.Services;

namespace NotesApp.API.Tests.Infrastructure;

public sealed class FakeEmailSender : IEmailSender
{
    private readonly List<SentEmail> _sent = [];

    public IReadOnlyList<SentEmail> Sent => _sent;

    public Task SendAsync(
        string toEmail,
        string subject,
        string htmlBody,
        CancellationToken cancellationToken = default)
    {
        _sent.Add(new SentEmail(toEmail, subject, htmlBody));
        return Task.CompletedTask;
    }

    public string? ExtractLastCode()
    {
        var body = _sent.LastOrDefault()?.HtmlBody;
        if (string.IsNullOrEmpty(body))
        {
            return null;
        }

        var match = Regex.Match(body, @"letter-spacing:6px;"">(\d{6})</p>");
        return match.Success ? match.Groups[1].Value : null;
    }

    public void Clear() => _sent.Clear();

    public sealed record SentEmail(string ToEmail, string Subject, string HtmlBody);
}
