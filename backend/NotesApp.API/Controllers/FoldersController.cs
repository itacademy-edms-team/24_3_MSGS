using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NotesApp.API.Data;
using NotesApp.API.Models;
using NotesApp.API.Models.Folders;
using System.Security.Claims;

namespace NotesApp.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class FoldersController : ControllerBase
    {
        private readonly NotesDbContext _context;

        public FoldersController(NotesDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<FolderDto>>> GetFolders()
        {
            var userId = GetCurrentUserId();
            var folders = await _context.Folders
                .AsNoTracking()
                .Where(f => f.UserId == userId)
                .OrderBy(f => f.CreatedAt)
                .Select(f => ToFolderDto(f))
                .ToListAsync();

            return folders;
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<FolderDto>> GetFolder(int id)
        {
            var folder = await FindFolderForCurrentUser(id);
            if (folder == null)
            {
                return NotFound();
            }

            return ToFolderDto(folder);
        }

        [HttpPost]
        public async Task<ActionResult<FolderDto>> CreateFolder(CreateFolderDto createFolderDto)
        {
            var userId = GetCurrentUserId();

            if (createFolderDto.ParentId.HasValue)
            {
                var parent = await FindFolderForCurrentUser(createFolderDto.ParentId.Value);
                if (parent == null)
                {
                    return BadRequest($"Папка-родитель {createFolderDto.ParentId.Value} не найдена");
                }
            }

            var folder = new Folder
            {
                Name = createFolderDto.Name,
                ParentId = createFolderDto.ParentId,
                UserId = userId,
                CreatedAt = DateTime.UtcNow
            };

            _context.Folders.Add(folder);
            await _context.SaveChangesAsync();

            var dto = ToFolderDto(folder);
            return CreatedAtAction(nameof(GetFolder), new { id = folder.Id }, dto);
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateFolder(int id, UpdateFolderDto updateFolderDto)
        {
            var folder = await FindFolderForCurrentUser(id);
            if (folder == null)
            {
                return NotFound();
            }

            if (updateFolderDto.ParentId == id)
            {
                return BadRequest("Папка не может быть родителем самой себя");
            }

            if (updateFolderDto.ParentId.HasValue)
            {
                var parent = await FindFolderForCurrentUser(updateFolderDto.ParentId.Value);
                if (parent == null)
                {
                    return BadRequest($"Папка-родитель {updateFolderDto.ParentId.Value} не найдена");
                }
            }

            folder.Name = updateFolderDto.Name;
            folder.ParentId = updateFolderDto.ParentId;

            await _context.SaveChangesAsync();
            return NoContent();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteFolder(int id)
        {
            var folder = await FindFolderForCurrentUser(id);
            if (folder == null)
            {
                return NotFound();
            }

            _context.Folders.Remove(folder);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        private async Task<Folder?> FindFolderForCurrentUser(int folderId)
        {
            var userId = GetCurrentUserId();
            return await _context.Folders.FirstOrDefaultAsync(f => f.Id == folderId && f.UserId == userId);
        }

        private static FolderDto ToFolderDto(Folder folder)
        {
            return new FolderDto
            {
                Id = folder.Id,
                Name = folder.Name,
                CreatedAt = folder.CreatedAt,
                ParentId = folder.ParentId
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

