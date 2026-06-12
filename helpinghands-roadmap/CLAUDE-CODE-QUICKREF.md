# Claude Code — Quick Reference Card

## How to feed these prompts

```
1. Open Claude Code in your terminal: claude
2. Say: "Read the file 00-MASTER-ROADMAP.md and tell me the plan"
3. Then: "Now implement step 01: read 01-db-study-schema.md and do everything in it"
4. After step 01 is done and tested: "Now implement step 02: read 02-api-study-module.md"
5. Continue in order through step 10
```

Never skip a step. Each one depends on the previous.

---

## Useful commands during development

```bash
# Run everything locally
pnpm dev

# After any schema change
pnpm --filter @helping-hands/database db:migrate:dev -- --name describe_change
pnpm --filter @helping-hands/database db:generate

# Run tests
pnpm test

# Check types
pnpm typecheck

# Open DB browser
pnpm db:studio

# View API docs
open http://localhost:4000/api/docs

# Stripe webhook testing locally
stripe listen --forward-to localhost:4000/api/webhooks/stripe

# PayPal sandbox: use developer.paypal.com to create test accounts
```

---

## Key architecture rules (repeat to Claude Code if it forgets)

1. All API responses wrapped in `{ data: ... }` by `ResponseInterceptor`
2. All inputs validated with `class-validator` DTOs
3. All routes guarded — use `@Public()` to opt out, `@Roles(...)` to restrict
4. Multi-table writes use `prisma.$transaction([])`
5. No `any` in TypeScript
6. Secrets only via `ConfigService`, never hardcoded
7. New migrations only — never edit existing migration files
8. Bull queues for emails — never send email synchronously in a request

---

## Integration test accounts for payment

**Stripe test cards:**
- Success: `4242 4242 4242 4242` (any future date, any CVV)
- Decline: `4000 0000 0000 0002`

**PayPal sandbox:**
- Create buyer/seller accounts at developer.paypal.com
- Use sandbox credentials in `.env` (PAYPAL_MODE=sandbox)

---

## Deployment flow

```
develop branch  →  PR  →  CI (lint + test + build)
                       ↓
main branch     →  Auto deploy to staging
                       ↓
git tag v1.x.x  →  Auto deploy to production
```
