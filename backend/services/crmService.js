import pool from '../db/connection.js';

/**
 * Simulates a CRM sync (in place of a real HubSpot/Salesforce API call — see
 * docs/decisions/006-simulated-crm-integration.md). Finds the contact by
 * client name (the business company manages energy for) or creates one, then
 * updates it with the latest invoice data. The energy provider (Endesa,
 * Iberdrola, etc.) is stored as metadata on the contact, not as the key —
 * see docs/decisions/012-client-vs-provider-data-model.md.
 * @param {object} extractedData - Structured invoice data from claudeService.extractInvoiceData()
 * @param {object} analysisResult - Result of analysisService.analyzeInvoice()
 * @param {number} invoiceId - id of the invoice row just saved
 * @returns {Promise<object>} The synced crm_contacts row.
 */
export async function syncInvoiceToCRM(extractedData, analysisResult, invoiceId) {
  const clientName = extractedData.clientName || 'Unknown';
  const provider = extractedData.companyName || null;
  const anomalyStatus = analysisResult.anomalies ? 'alert' : 'normal';

  try {
    const { rows: existing } = await pool.query(
      'SELECT * FROM crm_contacts WHERE company_name = $1',
      [clientName]
    );

    if (existing.length > 0) {
      const { rows } = await pool.query(
        `UPDATE crm_contacts
           SET provider = $1,
               last_invoice_id = $2,
               last_consumption_kwh = $3,
               anomaly_status = $4,
               last_sync_status = 'synced',
               last_synced_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [provider, invoiceId, extractedData.consumptionKwh, anomalyStatus, existing[0].id]
      );
      return rows[0];
    } else {
      const { rows } = await pool.query(
        `INSERT INTO crm_contacts
           (company_name, provider, last_invoice_id, last_consumption_kwh, anomaly_status, last_sync_status, last_synced_at)
         VALUES ($1, $2, $3, $4, $5, 'synced', NOW())
         RETURNING *`,
        [clientName, provider, invoiceId, extractedData.consumptionKwh, anomalyStatus]
      );
      return rows[0];
    }
  } catch (err) {
    throw new Error(`CRM sync failed for client "${clientName}": ${err.message}`);
  }
}

/**
 * @returns {Promise<object[]>} All CRM contacts with their sync status, newest sync first.
 */
export async function getAllContacts() {
  const { rows } = await pool.query('SELECT * FROM crm_contacts ORDER BY last_synced_at DESC NULLS LAST');
  return rows.map(row => ({
    ...row,
    last_consumption_kwh: row.last_consumption_kwh ? parseFloat(row.last_consumption_kwh) : null,
    last_synced_at: row.last_synced_at ? row.last_synced_at.toISOString() : null,
    created_at: row.created_at ? row.created_at.toISOString() : null,
  }));
}

/**
 * Persists the internal prioritization agent's latest decision for a contact,
 * so the Priority Queue view can list/sort/filter without recomputing it.
 * @param {number} contactId
 * @param {object} decision - { priority, reasoning, likelyRootCause, actionTaken }
 */
export async function saveAgentDecision(contactId, decision) {
  await pool.query(
    `UPDATE crm_contacts
       SET agent_priority = $1,
           agent_reasoning = $2,
           agent_root_cause = $3,
           agent_action_taken = $4
     WHERE id = $5`,
    [decision.priority, decision.reasoning, decision.likelyRootCause, decision.actionTaken, contactId]
  );
}
