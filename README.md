EnergyOps is a customer-facing energy invoice analysis tool, built the way an Internal Platforms & Data engineer would build it: every customer interaction triggers internal automation. An AI agent evaluates each invoice and decides what deserves the internal team's attention — not through hardcoded rules, but by reasoning over historical patterns, client value, and anomaly type. The customer sees simple insights; internally, this is a prioritization system for a team that can't manually review every invoice.

This was built as a portfolio project for a Product Engineer application. Claude Code was the primary development tool throughout — that's stated upfront rather than hidden, since how the tool was used to make and document decisions is part of what this project demonstrates.

## The problem

Energy management companies handle invoices on behalf of clients — businesses or real estate groups — who receive bills from different energy providers (Endesa, Iberdrola, Naturgy...) across their properties. A team managing dozens of clients can't manually check every invoice against that client's history for billing errors or real consumption changes. The volume doesn't justify a human reviewing each one, but an unreviewed anomaly is either a billing dispute the client will eventually raise, or a real consumption problem going unnoticed.

## Two audiences, one system

An early version of this app grouped everything — historical comparison, CRM contacts, prioritization — by the `company` field extracted from the invoice PDF. That field is the **energy provider** billing the invoice (Endesa, Iberdrola...), not the **client** the business actually manages energy for. Two different clients using the same national provider would silently merge into one CRM contact and one historical baseline; a client switching providers would have their history split in two. This made anomaly detection and prioritization meaningless in a realistic multi-client scenario. The fix (`invoices.client_name`, supplied by the user at upload since it isn't on the PDF; `crm_contacts` keyed by client with `provider` as separate metadata) is documented in [ADR 012](docs/decisions/012-client-vs-provider-data-model.md) — worth reading because it explains the reasoning behind the correction, not just the end state.

That client/provider split underlies the app's two audiences:

- **Customer layer** — Upload, Dashboard (per-client, with a client selector), History. Simple, focused on "is my consumption normal and what should I do about it."
- **Internal Ops layer** — Priority Queue. The output of the internal prioritization agent, ranked by what needs attention first.

## How it works

```
Upload (PDF/JPG/PNG)
  → Claude extracts structured data (no OCR)
  → Compared against this client's history in Postgres
  → Python microservice computes trend/seasonality/savings
  → Agent reasons over the full context → decides priority + action
  → CRM synced, action executed (alert / flag / none)
  → Surfaces in Priority Queue, ranked
```

All of this runs synchronously within a single `POST /api/invoices/extract` request — there's no background job queue. The frontend simulates the workflow steps visually with a client-side timer while the request is in flight.

The "agent" here is a single structured Claude call that reasons over four inputs (current invoice, historical pattern for this client, client lifetime value, inferred anomaly type) and returns a JSON decision (`priority`, `reasoning`, `likelyRootCause`, `suggestedAction`, `confidence`), which the backend then executes deterministically via a switch statement. It's single-step reasoning plus tool/action selection — not a multi-step autonomous agent that plans or takes multiple actions in a loop.

## Key technical decisions

- **Claude API for extraction instead of OCR.** Invoices come from many providers with different layouts; Claude reads the PDF semantically via native document support instead of needing a per-provider parsing template. [ADR 002](docs/decisions/002-claude-api-for-extraction.md)
- **Client vs. provider as separate entities.** Grouping by provider instead of client silently merged unrelated clients' invoice histories — a real bug caught and fixed mid-project. [ADR 012](docs/decisions/012-client-vs-provider-data-model.md)
- **A reasoning agent instead of a threshold rule.** A fixed "if anomaly then email" rule can't distinguish a billing error from real consumption growth, or weigh a small client's severe anomaly against a large client's moderate one — these are judgment calls that require reasoning over multiple signals at once. [ADR 009](docs/decisions/009-ai-agent-decision-making.md)
- **PostgreSQL as the agent's memory layer.** The last 6 invoices per client, queried directly from the same table the UI reads, instead of a separate in-memory or vector store — durable across restarts and inspectable. [ADR 003](docs/decisions/003-memory-through-postgresql.md)
- **A Python microservice for statistical analysis.** Linear regression, seasonality detection, and savings estimates are a natural fit for numpy/pandas/scipy; the Node backend calls it over HTTP and degrades gracefully if it's unreachable. [ADR 007](docs/decisions/007-python-microservice-for-statistics.md)
- **Single Railway service instead of split frontend/backend.** Fastify serves the built React app as static files, avoiding a separate nginx service and private-network config for an app with no independent scaling need. [ADR 005](docs/decisions/005-single-service-static-frontend.md)

Full decision log, including superseded decisions: [docs/decisions/](docs/decisions/)

## What's simulated vs. real

- **CRM integration is simulated** against the project's own PostgreSQL database (`crm_contacts` table) rather than a real HubSpot/Salesforce sandbox, since no external CRM account was available. The pattern — find-or-create by business key, automatic sync on new data, sync-status tracking — is what would carry over to a real API integration; only the HTTP client and auth would change. [ADR 006](docs/decisions/006-simulated-crm-integration.md)
- **No RAG or embeddings.** At the current data volume (a handful of invoices per client), passing full recent history directly in the prompt is simpler and equally effective. pgvector-backed retrieval would be the next step if invoice volume per client grew large enough that "last 6 invoices" stopped being a sufficient context window.
- **No authentication.** Out of scope for a portfolio demo — anyone with the URL can use every view.

## What I'd do next in production

- Real CRM API integration (HubSpot or Salesforce), replacing the simulated `crm_contacts` sync with actual OAuth2-authenticated calls.
- Authentication and multi-tenancy — the current schema has no user/account concept.
- Tests around the agent's decision logic (does a given signal combination produce the expected priority?) and the extraction pipeline (does a malformed or unusual invoice fail gracefully?) — there are currently none.
- Duplicate invoice detection before running the full extract → analyze → save pipeline on a re-upload.
- Embeddings-based retrieval (pgvector) if per-client invoice volume grew enough to justify it over full-context prompting.

## Tech stack

**Backend** — Node.js, Fastify 5, `@fastify/multipart`, `@fastify/static`, `@fastify/cors`, `pg`, `resend`

**Frontend** — React 18, Vite, `react-router-dom` 7, `recharts`

**AI** — `@anthropic-ai/sdk`, Claude (`claude-sonnet-4-6`) for extraction, invoice analysis, and prioritization

**Data** — PostgreSQL (Railway), Python 3.12 microservice: FastAPI, numpy, pandas, scipy

**Deploy** — Single Railway service; root `Dockerfile` builds the frontend and packages both the Node backend and Python microservice into one `python:3.12-alpine` image, started via `docker-entrypoint.sh`

## Running locally

Requires PostgreSQL, Node.js, and Python 3.12+.

1. Copy `.env.example` to `.env` and fill in:
   ```
   DATABASE_URL=postgresql://user:password@host:port/database
   ANTHROPIC_API_KEY=sk-ant-...
   PORT=3000
   RESEND_API_KEY=re_...       # optional — email alerts are skipped silently without it
   ALERT_EMAIL=alerts@example.com
   ```

2. **Backend** (from `backend/`):
   ```bash
   npm install
   npm run migrate   # creates invoices and crm_contacts tables
   npm run seed       # optional — seeds 9 realistic demo invoices across 3 clients
   npm run dev
   ```

3. **Frontend** (from `frontend/`):
   ```bash
   npm install
   npm run dev
   ```

4. **Python statistics service** (from `python-service/`, optional — the app runs without it, just without trend data):
   ```bash
   pip install -r requirements.txt
   python main.py   # runs on port 8000
   ```

## Live demo

[ADD URL HERE]
