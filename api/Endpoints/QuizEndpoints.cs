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

        // List quizzes
        group.MapGet("/", async (ClaimsPrincipal principal, UserManager<User> userManager, AppDbContext db) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var isAdmin = principal.IsInRole("Admin");

            var query = db.Quizzes.AsQueryable();
            if (!isAdmin)
                query = query.Where(q => q.IsPublished);

            var quizzes = await query
                .OrderByDescending(q => q.CreatedAt)
                .Select(q => new QuizListResponse(
                    q.Id, q.Title, q.Description, q.IsPublished,
                    q.Questions.Count, q.CreatedAt))
                .ToListAsync();

            return Results.Ok(quizzes);
        });

        // Get quiz by id
        group.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var isAdmin = principal.IsInRole("Admin");

            var quiz = await db.Quizzes
                .Include(q => q.Questions.OrderBy(qu => qu.Order))
                    .ThenInclude(q => q.AnswerOptions.OrderBy(a => a.Order))
                .FirstOrDefaultAsync(q => q.Id == id);

            if (quiz is null) return Results.NotFound();
            if (!isAdmin && !quiz.IsPublished) return Results.NotFound();

            var questions = quiz.Questions.Select(q => new QuestionResponse(
                q.Id, q.Text, q.TimeLimitSeconds, q.Points, q.Order,
                q.AnswerOptions.Select(a => new AnswerOptionResponse(
                    a.Id, a.Text, isAdmin ? a.IsCorrect : false, a.Order
                )).ToList()
            )).ToList();

            return Results.Ok(new QuizDetailResponse(
                quiz.Id, quiz.Title, quiz.Description, quiz.IsPublished,
                questions, quiz.CreatedAt, quiz.UpdatedAt));
        });

        // Create quiz (admin only)
        group.MapPost("/", async (CreateQuizRequest request, ClaimsPrincipal principal, AppDbContext db) =>
        {
            if (!principal.IsInRole("Admin")) return Results.Forbid();

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
                quiz.Id, quiz.Title, quiz.Description, quiz.IsPublished,
                [], quiz.CreatedAt, quiz.UpdatedAt));
        });

        // Update quiz (admin only)
        group.MapPut("/{id:guid}", async (Guid id, UpdateQuizRequest request, ClaimsPrincipal principal, AppDbContext db) =>
        {
            if (!principal.IsInRole("Admin")) return Results.Forbid();

            var quiz = await db.Quizzes.FindAsync(id);
            if (quiz is null) return Results.NotFound();

            if (request.Title is not null) quiz.Title = request.Title;
            if (request.Description is not null) quiz.Description = request.Description;
            if (request.IsPublished.HasValue) quiz.IsPublished = request.IsPublished.Value;

            await db.SaveChangesAsync();

            var questionCount = await db.Questions.CountAsync(q => q.QuizId == id);
            return Results.Ok(new QuizDetailResponse(
                quiz.Id, quiz.Title, quiz.Description, quiz.IsPublished,
                [], quiz.CreatedAt, quiz.UpdatedAt));
        });

        // Delete quiz (admin only)
        group.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal principal, AppDbContext db) =>
        {
            if (!principal.IsInRole("Admin")) return Results.Forbid();

            var quiz = await db.Quizzes.FindAsync(id);
            if (quiz is null) return Results.NotFound();

            db.Quizzes.Remove(quiz);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // Add question to quiz (admin only)
        group.MapPost("/{id:guid}/questions", async (Guid id, CreateQuestionRequest request, ClaimsPrincipal principal, AppDbContext db) =>
        {
            if (!principal.IsInRole("Admin")) return Results.Forbid();

            var quiz = await db.Quizzes.FindAsync(id);
            if (quiz is null) return Results.NotFound();

            // Validate exactly 4 options
            if (request.AnswerOptions.Count != 4)
                return Results.BadRequest("Exactly 4 answer options are required");

            // Validate exactly 1 correct
            if (request.AnswerOptions.Count(a => a.IsCorrect) != 1)
                return Results.BadRequest("Exactly 1 correct answer is required");

            var maxOrder = await db.Questions.Where(q => q.QuizId == id).MaxAsync(q => (int?)q.Order) ?? 0;

            var question = new Question
            {
                Id = Guid.NewGuid(),
                QuizId = id,
                Text = request.Text,
                TimeLimitSeconds = request.TimeLimitSeconds,
                Points = request.Points,
                Order = maxOrder + 1
            };

            var answerOptions = request.AnswerOptions.Select((a, i) => new AnswerOption
            {
                Id = Guid.NewGuid(),
                QuestionId = question.Id,
                Text = a.Text,
                IsCorrect = a.IsCorrect,
                Order = i
            }).ToList();

            question.AnswerOptions = answerOptions;
            db.Questions.Add(question);
            await db.SaveChangesAsync();

            return Results.Created($"/api/quizzes/{id}/questions/{question.Id}", new QuestionResponse(
                question.Id, question.Text, question.TimeLimitSeconds, question.Points, question.Order,
                answerOptions.Select(a => new AnswerOptionResponse(a.Id, a.Text, a.IsCorrect, a.Order)).ToList()));
        });

        // Update question (admin only)
        group.MapPut("/{quizId:guid}/questions/{questionId:guid}", async (Guid quizId, Guid questionId, UpdateQuestionRequest request, ClaimsPrincipal principal, AppDbContext db) =>
        {
            if (!principal.IsInRole("Admin")) return Results.Forbid();

            var question = await db.Questions
                .Include(q => q.AnswerOptions)
                .FirstOrDefaultAsync(q => q.Id == questionId && q.QuizId == quizId);
            if (question is null) return Results.NotFound();

            if (request.AnswerOptions.Count != 4)
                return Results.BadRequest("Exactly 4 answer options are required");
            if (request.AnswerOptions.Count(a => a.IsCorrect) != 1)
                return Results.BadRequest("Exactly 1 correct answer is required");

            question.Text = request.Text;
            question.TimeLimitSeconds = request.TimeLimitSeconds;
            question.Points = request.Points;

            // Remove old options and add new ones
            db.AnswerOptions.RemoveRange(question.AnswerOptions);
            var newOptions = request.AnswerOptions.Select((a, i) => new AnswerOption
            {
                Id = Guid.NewGuid(),
                QuestionId = questionId,
                Text = a.Text,
                IsCorrect = a.IsCorrect,
                Order = i
            }).ToList();
            db.AnswerOptions.AddRange(newOptions);

            await db.SaveChangesAsync();

            return Results.Ok(new QuestionResponse(
                question.Id, question.Text, question.TimeLimitSeconds, question.Points, question.Order,
                newOptions.Select(a => new AnswerOptionResponse(a.Id, a.Text, a.IsCorrect, a.Order)).ToList()));
        });

        // Delete question (admin only)
        group.MapDelete("/{quizId:guid}/questions/{questionId:guid}", async (Guid quizId, Guid questionId, ClaimsPrincipal principal, AppDbContext db) =>
        {
            if (!principal.IsInRole("Admin")) return Results.Forbid();

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

        // Reorder questions (admin only)
        group.MapPut("/{id:guid}/questions/reorder", async (Guid id, List<Guid> questionIds, ClaimsPrincipal principal, AppDbContext db) =>
        {
            if (!principal.IsInRole("Admin")) return Results.Forbid();

            var questions = await db.Questions.Where(q => q.QuizId == id).ToListAsync();
            for (int i = 0; i < questionIds.Count; i++)
            {
                var q = questions.FirstOrDefault(q => q.Id == questionIds[i]);
                if (q is not null) q.Order = i + 1;
            }
            await db.SaveChangesAsync();
            return Results.Ok();
        });
    }
}
