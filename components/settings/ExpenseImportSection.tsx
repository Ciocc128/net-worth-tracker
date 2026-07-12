'use client';

/**
 * ExpenseImportSection — Settings → Spese sub-section.
 *
 * A 4-state wizard (idle → preview → importing → done) to migrate historical
 * expense/income data from a standardized CSV. Parsing/validation is delegated to
 * the pure lib/utils/expenseImport.ts layer; the Firestore commit/undo to
 * lib/services/expenseImportService.ts. Every import is undoable via its batch id.
 */

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, Download, FileText, AlertTriangle, CheckCircle2, Undo2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatDate } from '@/lib/utils/formatters';
import { getAllCategories } from '@/lib/services/expenseCategoryService';
import { buildImportPlan, parseImportCsv, buildTemplateCsv } from '@/lib/utils/expenseImport';
import { commitImportPlan, deleteExpensesByImportBatch } from '@/lib/services/expenseImportService';
import { ImportPlan } from '@/types/expenseImport';

type Phase = 'idle' | 'preview' | 'importing' | 'done';

interface Props {
  userId: string;
  onImported?: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  fixed: 'Spese Fisse',
  variable: 'Spese Variabili',
  debt: 'Debiti',
  income: 'Entrate',
};

export default function ExpenseImportSection({ userId, onImported }: Props) {
  const isDemo = useDemoMode();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState<string>('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [lastBatch, setLastBatch] = useState<{ importBatchId: string; created: number } | null>(null);
  const [undoing, setUndoing] = useState(false);

  const reset = () => {
    setPhase('idle');
    setPlan(null);
    setFileName('');
    setLastBatch(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([buildTemplateCsv()], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template-import-spese.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const text = await file.text();
      const rows = parseImportCsv(text);
      const categories = await getAllCategories(userId);
      const built = buildImportPlan(rows, categories);
      setPlan(built);
      setPhase('preview');
      if (built.validRows.length === 0) {
        toast.warning('Nessuna riga valida trovata nel file.');
      }
    } catch (err) {
      console.error('CSV parse error:', err);
      toast.error(err instanceof Error ? err.message : 'Impossibile leggere il file CSV.');
      reset();
    }
  };

  const handleConfirm = async () => {
    if (!plan || plan.validRows.length === 0) return;
    setPhase('importing');
    try {
      const result = await commitImportPlan(userId, plan);
      setLastBatch(result);
      setPhase('done');
      toast.success(`Importate ${result.created} transazioni.`);
      onImported?.();
    } catch (err) {
      console.error('Import commit error:', err);
      toast.error('Errore durante l\'importazione.');
      setPhase('preview');
    }
  };

  const handleUndo = async () => {
    if (!lastBatch) return;
    setUndoing(true);
    try {
      const deleted = await deleteExpensesByImportBatch(userId, lastBatch.importBatchId);
      toast.success(`Import annullato: ${deleted} transazioni rimosse.`);
      onImported?.();
      reset();
    } catch (err) {
      console.error('Undo import error:', err);
      toast.error('Errore durante l\'annullamento.');
    } finally {
      setUndoing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          <CardTitle>Importa Dati Storici</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 space-y-4">
        {phase === 'idle' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Migra spese ed entrate storiche da un file CSV. Scarica il template, compilalo con i tuoi
              dati (una riga per transazione) e caricalo qui. Le categorie mancanti verranno create
              automaticamente. I saldi dei conti non vengono modificati.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="outline" onClick={handleDownloadTemplate} className="w-full sm:w-auto">
                <Download className="mr-2 h-4 w-4" />
                Scarica template CSV
              </Button>
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isDemo}
                title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                className="w-full sm:w-auto"
              >
                <Upload className="mr-2 h-4 w-4" />
                Carica file CSV
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFile}
              />
            </div>
          </div>
        )}

        {phase === 'preview' && plan && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>{fileName}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <SummaryTile label="Transazioni valide" value={String(plan.summary.validCount)} />
              <SummaryTile label="Righe scartate" value={String(plan.summary.skippedCount)} />
              <SummaryTile label="Categorie nuove" value={String(plan.summary.newCategoriesCount)} />
              <SummaryTile label="Totale entrate" value={cachedFormatCurrencyEUR(plan.summary.totalIncome)} />
              <SummaryTile label="Totale uscite" value={cachedFormatCurrencyEUR(plan.summary.totalExpense)} />
              <SummaryTile
                label="Periodo"
                value={
                  plan.summary.dateFrom && plan.summary.dateTo
                    ? `${formatDate(plan.summary.dateFrom)} → ${formatDate(plan.summary.dateTo)}`
                    : '—'
                }
              />
            </div>

            {plan.categoriesToCreate.length > 0 && (
              <div className="rounded-md border p-3 space-y-1">
                <p className="text-sm font-medium">Categorie che verranno create:</p>
                <ul className="text-sm text-muted-foreground space-y-0.5">
                  {plan.categoriesToCreate.map((c) => (
                    <li key={c.name}>
                      • {c.name} <span className="opacity-70">({TYPE_LABELS[c.type] ?? c.type})</span>
                      {c.subCategories.length > 0 && (
                        <span className="opacity-70"> — {c.subCategories.join(', ')}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {plan.errors.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-500 hover:underline">
                  <AlertTriangle className="h-4 w-4" />
                  Mostra {plan.errors.length} righe scartate
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="max-h-56 overflow-y-auto rounded-md border divide-y text-sm">
                    {plan.errors.map((err, i) => (
                      <div key={i} className="flex gap-3 px-3 py-2">
                        <span className="shrink-0 font-mono text-muted-foreground">Riga {err.line}</span>
                        <span>{err.reason}</span>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                onClick={handleConfirm}
                disabled={isDemo || plan.validRows.length === 0}
                title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                className="w-full sm:w-auto"
              >
                Conferma importazione ({plan.validRows.length})
              </Button>
              <Button variant="outline" onClick={reset} className="w-full sm:w-auto">
                Annulla
              </Button>
            </div>
          </div>
        )}

        {phase === 'importing' && (
          <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Importazione in corso…
          </div>
        )}

        {phase === 'done' && lastBatch && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-500" />
              <span className="font-medium">Importate {lastBatch.created} transazioni.</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Le trovi ora in Cashflow e Analisi, nei mesi corrispondenti. Se qualcosa non va, puoi
              annullare l&apos;intero import.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="outline" onClick={handleUndo} disabled={undoing} className="w-full sm:w-auto">
                {undoing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />}
                Annulla import
              </Button>
              <Button variant="ghost" onClick={reset} className="w-full sm:w-auto">
                Importa un altro file
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}
