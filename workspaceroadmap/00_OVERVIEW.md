# 00 — Overview & How to Use This Roadmap

## Purpose
This folder is the complete engineering execution plan for evolving **HelpingHands** (a working civic project-management and donation platform) into a **multi-entity governance, funding, and workflow platform** serving NGOs, municipalities, youth teams, dynamic funds, and a central Governance Board.

It is written to be handed to a development team and executed wave-by-wave without further architectural redesign.

## Ground rules (apply to every document)
1. **No big rewrite.** The current system is in production. Every change is incremental.
2. **Backward compatible.** Existing projects, donations, users, and the current lifecycle keep working through every wave.
3. **Additive migrations only** until Wave 8 (Final Consolidation). Nothing is dropped, renamed, or repurposed before then.
4. **No special-case entities.** Municipalities, the Board, NGOs, and youth teams are all `Organization` rows differentiated by type + capabilities — never by hardcoded branches.
5. **Money and state are owned.** Only the Treasury module writes ledger entries; only the Workflow Engine changes lifecycle state.

## Reading order

| Docs | What they give you |
|---|---|
| `01`–`02` | Where we are, where we're going |
| `03`–`08` | The six design pillars (data model, workflow, tenancy, treasury, governance, permissions) |
| `09` | The migration & compatibility playbook that all waves obey |
| `10` | The master wave plan (sequencing, dependency graph) |
| `11`–`19` | One executable document per wave (0 through 8) |

## The waves at a glance

| Wave | Doc | Theme | Depends on |
|---|---|---|---|
| 0 | `11` | Foundations: audit log, soft delete, event bus | — |
| 1 | `12` | Identity & multi-tenancy: organizations, scoped roles | 0 |
| 2 | `13` | Organizations live: workspaces, onboarding, FK debt fixes | 1 |
| 3 | `14` | Governance Board: decisions, generalized voting | 1, 2 |
| 4 | `15` | Workflow engine: lifecycle as data | 0–3 |
| 5 | `16` | Treasury & funds: double-entry ledger, allocations | 0, 3, 4 |
| 6 | `17` | Municipal integration: joint projects, funding agreements | 2, 3, 5 |
| 7 | `18` | Reporting & transparency: portal, dashboards | 5, 6 |
| 8 | `19` | Final consolidation: remove legacy paths, harden | all |

## Glossary (used consistently everywhere)

- **Organization** — any workspace entity: NGO, municipality, youth team, initiative, or the Board itself.
- **Capability** — an attribute on an organization describing what the *organization* may do (e.g. `canReceivePublicFunds`). Checked by policy, never by `if type === ...`.
- **Scope** — the context of a role grant: `platform | organization | fund | project`.
- **Fund** — a pooled treasury with its own officers, governance, and ledger accounts (e.g. Development & Infrastructure Fund).
- **Allocation** — approved financing from a fund to a project, disbursed in tranches through the ledger.
- **Workflow definition / instance** — a versioned state machine stored as data / one subject's position within it.
- **Board decision** — an immutable record of the Board approving, rejecting, or requesting changes on any subject.
- **Dual-write** — writing both legacy and new representation during a wave so either read path is correct (see `09`).

## Relationship to `ARCHITECTURE-REDESIGN.md`
That document is the original analysis and target-state proposal. This folder supersedes it as the execution source of truth; where detail differs, the numbered docs win. The analysis and rationale there remain valid background reading.
