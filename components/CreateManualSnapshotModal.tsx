/**
 * Manual historical snapshot creation with asset allocation breakdown
 *
 * Three Tabs:
 * 1. General: Year, month, total net worth, liquid/illiquid split
 * 2. Asset Classes: one euro field per member of the AssetClass union, generated from
 *    ASSET_CLASS_SEQUENCE. NEVER hand-list the classes here: the sum of the fields is
 *    cross-validated against the total, so a class the form does not offer makes an honest
 *    snapshot impossible to enter, not merely incomplete — which is what six hard-coded
 *    fields did to Trend Following and Carry until 2026-08-30.
 * 3. Individual Assets: Optional granular detail per asset
 *
 * Validation: Three-stage pipeline ensures data integrity
 * - Stage 1: Parse inputs to numbers
 * - Stage 2: Validate individual fields
 * - Stage 3: Cross-validate sums (±0.01 floating-point tolerance) — the SAME check the server runs
 *   (`describeManualSnapshotIncoherence`, doc/snapshot-integri/README.md RI8)
 *
 * Replacement (§ 5.8, D-SN3): when the chosen month already has a snapshot (read from the snapshots
 * the page holds; the server's 409 guards a stale page), the reading names who wrote it, the
 * primary button reads «Sostituisci» and sends `replace: true`; the replaced version is kept and a
 * row «Versione precedente: …» offers «Ripristina». The toast after a replacement has «Annulla».
 */
'use client';

import { useState } from 'react';
import type { MonthlySnapshot, SnapshotWriter } from '@/types/assets';
import {
  describeExistingSnapshot,
  describePreviousVersion,
  formatSnapshotMonth,
  snapshotHasFigures,
} from '@/lib/utils/snapshotDocument';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { describeWriteError, userFacingError, type ModalStatus } from '@/lib/utils/dialogNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ASSET_CLASS_LABELS, ASSET_CLASS_SEQUENCE } from '@/lib/utils/allocationUtils';
import { describeManualSnapshotIncoherence, emptyClassAmounts, parseAmount, sumClassAmounts } from '@/lib/utils/manualSnapshotAmounts';
import { Plus, Trash2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MONTH_NAMES } from '@/lib/constants/months';

interface CreateManualSnapshotModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  /** The snapshots the page already holds: the dialog knows the existing months without a read. */
  snapshots?: MonthlySnapshot[];
  onSuccess?: () => void;
}

/** What the dialog knows of a month that already has a snapshot. */
interface ExistingMonth {
  writtenBy?: SnapshotWriter;
  updatedAt?: unknown;
  createdAt?: unknown;
  previous?: MonthlySnapshot['previous'];
}

interface AssetEntry {
  assetId: string;
  ticker: string;
  name: string;
  quantity: number;
  price: number;
  totalValue: number;
}

type ManualSnapshotOutcome =
  | { kind: 'written'; replaced: boolean }
  | { kind: 'exists'; existing: ExistingMonth };

/**
 * Posts the month and reads the answer: written, or «it already has one» (409, a stale page).
 * Any other refusal throws the server's message. Module-level so the component holds no `throw`
 * inside its try: the React Compiler cannot lower one there.
 */
async function postManualSnapshot(body: Record<string, unknown>): Promise<ManualSnapshotOutcome> {
  const response = await authenticatedFetch('/api/portfolio/snapshot/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (response.status === 409 && payload?.error === 'snapshot_exists') {
    return { kind: 'exists', existing: payload.existing ?? {} };
  }
  if (!response.ok) {
    // A 400 «Invalid request» comes from a tab of the previous build (the request's shape changed).
    const message = payload?.error === 'Invalid request'
      ? 'La pagina è di una versione precedente: ricaricala e riprova.'
      : payload?.error || 'Errore durante la creazione dello snapshot';
    throw userFacingError(message);
  }
  return { kind: 'written', replaced: payload?.replaced === true };
}

/** POST /api/portfolio/snapshot/restore: the previous version of the month comes back (a swap). */
async function postSnapshotRestore(userId: string, year: number, month: number): Promise<void> {
  const response = await authenticatedFetch('/api/portfolio/snapshot/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, year, month }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw userFacingError(payload?.error || 'Il ripristino non è riuscito');
  }
}

/** The month as the page holds it, when it has figures. */
function findExistingMonth(snapshots: MonthlySnapshot[], year: number, month: number): ExistingMonth | null {
  const found = snapshots.find((snapshot) => snapshot.year === year && snapshot.month === month);
  return found && snapshotHasFigures(found as unknown as Record<string, unknown>) ? found : null;
}

export function CreateManualSnapshotModal({
  open,
  onOpenChange,
  userId,
  snapshots = [],
  onSuccess,
}: CreateManualSnapshotModalProps) {
  const currentDate = new Date();
  const [year, setYear] = useState<string>(currentDate.getFullYear().toString());
  const [month, setMonth] = useState<string>((currentDate.getMonth() + 1).toString());
  const [totalNetWorth, setTotalNetWorth] = useState<string>('');
  const [liquidNetWorth, setLiquidNetWorth] = useState<string>('');
  const [illiquidNetWorth, setIlliquidNetWorth] = useState<string>('');

  // Asset class values
  const [byClass, setByClass] = useState<Record<string, string>>(emptyClassAmounts);

  // Asset entries
  const [assets, setAssets] = useState<AssetEntry[]>([]);

  const [isCreating, setIsCreating] = useState(false);
  const [status, setStatus] = useState<ModalStatus>({ phase: 'idle' });
  // The server's 409 on a month the page did not know about (another tab wrote it): `year-month` → what it said.
  const [serverExisting, setServerExisting] = useState<{ key: string; existing: ExistingMonth } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const yearValue = parseInt(year);
  const monthValue = parseInt(month);
  const monthKey = `${yearValue}-${monthValue}`;
  const existing =
    findExistingMonth(snapshots, yearValue, monthValue) ?? (serverExisting?.key === monthKey ? serverExisting.existing : null);
  const previous = findExistingMonth(snapshots, yearValue, monthValue)?.previous ?? null;

  const addAsset = () => {
    setAssets([
      ...assets,
      {
        assetId: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ticker: '',
        name: '',
        quantity: 0,
        price: 0,
        totalValue: 0,
      },
    ]);
  };

  const removeAsset = (index: number) => {
    setAssets(assets.filter((_, i) => i !== index));
  };

  const updateAsset = (index: number, field: keyof AssetEntry, value: string | number) => {
    const updatedAssets = [...assets];
    updatedAssets[index] = {
      ...updatedAssets[index],
      [field]: value,
    };

    // Recalculate totalValue if quantity or price changes
    if (field === 'quantity' || field === 'price') {
      const qty = field === 'quantity' ? Number(value) : updatedAssets[index].quantity;
      const prc = field === 'price' ? Number(value) : updatedAssets[index].price;
      updatedAssets[index].totalValue = qty * prc;
    }

    setAssets(updatedAssets);
  };

  const handleCreate = async () => {
    // Validate inputs
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    const totalNW = parseFloat(totalNetWorth);
    const liquidNW = parseFloat(liquidNetWorth);
    const illiquidNW = parseFloat(illiquidNetWorth);

    if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
      setStatus({ phase: 'error', message: 'L’anno non è valido.' });
      return;
    }

    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      setStatus({ phase: 'error', message: 'Il mese deve essere un numero da 1 a 12.' });
      return;
    }

    if (isNaN(totalNW) || totalNW < 0) {
      setStatus({ phase: 'error', message: 'Il patrimonio totale non è un numero valido.' });
      return;
    }

    if (isNaN(liquidNW) || liquidNW < 0) {
      setStatus({ phase: 'error', message: 'Il patrimonio liquido non è un numero valido.' });
      return;
    }

    if (isNaN(illiquidNW) || illiquidNW < 0) {
      setStatus({ phase: 'error', message: 'Il patrimonio illiquido non è un numero valido.' });
      return;
    }

    // Build byAssetClass object
    const byAssetClass: Record<string, number> = {};
    // A class left at 0 is absent from the document, not stored as a zero: `byAssetClass` is
    // read with `?? 0` everywhere, and an explicit zero would claim the user measured it.
    for (const assetClass of ASSET_CLASS_SEQUENCE) {
      const value = parseAmount(byClass[assetClass]);
      if (value > 0) byAssetClass[assetClass] = value;
    }

    // The two sums, the same check (and sentence) as the server's (RI8)
    const incoherence = describeManualSnapshotIncoherence({
      totalNetWorth: totalNW,
      liquidNetWorth: liquidNW,
      illiquidNetWorth: illiquidNW,
      byAssetClass,
    });
    if (incoherence) {
      setStatus({ phase: 'error', message: incoherence });
      return;
    }

    setIsCreating(true);

    // Built before the try (React Compiler): `assetAllocation` and `createdAt` are no longer sent —
    // the server derives the first and stamps the second (RI7).
    const request = {
      userId,
      year: yearNum,
      month: monthNum,
      totalNetWorth: totalNW,
      liquidNetWorth: liquidNW,
      illiquidNetWorth: illiquidNW,
      byAssetClass,
      byAsset: assets,
      ...(existing ? { replace: true } : {}),
    };
    const monthLabel = formatSnapshotMonth(yearNum, monthNum);

    try {
      const outcome = await postManualSnapshot(request);
      handleOutcome(outcome, yearNum, monthNum, monthLabel);
    } catch (error) {
      console.error('Error creating manual snapshot:', error);
      setStatus({ phase: 'error', message: describeWriteError(error) });
    }
    // After the try/catch, not in a `finally`: the React Compiler cannot lower try/finally.
    setIsCreating(false);
  };

  const restore = async (restoreYear: number, restoreMonth: number) => {
    const monthLabel = formatSnapshotMonth(restoreYear, restoreMonth);
    await postSnapshotRestore(userId, restoreYear, restoreMonth);
    toast.success(`Snapshot di ${monthLabel} ripristinato.`);
    if (onSuccess) onSuccess();
  };

  /** The answer of the server: a stale page shows the replacement step; a write closes the dialog. */
  const handleOutcome = (outcome: ManualSnapshotOutcome, outcomeYear: number, outcomeMonth: number, monthLabel: string) => {
    if (outcome.kind === 'exists') {
      setServerExisting({ key: `${outcomeYear}-${outcomeMonth}`, existing: outcome.existing });
      setStatus({ phase: 'idle' });
      return;
    }
    if (outcome.replaced) {
      toast.success(`Snapshot di ${monthLabel} sostituito.`, {
        duration: 10000,
        action: {
          label: 'Annulla',
          onClick: () => {
            restore(outcomeYear, outcomeMonth).catch((error) => toast.error(describeWriteError(error)));
          },
        },
      });
    } else {
      toast.success('Snapshot creato');
    }
    onOpenChange(false);
    if (onSuccess) onSuccess();
    resetForm();
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      await restore(yearValue, monthValue);
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error('Error restoring snapshot:', error);
      setStatus({ phase: 'error', message: describeWriteError(error) });
    }
    setIsRestoring(false);
  };

  const resetForm = () => {
    const currentDate = new Date();
    setYear(currentDate.getFullYear().toString());
    setMonth((currentDate.getMonth() + 1).toString());
    setTotalNetWorth('');
    setLiquidNetWorth('');
    setIlliquidNetWorth('');
    setByClass(emptyClassAmounts());
    setAssets([]);
    setServerExisting(null);
    setStatus({ phase: 'idle' });
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={() => onOpenChange(false)}
      eyebrow="Storico · Snapshot mensile"
      title="Crea uno snapshot a mano"
      reading={
        status.phase === 'error'
          ? { narrative: [{ text: status.message ?? '' }], tone: 'negative' }
          : existing && Number.isFinite(yearValue) && monthValue >= 1 && monthValue <= 12
            ? describeExistingSnapshot(yearValue, monthValue, existing)
            : 'Uno snapshot manuale entra nello Storico come tutti gli altri: le classi devono sommare al patrimonio totale, o il mese risulterebbe incoerente ovunque.'
      }
      width="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Annulla
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || isRestoring}>
            {isCreating ? (existing ? 'Sostituzione...' : 'Creazione...') : existing ? 'Sostituisci' : 'Crea snapshot'}
          </Button>
        </>
      }
    >
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general" className="text-xs sm:text-sm">Dati generali</TabsTrigger>
            <TabsTrigger value="assetclass" className="text-xs sm:text-sm">Asset class</TabsTrigger>
            <TabsTrigger value="assets" className="text-xs sm:text-sm">Strumenti (opzionale)</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="year">Anno *</Label>
                <Input
                  id="year"
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2024"
                  min="1900"
                  max="2100"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="month">Mese *</Label>
                {/* Twelve names, not a number from 1 to 12: a constraint the control enforces needs no validation message. */}
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger id="month" className="w-full">
                    <SelectValue placeholder="Scegli il mese" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((name, index) => (
                      <SelectItem key={name} value={String(index + 1)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {previous && (
              <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <p className="text-sm text-muted-foreground">{describePreviousVersion(previous, yearValue)}</p>
                <Button type="button" variant="outline" size="sm" onClick={handleRestore} disabled={isRestoring || isCreating}>
                  {isRestoring ? 'Ripristino...' : 'Ripristina'}
                </Button>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="total-net-worth">Patrimonio totale (€) *</Label>
              <Input
                id="total-net-worth"
                type="number"
                value={totalNetWorth}
                onChange={(e) => setTotalNetWorth(e.target.value)}
                placeholder="100000"
                step="0.01"
                min="0"
              />
              <p className="text-xs text-muted-foreground">
                Valore totale del patrimonio netto
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="liquid-net-worth">Patrimonio liquido (€) *</Label>
                <Input
                  id="liquid-net-worth"
                  type="number"
                  value={liquidNetWorth}
                  onChange={(e) => setLiquidNetWorth(e.target.value)}
                  placeholder="85000"
                  step="0.01"
                  min="0"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="illiquid-net-worth">Patrimonio illiquido (€) *</Label>
                <Input
                  id="illiquid-net-worth"
                  type="number"
                  value={illiquidNetWorth}
                  onChange={(e) => setIlliquidNetWorth(e.target.value)}
                  placeholder="15000"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>

            <div className="rounded-lg bg-muted p-3 border border-border">
              <p className="text-xs text-foreground">
                <strong>Nota:</strong> La somma di Liquido e Illiquido deve essere uguale al Patrimonio Totale.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="assetclass" className="space-y-4 py-4">
            <div className="grid gap-4">
              {ASSET_CLASS_SEQUENCE.map((assetClass) => (
                <div key={assetClass} className="grid gap-2">
                  <Label htmlFor={assetClass}>{ASSET_CLASS_LABELS[assetClass] ?? assetClass} (€)</Label>
                  <Input
                    id={assetClass}
                    type="number"
                    value={byClass[assetClass] ?? '0'}
                    onChange={(e) =>
                      setByClass((previous) => ({ ...previous, [assetClass]: e.target.value }))
                    }
                    placeholder="0"
                    step="0.01"
                    min="0"
                  />
                </div>
              ))}
            </div>

            <div className="rounded-lg bg-warning p-3 border border-warning-border">
              <p className="text-xs text-warning-foreground">
                <strong>Attenzione:</strong> La somma di tutte le Asset Class deve essere uguale al Patrimonio Totale.
                Somma attuale:{' '}
                {cachedFormatCurrencyEUR(sumClassAmounts(byClass))}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="assets" className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Aggiungi i dettagli degli asset (opzionale)
              </p>
              <Button type="button" variant="outline" size="sm" onClick={addAsset}>
                <Plus className="mr-2 h-4 w-4" />
                Aggiungi Asset
              </Button>
            </div>

            {assets.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Nessun asset aggiunto. Questo campo è opzionale.
              </div>
            ) : (
              <div className="space-y-4">
                {assets.map((asset, index) => (
                  <div
                    key={asset.assetId}
                    className="grid gap-3 p-4 border rounded-lg relative"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => removeAsset(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="grid gap-2">
                        <Label htmlFor={`ticker-${index}`}>Ticker</Label>
                        <Input
                          id={`ticker-${index}`}
                          value={asset.ticker}
                          onChange={(e) => updateAsset(index, 'ticker', e.target.value)}
                          placeholder="AAPL"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor={`name-${index}`}>Nome</Label>
                        <Input
                          id={`name-${index}`}
                          value={asset.name}
                          onChange={(e) => updateAsset(index, 'name', e.target.value)}
                          placeholder="Apple Inc."
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="grid gap-2">
                        <Label htmlFor={`quantity-${index}`}>Quantità</Label>
                        <Input
                          id={`quantity-${index}`}
                          type="number"
                          value={asset.quantity}
                          onChange={(e) =>
                            updateAsset(index, 'quantity', parseFloat(e.target.value) || 0)
                          }
                          placeholder="0"
                          step="0.01"
                          min="0"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor={`price-${index}`}>Prezzo (€)</Label>
                        <Input
                          id={`price-${index}`}
                          type="number"
                          value={asset.price}
                          onChange={(e) =>
                            updateAsset(index, 'price', parseFloat(e.target.value) || 0)
                          }
                          placeholder="0"
                          step="0.01"
                          min="0"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor={`total-${index}`}>Valore totale</Label>
                        <Input
                          id={`total-${index}`}
                          type="number"
                          value={asset.totalValue.toFixed(2)}
                          readOnly
                          disabled
                          className="bg-muted"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
    </ResponsiveModal>
  );
}
