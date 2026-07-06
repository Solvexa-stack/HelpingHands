# 18 — Wave 7: Reporting & Transparency

## Goals
Turn the accountability data accumulated by Waves 0–6 (audit trail, ledger, decisions, votes, reports) into visible transparency: a public portal on `apps/web`, cross-entity dashboards for the Board, per-context analytics for organizations and funds, and exportable statements. This wave writes **no new domain truth** — only read models over existing tables.

## New tables / modules
- **`transparency` read layer** in the API: materialized views / cached aggregates for public consumption (fund balances & flows, project funding & progress, org portfolios, decision registry). Public endpoints are `@Public()`, read-only, rate-limited, and serve only fields cleared by the publication policy (below).
- **Publication policy** (data, Board-controlled): which classes of information are public vs. workspace-only — e.g. fund totals and per-project allocations public; individual donor identities private unless opted-in; personal beneficiary data (social-support categories) never public. Every public field traces to a policy entry.
- **`apps/web` portal sections:** organization public pages (profile block + verified badge + project portfolio), fund pages (intake, allocations, spend by category), project pages extended (funding sources, milestone progress, decision history), platform statistics page. Full ar/en/fr i18n via existing `next-intl` + Block translations.
- **Dashboards (`apps/admin`):** Board (cross-entity KPIs, funds comparison, overdue reports, decision throughput), org workspace (portfolio, funding received, report calendar), fund workspace (upgraded from Wave 5 with trends and category breakdowns).
- **Exports:** fund statements, project financial statements, org annual summaries (PDF/CSV) generated from ledger queries — the formal reporting artifacts municipalities and funds owe their stakeholders.

## What changes in the existing system
- Existing `dashboard` and `reports` API modules refactor onto the new read layer (their current queries predate orgs/funds/ledger); response contracts preserved where consumed by the current admin UI.
- `apps/web` project pages gain funding-source and progress sections (additive; slugs/URLs unchanged).
- Donation flows unchanged; donor pages may now show "where the money went" chains (donation → account credit → spend), the headline transparency feature.

## Migration strategy
- Read-only wave: no backfills, no dual-writes. Aggregates built beside existing queries; old dashboard queries retired once parity of displayed numbers is confirmed.
- Publication policy defaults to **conservative** (aggregates public, detail workspace-only); the Board explicitly opens categories of detail via audited policy changes.
- Performance isolation: public aggregates served from materialized views refreshed on domain events (or scheduled), so portal traffic never contends with operational queries; read replica optional if load demands (`02` allows it, Wave 8 hardens it).

## Risks
| Risk | Mitigation |
|---|---|
| Privacy breach via public data (donors, beneficiaries — martyr families, widows, orphans, IDPs) | Publication policy is allowlist-based per field class; social-support beneficiary data hard-excluded from the public layer at query level, not UI level; review with Board before launch |
| Public numbers disagree with internal numbers | All public figures derive from the same ledger/read layer as internal dashboards — one source; parity spot-checks in DoD |
| Aggregate staleness confuses users | Refresh-on-event + visible "as of" timestamps on public pages |
| Scraping/load on public endpoints | Rate limiting, caching headers, materialized views; no interactive queries on the public surface |

## Dependencies
Wave 5 (ledger as the financial source of truth), Wave 6 (reports, categories, municipal data worth showing). Board publication-policy decisions require Wave 3 governance.

## Definition of done
- [ ] Public portal live: org pages, fund pages, enriched project pages, platform statistics — in all three locales.
- [ ] Publication policy recorded as Board-controlled data; privacy exclusion tests (donor identity, beneficiary data) in the regression suite.
- [ ] A donation is traceable end-to-end on the public site: intake → project/fund → spend category, with "as of" freshness shown.
- [ ] Board, org, and fund dashboards live; legacy `dashboard`/`reports` queries retired after number-parity confirmation.
- [ ] Fund statement and project financial statement exports generate correctly from ledger data (reconciled against Wave 5 balances).
- [ ] Load test on public endpoints at expected regional traffic; no operational-query degradation.
