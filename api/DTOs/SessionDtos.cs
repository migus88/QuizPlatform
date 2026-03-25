namespace QuizPlatform.Api.DTOs;

public record SessionResponse(Guid Id, Guid QuizId, string QuizTitle, string JoinCode, string Status, int CurrentQuestionIndex, int ParticipantCount, DateTime? StartedAt, DateTime? EndedAt);
public record CreateSessionRequest(Guid QuizId);
public record JoinSessionRequest(string JoinCode, string Nickname);
public record ParticipantResponse(Guid Id, string Nickname, int Score, bool IsConnected, string Emoji, string Color);
public record LeaderboardEntry(int Rank, string Nickname, int Score, string Emoji, string Color, int? Diff = null);
public record SubmitAnswerRequest(Guid AnswerOptionId);

// Analytics
public record SessionAnalyticsResponse(
    Guid SessionId,
    string QuizTitle,
    string Status,
    int TotalParticipants,
    DateTime? StartedAt,
    DateTime? EndedAt,
    List<QuestionAnalytics> Questions
);

public record QuestionAnalytics(
    Guid QuestionId,
    string Text,
    int Order,
    int Points,
    int TimeLimitSeconds,
    List<AnswerOptionAnalytics> Options,
    List<ParticipantAnswerAnalytics> ParticipantAnswers
);

public record AnswerOptionAnalytics(Guid Id, string Text, bool IsCorrect, int Order);

public record ParticipantAnswerAnalytics(
    Guid ParticipantId,
    string Nickname,
    string Emoji,
    Guid? SelectedAnswerOptionId,
    DateTime AnsweredAt,
    bool IsCorrect,
    int AwardedPoints
);
