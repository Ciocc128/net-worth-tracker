/**
 * The chain of the weights — the strip under Allocazione's tabs (RU8, doc/allocazione-strategia/README.md
 * § 5.2, D-ST2): `1 Target per classe → 2 Portafoglio modello → 3 Piano di accumulo → 4 Rata del mese`,
 * each cell with its state in one figure and the link to where it is changed.
 *
 * Words and figures are born here, from what the page already read (the effective targets, the model
 * of `useModelPortfolio`, the plan of `useOpenAccumuloPlan`): no new read, and the component draws.
 * A cell whose read failed says «non letto», never «da creare» or «nessun piano»: an unread document
 * is not an empty one (lib/utils/statesNarrative.ts).
 */

import type { AssetAllocationTarget } from '@/types/assets';
import type { AccumulationPlan } from '@/types/accumulationPlan';
import type { ModelPortfolio } from '@/types/modelPortfolio';
import type { TargetSource } from '@/lib/utils/targetsDraft';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { addMonths } from '@/lib/utils/accumulationPlanUtils';
import { monthLabelLong, monthLabelShort } from '@/lib/utils/accumulationNarrative';
import { findOpenInstallment, isPlanDone } from '@/lib/utils/accumuloSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';

export type AllocationTabId = 'bilanciamento' | 'accumulo' | 'strategia';

export const ALLOCATION_TAB_IDS: readonly AllocationTabId[] = ['bilanciamento', 'accumulo', 'strategia'];

/** Anchors of the Strategia blocks, numbered as the strip (`id` of the block's wrapper). */
export const STRATEGIA_ANCHORS = { target: 'target', model: 'portafoglio-modello' } as const;

export const STRATEGIA_TARGET_HREF = `/dashboard/allocation?tab=strategia#${STRATEGIA_ANCHORS.target}`;
export const STRATEGIA_MODEL_HREF = `/dashboard/allocation?tab=strategia#${STRATEGIA_ANCHORS.model}`;
export const ACCUMULO_HREF = '/dashboard/allocation?tab=accumulo';

/** The cells each tab tints (D-ST2): what the tab shows or edits. */
const CURRENT_CELLS: Record<AllocationTabId, readonly number[]> = {
  bilanciamento: [1],
  strategia: [1, 2],
  accumulo: [3, 4],
};

export type ChainTone = 'default' | 'warning';

export interface ChainCell {
  step: 1 | 2 | 3 | 4;
  /** «Target per classe», «Rata di novembre». */
  title: string;
  /** The state in one figure: «60 · 30 · 10», «3 strumenti», «rata 3 di 12», «606 €». */
  figure: string;
  /** The same figure for the 44px row below `desktop:`: «60·30·10», «3 strum.», «3/12». */
  compactFigure: string;
  /** The line under the figure: the source, the date, the end, the purchases. */
  detail: string;
  /** `warning` on a total that does not add up: the detail line wears it. */
  tone: ChainTone;
  /** Where the cell takes the reader: the tab and, for Strategia, the block. */
  tab: Exclude<AllocationTabId, 'bilanciamento'>;
  anchor: string | null;
  href: string;
  /** The tab the reader is on shows (or edits) this step: the cell is tinted. */
  current: boolean;
  /** The link lands on the tab already open (`aria-current="page"`). */
  linksHere: boolean;
  /** The whole sentence a reader hears: «Passo 1, target per classe: 60, 30, 10, a mano. Apri Strategia». */
  ariaLabel: string;
}

export interface ChainTargetsInput {
  /** The targets the page measures against (`resolveEffectiveTargets`). */
  targets: AssetAllocationTarget | null;
  source: TargetSource;
  /** `false` while the account has never saved targets: the defaults are in force. */
  saved: boolean;
}

export interface ChainModelInput {
  model: Pick<ModelPortfolio, 'weights' | 'origin' | 'updatedAt'> | null;
  failed: boolean;
}

export interface ChainPlanInput {
  plan: AccumulationPlan | undefined;
  /** `monthIndexOf(plan, today)` (useOpenAccumuloPlan). */
  currentIndex: number;
  failed: boolean;
  /** `comparePlanToModel(plan.positions, model).count` for an active plan and a model, else `null`. */
  modelDifferenceCount: number | null;
}

export interface AllocationChainInput {
  activeTab: AllocationTabId;
  targets: ChainTargetsInput;
  model: ChainModelInput;
  plan: ChainPlanInput;
}

// ─── Words ────────────────────────────────────────────────────────────────────

const SOURCE_WORDS: Record<TargetSource, string> = {
  manual: 'a mano',
  formula: 'formula per età',
  goals: 'dai traguardi',
};

/** «62,4» — a percentage's digits without the sign, trailing zeros dropped. */
function digits(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
}

/** «23/11» — the day and month a model was saved, in Italy's calendar. */
function dayMonth(date: Date): string {
  const parts = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Rome' }).formatToParts(date);
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  return `${day}/${month}`;
}

/** The euro of a figure: whole euros, as the verdict prints the month's installment. */
const euro = (value: number): string => cachedFormatCurrencyEUR(value, true);

// ─── Cells ────────────────────────────────────────────────────────────────────

interface CellBody {
  title: string;
  figure: string;
  compactFigure: string;
  detail: string;
  tone: ChainTone;
  /** The figure as a reader hears it, when the visible one would be read badly («60 · 30 · 10»). */
  spokenFigure?: string;
}

/** The class targets above zero, heaviest first; the cash fixed in euro is outside the percentages. */
function weightedClasses(targets: AssetAllocationTarget): Array<{ label: string; pct: number }> {
  return Object.entries(targets)
    .filter(([assetClass, entry]) => !(assetClass === 'cash' && entry.useFixedAmount) && (entry.targetPercentage || 0) > 0)
    .map(([assetClass, entry]) => ({ label: ASSET_CLASS_LABELS[assetClass] ?? assetClass, pct: entry.targetPercentage }))
    .sort((a, b) => b.pct - a.pct);
}

export function buildTargetsCell(input: ChainTargetsInput): CellBody {
  const title = 'Target per classe';
  if (!input.targets) return { title, figure: '—', compactFigure: '—', detail: 'non letto', tone: 'default' };
  const classes = weightedClasses(input.targets);
  const total = classes.reduce((sum, entry) => sum + entry.pct, 0);
  const figure =
    classes.length === 0 ? 'nessun target' : classes.length > 4 ? `${classes.length} classi` : classes.map((entry) => digits(entry.pct)).join(' · ');
  const compactFigure = classes.length === 0 ? '—' : classes.length > 4 ? `${classes.length} cl.` : classes.map((entry) => digits(entry.pct)).join('·');
  const spokenFigure = classes.length > 0 && classes.length <= 4 ? classes.map((entry) => digits(entry.pct)).join(', ') : undefined;

  // The total decides before the source: a plan that does not reach 100% is the thing to fix.
  if (total < 99.995) return { title, figure, compactFigure, spokenFigure, detail: 'da completare', tone: 'warning' };
  const source = input.saved ? SOURCE_WORDS[input.source] : 'predefiniti';
  const leverage = total > 100.005 ? ` · leva ${(total / 100).toFixed(2).replace('.', ',')}×` : '';
  return { title, figure, compactFigure, spokenFigure, detail: `${source}${leverage}`, tone: 'default' };
}

export function buildModelCell(input: ChainModelInput): CellBody {
  const title = 'Portafoglio modello';
  if (input.failed) return { title, figure: 'non letto', compactFigure: '—', detail: 'la lettura non è riuscita', tone: 'default' };
  if (!input.model) return { title, figure: 'da creare', compactFigure: '—', detail: 'nessun modello salvato', tone: 'default' };
  // A row is one weight: a group of equivalent instruments counts once (AL16).
  const rows = input.model.weights.filter((weight) => weight.targetPercentage > 0).length;
  const figure = rows === 1 ? '1 strumento' : `${rows} strumenti`;
  const verb = input.model.origin === 'manual' ? 'scritto a mano' : 'calcolato';
  return { title, figure, compactFigure: `${rows} strum.`, detail: `${verb} il ${dayMonth(input.model.updatedAt)}`, tone: 'default' };
}

export function buildPlanCell(input: ChainPlanInput): CellBody {
  const title = 'Piano di accumulo';
  if (input.failed) return { title, figure: 'non letto', compactFigure: '—', detail: 'la lettura non è riuscita', tone: 'default' };
  const { plan } = input;
  if (!plan) return { title, figure: 'nessun piano', compactFigure: '—', detail: 'si crea in Accumulo', tone: 'default' };
  const lastMonth = monthLabelShort(addMonths(plan.startMonth, plan.months - 1));
  // «fino ad ago 2027», «fino a dic 2026»: the euphonic d before a vowel only.
  const end = `fino ${/^[aeiou]/i.test(lastMonth) ? 'ad' : 'a'} ${lastMonth}`;
  if (plan.status === 'draft') return { title, figure: 'bozza', compactFigure: 'bozza', detail: `da attivare, ${end}`, tone: 'default' };
  const index = Math.min(Math.max(input.currentIndex, 1), plan.months);
  const differences = input.modelDifferenceCount ?? 0;
  const detail = differences > 0 ? `differisce dal modello su ${differences}` : end;
  return { title, figure: `rata ${index} di ${plan.months}`, compactFigure: `${index}/${plan.months}`, detail, tone: 'default' };
}

export function buildInstallmentCell(input: ChainPlanInput): CellBody {
  const { plan } = input;
  if (input.failed) return { title: 'Rata del mese', figure: 'non letta', compactFigure: '—', detail: 'la lettura non è riuscita', tone: 'default' };
  if (!plan || plan.status !== 'active' || isPlanDone(plan, input.currentIndex)) {
    return { title: 'Rata del mese', figure: '—', compactFigure: '—', detail: 'nessuna rata', tone: 'default' };
  }
  const installment = findOpenInstallment(plan, input.currentIndex);
  if (!installment) return { title: 'Rata del mese', figure: '—', compactFigure: '—', detail: 'nessuna rata', tone: 'default' };
  // The lines the verdict counts (`summarizePacMonth`): a skipped line and an empty planned one are not purchases.
  const lines = installment.lines.filter((line) => line.status !== 'skipped' && (line.plannedQuantity > 0 || line.status !== 'planned'));
  const total = lines.reduce((sum, line) => sum + (line.status === 'executed' ? (line.executedAmountEur ?? line.plannedAmountEur) : line.plannedAmountEur), 0);
  const executed = lines.filter((line) => line.status === 'executed').length;
  const allClosed = installment.lines.every((line) => line.status !== 'planned');
  const purchases = lines.length === 1 ? 'acquisto registrato' : 'acquisti registrati';
  const title = `Rata di ${monthLabelLong(installment.month, false)}`;
  const detail = allClosed ? 'registrata' : `${executed} di ${lines.length} ${purchases}`;
  return { title, figure: euro(total), compactFigure: euro(total), detail, tone: 'default' };
}

// ─── The chain ────────────────────────────────────────────────────────────────

const DESTINATION: Record<ChainCell['tab'], string> = { strategia: 'Strategia', accumulo: 'Accumulo' };

export function buildAllocationChain(input: AllocationChainInput): ChainCell[] {
  const current = CURRENT_CELLS[input.activeTab];
  const bodies: Array<{ step: ChainCell['step']; body: CellBody; tab: ChainCell['tab']; anchor: string | null; href: string }> = [
    { step: 1, body: buildTargetsCell(input.targets), tab: 'strategia', anchor: STRATEGIA_ANCHORS.target, href: STRATEGIA_TARGET_HREF },
    { step: 2, body: buildModelCell(input.model), tab: 'strategia', anchor: STRATEGIA_ANCHORS.model, href: STRATEGIA_MODEL_HREF },
    { step: 3, body: buildPlanCell(input.plan), tab: 'accumulo', anchor: null, href: ACCUMULO_HREF },
    { step: 4, body: buildInstallmentCell(input.plan), tab: 'accumulo', anchor: null, href: ACCUMULO_HREF },
  ];
  return bodies.map(({ step, body, tab, anchor, href }) => ({
    step,
    title: body.title,
    figure: body.figure,
    compactFigure: body.compactFigure,
    detail: body.detail,
    tone: body.tone,
    tab,
    anchor,
    href,
    current: current.includes(step),
    linksHere: tab === input.activeTab,
    ariaLabel: `Passo ${step}, ${body.title.charAt(0).toLowerCase()}${body.title.slice(1)}: ${body.spokenFigure ?? body.figure}, ${body.detail}. Apri ${DESTINATION[tab]}`,
  }));
}
