import { initDb } from '../src/db/index.js';
import { config } from '../src/config.js';
import { runTreasuryReconciliation } from '../src/domain/treasury/engine.js';

initDb();
const run = runTreasuryReconciliation({ trigger: 'CLI', today: config.today });
console.log(`Treasury reconciliation ${run.runId}: ${run.stats.coverage}% full match, ${run.stats.openBreaks} open breaks.`);
for (const row of run.stats.breaksByType) console.log(`  ${row.type.padEnd(32)} ${row.count}`);
