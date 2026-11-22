/**
 * The weekly run on the Mac (doc/backup/README.md § 8, D-BK3): a launchd agent that starts
 * `npm run backup:export` every Sunday at 21:00, writes the output to `backup.log` next to the
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
}

/** The command the agent runs, in a LOGIN shell so `npm` is on the PATH (Homebrew, nvm). */
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
