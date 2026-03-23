# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
make dev          # Run API + web in parallel
make api          # API only (http://localhost:5063)
make web          # Web only (http://localhost:3000)
make test         # Run .NET tests
make docker-up    # Full stack via Docker
make docker-down  # Stop Docker
make deploy       # Full production deploy (snapshot + deploy + verify)
make deploy-now   # Quick deploy (skip snapshot)
make deploy-verify # Check production health
make deploy-rollback # Restore from last snapshot
```

Deployment docs: `docs/deploy/README.md`

Database (PostgreSQL via Docker): `docker-compose up -d postgres`. The API auto-runs EF migrations and seeds on startup. Seed admin: `admin@admin.com` / `Admin1!`.

Frontend lint: `cd web && npm run lint`

EF migrations: `cd api && dotnet ef migrations add <Name>`

## Architecture

**Backend**: ASP.NET Core (.NET 10) Minimal APIs + SignalR hub + EF Core + PostgreSQL. JWT auth with Identity.

**Frontend**: Next.js 16 (App Router) + TypeScript + Radix UI/shadcn + Tailwind v4 + @microsoft/signalr.

### Real-time flow

REST API handles CRUD and session lifecycle. SignalR hub (`/hubs/quiz`) handles all live gameplay: joining, question delivery, answer submission, timer ticks, auto-reveal, and leaderboard updates. The hub uses `IHubContext<QuizHub>` + `IServiceScopeFactory` for background timer tasks that outlive the hub method scope.

### Key patterns

- **Endpoint groups**: Each domain (Quiz, Session, Auth, User, Profile) maps a route group in `api/Endpoints/`. Validation is inline, not via filters.
- **SignalR groups**: Each session is a SignalR group keyed by `sessionId`. Participants and host join the group. Events broadcast to the group.
- **Auto-reveal**: When all participants answer OR the timer expires, the server automatically reveals answers (no manual host action needed). The timer runs in a `Task.Run` background task using `IHubContext` (not `Clients` directly, which is scoped to the hub call).
- **Scoring**: `basePoints = answerOption.PointsOverride ?? question.Points`. If `question.DisableTimeScoring` is false: `points = ceil(basePoints * remainingSeconds / totalSeconds)`, minimum 1. Otherwise full `basePoints`.
- **Session deduplication**: `POST /api/sessions` returns an existing active session for the same quiz/user instead of creating a duplicate.
- **React strict mode**: SignalR connections on play/host pages use `setTimeout(setupHub, 0)` with `clearTimeout` in cleanup to prevent "connection stopped during negotiation" errors from strict mode's mount-unmount-remount cycle.

### Frontend routing

- `(auth)/` - Login page
- `(dashboard)/` - Protected: quizzes, sessions (host/analytics), users, profile. Wrapped in `AuthGuard`.
- `(session)/` - Public: `/join` (enter code + nickname), `/play/{sessionId}` (gameplay). No auth required.
- Root `/` redirects to `/join`.

### Data flow for a quiz session

1. Host creates session via REST → gets join code
2. Host page connects to SignalR, calls `JoinAsHost`
3. Participants enter code on `/join`, navigate to `/play/{id}`, connect to SignalR, call `JoinSession`
4. Host starts session (REST) then `StartQuestion` (SignalR)
5. Server broadcasts `QuestionStarted`, starts timer task
6. Players submit answers → `AnswerResult` sent privately (stored, not shown)
7. Timer expires or all answer → server sends `AnswerRevealed` with distribution
8. Host clicks "Show Leaderboard" → `LeaderboardUpdated` broadcast
9. Repeat or finish

## Important caveats

- **Next.js 16 breaking changes**: This version may differ from training data. Check `node_modules/next/dist/docs/` before assuming API behavior. Heed deprecation notices.
- **SignalR invoke args**: Hub methods take separate positional arguments, NOT a single object. E.g., `invoke("JoinSession", joinCode, nickname)`, not `invoke("JoinSession", { joinCode, nickname })`.
- **RevealAnswer data**: Uses `correctOptionIds: string[]` (array), not single `correctOptionId`, since questions can have multiple correct answers.
- **Emoji availability**: `GetAvailableEmojis` returns `{ all: string[], taken: string[] }`. The `taken` list only includes connected participants' emojis.
- **sessionStorage**: Player session info stored in `sessionStorage` under key `quizSession`. Cleared on `SessionEnded`. Join page checks this and redirects to active game if present.
