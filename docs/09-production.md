# Production Deployment

This guide covers deploying HelpingHands to a Linux VPS or any Docker-compatible host (e.g. DigitalOcean Droplet, AWS EC2, Hetzner).

---

## Prerequisites on the Server

- Docker Engine 24+
- Docker Compose plugin (`docker compose`, not `docker-compose`)
- Git
- A domain name with DNS pointing to the server's IP (optional but recommended)
- A reverse proxy (Nginx or Caddy) for HTTPS termination

---

## Step 1 — Clone and Configure

```bash
git clone https://github.com/your-org/HelpingHands.git /opt/helpinghands
cd /opt/helpinghands

cp .env.example .env
nano .env          # or vim, any editor
```

### Required production values

```env
# App
NODE_ENV=production
APP_URL=https://api.yourdomain.com
WEB_URL=https://yourdomain.com
ADMIN_URL=https://admin.yourdomain.com

# Database — use the Docker service name
DATABASE_URL="postgresql://postgres:STRONG_PASSWORD@postgres:5432/helping_hands?schema=public"

# JWT — use long random secrets (32+ chars)
JWT_SECRET=replace-with-a-very-long-random-string
JWT_REFRESH_SECRET=replace-with-another-very-long-random-string
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# SMTP
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your-smtp-password
MAIL_FROM="HelpingHands <noreply@yourdomain.com>"

# Frontend (built into static assets at build time)
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NEXT_PUBLIC_ADMIN_API_URL=https://api.yourdomain.com/api
```

---

## Step 2 — Build and Start

```bash
docker compose up --build -d
```

This builds production images for all three apps and starts all services in the background.

---

## Step 3 — Run Migrations and Seed

Run once on first deploy (and after each migration):

```bash
# Apply DB migrations
docker compose exec api npx prisma migrate deploy

# Seed initial admin account (first deploy only)
docker compose exec api node dist/seed.js
```

If you prefer to seed from outside the container:
```bash
pnpm --filter @helping-hands/database db:migrate
```

---

## Step 4 — Nginx Reverse Proxy (HTTPS)

Install Certbot and Nginx on the host, then create three server blocks.

### Install Nginx + Certbot

```bash
apt update
apt install -y nginx certbot python3-certbot-nginx
```

### Nginx config (`/etc/nginx/sites-available/helpinghands`)

```nginx
# Public website
server {
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Admin dashboard
server {
    server_name admin.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# API
server {
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 20M;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/helpinghands /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

# Issue SSL certificates
certbot --nginx -d yourdomain.com -d www.yourdomain.com -d admin.yourdomain.com -d api.yourdomain.com
```

---

## Step 5 — Firewall

Only expose ports 80 and 443 publicly. Keep 3000, 3001, 4000, 5432, 6379 internal:

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

---

## Deploying Updates

```bash
cd /opt/helpinghands
git pull origin main

# Rebuild changed services only
docker compose up --build -d

# Run any new migrations
docker compose exec api npx prisma migrate deploy
```

For zero-downtime you can rebuild one service at a time:
```bash
docker compose up --build --no-deps -d api
docker compose up --build --no-deps -d web
docker compose up --build --no-deps -d admin
```

---

## Backup

### Database

```bash
# Dump
docker compose exec postgres pg_dump -U postgres helping_hands > backup_$(date +%Y%m%d).sql

# Restore
docker compose exec -T postgres psql -U postgres helping_hands < backup_20240601.sql
```

### Uploads

```bash
# Copy uploads volume to host
docker cp $(docker compose ps -q api):/app/uploads ./uploads_backup
```

Automate with a daily cron job:

```bash
# /etc/cron.d/helpinghands-backup
0 2 * * * root cd /opt/helpinghands && docker compose exec -T postgres pg_dump -U postgres helping_hands > /backups/db_$(date +\%Y\%m\%d).sql
```

---

## Monitoring

### View live logs

```bash
docker compose logs -f
docker compose logs -f api
```

### Container health

```bash
docker compose ps
```

### Restart a crashed service

```bash
docker compose restart api
```

### Auto-restart on server reboot

Docker Compose services restart automatically when the Docker daemon starts if `restart: unless-stopped` is set in `docker-compose.yml`. Add it to each service if not already present:

```yaml
services:
  api:
    restart: unless-stopped
  web:
    restart: unless-stopped
  admin:
    restart: unless-stopped
  postgres:
    restart: unless-stopped
  redis:
    restart: unless-stopped
```

---

## Environment Variable Checklist for Production

| Variable | Production requirement |
|----------|----------------------|
| `NODE_ENV` | Must be `production` |
| `JWT_SECRET` | Long random string (32+ chars), never reuse dev value |
| `JWT_REFRESH_SECRET` | Same rule, different string |
| `DATABASE_URL` | Uses `postgres` (service name), strong password |
| `APP_URL` / `WEB_URL` / `ADMIN_URL` | Use `https://` |
| `NEXT_PUBLIC_API_URL` | Publicly reachable API URL |
| `SMTP_*` | Real SMTP credentials |
| `MAX_FILE_SIZE` | Tune for your use case (default 10 MB) |

---

## Security Hardening Checklist

- [ ] Change all default passwords (`POSTGRES_PASSWORD`, `JWT_SECRET`, etc.)
- [ ] Use HTTPS for all three domains
- [ ] Firewall — only 80 / 443 public
- [ ] Set `NODE_ENV=production` (disables Swagger in production)
- [ ] Configure `@nestjs/throttler` limits for your expected traffic
- [ ] Store `.env` outside the git repository (never commit secrets)
- [ ] Schedule automated daily database backups
- [ ] Monitor disk usage for the `uploads` volume
