# Deploy on one AWS EC2 box (Ubuntu 24.04, 4 GB RAM)

Stack: Caddy (HTTPS, ports 80/443) → web (Next.js) + api (FastAPI) → Postgres + Redis, all in Docker Compose.
Only Caddy is reachable from the internet. The collab server is not deployed.

## 0. Before you start (AWS console)

1. Launch an EC2 instance: Ubuntu 24.04, 4 GB RAM (t3.medium or similar), 20 GB+ disk.
2. Allocate an **Elastic IP** and attach it to the instance.
3. Security group inbound: **22** (your IP only), **80** and **443** (anywhere). Nothing else.
4. At your DNS provider, add an **A record**: `your-domain` → the Elastic IP. Wait until `nslookup your-domain` shows that IP, otherwise HTTPS cannot be issued.

## 1. Server setup (once)

```bash
ssh ubuntu@YOUR_ELASTIC_IP

# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
exit    # log in again so the docker group applies
```

2 GB swap file (the web build and Postgres can spike above 4 GB):

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h    # Swap should show 2.0Gi
```

## 2. Get the code and fill `.env`

```bash
git clone -b deploy/aws https://github.com/ACUTE02/adaptive-learning-platform.git
cd adaptive-learning-platform
cp .env.prod.example .env
nano .env
```

Replace every `REPLACE_ME`. Make secrets with `openssl rand -hex 32` (letters and digits only, no special characters).
Use the same domain in `DOMAIN`, `LEARNHOUSE_ALLOWED_ORIGINS` and the `NEXT_PUBLIC_LEARNHOUSE_*` lines.

Checklist of what you must fill: `DOMAIN`, `ACME_EMAIL`, `LEARNHOUSE_ALLOWED_ORIGINS`, `LEARNHOUSE_AUTH_JWT_SECRET_KEY`, `POSTGRES_PASSWORD`, `COLLAB_INTERNAL_KEY`, `GEMINI_API_KEY`, admin email and password, demo student email and password, `NEXT_PUBLIC_LEARNHOUSE_BACKEND_URL`, `NEXT_PUBLIC_LEARNHOUSE_DOMAIN`, `NEXT_PUBLIC_LEARNHOUSE_TOP_DOMAIN`. Passwords need to pass the app's strength rules (upper and lower case, a digit, a symbol, length 8+); if one is rejected, the script in step 4 tells you.

## 3. Start

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

The first build takes 10 to 15 minutes on this box. All five services should become `healthy`. Caddy gets the certificate on the first request, so give it a minute.

## 4. Create the accounts and open the site

The first start already creates the default organization and the admin from `.env`. This script also adds the demo student (safe to run again, existing accounts are left alone):

```bash
./deploy/create-users.sh
```

**Open: `https://your-domain/`** (the plain domain, nothing before it, no port).

How it works: the API runs with `LEARNHOUSE_TENANCY=single`, so the web app serves the organization with slug `default` on whatever host it receives. There is no `<org>.localhost` style subdomain and no `/orgs/default` path to type. Log in at `https://your-domain/login` with the admin or demo student email and password from `.env`. The admin panel is at `https://your-domain/admin`.

Quick checks:

```bash
curl -s https://your-domain/api/v1/health            # true
curl -s -o /dev/null -w "%{http_code}\n" https://your-domain/api/v1/engine/campaigns   # 401 without login
curl -s -o /dev/null -w "%{http_code}\n" https://your-domain/docs                      # 404
```

## 5. Stop and Start (EC2 instance stopped, started later)

You can stop the instance from the AWS console to save money and start it again later.

- **Containers come back by themselves.** Docker starts at boot (enabled by the installer) and every service has `restart: unless-stopped`, so the whole stack comes up without any command. Data is in named Docker volumes on the EBS disk and survives stop/start.
- **The Elastic IP stays** attached while the instance is stopped, so the DNS record keeps working. (An Elastic IP that is *not* attached to a running instance is billed by AWS; release it only if you are done for good. Without an Elastic IP the public IP changes on every start and the domain breaks.)
- **Swap stays** because it is in `/etc/fstab`.

What to check after boot (give it 2 to 3 minutes):

```bash
cd ~/adaptive-learning-platform
docker compose -f docker-compose.prod.yml ps          # all 5 "healthy"
free -h                                               # swap 2.0Gi present
curl -s https://your-domain/api/v1/health
```

If something is not up: `docker compose -f docker-compose.prod.yml up -d`, then `docker compose -f docker-compose.prod.yml logs --tail=100 api`.
Note: the daily knowledge-decay job runs at 00:00 UTC and also once about 2 minutes after the API boots, so a stopped night is caught up automatically.

## 6. Day-to-day

```bash
docker compose -f docker-compose.prod.yml logs -f --tail=100 api     # logs (rotated, max 30 MB per service)
git pull && docker compose -f docker-compose.prod.yml up -d --build  # update
docker compose -f docker-compose.prod.yml restart api                # restart one service
```

Never run `docker compose down -v` or `docker volume prune`: that deletes the database and uploads.
If you change a `NEXT_PUBLIC_LEARNHOUSE_BACKEND_URL`, `NEXT_PUBLIC_LEARNHOUSE_DOMAIN` or `NEXT_PUBLIC_LEARNHOUSE_ENV` value, rebuild web: `docker compose -f docker-compose.prod.yml up -d --build web`.

## 7. Backup and restore

Backup (writes `backups/learnhouse-<date>.dump`, keeps the newest 14):

```bash
./deploy/backup.sh
```

Daily at 02:30 UTC through cron (`crontab -e`):

```
30 2 * * * cd /home/ubuntu/adaptive-learning-platform && ./deploy/backup.sh >> backups/backup.log 2>&1
```

Copy the `backups/` folder off the box now and then (for example `scp`, or `aws s3 cp` to a bucket). A backup that lives only on the same disk is not enough.

Restore into the running stack (this replaces the current database contents):

```bash
docker compose -f docker-compose.prod.yml stop web api
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U learnhouse -d learnhouse --clean --if-exists --no-owner < backups/learnhouse-YYYYMMDD-HHMMSS.dump
docker compose -f docker-compose.prod.yml start api web
```

Uploaded files (logos, course content) live in the `abhyas_content_data` volume and are not part of the database dump. Back them up with:

```bash
docker run --rm -v abhyas_content_data:/data -v "$PWD/backups":/out alpine tar czf /out/content-$(date -u +%Y%m%d).tgz -C /data .
```
