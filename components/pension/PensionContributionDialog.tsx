/**
 * PensionContributionDialog — the dedicated "Registra versamento" flow.
 *
 * Records a contribution into the dedicated `pensionContributions` collection (never as an expense).
 * Fields: fund, nature, amount, date, tax year. The nature carries an inline note about its fiscal
 * treatment (micro-education at the point of entry, spec §6.3).
 *
 * Scope note: the voluntary "source account" selector and the transfer/NAV wiring (§4.3) land in a
 * later step; for now every nature just records the fact.
 */
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { recordPensionContribution } from '@/lib/services/pensionContributionService';
import { queryKeys } from '@/lib/query/queryKeys';
import type { ContributionSource } from '@/types/pension';

/** A selectable option (pension fund or cash account). */
export interface PensionFundOption {
  id: string;
  name: string;
}

interface PensionContributionDialogProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  funds: PensionFundOption[];
  /** Cash accounts a voluntary contribution can be drawn from (the transfer origin, §4.3). */
  cashAccounts: PensionFundOption[];
}

export function PensionContributionDialog({
  open,
  onClose,
  userId,
  funds,
  cashAccounts,
}: PensionContributionDialogProps) {
  const queryClient = useQueryClient();
  const [assetId, setAssetId] = useState(() => funds[0]?.id ?? '');
  const [nature, setNature] = useState<ContributionSource>('voluntary');
  const [sourceCashAssetId, setSourceCashAssetId] = useState(() => cashAccounts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [taxYear, setTaxYear] = useState(() => String(new Date().getFullYear()));
  const [saving, setSaving] = useState(false);

  const resetFields = () => {
    setAssetId(funds[0]?.id ?? '');
    setNature('voluntary');
    setSourceCashAssetId(cashAccounts[0]?.id ?? '');
    setAmount('');
    setDate(new Date().toISOString().slice(0, 10));
    setTaxYear(String(new Date().getFullYear()));
  };

  const handleSubmit = async () => {
    if (!assetId) {
      toast.error('Seleziona un fondo pensione');
      return;
    }
    const value = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Inserisci un importo valido');
      return;
    }
    const year = parseInt(taxYear, 10);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      toast.error('Inserisci un anno fiscale valido');
      return;
    }
    if (nature === 'voluntary' && !sourceCashAssetId) {
      toast.error('Seleziona il conto di provenienza per il versamento volontario');
      return;
    }

    setSaving(true);
    try {
      await recordPensionContribution(userId, {
        assetId,
        source: nature,
        amount: value,
        date: new Date(date),
        taxYear: year,
        sourceCashAssetId: nature === 'voluntary' ? sourceCashAssetId : undefined,
      });
      // The value effect touches the fund (and, for voluntary, the source cash account) → refresh
      // assets + dashboard as well as the contributions list.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.pensionContributions.all(userId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(userId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all(userId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(userId) }),
      ]);
      toast.success('Versamento registrato');
      resetFields();
      onClose();
    } catch (error) {
      console.error('Error recording pension contribution:', error);
      toast.error('Errore nella registrazione del versamento');
    } finally {
      setSaving(false);
    }
  };

  const hasFunds = funds.length > 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registra versamento</DialogTitle>
          <DialogDescription>
            Aggiungi un versamento al fondo pensione: fondo, natura, importo, data e anno fiscale.
          </DialogDescription>
        </DialogHeader>

        {!hasFunds ? (
          <p className="py-4 text-sm text-muted-foreground">
            Prima crea un asset «Fondo Pensione» in Patrimonio: i versamenti si collegano a quel
            fondo.
          </p>
        ) : (
          <div className="space-y-4">
            {funds.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="pc-fund">Fondo</Label>
                <Select value={assetId} onValueChange={setAssetId}>
                  <SelectTrigger id="pc-fund">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {funds.map((fund) => (
                      <SelectItem key={fund.id} value={fund.id}>
                        {fund.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="pc-nature">Natura</Label>
              <Select value={nature} onValueChange={(v) => setNature(v as ContributionSource)}>
                <SelectTrigger id="pc-nature">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="voluntary">Volontario (deducibile)</SelectItem>
                  <SelectItem value="employer">Datoriale (deducibile)</SelectItem>
                  <SelectItem value="tfr">TFR (non deducibile)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {nature === 'voluntary'
                  ? 'Versato dai tuoi risparmi: deducibile IRPEF entro il tetto annuo. Esce dal conto scelto come trasferimento.'
                  : nature === 'employer'
                    ? 'Quota versata dal datore: deducibile IRPEF, non transita dal tuo conto.'
                    : 'Trattamento di fine rapporto: non deducibile, non transita dal tuo conto.'}
              </p>
            </div>

            {nature === 'voluntary' && (
              <div className="space-y-2">
                <Label htmlFor="pc-source">Conto di provenienza</Label>
                {cashAccounts.length > 0 ? (
                  <Select value={sourceCashAssetId} onValueChange={setSourceCashAssetId}>
                    <SelectTrigger id="pc-source">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {cashAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Nessun conto liquidità disponibile: crea un asset di tipo «Liquidità» in
                    Patrimonio per registrare un versamento volontario.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="pc-amount">Importo (€)</Label>
              <Input
                id="pc-amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="pc-date">Data</Label>
                <Input
                  id="pc-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pc-taxyear">Anno fiscale</Label>
                <Input
                  id="pc-taxyear"
                  type="number"
                  step="1"
                  value={taxYear}
                  onChange={(e) => setTaxYear(e.target.value)}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Il versamento aumenta subito il valore del fondo. Il rendimento di mercato lo aggiorni
              a mano dal tuo asset in Patrimonio quando arriva l&apos;estratto conto.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !hasFunds || (nature === 'voluntary' && cashAccounts.length === 0)}
          >
            {saving ? 'Salvataggio...' : 'Registra'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
