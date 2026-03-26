using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using QuizPlatform.Api.Data;
using QuizPlatform.Api.DTOs;
using QuizPlatform.Api.Models;

namespace QuizPlatform.Api.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/auth").WithTags("Auth");

        group.MapPost("/login", async (LoginRequest request, UserManager<User> userManager, SignInManager<User> signInManager, IConfiguration config, AppDbContext db) =>
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
            var refreshToken = await CreateRefreshToken(user.Id, config, db);

            return Results.Ok(new AuthResponse(token, refreshToken.Token, user.Email!, user.FirstName, user.LastName, role));
        });

        group.MapPost("/refresh", async (RefreshTokenRequest request, AppDbContext db, UserManager<User> userManager, IConfiguration config) =>
        {
            var storedToken = await db.RefreshTokens
                .Include(r => r.User)
                .FirstOrDefaultAsync(r => r.Token == request.RefreshToken);

            if (storedToken is null)
                return Results.Unauthorized();

            // Reuse detection: if token was already revoked, someone is reusing an old token
            if (storedToken.RevokedAt is not null)
            {
                // Revoke all tokens for this user as a security measure
                await db.RefreshTokens
                    .Where(r => r.UserId == storedToken.UserId && r.RevokedAt == null)
                    .ExecuteUpdateAsync(s => s.SetProperty(r => r.RevokedAt, DateTime.UtcNow));
                return Results.Unauthorized();
            }

            if (storedToken.ExpiresAt < DateTime.UtcNow)
                return Results.Unauthorized();

            // Rotate: revoke old token and create new one
            storedToken.RevokedAt = DateTime.UtcNow;
            var newRefreshToken = await CreateRefreshToken(storedToken.UserId, config, db);
            storedToken.ReplacedByTokenId = newRefreshToken.Id;
            await db.SaveChangesAsync();

            // Clean up expired tokens for this user
            await db.RefreshTokens
                .Where(r => r.UserId == storedToken.UserId && r.ExpiresAt < DateTime.UtcNow)
                .ExecuteDeleteAsync();

            var user = storedToken.User;
            var roles = await userManager.GetRolesAsync(user);
            var role = roles.FirstOrDefault() ?? "User";
            var token = GenerateToken(user, role, config);

            return Results.Ok(new AuthResponse(token, newRefreshToken.Token, user.Email!, user.FirstName, user.LastName, role));
        });

        group.MapPost("/logout", async (RefreshTokenRequest request, AppDbContext db) =>
        {
            var storedToken = await db.RefreshTokens
                .FirstOrDefaultAsync(r => r.Token == request.RefreshToken);

            if (storedToken is not null && storedToken.RevokedAt is null)
            {
                storedToken.RevokedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
            }

            return Results.Ok();
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

            return Results.Ok(new AuthResponse(string.Empty, string.Empty, user.Email!, user.FirstName, user.LastName, role));
        }).RequireAuthorization();
    }

    private static string GenerateToken(User user, string role, IConfiguration config)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Key"]!));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expiry = int.Parse(config["Jwt:ExpiryInMinutes"] ?? "15");

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

    private static async Task<RefreshToken> CreateRefreshToken(string userId, IConfiguration config, AppDbContext db)
    {
        var expiryDays = int.Parse(config["Jwt:RefreshTokenExpiryInDays"] ?? "30");
        var refreshToken = new RefreshToken
        {
            Id = Guid.NewGuid(),
            Token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)),
            UserId = userId,
            ExpiresAt = DateTime.UtcNow.AddDays(expiryDays),
            CreatedAt = DateTime.UtcNow
        };

        db.RefreshTokens.Add(refreshToken);
        await db.SaveChangesAsync();
        return refreshToken;
    }
}
