import type { FastifyInstance } from 'fastify';
import { all } from '../db/index.js';
import { guard } from './helpers.js';

export async function vendorRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/vendors', { preHandler: guard() }, async (_request, reply) => {
    const items = all(
      `SELECT v.id, v.code, v.name, v.category, v.bank_name AS bankName, v.account_mask AS accountMask,
              (SELECT COUNT(*) FROM invoices i WHERE i.vendor_id = v.id) AS invoiceCount,
              (SELECT COALESCE(SUM(i.total_minor), 0) FROM invoices i WHERE i.vendor_id = v.id) AS invoiceValueMinor,
              (SELECT COUNT(*) FROM exceptions e WHERE e.vendor_id = v.id AND e.status IN ('OPEN', 'IN_REVIEW')) AS openExceptions,
              (SELECT COALESCE(SUM(CASE WHEN e.type IN ('DUPLICATE_PAYMENT', 'MISSING_PAYMENT', 'UNALLOCATED_PAYMENT') THEN e.amount_minor ELSE ABS(e.delta_minor) END), 0)
                 FROM exceptions e WHERE e.vendor_id = v.id AND e.status IN ('OPEN', 'IN_REVIEW')) AS riskMinor
       FROM vendors v ORDER BY v.name`,
    );
    return reply.send({ items });
  });
}
