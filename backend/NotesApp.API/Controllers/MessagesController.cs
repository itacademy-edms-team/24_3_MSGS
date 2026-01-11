using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NotesApp.API.Data;
using NotesApp.API.Models;
using NotesApp.API.Models.Messages;
using System.Security.Claims;

namespace NotesApp.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class MessagesController : ControllerBase
    {
        private readonly NotesDbContext _context;

        public MessagesController(NotesDbContext context)
        {
            _context = context;
        }

        // GET: api/messages/conversation/{conversationId} - получить сообщения чата
        [HttpGet("conversation/{conversationId}")]
        public async Task<ActionResult<IEnumerable<MessageDto>>> GetConversationMessages(int conversationId, [FromQuery] int? limit = 50)
        {
            var userId = GetCurrentUserId();

            // Проверяем, что пользователь имеет доступ к этому чату
            var conversation = await _context.Conversations
                .FirstOrDefaultAsync(c => c.Id == conversationId && (c.User1Id == userId || c.User2Id == userId));

            if (conversation == null)
            {
                return NotFound("Чат не найден");
            }

            var query = _context.Messages
                .Include(m => m.User)
                .Where(m => m.ConversationId == conversationId)
                .OrderByDescending(m => m.SentAt);

            if (limit.HasValue)
            {
                query = (IOrderedQueryable<Message>)query.Take(limit.Value);
            }

            var messages = await query
                .OrderBy(m => m.SentAt)
                .Select(m => new MessageDto
                {
                    Id = m.Id,
                    Content = m.Content,
                    SentAt = m.SentAt,
                    UserId = m.UserId,
                    Username = m.User.Username,
                    ConversationId = m.ConversationId,
                    NoteId = m.NoteId,
                    SelectionStart = m.SelectionStart,
                    SelectionEnd = m.SelectionEnd
                })
                .ToListAsync();

            return messages;
        }

        // GET: api/messages/note/{noteId} - получить комментарии к заметке
        [HttpGet("note/{noteId}")]
        public async Task<ActionResult<IEnumerable<MessageDto>>> GetNoteComments(int noteId)
        {
            var userId = GetCurrentUserId();

            // Проверяем доступ к заметке
            var note = await _context.Notes
                .Include(n => n.Shares)
                .FirstOrDefaultAsync(n => n.Id == noteId);

            if (note == null)
            {
                return NotFound("Заметка не найдена");
            }

            // Проверяем, что пользователь является владельцем или имеет доступ через шаринг
            if (note.UserId != userId && !note.Shares.Any(s => s.UserId == userId))
            {
                return Forbid("Нет доступа к этой заметке");
            }

            var messages = await _context.Messages
                .Include(m => m.User)
                .Where(m => m.NoteId == noteId)
                .OrderBy(m => m.SentAt)
                .Select(m => new MessageDto
                {
                    Id = m.Id,
                    Content = m.Content,
                    SentAt = m.SentAt,
                    UserId = m.UserId,
                    Username = m.User.Username,
                    ConversationId = m.ConversationId,
                    NoteId = m.NoteId,
                    SelectionStart = m.SelectionStart,
                    SelectionEnd = m.SelectionEnd
                })
                .ToListAsync();

            return messages;
        }

        // POST: api/messages - отправить сообщение или комментарий
        [HttpPost]
        public async Task<ActionResult<MessageDto>> SendMessage([FromBody] CreateMessageDto dto)
        {
            var userId = GetCurrentUserId();

            if (string.IsNullOrWhiteSpace(dto.Content))
            {
                return BadRequest("Содержимое сообщения не может быть пустым");
            }

            Message message;

            if (dto.ConversationId.HasValue)
            {
                // Отправка сообщения в чат
                var conversation = await _context.Conversations
                    .FirstOrDefaultAsync(c => c.Id == dto.ConversationId && (c.User1Id == userId || c.User2Id == userId));

                if (conversation == null)
                {
                    return NotFound("Чат не найден");
                }

                message = new Message
                {
                    Content = dto.Content,
                    UserId = userId,
                    ConversationId = dto.ConversationId,
                    SentAt = DateTime.UtcNow
                };

                // Обновляем время последнего обновления чата
                conversation.UpdatedAt = DateTime.UtcNow;
            }
            else if (dto.NoteId.HasValue)
            {
                // Отправка комментария к заметке
                var note = await _context.Notes
                    .Include(n => n.Shares)
                    .FirstOrDefaultAsync(n => n.Id == dto.NoteId);

                if (note == null)
                {
                    return NotFound("Заметка не найдена");
                }

                // Проверяем доступ
                if (note.UserId != userId && !note.Shares.Any(s => s.UserId == userId))
                {
                    return Forbid("Нет доступа к этой заметке");
                }

                message = new Message
                {
                    Content = dto.Content,
                    UserId = userId,
                    NoteId = dto.NoteId,
                    SelectionStart = dto.SelectionStart,
                    SelectionEnd = dto.SelectionEnd,
                    SentAt = DateTime.UtcNow
                };
            }
            else
            {
                return BadRequest("Необходимо указать либо ConversationId, либо NoteId");
            }

            _context.Messages.Add(message);
            await _context.SaveChangesAsync();

            await _context.Entry(message)
                .Reference(m => m.User)
                .LoadAsync();

            return new MessageDto
            {
                Id = message.Id,
                Content = message.Content,
                SentAt = message.SentAt,
                UserId = message.UserId,
                Username = message.User.Username,
                ConversationId = message.ConversationId,
                NoteId = message.NoteId,
                SelectionStart = message.SelectionStart,
                SelectionEnd = message.SelectionEnd
            };
        }

        // POST: api/messages/share-note - поделиться заметкой через чат
        [HttpPost("share-note")]
        public async Task<ActionResult<MessageDto>> ShareNote([FromBody] ShareNoteDto dto)
        {
            var userId = GetCurrentUserId();

            // Проверяем доступ к заметке
            var note = await _context.Notes
                .FirstOrDefaultAsync(n => n.Id == dto.NoteId);

            if (note == null)
            {
                return NotFound("Заметка не найдена");
            }

            if (note.UserId != userId)
            {
                return Forbid("Вы можете делиться только своими заметками");
            }

            // Проверяем доступ к чату
            var conversation = await _context.Conversations
                .FirstOrDefaultAsync(c => c.Id == dto.ConversationId && (c.User1Id == userId || c.User2Id == userId));

            if (conversation == null)
            {
                return NotFound("Чат не найден");
            }

            // Создаем сообщение о шаринге заметки
            var message = new Message
            {
                Content = $"Поделился заметкой: {note.Title}",
                UserId = userId,
                ConversationId = dto.ConversationId,
                NoteId = dto.NoteId,
                SentAt = DateTime.UtcNow
            };

            // Создаем NoteShare для получателя
            var otherUserId = conversation.User1Id == userId ? conversation.User2Id : conversation.User1Id;
            var existingShare = await _context.NoteShares
                .FirstOrDefaultAsync(ns => ns.NoteId == dto.NoteId && ns.UserId == otherUserId);

            if (existingShare == null)
            {
                var share = new NoteShare
                {
                    NoteId = dto.NoteId,
                    UserId = otherUserId,
                    Permission = "read",
                    SharedAt = DateTime.UtcNow
                };
                _context.NoteShares.Add(share);
            }

            conversation.UpdatedAt = DateTime.UtcNow;
            _context.Messages.Add(message);
            await _context.SaveChangesAsync();

            await _context.Entry(message)
                .Reference(m => m.User)
                .LoadAsync();

            return new MessageDto
            {
                Id = message.Id,
                Content = message.Content,
                SentAt = message.SentAt,
                UserId = message.UserId,
                Username = message.User.Username,
                ConversationId = message.ConversationId,
                NoteId = message.NoteId
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

    public class CreateMessageDto
    {
        public string Content { get; set; } = string.Empty;
        public int? ConversationId { get; set; }
        public int? NoteId { get; set; }
        public int? SelectionStart { get; set; }
        public int? SelectionEnd { get; set; }
    }

    public class ShareNoteDto
    {
        public int ConversationId { get; set; }
        public int NoteId { get; set; }
    }
}

