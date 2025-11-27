using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NotesApp.API.Data;
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

        public NotesController(NotesDbContext context)
        {
            _context = context;
        }

        // GET: api/notes
        [HttpGet]
        public async Task<ActionResult<IEnumerable<Note>>> GetNotes()
        {
            var userId = GetCurrentUserId();
            return await _context.Notes
                .Include(n => n.User)
                .Include(n => n.Folder)
                .Where(n => n.UserId == userId)
                .ToListAsync();
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
                .FirstOrDefaultAsync(n => n.Id == id && n.UserId == userId);

            if (note == null)
            {
                return NotFound();
            }

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
            var existingNote = await _context.Notes.FirstOrDefaultAsync(n => n.Id == id && n.UserId == userId);
            if (existingNote == null)
            {
                return NotFound();
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
