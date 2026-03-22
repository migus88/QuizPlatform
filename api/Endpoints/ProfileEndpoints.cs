using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using QuizPlatform.Api.DTOs;
using QuizPlatform.Api.Models;

namespace QuizPlatform.Api.Endpoints;

public static class ProfileEndpoints
{
    public static void MapProfileEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/profile").RequireAuthorization().WithTags("Profile");

        group.MapGet("/", async (ClaimsPrincipal principal, UserManager<User> userManager) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier);
            var user = await userManager.FindByIdAsync(userId!);
            if (user is null) return Results.NotFound();

            var roles = await userManager.GetRolesAsync(user);
            return Results.Ok(new UserResponse(user.Id, user.Email!, user.FirstName, user.LastName, roles.FirstOrDefault() ?? "User", user.CreatedAt));
        });

        group.MapPut("/", async (UpdateProfileRequest request, ClaimsPrincipal principal, UserManager<User> userManager) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier);
            var user = await userManager.FindByIdAsync(userId!);
            if (user is null) return Results.NotFound();

            user.FirstName = request.FirstName;
            user.LastName = request.LastName;
            await userManager.UpdateAsync(user);

            var roles = await userManager.GetRolesAsync(user);
            return Results.Ok(new UserResponse(user.Id, user.Email!, user.FirstName, user.LastName, roles.FirstOrDefault() ?? "User", user.CreatedAt));
        });
    }
}
