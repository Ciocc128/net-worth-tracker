import { beforeEach, describe, expect, it, vi } from 'vitest';

const store: { doc: Record<string, unknown> | null } = { doc: null };
const setMock = vi.fn(async (data: Record<string, unknown>) => {
  store.doc = data;
});
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: store.doc !== null, data: () => store.doc }),
        set: setMock,
      }),
    }),
  },
}));

import { refreshMarketAnchorsIfStale } from '@/lib/server/marketAnchorsService';

const csv = (period: string, value: string) => `KEY,TIME_PERIOD,OBS_VALUE\nS,${period},${value}\n`;

function mockEcb(bodies: Record<string, { ok: boolean; body: string } | 'throw'>) {
  const fetchMock = vi.fn(async (url: string) => {
    const hit = Object.entries(bodies).find(([flow]) => url.includes(`/${flow}/`));
    const reply = hit?.[1];
    if (reply === 'throw' || !reply) throw new Error('network');
    return { ok: reply.ok, status: reply.ok ? 200 : 503, text: async () => reply.body };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('refreshMarketAnchorsIfStale (AQ35)', () => {
  beforeEach(() => {
    store.doc = null;
    setMock.mockClear();
    vi.unstubAllGlobals();
  });

  it('writes the three series, then a second call within 20 hours downloads nothing', async () => {
    const fetchMock = mockEcb({ EST: { ok: true, body: csv('2026-10-08', '2.439') }, YC: { ok: true, body: csv('2026-10-08', '3.5192') }, SPF: { ok: true, body: csv('2026-Q3', '2.0369') } });
    const t0 = new Date('2026-10-10T05:00:00Z');
    expect(await refreshMarketAnchorsIfStale(t0)).toBe(true);
    expect(store.doc).toMatchObject({ estr: { value: 2.439, date: '2026-10-08' }, aaa10y: { value: 3.5192, date: '2026-10-08' }, inflation: { value: 2.0369, period: '2026-Q3' } });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    expect(await refreshMarketAnchorsIfStale(new Date(t0.getTime() + 19 * 3600_000))).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await refreshMarketAnchorsIfStale(new Date(t0.getTime() + 21 * 3600_000))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('a failed series keeps its previous value while the others update, and nothing throws', async () => {
    store.doc = { estr: { value: 2.0, date: '2026-09-01' }, aaa10y: { value: 3.0, date: '2026-09-01' }, fetchedAt: '2026-09-01T00:00:00.000Z' };
    mockEcb({ EST: 'throw', YC: { ok: true, body: csv('2026-10-08', '3.5192') }, SPF: { ok: false, body: '' } });
    await expect(refreshMarketAnchorsIfStale(new Date('2026-10-10T05:00:00Z'))).resolves.toBe(true);
    expect(store.doc).toMatchObject({ estr: { value: 2.0, date: '2026-09-01' }, aaa10y: { value: 3.5192, date: '2026-10-08' } });
    expect(store.doc).not.toHaveProperty('inflation');
  });

  it('an out-of-range reading is discarded', async () => {
    mockEcb({ EST: { ok: true, body: csv('2026-10-08', '99') }, YC: { ok: true, body: csv('2026-10-08', '3.5') }, SPF: { ok: true, body: csv('2026-Q3', '2.0') } });
    await refreshMarketAnchorsIfStale(new Date('2026-10-10T05:00:00Z'));
    expect(store.doc).not.toHaveProperty('estr');
    expect(store.doc).toHaveProperty('aaa10y');
  });
});
