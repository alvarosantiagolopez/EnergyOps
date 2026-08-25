# EnergyOps

EnergyOps is a customer-facing invoice analysis tool, built the way an Internal Platforms & Data engineer would build it: every customer interaction triggers internal automation. An AI agent evaluates each invoice and decides what deserves the internal team's attention — not through hardcoded rules, but by reasoning over historical patterns, client value, and anomaly type. The customer sees simple insights; internally, this is a prioritization system for teams that can't manually review every invoice.

## Two audiences, one pipeline

- **Customer view** (Upload, Dashboard, History) — upload an energy invoice, see extracted data, historical comparisons, and simple recommendations.
- **Internal Ops view** (Priority Queue, CRM Sync) — every analyzed invoice is automatically synced to a CRM contact and evaluated by an internal prioritization agent, which decides `priority` (high/medium/low/none), the likely `root cause` (billing error, consumption increase, seasonal pattern, or unclear), and what action to take (flag for manual review, send an email alert, or just log it). The **Priority Queue** is where that reasoning surfaces persistently, ranked so the team can triage clients without reviewing every invoice by hand.

## Architecture

```
energybot/
├── backend/                  # Fastify API
│   ├── server.js
│   ├── routes/invoices.js    # extraction → analysis → CRM sync → agent decision pipeline
│   ├── routes/crm.js
│   ├── services/claudeService.js     # invoice extraction (Claude, native PDF support)
│   ├── services/analysisService.js   # historical comparison + anomaly detection
│   ├── services/crmService.js        # simulated CRM sync + agent decision persistence
│   ├── services/agentService.js      # internal prioritization agent
│   ├── services/emailService.js      # automatic anomaly alerts (Resend)
│   └── db/connection.js
├── frontend/
│   └── src/
│       ├── components/UploadView.jsx
│       ├── components/DashboardView.jsx
│       ├── components/HistoryView.jsx
│       ├── components/PriorityQueueView.jsx   # internal ops centerpiece
│       └── components/CrmView.jsx
├── python-service/           # FastAPI microservice: trend analysis (numpy/pandas/scipy)
├── Dockerfile
├── railway.json
└── docs/decisions/           # ADRs for every architectural decision
```

## Workflow

1. A customer uploads a PDF/image invoice (`UploadView`).
2. `claudeService.js` extracts structured data using Claude's native PDF support.
3. `analysisService.js` pulls the client's last 6 invoices from PostgreSQL (the agent's memory layer), computes deviations, and flags anomalies.
4. `crmService.js` syncs the result to a simulated CRM contact.
5. `agentService.js` reasons over the historical pattern, client lifetime value, and inferred anomaly type to decide a priority, root cause, and action — then executes it (manual-review flag, email alert, or log only) and persists the decision on the CRM contact.
6. The customer sees a simple result (Dashboard/History). The internal team sees the full reasoning in the **Priority Queue**.

## Key decisions

Every architectural decision is documented as an ADR in [`docs/decisions/`](docs/decisions/), including:

- Using the Claude API directly for extraction instead of traditional OCR ([002](docs/decisions/002-claude-api-for-extraction.md))
- Using PostgreSQL as the agent's memory layer ([003](docs/decisions/003-memory-through-postgresql.md))
- A single Railway service serving both API and static frontend ([005](docs/decisions/005-single-service-static-frontend.md))
- Simulating the CRM integration against the project's own database ([006](docs/decisions/006-simulated-crm-integration.md))
- A Python microservice for statistical trend analysis ([007](docs/decisions/007-python-microservice-for-statistics.md))
- Automatic email alerts on detected anomalies ([008](docs/decisions/008-email-alerts-for-anomalies.md))
- Replacing a single-threshold rule with a reasoning-based internal prioritization agent ([009](docs/decisions/009-ai-agent-decision-making.md))
- Persisting agent decisions and introducing the Priority Queue view ([010](docs/decisions/010-priority-queue-and-rebrand.md))

## Stack

Node.js + Fastify · React · PostgreSQL · Claude API · Python + FastAPI (numpy/pandas/scipy) · Railway

## Development

**Backend** (from `backend/`):
```bash
npm run dev:clean    # kill any running node processes and start backend
npm run migrate      # create/update tables
npm run seed         # seed with realistic demo invoices
```

**Frontend** (from `frontend/`):
```bash
npm run dev
```

**Python statistics service** (from `python-service/`):
```bash
pip install -r requirements.txt
python main.py
```
