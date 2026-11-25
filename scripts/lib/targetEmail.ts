/**
 * The account a maintenance script reads. Never written in the repo: it comes from the command
 * line, as `mirror:seed` does — `npm run exposure:report -- <email>` or `--email=<email>`.
 */
export function resolveTargetEmail(argv: readonly string[], scriptName: string): string {
  const args = argv.filter((a) => a !== '--');
  const flag = args.find((a) => a.startsWith('--email='));
  const value = flag ? flag.slice('--email='.length) : args.find((a) => !a.startsWith('--'));
  const email = value?.trim() ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`usage: npm run ${scriptName} -- <account email>`);
  }
  return email;
}
