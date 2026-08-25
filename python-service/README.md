# EnergyOps Statistics Service

A small FastAPI microservice that computes statistical trends (linear regression, seasonality, savings potential) over a user's historical energy invoices. Used by the Node.js backend as an optional enrichment step — see [docs/decisions/007-python-microservice-for-statistics.md](../docs/decisions/007-python-microservice-for-statistics.md).

## Run locally

```bash
cd python-service
python -m venv venv
venv\Scripts\activate        # or `source venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
python main.py
```

The service listens on `http://localhost:8000`.

## Endpoints

### `GET /health`
Returns `{"status": "ok"}`.

### `POST /analyze-trends`
Request body:

```json
{
  "invoices": [
    { "period": "2026-01-01 - 2026-01-31", "consumption_kwh": 120, "total_cost": 32.5 },
    { "period": "2026-02-01 - 2026-02-28", "consumption_kwh": 135, "total_cost": 36.1 }
  ]
}
```

Response body:

```json
{
  "monthly_avg_consumption": 127.5,
  "monthly_avg_cost": 34.3,
  "trend_direction": "increasing",
  "trend_percentage": 12.5,
  "seasonality_detected": false,
  "peak_month": "February",
  "savings_potential_eur": 4.05,
  "insufficient_data": false
}
```

Fields accept either snake_case (`consumption_kwh`, `total_cost`) or camelCase (`consumptionKwh`, `totalCost`) invoice keys, matching both the raw DB rows and the Claude-extracted invoice shape used elsewhere in EnergyOps.

Requires at least 2 invoices with a usable consumption value and period/date; otherwise responds with `insufficient_data: true` and null trend fields.
