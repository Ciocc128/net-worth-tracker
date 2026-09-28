import 'server-only';

/**
 * The vault is a private GitHub repo (doc/ai-open-models-wiki.md § 5.1); the server reaches it
 * through the REST API with a fine-grained token scoped to that repo alone (contents: write).
 *
 * Writes are ONE commit per operation, built with the Git Data API (tree → commit → ref), so a
 * raw file, its week page and the log line land together or not at all. The owner commits to the
 * same branch from Obsidian: when the ref moved in between, the update is rejected as a non
 * fast-forward and the whole operation is rebuilt on the new head, once.
 */

export interface VaultConfig {
  token: string;
  /** `owner/name`. */
  repo: string;
  branch: string;
}

export interface VaultFile {
  path: string;
  content: string;
}

export class VaultConflictError extends Error {}

const API = 'https://api.github.com';

/** The vault's settings from the environment, or null when any is missing (the feature is off). */
export function readVaultConfig(env: Record<string, string | undefined> = process.env): VaultConfig | null {
  const token = env.WIKI_GITHUB_TOKEN;
  const repo = env.WIKI_GITHUB_REPO;
  if (!token || !repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  return { token, repo, branch: env.WIKI_GITHUB_BRANCH || 'main' };
}

export interface VaultClient {
  /** The file's text, or null when it does not exist. */
  readFile(path: string): Promise<string | null>;
  /** The names of a directory's entries, or [] when it does not exist. */
  listDir(path: string): Promise<string[]>;
  /**
   * Commits the files `build` returns, reading through the client it is given. `build` runs
   * again on a fresh head when someone else pushed in between; an empty list commits nothing.
   */
  commit(message: string, build: () => Promise<VaultFile[]>): Promise<{ sha: string } | null>;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function createVaultClient(config: VaultConfig, fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args)): VaultClient {
  async function request<T>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T | null }> {
    const response = await fetchImpl(`${API}/repos/${config.repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    });
    const text = await response.text();
    return { status: response.status, json: text ? (JSON.parse(text) as T) : null };
  }

  function fail(what: string, status: number): never {
    // The status only: a GitHub error body can echo the request, and the request can hold the vault's text.
    throw new Error(`[vault] ${what} failed with HTTP ${status}`);
  }

  async function readFile(path: string): Promise<string | null> {
    const { status, json } = await request<{ content?: string; encoding?: string }>(
      'GET',
      `/contents/${encodePath(path)}?ref=${encodeURIComponent(config.branch)}`
    );
    if (status === 404) return null;
    if (status !== 200 || !json || json.encoding !== 'base64' || typeof json.content !== 'string') fail(`read ${path}`, status);
    return Buffer.from(json.content, 'base64').toString('utf8');
  }

  async function listDir(path: string): Promise<string[]> {
    const { status, json } = await request<Array<{ name: string }>>(
      'GET',
      `/contents/${encodePath(path)}?ref=${encodeURIComponent(config.branch)}`
    );
    if (status === 404) return [];
    if (status !== 200 || !Array.isArray(json)) fail(`list ${path}`, status);
    return json.map((entry) => entry.name);
  }

  async function commitOnce(message: string, files: VaultFile[]): Promise<{ sha: string }> {
    const ref = await request<{ object: { sha: string } }>('GET', `/git/ref/heads/${encodeURIComponent(config.branch)}`);
    if (ref.status !== 200 || !ref.json) fail('read ref', ref.status);
    const head = ref.json.object.sha;

    const commit = await request<{ tree: { sha: string } }>('GET', `/git/commits/${head}`);
    if (commit.status !== 200 || !commit.json) fail('read head commit', commit.status);

    const tree = await request<{ sha: string }>('POST', '/git/trees', {
      base_tree: commit.json.tree.sha,
      tree: files.map((file) => ({ path: file.path, mode: '100644', type: 'blob', content: file.content })),
    });
    if (tree.status !== 201 || !tree.json) fail('create tree', tree.status);

    const created = await request<{ sha: string }>('POST', '/git/commits', {
      message,
      tree: tree.json.sha,
      parents: [head],
    });
    if (created.status !== 201 || !created.json) fail('create commit', created.status);

    const update = await request('PATCH', `/git/refs/heads/${encodeURIComponent(config.branch)}`, {
      sha: created.json.sha,
      force: false,
    });
    if (update.status === 422 || update.status === 409) throw new VaultConflictError('the branch moved');
    if (update.status !== 200) fail('update ref', update.status);
    return { sha: created.json.sha };
  }

  async function commit(message: string, build: () => Promise<VaultFile[]>): Promise<{ sha: string } | null> {
    for (let attempt = 0; ; attempt++) {
      const files = await build();
      if (files.length === 0) return null;
      try {
        return await commitOnce(message, files);
      } catch (error) {
        if (!(error instanceof VaultConflictError) || attempt >= 1) throw error;
      }
    }
  }

  return { readFile, listDir, commit };
}
