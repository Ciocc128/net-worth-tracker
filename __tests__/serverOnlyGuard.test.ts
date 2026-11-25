import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Reference: a module that holds the Admin key, the cron secret or a provider key must fail the
// build if a Client Component ever imports it, so each carries the `server-only` guard.
const GUARDED = [
  'lib/firebase/admin.ts',
  'lib/server/apiAuth.ts',
  'lib/server/assistant/anthropicStream.ts',
  'lib/server/weeklyBudgetEmailService.ts',
  'lib/server/ecbRatesService.ts',
];

describe('server-only guard', () => {
  it.each(GUARDED)('%s imports server-only', (file) => {
    expect(readFileSync(file, 'utf8')).toMatch(/^import 'server-only';/m);
  });
});
