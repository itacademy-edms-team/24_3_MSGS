using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using NotesApp.API.Configuration;
using NotesApp.API.Data;
using NotesApp.API.Hubs;
using NotesApp.API.Options;
using NotesApp.API.Services;
using System.Text;
using System.Text.Json;

var contentRoot = Directory.GetCurrentDirectory();
EnvFileLoader.Load(contentRoot);

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);

// Add services to the container.
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
        options.JsonSerializerOptions.WriteIndented = true;
    });
builder.Services.AddEndpointsApiExplorer();

builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo { Title = "NotesApp API", Version = "v1" });
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        In = ParameterLocation.Header,
        Description = "Введите только JWT токен, префикс Bearer добавится автоматически",
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "Bearer",
        BearerFormat = "JWT"
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

// Добавляем Entity Framework с PostgreSQL (в тестах провайдер подменяется в WebApplicationFactory)
if (!builder.Environment.IsEnvironment("Testing"))
{
    builder.Services.AddDbContext<NotesDbContext>(options =>
        options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));
}

var jwtSection = builder.Configuration.GetSection("Jwt");
builder.Services.Configure<JwtSettings>(jwtSection);
builder.Services.Configure<SmtpSettings>(builder.Configuration.GetSection("Smtp"));
var jwtSettings = jwtSection.Get<JwtSettings>() ?? throw new InvalidOperationException("Jwt настройки не найдены");

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
}).AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = jwtSettings.Issuer,
        ValidateAudience = true,
        ValidAudience = jwtSettings.Audience,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings.SecretKey)),
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromMinutes(1)
    };
    // SignalR подключается по WebSocket — токен передаём в query string
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) &&
                (path.StartsWithSegments("/hubs/chat") || path.StartsWithSegments("/hubs/notes-collab")))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        }
    };
});

builder.Services.AddScoped<ITokenService, JwtTokenService>();
builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();
builder.Services.AddSignalR()
    .AddJsonProtocol(options =>
    {
        options.PayloadSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    });

// Добавляем CORS для фронтенда
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(
                "http://localhost:3000",
                "http://localhost:5173",
                "https://localhost:5173",
                "http://localhost:8080")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials(); // нужно для SignalR negotiate (credentials: 'include')
    });
});

var app = builder.Build();

// Создать таблицу ConversationReadStates, если её нет (миграция могла не примениться без psql)
if (!app.Environment.IsEnvironment("Testing"))
{
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<NotesDbContext>();
    try
    {
        await db.Database.MigrateAsync();

        await db.Database.ExecuteSqlRawAsync(@"
CREATE TABLE IF NOT EXISTS ""ConversationReadStates"" (
    ""UserId"" integer NOT NULL,
    ""ConversationId"" integer NOT NULL,
    ""LastReadMessageId"" integer NOT NULL,
    CONSTRAINT ""PK_ConversationReadStates"" PRIMARY KEY (""UserId"", ""ConversationId""),
    CONSTRAINT ""FK_ConversationReadStates_Conversations_ConversationId"" FOREIGN KEY (""ConversationId"") REFERENCES ""Conversations"" (""Id"") ON DELETE CASCADE,
    CONSTRAINT ""FK_ConversationReadStates_Users_UserId"" FOREIGN KEY (""UserId"") REFERENCES ""Users"" (""Id"") ON DELETE CASCADE
);
");
        await db.Database.ExecuteSqlRawAsync(@"CREATE INDEX IF NOT EXISTS ""IX_ConversationReadStates_ConversationId"" ON ""ConversationReadStates"" (""ConversationId"");");
        await db.Database.ExecuteSqlRawAsync(@"
INSERT INTO ""__EFMigrationsHistory"" (""MigrationId"", ""ProductVersion"")
VALUES ('20260224170000_AddConversationReadState', '9.0.10')
ON CONFLICT (""MigrationId"") DO NOTHING;
");
        await db.Database.ExecuteSqlRawAsync(@"ALTER TABLE ""Notes"" ADD COLUMN IF NOT EXISTS ""PasswordHash"" text;");
        await db.Database.ExecuteSqlRawAsync(@"ALTER TABLE ""Folders"" ADD COLUMN IF NOT EXISTS ""PasswordHash"" text;");
        await db.Database.ExecuteSqlRawAsync(@"ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""EmailConfirmed"" boolean NOT NULL DEFAULT false;");
        await db.Database.ExecuteSqlRawAsync(@"ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""EmailVerificationCodeHash"" text;");
        await db.Database.ExecuteSqlRawAsync(@"ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""EmailVerificationExpiresAt"" timestamp with time zone;");
        await db.Database.ExecuteSqlRawAsync(@"ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""EmailVerificationSentAt"" timestamp with time zone;");
        await db.Database.ExecuteSqlRawAsync(@"ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""PasswordResetCodeHash"" text;");
        await db.Database.ExecuteSqlRawAsync(@"ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""PasswordResetExpiresAt"" timestamp with time zone;");
        await db.Database.ExecuteSqlRawAsync(@"ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""PasswordResetSentAt"" timestamp with time zone;");
    }
    catch (Exception ex)
    {
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
        logger.LogWarning(ex, "EnsureConversationReadStates: {Message}", ex.Message);
    }
}
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// UseHttpsRedirection отключаем в разработке: иначе запросы к http:// перенаправляются на https://,
// что может ломать negotiate SignalR. Для реального времени чата подключайтесь к тому же URL, что и API.
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}
app.UseCors("AllowFrontend");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<ChatHub>("/hubs/chat");
app.MapHub<NotesCollabHub>("/hubs/notes-collab");

app.Run();

public partial class Program { }
