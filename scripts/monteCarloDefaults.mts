/**
 * `npm run montecarlo:defaults` — recomputes the Monte Carlo default table (doc/montecarlo/README.md § 14.6) from the
 * archived annual series and compares it with `lib/constants/monteCarloMarketDefaults.ts` (§ 14.13, RQ10). Prints the
 * table, the manifest check and every mismatch; exits 1 when something differs.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  ARCHIVE_CLASSES,
  compareDefaults,
  computeClass,
  parseAnnualCsv,
  verifyManifest,
  type ArchiveManifest,
} from '../lib/utils/monteCarloDefaultsArchive';
import { MONTE_CARLO_CLASS_DEFAULTS } from '../lib/constants/monteCarloMarketDefaults';

const dir = path.join(process.cwd(), 'data', 'montecarlo');
const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as ArchiveManifest;
const table = parseAnnualCsv(readFileSync(path.join(dir, 'annual_series.csv'), 'utf8'));
const rawRoot = process.env.MONTECARLO_RAW_ROOT ?? manifest.rawRoot;

const check = verifyManifest(manifest, (entry) => {
  const file = entry.inRepo ? path.join(process.cwd(), entry.file) : path.join(rawRoot, entry.file);
  return existsSync(file) ? readFileSync(file) : null;
});
console.log(`Manifest: ${check.checked.length} file controllati, ${check.absent.length} non presenti su questa macchina, ${check.changed.length} cambiati.`);
for (const name of check.changed) console.log(`  CAMBIATO: ${name}`);

console.log('\nClasse            anni   CAGR reale   Vol.   Vol. coperta   Incertezza   (default: CAGR / vol. / incertezza)');
for (const cls of ARCHIVE_CLASSES) {
  const c = computeClass(table, cls);
  const d = MONTE_CARLO_CLASS_DEFAULTS[cls];
  console.log(
    `${cls.padEnd(16)} ${String(c.years).padStart(5)} ${c.cagr.toFixed(2).padStart(10)} ${c.volatility.toFixed(2).padStart(8)} ${(c.volatilityHedged?.toFixed(2) ?? '—').padStart(12)} ${c.uncertainty.toFixed(2).padStart(11)}   (${d.cagr ?? '—'} / ${d.volatility} / ${d.uncertainty})`
  );
}

console.log('\nObbligazioni e Liquidità seguono i tassi BCE, Trend e Carry sono un premio sulla Liquidità: di queste quattro classi si controllano volatilità e ingressi, non il CAGR storico.');

const mismatches = compareDefaults(table, manifest);
if (mismatches.length === 0 && check.changed.length === 0) {
  console.log('\nOK: i default coincidono con i dati archiviati.');
} else {
  for (const m of mismatches) console.log(`DIVERSO: ${m.cls} · ${m.field}: archivio ${m.expected}, default ${m.actual}`);
  process.exitCode = 1;
}
