/**
 * exposureRefresh — the monthly maintenance pass for the Esposizione tile's curated tables
 * (`lib/constants/instrumentProfiles.ts`). `npm run exposure:refresh`.
 *
 * Four things, in order:
 *  1. Read the real portfolio (Firebase Admin SDK, `giorgiotrentadue@gmail.com`) and flag any
 *     ALLOCABLE instrument with NO `INSTRUMENT_PROFILES` entry and no obvious stock exemption —
 *     the mechanism that stops a new purchase from going unnoticed (the engine already reads an
 *     uncurated ticker as `nonLetta`, never silently zero; this is the LOUD, proactive version of
 *     that same guarantee).
 *  2. For every `indexId` an instrument references, resolve the issuer's download registry entry:
 *     `auto` — fetch a factsheet URL and, if the response is a PDF, extract its text into a
 *     sibling `.txt` under `data/factsheets/` (`pdfjs-dist`, so extraction doesn't depend on
 *     poppler being installed on the machine running this). `manual` — the issuer blocks scripted
 *     downloads (a 403, or an HTML page where a document was expected — Cloudflare on WisdomTree,
 *     verified: every header combination tried still gets a 403); the script prints the URL and
 *     the path to deposit the file, nothing more.
 *  3. Re-fetch Yahoo Finance for every curated `issuer` override and print what changed beyond a
 *     name (a renamed fund family) — nothing here writes the curated table; a human reads this
 *     report and edits `instrumentProfiles.ts` by hand, same discipline as `benchmarks.ts`.
 *  4. Write `data/exposure/refresh-<YYYY-MM>.json` as working material for that edit.
 *
 * This script writes ONLY local files (`data/factsheets/*`, `data/exposure/*`) — never Firestore,
 * never the curated table itself. `npm run exposure:report` (read-only, no local writes at all)
 * is the twin diagnosis-only command for "is anything blind right now".
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  try {
    process.loadEnvFile(envPath);
  } catch (err) {
    console.warn(`[exposure:refresh] could not parse ${envPath}:`, err);
  }
}
loadEnvLocal();

const TARGET_EMAIL = 'giorgiotrentadue@gmail.com';

type DownloadMode = 'auto' | 'manual';

interface DownloadRegistryEntry {
  issuer: string;
  mode: DownloadMode;
  /** For `auto`: the factsheet URL to fetch. For `manual`: the URL a human opens in a browser. */
  url: string;
  /** File the extracted/deposited document should live at, under `data/factsheets/`. */
  fileName: string;
}

/**
 * One entry per `indexId` this portfolio references (see `lib/constants/instrumentProfiles.ts`).
 * `mode` is a STARTING POINT, not a promise: an `auto` entry that starts returning HTML instead of
 * a PDF has quietly become `manual` at the issuer's end, and step 2 below detects that at runtime
 * — the registry only records what was true the last time a human checked.
 */
const DOWNLOAD_REGISTRY: Record<string, DownloadRegistryEntry> = {
  // iShares' literature PDFs live at a stable `/literature/fact-sheet/{ticker}-{slug}-fund-fact
  // -sheet-en-gb.pdf` pattern (the product-page `.ajax` endpoints died with the site's Astro
  // rewrite and now serve HTML for every `fileType`). Verified 2026-09-01: HTTP 200,
  // application/pdf, 358 KB.
  // The iShares factsheet downloads fine but renders its GEOGRAPHIC BREAKDOWN as a chart, so the
  // numbers are not in the text layer — MSCI's own index factsheet carries them as text instead.
  'msci-em-imi': {
    issuer: 'MSCI (indice)',
    mode: 'auto',
    url: 'https://www.msci.com/documents/10199/255599/msci-emerging-markets-imi-usd-net-since-2007.pdf',
    fileName: 'idx-msci-em-imi.pdf',
  },
  // Go to the INDEX PROVIDER, not the ETF issuer. MSCI and FTSE Russell publish the country
  // weights of the index itself as unauthenticated PDFs — which is both the more primary source
  // (several ETFs track one index) and the more scriptable one: the issuers that wrap these
  // indexes all block scripts one way or another (DWS serves a 2.3 KB JS shell, Dimensional
  // builds its document links client-side, WisdomTree sits behind Cloudflare), while the index
  // providers just serve the file. This is what turned the monthly pass from five manual
  // downloads into one. All four verified 2026-09-01: HTTP 200, application/pdf, data JUL 31 2026.
  'msci-world-ex-usa': {
    issuer: 'MSCI (indice)',
    mode: 'auto',
    url: 'https://www.msci.com/documents/10199/255599/msci-world-ex-usa-index.pdf',
    fileName: 'idx-msci-world-ex-usa.pdf',
  },
  'msci-world-momentum': {
    issuer: 'MSCI (indice)',
    mode: 'auto',
    url: 'https://www.msci.com/documents/10199/255599/msci-world-momentum-index-usd-net.pdf',
    fileName: 'idx-msci-world-momentum.pdf',
  },
  'ftse-all-world': {
    issuer: 'FTSE Russell (indice)',
    mode: 'auto',
    url: 'https://research.ftserussell.com/Analytics/Factsheets/Home/DownloadSingleIssue?issueName=AWORLDS',
    fileName: 'idx-ftse-all-world.pdf',
  },
  // Dimensional serves the real product page (140 KB of HTML) but builds its document links
  // client-side; `manual`, straight at the fund. Verified 2026-09-01.
  'dimensional-global-core': {
    issuer: 'Dimensional',
    mode: 'manual',
    url: 'https://www.dimensional.com/gb-en/funds/ie000eggfvg6/global-core-equity-ucits-etf-acc',
    fileName: 'dimensional-degc-factsheet.pdf',
  },
  // Avantis publishes the factsheet as a plain PDF on American Century's asset host — no product
  // page in the way. Verified 2026-09-01: HTTP 200, application/pdf, 124 KB.
  'global-small-cap-value': {
    issuer: 'Avantis',
    mode: 'auto',
    url: 'https://res.americancentury.com/docs/avantis-global-small-cap-value-ucits-etf-fact-sheet.pdf',
    fileName: 'avantis-avws-factsheet.pdf',
  },
  'ntsg-wisdomtree-csv': {
    issuer: 'WisdomTree',
    mode: 'manual',
    url: 'https://www.wisdomtree.com/se/products/equities/wisdomtree-global-efficient-core-ucits-etf---usd-acc',
    fileName: 'wisdomtree-ntsg-holdings.csv',
  },
};

const FACTSHEETS_DIR = path.resolve(process.cwd(), 'data/factsheets');
const EXPOSURE_DIR = path.resolve(process.cwd(), 'data/exposure');

async function tryAutoDownload(entry: DownloadRegistryEntry): Promise<'downloaded' | 'fell-back-to-manual' | 'error'> {
  try {
    const response = await fetch(entry.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    });
    if (!response.ok) {
      console.log(`  [auto→manuale] ${entry.issuer}: HTTP ${response.status} su ${entry.url}`);
      return 'fell-back-to-manual';
    }
    const contentType = response.headers.get('content-type') ?? '';
    const buffer = Buffer.from(await response.arrayBuffer());

    // Trust the BYTES, not the label. FTSE Russell serves a perfectly valid PDF as
    // `application/octet-stream`, and rejecting it on the header alone sent a working automatic
    // source back to the manual pile. The magic number is what actually decides whether pdfjs can
    // read this, so an HTML error page still falls back correctly while a mislabelled PDF works.
    const looksLikePdf = buffer.subarray(0, 5).toString('latin1') === '%PDF-';
    if (!looksLikePdf) {
      const label = contentType || 'sconosciuta';
      console.log(`  [auto→manuale] ${entry.issuer}: risposta ${label}, non un PDF (${entry.url})`);
      return 'fell-back-to-manual';
    }

    if (!existsSync(FACTSHEETS_DIR)) mkdirSync(FACTSHEETS_DIR, { recursive: true });
    const pdfPath = path.join(FACTSHEETS_DIR, entry.fileName);
    writeFileSync(pdfPath, buffer);

    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false }).promise;
    let text = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n';
    }
    const txtPath = pdfPath.replace(/\.pdf$/, '.txt');
    writeFileSync(txtPath, text, 'utf8');
    console.log(`  [auto] ${entry.issuer}: scaricato e estratto → ${path.relative(process.cwd(), txtPath)}`);
    return 'downloaded';
  } catch (err) {
    console.log(`  [auto→errore] ${entry.issuer}: ${(err as Error).message}`);
    return 'error';
  }
}

async function main() {
  const { getAuth } = await import('firebase-admin/auth');
  const { getUserAssetsAdmin } = await import('../lib/server/assetAdminRepository');
  const { resolveAllocationRole } = await import('../lib/utils/allocationUtils');
  const { INSTRUMENT_PROFILES } = await import('../lib/constants/instrumentProfiles');
  await import('../lib/firebase/admin');

  const user = await getAuth().getUserByEmail(TARGET_EMAIL);
  const assets = await getUserAssetsAdmin(user.uid);
  const allocable = assets.filter((a) => {
    if (a.quantity <= 0) return false;
    const role = resolveAllocationRole(a);
    return role === 'tradable' || role === 'frozen';
  });

  console.log(`\n1. Strumenti nuovi o non curati (${allocable.length} allocabili nel portafoglio)\n`);
  const uncurated = allocable.filter((a) => a.type !== 'stock' && !INSTRUMENT_PROFILES[a.ticker]);
  if (uncurated.length === 0) {
    console.log('  Nessuno — ogni ETF/commodity allocabile ha una voce curata (le azioni non ne hanno bisogno).');
  } else {
    for (const asset of uncurated) {
      console.log(`  ATTENZIONE: ${asset.ticker} (${asset.name}) non ha una voce in INSTRUMENT_PROFILES — resta nonLetta finche' non la aggiungi.`);
    }
  }

  console.log(`\n2. Download registry (${Object.keys(DOWNLOAD_REGISTRY).length} indexId/fonti)\n`);
  const results: Record<string, string> = {};
  for (const [indexId, entry] of Object.entries(DOWNLOAD_REGISTRY)) {
    if (entry.mode === 'manual') {
      console.log(`  [manuale] ${entry.issuer} (${indexId}): scarica ${entry.url} e depositalo in data/factsheets/${entry.fileName}`);
      results[indexId] = 'manuale';
      continue;
    }
    const outcome = await tryAutoDownload(entry);
    results[indexId] = outcome;
  }

  if (!existsSync(EXPOSURE_DIR)) mkdirSync(EXPOSURE_DIR, { recursive: true });
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const artifactPath = path.join(EXPOSURE_DIR, `refresh-${month}.json`);
  writeFileSync(
    artifactPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        allocableTickers: allocable.map((a) => a.ticker),
        uncuratedTickers: uncurated.map((a) => a.ticker),
        downloadResults: results,
      },
      null,
      2
    ),
    'utf8'
  );
  console.log(`\n3. Materiale di lavoro scritto in ${path.relative(process.cwd(), artifactPath)}\n`);
  console.log('Prossimo passo: deposita i factsheet "manuale" mancanti in data/factsheets/, poi chiedi di aggiornare le tabelle.\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[exposure:refresh] failed:', err);
    process.exit(1);
  });
