using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NotesApp.API.Data;
using NotesApp.API.Models.Shares;
using System.Security.Claims;

namespace NotesApp.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class SharesController : ControllerBase
    {
        private readonly NotesDbContext _context;

        public SharesController(NotesDbContext context)
        {
            _context = context;
        }

        // GET: api/shares/profile
        [HttpGet("profile")]
        public async Task<ActionResult<ShareProfileDto>> GetShareProfile()
        {
            var userId = GetCurrentUserId();

            var received = await _context.NoteShares
                .AsNoTracking()
                .Where(s => s.UserId == userId)
                .Include(s => s.Note)
                    .ThenInclude(n => n.User)
                .OrderByDescending(s => s.SharedAt)
                .Select(s => new ReceivedShareDto
                {
                    ShareId = s.Id,
                    NoteId = s.NoteId,
                    NoteTitle = s.Note.Title,
                    OwnerUsername = s.Note.User!.Username,
                    Permission = s.Permission,
                    SharedAt = s.SharedAt
                })
                .ToListAsync();

            var sentShares = await _context.NoteShares
                .AsNoTracking()
                .Where(s => s.Note.UserId == userId)
                .Include(s => s.Note)
                .Include(s => s.User)
                .OrderByDescending(s => s.SharedAt)
                .ToListAsync();

            var sent = sentShares
                .GroupBy(s => s.NoteId)
                .Select(g => new SentShareGroupDto
                {
                    NoteId = g.Key,
                    NoteTitle = g.First().Note.Title,
                    Recipients = g.Select(s => new ShareRecipientDto
                    {
                        ShareId = s.Id,
                        UserId = s.UserId,
                        Username = s.User.Username,
                        Permission = s.Permission,
                        SharedAt = s.SharedAt
                    }).ToList()
                })
                .OrderByDescending(g => g.Recipients.Max(r => r.SharedAt))
                .ToList();

            return new ShareProfileDto
            {
                Received = received,
                Sent = sent
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
