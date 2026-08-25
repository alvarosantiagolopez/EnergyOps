import { extractInvoiceData } from '../services/claudeService.js';
import { analyzeInvoice, saveInvoice, fetchTrends, fetchDistinctClientNames } from '../services/analysisService.js';
import { syncInvoiceToCRM, saveAgentDecision } from '../services/crmService.js';
import { prioritizeAndAct } from '../services/agentService.js';
import pool from '../db/connection.js';

export default async function invoicesRoutes(fastify) {
  fastify.post('/api/invoices/extract', async (request, reply) => {
    const file = await request.file();
    const clientName = file?.fields?.clientName?.value;

    if (!file) {
      return reply.code(400).send({ error: 'No file was uploaded' });
    }

    if (!clientName || !clientName.trim()) {
      return reply.code(400).send({ error: 'clientName is required' });
    }

    const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return reply.code(400).send({ error: 'Uploaded file must be a PDF, JPEG, or PNG image' });
    }

    const buffer = await file.toBuffer();
    const fileBase64 = buffer.toString('base64').replace(/\n/g, '');

    try {
      const extractedData = await extractInvoiceData(fileBase64, file.mimetype);
      extractedData.filename = file.filename;
      extractedData.clientName = clientName.trim();

      const analysisResult = await analyzeInvoice(extractedData, extractedData.clientName);
      const savedInvoice = await saveInvoice(extractedData, analysisResult, extractedData.clientName);
      const crmSync = await syncInvoiceToCRM(extractedData, analysisResult, savedInvoice.id);
      const trends = await fetchTrends();

      const { rows: historicalInvoices } = await pool.query(
        'SELECT * FROM invoices WHERE client_name = $1 AND id != $2 ORDER BY created_at DESC',
        [extractedData.clientName, savedInvoice.id]
      );

      let agentDecision;
      try {
        agentDecision = await prioritizeAndAct(extractedData, analysisResult, historicalInvoices, crmSync);
      } catch (err) {
        fastify.log.warn(`Agent prioritization failed: ${err.message}`);
        agentDecision = {
          priority: 'none',
          reasoning: `Agent decision could not be generated: ${err.message}`,
          likelyRootCause: 'unclear',
          suggestedAction: 'no_action_needed',
          confidence: 'low',
          actionTaken: 'error',
        };
      }

      if (agentDecision.actionTaken === 'flagged_for_manual_review' && crmSync) {
        crmSync.last_sync_status = 'needs_review';
      }

      if (crmSync) {
        try {
          await saveAgentDecision(crmSync.id, agentDecision);
        } catch (err) {
          fastify.log.warn(`Failed to persist agent decision to CRM contact: ${err.message}`);
        }
      }

      return reply.send({
        invoice: savedInvoice,
        extracted: extractedData,
        comparison: analysisResult.comparison,
        anomalies: analysisResult.anomalies,
        analysis: analysisResult.analysis,
        recommendations: analysisResult.recommendations,
        trends,
        agentDecision,
        crmSync: crmSync ? {
          id: crmSync.id,
          company_name: crmSync.company_name,
          provider: crmSync.provider,
          contact_email: crmSync.contact_email,
          last_invoice_id: crmSync.last_invoice_id,
          last_consumption_kwh: crmSync.last_consumption_kwh ? parseFloat(crmSync.last_consumption_kwh) : null,
          last_sync_status: crmSync.last_sync_status,
          anomaly_status: crmSync.anomaly_status,
          last_synced_at: crmSync.last_synced_at ? crmSync.last_synced_at.toISOString() : null,
          created_at: crmSync.created_at ? crmSync.created_at.toISOString() : null,
        } : null,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(502).send({ error: err.message || 'Failed to extract invoice data' });
    }
  });

  fastify.get('/api/invoices', async (request, reply) => {
    try {
      const { client_name: clientName } = request.query;
      const { rows } = clientName
        ? await pool.query(
            'SELECT * FROM invoices WHERE client_name = $1 ORDER BY created_at DESC',
            [clientName]
          )
        : await pool.query('SELECT * FROM invoices ORDER BY created_at DESC');
      return reply.send(rows);
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch invoices' });
    }
  });

  fastify.get('/api/invoices/trends', async (request, reply) => {
    const { client_name: clientName } = request.query;
    const trends = await fetchTrends(clientName);
    return reply.send(trends);
  });

  fastify.get('/api/invoices/client-names', async (request, reply) => {
    try {
      const clientNames = await fetchDistinctClientNames();
      return reply.send(clientNames);
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch client names' });
    }
  });

  fastify.get('/api/invoices/clients', async (request, reply) => {
    try {
      const { rows } = await pool.query(
        `SELECT client_name, MAX(created_at) AS last_invoice_at
         FROM invoices
         WHERE client_name IS NOT NULL
         GROUP BY client_name
         ORDER BY last_invoice_at DESC`
      );
      return reply.send(rows.map((r) => ({
        clientName: r.client_name,
        lastInvoiceAt: r.last_invoice_at ? r.last_invoice_at.toISOString() : null,
      })));
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch clients' });
    }
  });
}
