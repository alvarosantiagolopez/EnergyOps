import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchClients, fetchInvoices, fetchTrends } from '../api';

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'N/A';
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function ChartTooltip({ active, payload, label, unit }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__label">{label}</p>
      <p className="chart-tooltip__value">
        {formatNumber(payload[0].value, unit === '€' ? 2 : 0)} {unit}
      </p>
    </div>
  );
}

/**
 * Home view: KPIs and consumption/cost trends for a single selected client,
 * sourced from GET /api/invoices?client_name=X (same data as History, filtered).
 */
const TREND_ICONS = {
  increasing: '↑',
  decreasing: '↓',
  stable: '→',
};

function DashboardView() {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [error, setError] = useState(null);
  const [trends, setTrends] = useState(null);

  useEffect(() => {
    let isMounted = true;
    fetchClients()
      .then((data) => {
        if (!isMounted) return;
        setClients(data);
        // Clients are returned most-recently-invoiced first, so the first
        // entry is the sensible default selection.
        if (data.length > 0) setSelectedClient(data[0].clientName);
      })
      .catch((err) => {
        if (isMounted) setError(err.message);
      })
      .finally(() => {
        if (isMounted) setIsLoadingClients(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedClient) return;
    let isMounted = true;
    setIsLoadingInvoices(true);
    setTrends(null);
    fetchInvoices(selectedClient)
      .then((data) => {
        if (isMounted) setInvoices(data);
      })
      .catch((err) => {
        if (isMounted) setError(err.message);
      })
      .finally(() => {
        if (isMounted) setIsLoadingInvoices(false);
      });
    // Trend analysis comes from an optional Python microservice; if it's
    // unavailable, silently skip the section rather than surfacing an error.
    fetchTrends(selectedClient)
      .then((data) => {
        if (isMounted) setTrends(data);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [selectedClient]);

  const stats = useMemo(() => {
    if (invoices.length === 0) {
      return { count: 0, totalSpend: 0, avgConsumption: 0, latestAnomaly: null };
    }
    const totalSpend = invoices.reduce((sum, inv) => sum + (Number(inv.total_cost) || 0), 0);
    const totalConsumption = invoices.reduce(
      (sum, inv) => sum + (Number(inv.consumption_kwh) || 0),
      0
    );
    const latestAnomaly = invoices.find((inv) => inv.anomalies) || null;
    return {
      count: invoices.length,
      totalSpend,
      avgConsumption: totalConsumption / invoices.length,
      latestAnomaly,
    };
  }, [invoices]);

  const chartData = useMemo(() => {
    return [...invoices]
      .reverse()
      .map((inv, index) => ({
        name: inv.period || `#${index + 1}`,
        consumption: Number(inv.consumption_kwh) || 0,
        cost: Number(inv.total_cost) || 0,
      }));
  }, [invoices]);

  if (isLoadingClients) return <p className="status-message">Loading dashboard...</p>;
  if (error) return <p className="error-message">{error}</p>;

  if (clients.length === 0) {
    return (
      <div className="dashboard-view">
        <div className="page-header">
          <h1>Dashboard</h1>
          <p>Consumption and cost trends for the selected client.</p>
        </div>
        <div className="empty-state">
          <span className="empty-state__icon">📊</span>
          <h2>No invoices analyzed yet</h2>
          <p>Upload your first energy invoice to start seeing insights here.</p>
          <Link to="/upload" className="btn btn--primary">
            Upload an Invoice
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-view">
      <div className="page-header">
        <h1>Dashboard{selectedClient ? ` — ${selectedClient}` : ''}</h1>
        <p>Consumption and cost trends for the selected client.</p>
      </div>

      <div className="client-selector">
        <label className="client-selector__label" htmlFor="dashboard-client-select">
          Client
        </label>
        <select
          id="dashboard-client-select"
          className="client-selector__select"
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
        >
          {clients.map((c) => (
            <option key={c.clientName} value={c.clientName}>
              {c.clientName}
            </option>
          ))}
        </select>
      </div>

      {isLoadingInvoices ? (
        <p className="status-message">Loading data for {selectedClient}...</p>
      ) : invoices.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state__icon">📊</span>
          <h2>No invoices for {selectedClient}</h2>
          <p>This client doesn't have any analyzed invoices yet.</p>
        </div>
      ) : (
        <>
          <div className="metric-grid">
            <div className="metric-card">
              <span className="metric-card__label">Invoices Analyzed</span>
              <span className="metric-card__value">{stats.count}</span>
            </div>
            <div className="metric-card">
              <span className="metric-card__label">Total Spend</span>
              <span className="metric-card__value">{formatNumber(stats.totalSpend, 2)} €</span>
            </div>
            <div className="metric-card">
              <span className="metric-card__label">Average Consumption</span>
              <span className="metric-card__value">{formatNumber(stats.avgConsumption)} kWh</span>
            </div>
            <div className={`metric-card ${stats.latestAnomaly ? 'metric-card--anomaly' : 'metric-card--ok'}`}>
              <span className="metric-card__label">Anomaly Status</span>
              <span className="metric-card__value metric-card__value--small">
                {stats.latestAnomaly ? 'Anomaly detected' : 'All clear'}
              </span>
            </div>
          </div>

          <div className="chart-grid">
            <section className="card">
              <h2>Consumption Over Time</h2>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip content={<ChartTooltip unit="kWh" />} />
                  <Line
                    type="monotone"
                    dataKey="consumption"
                    name="Consumption"
                    stroke="#D97706"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#D97706', strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </section>

            <section className="card">
              <h2>Cost Over Time</h2>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip content={<ChartTooltip unit="€" />} />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    name="Cost"
                    stroke="#10B981"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#10B981', strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </section>
          </div>

          {trends && !trends.insufficient_data && (
            <section className="card trend-analysis">
              <h2>Trend Analysis</h2>
              <div className="trend-grid">
                <div className="trend-item">
                  <span className="trend-item__label">Trend Direction</span>
                  <span className={`trend-item__value trend-item__value--${trends.trend_direction}`}>
                    {TREND_ICONS[trends.trend_direction] || '→'}{' '}
                    {trends.trend_direction.charAt(0).toUpperCase() + trends.trend_direction.slice(1)}
                  </span>
                </div>
                <div className="trend-item">
                  <span className="trend-item__label">Change Over Period</span>
                  <span className="trend-item__value">
                    {trends.trend_percentage > 0 ? '+' : ''}
                    {formatNumber(trends.trend_percentage, 1)}%
                  </span>
                </div>
                <div className="trend-item">
                  <span className="trend-item__label">Seasonality</span>
                  <span className={`badge ${trends.seasonality_detected ? 'badge--active' : 'badge--muted'}`}>
                    {trends.seasonality_detected ? 'Detected' : 'Not detected'}
                  </span>
                </div>
                <div className="trend-item">
                  <span className="trend-item__label">Peak Month</span>
                  <span className="trend-item__value">{trends.peak_month || 'N/A'}</span>
                </div>
              </div>
              {trends.savings_potential_eur !== null && trends.savings_potential_eur > 0 && (
                <p className="trend-savings">
                  Estimated savings potential: <strong>{formatNumber(trends.savings_potential_eur, 2)} €</strong>{' '}
                  if consumption is brought down to your average.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default DashboardView;
