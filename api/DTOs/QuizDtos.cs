namespace QuizPlatform.Api.DTOs;

public record QuizListResponse(Guid Id, string Title, string? Description, bool IsPublished, int QuestionCount, DateTime CreatedAt);
public record QuizDetailResponse(Guid Id, string Title, string? Description, bool IsPublished, List<QuestionResponse> Questions, DateTime CreatedAt, DateTime UpdatedAt);
public record QuestionResponse(Guid Id, string Text, int TimeLimitSeconds, int Points, bool DisableTimeScoring, int Order, List<AnswerOptionResponse> AnswerOptions);
public record AnswerOptionResponse(Guid Id, string Text, bool IsCorrect, int? PointsOverride, int Order);
public record CreateQuizRequest(string Title, string? Description);
public record UpdateQuizRequest(string? Title, string? Description, bool? IsPublished);
public record CreateQuestionRequest(string Text, int TimeLimitSeconds, int Points, bool DisableTimeScoring, List<CreateAnswerOptionRequest> AnswerOptions);
public record UpdateQuestionRequest(string Text, int TimeLimitSeconds, int Points, bool DisableTimeScoring, List<CreateAnswerOptionRequest> AnswerOptions);
public record CreateAnswerOptionRequest(string Text, bool IsCorrect, int? PointsOverride = null);
