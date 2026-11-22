/**
 * F03 — the weekly launchd agent (doc/backup/README.md § 8, D-BK3): Sunday (Weekday 0) at 21:00,
 * a login shell, the repository path and the log quoted even with a space or an apostrophe.
 */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { buildLaunchAgentPlist, scheduledCommand, schedulePath, shellQuote } from '@/scripts/lib/backup/schedule';

const options = { repoDir: "/Users/g/Desktop/net worth's", logFile: '/Users/g/Documents/b/backup.log', weekday: 0, hour: 21, minute: 0, path: schedulePath('/Users/g/.nvm/versions/node/v24.0.0/bin') };

describe('backup schedule', () => {
  it('quotes a shell word with an apostrophe', () => {
    expect(shellQuote("a b'c")).toBe(`'a b'\\''c'`);
  });

  it('builds a command the shell can parse, running backup:export from the repository', () => {
    const command = scheduledCommand(options);
    expect(command.startsWith(`cd '/Users/g/Desktop/net worth'\\''s'`)).toBe(true);
    expect(command).toContain('npm run --silent backup:export');
    execFileSync('bash', ['-n', '-c', command]); // throws on a syntax error
  });

  it('runs on Sunday at 21:00 under a login zsh, with the command XML-escaped', () => {
    const plist = buildLaunchAgentPlist(options);
    expect(plist).toContain('<key>Weekday</key>\n    <integer>0</integer>');
    expect(plist).toContain('<key>Hour</key>\n    <integer>21</integer>');
    expect(plist).toContain('<string>/bin/zsh</string>\n    <string>-lc</string>');
    expect(plist).toContain('&gt;&gt;');
    expect(plist).not.toMatch(/<string>[^<]*>>[^<]*<\/string>/);
  });

  it('gives the job the installing node first on its PATH (launchd has no nvm: «npm: command not found», 22/11)', () => {
    expect(schedulePath('/usr/local/bin')).toBe('/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin');
    expect(buildLaunchAgentPlist(options)).toContain('<key>PATH</key>\n    <string>/Users/g/.nvm/versions/node/v24.0.0/bin:/opt/homebrew/bin:');
  });
});
