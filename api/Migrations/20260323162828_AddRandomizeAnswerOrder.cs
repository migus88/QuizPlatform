using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace QuizPlatform.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRandomizeAnswerOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "RandomizeAnswerOrder",
                table: "Quizzes",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            // Set all existing quizzes to true
            migrationBuilder.Sql("UPDATE \"Quizzes\" SET \"RandomizeAnswerOrder\" = true;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RandomizeAnswerOrder",
                table: "Quizzes");
        }
    }
}
