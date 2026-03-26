using System.Collections.Concurrent;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using QuizPlatform.Api.Data;
using QuizPlatform.Api.DTOs;
using QuizPlatform.Api.Constants;
using QuizPlatform.Api.Models;
using QuizPlatform.Api.Services;

namespace QuizPlatform.Api.Hubs;

public class QuizHub : Hub
{
    // Track host connections: connectionId → sessionId
    private static readonly ConcurrentDictionary<string, Guid> _hostConnections = new();

    // Track which phase each session is in: sessionId → phase name
    // Phases: "lobby", "question", "reveal", "leaderboard", "finished"
    private static readonly ConcurrentDictionary<Guid, string> _sessionPhase = new();

    // Track reveal data per session for host rejoin
    private static readonly ConcurrentDictionary<Guid, object> _sessionRevealData = new();

    private readonly AppDbContext _db;
    private readonly SessionTimerService _timerService;
    private readonly IHubContext<QuizHub> _hubContext;
    private readonly IServiceScopeFactory _scopeFactory;

    public QuizHub(AppDbContext db, SessionTimerService timerService, IHubContext<QuizHub> hubContext, IServiceScopeFactory scopeFactory)
    {
        _db = db;
        _timerService = timerService;
        _hubContext = hubContext;
        _scopeFactory = scopeFactory;
    }

    private static List<AnswerOption> OrderOptions(IEnumerable<AnswerOption> options, bool randomize, Guid sessionId, Guid questionId)
    {
        if (!randomize)
            return options.OrderBy(a => a.Order).ToList();

        var list = options.ToList();
        // Fisher-Yates shuffle with a stable deterministic seed
        // (Guid.GetHashCode is NOT randomized — it's based on the first 4 bytes)
        var seed = sessionId.GetHashCode() * 397 ^ questionId.GetHashCode();
        var rng = new Random(seed);
        for (int i = list.Count - 1; i > 0; i--)
        {
            int j = rng.Next(i + 1);
            (list[i], list[j]) = (list[j], list[i]);
        }
        return list;
    }

    public static void CleanupSession(Guid sessionId)
    {
        _sessionPhase.TryRemove(sessionId, out _);
        _sessionRevealData.TryRemove(sessionId, out _);
    }

    public async Task JoinSession(string joinCode, string nickname)
    {
        nickname = nickname.Trim();
        if (nickname.Length == 0 || nickname.Length > 20)
        {
            await Clients.Caller.SendAsync("Error", "Nickname must be between 1 and 20 characters");
            return;
        }

        var session = await _db.Sessions
            .Include(s => s.Quiz)
            .Include(s => s.Participants)
            .FirstOrDefaultAsync(s => s.JoinCode == joinCode.Trim());

        if (session is null)
        {
            await Clients.Caller.SendAsync("Error", "Session not found");
            return;
        }

        if (session.Status == SessionStatus.Finished)
        {
            await Clients.Caller.SendAsync("Error", "Session has ended");
            return;
        }

        // Check for reconnect
        var participant = session.Participants.FirstOrDefault(p => p.Nickname == nickname);
        if (participant is not null)
        {
            // Reconnect
            participant.ConnectionId = Context.ConnectionId;
            participant.IsConnected = true;
        }
        else
        {
            // Assign emoji and color
            var takenEmojis = session.Participants.Where(p => p.IsConnected).Select(p => p.Emoji).ToHashSet();
            var takenColors = session.Participants.Select(p => p.Color).ToHashSet();

            var emoji = AvatarConstants.Emojis.FirstOrDefault(e => !takenEmojis.Contains(e))
                ?? AvatarConstants.Emojis[session.Participants.Count % AvatarConstants.Emojis.Length];
            var color = AvatarConstants.Colors.FirstOrDefault(c => !takenColors.Contains(c))
                ?? AvatarConstants.Colors[session.Participants.Count % AvatarConstants.Colors.Length];

            // New participant
            participant = new Participant
            {
                Id = Guid.NewGuid(),
                SessionId = session.Id,
                Nickname = nickname,
                ConnectionId = Context.ConnectionId,
                Emoji = emoji,
                Color = color,
                JoinedAt = DateTime.UtcNow
            };

            // Set user ID if authenticated
            var userId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userId is not null) participant.UserId = userId;

            _db.Participants.Add(participant);
        }

        await _db.SaveChangesAsync();
        await Groups.AddToGroupAsync(Context.ConnectionId, session.Id.ToString());

        var participantResponse = new ParticipantResponse(participant.Id, participant.Nickname, participant.Score, true, participant.Emoji, participant.Color);

        // Notify the group
        await Clients.Group(session.Id.ToString()).SendAsync("ParticipantJoined", participantResponse);

        // Send session info to caller
        var sessionResponse = new SessionResponse(
            session.Id, session.QuizId, session.Quiz.Title, session.JoinCode,
            session.Status.ToString(), session.CurrentQuestionIndex,
            session.Participants.Count(p => p.IsConnected), session.StartedAt, session.EndedAt);

        var participants = session.Participants
            .Where(p => p.IsConnected)
            .Select(p => new ParticipantResponse(p.Id, p.Nickname, p.Score, p.IsConnected, p.Emoji, p.Color))
            .ToList();

        await Clients.Caller.SendAsync("JoinedSession", sessionResponse, participantResponse, participants);

        // If session is active, send the current question so refreshing clients can catch up
        if (session.Status == SessionStatus.Active)
        {
            var quiz = await _db.Quizzes
                .Include(q => q.Questions.OrderBy(qu => qu.Order))
                    .ThenInclude(q => q.AnswerOptions)
                .FirstOrDefaultAsync(q => q.Id == session.QuizId);

            var question = quiz?.Questions.ElementAtOrDefault(session.CurrentQuestionIndex);
            if (question is not null)
            {
                var orderedOptions = OrderOptions(question.AnswerOptions, quiz!.RandomizeAnswerOrder, session.Id, question.Id);
                var questionData = new
                {
                    id = question.Id,
                    text = question.Text,
                    questionNumber = session.CurrentQuestionIndex + 1,
                    totalQuestions = quiz.Questions.Count,
                    timeLimitSeconds = question.TimeLimitSeconds,
                    options = orderedOptions.Select(a => new
                    {
                        id = a.Id,
                        text = a.Text,
                        order = a.Order
                    })
                };

                await Clients.Caller.SendAsync("QuestionStarted", questionData);

                // Send current phase state so reconnecting players see the right screen
                var phase = _sessionPhase.GetValueOrDefault(session.Id, "question");
                if (phase == "reveal" && _sessionRevealData.TryGetValue(session.Id, out var revealData))
                {
                    // Send the player's own answer result first
                    var myAnswer = await _db.ParticipantAnswers
                        .FirstOrDefaultAsync(a => a.ParticipantId == participant.Id && a.QuestionId == question.Id);
                    if (myAnswer is not null)
                    {
                        await Clients.Caller.SendAsync("AnswerResult",
                            new { isCorrect = myAnswer.IsCorrect, awardedPoints = myAnswer.AwardedPoints, newScore = participant.Score });
                    }
                    await Clients.Caller.SendAsync("AnswerRevealed", revealData);
                }
                else if (phase == "leaderboard")
                {
                    var lb = session.Participants
                        .OrderByDescending(p => p.Score)
                        .Select((p, i) => new LeaderboardEntry(i + 1, p.Nickname, p.Score, p.Emoji, p.Color))
                        .ToList();
                    await Clients.Caller.SendAsync("LeaderboardUpdated", lb);
                }
                else
                {
                    // Still in question phase — check if already answered
                    var alreadyAnswered = await _db.ParticipantAnswers
                        .AnyAsync(a => a.ParticipantId == participant.Id && a.QuestionId == question.Id);
                    if (alreadyAnswered)
                    {
                        await Clients.Caller.SendAsync("AlreadyAnswered");
                    }
                }
            }
        }
    }

    public async Task JoinAsHost(string sessionId)
    {
        var sessionGuid = Guid.Parse(sessionId);
        var userId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);

        var session = await _db.Sessions
            .Include(s => s.Quiz)
                .ThenInclude(q => q.Questions.OrderBy(qu => qu.Order))
                    .ThenInclude(q => q.AnswerOptions)
            .Include(s => s.Participants)
            .FirstOrDefaultAsync(s => s.Id == sessionGuid);

        if (session is null || session.CreatedByUserId != userId)
        {
            await Clients.Caller.SendAsync("Error", "Not authorized to host this session");
            return;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, sessionId);
        _hostConnections[Context.ConnectionId] = sessionGuid;

        // Send current participants
        var participants = session.Participants
            .Select(p => new ParticipantResponse(p.Id, p.Nickname, p.Score, p.IsConnected, p.Emoji, p.Color))
            .ToList();
        await Clients.Caller.SendAsync("ParticipantList", participants);

        // If session is active, send current state so host can resume
        if (session.Status == SessionStatus.Active)
        {
            var phase = _sessionPhase.GetValueOrDefault(sessionGuid, "question");
            var question = session.Quiz.Questions.ElementAtOrDefault(session.CurrentQuestionIndex);

            if (question is not null)
            {
                var orderedOpts = OrderOptions(question.AnswerOptions, session.Quiz.RandomizeAnswerOrder, session.Id, question.Id);
                var questionData = new
                {
                    id = question.Id,
                    text = question.Text,
                    questionNumber = session.CurrentQuestionIndex + 1,
                    totalQuestions = session.Quiz.Questions.Count,
                    timeLimitSeconds = question.TimeLimitSeconds,
                    options = orderedOpts.Select(a => new
                    {
                        id = a.Id,
                        text = a.Text,
                        order = a.Order
                    })
                };

                // Send the current question data
                await Clients.Caller.SendAsync("QuestionStarted", questionData);

                // Send the current phase so host knows where to resume
                if (phase == "reveal" && _sessionRevealData.TryGetValue(sessionGuid, out var revealData))
                {
                    await Clients.Caller.SendAsync("AnswerRevealed", revealData);
                }
                else if (phase == "leaderboard")
                {
                    var lb = session.Participants
                        .OrderByDescending(p => p.Score)
                        .Select((p, i) => new LeaderboardEntry(i + 1, p.Nickname, p.Score, p.Emoji, p.Color))
                        .ToList();
                    await Clients.Caller.SendAsync("LeaderboardUpdated", lb);
                }
                else
                {
                    // In question or revealing phase — send timer state
                    var timerState = _timerService.GetTimerState(sessionGuid);
                    if (timerState.HasValue && timerState.Value.RemainingSeconds > 0)
                    {
                        await Clients.Caller.SendAsync("TimerStarted");
                        await Clients.Caller.SendAsync("TimerTick", timerState.Value.RemainingSeconds);
                    }

                    // Send answer count
                    var totalAnswered = await _db.ParticipantAnswers
                        .CountAsync(a => a.QuestionId == question.Id &&
                            _db.Participants.Any(p => p.Id == a.ParticipantId && p.SessionId == sessionGuid));
                    var totalParticipants = session.Participants.Count(p => p.IsConnected);
                    await Clients.Caller.SendAsync("AnswerSubmitted", new { totalAnswered, totalParticipants });
                }
            }
        }
    }

    public async Task ChangeEmoji(string sessionId, string newEmoji)
    {
        var sessionGuid = Guid.Parse(sessionId);

        if (!AvatarConstants.Emojis.Contains(newEmoji))
        {
            await Clients.Caller.SendAsync("Error", "Invalid emoji");
            return;
        }

        var participant = await _db.Participants
            .FirstOrDefaultAsync(p => p.ConnectionId == Context.ConnectionId && p.SessionId == sessionGuid);
        if (participant is null) return;

        var taken = await _db.Participants
            .AnyAsync(p => p.SessionId == sessionGuid && p.Id != participant.Id && p.IsConnected && p.Emoji == newEmoji);
        if (taken)
        {
            await Clients.Caller.SendAsync("Error", "Emoji already taken");
            return;
        }

        participant.Emoji = newEmoji;
        await _db.SaveChangesAsync();

        var response = new ParticipantResponse(participant.Id, participant.Nickname, participant.Score, participant.IsConnected, participant.Emoji, participant.Color);
        await Clients.Group(sessionId).SendAsync("ParticipantUpdated", response);

        // Broadcast updated emoji availability to all players
        var updatedTaken = await _db.Participants
            .Where(p => p.SessionId == sessionGuid && p.IsConnected)
            .Select(p => p.Emoji)
            .ToListAsync();
        await Clients.Group(sessionId).SendAsync("AvailableEmojis", new
        {
            all = AvatarConstants.Emojis,
            taken = updatedTaken
        });
    }

    public async Task GetAvailableEmojis(string sessionId)
    {
        var sessionGuid = Guid.Parse(sessionId);
        var takenEmojis = await _db.Participants
            .Where(p => p.SessionId == sessionGuid && p.IsConnected)
            .Select(p => p.Emoji)
            .ToListAsync();

        await Clients.Caller.SendAsync("AvailableEmojis", new
        {
            all = AvatarConstants.Emojis,
            taken = takenEmojis
        });
    }

    public async Task SubmitAnswer(string sessionId, string questionId, string answerOptionId)
    {
        var sessionGuid = Guid.Parse(sessionId);
        var questionGuid = Guid.Parse(questionId);
        var answerGuid = Guid.Parse(answerOptionId);

        var participant = await _db.Participants
            .FirstOrDefaultAsync(p => p.ConnectionId == Context.ConnectionId && p.SessionId == sessionGuid);
        if (participant is null) return;

        var session = await _db.Sessions
            .Include(s => s.Quiz)
                .ThenInclude(q => q.Questions.OrderBy(qu => qu.Order))
                    .ThenInclude(q => q.AnswerOptions)
            .FirstOrDefaultAsync(s => s.Id == sessionGuid);
        if (session is null || session.Status != SessionStatus.Active) return;

        // Check if already answered
        var existing = await _db.ParticipantAnswers
            .AnyAsync(a => a.ParticipantId == participant.Id && a.QuestionId == questionGuid);
        if (existing) return;

        var question = session.Quiz.Questions.ElementAtOrDefault(session.CurrentQuestionIndex);
        if (question is null || question.Id != questionGuid) return;

        var selectedOption = question.AnswerOptions.FirstOrDefault(a => a.Id == answerGuid);
        var isCorrect = selectedOption?.IsCorrect ?? false;

        // Calculate points: per-answer override or question default, with optional time scaling
        var awardedPoints = 0;
        if (isCorrect)
        {
            var basePoints = selectedOption!.PointsOverride ?? question.Points;

            if (question.DisableTimeScoring)
            {
                awardedPoints = basePoints;
            }
            else
            {
                var timerState = _timerService.GetTimerState(sessionGuid);
                if (timerState.HasValue && timerState.Value.TotalSeconds > 0)
                {
                    var ratio = (double)timerState.Value.RemainingSeconds / timerState.Value.TotalSeconds;
                    awardedPoints = Math.Max(1, (int)Math.Ceiling(basePoints * ratio));
                }
                else
                {
                    awardedPoints = basePoints;
                }
            }
        }
        else if (question.DisableTimeScoring && selectedOption?.PointsOverride is < 0)
        {
            // Negative scoring: apply penalty for incorrect answers with negative PointsOverride (fixed score only)
            awardedPoints = selectedOption.PointsOverride.Value;
        }

        var answer = new ParticipantAnswer
        {
            Id = Guid.NewGuid(),
            ParticipantId = participant.Id,
            QuestionId = questionGuid,
            SelectedAnswerOptionId = answerGuid,
            AnsweredAt = DateTime.UtcNow,
            IsCorrect = isCorrect,
            AwardedPoints = awardedPoints
        };

        _db.ParticipantAnswers.Add(answer);
        participant.Score += awardedPoints;
        await _db.SaveChangesAsync();

        // Notify caller of their result (stored but not shown until reveal)
        await Clients.Caller.SendAsync("AnswerResult", new { isCorrect, awardedPoints, newScore = participant.Score });

        // Notify group of submission count
        var totalAnswered = await _db.ParticipantAnswers.CountAsync(a => a.QuestionId == questionGuid &&
            _db.Participants.Any(p => p.Id == a.ParticipantId && p.SessionId == sessionGuid));
        var totalParticipants = await _db.Participants.CountAsync(p => p.SessionId == sessionGuid && p.IsConnected);

        await Clients.Group(sessionId).SendAsync("AnswerSubmitted", new { totalAnswered, totalParticipants });

        // Auto-reveal if all participants have answered
        if (totalAnswered >= totalParticipants)
        {
            _timerService.CancelTimer(sessionGuid);
            await RevealAnswerInternal(sessionGuid);
        }
    }

    public async Task StartCountdown(string sessionId, int seconds = 10)
    {
        var sessionGuid = Guid.Parse(sessionId);
        var userId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);

        var session = await _db.Sessions.FirstOrDefaultAsync(s => s.Id == sessionGuid);
        if (session is null || session.CreatedByUserId != userId) return;

        var hubContext = _hubContext;

        _ = Task.Run(async () =>
        {
            for (int i = seconds; i >= 1; i--)
            {
                await hubContext.Clients.Group(sessionId).SendAsync("GameCountdown", i);
                await Task.Delay(1000);
            }
            await hubContext.Clients.Group(sessionId).SendAsync("GameCountdown", 0);
        });
    }

    public async Task StartQuestion(string sessionId)
    {
        var sessionGuid = Guid.Parse(sessionId);
        var userId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);

        var session = await _db.Sessions
            .Include(s => s.Quiz)
                .ThenInclude(q => q.Questions.OrderBy(qu => qu.Order))
                    .ThenInclude(q => q.AnswerOptions)
            .FirstOrDefaultAsync(s => s.Id == sessionGuid);

        if (session is null || session.CreatedByUserId != userId) return;
        if (session.Status != SessionStatus.Active) return;

        var question = session.Quiz.Questions.ElementAtOrDefault(session.CurrentQuestionIndex);
        if (question is null) return;

        _sessionPhase[sessionGuid] = "question";
        _sessionRevealData.TryRemove(sessionGuid, out _);

        var gameOptions = OrderOptions(question.AnswerOptions, session.Quiz.RandomizeAnswerOrder, session.Id, question.Id);
        var questionData = new
        {
            id = question.Id,
            text = question.Text,
            questionNumber = session.CurrentQuestionIndex + 1,
            totalQuestions = session.Quiz.Questions.Count,
            timeLimitSeconds = question.TimeLimitSeconds,
            options = gameOptions.Select(a => new
            {
                id = a.Id,
                text = a.Text,
                order = a.Order
            })
        };

        var optionCount = question.AnswerOptions.Count;
        await _hubContext.Clients.Group(sessionId).SendAsync("QuestionStarted", questionData);

        // Delay before timer: 3s for question text + 0.5s per answer option reveal
        var introDelayMs = 3000 + (optionCount * 500);

        var cancellationToken = _timerService.StartTimer(sessionGuid, question.TimeLimitSeconds);
        var scopeFactory = _scopeFactory;
        var hubContext = _hubContext;
        var timerService = _timerService;

        _ = Task.Run(async () =>
        {
            try
            {
                // Wait for question + answer reveal animations before starting timer
                await Task.Delay(introDelayMs, cancellationToken);

                if (cancellationToken.IsCancellationRequested) return;

                // Mark the actual start time for scoring calculations
                timerService.MarkTimerStarted(sessionGuid);

                // Signal that the timer is now starting
                await hubContext.Clients.Group(sessionId).SendAsync("TimerStarted");

                for (int remaining = question.TimeLimitSeconds; remaining >= 0; remaining--)
                {
                    if (cancellationToken.IsCancellationRequested) break;
                    await hubContext.Clients.Group(sessionId).SendAsync("TimerTick", remaining);
                    if (remaining > 0)
                        await Task.Delay(1000, cancellationToken);
                }

                if (!cancellationToken.IsCancellationRequested)
                {
                    await hubContext.Clients.Group(sessionId).SendAsync("QuestionEnded", question.Id.ToString());
                    // Auto-reveal when time is up
                    await RevealAnswerWithScope(scopeFactory, hubContext, sessionGuid);
                }
            }
            catch (OperationCanceledException) { }
        });
    }

    public async Task RevealAnswer(string sessionId)
    {
        var sessionGuid = Guid.Parse(sessionId);
        var userId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);

        _timerService.CancelTimer(sessionGuid);

        var session = await _db.Sessions.FirstOrDefaultAsync(s => s.Id == sessionGuid);
        if (session is null || session.CreatedByUserId != userId) return;

        await RevealAnswerInternal(sessionGuid);
    }

    public async Task ShowLeaderboard(string sessionId)
    {
        var sessionGuid = Guid.Parse(sessionId);

        var session = await _db.Sessions
            .Include(s => s.Quiz)
                .ThenInclude(q => q.Questions.OrderBy(qu => qu.Order))
            .FirstOrDefaultAsync(s => s.Id == sessionGuid);
        if (session is null) return;

        var question = session.Quiz.Questions.ElementAtOrDefault(session.CurrentQuestionIndex);

        var participants = await _db.Participants
            .Where(p => p.SessionId == sessionGuid)
            .OrderByDescending(p => p.Score)
            .ToListAsync();

        // Get awarded points for current question per participant
        var participantIds = participants.Select(p => p.Id).ToList();
        var diffs = question is not null
            ? await _db.ParticipantAnswers
                .Where(a => a.QuestionId == question.Id &&
                    participantIds.Contains(a.ParticipantId))
                .ToDictionaryAsync(a => a.ParticipantId, a => a.AwardedPoints)
            : new Dictionary<Guid, int>();

        var leaderboard = participants.Select((p, i) =>
            new LeaderboardEntry(i + 1, p.Nickname, p.Score, p.Emoji, p.Color,
                diffs.TryGetValue(p.Id, out var d) ? d : null)).ToList();

        _sessionPhase[sessionGuid] = "leaderboard";
        await Clients.Group(sessionId).SendAsync("LeaderboardUpdated", leaderboard);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        // Host disconnect: just remove from tracking, do NOT end session
        if (_hostConnections.TryRemove(Context.ConnectionId, out _))
        {
            // Session continues running — timer tasks, answer reveals all work via IHubContext
        }

        // Handle participant disconnect
        var participant = await _db.Participants
            .Include(p => p.Session)
            .FirstOrDefaultAsync(p => p.ConnectionId == Context.ConnectionId);

        if (participant is not null)
        {
            participant.IsConnected = false;
            participant.ConnectionId = null;
            await _db.SaveChangesAsync();

            await Clients.Group(participant.SessionId.ToString())
                .SendAsync("ParticipantDisconnected", participant.Nickname);

            // Broadcast updated emoji availability so other players can pick released emojis
            var takenEmojis = await _db.Participants
                .Where(p => p.SessionId == participant.SessionId && p.IsConnected)
                .Select(p => p.Emoji)
                .ToListAsync();
            await Clients.Group(participant.SessionId.ToString())
                .SendAsync("AvailableEmojis", new { all = AvatarConstants.Emojis, taken = takenEmojis });
        }

        await base.OnDisconnectedAsync(exception);
    }

    private async Task RevealAnswerInternal(Guid sessionId)
    {
        var session = await _db.Sessions
            .Include(s => s.Quiz)
                .ThenInclude(q => q.Questions.OrderBy(qu => qu.Order))
                    .ThenInclude(q => q.AnswerOptions)
            .FirstOrDefaultAsync(s => s.Id == sessionId);
        if (session is null) return;

        var question = session.Quiz.Questions.ElementAtOrDefault(session.CurrentQuestionIndex);
        if (question is null) return;

        var answers = await _db.ParticipantAnswers
            .Where(a => a.QuestionId == question.Id &&
                _db.Participants.Any(p => p.Id == a.ParticipantId && p.SessionId == sessionId))
            .ToListAsync();

        var revealData = new
        {
            questionId = question.Id,
            correctOptionIds = question.AnswerOptions.Where(a => a.IsCorrect).Select(a => a.Id).ToList(),
            options = question.AnswerOptions.OrderBy(a => a.Order).Select(a => new
            {
                id = a.Id,
                text = a.Text,
                isCorrect = a.IsCorrect,
                count = answers.Count(ans => ans.SelectedAnswerOptionId == a.Id),
                points = a.IsCorrect
                    ? a.PointsOverride ?? question.Points
                    : a.PointsOverride
            })
        };

        _sessionPhase[sessionId] = "reveal";
        _sessionRevealData[sessionId] = revealData;

        await _hubContext.Clients.Group(sessionId.ToString()).SendAsync("AnswerRevealed", revealData);
    }

    private static async Task RevealAnswerWithScope(IServiceScopeFactory scopeFactory, IHubContext<QuizHub> hubContext, Guid sessionId)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var session = await db.Sessions
            .Include(s => s.Quiz)
                .ThenInclude(q => q.Questions.OrderBy(qu => qu.Order))
                    .ThenInclude(q => q.AnswerOptions)
            .FirstOrDefaultAsync(s => s.Id == sessionId);
        if (session is null) return;

        var question = session.Quiz.Questions.ElementAtOrDefault(session.CurrentQuestionIndex);
        if (question is null) return;

        var answers = await db.ParticipantAnswers
            .Where(a => a.QuestionId == question.Id &&
                db.Participants.Any(p => p.Id == a.ParticipantId && p.SessionId == sessionId))
            .ToListAsync();

        var revealData = new
        {
            questionId = question.Id,
            correctOptionIds = question.AnswerOptions.Where(a => a.IsCorrect).Select(a => a.Id).ToList(),
            options = question.AnswerOptions.OrderBy(a => a.Order).Select(a => new
            {
                id = a.Id,
                text = a.Text,
                isCorrect = a.IsCorrect,
                count = answers.Count(ans => ans.SelectedAnswerOptionId == a.Id),
                points = a.IsCorrect
                    ? a.PointsOverride ?? question.Points
                    : a.PointsOverride
            })
        };

        _sessionPhase[sessionId] = "reveal";
        _sessionRevealData[sessionId] = revealData;

        await hubContext.Clients.Group(sessionId.ToString()).SendAsync("AnswerRevealed", revealData);
    }
}
