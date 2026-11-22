/**
 * Installs, shows or removes the weekly backup on the Mac (doc/backup/README.md § 8).
 *
 *   npm run backup:schedule              # every Sunday at 21:00 (launchd agent, this checkout)
 *   npm run backup:schedule -- --status  # is it installed, and the last lines of backup.log
 *   npm run backup:schedule -- --remove  # uninstall
 *   npm run backup:schedule -- --now     # run the installed job once, right away
 *
 * macOS only. The agent runs `npm run backup:export` from THIS folder, so moving the checkout means
 * running it again. The log is `backup.log` in the backup folder (BACKUP_DIR or the default).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import path from 'node:path';
import { LAUNCH_AGENT_LABEL, buildLaunchAgentPlist, schedulePath } from './lib/backup/schedule';

const plistPath = path.join(homedir(), 'Library', 'LaunchAgents', `${LAUNCH_AGENT_LABEL}.plist`);
const domain = `gui/${userInfo().uid}`;

function launchctl(...args: string[]): boolean {
  try {
    execFileSync('launchctl', args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function backupDir(): Promise<string> {
  const nextEnvModule = (await import('@next/env')) as { default?: { loadEnvConfig(dir: string): unknown }; loadEnvConfig?(dir: string): unknown };
  (nextEnvModule.default ?? nextEnvModule).loadEnvConfig!(process.cwd());
  const dir = process.env.BACKUP_DIR ?? path.join(homedir(), 'Documents', 'net-worth-tracker-backup');
  return dir === '~' || dir.startsWith('~/') ? path.join(homedir(), dir.slice(1)) : path.resolve(dir);
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('backup:schedule uses launchd: it runs on the Mac only.');
  const arg = process.argv[2];
  const dir = await backupDir();
  const logFile = path.join(dir, 'backup.log');

  if (arg === '--remove') {
    launchctl('bootout', `${domain}/${LAUNCH_AGENT_LABEL}`);
    if (existsSync(plistPath)) await unlink(plistPath);
    console.info('✓ backup settimanale tolto');
    return;
  }
  if (arg === '--status') {
    const loaded = launchctl('print', `${domain}/${LAUNCH_AGENT_LABEL}`);
    console.info(`agente: ${existsSync(plistPath) ? plistPath : 'non installato'}${loaded ? ' (attivo)' : ''}`);
    if (existsSync(logFile)) console.info(`\nultime righe di ${logFile}:\n${readFileSync(logFile, 'utf8').split('\n').slice(-15).join('\n')}`);
    return;
  }
  if (arg === '--now') {
    if (!launchctl('kickstart', `${domain}/${LAUNCH_AGENT_LABEL}`)) throw new Error('agent not installed: run npm run backup:schedule first.');
    console.info(`✓ avviato: l'esito arriva come notifica e in ${logFile}`);
    return;
  }
  if (arg) throw new Error('usage: npm run backup:schedule [-- --status | --remove | --now]');

  await mkdir(dir, { recursive: true, mode: 0o700 });
  await mkdir(path.dirname(plistPath), { recursive: true });
  await writeFile(plistPath, buildLaunchAgentPlist({ repoDir: process.cwd(), logFile, weekday: 0, hour: 21, minute: 0, path: schedulePath(path.dirname(process.execPath)) }));
  launchctl('bootout', `${domain}/${LAUNCH_AGENT_LABEL}`);
  if (!launchctl('bootstrap', domain, plistPath)) throw new Error(`launchctl bootstrap failed for ${plistPath}`);
  console.info(`✓ backup ogni domenica alle 21:00 da ${process.cwd()}\n  log: ${logFile}\n  prova subito: npm run backup:schedule -- --now`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
