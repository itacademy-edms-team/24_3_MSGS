using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NotesApp.API.Data;
using NotesApp.API.Models;
using NotesApp.API.Models.Auth;
using NotesApp.API.Services;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace NotesApp.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class UsersController : ControllerBase
    {
        private const int VerificationCodeLifetimeMinutes = 15;
        private const int ResendCooldownSeconds = 60;

        private readonly NotesDbContext _context;
        private readonly ITokenService _tokenService;
        private readonly IEmailSender _emailSender;
        private readonly ILogger<UsersController> _logger;

        public UsersController(
            NotesDbContext context,
            ITokenService tokenService,
            IEmailSender emailSender,
            ILogger<UsersController> logger)
        {
            _context = context;
            _tokenService = tokenService;
            _emailSender = emailSender;
            _logger = logger;
        }

        [AllowAnonymous]
        [HttpPost("register")]
        public async Task<ActionResult<AuthResponseDto>> Register(RegisterUserDto registerDto)
        {
            if (await _context.Users.AnyAsync(u => u.Username == registerDto.Username))
            {
                return Conflict($"Имя пользователя {registerDto.Username} уже занято");
            }

            if (await _context.Users.AnyAsync(u => u.Email == registerDto.Email))
            {
                return Conflict($"Email {registerDto.Email} уже используется");
            }

            var user = new User
            {
                Username = registerDto.Username,
                Email = registerDto.Email,
                PasswordHash = HashPassword(registerDto.Password),
                CreatedAt = DateTime.UtcNow
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            var token = _tokenService.GenerateAccessToken(user);
            return Ok(new AuthResponseDto
            {
                Token = token,
                User = ToUserDto(user)
            });
        }

        [AllowAnonymous]
        [HttpPost("login")]
        public async Task<ActionResult<AuthResponseDto>> Login(LoginRequestDto loginDto)
        {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == loginDto.Email);
            if (user == null || !VerifyPassword(loginDto.Password, user.PasswordHash))
            {
                return Unauthorized("Неверный email или пароль");
            }

            user.LastLoginAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            var token = _tokenService.GenerateAccessToken(user);
            return Ok(new AuthResponseDto
            {
                Token = token,
                User = ToUserDto(user)
            });
        }

        // GET: api/users
        [HttpGet]
        public async Task<ActionResult<IEnumerable<UserDto>>> GetUsers()
        {
            return await _context.Users
                .AsNoTracking()
                .Select(u => ToUserDto(u))
                .ToListAsync();
        }

        [HttpGet("me")]
        public async Task<ActionResult<UserDto>> GetCurrentUser()
        {
            var userId = GetCurrentUserId();
            var user = await _context.Users.FindAsync(userId);

            if (user == null)
            {
                return NotFound();
            }

            return ToUserDto(user);
        }

        [HttpGet("me/email/status")]
        public async Task<ActionResult<EmailVerificationStatusDto>> GetEmailVerificationStatus()
        {
            var user = await _context.Users.FindAsync(GetCurrentUserId());
            if (user == null)
            {
                return NotFound();
            }

            return BuildEmailStatus(user);
        }

        [HttpPost("me/email/send-code")]
        public async Task<IActionResult> SendEmailVerificationCode()
        {
            var user = await _context.Users.FindAsync(GetCurrentUserId());
            if (user == null)
            {
                return NotFound();
            }

            if (user.EmailConfirmed)
            {
                return BadRequest("Email уже подтверждён");
            }

            if (user.EmailVerificationSentAt.HasValue)
            {
                var elapsed = DateTime.UtcNow - user.EmailVerificationSentAt.Value;
                if (elapsed.TotalSeconds < ResendCooldownSeconds)
                {
                    var wait = ResendCooldownSeconds - (int)elapsed.TotalSeconds;
                    return StatusCode(429, $"Повторная отправка будет доступна через {wait} сек.");
                }
            }

            var code = Random.Shared.Next(0, 1_000_000).ToString("D6");
            user.EmailVerificationCodeHash = HashPassword(code);
            user.EmailVerificationExpiresAt = DateTime.UtcNow.AddMinutes(VerificationCodeLifetimeMinutes);
            user.EmailVerificationSentAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            var subject = "Код подтверждения email — Notes App";
            var html = $@"
<p>Здравствуйте, {System.Net.WebUtility.HtmlEncode(user.Username)}!</p>
<p>Ваш код подтверждения email:</p>
<p style=""font-size:28px;font-weight:bold;letter-spacing:6px;"">{code}</p>
<p>Код действует {VerificationCodeLifetimeMinutes} минут.</p>
<p>Если вы не запрашивали подтверждение, проигнорируйте это письмо.</p>";

            try
            {
                await _emailSender.SendAsync(user.Email, subject, html);
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "SMTP send failed for user {UserId}", user.Id);
                return StatusCode(503, ex.Message);
            }

            return Ok(new { message = "Код отправлен на вашу почту" });
        }

        [HttpPost("me/email/confirm")]
        public async Task<ActionResult<UserDto>> ConfirmEmail([FromBody] ConfirmEmailDto dto)
        {
            var user = await _context.Users.FindAsync(GetCurrentUserId());
            if (user == null)
            {
                return NotFound();
            }

            if (user.EmailConfirmed)
            {
                return BadRequest("Email уже подтверждён");
            }

            if (string.IsNullOrEmpty(user.EmailVerificationCodeHash) ||
                !user.EmailVerificationExpiresAt.HasValue)
            {
                return BadRequest("Сначала запросите код подтверждения");
            }

            if (user.EmailVerificationExpiresAt.Value < DateTime.UtcNow)
            {
                return BadRequest("Срок действия кода истёк. Запросите новый код.");
            }

            var normalizedCode = dto.Code.Trim();
            if (!System.Text.RegularExpressions.Regex.IsMatch(normalizedCode, @"^\d{6}$"))
            {
                return BadRequest("Код должен состоять из 6 цифр");
            }

            if (HashPassword(normalizedCode) != user.EmailVerificationCodeHash)
            {
                return BadRequest("Неверный код подтверждения");
            }

            user.EmailConfirmed = true;
            user.EmailVerificationCodeHash = null;
            user.EmailVerificationExpiresAt = null;
            user.EmailVerificationSentAt = null;
            await _context.SaveChangesAsync();

            return ToUserDto(user);
        }

        [HttpGet("me/password-reset/status")]
        public async Task<ActionResult<PasswordResetStatusDto>> GetPasswordResetStatus()
        {
            var userId = GetCurrentUserId();
            var user = await _context.Users.FindAsync(userId);
            if (user == null)
            {
                return NotFound();
            }

            return await BuildPasswordResetStatus(user);
        }

        [HttpPost("me/password-reset/send-code")]
        public async Task<IActionResult> SendPasswordResetCode()
        {
            var user = await _context.Users.FindAsync(GetCurrentUserId());
            if (user == null)
            {
                return NotFound();
            }

            if (!user.EmailConfirmed)
            {
                return BadRequest("Сначала подтвердите email в профиле");
            }

            if (user.PasswordResetSentAt.HasValue)
            {
                var elapsed = DateTime.UtcNow - user.PasswordResetSentAt.Value;
                if (elapsed.TotalSeconds < ResendCooldownSeconds)
                {
                    var wait = ResendCooldownSeconds - (int)elapsed.TotalSeconds;
                    return StatusCode(429, $"Повторная отправка будет доступна через {wait} сек.");
                }
            }

            var code = Random.Shared.Next(0, 1_000_000).ToString("D6");
            user.PasswordResetCodeHash = HashPassword(code);
            user.PasswordResetExpiresAt = DateTime.UtcNow.AddMinutes(VerificationCodeLifetimeMinutes);
            user.PasswordResetSentAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            var subject = "Код сброса паролей заметок и папок — Notes App";
            var html = $@"
<p>Здравствуйте, {System.Net.WebUtility.HtmlEncode(user.Username)}!</p>
<p>Вы запросили сброс паролей со всех ваших заметок и папок.</p>
<p>Код подтверждения:</p>
<p style=""font-size:28px;font-weight:bold;letter-spacing:6px;"">{code}</p>
<p>Код действует {VerificationCodeLifetimeMinutes} минут.</p>
<p>Если вы не запрашивали сброс, проигнорируйте это письмо.</p>";

            try
            {
                await _emailSender.SendAsync(user.Email, subject, html);
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "SMTP send failed for password reset, user {UserId}", user.Id);
                return StatusCode(503, ex.Message);
            }

            return Ok(new { message = "Код для сброса паролей отправлен на вашу почту" });
        }

        [HttpPost("me/password-reset/confirm")]
        public async Task<ActionResult<PasswordResetResultDto>> ConfirmPasswordReset([FromBody] ConfirmEmailDto dto)
        {
            var userId = GetCurrentUserId();
            var user = await _context.Users.FindAsync(userId);
            if (user == null)
            {
                return NotFound();
            }

            if (!user.EmailConfirmed)
            {
                return BadRequest("Сначала подтвердите email в профиле");
            }

            if (string.IsNullOrEmpty(user.PasswordResetCodeHash) ||
                !user.PasswordResetExpiresAt.HasValue)
            {
                return BadRequest("Сначала запросите код на почту");
            }

            if (user.PasswordResetExpiresAt.Value < DateTime.UtcNow)
            {
                return BadRequest("Срок действия кода истёк. Запросите новый код.");
            }

            var normalizedCode = dto.Code.Trim();
            if (!System.Text.RegularExpressions.Regex.IsMatch(normalizedCode, @"^\d{6}$"))
            {
                return BadRequest("Код должен состоять из 6 цифр");
            }

            if (HashPassword(normalizedCode) != user.PasswordResetCodeHash)
            {
                return BadRequest("Неверный код подтверждения");
            }

            var notesReset = await _context.Notes
                .Where(n => n.UserId == userId && n.PasswordHash != null)
                .ExecuteUpdateAsync(s => s.SetProperty(n => n.PasswordHash, (string?)null));

            var foldersReset = await _context.Folders
                .Where(f => f.UserId == userId && f.PasswordHash != null)
                .ExecuteUpdateAsync(s => s.SetProperty(f => f.PasswordHash, (string?)null));

            user.PasswordResetCodeHash = null;
            user.PasswordResetExpiresAt = null;
            user.PasswordResetSentAt = null;
            await _context.SaveChangesAsync();

            return Ok(new PasswordResetResultDto
            {
                Message = "Пароли сняты со всех ваших заметок и папок",
                NotesReset = notesReset,
                FoldersReset = foldersReset
            });
        }

        // GET: api/users/5
        [HttpGet("{id}")]
        public async Task<ActionResult<UserDto>> GetUser(int id)
        {
            var user = await _context.Users.FindAsync(id);

            if (user == null)
            {
                return NotFound();
            }

            return ToUserDto(user);
        }

        // PUT: api/users/5
        [HttpPut("{id}")]
        public async Task<IActionResult> PutUser(int id, UpdateUserDto updateUserDto)
        {
            var user = await _context.Users.FindAsync(id);
            if (user == null)
            {
                return NotFound();
            }

            if (user.Id != GetCurrentUserId())
            {
                return Forbid();
            }

            var emailChanged = !string.Equals(user.Email, updateUserDto.Email, StringComparison.OrdinalIgnoreCase);
            user.Username = updateUserDto.Username;
            user.Email = updateUserDto.Email;

            if (emailChanged)
            {
                user.EmailConfirmed = false;
                user.EmailVerificationCodeHash = null;
                user.EmailVerificationExpiresAt = null;
                user.EmailVerificationSentAt = null;
            }

            if (!string.IsNullOrWhiteSpace(updateUserDto.Password))
            {
                user.PasswordHash = HashPassword(updateUserDto.Password);
            }

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException)
            {
                if (!UserExists(id))
                {
                    return NotFound();
                }
                else
                {
                    throw;
                }
            }

            return NoContent();
        }

        // DELETE: api/users/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteUser(int id)
        {
            var user = await _context.Users.FindAsync(id);
            if (user == null)
            {
                return NotFound();
            }

            if (user.Id != GetCurrentUserId())
            {
                return Forbid();
            }

            _context.Users.Remove(user);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        private bool UserExists(int id)
        {
            return _context.Users.Any(e => e.Id == id);
        }

        private string HashPassword(string password)
        {
            using (var sha256 = SHA256.Create())
            {
                var hashedBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(password));
                return BitConverter.ToString(hashedBytes).Replace("-", "").ToLower();
            }
        }

        private bool VerifyPassword(string password, string passwordHash)
        {
            return HashPassword(password) == passwordHash;
        }

        private static UserDto ToUserDto(User user)
        {
            return new UserDto
            {
                Id = user.Id,
                Username = user.Username,
                Email = user.Email,
                CreatedAt = user.CreatedAt,
                LastLoginAt = user.LastLoginAt,
                EmailConfirmed = user.EmailConfirmed
            };
        }

        private static EmailVerificationStatusDto BuildEmailStatus(User user)
        {
            var canResend = true;
            int? waitSeconds = null;

            if (user.EmailVerificationSentAt.HasValue && !user.EmailConfirmed)
            {
                var elapsed = DateTime.UtcNow - user.EmailVerificationSentAt.Value;
                if (elapsed.TotalSeconds < ResendCooldownSeconds)
                {
                    canResend = false;
                    waitSeconds = ResendCooldownSeconds - (int)elapsed.TotalSeconds;
                }
            }

            return new EmailVerificationStatusDto
            {
                EmailConfirmed = user.EmailConfirmed,
                Email = user.Email,
                CanResend = user.EmailConfirmed || canResend,
                ResendAvailableInSeconds = user.EmailConfirmed ? null : waitSeconds
            };
        }

        private async Task<PasswordResetStatusDto> BuildPasswordResetStatus(User user)
        {
            var canResend = true;
            int? waitSeconds = null;

            if (user.PasswordResetSentAt.HasValue)
            {
                var elapsed = DateTime.UtcNow - user.PasswordResetSentAt.Value;
                if (elapsed.TotalSeconds < ResendCooldownSeconds)
                {
                    canResend = false;
                    waitSeconds = ResendCooldownSeconds - (int)elapsed.TotalSeconds;
                }
            }

            var notesCount = await _context.Notes.CountAsync(n =>
                n.UserId == user.Id && n.PasswordHash != null);
            var foldersCount = await _context.Folders.CountAsync(f =>
                f.UserId == user.Id && f.PasswordHash != null);

            return new PasswordResetStatusDto
            {
                EmailConfirmed = user.EmailConfirmed,
                CanResend = canResend,
                ResendAvailableInSeconds = waitSeconds,
                ProtectedNotesCount = notesCount,
                ProtectedFoldersCount = foldersCount
            };
        }

        private int GetCurrentUserId()
        {
            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userIdClaim))
            {
                throw new UnauthorizedAccessException("Не удалось определить пользователя");
            }

            return int.Parse(userIdClaim);
        }
    }
}
