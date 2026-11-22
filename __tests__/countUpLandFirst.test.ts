/**
 * A figure never counts from zero (UM1, D-UM1; DESIGN.md → The Net Worth Counter: «Numbers land — they
 * count from a prior value, never from zero»).
 *
 * 1. Behaviour: the first value of `useCountUp(…, { fromPrevious: true, landFirstValue: true })` is the
 *    value itself on the FIRST render (2500 → 2500, never 0). Reference worked out by hand for the glide
 *    that follows (unchanged, 600 ms ease-out-quart): from 2500 to 2600 at half the time the eased
 *    progress is 1 − (1 − 0,5)^4 = 0,9375, so 2500 + 100 · 0,9375 = 2593,75.
 * 2. Guard: no `useCountUp` call under app/ components/ lib/ passes `fromPrevious` without
 *    `landFirstValue` or `seed`. The failure names file and line.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { useCountUp } from '@/lib/utils/useCountUp';

const ROOTS = ['app', 'components', 'lib'].map((dir) => path.resolve(__dirname, '..', dir));

function listSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSources(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/** The text of the call's argument list from the `(` after `useCountUp`, parentheses balanced. */
function callArguments(source: string, start: number): string {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return source.slice(start);
}

/** `file:line` of every `useCountUp(` call that settles from a previous value but can start from zero. */
export function countsFromZero(source: string, file: string): string[] {
  const problems: string[] = [];
  for (const match of source.matchAll(/\buseCountUp\(/g)) {
    const args = callArguments(source, match.index + match[0].length - 1);
    // A shared options constant (`useCountUp(value, SETTLE)`) is checked where it is declared.
    const usesConstant = /,\s*[A-Z_]+\s*\)$/.test(args);
    if (usesConstant) continue;
    if (args.includes('fromPrevious') && !args.includes('landFirstValue') && !args.includes('seed')) {
      problems.push(`${file}:${source.slice(0, match.index).split('\n').length}`);
    }
  }
  // An options constant spread into a call must carry the rule itself.
  for (const match of source.matchAll(/const\s+[A-Z_]+\s*=\s*\{[^}]*fromPrevious[^}]*\}/g)) {
    if (!match[0].includes('landFirstValue') && !match[0].includes('seed')) {
      problems.push(`${file}:${source.slice(0, match.index).split('\n').length}`);
    }
  }
  return problems;
}

function Probe({ target, land }: { target: number; land: boolean }) {
  const value = useCountUp(target, { fromPrevious: true, landFirstValue: land, startDelay: 0, duration: 600 });
  return createElement('span', null, String(value));
}

describe('useCountUp lands its first value', () => {
  it('shows 2500 on the first render, never 0', () => {
    expect(renderToString(createElement(Probe, { target: 2500, land: true }))).toContain('>2500<');
  });

  it('(control) without landFirstValue the first render of a non-zero target starts from 0', () => {
    expect(renderToString(createElement(Probe, { target: 2500, land: false }))).toContain('>0<');
  });
});

describe('count-up guard', () => {
  it('no useCountUp with fromPrevious lacks landFirstValue or seed', () => {
    const problems = ROOTS.flatMap(listSources).flatMap((file) =>
      file.endsWith('useCountUp.ts') ? [] : countsFromZero(readFileSync(file, 'utf8'), path.relative(path.resolve(__dirname, '..'), file))
    );
    expect(problems).toEqual([]);
  });

  it('the guard itself catches a call that can count from zero', () => {
    expect(countsFromZero('const a = useCountUp(v, { fromPrevious: true })', 'x.tsx')).toEqual(['x.tsx:1']);
    expect(countsFromZero('const a = useCountUp(v, { fromPrevious: true, seed })', 'x.tsx')).toEqual([]);
  });
});
