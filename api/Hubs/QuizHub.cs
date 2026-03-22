using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using QuizPlatform.Api.Data;
using QuizPlatform.Api.DTOs;
using QuizPlatform.Api.Models;
using QuizPlatform.Api.Services;

namespace QuizPlatform.Api.Hubs;

public class QuizHub : Hub
{
    private readonly AppDbContext _db;
    private readonly SessionTimerService _timerService;

    public QuizHub(AppDbContext db, SessionTimerService timerService)
    {
        _db = db;
        _timerService = timerService;
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
            // New participant
            participant = new Participant
            {
                Id = Guid.NewGuid(),
                SessionId = session.Id,
                Nickname = nickname,
                ConnectionId = Context.ConnectionId,
                JoinedAt = DateTime.UtcNow
            };

            // Set user ID if authenticated
            var userId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userId is not null) participant.UserId = userId;

            _db.Participants.Add(participant);
        }

        await _db.SaveChangesAsync();
        await Groups.AddToGroupAsync(Context.ConnectionId, session.Id.ToString());

        var participantResponse = new ParticipantResponse(participant.Id, participant.Nickname, participant.Score, true);

        // Notify the group
        await Clients.Group(session.Id.ToString()).SendAsync("ParticipantJoined", participantResponse);

        // Send session info to caller
        var sessionResponse = new SessionResponse(
            session.Id, session.QuizId, session.Quiz.Title, session.JoinCode,
            session.Status.ToString(), session.CurrentQuestionIndex,
            session.Participants.Count(p => p.IsConnected), session.StartedAt, session.EndedAt);

        var participants = session.Participants
            .Where(p => p.IsConnected)
            .Select(p => new ParticipantResponse(p.Id, p.Nickname, p.Score, p.IsConnected))
            .ToList();

        await Clients.Caller.SendAsync("JoinedSession", sessionResponse, participantResponse, participants);
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

        // Notify caller of their result
        await Clients.Caller.SendAsync("AnswerResult", new { isCorrect, awardedPoints, newScore = participant.Score });

        // Notify group of submission count
        var totalAnswered = await _db.ParticipantAnswers.CountAsync(a => a.QuestionId == questionGuid &&
            _db.Participants.Any(p => p.Id == a.ParticipantId && p.SessionId == sessionGuid));
        var totalParticipants = await _db.Participants.CountAsync(p => p.SessionId == sessionGuid && p.IsConnected);

        await Clients.Group(sessionId).SendAsync("AnswerSubmitted", new { totalAnswered, totalParticipants });
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

        await Clients.Group(sessionId).SendAsync("QuestionStarted", questionData);

        // Start timer
        var cancellationToken = _timerService.StartTimer(sessionGuid);

        _ = Task.Run(async () =>
        {
            try
            {
                for (int remaining = question.TimeLimitSeconds; remaining >= 0; remaining--)
                {
                    if (cancellationToken.IsCancellationRequested) break;
                    await Clients.Group(sessionId).SendAsync("TimerTick", remaining);
                    if (remaining > 0)
                        await Task.Delay(1000, cancellationToken);
                }

                if (!cancellationToken.IsCancellationRequested)
                {
                    await Clients.Group(sessionId).SendAsync("QuestionEnded", question.Id.ToString());
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

        var session = await _db.Sessions
            .Include(s => s.Quiz)
                .ThenInclude(q => q.Questions.OrderBy(qu => qu.Order))
                    .ThenInclude(q => q.AnswerOptions)
            .FirstOrDefaultAsync(s => s.Id == sessionGuid);

        if (session is null || session.CreatedByUserId != userId) return;

        var question = session.Quiz.Questions.ElementAtOrDefault(session.CurrentQuestionIndex);
        if (question is null) return;

        // Get answer distribution
        var answers = await _db.ParticipantAnswers
            .Where(a => a.QuestionId == question.Id &&
                _db.Participants.Any(p => p.Id == a.ParticipantId && p.SessionId == sessionGuid))
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

        await Clients.Group(sessionId).SendAsync("AnswerRevealed", revealData);
    }

    public async Task ShowLeaderboard(string sessionId)
    {
        var sessionGuid = Guid.Parse(sessionId);

        var participants = await _db.Participants
            .Where(p => p.SessionId == sessionGuid)
            .OrderByDescending(p => p.Score)
            .ToListAsync();

        var leaderboard = participants.Select((p, i) =>
            new LeaderboardEntry(i + 1, p.Nickname, p.Score)).ToList();

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
        }

        await base.OnDisconnectedAsync(exception);
    }
}
