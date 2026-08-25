import { useEffect, useState } from 'react';
import { fetchCrmContacts } from '../api';

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2, none: 3 };

const ROOT_CAUSE_LABELS = {
  billing_error: 'Billing error',
  consumption_increase: 'Consumption increase',
  seasonal_pattern: 'Seasonal pattern',
  unclear: 'Unclear',
};

const ACTION_LABELS = {
  flagged_for_manual_review: 'Flagged for review',
  email_alert_sent: 'Email alert sent',
  logged_only: 'Logged only',
  skipped_no_crm_contact: 'Skipped',
  error: 'Decision failed',
};

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'N/A';
  return Number(value).toFixed(digits);
}

function formatTimestamp(value) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function truncate(text, maxLength = 80) {
  if (!text) return '—';
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}

function sortByPriority(contacts) {
  return [...contacts].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.agent_priority] ?? 3;
    const pb = PRIORITY_ORDER[b.agent_priority] ?? 3;
    if (pa !== pb) return pa - pb;
    return new Date(b.last_synced_at || 0) - new Date(a.last_synced_at || 0);
  });
}

function PriorityBadge({ priority }) {
  if (!priority || priority === 'none') return null;
  return <span className={`priority-badge priority-badge--${priority}`}>{priority}</span>;
}

function QueueRow({ contact, isExpanded, onToggle }) {
  return (
    <>
      <tr className="queue-row" onClick={onToggle}>
        <td className="queue-row__company">
          {contact.company_name}
          {contact.provider && <span className="queue-row__provider"> · via {contact.provider}</span>}
        </td>
        <td><PriorityBadge priority={contact.agent_priority} /></td>
        <td className="queue-row__cause">{formatNumber(contact.last_consumption_kwh)} kWh</td>
        <td className="queue-row__cause">{ROOT_CAUSE_LABELS[contact.agent_root_cause] || '—'}</td>
        <td className="queue-row__reasoning">
          {truncate(contact.agent_reasoning)}
        </td>
        <td>
          {contact.agent_action_taken && (
            <span className="action-badge">{ACTION_LABELS[contact.agent_action_taken] || contact.agent_action_taken}</span>
          )}
        </td>
        <td className="queue-row__timestamp">{formatTimestamp(contact.last_synced_at)}</td>
      </tr>
      {isExpanded && (
        <tr className="queue-row__detail-row">
          <td colSpan={7}>
            <div className="queue-detail">
              <h3>Agent confidence &amp; full reasoning</h3>
              <p className="queue-detail__reasoning">{contact.agent_reasoning || 'No reasoning recorded yet.'}</p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function PriorityQueueView() {
  const [contacts, setContacts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    let isMounted = true;
    fetchCrmContacts()
      .then((data) => {
        if (isMounted) setContacts(data);
      })
      .catch((err) => {
        if (isMounted) setError(err.message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const header = (
    <div className="page-header">
      <h1>Priority Queue</h1>
      <p>All CRM contacts, ranked by the internal agent's prioritization decision.</p>
    </div>
  );

  if (isLoading) {
    return (
      <div className="priority-queue-view">
        {header}
        <p className="status-message">Loading queue...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="priority-queue-view">
        {header}
        <p className="error-message">{error}</p>
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="priority-queue-view">
        {header}
        <div className="empty-state">
          <span className="empty-state__icon">📋</span>
          <h2>No contacts yet</h2>
          <p>Items appear here once an invoice is analyzed and the internal agent evaluates it.</p>
        </div>
      </div>
    );
  }

  const items = sortByPriority(contacts);

  return (
    <div className="priority-queue-view">
      {header}
      <table className="queue-table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Priority</th>
            <th>Last consumption</th>
            <th>Root cause</th>
            <th>Reasoning</th>
            <th>Action taken</th>
            <th>Last synced</th>
          </tr>
        </thead>
        <tbody>
          {items.map((contact) => (
            <QueueRow
              key={contact.id}
              contact={contact}
              isExpanded={expandedId === contact.id}
              onToggle={() => setExpandedId(expandedId === contact.id ? null : contact.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PriorityQueueView;
