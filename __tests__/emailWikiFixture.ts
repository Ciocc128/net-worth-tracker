/**
 * Vault pages for the F5 tests (lib/utils/emailWiki.ts), rendered by the SERVER'S OWN renderer
 * (`renderMonthPage`), so a change to the month page's shape breaks these tests instead of the
 * email's prompt. Invented content; the decoy words prove a block reaches the prompt.
 */

import { renderMonthPage, type MacroWeekRecord } from '@/lib/utils/wikiMacro';
import type { MacroArea } from '@/lib/utils/wikiMacro';

export const DECOY_MACRO = 'ornitorinco';
export const DECOY_PRINCIPLE = 'fenicottero';

function week(week: string, date: string, facts: Array<[MacroArea, string]>, theses: Array<[MacroArea, string]>): MacroWeekRecord {
  return {
    week,
    date,
    issue: 1,
    headline: `Titolo della ${week}`,
    subtitle: '',
    model: 'test',
    compiledAt: `${date}T10:00:00Z`,
    rawPath: `raw/thebull/${date}.md`,
    extraction: {
      fatti: facts.map(([area, sintesi]) => ({ area, paese: 'Eurozona', sintesi, citazione: sintesi })),
      tesi: theses.map(([area, sintesi]) => ({ area, sintesi, citazione: sintesi })),
      spunti: [],
    },
    dropped: [],
    indices: { horizons: ['1 mese', '1 anno'], rows: [{ name: 'MSCI All Country World', values: ['+1.39%', '+20.07%'] }], caption: 'Variazioni in % in Euro.' },
    readings: [],
    episodes: [],
  };
}

/** A month page with three facts on Tassi over three weeks, one on Azionario, and ten theses. */
export function monthPage(month: string, decoy = DECOY_MACRO): string {
  const theses: Array<[MacroArea, string]> = Array.from({ length: 10 }, (_, i) => ['azionario', `Tesi numero ${i + 1} del mese.`]);
  return renderMonthPage(
    month,
    [
      week('W1', `${month}-07`, [['tassi', 'Primo fatto sui tassi.'], ['azionario', `Le azioni salgono, parola ${decoy}.`]], theses.slice(0, 5)),
      week('W2', `${month}-14`, [['tassi', 'Secondo fatto sui tassi.']], theses.slice(5, 8)),
      week('W3', `${month}-21`, [['tassi', 'Terzo fatto sui tassi.']], theses.slice(8)),
    ],
    `${month}-28T10:00:00Z`
  );
}

export const DIGEST = `---
tipo: digest
aggiornato: 2026-09-30
fonti:
  - wiki/principi/allocazione-e-leva.md
---

# Principi — digest

Massimo 3.000 token: è il blocco che entra nei prompt delle email.

## Allocazione e leva ([[wiki/principi/allocazione-e-leva]])

- **Mai spostare pesi per motivi di mercato**, regola del ${DECOY_PRINCIPLE}.
- Vedi anche [[wiki/principi/comportamento|il comportamento]].
`;
