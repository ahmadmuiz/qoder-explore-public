import { run } from '../db/index.js';
import { newId } from './ids.js';
import { nowIso } from './dates.js';

export interface AuditInput {
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  meta?: Record<string, unknown>;
}

export function writeAudit(input: AuditInput): void {
  run(
    `INSERT INTO audit_events (id, at, actor_id, actor_name, action, entity_type, entity_id, summary, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId('aud'),
    nowIso(),
    input.actorId ?? null,
    input.actorName ?? 'system',
    input.action,
    input.entityType,
    input.entityId ?? null,
    input.summary,
    JSON.stringify(input.meta ?? {}),
  );
}
