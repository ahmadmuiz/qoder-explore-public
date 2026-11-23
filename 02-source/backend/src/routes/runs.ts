import type { FastifyInstance } from 'fastify';
import { all, one } from '../db/index.js';
import { ApiError, safeJson } from '../lib/http.js';
import { runReconciliation } from '../domain/engine.js';
import { guard } from './helpers.js';

let running = false;

export async function runRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/runs', { preHandler: guard() }, async (_request, reply) => {
    const rows = all<{ id: string; trigger: string; status: string; started_at: string; finished_at: string | null; stats_json: string; triggered_by: string | null; actor_name: string | null }>(
      `SELECT r.id, r.trigger, r.status, r.started_at, r.finished_at, r.stats_json, r.triggered_by, u.name AS actor_name
       FROM runs r LEFT JOIN users u ON u.id = r.triggered_by
       ORDER BY r.started_at DESC LIMIT 30`,
    );
    return reply.send({
      items: rows.map((row) => ({
        id: row.id,
        trigger: row.trigger,
        status: row.status,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        actorName: row.actor_name,
        stats: safeJson<Record<string, unknown>>(row.stats_json, {}),
      })),
    });
  });

  app.get('/api/runs/:id', { preHandler: guard() }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const row = one<{ id: string; trigger: string; status: string; started_at: string; finished_at: string | null; stats_json: string }>(
      'SELECT id, trigger, status, started_at, finished_at, stats_json FROM runs WHERE id = ?',
      id,
    );
    if (!row) throw new ApiError(404, 'RUN_NOT_FOUND', 'That reconciliation run does not exist.');
    const exceptions = all(
      `SELECT e.id, e.type, e.severity, e.status, e.title, e.invoice_number AS invoiceNumber, e.amount_minor AS amountMinor
       FROM exceptions e WHERE e.last_seen_run = ? ORDER BY e.amount_minor DESC LIMIT 30`,
      id,
    );
    return reply.send({
      run: {
        id: row.id,
        trigger: row.trigger,
        status: row.status,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        stats: safeJson<Record<string, unknown>>(row.stats_json, {}),
      },
      exceptions,
    });
  });

  app.post('/api/reconciliation/run', { preHandler: guard(['ANALYST', 'SUPERVISOR']) }, async (request, reply) => {
    if (running) throw new ApiError(409, 'RUN_IN_PROGRESS', 'A reconciliation run is already in progress.');
    running = true;
    try {
      const result = runReconciliation({ trigger: 'MANUAL', actor: request.user });
      return reply.send({ ok: true, ...result });
    } finally {
      running = false;
    }
  });
}
