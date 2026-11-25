import { describe, expect, it } from 'vitest';
import { resolveTargetEmail } from '@/scripts/lib/targetEmail';

// Reference: the script receives the address on the command line; nothing is read from the repo.
describe('resolveTargetEmail', () => {
  it('reads a positional argument', () => {
    expect(resolveTargetEmail(['mario@example.com'], 'exposure:report')).toBe('mario@example.com');
  });
  it('reads --email= and skips a stray --', () => {
    expect(resolveTargetEmail(['--', '--email=anna@example.com'], 'exposure:report')).toBe('anna@example.com');
  });
  it('refuses to run without an address (no default hard-coded)', () => {
    expect(() => resolveTargetEmail([], 'exposure:refresh')).toThrow('usage: npm run exposure:refresh');
  });
  it('refuses a value that is not an address', () => {
    expect(() => resolveTargetEmail(['nonsense'], 'exposure:report')).toThrow('usage');
  });
});
