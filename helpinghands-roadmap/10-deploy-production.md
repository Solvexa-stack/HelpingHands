# Step 10 — Production Deployment

## Context

This is the final step. Everything is built and tested.
Deploy to a VPS (Ubuntu 22.04) with Docker, Nginx, SSL, monitoring, and automated backups.

---

## Server requirements

- Ubuntu 22.04 LTS
- Minimum: 2 vCPU, 4GB RAM, 40GB SSD
- Recommended: 4 vCPU, 8GB RAM, 80GB SSD
- Open ports: 22 (SSH), 80 (HTTP), 443 (HTTPS)

---

## `docker-compose.prod.yml`

Create this file at the repo root. Use alongside `docker-compose.yml`:

```yaml
services:
  postgres:
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes
    volumes:
      - redisdata:/data

  api:
    restart: unless-stopped
    environment:
      NODE_ENV: production
    healthcheck:
      test: ['CMD', 'wget', '-qO-', 'http://localhost:4000/api/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  web:
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'wget', '-qO-', 'http://localhost:3000']
      interval: 30s
      timeout: 10s
      retries: 3

  admin:
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'wget', '-qO-', 'http://localhost:3001']
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  pgdata:
  redisdata:
  uploads:
```

---

## Health check endpoint (add to API)

Create `apps/api/src/modules/health/health.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Public()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`
    return { status: 'ok', timestamp: new Date().toISOString() }
  }
}
```

Register in `app.module.ts`. This endpoint is used by Docker healthcheck and monitoring.

---

## Production `.env` template

Create `.env.production.example` at repo root:

```env
NODE_ENV=production

# App URLs (replace with your real domain)
APP_PORT=4000
APP_URL=https://api.yourdomain.com
WEB_URL=https://yourdomain.com
ADMIN_URL=https://admin.yourdomain.com

# Database
POSTGRES_PASSWORD=CHANGE_ME_STRONG_PASSWORD_32_CHARS
DATABASE_URL=postgresql://postgres:CHANGE_ME_STRONG_PASSWORD_32_CHARS@postgres:5432/helping_hands?schema=public

# Redis
REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD
REDIS_HOST=redis
REDIS_PORT=6379

# JWT (generate with: openssl rand -base64 48)
JWT_SECRET=GENERATE_WITH_OPENSSL
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=GENERATE_DIFFERENT_ONE
JWT_REFRESH_EXPIRES_IN=7d

# Storage
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

# Email
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=YOUR_SMTP_PASSWORD
MAIL_FROM="HelpingHands <noreply@yourdomain.com>"

# Stripe (LIVE keys for production)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_live_...

# PayPal
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_MODE=live

# Payment redirect URLs
PAYMENT_SUCCESS_URL=https://yourdomain.com/en/donations/success
PAYMENT_CANCEL_URL=https://yourdomain.com/en/donations/cancel

# Next.js public vars (baked in at build time)
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NEXT_PUBLIC_ADMIN_API_URL=https://api.yourdomain.com/api
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

---

## Nginx configuration

File: `/etc/nginx/sites-available/helpinghands`

```nginx
# Rate limiting zone
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/m;

server {
    server_name yourdomain.com www.yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_read_timeout 60s;
    }
}

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

server {
    server_name api.yourdomain.com;

    # Rate limit the API
    limit_req zone=api burst=20 nodelay;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 20M;
    }

    # Stripe webhooks need raw body — no rate limit
    location /api/webhooks/stripe {
        limit_req off;
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_request_buffering off;
    }
}
```

---

## Server setup script

Create `scripts/setup-server.sh`:

```bash
#!/bin/bash
set -e

echo "=== Installing Docker ==="
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "=== Installing Nginx + Certbot ==="
apt-get install -y nginx certbot python3-certbot-nginx

echo "=== Creating app directory ==="
mkdir -p /opt/helpinghands
mkdir -p /backups

echo "=== Firewall ==="
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "=== Done. Next steps: ==="
echo "1. Clone repo to /opt/helpinghands"
echo "2. Copy .env.production.example to .env and fill in values"
echo "3. Configure Nginx and run certbot"
echo "4. Run: docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d"
echo "5. Run: docker compose exec api npx prisma migrate deploy"
echo "6. Run: docker compose exec api node dist/seed.js"
```

---

## Automated backup script

Create `scripts/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR=/backups
DATE=$(date +%Y%m%d_%H%M%S)
APP_DIR=/opt/helpinghands

# DB backup
docker compose -f $APP_DIR/docker-compose.yml exec -T postgres \
  pg_dump -U postgres helping_hands | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Uploads backup
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz -C $APP_DIR uploads/

# Keep only last 14 days
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +14 -delete
find $BACKUP_DIR -name "uploads_*.tar.gz" -mtime +14 -delete

echo "Backup completed: $DATE"
```

Add to crontab:
```bash
crontab -e
# Add:
0 2 * * * /opt/helpinghands/scripts/backup.sh >> /var/log/helpinghands-backup.log 2>&1
```

---

## Stripe webhook registration

After deploying, register the webhook endpoint in Stripe Dashboard:
- URL: `https://api.yourdomain.com/api/webhooks/stripe`
- Events to listen for:
  - `checkout.session.completed`
  - `checkout.session.expired`
- Copy the webhook signing secret to `.env` as `STRIPE_WEBHOOK_SECRET`

---

## Post-deployment checklist

```
Infrastructure
[ ] DNS pointing correctly (api, www, admin subdomains)
[ ] SSL certificates issued by Certbot
[ ] Firewall rules applied (only 80, 443, 22 open)
[ ] All containers healthy (docker compose ps)
[ ] Health endpoint responding: curl https://api.yourdomain.com/api/health

Database
[ ] Migrations applied
[ ] Admin account seeded
[ ] Prisma Studio accessible (turn off in production — remove from package.json scripts)

Payments
[ ] Stripe webhook registered + secret saved
[ ] PayPal webhook registered
[ ] Test payment end-to-end in production (use small amount, refund immediately)

Email
[ ] Test email sending with forgot-password flow
[ ] SMTP credentials verified

Monitoring
[ ] Backup cron job running
[ ] Docker container restart policy set to unless-stopped
[ ] Log rotation configured (logrotate)

Security
[ ] No .env file committed to git
[ ] JWT secrets are 48+ chars random strings
[ ] DATABASE_URL uses strong password
[ ] Swagger disabled in production (NODE_ENV=production disables it)
[ ] CORS origins locked to your domains only
```

---

## CORS configuration for production

In `apps/api/src/main.ts`, update CORS:

```typescript
app.enableCors({
  origin: [
    configService.get('WEB_URL'),
    configService.get('ADMIN_URL'),
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
})
```

---

## Deployment command (every release)

```bash
cd /opt/helpinghands
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build --no-deps -d api
docker compose exec api npx prisma migrate deploy
sleep 15
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build --no-deps -d web admin
docker system prune -f
```
