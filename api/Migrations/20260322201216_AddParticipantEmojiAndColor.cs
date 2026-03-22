using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace QuizPlatform.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddParticipantEmojiAndColor : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Color",
                table: "Participants",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Emoji",
                table: "Participants",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Color",
                table: "Participants");

            migrationBuilder.DropColumn(
                name: "Emoji",
                table: "Participants");
        }
    }
}
