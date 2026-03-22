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

    public async Task JoinSession(string joinCode, string nickname)
    {
        var session = await _db.Sessions
            .Include(s => s.Quiz)
            .Include(s => s.Participants)
            .FirstOrDefaultAsync(s => s.JoinCode == joinCode.ToUpper());

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
                var questionData = new
                {
                    id = question.Id,
                    text = question.Text,
                    questionNumber = session.CurrentQuestionIndex + 1,
                    totalQuestions = quiz!.Questions.Count,
                    timeLimitSeconds = question.TimeLimitSeconds,
                    options = question.AnswerOptions.OrderBy(a => a.Order).Select(a => new
                    {
                        id = a.Id,
                        text = a.Text,
                        order = a.Order
                    })
                };

                await Clients.Caller.SendAsync("QuestionStarted", questionData);

                // Check if this participant already answered the current question
                var alreadyAnswered = await _db.ParticipantAnswers
                    .AnyAsync(a => a.ParticipantId == participant.Id && a.QuestionId == question.Id);
                if (alreadyAnswered)
                {
                    await Clients.Caller.SendAsync("AlreadyAnswered");
                }
            }
        }
    }

    public async Task JoinAsHost(string sessionId)
    {
        var sessionGuid = Guid.Parse(sessionId);
        var userId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);

        var session = await _db.Sessions
            .FirstOrDefaultAsync(s => s.Id == sessionGuid);

        if (session is null || session.CreatedByUserId != userId)
        {
            await Clients.Caller.SendAsync("Error", "Not authorized to host this session");
            return;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, sessionId);
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

        // Calculate points based on speed
        var awardedPoints = 0;
        if (isCorrect)
        {
            awardedPoints = question.Points; // Full points for correct answer
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

        var questionData = new
        {
            id = question.Id,
            text = question.Text,
            questionNumber = session.CurrentQuestionIndex + 1,
            totalQuestions = session.Quiz.Questions.Count,
            timeLimitSeconds = question.TimeLimitSeconds,
            options = question.AnswerOptions.OrderBy(a => a.Order).Select(a => new
            {
                id = a.Id,
                text = a.Text,
                order = a.Order
            })
        };

        await _hubContext.Clients.Group(sessionId).SendAsync("QuestionStarted", questionData);

        // Start timer
        var cancellationToken = _timerService.StartTimer(sessionGuid);
        var scopeFactory = _scopeFactory;
        var hubContext = _hubContext;

        _ = Task.Run(async () =>
        {
            try
            {
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

        var participants = await _db.Participants
            .Where(p => p.SessionId == sessionGuid)
            .OrderByDescending(p => p.Score)
            .ToListAsync();

        var leaderboard = participants.Select((p, i) =>
            new LeaderboardEntry(i + 1, p.Nickname, p.Score, p.Emoji, p.Color)).ToList();

        await Clients.Group(sessionId).SendAsync("LeaderboardUpdated", leaderboard);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
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
            correctOptionId = question.AnswerOptions.First(a => a.IsCorrect).Id,
            options = question.AnswerOptions.OrderBy(a => a.Order).Select(a => new
            {
                id = a.Id,
                text = a.Text,
                isCorrect = a.IsCorrect,
                count = answers.Count(ans => ans.SelectedAnswerOptionId == a.Id)
            })
        };

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
            correctOptionId = question.AnswerOptions.First(a => a.IsCorrect).Id,
            options = question.AnswerOptions.OrderBy(a => a.Order).Select(a => new
            {
                id = a.Id,
                text = a.Text,
                isCorrect = a.IsCorrect,
                count = answers.Count(ans => ans.SelectedAnswerOptionId == a.Id)
            })
        };

        await hubContext.Clients.Group(sessionId.ToString()).SendAsync("AnswerRevealed", revealData);
    }
}
