import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import { ApiError } from './lib/http.js';
import { authRoutes } from './routes/auth.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { importRoutes } from './routes/imports.js';
import { exceptionRoutes } from './routes/exceptions.js';
import { invoiceRoutes } from './routes/invoices.js';
import { transactionRoutes } from './routes/transactions.js';
import { attachmentRoutes } from './routes/attachments.js';
import { runRoutes } from './routes/runs.js';
import { reportRoutes } from './routes/reports.js';
import { auditRoutes } from './routes/audit.js';
import { settingRoutes } from './routes/settings.js';
import { vendorRoutes } from './routes/vendors.js';
import { treasuryRoutes } from './routes/treasury.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'warn' },
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: true,
  });

  await app.register(cors, {
    origin: [config.webOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173'],
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type'],
    maxAge: 600,
  });
  await app.register(multipart, {
    limits: { fileSize: config.maxUploadBytes, files: 1, fields: 12, fieldSize: 64 * 1024 },
  });

  app.get('/api/health', async () => ({ ok: true, service: 'laras-recon', time: new Date().toISOString() }));

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details ?? null },
      });
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    const code = (error as { code?: string }).code;
    if (code === 'FST_REQ_FILE_TOO_LARGE' || statusCode === 413) {
      return reply.status(413).send({
        error: { code: 'FILE_TOO_LARGE', message: 'The uploaded file is too large.' },
      });
    }
    request.log.error(error);
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Try again or contact the platform team.' },
    });
  });

  await app.register(authRoutes);
  await app.register(dashboardRoutes);
  await app.register(importRoutes);
  await app.register(exceptionRoutes);
  await app.register(invoiceRoutes);
  await app.register(transactionRoutes);
  await app.register(attachmentRoutes);
  await app.register(runRoutes);
  await app.register(reportRoutes);
  await app.register(auditRoutes);
  await app.register(settingRoutes);
  await app.register(vendorRoutes);
  await app.register(treasuryRoutes);

  return app;
}
