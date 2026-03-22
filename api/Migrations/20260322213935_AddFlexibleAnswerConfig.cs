using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace QuizPlatform.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFlexibleAnswerConfig : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "DisableTimeScoring",
                table: "Questions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "PointsOverride",
                table: "AnswerOptions",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DisableTimeScoring",
                table: "Questions");

            migrationBuilder.DropColumn(
                name: "PointsOverride",
                table: "AnswerOptions");
        }
    }
}
