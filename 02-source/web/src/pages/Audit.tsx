import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, Search, ShieldCheck, X } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate, formatTime } from '../lib/format';
import type { AuditEvent, Paged } from '../lib/types';
import { PageHeader } from '../components/Shell';
import { Avatar, Badge, Card, EmptyState, LoadingBlock, Pagination } from '../components/ui';

const ACTION_TONE: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'mint'> = {
  EXCEPTION_RESOLVED: 'success',
  EXCEPTION_REOPENED: 'warning',
  EXCEPTION_UPDATED: 'info',
  EXCEPTION_BULK_ASSIGNED: 'info',
  IMPORT_COMMITTED: 'success',
  IMPORT_DUPLICATE_FILE: 'neutral',
  ATTACHMENT_UPLOADED: 'info',
  ATTACHMENT_REUSED: 'mint',
  RECONCILIATION_RUN: 'info',
  SETTINGS_UPDATED: 'warning',
  LOGIN: 'neutral',
  PILOT_DATA_LOADED: 'mint',
};

const ENTITY_TYPES = [
  { value: '', label: 'All entities' },
  { value: 'EXCEPTION', label: 'Exceptions' },
  { value: 'IMPORT_BATCH', label: 'Imports' },
  { value: 'ATTACHMENT', label: 'Documents' },
  { value: 'RUN', label: 'Reconciliation runs' },
  { value: 'SETTINGS', label: 'Settings' },
  { value: 'SESSION', label: 'Sessions' },
  { value: 'SYSTEM', label: 'System' },
];

function metaEntries(meta: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(meta)
    .filter(([, value]) => value !== null && value !== undefined && value !== '' && typeof value !== 'object')
    .slice(0, 4)
    .map(([key, value]) => [key.replace(/([A-Z])/g, ' $1').toLowerCase(), String(value)]);
}

export function AuditPage() {
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, entityType]);

  const params = new URLSearchParams({ page: String(page), pageSize: '30' });
  if (search.trim()) params.set('q', search.trim());
  if (entityType) params.set('entityType', entityType);

  const { data, isLoading } = useQuery({
    queryKey: ['audit', params.toString()],
    queryFn: () => api.get<Paged<AuditEvent>>(`/api/audit?${params.toString()}`),
  });

  const groups = useMemo(() => {
    const map = new Map<string, AuditEvent[]>();
    for (const event of data?.items ?? []) {
      const day = event.at.slice(0, 10);
      const list = map.get(day) ?? [];
      list.push(event);
      map.set(day, list);
    }
    return [...map.entries()];
  }, [data]);

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Immutable record · every action"
        title="Audit trail"
        subtitle="Logins, imports, reconciliation runs, evidence uploads and every exception disposition — in sequence."
      />

      <div className="audit-banner">
        <ShieldCheck size={18} />
        <div>
          <strong>Append-only operational trail</strong>
          <span>Supervisor approvals, duplicate imports and auto-cleared exceptions are all captured with actor and timestamp.</span>
        </div>
        <Badge tone="neutral">{data ? `${data.total.toLocaleString('en-US')} events` : '—'}</Badge>
      </div>

      <Card padded={false}>
        <div className="queue-toolbar">
          <div className="search-shell">
            <Search size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search action, actor or summary…"
              aria-label="Search audit trail"
            />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button>}
          </div>
          <div className="toolbar-filters">
            <select value={entityType} onChange={(event) => setEntityType(event.target.value)} aria-label="Filter entity type">
              {ENTITY_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="queue-loading"><LoadingBlock rows={8} /></div>
        ) : groups.length === 0 ? (
          <EmptyState icon={<ScrollText size={22} />} title="No audit events" message="Actions will appear here as the team works the queue." />
        ) : (
          <>
            <div className="audit-feed">
              {groups.map(([day, events]) => (
                <div className="audit-day" key={day}>
                  <div className="audit-day-label">
                    <span>{formatDate(day)}</span>
                    <span className="audit-day-count">{events.length} events</span>
                  </div>
                  {events.map((event) => (
                    <div className="audit-event" key={event.id}>
                      <Avatar name={event.actorName} size={32} />
                      <div className="audit-event-body">
                        <div className="audit-event-head">
                          <strong>{event.actorName}</strong>
                          <Badge tone={ACTION_TONE[event.action] ?? 'neutral'}>{event.action.replace(/_/g, ' ').toLowerCase()}</Badge>
                          <span className="audit-time">{formatTime(event.at)}</span>
                        </div>
                        <p>{event.summary}</p>
                        <div className="audit-meta">
                          <span className="mono">{event.entityType}{event.entityId ? ` · ${event.entityId.slice(0, 18)}` : ''}</span>
                          {metaEntries(event.meta).map(([key, value]) => (
                            <span className="audit-meta-chip" key={key}>{key}: {value}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <Pagination page={data?.page ?? 1} totalPages={data?.totalPages ?? 1} total={data?.total ?? 0} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
