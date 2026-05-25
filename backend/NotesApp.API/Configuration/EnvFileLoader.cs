namespace NotesApp.API.Configuration;

/// <summary>
/// Загружает переменные из локального .env до старта конфигурации ASP.NET Core.
/// Формат: KEY=value, вложенные ключи — через двойное подчёркивание (Smtp__AppPassword).
/// </summary>
public static class EnvFileLoader
{
    public static void Load(string contentRootPath)
    {
        var candidates = new[]
        {
            Path.Combine(contentRootPath, ".env"),
            Path.Combine(contentRootPath, "..", "..", ".env")
        };

        foreach (var path in candidates)
        {
            var fullPath = Path.GetFullPath(path);
            if (!File.Exists(fullPath))
            {
                continue;
            }

            foreach (var line in File.ReadAllLines(fullPath))
            {
                ApplyLine(line);
            }
        }
    }

    private static void ApplyLine(string line)
    {
        var trimmed = line.Trim();
        if (trimmed.Length == 0 || trimmed.StartsWith('#'))
        {
            return;
        }

        if (trimmed.StartsWith("export ", StringComparison.OrdinalIgnoreCase))
        {
            trimmed = trimmed[7..].TrimStart();
        }

        var separator = trimmed.IndexOf('=');
        if (separator <= 0)
        {
            return;
        }

        var key = trimmed[..separator].Trim();
        var value = trimmed[(separator + 1)..].Trim();

        if ((value.StartsWith('"') && value.EndsWith('"')) ||
            (value.StartsWith('\'') && value.EndsWith('\'')))
        {
            value = value[1..^1];
        }

        if (!string.IsNullOrEmpty(key))
        {
            Environment.SetEnvironmentVariable(key, value);
        }
    }
}
