/**
 * Every Recharts series respects «riduci movimento» (AN1, doc/animazioni/README.md § 5.1, D-AN4).
 *
 * The page's `MotionConfig` does not reach Recharts, so a `<Area>`, `<Bar>` or `<Line>` drawn from
 * the app's door (`components/ui/charts/recharts`) that animates on its own animates even with the
 * preference on (14 of 20 charts did, 2026-10-23). A series must spread `useChartMotion()` or say
 * `isAnimationActive={false}`; the failure names file and line.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../components');
const SERIES_TAG = /<(Area|Bar|Line)\b(?!Chart)/g;

function listTsx(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTsx(full);
    return entry.name.endsWith('.tsx') ? [full] : [];
  });
}

/** The text of a JSX opening tag from `start` to its closing `>` (braces balanced, `=>` skipped). */
function openingTag(source: string, start: number): string {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (char === '>' && depth === 0 && source[i - 1] !== '=') return source.slice(start, i + 1);
  }
  return source.slice(start);
}

/** `file:line` of every series of the door's recharts that neither spreads the hook nor opts out. */
export function seriesWithoutMotion(source: string, file: string): string[] {
  if (!source.includes("'@/components/ui/charts/recharts'")) return [];
  const problems: string[] = [];
  for (const match of source.matchAll(SERIES_TAG)) {
    const tag = openingTag(source, match.index);
    if (tag.includes('{...chartMotion}') || tag.includes('isAnimationActive={false}')) continue;
    const line = source.slice(0, match.index).split('\n').length;
    problems.push(`${file}:${line} ${match[0]}`);
  }
  return problems;
}

describe('chart motion guard', () => {
  it('every Area, Bar and Line spreads useChartMotion or opts out of animating', () => {
    const problems = listTsx(ROOT).flatMap((file) =>
      seriesWithoutMotion(readFileSync(file, 'utf8'), path.relative(path.resolve(__dirname, '..'), file)),
    );
    expect(problems).toEqual([]);
  });

  it('fails, naming the line, on a series that animates on its own', () => {
    const source = [
      "import { Bar, BarChart } from '@/components/ui/charts/recharts';",
      'export const C = () => (',
      '  <BarChart>',
      '    <Bar dataKey="x" />',
      '  </BarChart>',
      ');',
    ].join('\n');
    expect(seriesWithoutMotion(source, 'C.tsx')).toEqual(['C.tsx:4 <Bar']);
  });

  it('passes a series with the spread, and one that never animates', () => {
    const source = [
      "import { Area, Line } from '@/components/ui/charts/recharts';",
      '<Area dataKey="a" {...chartMotion} />',
      '<Line dataKey="b" dot={(p) => p.x > 1} isAnimationActive={false} />',
    ].join('\n');
    expect(seriesWithoutMotion(source, 'C.tsx')).toEqual([]);
  });
});
