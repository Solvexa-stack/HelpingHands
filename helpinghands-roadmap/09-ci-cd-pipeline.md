# Step 09 — CI/CD Pipeline (GitHub Actions)

## Context

You are setting up the full CI/CD pipeline for the HelpingHands monorepo.
Create all workflow files in `.github/workflows/`.
The repository uses pnpm workspaces + Turbo.

---

## Files to create

```
.github/
├── workflows/
│   ├── ci.yml           ← runs on every PR: lint + typecheck + test
│   ├── deploy-staging.yml  ← runs on push to main: build + deploy to staging
│   └── deploy-production.yml ← runs on release tag: build + deploy to prod
└── dependabot.yml       ← automated dependency updates
```

---

## `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [develop]

env:
  PNPM_VERSION: 9

jobs:
  lint-and-typecheck:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Type check
        run: pnpm typecheck

  test:
    name: Unit & Integration Tests
    runs-on: ubuntu-latest
    needs: lint-and-typecheck

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: testpassword
          POSTGRES_DB: helping_hands_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgresql://postgres:testpassword@localhost:5432/helping_hands_test
      REDIS_HOST: localhost
      REDIS_PORT: 6379
      JWT_SECRET: test-jwt-secret-ci
      JWT_REFRESH_SECRET: test-refresh-secret-ci
      JWT_EXPIRES_IN: 15m
      JWT_REFRESH_EXPIRES_IN: 7d
      NODE_ENV: test

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Generate Prisma client
        run: pnpm --filter @helping-hands/database db:generate

      - name: Run migrations on test DB
        run: pnpm --filter @helping-hands/database db:migrate

      - name: Run tests
        run: pnpm test

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        if: always()
        with:
          token: ${{ secrets.CODECOV_TOKEN }}

  build:
    name: Build all apps
    runs-on: ubuntu-latest
    needs: test

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm build
        env:
          NEXT_PUBLIC_API_URL: ${{ vars.STAGING_API_URL }}
          NEXT_PUBLIC_APP_URL: ${{ vars.STAGING_WEB_URL }}
          NEXT_PUBLIC_ADMIN_API_URL: ${{ vars.STAGING_API_URL }}
          NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ${{ secrets.STRIPE_PUBLISHABLE_KEY_TEST }}
```

---

## `.github/workflows/deploy-staging.yml`

```yaml
name: Deploy to Staging

on:
  push:
    branches: [main]

jobs:
  deploy:
    name: Deploy
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - uses: actions/checkout@v4

      - name: Deploy to staging server via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_SERVER_HOST }}
          username: ${{ secrets.STAGING_SERVER_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            cd /opt/helpinghands-staging
            git pull origin main
            docker compose -f docker-compose.yml -f docker-compose.staging.yml up --build -d
            docker compose exec api npx prisma migrate deploy
            docker system prune -f

      - name: Notify on success
        if: success()
        uses: slackapi/slack-github-action@v1
        with:
          payload: '{"text":"✅ Staging deployed successfully — ${{ github.sha }}"}'
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}

      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: '{"text":"🚨 Staging deployment FAILED — ${{ github.sha }}"}'
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## `.github/workflows/deploy-production.yml`

```yaml
name: Deploy to Production

on:
  push:
    tags:
      - 'v*.*.*'   # triggered by: git tag v1.2.3 && git push --tags

jobs:
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    environment: production

    steps:
      - uses: actions/checkout@v4

      - name: Deploy to production server via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_SERVER_HOST }}
          username: ${{ secrets.PROD_SERVER_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            cd /opt/helpinghands
            git pull origin main
            docker compose up --build --no-deps -d api
            docker compose exec api npx prisma migrate deploy
            sleep 10
            docker compose up --build --no-deps -d web admin
            docker system prune -f

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          generate_release_notes: true

      - name: Notify on success
        if: success()
        uses: slackapi/slack-github-action@v1
        with:
          payload: '{"text":"🚀 Production deployed — ${{ github.ref_name }}"}'
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## `.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
      day: monday
    open-pull-requests-limit: 5
    groups:
      nestjs:
        patterns: ['@nestjs/*']
      nextjs:
        patterns: ['next', 'react', 'react-dom']
      prisma:
        patterns: ['prisma', '@prisma/*']

  - package-ecosystem: docker
    directory: /
    schedule:
      interval: monthly
```

---

## GitHub Secrets to configure

Go to: Repository → Settings → Secrets and variables → Actions

### Secrets (sensitive, encrypted)
```
STAGING_SERVER_HOST
STAGING_SERVER_USER
STAGING_SSH_KEY
PROD_SERVER_HOST
PROD_SERVER_USER
PROD_SSH_KEY
STRIPE_PUBLISHABLE_KEY_TEST
SLACK_WEBHOOK_URL           ← optional, for deploy notifications
CODECOV_TOKEN               ← optional, for coverage reports
```

### Variables (non-sensitive, readable)
```
STAGING_API_URL=https://staging-api.yourdomain.com/api
STAGING_WEB_URL=https://staging.yourdomain.com
```

---

## Add scripts to root `package.json`

```json
{
  "scripts": {
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "test:coverage": "turbo test:coverage"
  }
}
```

## Add to `turbo.json`

```json
{
  "tasks": {
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    }
  }
}
```

## Add to each app's `package.json`

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "jest --passWithNoTests",
    "test:coverage": "jest --coverage --passWithNoTests"
  }
}
```
