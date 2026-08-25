CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255),
  period VARCHAR(50),
  company VARCHAR(255),
  client_name VARCHAR(255),
  consumption_kwh DECIMAL,
  total_cost DECIMAL,
  cost_per_kwh DECIMAL,
  contract_type VARCHAR(100),
  anomalies TEXT,
  ai_analysis TEXT,
  recommendations TEXT,
  raw_extracted_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_name VARCHAR(255);

CREATE TABLE IF NOT EXISTS crm_contacts (
  id SERIAL PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  provider VARCHAR(255),
  contact_email VARCHAR(255),
  last_invoice_id INTEGER REFERENCES invoices(id),
  last_consumption_kwh DECIMAL,
  last_sync_status VARCHAR(50) DEFAULT 'pending',
  anomaly_status VARCHAR(50) DEFAULT 'normal',
  last_synced_at TIMESTAMP,
  agent_priority VARCHAR(20),
  agent_reasoning TEXT,
  agent_root_cause VARCHAR(50),
  agent_action_taken VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS agent_priority VARCHAR(20);
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS agent_reasoning TEXT;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS agent_root_cause VARCHAR(50);
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS agent_action_taken VARCHAR(50);
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS provider VARCHAR(255);
