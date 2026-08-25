# Changelog

## [1.13.0] 25-08-2026

### Fixed
- **Data modeling bug: invoices were grouped by energy provider instead of client.** Historical comparison, CRM contacts, and the prioritization agent all keyed off `invoices.company` — the provider extracted from the PDF (Endesa, Iberdrola, ...) — instead of the actual business a company manages energy for. Since different clients can share the same provider, this could silently merge unrelated clients' consumption histories under one CRM contact, making anomaly detection and prioritization meaningless. See docs/decisions/012-client-vs-provider-data-model.md.

### Added
- `invoices.client_name` column: the primary grouping key for historical comparison, supplied by the user at upload time (required text input in `UploadView.jsx`, with a `<datalist>` of previously used client names sourced from a new `GET /api/invoices/client-names` endpoint).
- `crm_contacts.provider` column: stores the last known energy provider for a client as metadata, separate from the client-keyed `company_name` column.

### Changed
- `backend/services/analysisService.js`: `analyzeInvoice()` now takes a `clientName` param and scopes the historical comparison query to `WHERE client_name = $1` instead of `WHERE company = $1`; `saveInvoice()` persists `client_name`.
- `backend/services/crmService.js`: `syncInvoiceToCRM()` finds-or-creates `crm_contacts` by client name and stores the invoice's provider separately.
- `backend/routes/invoices.js`: `POST /api/invoices/extract` requires a `clientName` form field alongside the file (400 if missing).
- `backend/services/agentService.js` / `emailService.js`: prompts and alert emails reference both client and provider, with client as the primary identity.
- `backend/db/seed.js`: the 9 seeded invoices are now assigned to 3 fake clients ("Mercadona - Gran Vía 12", "Grupo Inmobiliario Aurora", "Hostelería Sur S.L.") across the existing 3 providers; historical lookup is client-scoped.
- Frontend (`ResultView.jsx`, `PriorityQueueView.jsx`, `HistoryView.jsx`, `DashboardView.jsx`): client name is now the primary displayed identifier, with provider shown as a secondary detail ("Mercadona - Gran Vía 12 · via Endesa").

## [1.12.0] 25-08-2026

### Fixed
- **Layout was centered/narrow instead of full-width.** `.app` (`frontend/src/App.css`) had `max-width: 1100px; margin: 0 auto`, left over from the initial scaffold, making the whole app read as a centered landing page rather than a dashboard. Now `.app` spans the full viewport width with 2.5rem horizontal padding (1.5rem on tablet, 1rem on mobile); `.app-header`'s negative margins/padding were updated to match at each breakpoint.
- **Design tokens defined but not fully applied.** `frontend/src/index.css` still had the original Vite scaffold's generic system-font stack and `#f5f7fa`/`#1f2933` colors as the `:root`/`body` base, which showed through wherever a component didn't set its own background/color. It now defers to the `--color-bg`/`--color-text` tokens from `App.css`.
- **Duplicate "Latest Anomaly" display on Dashboard.** The KPI metric card and the anomaly banner below it both surfaced the same info. The KPI card now reads as a simple "Anomaly Status" (All clear / Anomaly detected) indicator, leaving the detailed company/period/message to the banner.

### Changed
- Bumped base font size/line-height (`frontend/src/index.css`: 16px/1.6) and page heading size (`.page-header h1`: 1.85rem, now set in `Space Grotesk`) for a dashboard meant to be read for extended periods.
- Applied `Space Grotesk` to table headers (`.history-table th`, `.queue-table th`) and card headings (`.card h2`), consistent with metric values, so all data-labeling text uses the display font.
- Tightened `--radius-lg`/`--radius-md` (6px/4px → 4px/3px) and card padding for a flatter, denser look consistent with the rest of the ops-tool redesign.
- Priority Queue table (`.queue-table`) now uses `table-layout: fixed` with explicit proportional column widths instead of letting content dictate column size, so it stretches to fill the available width instead of clustering in the middle.

## [1.11.0] 25-08-2026

### Added
- ADR 011 (`docs/decisions/011-merge-crm-sync-into-priority-queue.md`): documents merging CRM Sync into Priority Queue and routing seed data through the prioritization agent.
- `backend/db/seed.js` now calls `agentService.prioritizeAndAct()` for each seeded invoice (with the other seeded invoices for that company as historical context), persists the decision via `crmService.saveAgentDecision()`, and logs each contact's assigned priority/reasoning to the console for verification. The anomalous Iberdrola invoice gets an explicit `comparison` field so the agent has deviation data to reason over despite having no prior invoices at seed time.

### Changed
- **Merged CRM Sync into Priority Queue.** Priority Queue (`/priority-queue`) is now the single internal view: it lists *all* CRM contacts (not just flagged ones), combining Priority Queue's existing columns (priority badge, root cause, reasoning excerpt/expand, action taken) with CRM Sync's last-consumption-in-kWh column.
- `frontend/src/components/Header.jsx`: removed "CRM Sync" from "Internal Ops" nav — "Priority Queue" is the only remaining item.
- `frontend/src/App.jsx`: `/crm` now redirects to `/priority-queue` instead of rendering a separate view.

### Removed
- `frontend/src/components/CrmView.jsx` — fully superseded by the merged Priority Queue view.

## [1.10.0] 25-08-2026

### Added
- `crm_contacts` table: `agent_priority`, `agent_reasoning`, `agent_root_cause`, `agent_action_taken` columns. `crmService.saveAgentDecision()` persists the internal agent's latest decision after `prioritizeAndAct()` runs.
- Priority Queue view (`frontend/src/components/PriorityQueueView.jsx`, route `/priority-queue`): dense, sortable-by-priority list of CRM contacts with root cause, a truncated reasoning excerpt (expandable inline), last-synced timestamp, and action taken. Replaces CRM Sync as the internal team's primary view.
- Root `README.md`: project overview, architecture, workflow, and links to all ADRs.
- ADR 010 (`docs/decisions/010-priority-queue-and-rebrand.md`): documents persisting agent decisions and the rebrand/navigation restructure.

### Changed
- Renamed the app from "EnergyBot" to "EnergyOps" throughout user-facing surfaces (header, HTML title, READMEs, Python service title, container startup logs). File/folder names remain `energybot`.
- Header navigation (`frontend/src/components/Header.jsx`) split into two labeled groups with a divider: "Customer View" (Upload, Dashboard, History) and "Internal Ops" (Priority Queue, CRM Sync).
- Full visual redesign (`frontend/src/App.css`): amber/burnt-orange (`#D97706`) accent replaces blue; flat 1px borders replace drop-shadows; warm off-white (`#FAFAF8`) content background; `Space Grotesk` for headings/metrics with tabular numerals; denser card padding; Priority Queue uses a monospace font for reasoning text.
- Dashboard copy simplified to customer-facing language ("Your Energy Insights").
- `backend/routes/invoices.js`: persists the agent's decision to the CRM contact (best-effort, logged on failure) right after `prioritizeAndAct()` resolves.

## [1.9.0] 19-08-2026

### Added
- `backend/services/agentService.js`: `prioritizeAndAct(invoiceData, analysisResult, historicalInvoices, crmContact)` — an internal prioritization agent that reasons over historical anomaly pattern, client lifetime value, and inferred anomaly type (billing error vs. consumption increase vs. seasonal vs. unclear) to decide `priority`, `reasoning`, `likelyRootCause`, `suggestedAction`, and `confidence` via a structured Claude call, then executes the action (`flag_for_manual_review` → `crm_contacts.last_sync_status = 'needs_review'`, `send_email_alert` → `emailService.sendAnomalyAlert()`, or logs only for `monitor_next_cycle`/`no_action_needed`).
- ADR 009 (`docs/decisions/009-ai-agent-decision-making.md`): documents why the previous single-threshold "if anomaly then email" rule was insufficient and why the agent's combined signals and visible reasoning matter for an internal team.

### Changed
- `POST /api/invoices/extract` (`backend/routes/invoices.js`) now fetches all prior invoices for the company, calls `agentService.prioritizeAndAct()` instead of `emailService.sendAnomalyAlert()` directly, and returns the full decision as `agentDecision` in place of the old `emailAlert` field.
- Result view (`frontend/src/components/ResultView.jsx`): replaces the "alert email sent" badge with an "Internal Agent Decision" card — a color-coded priority badge (high/medium/low/none), detected root cause, the agent's full reasoning text, the action taken, and its confidence level.

## [1.8.0] 19-08-2026

### Added
- `backend/services/emailService.js`: `sendAnomalyAlert(invoiceData, analysisResult)` sends an HTML email via Resend when an anomaly is detected — company, billing period, current vs. average consumption with percent difference, anomaly description, and the top recommendation. Skips silently (`{ sent: false, reason }`) when there's no anomaly or email isn't configured.
- `resend` dependency added to `backend/package.json`; `RESEND_API_KEY` and `ALERT_EMAIL` environment variables added to `.env` / `.env.example`.
- `POST /api/invoices/extract` now calls `sendAnomalyAlert()` after the CRM sync step and includes the result as `emailAlert` in the response. Failures are caught and logged as warnings without breaking the request.
- Result view (`frontend/src/components/ResultView.jsx`): shows a "📧 Alert email sent" badge next to the company name and a note under the anomalies section when `emailAlert.sent` is true.
- ADR 008 (`docs/decisions/008-email-alerts-for-anomalies.md`): documents why automatic alerts matter (agent that acts, not just analyzes), why Resend over SendGrid/Mailgun, and how this would extend to Slack/PagerDuty/CRM-contact routing in production.

## [1.7.0] 17-08-2026

### Added
- `python-service/`: a FastAPI microservice for statistical trend analysis. `analyzer.py`'s `calculate_trends()` computes monthly average consumption/cost, a trend direction and percentage via linear regression (`scipy.stats.linregress`), summer-vs-winter seasonality detection, the peak consumption month, and an estimated savings potential in EUR. `main.py` exposes `POST /analyze-trends` and `GET /health`.
- `backend/services/analysisService.js`: `fetchTrends()` queries all historical invoices and calls the Python service; fails gracefully (logs a warning, returns `null`) if the service is unreachable or times out (10-second limit).
- `GET /api/invoices/trends` endpoint (`backend/routes/invoices.js`): lets the Dashboard fetch trend data independently of the upload flow. `POST /api/invoices/extract` now also includes a `trends` field in its response.
- Dashboard "Trend Analysis" card (`frontend/src/components/DashboardView.jsx`): trend direction with an arrow icon (↑/↓/→), percentage change, a seasonality badge, the peak consumption month, and — when positive — an estimated savings figure highlighted in green. Hidden entirely if the Python service didn't return data.
- Root `Dockerfile`: now a multi-language build that installs Python and Node in a single `python:3.12-alpine` base image. Frontend builds first, then both Python dependencies and Node dependencies are installed, and both services are packaged together.
- `docker-entrypoint.sh`: shell script that starts the Python service (port 8000) in the background, then the Node backend (port 3000) in the foreground; both run inside the same container.
- ADR 007 (`docs/decisions/007-python-microservice-for-statistics.md`): documents using Python for statistical analysis, the microservice pattern, graceful degradation, and the production-ready Docker setup with both services in one container.

## [1.6.1] 17-08-2026

### Added
- `backend/db/seed.js`: database seed script that populates 6 realistic demo invoices (3 from Endesa, 2 from Iberdrola with 1 anomaly, 1 from Naturgy) and auto-syncs them to CRM contacts.
- Seeded invoices include Spanish AI analysis and actionable recommendations; raw extracted data as JSONB; realistic consumption (45-180 kWh) and cost variations.
- One seeded Iberdrola invoice demonstrates anomaly detection (80%+ consumption increase).
- Seed script is idempotent: skips if >3 invoices already exist, making it safe to run multiple times.
- `npm run seed` script added to `backend/package.json`.

## [1.6.0] 17-08-2026

### Added
- `crm_contacts` table (`backend/db/schema.sql`): stores simulated CRM contacts keyed by company name, with last synced invoice/consumption, anomaly status, and sync status/timestamp.
- `backend/services/crmService.js`: `syncInvoiceToCRM()` finds or creates a CRM contact by company name and updates it with the latest invoice/analysis data; `getAllContacts()` lists all contacts.
- `GET /api/crm/contacts` endpoint (`backend/routes/crm.js`): returns all CRM contacts.
- `POST /api/invoices/extract` now calls `syncInvoiceToCRM()` automatically after saving each invoice and includes the result as `crmSync` in the response.
- CRM view (`frontend/src/components/CrmView.jsx`), added to navigation as "CRM": table of all contacts with company, last consumption, anomaly status (colored dot), sync status, and last synced timestamp.
- Result view now shows a "✓ Synced with CRM" badge confirming the automatic sync.
- ADR 006 (`docs/decisions/006-simulated-crm-integration.md`): documents simulating a CRM integration (find-or-create, automatic sync, status tracking) instead of connecting to a real HubSpot/Salesforce sandbox, and what would change for production.

## [1.5.0] 15-08-2026

### Added
- Dashboard view (`frontend/src/components/DashboardView.jsx`): home page showing total invoices analyzed, total spend, average consumption, latest anomaly, and consumption/cost line charts over time (via `recharts`), all sourced from `GET /api/invoices`.
- `frontend/src/components/Header.jsx`: shared navigation header with `react-router-dom` `NavLink`s for Dashboard, Upload, and History.
- Client-side routing (`react-router-dom`) with `/dashboard`, `/upload`, `/history` routes; `/` redirects to `/dashboard`.
- Empty states (no invoices yet) and error states across Dashboard and History views.

### Changed
- Full visual redesign (`frontend/src/App.css`) applying the design system: dark navy (`#0F172A`) header, white cards with subtle shadows and rounded corners, blue (`#3B82F6`) primary accent, green (`#10B981`) for positive/clean indicators, red (`#EF4444`) for anomalies/warnings.
- History view: anomaly column now uses a colored dot indicator (red/green) instead of a text badge; rows alternate background color.
- Result view: invoice summary fields (company, period, consumption, total cost) promoted to metric cards; recommendation cards now use emoji icons instead of numbered badges; "Upload Another Invoice" renamed to "Analyze Another Invoice".
- Upload view copy updated to match spec: "Drop your energy invoice here" / "Supports PDF, JPG, PNG".

## [1.4.0] 15-08-2026

### Added
- `@fastify/static` plugin dependency in `backend/package.json`.
- Root `Dockerfile`: single multi-stage build that builds `frontend/dist` then copies it into the backend image; backend serves both the API and the static frontend from one Railway service.
- Root `railway.json`: single-service Railway build/deploy configuration.
- ADR 005 (`docs/decisions/005-single-service-static-frontend.md`): documents serving the frontend as static files from the Fastify backend instead of a separate nginx service.

### Changed
- `backend/server.js`: when `NODE_ENV=production`, registers `@fastify/static` to serve `frontend/dist` and falls back to `index.html` for unmatched non-API routes (client-side routing), while unmatched `/api/*` routes still return a JSON 404.

### Removed
- `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`, `backend/railway.json`, `frontend/railway.json` — replaced by the single root `Dockerfile`/`railway.json` per ADR 005. ADR 004 marked as superseded.

## [1.3.0] 15-08-2026

### Added
- `backend/Dockerfile` and `frontend/Dockerfile`: multi-stage Docker builds for Railway deployment. Backend runs on `node:20-alpine`; frontend builds with Vite then serves the static output via `nginx:alpine`.
- `frontend/nginx.conf`: proxies `/api/*` to the backend service over Railway's private network and falls back to `index.html` for client-side routing.
- `backend/railway.json` and `frontend/railway.json`: per-service Railway build/deploy configuration.
- ADR 004 (`docs/decisions/004-railway-deployment-with-docker.md`): documents the decision to deploy backend and frontend as separate Dockerized Railway services with an nginx reverse proxy.

### Changed
- `frontend/src/api.js`: `API_BASE_URL` changed from hardcoded `http://localhost:3000` to a relative empty string, so requests work through the nginx proxy in production without an environment-specific build.

## [1.2.0] 15-08-2026

### Added
- Frontend UI (`frontend/src/`): Upload view with drag-and-drop file input and simulated real-time workflow steps, Result view with invoice data, historical comparison, anomalies, AI analysis, and recommendation cards, and History view listing all analyzed invoices with click-to-expand detail.
- `frontend/src/api.js`: fetch-based client for `/api/invoices/extract` and `/api/invoices`.


## [1.1.0] 15-08-2026

### Added
- Analysis service (`backend/services/analysisService.js`): `analyzeInvoice()` queries the last 6 invoices from PostgreSQL, computes historical averages (consumption, cost per kWh, total cost) and percentage deviations, flags anomalies above a 20% threshold, and calls the Claude API to generate a natural-language analysis and 2-3 recommendations in Spanish. `saveInvoice()` persists the extracted data and analysis to the `invoices` table.
- `GET /api/invoices` endpoint: returns all invoices ordered by `created_at DESC`.
- ADR 003 (`docs/decisions/003-memory-through-postgresql.md`): documents the decision to use PostgreSQL as the agent's memory layer for historical comparison.

### Changed
- `POST /api/invoices/extract` now runs the full pipeline (extract → analyze → save) and returns the saved invoice plus comparison, anomalies, analysis, and recommendations, instead of extraction-only output.

## [1.0.0] 14-08-2026

### Added
- Claude extraction service (`backend/services/claudeService.js`): extracts structured invoice data (company, billing period, kWh consumption, total cost, cost per kWh, contract type) from a PDF using the Claude API's native document support and structured outputs.
- `POST /api/invoices/extract` endpoint (`backend/routes/invoices.js`): accepts a multipart PDF upload, runs extraction, and returns the parsed JSON. Extraction only — no database persistence yet.