import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pool from './connection.js';
import { syncInvoiceToCRM, saveAgentDecision } from '../services/crmService.js';
import { prioritizeAndAct } from '../services/agentService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const SEED_DATA = [
  {
    filename: 'endesa_ene2025.pdf',
    period: '2025-01-01 - 2025-01-31',
    company: 'Endesa Energía, S.A. Unipersonal',
    client_name: 'Mercadona - Gran Vía 12',
    consumption_kwh: 34.6,
    total_cost: 26.85,
    cost_per_kwh: 0.776,
    contract_type: 'Residential',
    ai_analysis: 'Consumo bajo típico de enero para este cliente, sin incremento por frío invernal.',
    recommendations: JSON.stringify(['Mantén los hábitos actuales']),
    raw_extracted_data: {
      companyName: 'Endesa Energía, S.A. Unipersonal',
      clientName: 'Mercadona - Gran Vía 12',
      billingPeriod: { start: '2025-01-01', end: '2025-01-31' },
      consumptionKwh: 34.6,
      totalCost: 26.85,
      costPerKwh: 0.776,
      currency: 'EUR',
      contractType: 'Residential',
      invoiceNumber: 'END-2025-000111',
      dueDate: '2025-02-10',
    },
  },
  {
    filename: 'endesa_ago2025.pdf',
    period: '2025-08-01 - 2025-08-31',
    company: 'Endesa Energía, S.A. Unipersonal',
    client_name: 'Mercadona - Gran Vía 12',
    consumption_kwh: 33.2,
    total_cost: 25.76,
    cost_per_kwh: 0.776,
    contract_type: 'Residential',
    ai_analysis: 'Consumo bajo para verano. Patrón normal de eficiencia.',
    recommendations: JSON.stringify(['Mantén los hábitos actuales']),
    raw_extracted_data: {
      companyName: 'Endesa Energía, S.A. Unipersonal',
      clientName: 'Mercadona - Gran Vía 12',
      billingPeriod: { start: '2025-08-01', end: '2025-08-31' },
      consumptionKwh: 33.2,
      totalCost: 25.76,
      costPerKwh: 0.776,
      currency: 'EUR',
      contractType: 'Residential',
      invoiceNumber: 'END-2025-008888',
      dueDate: '2025-09-10',
    },
  },
  {
    filename: 'endesa_sep2025.pdf',
    period: '2025-09-01 - 2025-09-30',
    company: 'Endesa Energía, S.A. Unipersonal',
    client_name: 'Mercadona - Gran Vía 12',
    consumption_kwh: 35.8,
    total_cost: 27.81,
    cost_per_kwh: 0.776,
    contract_type: 'Residential',
    ai_analysis: 'Consumo bajo en transición a otoño.',
    recommendations: JSON.stringify(['Patrón normal']),
    raw_extracted_data: {
      companyName: 'Endesa Energía, S.A. Unipersonal',
      clientName: 'Mercadona - Gran Vía 12',
      billingPeriod: { start: '2025-09-01', end: '2025-09-30' },
      consumptionKwh: 35.8,
      totalCost: 27.81,
      costPerKwh: 0.776,
      currency: 'EUR',
      contractType: 'Residential',
      invoiceNumber: 'END-2025-009999',
      dueDate: '2025-10-10',
    },
  },
  {
    filename: 'endesa_oct2025.pdf',
    period: '2025-10-01 - 2025-10-31',
    company: 'Endesa Energía, S.A. Unipersonal',
    client_name: 'Mercadona - Gran Vía 12',
    consumption_kwh: 36.5,
    total_cost: 28.33,
    cost_per_kwh: 0.776,
    contract_type: 'Residential',
    ai_analysis: 'Consumo moderado bajo para octubre.',
    recommendations: JSON.stringify(['Mantén monitoreo regular']),
    raw_extracted_data: {
      companyName: 'Endesa Energía, S.A. Unipersonal',
      clientName: 'Mercadona - Gran Vía 12',
      billingPeriod: { start: '2025-10-01', end: '2025-10-31' },
      consumptionKwh: 36.5,
      totalCost: 28.33,
      costPerKwh: 0.776,
      currency: 'EUR',
      contractType: 'Residential',
      invoiceNumber: 'END-2025-010000',
      dueDate: '2025-11-10',
    },
  },
  {
    filename: 'endesa_nov2025.pdf',
    period: '2025-11-01 - 2025-11-30',
    company: 'Endesa Energía, S.A. Unipersonal',
    client_name: 'Mercadona - Gran Vía 12',
    consumption_kwh: 34.1,
    total_cost: 26.46,
    cost_per_kwh: 0.776,
    contract_type: 'Residential',
    ai_analysis: 'Consumo bajo para noviembre.',
    recommendations: JSON.stringify(['Continúa monitoreando']),
    raw_extracted_data: {
      companyName: 'Endesa Energía, S.A. Unipersonal',
      clientName: 'Mercadona - Gran Vía 12',
      billingPeriod: { start: '2025-11-01', end: '2025-11-30' },
      consumptionKwh: 34.1,
      totalCost: 26.46,
      costPerKwh: 0.776,
      currency: 'EUR',
      contractType: 'Residential',
      invoiceNumber: 'END-2025-011111',
      dueDate: '2025-12-10',
    },
  },
  {
    filename: 'endesa_dic2025.pdf',
    period: '2025-12-01 - 2025-12-31',
    company: 'Endesa Energía, S.A. Unipersonal',
    client_name: 'Mercadona - Gran Vía 12',
    consumption_kwh: 35.9,
    total_cost: 27.87,
    cost_per_kwh: 0.776,
    contract_type: 'Residential',
    ai_analysis: 'Consumo bajo en diciembre.',
    recommendations: JSON.stringify(['Patrón normal']),
    raw_extracted_data: {
      companyName: 'Endesa Energía, S.A. Unipersonal',
      clientName: 'Mercadona - Gran Vía 12',
      billingPeriod: { start: '2025-12-01', end: '2025-12-31' },
      consumptionKwh: 35.9,
      totalCost: 27.87,
      costPerKwh: 0.776,
      currency: 'EUR',
      contractType: 'Residential',
      invoiceNumber: 'END-2025-012222',
      dueDate: '2026-01-10',
    },
  },
  {
    filename: 'iberdrola_feb2025.pdf',
    period: '2025-02-01 - 2025-02-28',
    company: 'Iberdrola Clientes S.A.',
    client_name: 'Grupo Inmobiliario Aurora',
    consumption_kwh: 124.5,
    total_cost: 89.67,
    cost_per_kwh: 0.72,
    contract_type: 'Small Business',
    anomalies: '⚠ Anomalía detectada: El consumo actual (124.5 kWh) es un 89.2% superior a la media histórica (65.8 kWh). El coste total actual (89.67 EUR) es un 78.4% superior a la media (50.32 EUR).',
    comparison: { consumptionDiffPct: 89.2, costDiffPct: 78.4 },
    ai_analysis: 'Se ha detectado una anomalía significativa en el consumo de este período. El consumo es casi un 90% superior a lo esperado, lo que sugiere un problema operacional o un cambio importante en el uso de la instalación. Se recomienda investigar inmediatamente la causa de este incremento anómalo.',
    recommendations: JSON.stringify([
      'Revisa el funcionamiento de todos los equipos de climatización',
      'Busca fugas de aire comprimido o refrigeración',
      'Revisa si hay equipos nuevos o consumidores adicionales funcionando'
    ]),
    raw_extracted_data: {
      companyName: 'Iberdrola Clientes S.A.',
      clientName: 'Grupo Inmobiliario Aurora',
      billingPeriod: { start: '2025-02-01', end: '2025-02-28' },
      consumptionKwh: 124.5,
      totalCost: 89.67,
      costPerKwh: 0.72,
      currency: 'EUR',
      contractType: 'Small Business',
      invoiceNumber: 'IBD-2025-005678',
      dueDate: '2025-03-15',
    },
  },
  {
    filename: 'iberdrola_apr2025.pdf',
    period: '2025-04-01 - 2025-04-30',
    company: 'Iberdrola Clientes S.A.',
    client_name: 'Grupo Inmobiliario Aurora',
    consumption_kwh: 68.2,
    total_cost: 49.1,
    cost_per_kwh: 0.72,
    contract_type: 'Small Business',
    ai_analysis: 'El consumo ha normalizado considerablemente respecto al mes anterior, volviendo a niveles esperados. Esto sugiere que la anomalía de febrero fue puntual y ha sido resuelta. El coste se mantiene en línea con los patrones históricos. Continúa monitoreando para asegurar estabilidad.',
    recommendations: JSON.stringify([
      'Mantén el seguimiento regular del consumo para detectar cambios rápidamente',
      'Implementa un sistema de monitorización energética en tiempo real',
      'Revisa la tarifa contratada para optimizar el coste'
    ]),
    raw_extracted_data: {
      companyName: 'Iberdrola Clientes S.A.',
      clientName: 'Grupo Inmobiliario Aurora',
      billingPeriod: { start: '2025-04-01', end: '2025-04-30' },
      consumptionKwh: 68.2,
      totalCost: 49.1,
      costPerKwh: 0.72,
      currency: 'EUR',
      contractType: 'Small Business',
      invoiceNumber: 'IBD-2025-005679',
      dueDate: '2025-05-15',
    },
  },
  {
    filename: 'naturgy_mar2025.pdf',
    period: '2025-03-01 - 2025-03-31',
    company: 'Naturgy Iberia S.A.',
    client_name: 'Hostelería Sur S.L.',
    consumption_kwh: 45.2,
    total_cost: 35.64,
    cost_per_kwh: 0.788,
    contract_type: 'Residential',
    ai_analysis: 'Consumo bajo y eficiente. Esta instalación mantiene un perfil de consumo muy optimizado, con tasas por debajo de la media del sector. El coste por kWh es ligeramente superior, posiblemente debido a las características del contrato. Se recomienda mantener estas prácticas.',
    recommendations: JSON.stringify([
      'Mantén los hábitos actuales que evidentemente son muy eficientes',
      'Considera revisar si existe una tarifa más competitiva disponible',
      'Continúa monitoreando el consumo regularmente'
    ]),
    raw_extracted_data: {
      companyName: 'Naturgy Iberia S.A.',
      clientName: 'Hostelería Sur S.L.',
      billingPeriod: { start: '2025-03-01', end: '2025-03-31' },
      consumptionKwh: 45.2,
      totalCost: 35.64,
      costPerKwh: 0.788,
      currency: 'EUR',
      contractType: 'Residential',
      invoiceNumber: 'NAT-2025-009876',
      dueDate: '2025-04-10',
    },
  },
];

async function seedDatabase() {
  try {
    console.log('🧹 Truncating invoices and crm_contacts...');
    await pool.query('TRUNCATE TABLE invoices, crm_contacts RESTART IDENTITY CASCADE');
    console.log('✓ Tables cleared\n');

    console.log('📥 Seeding database with realistic demo data...\n');

    // Insert invoices
    for (const invoiceData of SEED_DATA) {
      const { rows } = await pool.query(
        `INSERT INTO invoices
          (filename, period, company, client_name, consumption_kwh, total_cost, cost_per_kwh, contract_type, anomalies, ai_analysis, recommendations, raw_extracted_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id, company, client_name, period`,
        [
          invoiceData.filename,
          invoiceData.period,
          invoiceData.company,
          invoiceData.client_name,
          invoiceData.consumption_kwh,
          invoiceData.total_cost,
          invoiceData.cost_per_kwh,
          invoiceData.contract_type,
          invoiceData.anomalies || null,
          invoiceData.ai_analysis,
          invoiceData.recommendations,
          JSON.stringify(invoiceData.raw_extracted_data),
        ]
      );

      const invoice = rows[0];
      console.log(`✓ Inserted invoice: ${invoice.client_name} via ${invoice.company} (${invoice.period})`);

      // Sync to CRM after each invoice insert
      // Create a minimal extractedData and analysisResult for CRM sync
      const extractedData = invoiceData.raw_extracted_data;
      const analysisResult = {
        anomalies: invoiceData.anomalies || null,
        comparison: invoiceData.comparison || null,
      };

      let crmContact = null;
      try {
        crmContact = await syncInvoiceToCRM(extractedData, analysisResult, invoice.id);
        console.log(`  → Synced to CRM contact`);
      } catch (crmErr) {
        console.warn(`  ⚠ CRM sync failed (non-fatal): ${crmErr.message}`);
      }

      // Run the same internal prioritization agent the real upload flow uses,
      // so seeded demo data shows realistic reasoning instead of blank fields.
      // Historical comparison is scoped by client_name, not by provider (company) —
      // see docs/decisions/012-client-vs-provider-data-model.md.
      const { rows: historicalInvoices } = await pool.query(
        'SELECT * FROM invoices WHERE client_name = $1 AND id != $2 ORDER BY created_at DESC',
        [invoice.client_name, invoice.id]
      );

      try {
        const decision = await prioritizeAndAct(extractedData, analysisResult, historicalInvoices, crmContact);
        console.log(`  → Agent decision: priority=${decision.priority}, rootCause=${decision.likelyRootCause}, action=${decision.actionTaken}`);
        console.log(`     Reasoning: ${decision.reasoning}`);

        if (crmContact) {
          if (decision.actionTaken === 'flagged_for_manual_review') {
            crmContact.last_sync_status = 'needs_review';
          }
          await saveAgentDecision(crmContact.id, decision);
        }
      } catch (agentErr) {
        console.warn(`  ⚠ Agent prioritization failed (non-fatal): ${agentErr.message}`);
      }
    }

    console.log(`\n✅ Seeded ${SEED_DATA.length} invoices and synced to CRM`);
    console.log('\nDatabase is now ready for HIGH PRIORITY anomaly detection demo:');
    console.log('  - Mercadona - Gran Vía 12: 6 invoices via Endesa (baseline: avg ~35.1 kWh, Jan/Aug-Dec 2025)');
    console.log('  - When you upload a new high-consumption invoice for this same client, it will trigger HIGH PRIORITY');
    console.log('  - Grupo Inmobiliario Aurora: 2 invoices via Iberdrola (Feb 2025 has a +89% consumption anomaly)');
    console.log('  - Hostelería Sur S.L.: 1 invoice via Naturgy (efficient usage)');
    console.log('  - All contacts auto-synced to Priority Queue, grouped by client_name (not by provider)');

    await pool.end();
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    await pool.end();
    process.exit(1);
  }
}

seedDatabase();
