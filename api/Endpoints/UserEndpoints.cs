using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using QuizPlatform.Api.DTOs;
using QuizPlatform.Api.Models;

namespace QuizPlatform.Api.Endpoints;

public static class UserEndpoints
{
    public static void MapUserEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/users")
            .RequireAuthorization(policy => policy.RequireRole("Admin"))
            .WithTags("Users");

        group.MapGet("/", async (UserManager<User> userManager) =>
        {
            var users = userManager.Users.ToList();
            var result = new List<UserResponse>();
            foreach (var user in users)
            {
                var roles = await userManager.GetRolesAsync(user);
                result.Add(new UserResponse(user.Id, user.Email!, user.FirstName, user.LastName, roles.FirstOrDefault() ?? "User", user.CreatedAt));
            }
            return Results.Ok(result);
        });

        group.MapGet("/{id}", async (string id, UserManager<User> userManager) =>
        {
            var user = await userManager.FindByIdAsync(id);
            if (user is null) return Results.NotFound();

            var roles = await userManager.GetRolesAsync(user);
            return Results.Ok(new UserResponse(user.Id, user.Email!, user.FirstName, user.LastName, roles.FirstOrDefault() ?? "User", user.CreatedAt));
        });

        group.MapPost("/", async (CreateUserRequest request, UserManager<User> userManager) =>
        {
            var user = new User
            {
                UserName = request.Email,
                Email = request.Email,
                FirstName = request.FirstName,
                LastName = request.LastName,
                EmailConfirmed = true
            };

            var result = await userManager.CreateAsync(user, request.Password);
            if (!result.Succeeded)
                return Results.BadRequest(result.Errors);

            var roleResult = await userManager.AddToRoleAsync(user, request.Role);
            if (!roleResult.Succeeded)
                return Results.BadRequest(roleResult.Errors);

            return Results.Created($"/api/users/{user.Id}", new UserResponse(user.Id, user.Email!, user.FirstName, user.LastName, request.Role, user.CreatedAt));
        });

        group.MapPut("/{id}", async (string id, UpdateUserRequest request, UserManager<User> userManager) =>
        {
            var user = await userManager.FindByIdAsync(id);
            if (user is null) return Results.NotFound();

            if (request.FirstName is not null) user.FirstName = request.FirstName;
            if (request.LastName is not null) user.LastName = request.LastName;
            if (request.Email is not null)
            {
                user.Email = request.Email;
                user.UserName = request.Email;
            }

            await userManager.UpdateAsync(user);

            if (request.Role is not null)
            {
                var currentRoles = await userManager.GetRolesAsync(user);
                if (currentRoles.Any())
                    await userManager.RemoveFromRolesAsync(user, currentRoles);
                await userManager.AddToRoleAsync(user, request.Role);
            }

            var roles = await userManager.GetRolesAsync(user);
            return Results.Ok(new UserResponse(user.Id, user.Email!, user.FirstName, user.LastName, roles.FirstOrDefault() ?? "User", user.CreatedAt));
        });

        group.MapDelete("/{id}", async (string id, ClaimsPrincipal principal, UserManager<User> userManager) =>
        {
            var currentUserId = principal.FindFirstValue(ClaimTypes.NameIdentifier);
            if (id == currentUserId)
                return Results.BadRequest("Cannot delete yourself");

            var user = await userManager.FindByIdAsync(id);
            if (user is null) return Results.NotFound();

            await userManager.DeleteAsync(user);
            return Results.NoContent();
        });
    }
}
