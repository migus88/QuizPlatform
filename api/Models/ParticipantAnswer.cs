namespace QuizPlatform.Api.Models;

public class ParticipantAnswer
{
    public Guid Id { get; set; }
    public Guid ParticipantId { get; set; }
    public Guid QuestionId { get; set; }
    public Guid? SelectedAnswerOptionId { get; set; }
    public DateTime AnsweredAt { get; set; } = DateTime.UtcNow;
    public bool IsCorrect { get; set; }
    public int AwardedPoints { get; set; }

    public Participant Participant { get; set; } = null!;
    public Question Question { get; set; } = null!;
    public AnswerOption? SelectedAnswerOption { get; set; }
}
