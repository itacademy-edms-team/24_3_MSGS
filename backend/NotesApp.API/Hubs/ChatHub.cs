using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace NotesApp.API.Hubs;

[Authorize]
public class ChatHub : Hub
{
    /// <summary>
    /// Подключение клиента к группе чата для получения сообщений в реальном времени.
    /// </summary>
    public async Task JoinConversation(int conversationId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"conversation_{conversationId}");
    }

    /// <summary>
    /// Отключение от группы чата.
    /// </summary>
    public async Task LeaveConversation(int conversationId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"conversation_{conversationId}");
    }
}
