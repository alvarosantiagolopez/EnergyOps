# ADR 010: Persist agent decisions for a Priority Queue view; rebrand to EnergyOps

## Status
Accepted

## Context
ADR 009 introduced `agentService.prioritizeAndAct()`, but explicitly accepted "no persistence of past agent decisions" — the `priority`/`reasoning`/`likelyRootCause` fields only ever existed in that one API response (`agentDecision`), shown once in `ResultView.jsx` right after upload. There was no way for an internal team member to come back later and see which clients currently need attention; they would have to re-upload or re-derive it. The CRM Sync view existed, but it only showed raw sync status (`synced`/`pending`/`needs_review`), not the agent's actual reasoning.

Separately, the product's name ("EnergyBot") and single-blue-cards visual design read as a generic AI-app template rather than a tool built with a specific internal/customer split in mind. The two audiences (the customer uploading invoices, and the internal team triaging anomalies) shared one undifferentiated nav and one design language.

## Decision
- **Persist the agent's decision on the CRM contact.** `crm_contacts` gains `agent_priority`, `agent_reasoning`, `agent_root_cause`, `agent_action_taken` columns. `crmService.saveAgentDecision()` writes the latest decision after `prioritizeAndAct()` runs in `backend/routes/invoices.js`. This reuses the existing per-company `crm_contacts` row (one agent verdict per company, not a full audit history — see Trade-offs) rather than introducing a new `agent_decisions` table, keeping the schema change minimal.
- **Add a Priority Queue view** (`/priority-queue`, `frontend/src/components/PriorityQueueView.jsx`) as the internal team's primary screen: a dense, sortable-by-priority list (high → medium → low → none) of every contact the agent has evaluated, with root cause, a truncated reasoning excerpt, last-synced time, and action taken. Clicking a row expands it inline to show the full reasoning — this is the same "surface the reasoning so the team can trust and verify it" principle from ADR 009, now available persistently instead of only at upload time.
- **Split the header nav into "Customer View" (Upload, Dashboard, History) and "Internal Ops" (Priority Queue, CRM Sync)** with a visual divider and group labels, making explicit that these are two different audiences for the same tool rather than one flat feature list.
- **Rebrand user-facing strings from "EnergyBot" to "EnergyOps"** (header, HTML title, README, package descriptions, the Python service title, startup logs) to better reflect the internal-ops half of the product. Repo/file/folder names are left as `energybot` — this is a display-name change only, not a repo migration.
- **Visual redesign**: amber/burnt-orange (`#D97706`) accent replaces the default blue (`#3B82F6`); flat 1px borders replace soft drop-shadows; content background moves to a warm off-white (`#FAFAF8`) instead of pure white/light-slate; `Space Grotesk` (via Google Fonts) is used for headings and metric numbers with `tabular-nums`; the Priority Queue specifically uses a monospace font for reasoning text and tighter row spacing to read like an ops/terminal tool rather than a marketing dashboard.

## Rationale
- **Why the CRM contact row, not a new decisions table**: the Priority Queue only needs to answer "what's the latest thing the agent decided about this client," which is exactly the shape `crm_contacts` already has one row per company for. A history table is deferred until there's an actual need to audit past verdicts (see ADR 009's "In production" section, which already flagged this).
- **Why Priority Queue replaces CRM Sync as the internal team's main view, but CRM Sync isn't removed**: CRM Sync still serves as the raw sync-status log (useful for debugging "did this company actually sync"), while Priority Queue is the actionable, reasoning-first view — same underlying data, different audience question ("is the sync working?" vs. "what do I need to look at today?").
- **Why amber over blue**: ties the accent color to "energy" thematically and is an easy, low-risk way to visually differentiate from the extremely common blue-accent AI-generated app look, without a full design system rewrite.

## In production
- Add an `agent_decisions` audit table if the team wants to see how a client's priority trended over multiple invoices, not just the latest verdict.
- Priority Queue could support filtering/searching by root cause or company once the contact list grows beyond a single screen.

## Trade-offs accepted
- Only the *latest* agent decision per company is retained; re-running analysis on a new invoice overwrites the previous verdict on the same `crm_contacts` row.
- The Priority Queue reuses `GET /api/crm/contacts` rather than a dedicated endpoint — acceptable because the two views need the same rows, just different rendering/sorting.

## Consequences
- `backend/db/schema.sql`: `crm_contacts` has four new nullable columns; existing rows simply have `NULL` agent fields until their next sync.
- `backend/services/crmService.js` exports `saveAgentDecision()`; `backend/routes/invoices.js` calls it right after `prioritizeAndAct()` resolves, best-effort (a failure to persist is logged as a warning and does not fail the request).
- `frontend/src/components/PriorityQueueView.jsx` is new; `Header.jsx` and `App.jsx` route to it under `/priority-queue`.
