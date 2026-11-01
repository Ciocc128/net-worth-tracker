/**
 * A periodic recap email by hand, for a month the app's button cannot reach (it sends the CURRENT month).
 *
 *   npm run email:period -- 2026-10 --preview                 # writes scratchpad/email-2026-10.html, sends NOTHING
 *   npm run email:period -- 2026-10 --send                    # sends it to the saved recipients
 *   npm run email:period -- 2026-09 --type quarterly --send   # Q3 (the month is the quarter's last)
 *   npm run email:period -- 2026-10 --preview --email <address>
 *
 * Reads PRODUCTION with the Admin credentials of `.env.local`, the same path as the cron
 * (`buildAndSendForPeriod` in lib/server/monthlyEmailService.ts): data, comparison, AI comment
 * (`OPENROUTER_API_KEY`; without it the email has no comment), HTML. `--send` also needs
 * `RESEND_API_KEY` and `RESEND_FROM_EMAIL`. Whose data: `--email <address>`, else `WIKI_EXPORT_UID`.
 * One of `--preview` / `--send` is required: nothing is sent by default.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { adminAuth } from '@/lib/firebase/admin';
import {
  buildPeriodEmailData,
  generateEmailAiComment,
  generateEmailHtml,
  getSettingsAdmin,
  sendMonthlyEmail,
  type EmailPeriodType,
} from '@/lib/server/monthlyEmailService';
import { buildPeriodComparison } from '@/lib/server/emailPeriodComparison';

const args = process.argv.slice(2);
const valueOf = (flag: string) => {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
};
const preview = args.includes('--preview');
const send = args.includes('--send');
const email = valueOf('--email');
const type = (valueOf('--type') ?? 'monthly') as EmailPeriodType;
const flagValues = new Set([email, valueOf('--type')]);
const positional = args.filter((a) => !a.startsWith('--') && !flagValues.has(a));

if (preview === send) throw new Error('pass exactly one of --preview (writes an HTML file) or --send (emails it)');
if (!['monthly', 'quarterly', 'semiannual', 'yearly'].includes(type)) throw new Error(`unknown --type ${type}`);
const match = /^(\d{4})-(\d{2})$/.exec(positional[0] ?? '');
if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) throw new Error('pass the period as YYYY-MM (e.g. 2026-10)');
const year = Number(match[1]);
const month = Number(match[2]);

const uid = email ? (await adminAuth.getUserByEmail(email)).uid : process.env.WIKI_EXPORT_UID;
if (!uid) throw new Error('WIKI_EXPORT_UID is not set: pass --email <address>');

const settings = await getSettingsAdmin(uid);
const recipients = settings?.monthlyEmailRecipients ?? [];
if (send && recipients.length === 0) throw new Error('no recipients saved in Impostazioni');
if (send && !process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is empty in .env.local');

const data = await buildPeriodEmailData(uid, year, month, type);
if (!data) throw new Error(`no snapshot for ${type} ${positional[0]}`);

const comparison = await buildPeriodComparison(uid, data).catch((error) => {
  console.warn('[email] comparison failed, the email goes without it:', error);
  return undefined;
});
if (comparison) {
  if (!process.env.OPENROUTER_API_KEY) console.warn('[email] OPENROUTER_API_KEY is empty: no AI comment');
  const comment = await generateEmailAiComment(uid, data, comparison);
  if (comment) data.aiComment = comment;
  else console.warn('[email] no AI comment (failed or skipped)');
}

if (preview) {
  mkdirSync('scratchpad', { recursive: true });
  const path = `scratchpad/email-${type}-${positional[0]}.html`;
  writeFileSync(path, generateEmailHtml(data, comparison));
  console.info(`[email] preview written to ${path} · comment ${data.aiComment ? 'yes' : 'no'} · nothing sent`);
} else {
  await sendMonthlyEmail(recipients, data, comparison);
  console.info(`[email] sent ${type} ${positional[0]} to ${recipients.length} recipient(s) · comment ${data.aiComment ? 'yes' : 'no'}`);
}
process.exit(0);
