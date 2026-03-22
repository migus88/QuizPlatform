namespace QuizPlatform.Api.Models;

public class Participant
{
    public Guid Id { get; set; }
    public Guid SessionId { get; set; }
    public string Nickname { get; set; } = string.Empty;
    public string? UserId { get; set; }
    public string? ConnectionId { get; set; }
    public int Score { get; set; }
    public string Emoji { get; set; } = string.Empty;
    public string Color { get; set; } = string.Empty;
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    public bool IsConnected { get; set; } = true;

    public Session Session { get; set; } = null!;
    public User? User { get; set; }
    public ICollection<ParticipantAnswer> Answers { get; set; } = [];
}
