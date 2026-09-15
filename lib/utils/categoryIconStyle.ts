import type { ExpenseCategory } from '@/types/expenses';

/**
 * Colours of a category's icon badge (Tracciamento's rows, a movement's detail, the table).
 *
 * The badge normally wears the colour the user saved on the category: a 12% wash behind the icon
 * and the colour itself on the glyph. A theme can take that over by setting `--category-icon` and
 * `--category-icon-bg`; both are deliberately NOT declared in `:root`, so everywhere else the
 * `var(…, fallback)` resolves to the saved colour exactly as before. Lime Frost light sets them to
 * its neutrals: five saved hues down a feed competed with the income green and the spending ice
 * blue (2026-09-14 consistency pass). Its dark block resets them to `initial`, which makes the
 * variable invalid and brings the fallback back.
 */
export function categoryIconBackground(color?: string | null): string {
  return `var(--category-icon-bg, ${color ? `${color}20` : 'var(--muted)'})`;
}

export function categoryIconColor(color?: string | null): string {
  return `var(--category-icon, ${color || 'var(--muted-foreground)'})`;
}

/**
 * The colour a category's badge wears in Impostazioni once the 50/30/20 roles are on: the role's
 * token (income the income flow), never the hue the user saved — the saved hue is shown nowhere
 * else in Lime Frost, so the settings list must not promise it (owner, 2026-09-15). A spending
 * category without a role is «Da classificare». Null with the roles off: the saved colour stays.
 */
export function categoryRoleColor(
  category: Pick<ExpenseCategory, 'type' | 'spendingRole'>,
  rolesEnabled: boolean,
): string | null {
  if (!rolesEnabled) return null;
  if (category.type === 'income') return 'var(--flow-in)';
  if (category.spendingRole === 'need') return 'var(--role-need)';
  if (category.spendingRole === 'want') return 'var(--role-want)';
  if (category.spendingRole === 'saving') return 'var(--role-saving)';
  return 'var(--role-unclassified)';
}
