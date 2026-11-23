import type { FastifyInstance } from 'fastify';
import { all, one } from '../db/index.js';
import { paged, readPaging } from '../lib/http.js';
import { guard } from './helpers.js';

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/audit', { preHandler: guard() }, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const paging = readPaging(query);
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (query.q) {
      clauses.push('(summary LIKE ? OR actor_name LIKE ? OR action LIKE ?)');
      const like = `%${query.q}%`;
      params.push(like, like, like);
    }
    if (query.entityType) {
      clauses.push('entity_type = ?');
      params.push(query.entityType);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = one<{ count: number }>(`SELECT COUNT(*) AS count FROM audit_events ${where}`, ...params)?.count ?? 0;
    const items = all(
      `SELECT id, at, actor_id AS actorId, actor_name AS actorName, action, entity_type AS entityType,
              entity_id AS entityId, summary, meta_json AS metaJson
       FROM audit_events ${where} ORDER BY at DESC LIMIT ? OFFSET ?`,
      ...params,
      paging.pageSize,
      paging.offset,
    ).map((row) => {
      const item = row as Record<string, unknown>;
      let meta: unknown = {};
      try {
        meta = JSON.parse(String(item.metaJson ?? '{}'));
      } catch {
        meta = {};
      }
      delete item.metaJson;
      return { ...item, meta };
    });
    return reply.send(paged(items, total, paging));
  });
}
