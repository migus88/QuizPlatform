namespace QuizPlatform.Api.DTOs;

public record LoginRequest(string Email, string Password);
public record AuthResponse(string Token, string RefreshToken, string Email, string FirstName, string LastName, string Role);
public record RefreshTokenRequest(string RefreshToken);
