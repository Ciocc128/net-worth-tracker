/**
 * TheBull read by code (lib/utils/thebullParse.ts): the cleaning rule applied before the raw is
 * written, and the parse that must give the SAME answer on the email and on the stored raw — the
 * property the daily retry depends on. Synthetic fixture, decoy words only.
 */

import { describe, expect, it } from 'vitest';
import { cleanTheBullText, isoWeekOf, parseIndexTable, parseTheBull, pointText, stripFrontmatter } from '@/lib/utils/thebullParse';
import { DECOY_SUBSCRIBER, theBullPlainBody } from './thebullFixture';

describe('cleanTheBullText — the fixed rule applied before the raw is written', () => {
  const cleaned = cleanTheBullText(theBullPlainBody());

  it('drops every line that carries the subscriber id, and the list machinery', () => {
    expect(theBullPlainBody()).toContain(DECOY_SUBSCRIBER);
    expect(cleaned).not.toContain(DECOY_SUBSCRIBER);
    expect(cleaned).not.toMatch(/list-manage|forward-to-friend|mailchi\.mp/);
  });

  it('drops the sponsor, the Academy promotion, the social links and the footer', () => {
    expect(cleaned).not.toContain('Broker Ornitorinco');
    expect(cleaned).not.toContain('academy.thebull.it');
    expect(cleaned).not.toContain('Nella Academy');
    expect(cleaned).not.toContain('Copyright');
    expect(cleaned).not.toContain('youtube.com/@example');
  });

  it('keeps the point, the readings, the episodes and the table word for word', () => {
    expect(cleaned).toContain('Il fenicottero decennale è arrivato al 4,25%, il massimo da 12 anni.');
    expect(cleaned).toContain('* Perché il fenicottero conta (Rivista Ornitorinco (https://example.com/fenicottero) )');
    expect(cleaned).toContain('MSCI All Country World +1.10% +12.50% +60.00% +150.25%');
    expect(cleaned).toContain('#7 - 14/06/2026');
  });

  it('is idempotent: cleaning the raw again changes nothing', () => {
    expect(cleanTheBullText(cleaned)).toBe(cleaned);
  });
});

describe('parseTheBull', () => {
  const issue = parseTheBull(theBullPlainBody());

  it('dates the issue from its «#n - DD/MM/YYYY» line', () => {
    expect(issue.issue).toBe(7);
    expect(issue.date).toBe('2026-06-14');
  });

  it('takes the first section as the headline, and the brief as its bullets without anchors', () => {
    expect(issue.headline).toBe("LA SETTIMANA DEL FENICOTTERO. E DELL'ORNITORINCO.");
    expect(issue.subtitle).toBe('Tassi fenicottero in salita, ornitorinco sotto pressione.');
    expect(issue.brief[0]).toBe('Il punto della settimana: Il fenicottero decennale ha superato il 4,25%.');
  });

  it('collects the point as its sub-sections, and nothing after the next marker', () => {
    expect(issue.point.map((s) => s.title)).toEqual(['Il fenicottero vola', 'Cosa ne pensiamo']);
    expect(pointText(issue)).not.toContain('Rivista Ornitorinco');
    expect(pointText(issue)).toMatch(/^## Il fenicottero vola\n\nIl fenicottero decennale/);
  });

  it('reads the readings, the episodes and the index table without a model', () => {
    expect(issue.readings).toEqual([
      { title: 'Perché il fenicottero conta', source: 'Rivista Ornitorinco', url: 'https://example.com/fenicottero' },
      { title: 'Tassi e piume', source: 'Blog Piume', url: 'https://example.org/piume' },
    ]);
    expect(issue.episodes).toEqual([
      { title: '101. Il fenicottero e il tuo mutuo', url: 'https://youtu.be/fenicottero', summary: 'Parliamo di mutui e fenicotteri.' },
    ]);
    expect(issue.indices).toEqual({
      horizons: ['1 mese', '1 anno', '5 anni', '10 anni'],
      rows: [
        { name: 'MSCI All Country World', values: ['+1.10%', '+12.50%', '+60.00%', '+150.25%'] },
        { name: 'Oro', values: ['-0.50%', '+8.00%', '+90.10%', '+120.00%'] },
      ],
      caption: 'Variazioni in % al 14/06/2026 in Euro.',
    });
    expect(issue.nextEpisode).toBe("Lunedì parliamo dell'ornitorinco.");
  });

  it('gives the same structure from the email and from the cleaned raw under its frontmatter', () => {
    const raw = `---\nfonte: "thebull"\ndata: "2026-06-14"\n---\n\n${cleanTheBullText(theBullPlainBody())}`;
    expect(parseTheBull(raw)).toEqual(issue);
  });

  it('without the «Il punto» marker, takes the unmarked sections as the point', () => {
    const older = parseTheBull(theBullPlainBody({ withPointMarker: false }));
    expect(older.point.map((s) => s.title)).toEqual(['Il fenicottero vola', 'Cosa ne pensiamo']);
  });

  it('without the issue line, has no date — the caller falls back to the receipt', () => {
    const undated = parseTheBull(theBullPlainBody({ issueLine: '' }));
    expect(undated.date).toBeNull();
    expect(undated.issue).toBeNull();
  });
});

describe('parseIndexTable', () => {
  it('ignores a row whose cells do not match the horizons', () => {
    const table = parseIndexTable('1 mese    1 anno\nOro +1.00% +2.00%\nRotto +1.00%\n');
    expect(table?.rows).toEqual([{ name: 'Oro', values: ['+1.00%', '+2.00%'] }]);
  });

  it('is null without a header row', () => {
    expect(parseIndexTable('Oro +1.00% +2.00%')).toBeNull();
  });
});

describe('isoWeekOf', () => {
  it.each([
    ['2026-09-27', '2026-W39'], // a Sunday closes its week
    ['2026-09-21', '2026-W39'],
    ['2026-01-01', '2026-W01'], // a Thursday: week 1 of its own year
    ['2027-01-03', '2026-W53'], // a Sunday in January still in the previous ISO year
    ['2024-12-30', '2025-W01'],
  ])('%s → %s', (date, week) => {
    expect(isoWeekOf(date)).toBe(week);
  });
});

describe('stripFrontmatter', () => {
  it('leaves a text without frontmatter as is', () => {
    expect(stripFrontmatter('abc\n---\n')).toBe('abc\n---\n');
  });
});
