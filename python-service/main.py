"""FastAPI microservice for statistical analysis of energy consumption trends."""

from fastapi import FastAPI
from pydantic import BaseModel

from analyzer import calculate_trends

app = FastAPI(title="EnergyOps Statistics Service")


class Invoice(BaseModel):
    model_config = {"extra": "allow"}


class TrendsRequest(BaseModel):
    invoices: list[Invoice]


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/analyze-trends")
async def analyze_trends(request: TrendsRequest):
    invoices = [invoice.model_dump() for invoice in request.invoices]
    return calculate_trends(invoices)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
