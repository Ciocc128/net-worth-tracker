import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// UM4 P16: ONE hover wash on rows and surfaces, `hover:bg-muted/40`. Four near-identical steps
// (30/40/50/60) read as an inconsistency, never as a hierarchy.
const ALLOWED = new Set(['40']);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(path);
  }
  return out;
}

describe('hover:bg-muted steps', () => {
  it('only /40 is allowed in components, app and lib', () => {
    const offenders: string[] = [];
    for (const root of ['components', 'app', 'lib']) {
      for (const file of sourceFiles(join(process.cwd(), root))) {
        for (const m of readFileSync(file, 'utf8').matchAll(/hover:bg-muted\/(\d+)/g)) {
          if (!ALLOWED.has(m[1])) offenders.push(`${file}: hover:bg-muted/${m[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
