using System.Collections.Concurrent;

namespace QuizPlatform.Api.Services;

public class SessionTimerService
{
    private readonly ConcurrentDictionary<Guid, (CancellationTokenSource Cts, DateTime StartedAt, int TimeLimitSeconds)> _timers = new();

    public CancellationToken StartTimer(Guid sessionId, int timeLimitSeconds)
    {
        CancelTimer(sessionId);
        var cts = new CancellationTokenSource();
        _timers[sessionId] = (cts, DateTime.UtcNow, timeLimitSeconds);
        return cts.Token;
    }

    public (int RemainingSeconds, int TotalSeconds)? GetTimerState(Guid sessionId)
    {
        if (!_timers.TryGetValue(sessionId, out var timer)) return null;
        var elapsed = (DateTime.UtcNow - timer.StartedAt).TotalSeconds;
        var remaining = Math.Max(0, timer.TimeLimitSeconds - (int)elapsed);
        return (remaining, timer.TimeLimitSeconds);
    }

    public void CancelTimer(Guid sessionId)
    {
        if (_timers.TryRemove(sessionId, out var timer))
        {
            timer.Cts.Cancel();
            timer.Cts.Dispose();
        }
    }
}
