using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Options;
using NotesApp.API.Options;

namespace NotesApp.API.Services;

public class SmtpEmailSender : IEmailSender
{
    private readonly SmtpSettings _settings;
    private readonly ILogger<SmtpEmailSender> _logger;

    public SmtpEmailSender(IOptions<SmtpSettings> settings, ILogger<SmtpEmailSender> logger)
    {
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task SendAsync(
        string toEmail,
        string subject,
        string htmlBody,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_settings.FromEmail) || string.IsNullOrWhiteSpace(_settings.AppPassword))
        {
            throw new InvalidOperationException(
                "SMTP не настроен. Укажите Smtp:FromEmail и Smtp:AppPassword в appsettings или переменных окружения.");
        }

        using var message = new MailMessage
        {
            From = new MailAddress(_settings.FromEmail, _settings.FromName),
            Subject = subject,
            Body = htmlBody,
            IsBodyHtml = true
        };
        message.To.Add(toEmail);

        using var client = new SmtpClient(_settings.Host, _settings.Port)
        {
            EnableSsl = _settings.UseSsl,
            Credentials = new NetworkCredential(_settings.FromEmail, _settings.AppPassword)
        };

        try
        {
            await client.SendMailAsync(message, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Не удалось отправить письмо на {Email}", toEmail);
            throw new InvalidOperationException("Не удалось отправить письмо. Проверьте настройки SMTP.", ex);
        }
    }
}
