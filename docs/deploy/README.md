# Deploying QuizPlatform

QuizPlatform deploys to a shared VM that hosts multiple small sites behind a single Caddy reverse proxy. Each site (this one included) runs as an isolated Docker stack with its own Postgres container.

From a developer's perspective, every deploy is just:

```bash
make deploy
```

## Local setup

Copy `.env.example` to `.env` at the repo root. Fill in:

- **Local-only deployment vars** (read by `scripts/deploy.sh`):
  - `DEPLOY_SSH_USER` — SSH user on the shared VM (e.g. `ubuntu`)
  - `DEPLOY_SSH_HOST` — shared VM IP or hostname
  - `DEPLOY_SSH_KEY` — local path to the SSH private key
  - `DEPLOY_REMOTE_DIR` — `/home/ubuntu/sites/quizplatform`
  - `DEPLOY_SITE_NAME` — `quizplatform`
  - `DEPLOY_API_URL` — public production URL
  - `DEPLOY_HEALTH_PATH` — `/health` (this site exposes health at root, not under `/api`)

- **Production env** (the API + frontend read these on the VM): see `.env.example` for the full list — DB connection, JWT key, public URL, CORS origin.

## What `make deploy` does

`scripts/deploy.sh` runs locally and:

1. SSHes to the shared VM and `git pull`s in `$DEPLOY_REMOTE_DIR`.
2. Copies `deploy/caddy/quizplatform.caddy` into the shared Caddy's `sites.d/` directory.
3. Rebuilds the stack: `docker compose -f docker/docker-compose.prod.yml --env-file .env up -d --build --remove-orphans`.
4. Reloads the shared Caddy to pick up the fragment.
5. Polls `$DEPLOY_API_URL$DEPLOY_HEALTH_PATH` until 200, retrying for up to two minutes.

Production secrets live in `.env` on the VM (gitignored). You only SSH in to edit it when a value changes; deploys leave it alone. `NEXT_PUBLIC_API_URL` is baked into the Next.js image at build time, so changing the public URL requires a redeploy.

## Stack architecture

```
shared Caddy (ports 80/443, on the shared VM)
├── /api/*, /hubs/*, /health → quizplatform-api:5063
└── /                         → quizplatform-web:3000

isolated to this stack:
└── quizplatform-postgres:5432   (default network only — no external exposure, no cross-site access)
```

Caddy terminates TLS using a Cloudflare origin certificate mounted at `/etc/caddy/certs/quizplatform/`. The `api` and `web` containers join an external Docker network named `web` so the shared Caddy can reach them by service name. The `postgres` container stays off `web`.

## Onboarding to a fresh shared VM

If the shared VM doesn't yet exist or QuizPlatform isn't on it, follow the "Onboarding a new site" steps in the shared infra guide that lives alongside the shared Caddy compose. From this site's side you need:

- A Cloudflare A record for the production domain → shared VM IP, proxied
- A Cloudflare origin cert at `/srv/shared/caddy/certs/quizplatform/{origin.pem,origin-key.pem}`
- A repo checkout at `/home/ubuntu/sites/quizplatform/` with `.env` populated
- The Caddyfile fragment at `deploy/caddy/quizplatform.caddy` matches the production domain

Then `make deploy` from your laptop completes the bring-up.
