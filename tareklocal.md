# Tarek Local — WSL Setup & Launch Guide

## 1. Install Node.js via nvm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install --lts
```

## 2. Install pnpm

```bash
npm install -g pnpm@9
```

## 3. Start PostgreSQL (Docker)

```bash
docker compose up postgres -d
```

## 4. Install Dependencies

```bash
pnpm install
```

## 5. Run Database Migrations & Seed

```bash
pnpm --filter @helping-hands/database db:migrate:dev
pnpm --filter @helping-hands/database db:seed
```

## 6. Start All Apps

```bash
pnpm dev
```

## App URLs

| App   | URL                   |
|-------|-----------------------|
| Web   | http://localhost:3000 |
| Admin | http://localhost:3001 |
| API   | http://localhost:4000 |

## Test Accounts

| Role               | Email                        | Password        |
|--------------------|------------------------------|-----------------|
| Administrator      | admin@helpinghands.org       | Admin@123456    |
| Employee           | employee@helpinghands.org    | Employee@123    |
| Financial Officer  | officer@helpinghands.org     | Officer@123     |
| Participant        | participant@example.com      | Participant@123 |

## Daily Launch (after first setup)

```bash
docker compose up postgres -d
pnpm dev
```
