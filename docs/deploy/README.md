# Deploying QuizPlatform

This guide covers one option for deploying QuizPlatform: **AWS Lightsail** with a **Cloudflare** domain. Other hosting options (VPS, Kubernetes, Railway, etc.) work fine — the project is a standard Docker Compose stack.

The guide is structured as a single walkthrough. Domain setup comes first because Cloudflare issues affect both the API and frontend URLs.

## What you'll end up with

- A $5/month Lightsail instance running the full stack (API + frontend + database + reverse proxy)
- HTTPS via Cloudflare (proxied) + Caddy (origin certificates)
- Automated deployments via `make deploy`
- Snapshot-based rollbacks

## Prerequisites

- AWS account with Lightsail access
- A domain managed by Cloudflare (free plan works)
- Local tools: `aws` CLI, `ssh`, `curl`, `jq`

---

## Step 1: Domain setup (Cloudflare)

Do this first — you'll need the domain name for all subsequent configuration.

### 1.1 Choose your domain

Pick a subdomain like `quiz.yourdomain.com`. The rest of this guide uses that as the example.

### 1.2 Create the DNS record (placeholder)

In Cloudflare DNS, add an **A record**:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | quiz | `1.2.3.4` | Proxied (orange cloud) |

Use a placeholder IP for now. You'll update it after creating the Lightsail instance.

### 1.3 SSL/TLS settings

In Cloudflare → SSL/TLS:

1. Set encryption mode to **Full (strict)**
2. Go to **Origin Server** → **Create Certificate**
3. Keep the defaults (RSA, 15 years, covers `*.yourdomain.com` and `yourdomain.com`)
4. Save the **Origin Certificate** as `origin.pem`
5. Save the **Private Key** as `origin-key.pem`

Keep these files — you'll upload them to the server in Step 3.

---

## Step 2: AWS Lightsail setup

### 2.1 Create an IAM user

In AWS IAM, create a user with the **AmazonLightsailFullAccess** policy. Generate access keys and configure locally:

```bash
aws configure
# Enter: Access Key, Secret Key, region (e.g. eu-central-1), output format (json)
```

### 2.2 Create a Lightsail instance

```bash
aws lightsail create-instances \
  --instance-names quizplatform \
  --availability-zone eu-central-1a \
  --blueprint-id ubuntu_24_04 \
  --bundle-id micro_3_0
```

The `micro_3_0` bundle ($5/month) gives 1 vCPU, 1GB RAM, 30GB SSD. This is enough for small to medium quiz sessions.

### 2.3 Download the SSH key

```bash
aws lightsail download-default-key-pair --region eu-central-1 \
  --query 'privateKeyBase64' --output text | base64 -d > ~/.ssh/quizplatform.pem
chmod 600 ~/.ssh/quizplatform.pem
```

### 2.4 Allocate and attach a static IP

```bash
aws lightsail allocate-static-ip --static-ip-name quizplatform-ip --region eu-central-1
aws lightsail attach-static-ip --static-ip-name quizplatform-ip --instance-name quizplatform --region eu-central-1
```

Get the IP address:

```bash
aws lightsail get-static-ip --static-ip-name quizplatform-ip --region eu-central-1 \
  --query 'staticIp.ipAddress' --output text
```

**Now go back to Cloudflare** and update the A record from Step 1.2 with this IP.

### 2.5 Open firewall ports

```bash
aws lightsail open-instance-public-ports \
  --instance-name quizplatform \
  --port-info fromPort=80,toPort=80,protocol=tcp \
  --region eu-central-1

aws lightsail open-instance-public-ports \
  --instance-name quizplatform \
  --port-info fromPort=443,toPort=443,protocol=tcp \
  --region eu-central-1
```

---

## Step 3: Server setup

SSH into the instance:

```bash
ssh -i ~/.ssh/quizplatform.pem ubuntu@<YOUR_STATIC_IP>
```

### 3.1 Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
# Log out and back in for the group change to take effect
exit
ssh -i ~/.ssh/quizplatform.pem ubuntu@<YOUR_STATIC_IP>
```

### 3.2 Add swap (recommended for 1GB instances)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 3.3 Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/QuizPlatform.git ~/quizplatform
cd ~/quizplatform
```

### 3.4 Configure Caddy

```bash
cp docker/caddy/Caddyfile.example docker/caddy/Caddyfile
```

Edit `docker/caddy/Caddyfile` — replace `quiz.yourdomain.com` with your actual domain.

### 3.5 Upload origin certificates

Copy the Cloudflare origin certificates (from Step 1.3) to the server:

```bash
mkdir -p docker/caddy/certs
# From your local machine:
scp -i ~/.ssh/quizplatform.pem origin.pem ubuntu@<IP>:~/quizplatform/docker/caddy/certs/
scp -i ~/.ssh/quizplatform.pem origin-key.pem ubuntu@<IP>:~/quizplatform/docker/caddy/certs/
```

### 3.6 Create the production .env

```bash
cd ~/quizplatform
cp .env.example .env
```

Edit `.env` with production values:

```bash
# Generate a random JWT key
DEPLOY_JWT_KEY=$(openssl rand -base64 48)

# Set your domain
NEXT_PUBLIC_API_URL=https://quiz.yourdomain.com
ALLOWED_ORIGINS=https://quiz.yourdomain.com

# Set a strong DB password
DEPLOY_DB_PASSWORD=$(openssl rand -base64 24)
DEPLOY_DB_CONNECTION="Host=postgres;Database=quizplatform;Username=quizplatform;Password=$DEPLOY_DB_PASSWORD"
```

### 3.7 Start the stack

```bash
docker compose -f docker/docker-compose.prod.yml up -d --build
```

First build takes a few minutes. Check the health endpoint:

```bash
curl -s https://quiz.yourdomain.com/health
# Should return: {"status":"healthy"}
```

---

## Step 4: Local deployment setup

On your **local machine**, create a `.env` at the repo root with the deployment variables:

```bash
cp .env.example .env
```

Fill in the deployment section:

```
DEPLOY_LIGHTSAIL_INSTANCE=quizplatform
DEPLOY_LIGHTSAIL_REGION=eu-central-1
DEPLOY_LIGHTSAIL_SNAPSHOT=quizplatform-snap
DEPLOY_LIGHTSAIL_STATIC_IP=quizplatform-ip
DEPLOY_SSH_USER=ubuntu
DEPLOY_SSH_KEY=~/.ssh/quizplatform.pem
DEPLOY_API_URL=https://quiz.yourdomain.com
```

Test it:

```bash
make deploy-verify
```

---

## Deploying updates

```bash
# Full deployment: snapshot → deploy → verify
make deploy

# Quick deploy (skip snapshot)
make deploy-now

# Just check health
make deploy-verify
```

The deploy script SSHes into the instance, runs `git pull`, and rebuilds the Docker containers.

## Rolling back

If a deployment breaks:

```bash
make deploy-rollback
```

This creates a new instance from the last snapshot, moves the static IP to it, and verifies health. The old instance is left running for investigation.

---

## Architecture

```
Internet → Cloudflare (proxy + SSL) → Lightsail instance
                                         ├─ Caddy (ports 80/443, TLS termination)
                                         │   ├─ /api/*, /hubs/*, /health → API container (:5063)
                                         │   └─ everything else → Web container (:3000)
                                         └─ PostgreSQL container (:5432, internal only)
```

All services run as Docker containers via `docker/docker-compose.prod.yml`. Caddy handles TLS with Cloudflare origin certificates. The database is internal only — no external port exposure.
