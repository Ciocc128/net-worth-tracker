/**
 * The weekly run on the Mac (doc/backup/README.md § 8, D-BK3): a launchd agent that starts
 * `npm run backup:export` every Sunday at 21:00 (with the installing node on its PATH), writes the output to `backup.log` next to the
 * backups and shows a macOS notification with the outcome. Pure: `backupSchedule.mts` writes it.
 *
 * launchd runs a calendar job missed while the Mac SLEPT at the next wake; one missed while it was
 * OFF is skipped until the next Sunday.
 */
export const LAUNCH_AGENT_LABEL = 'com.networthtracker.backup';

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A single-quoted shell word: `it's` → `'it'\''s'`. */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export interface ScheduleOptions {
  repoDir: string;
  logFile: string;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  hour: number;
  minute: number;
  /**
   * The PATH the job runs with. launchd starts with a bare PATH, and a login zsh does not read
   * `.zshrc`, where nvm puts `node`: without it the job dies on «npm: command not found».
   * `backupSchedule.mts` passes the directory of the node that installed it, first.
   */
  path: string;
}

/** The job's PATH: the installing node's directory first, then the usual places. */
export function schedulePath(nodeBinDir: string): string {
  const dirs = [nodeBinDir, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  return [...new Set(dirs)].join(':');
}

/** The command the agent runs (a login zsh; `npm` comes from the plist's PATH, see `ScheduleOptions.path`). */
export function scheduledCommand({ repoDir, logFile }: Pick<ScheduleOptions, 'repoDir' | 'logFile'>): string {
  const notify = (text: string) => `osascript -e ${shellQuote(`display notification "${text}" with title "Net Worth Tracker"`)}`;
  return [
    `cd ${shellQuote(repoDir)}`,
    `{ echo; echo "── $(date '+%Y-%m-%d %H:%M')"; } >> ${shellQuote(logFile)}`,
    `if npm run --silent backup:export >> ${shellQuote(logFile)} 2>&1; then ${notify('Backup fatto')}; else ${notify('Backup NON riuscito: apri backup.log')}; fi`,
  ].join(' && ');
}

export function buildLaunchAgentPlist(options: ScheduleOptions): string {
  const command = scheduledCommand(options);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>${xmlEscape(command)}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xmlEscape(options.path)}</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key>
    <integer>${options.weekday}</integer>
    <key>Hour</key>
    <integer>${options.hour}</integer>
    <key>Minute</key>
    <integer>${options.minute}</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${xmlEscape(options.logFile)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(options.logFile)}</string>
</dict>
</plist>
`;
}
