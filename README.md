# Quiz Platform

A realtime quiz platform inspired by Kahoot, built for classroom use. Hosts present questions on a big screen while participants answer from their phones using a join code.

> **Disclaimer:** This project was vibe-coded with AI assistance and has **not been thoroughly tested or audited**. It may contain bugs, security issues, or incomplete functionality. Use at your own risk and do not deploy to production without proper review.

## What it does

- Admins create quizzes with multiple-choice questions (4 options each)
- A host launches a live session and displays a join code
- Participants join from their phones, answer questions in realtime
- Scores and leaderboards update live between rounds via SignalR

## Tech Stack

- **Backend:** .NET 10, ASP.NET Core Minimal APIs, Entity Framework Core, PostgreSQL, SignalR
- **Frontend:** Next.js, TypeScript, Tailwind CSS, shadcn/ui
- **Auth:** ASP.NET Core Identity + JWT
- **Infra:** Docker, Docker Compose

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/)
- [Node.js 22+](https://nodejs.org/)
- [Docker](https://www.docker.com/) (for PostgreSQL and/or deployment)

## Running Locally

Start PostgreSQL:

```bash
docker-compose up -d postgres
```

Install frontend dependencies:

```bash
cd web && npm install
```

Run both API and frontend:

```bash
make dev
```

Or run them separately:

```bash
make api   # API on http://localhost:5063
make web   # Frontend on http://localhost:3000
```

The API auto-runs database migrations and seeds a default admin user on startup.

**Default admin login:** `admin@admin.com` / `Admin1!`

## Deploying with Docker

Build and start the full stack locally (API + frontend + PostgreSQL):

```bash
make docker-up    # local-only stack
make docker-down
```

## Production Deployment

QuizPlatform deploys to a shared VM via:

```bash
make deploy
```

See `docs/deploy/README.md` for the local `.env` setup, the architecture, and what the deploy script does.
