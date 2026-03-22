namespace QuizPlatform.Api.DTOs;

public record SessionResponse(Guid Id, Guid QuizId, string QuizTitle, string JoinCode, string Status, int CurrentQuestionIndex, int ParticipantCount, DateTime? StartedAt, DateTime? EndedAt);
public record CreateSessionRequest(Guid QuizId);
public record JoinSessionRequest(string JoinCode, string Nickname);
public record ParticipantResponse(Guid Id, string Nickname, int Score, bool IsConnected);
public record LeaderboardEntry(int Rank, string Nickname, int Score);
public record SubmitAnswerRequest(Guid AnswerOptionId);
