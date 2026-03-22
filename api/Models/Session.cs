namespace QuizPlatform.Api.Models;

public enum SessionStatus
{
    Lobby,
    Active,
    Finished
}

public class Session
{
    public Guid Id { get; set; }
    public Guid QuizId { get; set; }
    public string JoinCode { get; set; } = string.Empty;
    public SessionStatus Status { get; set; } = SessionStatus.Lobby;
    public int CurrentQuestionIndex { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? EndedAt { get; set; }
    public string CreatedByUserId { get; set; } = string.Empty;

    public Quiz Quiz { get; set; } = null!;
    public User CreatedBy { get; set; } = null!;
    public ICollection<Participant> Participants { get; set; } = [];
}
