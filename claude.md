# EnergyBot — AI Energy Invoice Analyzer

## Project Goal
Portfolio project for Product Engineer.
Demonstrates: automation workflows, AI decision-making, memory systems.

## Project Philosophy
This is a portfolio project demonstrating Product Engineer thinking:
- Every decision must be documented and justified
- Workflow visibility is as important as functionality
- Memory and context management are core features, not afterthoughts

## Stack
- Backend: Node.js + Fastify
- Frontend: React
- Database: PostgreSQL
- AI: Claude API (claude-sonnet-4-6)
- Statistics: Python + FastAPI microservice (numpy, pandas, scipy)
- Deploy: Railway

## Project Structure
energybot/
├── backend/
│   ├── server.js
│   ├── routes/invoices.js
│   ├── routes/crm.js
│   ├── services/claudeService.js
│   ├── services/analysisService.js
│   ├── services/crmService.js
│   └── db/connection.js
├── frontend/
│   └── src/
├── python-service/
│   ├── main.py
│   ├── analyzer.py
│   └── requirements.txt
├── Dockerfile
├── railway.json
└── CLAUDE.md

## What's done
- [x] Project structure
- [x] Backend server with Fastify
- [x] PostgreSQL connection and invoices table
- [x] Frontend with Vite + React
- [x] Claude extraction service
- [x] Analysis agent with memory
- [x] Frontend UI
- [x] Deploy (Docker + Railway config)
- [x] Dashboard view with charts + navigation/routing polish
- [x] Simulated CRM integration (auto-sync on invoice analysis + CRM view)
- [x] Database seed script with realistic demo data (9 invoices, 3 clients, 3 providers, 1 anomaly)
- [x] Python microservice for statistical trend analysis (linear regression, seasonality, savings potential) + Dashboard "Trend Analysis" section
- [x] Automatic email alerts (Resend) when an anomaly is detected, sent after CRM sync
- [x] Internal prioritization agent (replaces the single-threshold anomaly rule) that reasons over historical pattern, client value, and anomaly type to decide priority and action, with reasoning surfaced in the UI
- [x] Rebrand to "EnergyOps" throughout user-facing surfaces; navigation split into "Customer View" (Upload/Dashboard/History) and "Internal Ops" (Priority Queue/CRM Sync) groups
- [x] Priority Queue view — persists agent decisions on `crm_contacts` and lists them ranked by priority as the internal team's primary screen
- [x] Visual design system overhaul — amber accent, flat borders, Space Grotesk headings/metrics, denser ops-tool layout
- [x] Merged CRM Sync into Priority Queue as the single internal view (lists all contacts, not just flagged ones); seed script now routes every seeded invoice through the prioritization agent so demo data has realistic reasoning
- [x] Full-width layout pass (removed scaffold's centered max-width column) and design-token cleanup so amber/navy system applies consistently across Dashboard, Upload, Result, History, and Priority Queue
- [x] Separated client (the business company manages energy for) from energy provider (Endesa/Iberdrola/etc., extracted from the PDF) as distinct entities throughout the data model — `invoices.client_name`, user-supplied at upload with autocomplete; `crm_contacts` keyed by client with a separate `provider` column; historical comparison and prioritization now scoped per client, not per provider
- [x] Documented a single `.env` workflow with commented local and Railway database URLs; local development commands use the active URL without environment-specific script aliases

## Key decisions made
- Use Claude API directly (with native PDF support + structured outputs) for invoice extraction instead of a traditional OCR library. See docs/decisions/002-claude-api-for-extraction.md.
- Use PostgreSQL's `invoices` table as the agent's memory layer for historical comparison (last 6 invoices), instead of in-process/ephemeral memory. See docs/decisions/003-memory-through-postgresql.md.
- The `/api/invoices/extract` endpoint runs the whole pipeline (extract → history lookup → analyze → save) as a single synchronous request rather than streaming progress via SSE/WebSockets. The frontend simulates the 5 workflow steps client-side with a timer while the request is in flight, so the UI stays simple (plain fetch, no streaming infra) while still giving the user visibility into the pipeline stages.
- ~~Deploy backend and frontend as two separate Dockerized Railway services, with nginx proxying `/api/*` to the backend.~~ Superseded — see docs/decisions/004-railway-deployment-with-docker.md.
- Deploy as a single Railway service: the Fastify backend serves the built React frontend as static files (`@fastify/static`, active only when `NODE_ENV=production`) instead of running a separate nginx service. One Dockerfile builds the frontend then copies it into the backend image. See docs/decisions/005-single-service-static-frontend.md.
- Use `react-router-dom` for real client-side routing (`/dashboard`, `/upload`, `/history`) instead of the previous `useState`-based tab switcher, now that there are 3 distinct views with Dashboard as the home page. Dashboard reuses the existing `GET /api/invoices` endpoint (no new backend endpoint) and aggregates totals/averages/charts client-side, keeping the backend API surface unchanged.
- Use `recharts` for the Dashboard's consumption/cost line charts — lightweight, React-native charting without a heavier dependency like D3 directly.
- Simulate the CRM integration (find-or-create `crm_contacts` by company name, automatic sync inline after invoice save, sync-status tracking) against the project's own PostgreSQL database instead of a real HubSpot/Salesforce sandbox, since no external CRM account is available for this portfolio project. The pattern (data mapping, automatic sync, status tracking) maps directly to a real CRM API integration. See docs/decisions/006-simulated-crm-integration.md.
- Add a separate Python + FastAPI microservice (`python-service/`) for statistical trend analysis (linear regression, seasonality detection, savings potential) instead of implementing the math in JavaScript, since numpy/pandas/scipy are the natural fit for this kind of analysis and it demonstrates a polyglot microservice architecture. The Node backend calls it over HTTP (`STATS_SERVICE_URL`, defaults to `http://localhost:8000`) with a 10-second timeout and fails gracefully (logs a warning, continues without trend data) if the service is unavailable — invoice analysis never depends on it being up. The production `Dockerfile` packages both Python and Node services in a single container using `docker-entrypoint.sh` to start both processes, ready for deployment to Railway as a single unit. See docs/decisions/007-python-microservice-for-statistics.md.
- Send automatic email alerts via Resend (`backend/services/emailService.js`) when the analysis agent detects an anomaly, instead of only surfacing it in the UI — demonstrating that the agent acts on its findings, not just reports them. Resend was chosen over SendGrid/Mailgun for its simpler API and generous free tier. Superseded as the sole trigger — see docs/decisions/009-ai-agent-decision-making.md — but `sendAnomalyAlert()` remains as the action `agentService.js` calls when it decides `send_email_alert` is the right response.
- Replace the single-threshold "if anomaly then email" rule with an internal prioritization agent (`backend/services/agentService.js`, `prioritizeAndAct()`) that combines historical anomaly pattern, client lifetime value, and inferred anomaly type (billing error vs. consumption increase vs. seasonal vs. unclear) via a structured Claude call, since a fixed threshold can't weigh conflicting signals (e.g. a small client with a huge anomaly vs. a large client with a moderate one) or distinguish a billing error from real consumption growth. The agent's full reasoning is surfaced in the UI so an internal team can trust and verify prioritization rather than receive a binary alert. This is the Internal Platforms & Data layer — invisible to end customers, letting a team scale attention across many clients. See docs/decisions/009-ai-agent-decision-making.md.
- Persist the agent's decision (`priority`, `reasoning`, `likelyRootCause`, `actionTaken`) on the `crm_contacts` row (`agent_priority`, `agent_reasoning`, `agent_root_cause`, `agent_action_taken` columns) instead of only returning it in the per-request API response, and add a Priority Queue view (`/priority-queue`) as the internal team's primary screen — a dense, priority-ranked list with expandable full reasoning — replacing CRM Sync as the centerpiece internal view (CRM Sync remains as the raw sync-status log). Rebrand user-facing name to "EnergyOps" and move the visual design system to an amber accent, flat borders, and Space Grotesk headings to read as a distinct internal/customer split rather than a generic AI-app template. See docs/decisions/010-priority-queue-and-rebrand.md.
- Merge CRM Sync into Priority Queue as a single internal view — both rendered the same `crm_contacts` rows via the same `GET /api/crm/contacts` endpoint, so keeping them separate cost a nav slot without a real separation of concerns. Priority Queue now lists all contacts (not just flagged ones) and gained CRM Sync's last-consumption column; `/crm` redirects to `/priority-queue`; `CrmView.jsx` is deleted. Also updated `backend/db/seed.js` to call `agentService.prioritizeAndAct()` for each seeded invoice (it previously only called `syncInvoiceToCRM()`, predating the agent), so seeded demo data shows real agent reasoning instead of empty fields. See docs/decisions/011-merge-crm-sync-into-priority-queue.md.
- Fixed a leftover from the Vite scaffold: `.app` in `frontend/src/App.css` still had `max-width: 1100px; margin: 0 auto`, and `frontend/src/index.css` still had the scaffold's generic font stack and background/text colors instead of the app's `--color-bg`/`--color-text` tokens — both undermined the "internal ops tool" look the amber/navy redesign was going for. Made `.app` full-width with consistent horizontal padding at each breakpoint, pointed `index.css`'s base color/background at the design tokens, bumped base font-size/line-height for readability, applied `Space Grotesk` to table headers and card headings (previously only metric values and page h1/h2 used it), and made the Priority Queue table use `table-layout: fixed` with proportional column widths instead of content-driven auto-sizing. Also collapsed the duplicate "Latest Anomaly" display on Dashboard (KPI card + banner both showed the same thing) down to a simple status indicator on the KPI card.
- Fixed a data modeling bug: every historical comparison, CRM contact, and prioritization decision was grouped/keyed by the invoice's `company` field, which is actually the energy **provider** issuing the bill (Endesa, Iberdrola, ...), not company's actual **client** (the business/real estate group being managed). Since many unrelated clients can share the same provider, this meant the app could silently merge different clients' consumption histories under one "company," making anomaly detection and agent prioritization meaningless in a real multi-client scenario. Added `invoices.client_name` (required, user-supplied at upload via a text input with a `<datalist>` of previously used names) as the primary grouping key for `analysisService.analyzeInvoice()`'s historical query and the agent's `historicalInvoices` lookup; `crm_contacts` is now found-or-created by client name with a new `provider` column holding the last known provider as metadata. Provider is still shown everywhere as a secondary detail ("Mercadona - Gran Vía 12 · via Endesa"). See docs/decisions/012-client-vs-provider-data-model.md.


## API Key
Uses ANTHROPIC_API_KEY from .env file

## Database
PostgreSQL Railway

## Code Standards
- Conventional commits: feat/fix/docs/chore
- Comments in English
- Create ADR in docs/decisions/ for every architectural decision
- Update CHANGELOG.md when features are complete

## Development Commands

**Backend** (from `backend/` directory):
```bash
npm run dev:clean    # Kill any running node processes and start backend
npm run dev          # Start backend (if no conflicts)
npm start            # Start backend in production mode
npm run migrate      # Run database migrations (creates tables)
npm run seed         # Seed database with 6 realistic demo invoices
```

**Frontend** (from `frontend/` directory):
```bash
npm run dev          # Start frontend
npm run build        # Build for production
```

**Python statistics service** (from `python-service/` directory):
```bash
pip install -r requirements.txt   # Install dependencies (first time)
python main.py                    # Start service on port 8000
```

When you finish, update CLAUDE.md:
- Mark completed tasks with [x]
- Add any new decisions made to the "Key decisions made" section