/**
 * Typed confirmation before a script WRITES to production (F11 S1, doc/sicurezza/S3-regole.md).
 * The Admin key in `.env.local` bypasses every rule, so a mistyped command must not be enough:
 * the person types the production project id. A non-interactive shell never confirms.
 */
import { createInterface } from 'node:readline/promises';

export async function confirmProductionWrite(projectId: string, what: string): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error(`${what} writes to PRODUCTION (${projectId}) and needs a typed confirmation: run it from a terminal.`);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`⚠ ${what} writes to PRODUCTION (${projectId}). Type the project id to continue: `);
    if (answer.trim() !== projectId) throw new Error('confirmation not matched: nothing was written.');
  } finally {
    rl.close();
  }
}
