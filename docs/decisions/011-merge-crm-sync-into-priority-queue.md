# ADR 011: Merge CRM Sync into Priority Queue; route seed data through the agent

## Status
Accepted

## Context
ADR 010 kept CRM Sync alongside the new Priority Queue view, reasoning that they answered different questions ("is the sync working?" vs. "what do I need to look at today?"). In practice both views rendered the same `crm_contacts` rows from the same `GET /api/crm/contacts` endpoint — Priority Queue just filtered to flagged items and added reasoning, while CRM Sync showed the full list with sync status and last consumption. Having two internal nav items pointing at the same underlying entity was redundant rather than genuinely serving two audiences: an internal user checking sync health still wants to see the agent's read on that contact once they're looking, and someone checking priority still wants to know if the sync succeeded.

Separately, `backend/db/seed.js` called `crmService.syncInvoiceToCRM()` directly but never `agentService.prioritizeAndAct()`, because the seed script predates the agent (ADR 009). Seeded demo data therefore always showed empty `agent_priority`/`agent_reasoning`, making the Priority Queue view look broken immediately after a fresh seed.

## Decision
- **Remove CRM Sync as a separate view/route.** `/crm` now redirects to `/priority-queue`. The "CRM Sync" nav item is removed from `Header.jsx`; "Priority Queue" is the only remaining item under "Internal Ops".
- **Priority Queue becomes the single list of all CRM contacts**, not just flagged ones. It keeps everything CRM Sync showed (last consumption in kWh) plus everything it already had (priority badge, root cause, reasoning excerpt/expand, action taken, last synced). Empty state and sorting are unchanged in spirit (priority high → medium → low → none, then most-recently-synced first) but no longer excludes `none`-priority contacts, since this view is now the only place to see the full contact list.
- **`CrmView.jsx` is deleted** rather than kept unused, since nothing routes to it anymore.
- **`backend/db/seed.js` now calls `agentService.prioritizeAndAct()`** for each seeded invoice, right after `syncInvoiceToCRM()`, passing the other already-inserted invoices for that company as `historicalInvoices` and the fresh CRM contact row — the same shape `POST /api/invoices/extract` passes in production. The result is persisted via `crmService.saveAgentDecision()`, and each contact's assigned priority/reasoning is logged to the console so a re-seed's output can be visually verified without opening the UI. The anomalous Iberdrola invoice (Feb 2025, 89.2% above average) gets an explicit `comparison` object in its seed entry (rather than relying on `analysisService` to compute it) since it has no prior invoices at seed time to derive a historical baseline from — the agent otherwise has nothing to compare against for the very first row inserted for that company.

## Rationale
- **Why merge instead of keep both**: the "raw sync log" need CRM Sync served is satisfied by the same row Priority Queue already renders (`last_sync_status`, `last_synced_at`, `anomaly_status` are just additional columns on the same object) — splitting them into two screens cost a nav slot and a mental model ("which view has the field I need?") for no real separation of concerns.
- **Why seed data must go through the real agent instead of stubbing `agent_priority` fields directly**: the entire point of the Priority Queue demo is to show the agent's actual reasoning, in Spanish, referencing the specific signals it weighed. A hardcoded string would look like a demo, not a working feature; running the real `prioritizeAndAct()` call means the seed output is identical in kind to what a live upload produces.
- **Why the seed script needs one extra `comparison` field for Iberdrola**: `prioritizeAndAct()`'s prompt reads `analysisResult.comparison.consumptionDiffPct`/`costDiffPct` for severity context. In the real upload flow this comes from `analysisService.analyzeInvoice()`, which the seed script deliberately doesn't call (it inserts pre-written rows rather than re-deriving them). Without it, the agent would see "N/A" for deviation on the one invoice where that number is the whole point.

## Trade-offs accepted
- Seeding now makes one real Claude API call per invoice (10 total), so `npm run seed` takes longer and costs a small amount of API usage. Acceptable for a portfolio project's demo data step, which runs rarely.
- If `prioritizeAndAct()` fails during seeding (e.g. missing `ANTHROPIC_API_KEY`), that contact's agent fields stay `NULL` and a warning is logged — seeding does not abort, matching how the real upload route already treats agent failures as non-fatal.

## Consequences
- `frontend/src/components/CrmView.jsx` deleted; `frontend/src/components/PriorityQueueView.jsx` renders the full contact list and gains a "Last consumption" column.
- `frontend/src/App.jsx`: `/crm` route redirects to `/priority-queue` instead of rendering `CrmView`.
- `frontend/src/components/Header.jsx`: "Internal Ops" nav group now has a single item.
- `backend/db/seed.js` imports `agentService.prioritizeAndAct` and `crmService.saveAgentDecision`, and logs each contact's assigned priority/reasoning during seeding.
- `backend/routes/crm.js` and `GET /api/crm/contacts` are unchanged — both the old and new frontend views only ever read this same endpoint.
