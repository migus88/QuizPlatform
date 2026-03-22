namespace QuizPlatform.Api.DTOs;

public record UserResponse(string Id, string Email, string FirstName, string LastName, string Role, DateTime CreatedAt);
public record CreateUserRequest(string Email, string Password, string FirstName, string LastName, string Role);
public record UpdateUserRequest(string? FirstName, string? LastName, string? Email, string? Role);
public record UpdateProfileRequest(string FirstName, string LastName);
