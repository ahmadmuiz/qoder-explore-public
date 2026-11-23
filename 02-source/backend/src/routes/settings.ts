import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getSettings, settingsForDisplay, updateSettings } from '../lib/settings.js';
import { writeAudit } from '../lib/audit.js';
import { guard, parseBody } from './helpers.js';

const patchSchema = z.object({
  amountToleranceMinor: z.number().int().min(0).max(100_000_000).optional(),
  graceDays: z.number().int().min(0).max(60).optional(),
  approvalThresholdMinor: z.number().int().min(0).optional(),
  highValueMinor: z.number().int().min(0).optional(),
  autoRunOnImport: z.boolean().optional(),
});

export async function settingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings', { preHandler: guard() }, async (_request, reply) => {
    return reply.send({ values: getSettings(), items: settingsForDisplay() });
  });

  app.patch('/api/settings', { preHandler: guard(['SUPERVISOR']) }, async (request, reply) => {
    const body = parseBody(patchSchema, request.body);
    const before = getSettings();
    const after = updateSettings(body, request.user.id);
    const changed = Object.entries(body)
      .filter(([key, value]) => before[key as keyof typeof before] !== value)
      .map(([key, value]) => `${key}: ${String(before[key as keyof typeof before])} → ${String(value)}`);
    if (changed.length > 0) {
      writeAudit({
        actorId: request.user.id,
        actorName: request.user.name,
        action: 'SETTINGS_UPDATED',
        entityType: 'SETTINGS',
        entityId: 'global',
        summary: `Controls updated — ${changed.join(', ')}.`,
        meta: { before, after },
      });
    }
    return reply.send({ values: after, items: settingsForDisplay() });
  });
}
