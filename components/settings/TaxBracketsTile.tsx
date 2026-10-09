'use client';

/**
 * «Scaglioni IRPEF» — the rule of law the FIRE page reads for the state pensions' net (doc/fire-ipotesi/README.md § 15,
 * RP8, D-T6). It lived in Coast FIRE › Ipotesi until 2026-10-05; a law is not a fact about the plan's owner, so it sits
 * with the other rules in Impostazioni › Simulazioni and is saved by the page's ONE «Salva» (The Declaration-Tile Rule:
 * no second button). The draft is the page's (`taxBrackets`), this tile only edits it.
 */
import { Plus, Trash2 } from 'lucide-react';
import { createLocalId, createTaxBracketDraft, describeScaglioni, type CoastFireTaxBracketDraft } from '@/lib/utils/coastFireView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tile } from '@/components/ui/tile';
import { cn } from '@/lib/utils';

const CONTROL_CLASS =
  'mt-1 h-11 desktop:h-9 font-mono tabular-nums transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary/25 motion-reduce:transition-none';

interface TaxBracketsTileProps {
  brackets: CoastFireTaxBracketDraft[];
  onChange: (brackets: CoastFireTaxBracketDraft[]) => void;
  disabled?: boolean;
  className?: string;
}

export function TaxBracketsTile({ brackets, onChange, disabled = false, className }: TaxBracketsTileProps) {
  const update = (id: string, field: keyof Omit<CoastFireTaxBracketDraft, 'id'>, value: string) =>
    onChange(brackets.map((bracket) => (bracket.id === id ? { ...bracket, [field]: value } : bracket)));
  // The last bracket is the unlimited one: removing it would leave the top income untaxed.
  const remove = (id: string) => (brackets.length > 1 ? onChange(brackets.filter((bracket) => bracket.id !== id)) : undefined);
  const add = () => onChange([...brackets, createTaxBracketDraft({ id: createLocalId('coast-tax'), upTo: null, rate: 43 })]);

  return (
    <Tile eyebrow="Scaglioni IRPEF" aside="sul lordo annuo reale" reading={describeScaglioni(brackets.length)} ariaLabel="Scaglioni IRPEF" className={className}>
      <div className="mt-2.5 flex flex-col divide-y divide-border">
        {brackets.map((bracket, index) => {
          const isLast = index === brackets.length - 1;
          return (
            <div key={bracket.id} className="grid grid-cols-[minmax(0,1fr)_96px_44px] items-end gap-3 py-2.5 desktop:grid-cols-[minmax(0,1fr)_110px_36px]">
              <div>
                <Label htmlFor={`coast-tax-limit-${bracket.id}`} className="text-[11px] text-muted-foreground">
                  Fino a (€ annui)
                </Label>
                <Input
                  id={`coast-tax-limit-${bracket.id}`}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={bracket.upTo}
                  onChange={(event) => update(bracket.id, 'upTo', event.target.value)}
                  disabled={disabled}
                  className={CONTROL_CLASS}
                  placeholder={isLast ? 'Senza tetto' : 'Es. 28000'}
                />
              </div>
              <div>
                <Label htmlFor={`coast-tax-rate-${bracket.id}`} className="text-[11px] text-muted-foreground">
                  Aliquota %
                </Label>
                <Input
                  id={`coast-tax-rate-${bracket.id}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  step="0.1"
                  value={bracket.rate}
                  onChange={(event) => update(bracket.id, 'rate', event.target.value)}
                  disabled={disabled}
                  className={CONTROL_CLASS}
                />
              </div>
              {/* The last bracket is the unlimited one and cannot go: its name says why it is disabled. */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(bracket.id)}
                disabled={disabled || brackets.length === 1}
                aria-label={brackets.length === 1 ? "L'ultimo scaglione, senza tetto, non si rimuove" : `Rimuovi lo scaglione ${index + 1}`}
                className="h-11 w-11 desktop:h-9 desktop:w-9"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          );
        })}
      </div>
      <div className={cn('mt-auto flex items-center gap-3 border-t border-border pt-3.5')}>
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled} className="h-11 desktop:h-9">
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Aggiungi scaglione
        </Button>
        <span className="text-[11px] leading-[1.4] text-muted-foreground">Lascia vuoto l&apos;ultimo scaglione se non ha un tetto.</span>
      </div>
    </Tile>
  );
}
