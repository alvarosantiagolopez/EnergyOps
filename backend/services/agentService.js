// Internal prioritization agent: decides which clients need  team's attention
// first, based on combined signals (historical pattern, client value, anomaly type),
// rather than a single "if anomaly then alert" rule.
import Anthropic from '@anthropic-ai/sdk';
import pool from '../db/connection.js';
import { sendAnomalyAlert } from './emailService.js';

const MODEL = 'claude-sonnet-4-6';

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

const DECISION_SCHEMA = {
  type: 'object',
  properties: {
    priority: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
    reasoning: {
      type: 'string',
      description: 'Detailed explanation of WHY this priority, referencing the specific signals considered (historical pattern, client value, anomaly type). MUST be written in Spanish.',
    },
    likelyRootCause: {
      type: 'string',
      enum: ['billing_error', 'consumption_increase', 'seasonal_pattern', 'unclear'],
    },
    suggestedAction: {
      type: 'string',
      enum: ['flag_for_manual_review', 'send_email_alert', 'monitor_next_cycle', 'no_action_needed'],
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['priority', 'reasoning', 'likelyRootCause', 'suggestedAction', 'confidence'],
  additionalProperties: false,
};

function buildDecisionPrompt(invoiceData, analysisResult, historicalInvoices, crmContact) {
  const totalHistoricalSpend = historicalInvoices.reduce(
    (sum, inv) => sum + (Number(inv.total_cost) || 0),
    0
  );
  const anomalousInvoiceCount = historicalInvoices.filter((inv) => inv.anomalies).length;
  const anomalyFrequency = historicalInvoices.length > 0
    ? (anomalousInvoiceCount / historicalInvoices.length) * 100
    : 0;

  const consumptionHistory = historicalInvoices
    .map((inv) => `${inv.period}: ${Number(inv.consumption_kwh).toFixed(1)} kWh`)
    .join('; ') || 'no prior invoices';

  return `You are an internal prioritization agent. An account team cannot manually review every invoice that comes in — you decide which clients need their attention first, based on multiple combined signals, not a single threshold.

CURRENT INVOICE
- Client: ${invoiceData.clientName}
- Energy provider: ${invoiceData.companyName}
- Consumption: ${invoiceData.consumptionKwh} kWh
- Total cost: ${invoiceData.totalCost} ${invoiceData.currency}
- Billing period: ${invoiceData.billingPeriod?.start} to ${invoiceData.billingPeriod?.end}
- Anomaly detected: ${analysisResult.anomalies ?? 'none'}
- Consumption vs. historical average: ${analysisResult.comparison?.consumptionDiffPct != null ? analysisResult.comparison.consumptionDiffPct.toFixed(1) + '%' : 'N/A'}
- Cost vs. historical average: ${analysisResult.comparison?.costDiffPct != null ? analysisResult.comparison.costDiffPct.toFixed(1) + '%' : 'N/A'}

HISTORICAL PATTERN FOR THIS CLIENT
- Number of prior invoices on record: ${historicalInvoices.length}
- Consumption history (chronological): ${consumptionHistory}
- How many of those invoices were already flagged as anomalies: ${anomalousInvoiceCount} (${anomalyFrequency.toFixed(0)}% of their invoices)
- Has this happened before? ${anomalousInvoiceCount > 0 ? 'Yes, this client has a history of anomalies.' : 'No prior anomalies on record for this client.'}

CLIENT VALUE
- Total historical spend across all their invoices: ${totalHistoricalSpend.toFixed(2)} ${invoiceData.currency}
- Current CRM status: ${crmContact?.last_sync_status ?? 'unknown'} / anomaly_status: ${crmContact?.anomaly_status ?? 'unknown'}
- Higher total spend means higher business priority for our team if something is wrong — but it must be weighed against how severe and how novel this specific anomaly is.

ANOMALY TYPE REASONING
Reason about whether this is likely a BILLING ERROR (a sudden, isolated spike inconsistent with the client's usage pattern, out of step with their history) versus a genuine CONSUMPTION INCREASE (a gradual trend visible across several recent invoices) versus a SEASONAL_PATTERN (consistent with a recurring seasonal cycle you can infer from the consumption history) versus UNCLEAR (not enough history to tell).

THE HARD PART: WEIGH CONFLICTING SIGNALS
Do not just detect a threshold and stop. Explicitly weigh signals that can point in different directions. For example: a small client with a huge anomaly (large % deviation, low total spend) versus a large client with a moderate anomaly (small % deviation, high total spend) — which one actually needs the account team's attention first? Consider: severity of deviation, whether it has happened before for this client (recurring problems may indicate a persistent billing issue worth escalating, or may indicate the client's usage is simply volatile and not worth re-flagging every time), and total business value at stake if the relationship sours or the client churns.

Pay close attention to whether the historical pattern actually supports a seasonal explanation. If the client has a prior invoice from the same month in an earlier year (or an equivalent season) and that prior reading does NOT show the same spike, seasonality is ruled out as the cause — do not use "winter" or "season" as a hand-wave if the client's own history contradicts it. A flat, tight historical baseline (very low variance across many invoices) combined with a single extreme, isolated spike is the clearest possible signature of a billing error, not normal volatility.

When you conclude the root cause is very likely a billing error — high confidence, tight/stable baseline, no plausible seasonal or trend explanation in the data — that is precisely the situation where waiting for a human to notice a manual-review flag is the wrong call: the client is likely being overcharged right now. In that case, suggestedAction should be send_email_alert so the client is notified immediately, not flag_for_manual_review (which just queues it silently). Reserve flag_for_manual_review for cases where the interpretation is genuinely ambiguous (e.g. thin history, plausible seasonal or trend explanation, or low confidence).

Decide:
1. priority: high | medium | low | none — how urgently should our team look at this?
2. reasoning: explain WHY, explicitly referencing the historical pattern, the client value, and the anomaly type signals above — not just "there was an anomaly." **Write this field in Spanish, in a clear and professional tone — this is the only field read by non-technical stakeholders.**
3. likelyRootCause: billing_error | consumption_increase | seasonal_pattern | unclear
4. suggestedAction: flag_for_manual_review | send_email_alert | monitor_next_cycle | no_action_needed
5. confidence: high | medium | low — how confident are you in this assessment given the available data?`;
}

/**
 * Reasons over an invoice's combined signals (historical anomaly pattern, client
 * lifetime value, and inferred anomaly type) to decide whether and how our
 * internal team should be alerted, then executes the resulting action.
 * @param {object} invoiceData - Structured invoice data from claudeService.extractInvoiceData()
 * @param {object} analysisResult - Result of analysisService.analyzeInvoice()
 * @param {object[]} historicalInvoices - Prior invoice rows for this company (from the invoices table)
 * @param {object|null} crmContact - The crm_contacts row for this company, if any
 * @returns {Promise<object>} The full decision object plus the action actually executed.
 */
export async function prioritizeAndAct(invoiceData, analysisResult, historicalInvoices, crmContact) {
  const prompt = buildDecisionPrompt(invoiceData, analysisResult, historicalInvoices, crmContact);

  let response;
  try {
    const claudeClient = getClient();
    response = await claudeClient.messages.create({
      model: MODEL,
      max_tokens: 2048,
      output_config: {
        format: {
          type: 'json_schema',
          schema: DECISION_SCHEMA,
        },
      },
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      throw new Error(`Claude API error (${err.status}): ${err.message}`);
    }
    throw new Error(`Claude API request failed: ${err.message}`);
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to generate the prioritization decision');
  }

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock) {
    throw new Error('Claude response did not contain the expected decision');
  }

  let decision;
  try {
    decision = JSON.parse(textBlock.text);
  } catch {
    throw new Error('Failed to parse agent decision as JSON');
  }

  let actionTaken = 'none';

  switch (decision.suggestedAction) {
    case 'flag_for_manual_review': {
      if (crmContact) {
        await pool.query(
          `UPDATE crm_contacts SET last_sync_status = 'needs_review' WHERE id = $1`,
          [crmContact.id]
        );
        actionTaken = 'flagged_for_manual_review';
      } else {
        console.warn('[agentService] Cannot flag for manual review: no CRM contact for this client');
        actionTaken = 'skipped_no_crm_contact';
      }
      break;
    }
    case 'send_email_alert': {
      const emailResult = await sendAnomalyAlert(invoiceData, analysisResult);
      actionTaken = emailResult.sent ? 'email_alert_sent' : `email_alert_failed: ${emailResult.reason}`;
      break;
    }
    case 'monitor_next_cycle':
    case 'no_action_needed':
    default: {
      console.log(`[agentService] No external action for ${invoiceData.clientName}: ${decision.suggestedAction}. Reasoning: ${decision.reasoning}`);
      actionTaken = 'logged_only';
      break;
    }
  }

  return {
    ...decision,
    actionTaken,
  };
}
