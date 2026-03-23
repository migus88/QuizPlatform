using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using QuizPlatform.Api.Data;
using QuizPlatform.Api.DTOs;
using QuizPlatform.Api.Models;

namespace QuizPlatform.Api.Endpoints;

public static class QuizEndpoints
{
    public static void MapQuizEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/quizzes").RequireAuthorization().WithTags("Quizzes");

        // List own quizzes
        group.MapGet("/", async (ClaimsPrincipal principal, AppDbContext db, int page = 1, int pageSize = 20) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;

            var query = db.Quizzes.Where(q => q.CreatedByUserId == userId);
            var totalCount = await query.CountAsync();

            var quizzes = await query
                .OrderByDescending(q => q.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(q => new QuizListResponse(
                    q.Id, q.Title, q.Description,
                    q.Questions.Count, q.CreatedAt))
                .ToListAsync();

            return Results.Ok(new { items = quizzes, totalCount, page, pageSize });
        });

        // Admin: list all quizzes with search, filter, sort
        group.MapGet("/admin", async (ClaimsPrincipal principal, AppDbContext db,
            int page = 1, int pageSize = 20, string? search = null, string? sortBy = null, string? sortDir = null) =>
        {
            if (!principal.IsInRole("Admin")) return Results.Forbid();

            var query = db.Quizzes.AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim().ToLower();
                query = query.Where(q =>
                    q.Title.ToLower().Contains(term) ||
                    q.CreatedBy.FirstName.ToLower().Contains(term) ||
                    q.CreatedBy.LastName.ToLower().Contains(term) ||
                    q.CreatedBy.Email!.ToLower().Contains(term));
            }

            var totalCount = await query.CountAsync();

            query = sortBy?.ToLower() switch
            {
                "title" => sortDir == "asc" ? query.OrderBy(q => q.Title) : query.OrderByDescending(q => q.Title),
                "owner" => sortDir == "asc" ? query.OrderBy(q => q.CreatedBy.FirstName) : query.OrderByDescending(q => q.CreatedBy.FirstName),
                "questions" => sortDir == "asc" ? query.OrderBy(q => q.Questions.Count) : query.OrderByDescending(q => q.Questions.Count),
                _ => query.OrderByDescending(q => q.CreatedAt),
            };

            var quizzes = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(q => new AdminQuizListResponse(
                    q.Id, q.Title, q.Description,
                    q.Questions.Count, q.CreatedAt,
                    q.CreatedBy.FirstName + " " + q.CreatedBy.LastName, q.CreatedBy.Email!))
                .ToListAsync();

            return Results.Ok(new { items = quizzes, totalCount, page, pageSize });
        });

        // Get quiz by id (owner or admin)
        group.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var isAdmin = principal.IsInRole("Admin");

            var quiz = await db.Quizzes
                .Include(q => q.Questions.OrderBy(qu => qu.Order))
                    .ThenInclude(q => q.AnswerOptions.OrderBy(a => a.Order))
                .FirstOrDefaultAsync(q => q.Id == id);

            if (quiz is null) return Results.NotFound();
            if (!isAdmin && quiz.CreatedByUserId != userId) return Results.NotFound();

            var questions = quiz.Questions.Select(q => new QuestionResponse(
                q.Id, q.Text, q.TimeLimitSeconds, q.Points, q.DisableTimeScoring, q.Order,
                q.AnswerOptions.Select(a => new AnswerOptionResponse(
                    a.Id, a.Text, a.IsCorrect, a.PointsOverride, a.Order
                )).ToList()
            )).ToList();

            return Results.Ok(new QuizDetailResponse(
                quiz.Id, quiz.Title, quiz.Description, quiz.RandomizeAnswerOrder,
                questions, quiz.CreatedAt, quiz.UpdatedAt));
        });

        // Create quiz
        group.MapPost("/", async (CreateQuizRequest request, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var quiz = new Quiz
            {
                Id = Guid.NewGuid(),
                Title = request.Title,
                Description = request.Description,
                CreatedByUserId = userId
            };

            db.Quizzes.Add(quiz);
            await db.SaveChangesAsync();

            return Results.Created($"/api/quizzes/{quiz.Id}", new QuizDetailResponse(
                quiz.Id, quiz.Title, quiz.Description, quiz.RandomizeAnswerOrder,
                [], quiz.CreatedAt, quiz.UpdatedAt));
        });

        // Update quiz (owner or admin)
        group.MapPut("/{id:guid}", async (Guid id, UpdateQuizRequest request, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var isAdmin = principal.IsInRole("Admin");

            var quiz = await db.Quizzes.FindAsync(id);
            if (quiz is null) return Results.NotFound();
            if (!isAdmin && quiz.CreatedByUserId != userId) return Results.Forbid();

            if (request.Title is not null) quiz.Title = request.Title;
            if (request.Description is not null) quiz.Description = request.Description;
            if (request.RandomizeAnswerOrder.HasValue) quiz.RandomizeAnswerOrder = request.RandomizeAnswerOrder.Value;

            await db.SaveChangesAsync();

            return Results.Ok(new QuizDetailResponse(
                quiz.Id, quiz.Title, quiz.Description, quiz.RandomizeAnswerOrder,
                [], quiz.CreatedAt, quiz.UpdatedAt));
        });

        // Delete quiz (owner or admin)
        group.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var isAdmin = principal.IsInRole("Admin");

            var quiz = await db.Quizzes.FindAsync(id);
            if (quiz is null) return Results.NotFound();
            if (!isAdmin && quiz.CreatedByUserId != userId) return Results.Forbid();

            db.Quizzes.Remove(quiz);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // Add question to quiz (owner or admin)
        group.MapPost("/{id:guid}/questions", async (Guid id, CreateQuestionRequest request, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var isAdmin = principal.IsInRole("Admin");

            var quiz = await db.Quizzes.FindAsync(id);
            if (quiz is null) return Results.NotFound();
            if (!isAdmin && quiz.CreatedByUserId != userId) return Results.Forbid();

            if (request.AnswerOptions.Count < 2 || request.AnswerOptions.Count > 6)
                return Results.BadRequest("Between 2 and 6 answer options are required");
            if (request.AnswerOptions.Count(a => a.IsCorrect) < 1)
                return Results.BadRequest("At least 1 correct answer is required");

            var maxOrder = await db.Questions.Where(q => q.QuizId == id).MaxAsync(q => (int?)q.Order) ?? 0;

            var question = new Question
            {
                Id = Guid.NewGuid(),
                QuizId = id,
                Text = request.Text,
                TimeLimitSeconds = request.TimeLimitSeconds,
                Points = request.Points,
                DisableTimeScoring = request.DisableTimeScoring,
                Order = maxOrder + 1
            };

            var answerOptions = request.AnswerOptions.Select((a, i) => new AnswerOption
            {
                Id = Guid.NewGuid(),
                QuestionId = question.Id,
                Text = a.Text,
                IsCorrect = a.IsCorrect,
                PointsOverride = a.PointsOverride,
                Order = i
            }).ToList();

            question.AnswerOptions = answerOptions;
            db.Questions.Add(question);
            await db.SaveChangesAsync();

            return Results.Created($"/api/quizzes/{id}/questions/{question.Id}", new QuestionResponse(
                question.Id, question.Text, question.TimeLimitSeconds, question.Points, question.DisableTimeScoring, question.Order,
                answerOptions.Select(a => new AnswerOptionResponse(a.Id, a.Text, a.IsCorrect, a.PointsOverride, a.Order)).ToList()));
        });

        // Update question (owner or admin)
        group.MapPut("/{quizId:guid}/questions/{questionId:guid}", async (Guid quizId, Guid questionId, UpdateQuestionRequest request, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var isAdmin = principal.IsInRole("Admin");

            var quiz = await db.Quizzes.FindAsync(quizId);
            if (quiz is null) return Results.NotFound();
            if (!isAdmin && quiz.CreatedByUserId != userId) return Results.Forbid();

            var question = await db.Questions
                .Include(q => q.AnswerOptions)
                .FirstOrDefaultAsync(q => q.Id == questionId && q.QuizId == quizId);
            if (question is null) return Results.NotFound();

            if (request.AnswerOptions.Count < 2 || request.AnswerOptions.Count > 6)
                return Results.BadRequest("Between 2 and 6 answer options are required");
            if (request.AnswerOptions.Count(a => a.IsCorrect) < 1)
                return Results.BadRequest("At least 1 correct answer is required");

            question.Text = request.Text;
            question.TimeLimitSeconds = request.TimeLimitSeconds;
            question.Points = request.Points;
            question.DisableTimeScoring = request.DisableTimeScoring;

            // Remove old options and add new ones
            db.AnswerOptions.RemoveRange(question.AnswerOptions);
            var newOptions = request.AnswerOptions.Select((a, i) => new AnswerOption
            {
                Id = Guid.NewGuid(),
                QuestionId = questionId,
                Text = a.Text,
                IsCorrect = a.IsCorrect,
                PointsOverride = a.PointsOverride,
                Order = i
            }).ToList();
            db.AnswerOptions.AddRange(newOptions);

            await db.SaveChangesAsync();

            return Results.Ok(new QuestionResponse(
                question.Id, question.Text, question.TimeLimitSeconds, question.Points, question.DisableTimeScoring, question.Order,
                newOptions.Select(a => new AnswerOptionResponse(a.Id, a.Text, a.IsCorrect, a.PointsOverride, a.Order)).ToList()));
        });

        // Delete question (owner or admin)
        group.MapDelete("/{quizId:guid}/questions/{questionId:guid}", async (Guid quizId, Guid questionId, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var isAdmin = principal.IsInRole("Admin");

            var quiz = await db.Quizzes.FindAsync(quizId);
            if (quiz is null) return Results.NotFound();
            if (!isAdmin && quiz.CreatedByUserId != userId) return Results.Forbid();

            var question = await db.Questions.FirstOrDefaultAsync(q => q.Id == questionId && q.QuizId == quizId);
            if (question is null) return Results.NotFound();

            db.Questions.Remove(question);
            await db.SaveChangesAsync();

            // Reorder remaining questions
            var remaining = await db.Questions.Where(q => q.QuizId == quizId).OrderBy(q => q.Order).ToListAsync();
            for (int i = 0; i < remaining.Count; i++)
                remaining[i].Order = i + 1;
            await db.SaveChangesAsync();

            return Results.NoContent();
        });

        // Bulk delete questions (owner or admin)
        group.MapPost("/{quizId:guid}/questions/bulk-delete", async (Guid quizId, List<Guid> questionIds, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var isAdmin = principal.IsInRole("Admin");

            var quiz = await db.Quizzes.FindAsync(quizId);
            if (quiz is null) return Results.NotFound();
            if (!isAdmin && quiz.CreatedByUserId != userId) return Results.Forbid();

            var questions = await db.Questions.Where(q => q.QuizId == quizId && questionIds.Contains(q.Id)).ToListAsync();
            db.Questions.RemoveRange(questions);
            await db.SaveChangesAsync();

            // Reorder remaining questions
            var remaining = await db.Questions.Where(q => q.QuizId == quizId).OrderBy(q => q.Order).ToListAsync();
            for (int i = 0; i < remaining.Count; i++)
                remaining[i].Order = i + 1;
            await db.SaveChangesAsync();

            return Results.NoContent();
        });

        // Reorder questions (owner or admin)
        group.MapPut("/{id:guid}/questions/reorder", async (Guid id, List<Guid> questionIds, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var isAdmin = principal.IsInRole("Admin");

            var quiz = await db.Quizzes.FindAsync(id);
            if (quiz is null) return Results.NotFound();
            if (!isAdmin && quiz.CreatedByUserId != userId) return Results.Forbid();

            var questions = await db.Questions.Where(q => q.QuizId == id).ToListAsync();
            for (int i = 0; i < questionIds.Count; i++)
            {
                var q = questions.FirstOrDefault(q => q.Id == questionIds[i]);
                if (q is not null) q.Order = i + 1;
            }
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }
}
