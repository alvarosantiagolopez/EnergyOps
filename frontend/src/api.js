const API_BASE_URL = '';

/**
 * Uploads an invoice file to be extracted and analyzed.
 * @param {File} file
 * @param {string} clientName - The client (business company manages energy for) this invoice belongs to
 * @returns {Promise<object>} { invoice, extracted, comparison, anomalies, analysis, recommendations, crmSync }
 */
export async function extractInvoice(file, clientName) {
  const formData = new FormData();
  formData.append('clientName', clientName);
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/invoices/extract`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to process invoice');
  }
  return data;
}

/**
 * Fetches distinct client names already used across invoices, to power the
 * upload form's autocomplete suggestions.
 * @returns {Promise<string[]>}
 */
export async function fetchClientNames() {
  const response = await fetch(`${API_BASE_URL}/api/invoices/client-names`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch client names');
  }
  return data;
}

/**
 * Fetches previously analyzed invoices, newest first.
 * @param {string} [clientName] - If provided, scopes results to this client only
 * @returns {Promise<object[]>}
 */
export async function fetchInvoices(clientName) {
  const url = clientName
    ? `${API_BASE_URL}/api/invoices?client_name=${encodeURIComponent(clientName)}`
    : `${API_BASE_URL}/api/invoices`;
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch invoices');
  }
  return data;
}

/**
 * Fetches distinct clients that have at least one invoice, most recently
 * invoiced first, to populate the Dashboard's client selector.
 * @returns {Promise<{clientName: string, lastInvoiceAt: string|null}[]>}
 */
export async function fetchClients() {
  const response = await fetch(`${API_BASE_URL}/api/invoices/clients`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch clients');
  }
  return data;
}

/**
 * Fetches all CRM contacts with their sync status, newest sync first.
 * @returns {Promise<object[]>}
 */
export async function fetchCrmContacts() {
  const response = await fetch(`${API_BASE_URL}/api/crm/contacts`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch CRM contacts');
  }
  return data;
}

/**
 * Fetches statistical trend analysis (Python microservice) over historical invoices.
 * Returns null if the statistics service was unavailable when the backend queried it.
 * @param {string} [clientName] - If provided, scopes trends to this client only
 * @returns {Promise<object|null>}
 */
export async function fetchTrends(clientName) {
  const url = clientName
    ? `${API_BASE_URL}/api/invoices/trends?client_name=${encodeURIComponent(clientName)}`
    : `${API_BASE_URL}/api/invoices/trends`;
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch trend analysis');
  }
  return data;
}
