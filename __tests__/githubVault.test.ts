/**
 * The vault's GitHub client (lib/server/wiki/githubVault.ts) against a simulated API: reads,
 * the one-commit write through the Git Data API, and the rebuild on a fresh head when the owner
 * pushed from Obsidian in between. Nothing leaves the process.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createVaultClient, readVaultConfig } from '@/lib/server/wiki/githubVault';

const config = { token: 'tok', repo: 'owner/finance-wiki', branch: 'main' };
const fetchMock = vi.fn();
const calls = () => fetchMock.mock.calls.map(([url, init]) => `${(init as RequestInit).method} ${String(url).replace('https://api.github.com/repos/owner/finance-wiki', '')}`);
const json = (status: number, body: unknown) => new Response(body === null ? '' : JSON.stringify(body), { status });

beforeEach(() => fetchMock.mockReset());

describe('readVaultConfig', () => {
  it('is null unless both the token and an owner/name repo are set', () => {
    expect(readVaultConfig({})).toBeNull();
    expect(readVaultConfig({ WIKI_GITHUB_TOKEN: 't' })).toBeNull();
    expect(readVaultConfig({ WIKI_GITHUB_TOKEN: 't', WIKI_GITHUB_REPO: 'no-slash' })).toBeNull();
    expect(readVaultConfig({ WIKI_GITHUB_TOKEN: 't', WIKI_GITHUB_REPO: 'a/b' })).toEqual({ token: 't', repo: 'a/b', branch: 'main' });
    expect(readVaultConfig({ WIKI_GITHUB_TOKEN: 't', WIKI_GITHUB_REPO: 'a/b', WIKI_GITHUB_BRANCH: 'dev' })?.branch).toBe('dev');
  });
});

describe('reads', () => {
  it('decodes a file, and answers null for a missing one', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { encoding: 'base64', content: Buffer.from('ciao è').toString('base64') }))
      .mockResolvedValueOnce(json(404, { message: 'Not Found' }));
    const vault = createVaultClient(config, fetchMock);
    expect(await vault.readFile('wiki/index.md')).toBe('ciao è');
    expect(await vault.readFile('raw/thebull/2026-01-01.md')).toBeNull();
    expect(calls()).toEqual(['GET /contents/wiki/index.md?ref=main', 'GET /contents/raw/thebull/2026-01-01.md?ref=main']);
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
  });

  it('lists a directory, [] when it does not exist, and throws on anything else', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, [{ name: '2026-W24.json' }, { name: '2026-W24.md' }]))
      .mockResolvedValueOnce(json(404, null))
      .mockResolvedValueOnce(json(401, { message: 'Bad credentials' }));
    const vault = createVaultClient(config, fetchMock);
    expect(await vault.listDir('wiki/macro/settimane')).toEqual(['2026-W24.json', '2026-W24.md']);
    expect(await vault.listDir('wiki/nope')).toEqual([]);
    await expect(vault.listDir('wiki')).rejects.toThrow('[vault] list wiki failed with HTTP 401');
  });
});

function commitSequence(head: string, refStatus = 200) {
  fetchMock
    .mockResolvedValueOnce(json(200, { object: { sha: head } }))
    .mockResolvedValueOnce(json(200, { tree: { sha: `tree-of-${head}` } }))
    .mockResolvedValueOnce(json(201, { sha: 'new-tree' }))
    .mockResolvedValueOnce(json(201, { sha: `commit-on-${head}` }))
    .mockResolvedValueOnce(json(refStatus, refStatus === 200 ? {} : { message: 'Update is not a fast forward' }));
}

describe('commit', () => {
  it('writes every file in ONE commit on top of the head, never forced', async () => {
    commitSequence('h1');
    const vault = createVaultClient(config, fetchMock);
    const result = await vault.commit('ingest: thebull/2026-06-14', async () => [
      { path: 'raw/thebull/2026-06-14.md', content: 'grezzo' },
      { path: 'log.md', content: '# Log\n' },
    ]);
    expect(result).toEqual({ sha: 'commit-on-h1' });
    expect(calls()).toEqual(['GET /git/ref/heads/main', 'GET /git/commits/h1', 'POST /git/trees', 'POST /git/commits', 'PATCH /git/refs/heads/main']);
    const body = (i: number) => JSON.parse((fetchMock.mock.calls[i][1] as RequestInit).body as string);
    expect(body(2)).toEqual({
      base_tree: 'tree-of-h1',
      tree: [
        { path: 'raw/thebull/2026-06-14.md', mode: '100644', type: 'blob', content: 'grezzo' },
        { path: 'log.md', mode: '100644', type: 'blob', content: '# Log\n' },
      ],
    });
    expect(body(3)).toEqual({ message: 'ingest: thebull/2026-06-14', tree: 'new-tree', parents: ['h1'] });
    expect(body(4)).toEqual({ sha: 'commit-on-h1', force: false });
  });

  it('rebuilds the files on the new head when the branch moved, once', async () => {
    commitSequence('h1', 422);
    commitSequence('h2');
    const build = vi.fn(async () => [{ path: 'log.md', content: 'x' }]);
    const vault = createVaultClient(config, fetchMock);
    expect(await vault.commit('m', build)).toEqual({ sha: 'commit-on-h2' });
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('gives up after the second conflict', async () => {
    commitSequence('h1', 422);
    commitSequence('h2', 422);
    const vault = createVaultClient(config, fetchMock);
    await expect(vault.commit('m', async () => [{ path: 'log.md', content: 'x' }])).rejects.toThrow('the branch moved');
  });

  it('commits nothing when there is nothing to write', async () => {
    const vault = createVaultClient(config, fetchMock);
    expect(await vault.commit('m', async () => [])).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never echoes a GitHub error body, which can carry the vault text', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { object: { sha: 'h1' } }))
      .mockResolvedValueOnce(json(200, { tree: { sha: 't' } }))
      .mockResolvedValueOnce(json(400, { message: 'contenuto segreto del vault' }));
    const vault = createVaultClient(config, fetchMock);
    const error = await vault.commit('m', async () => [{ path: 'a', content: 'b' }]).catch((e: Error) => e);
    expect((error as Error).message).toBe('[vault] create tree failed with HTTP 400');
  });
});
