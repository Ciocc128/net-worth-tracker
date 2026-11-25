import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Reference: a 500 answers with a fixed sentence; the cause stays in the server log. No route may
// put `error.message` (a Firestore path, a provider's text, a stack hint) in the response body.
function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === 'route.ts' ? [full] : [];
  });
}

describe('API error bodies', () => {
  it('no route returns `details` built from an error message', () => {
    const offenders = routeFiles('app/api').filter((file) =>
      /details:\s*[^,}\n]*\.message/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
