import { initDb } from '../src/db/index.js';
import { config } from '../src/config.js';
import { seedTreasury } from '../src/domain/treasury/generator.js';
import { runTreasuryReconciliation } from '../src/domain/treasury/engine.js';
import { CATEGORY_LABELS } from '../src/domain/treasury/catalog.js';

const perCategory = Number(process.env.TREASURY_PER_CATEGORY ?? 1200);
initDb();

const seeded = seedTreasury({ perCategory, today: config.today });
const run = runTreasuryReconciliation({ trigger: 'SEED', today: config.today });

console.log(`Treasury seed: ${seeded.deals.toLocaleString('en-US')} deals, ${seeded.legs.toLocaleString('en-US')} legs, ${seeded.documents.toLocaleString('en-US')} documents, ${seeded.duplicates} duplicates.`);
for (const row of seeded.byCategory) {
  console.log(`  ${CATEGORY_LABELS[row.category].padEnd(24)} ${row.deals.toLocaleString('en-US').padStart(7)} deals`);
}
console.log(`Reconciliation: ${run.stats.coverage}% full match · ${run.stats.openBreaks.toLocaleString('en-US')} open breaks · run ${run.runId}`);
