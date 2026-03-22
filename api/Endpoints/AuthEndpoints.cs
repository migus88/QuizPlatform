using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using QuizPlatform.Api.DTOs;
using QuizPlatform.Api.Models;

namespace QuizPlatform.Api.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/auth").WithTags("Auth");

        group.MapPost("/login", async (LoginRequest request, UserManager<User> userManager, SignInManager<User> signInManager, IConfiguration config) =>
        {
            var user = await userManager.FindByEmailAsync(request.Email);
            if (user is null)
                return Results.Unauthorized();

            var result = await signInManager.CheckPasswordSignInAsync(user, request.Password, false);
            if (!result.Succeeded)
                return Results.Unauthorized();

            var roles = await userManager.GetRolesAsync(user);
            var role = roles.FirstOrDefault() ?? "User";
            var token = GenerateToken(user, role, config);

            return Results.Ok(new AuthResponse(token, user.Email!, user.FirstName, user.LastName, role));
        });

        group.MapGet("/me", async (ClaimsPrincipal principal, UserManager<User> userManager) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userId is null)
                return Results.Unauthorized();

            var user = await userManager.FindByIdAsync(userId);
            if (user is null)
                return Results.Unauthorized();

            var roles = await userManager.GetRolesAsync(user);
            var role = roles.FirstOrDefault() ?? "User";

            return Results.Ok(new AuthResponse(string.Empty, user.Email!, user.FirstName, user.LastName, role));
        }).RequireAuthorization();
    }

    private static string GenerateToken(User user, string role, IConfiguration config)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Key"]!));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expiry = int.Parse(config["Jwt:ExpiryInMinutes"] ?? "60");

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id),
            new Claim(ClaimTypes.Email, user.Email!),
            new Claim(ClaimTypes.GivenName, user.FirstName),
            new Claim(ClaimTypes.Surname, user.LastName),
            new Claim(ClaimTypes.Role, role)
        };

        var token = new JwtSecurityToken(
            issuer: config["Jwt:Issuer"],
            audience: config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(expiry),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
