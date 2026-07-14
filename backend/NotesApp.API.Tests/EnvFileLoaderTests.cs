using NotesApp.API.Configuration;

namespace NotesApp.API.Tests;

public class EnvFileLoaderTests
{
    [Fact]
    public async Task Load_ParsesKeyValuePairsAndIgnoresComments()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), "notesapp-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);

        try
        {
            var envPath = Path.Combine(tempDir, ".env");
            await File.WriteAllTextAsync(envPath, """
                # comment
                Smtp__FromEmail=test@example.com
                export Smtp__AppPassword=secret
                """);

            var originalEmail = Environment.GetEnvironmentVariable("Smtp__FromEmail");
            var originalPassword = Environment.GetEnvironmentVariable("Smtp__AppPassword");

            try
            {
                EnvFileLoader.Load(tempDir);

                Assert.Equal("test@example.com", Environment.GetEnvironmentVariable("Smtp__FromEmail"));
                Assert.Equal("secret", Environment.GetEnvironmentVariable("Smtp__AppPassword"));
            }
            finally
            {
                Environment.SetEnvironmentVariable("Smtp__FromEmail", originalEmail);
                Environment.SetEnvironmentVariable("Smtp__AppPassword", originalPassword);
            }
        }
        finally
        {
            if (Directory.Exists(tempDir))
            {
                Directory.Delete(tempDir, recursive: true);
            }
        }
    }
}
