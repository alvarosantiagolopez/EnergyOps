import Anthropic from '@anthropic-ai/sdk';
import pool from '../db/connection.js';

const MODEL = 'claude-sonnet-4-6';
const ANOMALY_THRESHOLD_PCT = 20;
const HISTORY_LIMIT = 6;
const STATS_SERVICE_URL = process.env.STATS_SERVICE_URL || 'http://localhost:8000';

let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    analysis: { type: 'string', description: 'Natural language analysis in Spanish summarizing the invoice and its comparison against historical consumption/cost' },
    recommendations: {
      type: 'array',
      description: 'Exactly 2 or 3 specific, actionable recommendations in Spanish',
      items: { type: 'string' },
    },
  },
  required: ['analysis', 'recommendations'],
  additionalProperties: false,
};

function average(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function percentDiff(current, avg) {
  if (avg === null || avg === 0) return null;
  return ((current - avg) / avg) * 100;
}

/**
 * Compares the current invoice against the last HISTORY_LIMIT invoices for the same
 * client (the business company manages energy for, not the invoice-issuing provider —
 * see docs/decisions/012-client-vs-provider-data-model.md) and asks Claude to produce
 * a natural-language analysis in Spanish.
 * @param {object} extractedData - Structured invoice data from claudeService.extractInvoiceData()
 * @param {string} clientName - The client this invoice belongs to, used to scope historical comparison
 * @returns {Promise<{comparison: object, anomalies: string|null, analysis: string, recommendations: string[]}>}
 */
export async function analyzeInvoice(extractedData, clientName) {
  const { rows: history } = await pool.query(
    'SELECT consumption_kwh, cost_per_kwh, total_cost FROM invoices WHERE client_name = $1 ORDER BY created_at DESC LIMIT $2',
    [clientName, HISTORY_LIMIT]
  );

  const avgConsumption = average(history.map((r) => Number(r.consumption_kwh)).filter((v) => !Number.isNaN(v)));
  const avgCostPerKwh = average(history.map((r) => Number(r.cost_per_kwh)).filter((v) => !Number.isNaN(v)));
  const avgTotalCost = average(history.map((r) => Number(r.total_cost)).filter((v) => !Number.isNaN(v)));

  const consumptionDiffPct = percentDiff(extractedData.consumptionKwh, avgConsumption);
  const costDiffPct = percentDiff(extractedData.totalCost, avgTotalCost);
  const costPerKwhDiffPct = percentDiff(extractedData.costPerKwh, avgCostPerKwh);

  const comparison = {
    avgConsumption,
    avgCostPerKwh,
    avgTotalCost,
    consumptionDiffPct,
    costDiffPct,
  };

  const anomalyReasons = [];
  if (consumptionDiffPct !== null && consumptionDiffPct > ANOMALY_THRESHOLD_PCT) {
    anomalyReasons.push(
      `El consumo actual (${extractedData.consumptionKwh} kWh) es un ${consumptionDiffPct.toFixed(1)}% superior a la media de las últimas ${history.length} facturas (${avgConsumption.toFixed(1)} kWh).`
    );
  }
  if (costDiffPct !== null && costDiffPct > ANOMALY_THRESHOLD_PCT) {
    anomalyReasons.push(
      `El coste total actual (${extractedData.totalCost} ${extractedData.currency}) es un ${costDiffPct.toFixed(1)}% superior a la media de las últimas ${history.length} facturas (${avgTotalCost.toFixed(2)} ${extractedData.currency}).`
    );
  }
  if (costPerKwhDiffPct !== null && costPerKwhDiffPct > ANOMALY_THRESHOLD_PCT) {
    anomalyReasons.push(
      `El coste por kWh actual (${extractedData.costPerKwh}) es un ${costPerKwhDiffPct.toFixed(1)}% superior a la media histórica (${avgCostPerKwh.toFixed(4)}).`
    );
  }
  const anomalies = anomalyReasons.length > 0 ? anomalyReasons.join(' ') : null;

  const analysisPrompt = `Eres un asistente que analiza facturas de energía para ayudar a un usuario a entender su consumo y gasto.

Factura actual:
${JSON.stringify(extractedData, null, 2)}

Comparación con las últimas ${history.length} facturas registradas:
- Consumo medio: ${avgConsumption !== null ? avgConsumption.toFixed(1) + ' kWh' : 'sin datos históricos'}
- Coste medio por kWh: ${avgCostPerKwh !== null ? avgCostPerKwh.toFixed(4) : 'sin datos históricos'}
- Coste medio total: ${avgTotalCost !== null ? avgTotalCost.toFixed(2) : 'sin datos históricos'}
- Diferencia de consumo vs. media: ${consumptionDiffPct !== null ? consumptionDiffPct.toFixed(1) + '%' : 'N/A'}
- Diferencia de coste total vs. media: ${costDiffPct !== null ? costDiffPct.toFixed(1) + '%' : 'N/A'}

Anomalías detectadas (umbral ${ANOMALY_THRESHOLD_PCT}%): ${anomalies ?? 'ninguna'}

**IMPORTANTE: Responde SIEMPRE en español, sin excepciones. Todos los campos deben estar en español.**

Genera un análisis en español, en un tono claro y cercano, resumiendo la situación de esta factura frente al histórico. Si no hay datos históricos suficientes, indícalo. Luego proporciona entre 2 y 3 recomendaciones concretas y accionables para reducir el consumo o el coste.`;

  let response;
  try {
    const claudeClient = getClient();
    response = await claudeClient.messages.create({
      model: MODEL,
      max_tokens: 2048,
      output_config: {
        format: {
          type: 'json_schema',
          schema: ANALYSIS_SCHEMA,
        },
      },
      messages: [{ role: 'user', content: analysisPrompt }],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      throw new Error(`Claude API error (${err.status}): ${err.message}`);
    }
    throw new Error(`Claude API request failed: ${err.message}`);
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to generate the invoice analysis');
  }

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock) {
    throw new Error('Claude response did not contain the expected analysis');
  }

  let result;
  try {
    result = JSON.parse(textBlock.text);
  } catch {
    throw new Error('Failed to parse invoice analysis as JSON');
  }

  return {
    comparison,
    anomalies,
    analysis: result.analysis,
    recommendations: result.recommendations,
  };
}

/**
 * Persists the extracted invoice data and its analysis to PostgreSQL.
 * @param {object} extractedData - Structured invoice data from claudeService.extractInvoiceData()
 * @param {object} analysisResult - Result of analyzeInvoice()
 * @param {string} clientName - The client (business company manages energy for) this invoice belongs to
 * @returns {Promise<object>} The saved invoice row, including its id.
 */
export async function saveInvoice(extractedData, analysisResult, clientName) {
  const period = `${extractedData.billingPeriod?.start ?? ''} - ${extractedData.billingPeriod?.end ?? ''}`;

  const { rows } = await pool.query(
    `INSERT INTO invoices
      (filename, period, company, client_name, consumption_kwh, total_cost, cost_per_kwh, contract_type, anomalies, ai_analysis, recommendations, raw_extracted_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      extractedData.filename ?? null,
      period,
      extractedData.companyName,
      clientName,
      extractedData.consumptionKwh,
      extractedData.totalCost,
      extractedData.costPerKwh,
      extractedData.contractType,
      analysisResult.anomalies,
      analysisResult.analysis,
      JSON.stringify(analysisResult.recommendations),
      extractedData,
    ]
  );

  return rows[0];
}

/**
 * @returns {Promise<string[]>} Distinct client names already used across invoices,
 * so the upload form can suggest existing clients instead of requiring free text every time.
 */
export async function fetchDistinctClientNames() {
  const { rows } = await pool.query(
    'SELECT DISTINCT client_name FROM invoices WHERE client_name IS NOT NULL ORDER BY client_name ASC'
  );
  return rows.map((r) => r.client_name);
}

/**
 * Calls the Python statistics microservice to compute consumption/cost trends
 * across historical invoices, optionally scoped to a single client. Fails
 * gracefully: if the service is unreachable or errors, logs a warning and
 * returns null so the caller can continue without trend data.
 * @param {string} [clientName] - If provided, scopes trends to this client only
 * @returns {Promise<object|null>}
 */
export async function fetchTrends(clientName) {
  try {
    const { rows } = clientName
      ? await pool.query(
        'SELECT period, consumption_kwh, total_cost FROM invoices WHERE client_name = $1 ORDER BY created_at ASC',
        [clientName]
      )
      : await pool.query(
        'SELECT period, consumption_kwh, total_cost FROM invoices ORDER BY created_at ASC'
      );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${STATS_SERVICE_URL}/analyze-trends`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoices: rows.map((r) => ({
          period: r.period,
          consumption_kwh: Number(r.consumption_kwh),
          total_cost: Number(r.total_cost),
        })),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Statistics service responded with ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.warn(`Statistics service unavailable, continuing without trends: ${err.message}`);
    return null;
  }
}
