using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using NotesApp.API.Data;
using System.Collections.Concurrent;
using System.Security.Claims;

namespace NotesApp.API.Hubs;

[Authorize]
public class NotesCollabHub : Hub
{
    private readonly NotesDbContext _context;
    private static readonly ConcurrentDictionary<int, ConcurrentDictionary<int, string>> PresenceByNote = new();
    private static readonly ConcurrentDictionary<string, int> ConnectionToNote = new();

    public NotesCollabHub(NotesDbContext context)
    {
        _context = context;
    }

    public async Task JoinNote(int noteId)
    {
        var userId = GetCurrentUserId();
        if (!await HasReadAccessAsync(noteId, userId))
        {
            throw new HubException("Нет доступа к заметке");
        }

        if (ConnectionToNote.TryGetValue(Context.ConnectionId, out var oldNoteId) && oldNoteId != noteId)
        {
            await LeaveNote(oldNoteId);
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, $"note_{noteId}");
        ConnectionToNote[Context.ConnectionId] = noteId;
        await BroadcastPresenceAsync(noteId);
    }

    public async Task LeaveNote(int noteId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"note_{noteId}");
        ConnectionToNote.TryRemove(Context.ConnectionId, out _);
        RemovePresence(noteId, GetCurrentUserId());
        await BroadcastPresenceAsync(noteId);
    }

    public async Task SetPresence(int noteId, bool isEditing)
    {
        var userId = GetCurrentUserId();
        if (!await HasReadAccessAsync(noteId, userId))
        {
            throw new HubException("Нет доступа к заметке");
        }

        if (isEditing)
        {
            var editors = PresenceByNote.GetOrAdd(noteId, _ => new ConcurrentDictionary<int, string>());
            editors[userId] = GetCurrentUsername();
        }
        else
        {
            RemovePresence(noteId, userId);
        }

        await BroadcastPresenceAsync(noteId);
    }

    public async Task SubmitYjsUpdate(int noteId, string updateBase64)
    {
        var userId = GetCurrentUserId();
        if (!await HasEditAccessAsync(noteId, userId))
        {
            throw new HubException("Нет прав на редактирование");
        }

        await Clients.OthersInGroup($"note_{noteId}")
            .SendAsync("YjsUpdate", new
            {
                noteId,
                updateBase64,
                userId
            });
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (ConnectionToNote.TryRemove(Context.ConnectionId, out var noteId))
        {
            RemovePresence(noteId, GetCurrentUserIdSafe());
            await BroadcastPresenceAsync(noteId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    private async Task<bool> HasReadAccessAsync(int noteId, int userId)
    {
        var note = await _context.Notes
            .Include(n => n.Shares)
            .FirstOrDefaultAsync(n => n.Id == noteId);
        if (note == null)
        {
            return false;
        }

        return note.UserId == userId || note.Shares.Any(s => s.UserId == userId);
    }

    private async Task<bool> HasEditAccessAsync(int noteId, int userId)
    {
        var note = await _context.Notes
            .Include(n => n.Shares)
            .FirstOrDefaultAsync(n => n.Id == noteId);
        if (note == null)
        {
            return false;
        }

        if (note.UserId == userId)
        {
            return true;
        }

        return note.Shares.Any(s =>
            s.UserId == userId &&
            (string.Equals(s.Permission, "edit", StringComparison.OrdinalIgnoreCase) ||
             string.Equals(s.Permission, "write", StringComparison.OrdinalIgnoreCase)));
    }

    private async Task BroadcastPresenceAsync(int noteId)
    {
        var editors = PresenceByNote.TryGetValue(noteId, out var users)
            ? users.Values.Distinct().OrderBy(name => name).ToArray()
            : Array.Empty<string>();

        await Clients.Group($"note_{noteId}").SendAsync("PresenceChanged", new
        {
            noteId,
            editors
        });
    }

    private static void RemovePresence(int noteId, int userId)
    {
        if (!PresenceByNote.TryGetValue(noteId, out var users))
        {
            return;
        }

        users.TryRemove(userId, out _);
        if (users.IsEmpty)
        {
            PresenceByNote.TryRemove(noteId, out _);
        }
    }

    private int GetCurrentUserId()
    {
        var userIdClaim = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userIdClaim))
        {
            throw new HubException("Не удалось определить пользователя");
        }

        return int.Parse(userIdClaim);
    }

    private int GetCurrentUserIdSafe()
    {
        var raw = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        return int.TryParse(raw, out var userId) ? userId : 0;
    }

    private string GetCurrentUsername()
    {
        return Context.User?.FindFirstValue(ClaimTypes.Name) ?? $"user-{GetCurrentUserId()}";
    }
}
