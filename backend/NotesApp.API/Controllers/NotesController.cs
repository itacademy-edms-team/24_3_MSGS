using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using NotesApp.API.Data;
using NotesApp.API.Hubs;
using NotesApp.API.Models;
using System.Security.Claims;

namespace NotesApp.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class NotesController : ControllerBase
    {
        private readonly NotesDbContext _context;
        private readonly IHubContext<NotesCollabHub> _notesHubContext;

        public NotesController(NotesDbContext context, IHubContext<NotesCollabHub> notesHubContext)
        {
            _context = context;
            _notesHubContext = notesHubContext;
        }

        // GET: api/notes
        [HttpGet]
        public async Task<ActionResult<IEnumerable<Note>>> GetNotes()
        {
            var userId = GetCurrentUserId();
            var notes = await _context.Notes
                .Include(n => n.User)
                .Include(n => n.Folder)
                .Include(n => n.Shares)
                .Where(n => n.UserId == userId || n.Shares.Any(s => s.UserId == userId))
                .ToListAsync();

            foreach (var note in notes)
            {
                note.CanEdit = CanEdit(note, userId);
                note.IsShared = note.UserId != userId;
                note.SharedByUsername = note.UserId == userId ? null : note.User?.Username;
            }

            return notes;
        }

        // GET: api/notes/5
        [HttpGet("{id}")]
        public async Task<ActionResult<Note>> GetNote(int id)
        {
            var userId = GetCurrentUserId();
            var note = await _context.Notes
                .Include(n => n.User)
                .Include(n => n.Folder)
                .Include(n => n.Shares)
                .FirstOrDefaultAsync(n => n.Id == id);

            if (note == null)
            {
                return NotFound();
            }

            // Проверяем доступ: владелец или имеет доступ через шаринг
            if (note.UserId != userId && !note.Shares.Any(s => s.UserId == userId))
            {
                return Forbid("Нет доступа к этой заметке");
            }

            note.CanEdit = CanEdit(note, userId);
            note.IsShared = note.UserId != userId;
            note.SharedByUsername = note.UserId == userId ? null : note.User?.Username;
            return note;
        }

        // POST: api/notes
        [HttpPost]
        public async Task<ActionResult<Note>> PostNote(CreateNoteDto createNoteDto)
        {
            var userId = GetCurrentUserId();
            var note = new Note
            {
                Title = createNoteDto.Title,
                Content = createNoteDto.Content,
                UserId = userId,
                FolderId = createNoteDto.FolderId,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            
            _context.Notes.Add(note);
            await _context.SaveChangesAsync();
            note.CanEdit = true;
            note.IsShared = false;
            note.SharedByUsername = null;

            return CreatedAtAction("GetNote", new { id = note.Id }, note);
        }

        // PUT: api/notes/5
        [HttpPut("{id}")]
        public async Task<IActionResult> PutNote(int id, Note note)
        {
            if (id != note.Id)
            {
                return BadRequest();
            }

            var userId = GetCurrentUserId();
            var existingNote = await _context.Notes
                .Include(n => n.Shares)
                .FirstOrDefaultAsync(n => n.Id == id);
            if (existingNote == null)
            {
                return NotFound();
            }

            if (!CanEdit(existingNote, userId))
            {
                return Forbid("Нет прав на редактирование заметки");
            }

            existingNote.Title = note.Title;
            existingNote.Content = note.Content;
            existingNote.FolderId = note.FolderId;
            existingNote.UpdatedAt = DateTime.UtcNow;

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException)
            {
                if (!NoteExists(id))
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

        // POST: api/notes/5/collab-update
        [HttpPost("{id}/collab-update")]
        public async Task<IActionResult> ApplyCollabUpdate(int id, [FromBody] UpdateNoteDto update)
        {
            var userId = GetCurrentUserId();
            var existingNote = await _context.Notes
                .Include(n => n.Shares)
                .FirstOrDefaultAsync(n => n.Id == id);

            if (existingNote == null)
            {
                return NotFound();
            }

            if (!CanEdit(existingNote, userId))
            {
                return Forbid("Нет прав на редактирование заметки");
            }

            existingNote.Title = string.IsNullOrWhiteSpace(update.Title) ? "Без названия" : update.Title;
            existingNote.Content = update.Content ?? string.Empty;
            existingNote.FolderId = update.FolderId;
            existingNote.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            await _notesHubContext.Clients
                .Group($"note_{existingNote.Id}")
                .SendAsync("NotePatched", new
                {
                    noteId = existingNote.Id,
                    title = existingNote.Title,
                    content = existingNote.Content,
                    folderId = existingNote.FolderId,
                    updatedAt = existingNote.UpdatedAt,
                    updatedByUserId = userId
                });

            return NoContent();
        }

        // DELETE: api/notes/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteNote(int id)
        {
            var userId = GetCurrentUserId();
            var note = await _context.Notes.FirstOrDefaultAsync(n => n.Id == id && n.UserId == userId);
            if (note == null)
            {
                return NotFound();
            }

            _context.Notes.Remove(note);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        private bool NoteExists(int id)
        {
            return _context.Notes.Any(e => e.Id == id);
        }

        private static bool CanEdit(Note note, int userId)
        {
            if (note.UserId == userId)
            {
                return true;
            }

            return note.Shares.Any(s =>
                s.UserId == userId &&
                (string.Equals(s.Permission, "edit", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(s.Permission, "write", StringComparison.OrdinalIgnoreCase)));
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

    public class UpdateNoteDto
    {
        public string Title { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
        public int? FolderId { get; set; }
    }
}
