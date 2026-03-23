using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using QuizPlatform.Api.Data;
using QuizPlatform.Api.Models;

namespace QuizPlatform.Api.Endpoints;

public static class SettingsEndpoints
{
    public static void MapSettingsEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/settings").RequireAuthorization().WithTags("Settings");

        group.MapGet("/", async (AppDbContext db) =>
        {
            var settings = await db.PlatformSettings.FirstAsync();
            return Results.Ok(new { settings.JoinCodeLength });
        });

        group.MapPut("/", async (UpdateSettingsRequest request, ClaimsPrincipal principal, AppDbContext db) =>
        {
            if (!principal.IsInRole("Admin")) return Results.Forbid();

            if (request.JoinCodeLength < 3 || request.JoinCodeLength > 8)
                return Results.BadRequest("Join code length must be between 3 and 8");

            var settings = await db.PlatformSettings.FirstAsync();
            settings.JoinCodeLength = request.JoinCodeLength;
            await db.SaveChangesAsync();

            return Results.Ok(new { settings.JoinCodeLength });
        });
    }

    public record UpdateSettingsRequest(int JoinCodeLength);
}
