# Backlog — Wave 7: Public Transparency Portal
Source: [`../18_WAVE_7_REPORTING_TRANSPARENCY.md`](../18_WAVE_7_REPORTING_TRANSPARENCY.md) · Read-only wave: no new domain truth.

---

## Epic W7-E1 — Read layer & publication policy

**S1 · M · api,db — Materialized aggregates**
Do: Materialized views / cached aggregates: fund balances & flows, project funding & progress, org portfolios, decision registry; refresh on domain events (fallback: schedule); "as of" timestamp on every aggregate.
AC: Aggregates match live ledger/workflow queries on a fixture dataset; refresh fires on `ledger.posted` and workflow transitions.
Deps: W5 done, W6 done

**S2 · M · api — Publication policy (Board-controlled data)**
Do: Allowlist-based field-class policy per `../18`: aggregates public by default; donor identities private unless opted-in; social-support beneficiary data hard-excluded **at query level**; policy changes Board-gated + audited.
AC: Policy table seeded conservative; a policy change flows to public output; audited.
Deps: S1, W3-E2-S1

**S3 · M · qa — Privacy exclusion tests (permanent)**
Do: Specs asserting donor identity and beneficiary-category data never appear in any public endpoint response, including after aggressive query-param probing.
AC: In permanent suite; green.
Deps: S2

**S4 · S · api,infra — Public endpoint hardening**
Do: `@Public()` read-only endpoints with rate limiting, cache headers; no interactive/parameterized heavy queries on the public surface.
AC: Rate limit verified; endpoints serve only from the read layer.
Deps: S1

## Epic W7-E2 — Public portal (apps/web)

**S1 · L · web-ui — Organization & fund public pages**
Do: Org pages (profile block, verified badge, project portfolio) and fund pages (intake, allocations, spend by category) in ar/en/fr via existing `next-intl` + Block translations; RTL verified.
AC: Pilot municipality and one fund render correctly in all locales; only policy-cleared fields shown.
Deps: E1

**S2 · M · web-ui — Enriched project pages + donation traceability**
Do: Project pages gain funding sources (allocations + donation totals), milestone progress, decision history; "where the money went" chain: intake → account credit → spend category. Slugs/URLs unchanged.
AC: A donation is traceable end-to-end on the public site with "as of" freshness shown; existing page regression green.
Deps: E1

**S3 · M · web-ui — Platform statistics page**
Do: Platform-level stats: projects by category/status, total intake by channel, funds overview, orgs by type.
AC: Numbers reconcile with Board dashboard (same read layer).
Deps: E1

## Epic W7-E3 — Dashboards refactor (apps/admin)

**S1 · M · api,admin-ui — Board dashboard**
Do: Cross-entity KPIs, funds comparison, overdue reports, decision throughput — on the read layer.
AC: Numbers parity-checked against W5/W6 operational views.
Deps: E1-S1

**S2 · M · api,admin-ui — Org & fund workspace dashboards + legacy retirement**
Do: Org portfolio/funding/report-calendar dashboards; fund dashboard upgraded (trends, category breakdowns); legacy `dashboard`/`reports` module queries retired after number-parity confirmation (contracts preserved where the current UI consumes them).
AC: Recorded parity comparison; old query paths removed or delegating to read layer.
Deps: S1

## Epic W7-E4 — Exports

**S1 · M · api — Statement exports**
Do: Fund statements, project financial statements, org annual summaries as PDF/CSV from ledger queries; export access policy-gated per audience (public aggregates vs. workspace detail).
AC: Fund statement export reconciles with W5 balances; CSV round-trips.
Deps: E1

## Epic W7-E5 — Launch & wave close

**S1 · M · infra,qa — Load test & performance isolation**
Do: Load test public endpoints at expected regional traffic; verify zero operational-query degradation (separate pool/replica if needed per `../02`).
AC: Targets met; ops latency unchanged under public load.
Deps: E2, E1-S4

**S2 · S · docs — Board publication review + DoD walk**
Do: Board reviews live policy before launch; wave-doc DoD checklist; `PROGRESS.md` (W7 ✅).
AC: Board sign-off recorded; DoD checked with evidence.
Deps: all
