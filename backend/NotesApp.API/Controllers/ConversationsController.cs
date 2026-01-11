using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NotesApp.API.Data;
using NotesApp.API.Models;
using NotesApp.API.Models.Conversations;
using System.Security.Claims;

namespace NotesApp.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class ConversationsController : ControllerBase
    {
        private readonly NotesDbContext _context;

        public ConversationsController(NotesDbContext context)
        {
            _context = context;
        }

        // GET: api/conversations - получить все чаты текущего пользователя
        [HttpGet]
        public async Task<ActionResult<IEnumerable<ConversationDto>>> GetConversations()
        {
            var userId = GetCurrentUserId();
            var conversations = await _context.Conversations
                .Include(c => c.User1)
                .Include(c => c.User2)
                .Include(c => c.Messages.OrderByDescending(m => m.SentAt).Take(1))
                .Where(c => c.User1Id == userId || c.User2Id == userId)
                .OrderByDescending(c => c.UpdatedAt)
                .Select(c => new ConversationDto
                {
                    Id = c.Id,
                    User1Id = c.User1Id,
                    User1Username = c.User1.Username,
                    User2Id = c.User2Id,
                    User2Username = c.User2.Username,
                    CreatedAt = c.CreatedAt,
                    UpdatedAt = c.UpdatedAt,
                    LastMessageId = c.Messages.FirstOrDefault() != null ? c.Messages.FirstOrDefault()!.Id : null,
                    LastMessageContent = c.Messages.FirstOrDefault() != null ? c.Messages.FirstOrDefault()!.Content : null,
                    LastMessageSentAt = c.Messages.FirstOrDefault() != null ? c.Messages.FirstOrDefault()!.SentAt : null
                })
                .ToListAsync();

            return conversations;
        }

        // GET: api/conversations/{id} - получить конкретный чат
        [HttpGet("{id}")]
        public async Task<ActionResult<ConversationDto>> GetConversation(int id)
        {
            var userId = GetCurrentUserId();
            var conversation = await _context.Conversations
                .Include(c => c.User1)
                .Include(c => c.User2)
                .Include(c => c.Messages.OrderByDescending(m => m.SentAt).Take(1))
                .FirstOrDefaultAsync(c => c.Id == id && (c.User1Id == userId || c.User2Id == userId));

            if (conversation == null)
            {
                return NotFound();
            }

            return new ConversationDto
            {
                Id = conversation.Id,
                User1Id = conversation.User1Id,
                User1Username = conversation.User1.Username,
                User2Id = conversation.User2Id,
                User2Username = conversation.User2.Username,
                CreatedAt = conversation.CreatedAt,
                UpdatedAt = conversation.UpdatedAt,
                LastMessageId = conversation.Messages.FirstOrDefault()?.Id,
                LastMessageContent = conversation.Messages.FirstOrDefault()?.Content,
                LastMessageSentAt = conversation.Messages.FirstOrDefault()?.SentAt
            };
        }

        // POST: api/conversations - создать или получить чат с пользователем
        [HttpPost]
        public async Task<ActionResult<ConversationDto>> CreateOrGetConversation([FromBody] CreateConversationDto dto)
        {
            var userId = GetCurrentUserId();

            if (dto.UserId == userId)
            {
                return BadRequest("Нельзя создать чат с самим собой");
            }

            // Проверяем, существует ли уже чат
            var existingConversation = await _context.Conversations
                .Include(c => c.User1)
                .Include(c => c.User2)
                .FirstOrDefaultAsync(c => 
                    (c.User1Id == userId && c.User2Id == dto.UserId) ||
                    (c.User1Id == dto.UserId && c.User2Id == userId));

            if (existingConversation != null)
            {
                return new ConversationDto
                {
                    Id = existingConversation.Id,
                    User1Id = existingConversation.User1Id,
                    User1Username = existingConversation.User1.Username,
                    User2Id = existingConversation.User2Id,
                    User2Username = existingConversation.User2.Username,
                    CreatedAt = existingConversation.CreatedAt,
                    UpdatedAt = existingConversation.UpdatedAt
                };
            }

            // Проверяем, что пользователь существует и является другом
            var targetUser = await _context.Users.FindAsync(dto.UserId);
            if (targetUser == null)
            {
                return NotFound("Пользователь не найден");
            }

            // Проверяем, что пользователи друзья
            var friendship = await _context.Friendships
                .FirstOrDefaultAsync(f => 
                    f.Status == "accepted" &&
                    ((f.RequesterId == userId && f.AddresseeId == dto.UserId) ||
                     (f.RequesterId == dto.UserId && f.AddresseeId == userId)));

            if (friendship == null)
            {
                return BadRequest("Можно создавать чаты только с друзьями");
            }

            // Создаем новый чат (User1Id всегда меньше User2Id для консистентности)
            var user1Id = userId < dto.UserId ? userId : dto.UserId;
            var user2Id = userId < dto.UserId ? dto.UserId : userId;

            var conversation = new Conversation
            {
                User1Id = user1Id,
                User2Id = user2Id,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.Conversations.Add(conversation);
            await _context.SaveChangesAsync();

            await _context.Entry(conversation)
                .Reference(c => c.User1)
                .LoadAsync();
            await _context.Entry(conversation)
                .Reference(c => c.User2)
                .LoadAsync();

            return new ConversationDto
            {
                Id = conversation.Id,
                User1Id = conversation.User1Id,
                User1Username = conversation.User1.Username,
                User2Id = conversation.User2Id,
                User2Username = conversation.User2.Username,
                CreatedAt = conversation.CreatedAt,
                UpdatedAt = conversation.UpdatedAt
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

    public class CreateConversationDto
    {
        public int UserId { get; set; }
    }
}

