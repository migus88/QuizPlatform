using Microsoft.AspNetCore.Identity;

namespace QuizPlatform.Api.Models;

public class User : IdentityUser
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Quiz> Quizzes { get; set; } = [];
    public ICollection<Session> Sessions { get; set; } = [];
    public ICollection<RefreshToken> RefreshTokens { get; set; } = [];
}
