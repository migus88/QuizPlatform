using System.Collections.Concurrent;

namespace QuizPlatform.Api.Services;

public class SessionTimerService
{
    private readonly ConcurrentDictionary<Guid, (CancellationTokenSource Cts, DateTime StartedAt, int TimeLimitSeconds)> _timers = new();

    public CancellationToken StartTimer(Guid sessionId, int timeLimitSeconds)
    {
        CancelTimer(sessionId);
        var cts = new CancellationTokenSource();
        // StartedAt is set to MinValue initially; MarkTimerStarted sets the real start
        _timers[sessionId] = (cts, DateTime.MinValue, timeLimitSeconds);
        return cts.Token;
    }

    /// <summary>
    /// Called after the intro delay, when the actual countdown begins.
    /// Resets StartedAt to now so scoring calculations are accurate.
    /// </summary>
    public void MarkTimerStarted(Guid sessionId)
    {
        if (_timers.TryGetValue(sessionId, out var timer))
        {
            _timers[sessionId] = (timer.Cts, DateTime.UtcNow, timer.TimeLimitSeconds);
        }
    }

    public (int RemainingSeconds, int TotalSeconds)? GetTimerState(Guid sessionId)
    {
        if (!_timers.TryGetValue(sessionId, out var timer)) return null;
        if (timer.StartedAt == DateTime.MinValue)
        {
            // Timer hasn't started counting yet (still in intro)
            return (timer.TimeLimitSeconds, timer.TimeLimitSeconds);
        }
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
