using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NotesApp.API.Data;
using NotesApp.API.Models;
using NotesApp.API.Models.Friendships;
using System.Security.Claims;

namespace NotesApp.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class FriendshipsController : ControllerBase
    {
        private readonly NotesDbContext _context;

        public FriendshipsController(NotesDbContext context)
        {
            _context = context;
        }

        // GET: api/friendships - получить все заявки (входящие и исходящие)
        [HttpGet]
        public async Task<ActionResult<IEnumerable<FriendshipDto>>> GetFriendships()
        {
            var userId = GetCurrentUserId();
            var friendships = await _context.Friendships
                .Include(f => f.Requester)
                .Include(f => f.Addressee)
                .Where(f => f.RequesterId == userId || f.AddresseeId == userId)
                .Select(f => new FriendshipDto
                {
                    Id = f.Id,
                    RequesterId = f.RequesterId,
                    RequesterUsername = f.Requester.Username,
                    AddresseeId = f.AddresseeId,
                    AddresseeUsername = f.Addressee.Username,
                    Status = f.Status,
                    CreatedAt = f.CreatedAt,
                    UpdatedAt = f.UpdatedAt
                })
                .ToListAsync();

            return friendships;
        }

        // GET: api/friendships/pending - получить входящие заявки
        [HttpGet("pending")]
        public async Task<ActionResult<IEnumerable<FriendshipDto>>> GetPendingRequests()
        {
            var userId = GetCurrentUserId();
            var friendships = await _context.Friendships
                .Include(f => f.Requester)
                .Include(f => f.Addressee)
                .Where(f => f.AddresseeId == userId && f.Status == "pending")
                .Select(f => new FriendshipDto
                {
                    Id = f.Id,
                    RequesterId = f.RequesterId,
                    RequesterUsername = f.Requester.Username,
                    AddresseeId = f.AddresseeId,
                    AddresseeUsername = f.Addressee.Username,
                    Status = f.Status,
                    CreatedAt = f.CreatedAt,
                    UpdatedAt = f.UpdatedAt
                })
                .ToListAsync();

            return friendships;
        }

        // GET: api/friendships/friends - получить список друзей (принятые заявки)
        [HttpGet("friends")]
        public async Task<ActionResult<IEnumerable<UserDto>>> GetFriends()
        {
            var userId = GetCurrentUserId();
            var friendships = await _context.Friendships
                .Include(f => f.Requester)
                .Include(f => f.Addressee)
                .Where(f => f.Status == "accepted" && (f.RequesterId == userId || f.AddresseeId == userId))
                .ToListAsync();

            var friends = friendships
                .Select(f => f.RequesterId == userId ? f.Addressee : f.Requester)
                .Select(u => new UserDto
                {
                    Id = u.Id,
                    Username = u.Username,
                    Email = u.Email,
                    CreatedAt = u.CreatedAt,
                    LastLoginAt = u.LastLoginAt
                })
                .ToList();

            return friends;
        }

        // POST: api/friendships/send - отправить заявку в друзья по username
        [HttpPost("send")]
        public async Task<ActionResult<FriendshipDto>> SendFriendRequest([FromBody] SendFriendRequestDto dto)
        {
            var userId = GetCurrentUserId();

            if (string.IsNullOrWhiteSpace(dto.Username))
            {
                return BadRequest("Username обязателен");
            }

            var targetUser = await _context.Users
                .FirstOrDefaultAsync(u => u.Username == dto.Username);

            if (targetUser == null)
            {
                return NotFound($"Пользователь с username '{dto.Username}' не найден");
            }

            if (targetUser.Id == userId)
            {
                return BadRequest("Нельзя отправить заявку самому себе");
            }

            // Проверяем, нет ли уже заявки
            var existingFriendship = await _context.Friendships
                .FirstOrDefaultAsync(f => 
                    (f.RequesterId == userId && f.AddresseeId == targetUser.Id) ||
                    (f.RequesterId == targetUser.Id && f.AddresseeId == userId));

            if (existingFriendship != null)
            {
                if (existingFriendship.Status == "accepted")
                {
                    return BadRequest("Вы уже друзья с этим пользователем");
                }
                if (existingFriendship.Status == "pending")
                {
                    if (existingFriendship.RequesterId == userId)
                    {
                        return BadRequest("Заявка уже отправлена");
                    }
                    else
                    {
                        // Если заявка от другого пользователя, автоматически принимаем
                        existingFriendship.Status = "accepted";
                        existingFriendship.UpdatedAt = DateTime.UtcNow;
                        await _context.SaveChangesAsync();
                        return await GetFriendshipById(existingFriendship.Id);
                    }
                }
            }

            var friendship = new Friendship
            {
                RequesterId = userId,
                AddresseeId = targetUser.Id,
                Status = "pending",
                CreatedAt = DateTime.UtcNow
            };

            _context.Friendships.Add(friendship);
            await _context.SaveChangesAsync();

            return await GetFriendshipById(friendship.Id);
        }

        // POST: api/friendships/{id}/accept - принять заявку
        [HttpPost("{id}/accept")]
        public async Task<ActionResult<FriendshipDto>> AcceptFriendRequest(int id)
        {
            var userId = GetCurrentUserId();
            var friendship = await _context.Friendships
                .Include(f => f.Requester)
                .Include(f => f.Addressee)
                .FirstOrDefaultAsync(f => f.Id == id);

            if (friendship == null)
            {
                return NotFound();
            }

            if (friendship.AddresseeId != userId)
            {
                return Forbid("Вы можете принимать только входящие заявки");
            }

            if (friendship.Status != "pending")
            {
                return BadRequest("Заявка уже обработана");
            }

            friendship.Status = "accepted";
            friendship.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            return await GetFriendshipById(friendship.Id);
        }

        // POST: api/friendships/{id}/reject - отклонить заявку
        [HttpPost("{id}/reject")]
        public async Task<ActionResult<FriendshipDto>> RejectFriendRequest(int id)
        {
            var userId = GetCurrentUserId();
            var friendship = await _context.Friendships
                .Include(f => f.Requester)
                .Include(f => f.Addressee)
                .FirstOrDefaultAsync(f => f.Id == id);

            if (friendship == null)
            {
                return NotFound();
            }

            if (friendship.AddresseeId != userId)
            {
                return Forbid("Вы можете отклонять только входящие заявки");
            }

            if (friendship.Status != "pending")
            {
                return BadRequest("Заявка уже обработана");
            }

            friendship.Status = "rejected";
            friendship.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            return await GetFriendshipById(friendship.Id);
        }

        // DELETE: api/friendships/{id} - удалить дружбу или отменить заявку
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteFriendship(int id)
        {
            var userId = GetCurrentUserId();
            var friendship = await _context.Friendships
                .FirstOrDefaultAsync(f => f.Id == id);

            if (friendship == null)
            {
                return NotFound();
            }

            if (friendship.RequesterId != userId && friendship.AddresseeId != userId)
            {
                return Forbid();
            }

            _context.Friendships.Remove(friendship);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        private async Task<FriendshipDto> GetFriendshipById(int id)
        {
            var friendship = await _context.Friendships
                .Include(f => f.Requester)
                .Include(f => f.Addressee)
                .FirstOrDefaultAsync(f => f.Id == id);

            if (friendship == null)
            {
                throw new InvalidOperationException("Friendship not found");
            }

            return new FriendshipDto
            {
                Id = friendship.Id,
                RequesterId = friendship.RequesterId,
                RequesterUsername = friendship.Requester.Username,
                AddresseeId = friendship.AddresseeId,
                AddresseeUsername = friendship.Addressee.Username,
                Status = friendship.Status,
                CreatedAt = friendship.CreatedAt,
                UpdatedAt = friendship.UpdatedAt
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

    public class SendFriendRequestDto
    {
        public string Username { get; set; } = string.Empty;
    }
}

