using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using QuizPlatform.Api.Data;
using QuizPlatform.Api.DTOs;
using QuizPlatform.Api.Hubs;
using QuizPlatform.Api.Models;

namespace QuizPlatform.Api.Endpoints;

public static class SessionEndpoints
{
    private static readonly char[] JoinCodeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".ToCharArray();

    public static void MapSessionEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/sessions").WithTags("Sessions");

        // Get my active (non-finished) sessions
        group.MapGet("/my-active", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var sessions = await db.Sessions
                .Include(s => s.Quiz)
                .Include(s => s.Participants)
                .Where(s => s.CreatedByUserId == userId && s.Status != SessionStatus.Finished)
                .OrderByDescending(s => s.StartedAt ?? DateTime.MinValue)
                .ToListAsync();

            return Results.Ok(sessions.Select(s => new SessionResponse(
                s.Id, s.QuizId, s.Quiz.Title, s.JoinCode,
                s.Status.ToString(), s.CurrentQuestionIndex,
                s.Participants.Count, s.StartedAt, s.EndedAt)));
        }).RequireAuthorization();

        // List sessions for a quiz (host only)
        group.MapGet("/by-quiz/{quizId:guid}", async (Guid quizId, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var sessions = await db.Sessions
                .Include(s => s.Quiz)
                .Include(s => s.Participants)
                .Where(s => s.QuizId == quizId && s.CreatedByUserId == userId)
                .OrderByDescending(s => s.StartedAt ?? s.EndedAt ?? DateTime.MinValue)
                .ToListAsync();

            return Results.Ok(sessions.Select(s => new SessionResponse(
                s.Id, s.QuizId, s.Quiz.Title, s.JoinCode,
                s.Status.ToString(), s.CurrentQuestionIndex,
                s.Participants.Count, s.StartedAt, s.EndedAt)));
        }).RequireAuthorization();

        // Create session (auth required) - returns existing active session if one exists
        group.MapPost("/", async (CreateSessionRequest request, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;

            var quiz = await db.Quizzes.Include(q => q.Questions).FirstOrDefaultAsync(q => q.Id == request.QuizId);
            if (quiz is null) return Results.NotFound("Quiz not found");
            if (!quiz.IsPublished) return Results.BadRequest("Quiz must be published to create a session");
            if (!quiz.Questions.Any()) return Results.BadRequest("Quiz must have at least one question");

            // Check for existing active session
            var existingSession = await db.Sessions
                .Include(s => s.Participants)
                .FirstOrDefaultAsync(s =>
                    s.QuizId == request.QuizId
                    && s.CreatedByUserId == userId
                    && s.Status != SessionStatus.Finished);

            if (existingSession is not null)
            {
                return Results.Ok(new SessionResponse(
                    existingSession.Id, existingSession.QuizId, quiz.Title,
                    existingSession.JoinCode, existingSession.Status.ToString(),
                    existingSession.CurrentQuestionIndex,
                    existingSession.Participants.Count,
                    existingSession.StartedAt, existingSession.EndedAt));
            }

            string joinCode;
            do
            {
                joinCode = GenerateJoinCode();
            } while (await db.Sessions.AnyAsync(s => s.JoinCode == joinCode));

            var session = new Session
            {
                Id = Guid.NewGuid(),
                QuizId = request.QuizId,
                JoinCode = joinCode,
                Status = SessionStatus.Lobby,
                CreatedByUserId = userId
            };

            db.Sessions.Add(session);
            await db.SaveChangesAsync();

            return Results.Created($"/api/sessions/{session.Id}", new SessionResponse(
                session.Id, session.QuizId, quiz.Title, session.JoinCode,
                session.Status.ToString(), session.CurrentQuestionIndex,
                0, session.StartedAt, session.EndedAt));
        }).RequireAuthorization();

        // Get session by id
        group.MapGet("/{id:guid}", async (Guid id, AppDbContext db) =>
        {
            var session = await db.Sessions
                .Include(s => s.Quiz)
                .Include(s => s.Participants)
                .FirstOrDefaultAsync(s => s.Id == id);
            if (session is null) return Results.NotFound();

            return Results.Ok(new SessionResponse(
                session.Id, session.QuizId, session.Quiz.Title, session.JoinCode,
                session.Status.ToString(), session.CurrentQuestionIndex,
                session.Participants.Count, session.StartedAt, session.EndedAt));
        }).RequireAuthorization();

        // Get session by join code (allow anonymous for participants)
        group.MapGet("/code/{code}", async (string code, AppDbContext db) =>
        {
            var session = await db.Sessions
                .Include(s => s.Quiz)
                .Include(s => s.Participants)
                .FirstOrDefaultAsync(s => s.JoinCode == code.ToUpper());
            if (session is null) return Results.NotFound();

            return Results.Ok(new SessionResponse(
                session.Id, session.QuizId, session.Quiz.Title, session.JoinCode,
                session.Status.ToString(), session.CurrentQuestionIndex,
                session.Participants.Count, session.StartedAt, session.EndedAt));
        });

        // Start session
        group.MapPost("/{id:guid}/start", async (Guid id, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var session = await db.Sessions.Include(s => s.Quiz).Include(s => s.Participants).FirstOrDefaultAsync(s => s.Id == id);
            if (session is null) return Results.NotFound();
            if (session.CreatedByUserId != userId) return Results.Forbid();
            if (session.Status != SessionStatus.Lobby) return Results.BadRequest("Session already started");

            session.Status = SessionStatus.Active;
            session.StartedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            return Results.Ok(new SessionResponse(
                session.Id, session.QuizId, session.Quiz.Title, session.JoinCode,
                session.Status.ToString(), session.CurrentQuestionIndex,
                session.Participants.Count, session.StartedAt, session.EndedAt));
        }).RequireAuthorization();

        // Next question
        group.MapPost("/{id:guid}/next-question", async (Guid id, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var session = await db.Sessions.Include(s => s.Quiz).ThenInclude(q => q.Questions).Include(s => s.Participants).FirstOrDefaultAsync(s => s.Id == id);
            if (session is null) return Results.NotFound();
            if (session.CreatedByUserId != userId) return Results.Forbid();
            if (session.Status != SessionStatus.Active) return Results.BadRequest("Session not active");

            var totalQuestions = session.Quiz.Questions.Count;
            if (session.CurrentQuestionIndex >= totalQuestions - 1)
                return Results.BadRequest("No more questions");

            session.CurrentQuestionIndex++;
            await db.SaveChangesAsync();

            return Results.Ok(new SessionResponse(
                session.Id, session.QuizId, session.Quiz.Title, session.JoinCode,
                session.Status.ToString(), session.CurrentQuestionIndex,
                session.Participants.Count, session.StartedAt, session.EndedAt));
        }).RequireAuthorization();

        // Finish session
        group.MapPost("/{id:guid}/finish", async (Guid id, ClaimsPrincipal principal, AppDbContext db, IHubContext<QuizHub> hubContext) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var session = await db.Sessions.Include(s => s.Quiz).Include(s => s.Participants).FirstOrDefaultAsync(s => s.Id == id);
            if (session is null) return Results.NotFound();
            if (session.CreatedByUserId != userId) return Results.Forbid();

            session.Status = SessionStatus.Finished;
            session.EndedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            // Notify all connected clients in the session
            await hubContext.Clients.Group(id.ToString()).SendAsync("SessionEnded");

            return Results.Ok(new SessionResponse(
                session.Id, session.QuizId, session.Quiz.Title, session.JoinCode,
                session.Status.ToString(), session.CurrentQuestionIndex,
                session.Participants.Count, session.StartedAt, session.EndedAt));
        }).RequireAuthorization();

        // Leaderboard
        group.MapGet("/{id:guid}/leaderboard", async (Guid id, AppDbContext db) =>
        {
            var participants = await db.Participants
                .Where(p => p.SessionId == id)
                .OrderByDescending(p => p.Score)
                .ToListAsync();

            var leaderboard = participants.Select((p, i) => new LeaderboardEntry(i + 1, p.Nickname, p.Score, p.Emoji, p.Color)).ToList();
            return Results.Ok(leaderboard);
        }).RequireAuthorization();

        // Session analytics
        group.MapGet("/{id:guid}/analytics", async (Guid id, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var session = await db.Sessions
                .Include(s => s.Quiz)
                    .ThenInclude(q => q.Questions.OrderBy(qu => qu.Order))
                        .ThenInclude(q => q.AnswerOptions.OrderBy(a => a.Order))
                .Include(s => s.Participants)
                    .ThenInclude(p => p.Answers)
                .FirstOrDefaultAsync(s => s.Id == id);

            if (session is null) return Results.NotFound();
            if (session.CreatedByUserId != userId) return Results.Forbid();

            var questions = session.Quiz.Questions.Select(q => new QuestionAnalytics(
                q.Id, q.Text, q.Order, q.Points, q.TimeLimitSeconds,
                q.AnswerOptions.Select(a => new AnswerOptionAnalytics(a.Id, a.Text, a.IsCorrect, a.Order)).ToList(),
                session.Participants.SelectMany(p => p.Answers
                    .Where(a => a.QuestionId == q.Id)
                    .Select(a => new ParticipantAnswerAnalytics(
                        p.Id, p.Nickname, p.Emoji,
                        a.SelectedAnswerOptionId, a.AnsweredAt,
                        a.IsCorrect, a.AwardedPoints
                    ))
                ).ToList()
            )).ToList();

            return Results.Ok(new SessionAnalyticsResponse(
                session.Id, session.Quiz.Title, session.Status.ToString(),
                session.Participants.Count, session.StartedAt, session.EndedAt,
                questions
            ));
        }).RequireAuthorization();

        // Delete session analytics
        group.MapDelete("/{id:guid}/analytics", async (Guid id, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var session = await db.Sessions
                .Include(s => s.Participants)
                .FirstOrDefaultAsync(s => s.Id == id);

            if (session is null) return Results.NotFound();
            if (session.CreatedByUserId != userId) return Results.Forbid();

            var participantIds = session.Participants.Select(p => p.Id).ToList();
            var answers = await db.ParticipantAnswers
                .Where(a => participantIds.Contains(a.ParticipantId))
                .ToListAsync();

            db.ParticipantAnswers.RemoveRange(answers);
            foreach (var p in session.Participants) p.Score = 0;
            await db.SaveChangesAsync();

            return Results.NoContent();
        }).RequireAuthorization();
    }

    private static string GenerateJoinCode()
    {
        var random = Random.Shared;
        return new string(Enumerable.Range(0, 6).Select(_ => JoinCodeChars[random.Next(JoinCodeChars.Length)]).ToArray());
    }
}
