/**
 * What a deletion must refresh (doc/cancellazione-strumenti/README.md § 4.4, AU16): the asset, and
 * every collection the cleanups and the ledger choice write — the registry, the pension
 * contributions, the dividend receipts, the plans, the model, the settings, the goals and the
 * Panoramica. A new write on the server side adds its key here.
 */
import { describe, expect, it } from 'vitest';
import { assetDeletionInvalidationKeys } from '@/lib/hooks/useAssets';

describe('assetDeletionInvalidationKeys', () => {
  it('AU16 — names the nine keys the deletion can change, owner first', () => {
    expect(assetDeletionInvalidationKeys('u1')).toEqual([
      ['assets', 'u1'],
      ['asset-transactions', 'u1'],
      ['pension-contributions', 'u1'],
      ['dividend-receipts', 'u1'],
      ['accumulation-plans', 'u1'],
      ['model-portfolio', 'u1'],
      ['settings', 'u1'],
      ['goal-data', 'u1'],
      ['dashboard', 'overview', 'u1'],
    ]);
  });
});
