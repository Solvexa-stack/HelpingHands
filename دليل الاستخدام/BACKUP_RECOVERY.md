# Backup & Recovery

> **Audience:** Operations/DevOps engineers, incident responders.
> **Honesty note:** As of this writing, backups are **not automated** anywhere in this repository. `workspaceroadmap/PILOT_READINESS.md` explicitly lists "`pgdata` and `uploads` volumes have no backup job" as an open, accepted-risk item. This document describes the manual procedures available today and what to build before trusting this system with real data.

---

## 1. What needs backing up

| Asset | Where it lives | Criticality |
|---|---|---|
| PostgreSQL database | `pgdata` Docker volume (or your managed Postgres instance) | **Critical** — every domain fact: organizations, projects, donations, the entire ledger, Board decisions, audit log |
| Uploaded files | `uploads` Docker volume / `apps/api/uploads` on disk | **High** — study documents, organization verification documents, content images. Referenced by `File.url`; losing this without the DB rows becomes broken links, losing the DB rows without this becomes orphaned files. |
| `.env` secrets | Not in version control (correctly) | **Critical to preserve, never to leak** — JWT secrets, DB password, SMTP/Stripe/PayPal credentials. Losing these means every issued JWT becomes unverifiable and every session is force-invalidated; leaking them means tokens can be forged. |
| Redis | Bull job queues (notifications, email) | **Low** — queue state is transient/replayable; nothing here is a system of record. Do not bother backing up Redis. |

---

## 2. Database backup

### 2.1 Manual, one-off (Docker Compose environment)

```bash
docker compose exec postgres pg_dump -U postgres helping_hands > backup_$(date +%Y%m%d_%H%M%S).sql
```

For a non-Docker Postgres instance, run `pg_dump` directly against your `DATABASE_URL`'s host/credentials.

### 2.2 Recommended scheduled backup (NOT currently implemented — build this before real data enters)

No cron job, systemd timer, or managed-backup configuration exists in this repository today. A minimal viable approach:

```bash
# Example cron line — adjust paths/retention to your environment
0 2 * * * docker compose exec -T postgres pg_dump -U postgres helping_hands | gzip > /backups/helping_hands_$(date +\%Y\%m\%d).sql.gz
```

Recommendations:
- Retain at least 14 daily backups + 8 weekly + a handful of monthly, adjusted to your compliance requirements (government/NGO financial data often has specific retention rules — confirm with your organization's policy before finalizing).
- Store backups **off the same host** as the database (a second machine, object storage, or a managed backup service) — a local-only backup does not protect against host loss.
- Because the ledger, audit log, and Board decisions are all designed to be immutable and append-only (see `SYSTEM_ARCHITECTURE.md` §3, §6, §7), a point-in-time backup of this database is unusually trustworthy for financial reconciliation compared to systems with mutable financial records — but it is still only as good as your restore testing (§4).

### 2.3 Files backup

```bash
docker cp $(docker compose ps -q api):/app/uploads ./uploads_backup_$(date +%Y%m%d)
```

Back this up on the same schedule as the database — a file backup that's out of sync with the database backup by more than a day or two risks referencing files that don't exist yet (or vice versa) after a restore.

---

## 3. Restore

### 3.1 Database restore

```bash
# Stop the API so nothing writes during restore
docker compose stop api

# Restore into a running postgres container (destructive — overwrites current data)
gunzip -c backup_20260701.sql.gz | docker compose exec -T postgres psql -U postgres helping_hands

# Restart
docker compose start api
```

For a restore into a **fresh** database instead of overwriting one in place: create the target database first (`createdb`/`CREATE DATABASE`), then `psql` the dump into it, then point `DATABASE_URL` at it.

### 3.2 Files restore

```bash
docker cp ./uploads_backup_20260701/. $(docker compose ps -q api):/app/uploads/
```

### 3.3 Restore rehearsal — mandatory before any pilot/production sign-off

`ADMIN_ACCEPTANCE_TEST.md` §22 and `PILOT_READINESS.md` both require this explicitly: **a restore must actually be performed and verified in a non-production environment, not merely assumed to work because a backup file exists.**

Rehearsal checklist:
1. Take a fresh backup of a representative database (ideally one with real allocation/donation/report activity, not just the bare seed).
2. Restore it into a completely separate environment (a second Docker Compose stack, a scratch database — never your production instance).
3. Run the migration status check (`prisma migrate status`) against the restored database to confirm it's not mid-migration.
4. Log in with a known account from that snapshot.
5. Spot-check: does a known donation's status match? Does a known fund's ledger balance reconcile (sum of `LedgerEntry` amounts per account matches the expected balance)? Does a known Board decision's rationale text match exactly?
6. Record the rehearsal date and result. Repeat this rehearsal periodically (at minimum, after any schema migration that touches financial or governance tables), not just once.

---

## 4. Redis recovery

Redis in this system holds only Bull job queues (email, notifications) — no system-of-record data. Recovery is simply: restart the `redis` service (or container). Any in-flight queued jobs at the time of failure are lost; this is an acceptable gap for notification/email delivery (worst case, a user doesn't get an email and must be manually notified) but would **not** be acceptable if Redis ever became a store for financial or governance state — it currently is not, by design (see `SYSTEM_ARCHITECTURE.md` §3, "Treasury owns money," backed by Postgres, never Redis).

---

## 5. Disaster recovery scenarios

| Scenario | Recovery approach |
|---|---|
| **Database host lost entirely** | Provision a new Postgres instance, restore the most recent off-host backup (§3.1), point `DATABASE_URL` at it, run `prisma migrate status` to confirm schema state matches the application version being deployed, restart `api`. |
| **`uploads` volume lost, database intact** | Restore the most recent files backup (§3.2). Some very recently uploaded files (since the last file backup) will be permanently lost — their `File` rows will point at missing paths. There is no automated reconciliation for this; manually query for `File` rows with no matching disk file and decide whether to re-request the document (e.g. from an organization for verification documents) or accept the gap. |
| **Both lost simultaneously** | Restore database first, then files, from backups taken as close together in time as possible (§2.3 recommendation). Accept that any gap between the two backups' timestamps is a window of potential inconsistency — this is a strong argument for keeping the two backup jobs tightly scheduled together. |
| **A single bad migration corrupts data** | See §6. |
| **Redis lost** | Restart Redis; no data recovery needed (§4). |
| **Full host compromise (security incident)** | Do not simply restore in place — see §7 for the emergency checklist; a compromised host's secrets must be treated as burned regardless of whether data integrity was affected. |

---

## 6. Broken migration recovery

The migration playbook (`workspaceroadmap/09_MIGRATION_AND_BACKWARD_COMPATIBILITY.md`) requires every backfill script to have a written derivation rule and a verification query, and states schema expansions should be forward-safe (no rollback needed) while backfills require either a reverse script or an explicit "irreversible — snapshot first" flag. In practice, if `prisma migrate deploy` fails partway or a backfill script produces bad data:

1. **Stop.** Do not attempt further migrations on top of a failed one.
2. Take an immediate database snapshot of the current (possibly partially-migrated) state, even if it's broken — you may need to diagnose from it later.
3. Check `prisma migrate status` to see exactly which migration is in a failed/partial state.
4. If the failure is a genuinely bad migration file (not partial application), the standard Prisma recovery path is: manually correct the underlying issue (e.g. a data conflict the migration didn't anticipate), then `prisma migrate resolve --applied <migration-name>` or `--rolled-back <migration-name>` as appropriate, then re-run `migrate deploy`.
5. If a **backfill script** (not a schema migration) produced bad data — e.g. the Wave 6 category backfill mis-assigned a node — restore from the pre-backfill snapshot (§3.1) rather than attempting to hand-repair rows, unless the backfill script's own verification query gives you precise enough information to write a safe, targeted correction.
6. Re-run the full regression suite (`pnpm test:e2e`) against the recovered/corrected database before resuming normal operations.

There is no automated rollback tooling in this repository (`workspaceroadmap/backlog` and `PILOT_READINESS.md` both confirm this is a manual process today) — treat every migration on a production-like database as requiring a pre-migration snapshot as standard operating procedure, not an optional precaution.

---

## 7. Lost admin recovery

If the seeded `admin@helpinghands.org` account's password is lost and no other Administrator account exists:

1. **Via the API's password reset flow**, if SMTP is configured and working: use `/auth/forgot-password` on the public site (note: this flow currently has no corresponding page for participants on `apps/web` — see `USER_MANUAL.md` §7.1 — so for an admin-app account this must currently be done via a direct API call to `POST /auth/forgot-password`, or via direct database intervention below).
2. **Via direct database access** (the practical path today, given the gap above): connect to the database and either (a) generate a new `bcrypt` hash for a known password and `UPDATE users SET password = '<hash>' WHERE email = 'admin@helpinghands.org'`, or (b) create a brand-new `Admin` + `User` row with `role = 'administrator'` following the shape in `packages/database/prisma/seed.ts`, then run the Wave 1 backfill (`pnpm db:backfill:w1`) to ensure the new account also receives its `board_chair` platform grant.
3. Rotate the recovered account's password immediately after regaining access, and audit `/audit` for any suspicious activity in the window since the account was believed lost.

> ⚠️ There is currently no "break-glass" superuser recovery tool beyond direct database access. If your deployment has strict database-access controls (as it should in production), plan in advance who holds emergency DB credentials and under what authorization they may be used — this is an operational policy decision your organization needs to make, not something the platform enforces.

---

## 8. JWT rotation

`JWT_SECRET` and `JWT_REFRESH_SECRET` sign every access and refresh token in the system.

**To rotate (planned, low-urgency):**
1. Set new secret values in `.env`.
2. Restart the `api` service.
3. **Every existing session is immediately invalidated** — all users, across all three apps, will be forced to log in again on their next request. There is no dual-secret transition period implemented (no "accept tokens signed by either the old or new secret" grace window) — plan a rotation for a low-traffic maintenance window and communicate it in advance.

**To rotate (emergency — suspected secret leak):**
1. Generate new, strong random values for both `JWT_SECRET` and `JWT_REFRESH_SECRET` immediately.
2. Deploy and restart `api` as fast as possible — every minute the old secret remains valid is a minute a forged token (if the leak included working knowledge of the secret) remains accepted.
3. Force-communicate to all users that they'll need to log in again.
4. Review `/audit` for activity in the suspected leak window that doesn't match known user behavior.
5. If the leak also plausibly exposed the database password, SMTP credentials, or payment API keys, rotate all of those too — treat a JWT secret leak from a compromised host as "assume everything on that host is burned," not an isolated JWT-only incident.

---

## 9. Production emergency checklist

Keep this list somewhere reachable outside the system itself (it will not help you if the system is down and this document is only served *by* the system):

- [ ] **Who has database credentials, and how do they connect** (VPN, bastion host, direct — document your actual setup)?
- [ ] **Where is the most recent backup, and how old is it?** (If you haven't implemented §2.2's scheduled backup yet, the honest answer today is "however old your last manual `pg_dump` is" — fix this before go-live.)
- [ ] **Has a restore ever actually been rehearsed** (§3.3)? If the answer is no, treat your backups as unverified.
- [ ] **Who can rotate JWT/DB/SMTP/payment secrets**, and do they have the access to do so without waiting on someone else?
- [ ] **Is there a status page or communication channel** to tell users the system is down? (Not implemented by this platform — this is an organizational process, not a feature.)
- [ ] **Known open security gaps to remember during an incident:** auth endpoints are not rate-limited at the application layer (BUG-2, open — see `SYSTEM_ARCHITECTURE.md` §10); `.env.example` placeholder secrets must have been rotated before go-live, but confirm this wasn't missed if you're investigating unexpected access.
- [ ] **Rollback path for a bad deploy:** redeploy the previous container images/git commit; database changes are the harder part — see §6. There is no one-command rollback; budget real time for this.

---

## Related documents
- `DEPLOYMENT.md` — how the system is stood up in the first place; read together with this document.
- `SYSTEM_ARCHITECTURE.md` §10 — the full list of known gaps referenced throughout this document.
- `ADMIN_ACCEPTANCE_TEST.md` §22 — the release sign-off checklist, which requires a rehearsed restore before go-live.
