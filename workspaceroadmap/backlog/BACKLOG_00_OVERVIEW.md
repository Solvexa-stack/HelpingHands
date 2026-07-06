# Engineering Backlog — Overview & Conventions

This backlog transforms the wave documents (`../11`–`../19`) into executable work items. It does **not** redesign anything: every story traces to a wave doc section; if a story seems to contradict a wave doc, the wave doc wins and the story is fixed.

## Files
One backlog file per wave: `BACKLOG_W0_FOUNDATIONS.md` … `BACKLOG_W8_CONSOLIDATION.md`. Import them into your tracker (Jira/Linear/GitHub Projects) as Epics → Stories, or work directly from these files and check items off.

## ID scheme
`W<wave>-E<epic>-S<story>` — e.g. `W1-E3-S2`. Stable IDs: never renumber; append new stories at the end of an epic.

## Story format
```
S<n> · <estimate> · <labels> — <title>
Do:   what to build/change, concretely (files/modules named where known)
AC:   acceptance criteria — verifiable, binary
Deps: story/epic IDs that must be DONE first (— means none)
```

## Estimates
- **S** ≤ 1 dev-day · **M** 2–3 dev-days · **L** ~1 week · **XL** must be split before starting (none should remain XL at sprint planning).

## Labels
`db` (Prisma schema/migration) · `api` (NestJS) · `admin-ui` (apps/admin) · `web-ui` (apps/web) · `qa` (tests) · `migration` (backfill/data script) · `infra` (CI, flags, jobs) · `docs`

## Definition of Ready (story enters a sprint)
- Dependencies done or scheduled earlier in the sprint.
- The referenced wave-doc section has been read by the assignee.
- For `migration` stories: derivation rule and verification query written down before coding.

## Definition of Done (every story)
- Code merged to `main` behind the wave's feature flag where applicable.
- Regression suite green (flags OFF and ON, per `../09` compatibility contract).
- New mutating actions emit audit events; new tables follow soft-delete/immutability conventions (`../03`).
- `PROGRESS.md` and seed script updated if the story affects them.

## Epic exit ≠ wave exit
A wave is done only when its wave doc's **Definition of Done** checklist passes — that list is the gate, this backlog is the path.

## Sizing summary (for planning)

| Wave | Epics | Stories | Rough size |
|---|---|---|---|
| W0 Foundations | 5 | 19 | 3–4 wk |
| W1 Identity & Multi-Tenancy | 6 | 18 | 3–4 wk |
| W2 Organizations & Workspaces | 6 | 19 | 4–5 wk |
| W3 Governance Board & Voting | 6 | 16 | 3–4 wk |
| W4 Workflow Engine | 6 | 18 | 5–6 wk |
| W5 Treasury & Funds | 8 | 22 | 5–6 wk |
| W6 Municipal Integration | 7 | 19 | 4–5 wk |
| W7 Transparency Portal | 5 | 16 | 3–4 wk |
| W8 Final Consolidation | 5 | 15 | 3 wk |

Assumes 2–4 devs; W2/W3/W4 may overlap per `../10`; W4 and W5 must not overlap each other.
