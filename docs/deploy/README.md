# Deploying QuizPlatform

QuizPlatform deploys to a **shared VM** alongside other small sites (e.g. TechDebtClub). A single Caddy reverse proxy on the VM owns ports 80/443 and routes by hostname to per-site Docker stacks. Each site keeps its own dedicated `postgres` container.

From a developer's perspective, every deploy is just:

```bash
make deploy
```

That SSHes to the VM, pulls `main`, rebuilds this site's stack, drops `deploy/caddy/quizplatform.caddy` into the shared Caddy, reloads it, and polls the health endpoint until 200.

## Required local config

Copy `.env.example` to `.env` at the repo root and fill in:

- `DEPLOY_SSH_USER` — SSH user (e.g. `ubuntu`)
- `DEPLOY_SSH_HOST` — shared VM static IP
- `DEPLOY_SSH_KEY` — local path to the SSH private key
- `DEPLOY_REMOTE_DIR` — `/home/ubuntu/sites/quizplatform`
- `DEPLOY_SITE_NAME` — `quizplatform`
- `DEPLOY_API_URL` — your production URL
- `DEPLOY_HEALTH_PATH` — `/health` (the QuizPlatform API exposes health at root, not under `/api`)

## One-time shared-VM setup and cutover

The shared infra (Caddy stack, `web` Docker network, cert layout) and the cross-VM data migration from QuizPlatform's old per-site Lightsail instance are documented in the **TechDebtClub** repo at `deploy/shared/README.md`. That runbook is the canonical reference because the shared Caddy lives next to TDC's checkout on the VM.

Specific to QuizPlatform's cutover:

1. Replace `quiz.yourdomain.com` in `deploy/caddy/quizplatform.caddy` with the actual production domain (the placeholder is committed so the file structure is reviewable, but it must match your DNS before the first deploy).
2. Copy the existing Cloudflare origin cert from the old QuizPlatform VM into `/srv/shared/caddy/certs/quizplatform/` on the shared VM.
3. `pg_dump` the existing database off the old VM and restore it into the new `quizplatform-postgres` container — see step `f` of the shared infra runbook.
4. Repoint the Cloudflare A record to the shared VM's static IP.
5. Run `make deploy` from local.

## Architecture

```
Internet → Cloudflare (proxy + SSL) → shared VM
                                       ├─ shared Caddy (ports 80/443, routes by Host header)
                                       │   ├─ <quiz-domain>/api/*, /hubs/*, /health → quizplatform-api:5063
                                       │   └─ <quiz-domain>/...                     → quizplatform-web:3000
                                       ├─ quizplatform-postgres (internal, on quizplatform's default network)
                                       └─ ... (other sites' stacks, isolated from this one)
```

Caddy terminates TLS using a Cloudflare origin certificate mounted at `/etc/caddy/certs/quizplatform/`. The frontend (`NEXT_PUBLIC_API_URL`) is baked in at Docker build time, so changing the public URL requires a redeploy.
