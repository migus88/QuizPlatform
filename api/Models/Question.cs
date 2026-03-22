namespace QuizPlatform.Api.Models;

public class Question
{
    public Guid Id { get; set; }
    public Guid QuizId { get; set; }
    public string Text { get; set; } = string.Empty;
    public int TimeLimitSeconds { get; set; } = 30;
    public int Points { get; set; } = 100;
    public int Order { get; set; }

    public Quiz Quiz { get; set; } = null!;
    public ICollection<AnswerOption> AnswerOptions { get; set; } = [];
}
