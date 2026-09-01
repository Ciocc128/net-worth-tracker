/**
 * exposureReport — read-only diagnosis of the Esposizione tile's real coverage, on YOUR real
 * portfolio (Firebase Admin SDK, `giorgiotrentadue@gmail.com`). Prints, per view, the base, the
 * read share, and exactly which instruments are `nonApplicabile` vs `nonLetta` — the same
 * three-bucket breakdown the tile itself shows, so a look here is a preview of what the page will
 * say before you open it.
 *
 * `npm run exposure:report` — never writes anything, Firestore or otherwise (besides the
 * 30-day instrument-profile-cache and 24h exposure-cache the normal computation already writes as
 * a side effect — this script computes exposure exactly the way the API route does).
 *
 * Env: reads `.env.local` from the CURRENT working directory if present (Node's native
 * `process.loadEnvFile`, no extra dependency) — the three `FIREBASE_ADMIN_*` vars and the
 * `NEXT_PUBLIC_FIREBASE_*` ones (the exposure computation transitively imports client-SDK code
 * for `calculateAssetValue`, so both sets must be in scope before that import runs — hence the
 * dynamic imports below, AFTER `loadEnvLocal()`, not static ones at the top of the file).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  try {
    process.loadEnvFile(envPath);
  } catch (err) {
    console.warn(`[exposure:report] could not parse ${envPath}:`, err);
  }
}
loadEnvLocal();

const TARGET_EMAIL = 'giorgiotrentadue@gmail.com';

async function main() {
  const { getAuth } = await import('firebase-admin/auth');
  const { getUserAssetsAdmin } = await import('../lib/server/assetAdminRepository');
  const { computePortfolioExposure } = await import('../lib/server/portfolioExposureService');
  const { resolveAllocationRole } = await import('../lib/utils/allocationUtils');
  const { cachedFormatCurrencyEUR } = await import('../lib/utils/formatters');
  await import('../lib/firebase/admin'); // ensures the Admin app is initialised before getAuth() below

  const user = await getAuth().getUserByEmail(TARGET_EMAIL);
  const assets = await getUserAssetsAdmin(user.uid);

  const active = assets.filter((a) => a.quantity > 0);
  const allocable = active.filter((a) => {
    const role = resolveAllocationRole(a);
    return role === 'tradable' || role === 'frozen';
  });
  const excluded = active.filter((a) => resolveAllocationRole(a) === 'excluded');

  console.log(`\nPortafoglio di ${TARGET_EMAIL} — ${active.length} asset attivi, ${allocable.length} allocabili, ${excluded.length} esclusi\n`);

  const exposure = await computePortfolioExposure(assets);

  const eur = (v: number) => cachedFormatCurrencyEUR(v, true);
  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

  type ViewKey = 'holdings' | 'sectors' | 'geography' | 'currency' | 'issuers';
  const VIEWS: Array<{ key: ViewKey; label: string; base: string }> = [
    { key: 'holdings', label: 'Titoli', base: 'nozionale azionario' },
    { key: 'sectors', label: 'Settori', base: 'nozionale azionario' },
    { key: 'geography', label: 'Geografia', base: 'nozionale azionario + obbligazionario' },
    { key: 'currency', label: 'Valuta', base: 'valore di mercato allocabile' },
    { key: 'issuers', label: 'Emittenti', base: 'valore di mercato allocabile' },
  ];

  console.log('── Copertura per vista ──────────────────────────────────────────────\n');
  for (const { key, label, base } of VIEWS) {
    const data = exposure[key];
    const { coverage } = data;
    const readPct = coverage.baseEur > 0 ? coverage.read.amountEur / coverage.baseEur : 0;
    console.log(`${label} (base: ${base}, ${eur(coverage.baseEur)})`);
    console.log(`  letta:          ${eur(coverage.read.amountEur)} (${pct(readPct)})`);
    if (coverage.notApplicable.amountEur > 0.5) {
      console.log(`  nonApplicabile: ${eur(coverage.notApplicable.amountEur)} — ${coverage.notApplicable.instruments.join(', ')}`);
    }
    if (coverage.unread.amountEur > 0.5) {
      console.log(`  nonLetta:       ${eur(coverage.unread.amountEur)} — ${coverage.unread.instruments.join(', ')}`);
    }
    console.log(`  top ${data.entries.length} voci: ${data.entries.slice(0, 5).map((e) => `${e.label} (${pct(e.exposurePct)})`).join(', ') || '—'}`);
    console.log('');
  }

  console.log('── Per strumento (allocabili) ───────────────────────────────────────\n');
  const holdingsUnread = new Set(exposure.holdings.coverage.unread.instruments);
  const holdingsNA = new Set(exposure.holdings.coverage.notApplicable.instruments);
  const sectorsUnread = new Set(exposure.sectors.coverage.unread.instruments);
  const currencyUnread = new Set(exposure.currency.coverage.unread.instruments);
  const issuersUnread = new Set(exposure.issuers.coverage.unread.instruments);

  for (const asset of allocable.sort((a, b) => b.currentPrice * b.quantity - a.currentPrice * a.quantity)) {
    const holdingsVerdict = holdingsNA.has(asset.name) ? 'nonApplicabile' : holdingsUnread.has(asset.name) ? 'nonLetta' : 'letta';
    const sectorsVerdict = holdingsNA.has(asset.name) ? 'nonApplicabile' : sectorsUnread.has(asset.name) ? 'nonLetta' : 'letta';
    const currencyVerdict = currencyUnread.has(asset.name) ? 'nonLetta' : 'letta';
    const issuerVerdict = issuersUnread.has(asset.name) ? 'nonLetta' : 'letta';
    console.log(
      `${asset.ticker.padEnd(16)} ${asset.name.slice(0, 32).padEnd(34)} Titoli=${holdingsVerdict.padEnd(14)} Settori=${sectorsVerdict.padEnd(14)} Valuta=${currencyVerdict.padEnd(8)} Emittente=${issuerVerdict}`
    );
  }

  console.log(`\nCalcolato: ${exposure.computedAt}`);
  console.log(`Tabella curata piu' vecchia usata: ${exposure.oldestProfileAsOf ?? '(nessuna — solo Yahoo)'}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[exposure:report] failed:', err);
    process.exit(1);
  });
