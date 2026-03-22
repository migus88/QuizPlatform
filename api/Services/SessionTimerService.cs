using System.Collections.Concurrent;

namespace QuizPlatform.Api.Services;

public class SessionTimerService
{
    private readonly ConcurrentDictionary<Guid, CancellationTokenSource> _timers = new();

    public CancellationToken StartTimer(Guid sessionId)
    {
        CancelTimer(sessionId);
        var cts = new CancellationTokenSource();
        _timers[sessionId] = cts;
        return cts.Token;
    }

    public void CancelTimer(Guid sessionId)
    {
        if (_timers.TryRemove(sessionId, out var cts))
        {
            cts.Cancel();
            cts.Dispose();
        }
    }
}
