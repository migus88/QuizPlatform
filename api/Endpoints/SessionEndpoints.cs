using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using QuizPlatform.Api.Data;
using QuizPlatform.Api.DTOs;
using QuizPlatform.Api.Models;

namespace QuizPlatform.Api.Endpoints;

public static class SessionEndpoints
{
    private static readonly char[] JoinCodeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".ToCharArray();

    public static void MapSessionEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/sessions").WithTags("Sessions");

        // Create session (auth required)
        group.MapPost("/", async (CreateSessionRequest request, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;

            var quiz = await db.Quizzes.Include(q => q.Questions).FirstOrDefaultAsync(q => q.Id == request.QuizId);
            if (quiz is null) return Results.NotFound("Quiz not found");
            if (!quiz.IsPublished) return Results.BadRequest("Quiz must be published to create a session");
            if (!quiz.Questions.Any()) return Results.BadRequest("Quiz must have at least one question");

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
        group.MapPost("/{id:guid}/finish", async (Guid id, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var session = await db.Sessions.Include(s => s.Quiz).Include(s => s.Participants).FirstOrDefaultAsync(s => s.Id == id);
            if (session is null) return Results.NotFound();
            if (session.CreatedByUserId != userId) return Results.Forbid();

            session.Status = SessionStatus.Finished;
            session.EndedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

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

            var leaderboard = participants.Select((p, i) => new LeaderboardEntry(i + 1, p.Nickname, p.Score)).ToList();
            return Results.Ok(leaderboard);
        }).RequireAuthorization();
    }

    private static string GenerateJoinCode()
    {
        var random = Random.Shared;
        return new string(Enumerable.Range(0, 6).Select(_ => JoinCodeChars[random.Next(JoinCodeChars.Length)]).ToArray());
    }
}
