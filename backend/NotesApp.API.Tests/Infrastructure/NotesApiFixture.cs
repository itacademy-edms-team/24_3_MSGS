namespace NotesApp.API.Tests.Infrastructure;

public sealed class NotesApiFixture : IAsyncLifetime
{
    public NotesApiFactory Factory { get; } = new();

    public Task InitializeAsync() => Factory.EnsureInitializedAsync();

    public Task DisposeAsync()
    {
        Factory.Dispose();
        return Task.CompletedTask;
    }
}
