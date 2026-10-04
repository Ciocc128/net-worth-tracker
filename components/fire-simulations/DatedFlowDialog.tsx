'use client';

/**
 * «Aggiungi un flusso» — one dated flow of the FIRE plan (doc/fire-ipotesi/README.md § 12.7): a name, a kind (recurring
 * expense or income, a lump in or out), an amount, a start (a year, an age, or the FIRE year + N), a duration. The modal is
 * a tile lifted off the page (The Modal-Is-A-Tile Rule): the reading under the title says what the flow does, the rules
 * come from `datedFlowValidation` — the same ones the save runs — and speak where they failed.
 *
 * It edits a DRAFT: «Salva» in the dialog puts the flow in the Calcolatore's list (a preview), «Salva» of Parametri
 * writes it. A mortgage-linked flow is not edited here (its figures come from Patrimonio): the dialog only renames it.
 */
import { useId, useState } from 'react';
import type { DatedFlow, DatedFlowKind } from '@/types/assets';
import { validateDatedFlow } from '@/lib/utils/datedFlowValidation';
import { FLOW_KIND_LABEL } from '@/lib/utils/datedFlowsNarrative';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

type Anchor = 'year' | 'age' | 'fire';

interface Draft {
  label: string;
  kind: DatedFlowKind;
  amount: string;
  fixed: boolean;
  anchor: Anchor;
  startValue: string;
  forever: boolean;
  duration: string;
  inCashflow: boolean;
}

const KINDS: DatedFlowKind[] = ['expense', 'income', 'lumpIn', 'lumpOut'];
const isRecurring = (kind: DatedFlowKind): boolean => kind === 'expense' || kind === 'income';

function toDraft(flow: DatedFlow | null, currentYear: number): Draft {
  if (!flow) return { label: '', kind: 'expense', amount: '', fixed: false, anchor: 'year', startValue: String(currentYear + 1), forever: false, duration: '10', inCashflow: true };
  const { start } = flow;
  return {
    label: flow.label,
    kind: flow.kind,
    amount: String(flow.amount),
    fixed: !flow.indexed,
    anchor: start.anchor,
    startValue: String(start.anchor === 'year' ? start.year : start.anchor === 'age' ? start.age : start.afterYears),
    forever: flow.durationYears === null,
    duration: String(flow.durationYears ?? 10),
    inCashflow: flow.inCashflowToday !== false,
  };
}

/** The flow a draft describes, or the sentence that says what is wrong with it. */
function fromDraft(draft: Draft, base: DatedFlow | null, currentYear: number, userAge: number | undefined): { flow: DatedFlow } | { problem: string } {
  const recurring = isRecurring(draft.kind);
  const startNumber = Number(draft.startValue.replace(',', '.'));
  const anchor: Anchor = recurring ? draft.anchor : draft.anchor === 'fire' ? 'year' : draft.anchor;
  if (draft.startValue.trim() === '' || !Number.isFinite(startNumber)) return { problem: anchor === 'year' ? "Scrivi l'anno di inizio." : anchor === 'age' ? "Scrivi l'età di inizio." : 'Scrivi gli anni dopo il FIRE.' };
  if (anchor === 'age' && userAge === undefined) return { problem: "Per partire a una certa età serve la tua età: scrivila in Coast FIRE › Ipotesi." };
  const amount = Number(draft.amount.replace(',', '.'));
  if (draft.amount.trim() === '' || !Number.isFinite(amount)) return { problem: "Scrivi l'importo." };
  const duration = draft.forever ? null : Number(draft.duration.replace(',', '.'));
  if (recurring && duration !== null && (draft.duration.trim() === '' || !Number.isFinite(duration))) return { problem: 'Scrivi per quanti anni dura, oppure scegli "per sempre".' };
  const flow: DatedFlow = {
    id: base?.id ?? crypto.randomUUID(),
    label: draft.label.trim(),
    kind: draft.kind,
    amount,
    indexed: !draft.fixed,
    start: anchor === 'year' ? { anchor: 'year', year: startNumber } : anchor === 'age' ? { anchor: 'age', age: startNumber } : { anchor: 'fire', afterYears: startNumber },
    durationYears: recurring ? duration : null,
  };
  if (recurring && anchor !== 'fire') {
    const startsToday = anchor === 'year' ? startNumber <= currentYear : userAge !== undefined && startNumber <= userAge;
    if (startsToday) flow.inCashflowToday = draft.inCashflow;
  }
  const problem = validateDatedFlow(flow, currentYear);
  return problem ? { problem } : { flow };
}

interface DatedFlowDialogProps {
  open: boolean;
  onClose: () => void;
  /** The flow being edited; null = a new one. */
  flow: DatedFlow | null;
  currentYear: number;
  userAge: number | undefined;
  isDemo: boolean;
  onSave: (flow: DatedFlow) => void;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
}

export function DatedFlowDialog({ open, onClose, flow, currentYear, userAge, isDemo, onSave, returnFocusTo }: DatedFlowDialogProps) {
  const uid = useId();
  const [draft, setDraft] = useState<Draft>(() => toDraft(flow, currentYear));
  const [problem, setProblem] = useState<string | null>(null);
  // Reseeded on each opening during render (the dialogs' pattern): a setState in an effect would cascade a render.
  const [seededOpen, setSeededOpen] = useState(open);
  if (open !== seededOpen) {
    setSeededOpen(open);
    if (open) {
      setDraft(toDraft(flow, currentYear));
      setProblem(null);
    }
  }

  const linked = flow?.source?.kind === 'mortgage';
  const recurring = isRecurring(draft.kind);
  const anchor: Anchor = recurring ? draft.anchor : draft.anchor === 'fire' ? 'year' : draft.anchor;
  const patch = (next: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, ...next }));
    setProblem(null);
  };
  const startNumber = Number(draft.startValue);
  const activeToday = recurring && anchor !== 'fire' && Number.isFinite(startNumber) && (anchor === 'year' ? startNumber <= currentYear : userAge !== undefined && startNumber <= userAge);

  const submit = () => {
    if (linked && flow) {
      if (draft.label.trim() === '' || draft.label.length > 60) return setProblem('Il nome deve avere da 1 a 60 caratteri.');
      onSave({ ...flow, label: draft.label.trim() });
      return onClose();
    }
    const result = fromDraft(draft, flow, currentYear, userAge);
    if ('problem' in result) return setProblem(result.problem);
    onSave(result.flow);
    onClose();
  };

  const startLabel = anchor === 'year' ? 'Anno di inizio' : anchor === 'age' ? 'Età di inizio' : 'Anni dopo il FIRE';
  const reading = problem
    ? { narrative: [{ text: problem }], tone: 'negative' as const }
    : { narrative: [{ text: linked ? 'La rata e la fine vengono dal mutuo in Patrimonio: qui puoi solo cambiare il nome.' : 'Importi netti, in euro di oggi se non sono fissi. Ogni flusso arriva a fine anno.' }], tone: 'neutral' as const };

  const footer = (
    <>
      <Button type="button" variant="outline" onClick={onClose}>
        Annulla
      </Button>
      <Button type="submit" form={`${uid}-form`} disabled={isDemo}>
        {flow ? 'Aggiorna' : 'Aggiungi'}
      </Button>
    </>
  );

  return (
    <ResponsiveModal open={open} onClose={onClose} eyebrow="Parametri · Flussi nel tempo" title={flow ? 'Modifica il flusso' : 'Aggiungi un flusso'} reading={reading} width="md" footer={footer} returnFocusTo={returnFocusTo}>
      <form
        id={`${uid}-form`}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="space-y-4"
        noValidate
      >
        <div className="space-y-2">
          <Label htmlFor={`${uid}-label`}>Nome</Label>
          <Input id={`${uid}-label`} value={draft.label} maxLength={60} onChange={(event) => patch({ label: event.target.value })} placeholder="Mutuo, un figlio, un'eredità…" disabled={isDemo} />
        </div>

        {!linked && (
          <>
            <div className="space-y-2">
              <Label htmlFor={`${uid}-kind`}>Tipo</Label>
              <Select value={draft.kind} onValueChange={(value) => patch({ kind: value as DatedFlowKind })} disabled={isDemo}>
                <SelectTrigger id={`${uid}-kind`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {FLOW_KIND_LABEL[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${uid}-amount`}>{recurring ? 'Importo (€ l\'anno)' : 'Importo (€)'}</Label>
              <Input id={`${uid}-amount`} type="number" inputMode="decimal" step="100" value={draft.amount} onChange={(event) => patch({ amount: event.target.value })} disabled={isDemo} className="font-mono tabular-nums" />
            </div>

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Label htmlFor={`${uid}-fixed`} className="text-[13px] leading-normal">
                  Importo fisso, non rivalutato
                </Label>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">Per una rata a tasso fisso. Un importo fisso ha bisogno di una fine.</p>
              </div>
              <Switch id={`${uid}-fixed`} checked={draft.fixed} onCheckedChange={(checked) => patch({ fixed: checked, ...(checked && recurring && draft.forever ? { forever: false } : {}) })} disabled={isDemo} className="mt-0.5 shrink-0" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${uid}-anchor`}>Inizio</Label>
                <Select value={anchor} onValueChange={(value) => patch({ anchor: value as Anchor })} disabled={isDemo}>
                  <SelectTrigger id={`${uid}-anchor`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="year">Anno</SelectItem>
                    <SelectItem value="age">Età</SelectItem>
                    {recurring && <SelectItem value="fire">Dal FIRE</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${uid}-start`}>{startLabel}</Label>
                <Input id={`${uid}-start`} type="number" inputMode="numeric" step="1" value={draft.startValue} onChange={(event) => patch({ startValue: event.target.value })} disabled={isDemo} className="font-mono tabular-nums" />
              </div>
            </div>
            {anchor === 'age' && userAge === undefined && <p className="text-[11px] leading-[1.4] text-muted-foreground">Serve la tua età: scrivila in Coast FIRE › Ipotesi.</p>}

            {recurring && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor={`${uid}-duration`}>Durata (anni)</Label>
                  <span className="flex items-center gap-2 text-[13px]">
                    <Label htmlFor={`${uid}-forever`} className="text-[13px] font-normal">
                      per sempre
                    </Label>
                    <Switch id={`${uid}-forever`} checked={draft.forever} onCheckedChange={(checked) => patch({ forever: checked })} disabled={isDemo || draft.fixed} />
                  </span>
                </div>
                <Input id={`${uid}-duration`} type="number" inputMode="numeric" step="1" min="1" value={draft.duration} onChange={(event) => patch({ duration: event.target.value })} disabled={isDemo || draft.forever} className="font-mono tabular-nums" />
              </div>
            )}

            {activeToday && (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Label htmlFor={`${uid}-cashflow`} className="text-[13px] leading-normal">
                    Già nel Cashflow di oggi
                  </Label>
                  <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">Il risparmio di oggi lo contiene già, e la spesa del piano quando viene dal Cashflow: il flusso toglie solo il cambiamento.</p>
                </div>
                <Switch id={`${uid}-cashflow`} checked={draft.inCashflow} onCheckedChange={(checked) => patch({ inCashflow: checked })} disabled={isDemo} className="mt-0.5 shrink-0" />
              </div>
            )}
          </>
        )}
      </form>
    </ResponsiveModal>
  );
}
