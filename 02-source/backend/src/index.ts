import { buildApp } from './app.js';
import { config } from './config.js';
import { initDb } from './db/index.js';
import { one } from './db/index.js';

initDb();
const app = await buildApp();

const seeded = one<{ count: number }>('SELECT COUNT(*) AS count FROM users')?.count ?? 0;
if (seeded === 0) {
  console.warn('Database is empty. Run `npm run seed` from 02-source/backend to load the pilot dataset.');
}

await app.listen({ port: config.port, host: config.host });
console.log(`Laras API listening on http://${config.host}:${config.port}`);
console.log('Demo sign-in: rani@bcn.co.id / laras2026');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
