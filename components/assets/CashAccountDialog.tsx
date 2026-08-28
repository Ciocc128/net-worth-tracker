'use client';

import { Pencil, Trash2, Wallet } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import type { Asset } from '@/types/assets';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/services/chartService';
import { calculateAssetValue } from '@/lib/services/assetService';
import { cn } from '@/lib/utils';

const ITALIAN_DATE = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });

function formatAssetDate(ts: Date | Timestamp | null | undefined): string {
  if (!ts) return '—';
  return ITALIAN_DATE.format(ts instanceof Timestamp ? ts.toDate() : ts);
}

interface CashAccountDialogProps {
  asset: Asset | null;
  open: boolean;
  onClose: () => void;
  onEdit: (asset: Asset) => void;
  pendingDeleteId: string | undefined;
  onDeleteClick: (assetId: string) => void;
  isDemo: boolean;
}

/**
 * Read-only detail of one cash account — balance, currency, name, last update — with Modifica
 * (opens AssetDialog) and the 2-click Elimina. Opened from a row of the Liquidità tile.
 */
export function CashAccountDialog({ asset, open, onClose, onEdit, pendingDeleteId, onDeleteClick, isDemo }: CashAccountDialogProps) {
  if (!asset) return null;
  const value = calculateAssetValue(asset);
  const isPending = pendingDeleteId === asset.id;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <DialogTitle className="text-base">{asset.name}</DialogTitle>
          </div>
          <DialogDescription className="sr-only">Dettagli del conto corrente {asset.name}</DialogDescription>
        </DialogHeader>

        <p className="font-mono text-[36px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground">
          {formatCurrency(value, asset.currency)}
        </p>

        <div className="divide-y divide-border border-t border-border">
          {[
            { label: 'Valuta', value: asset.currency },
            { label: 'Nome', value: asset.name },
            { label: 'Aggiornato', value: formatAssetDate(asset.updatedAt) },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between py-2.5">
              <span className="text-[13px] text-muted-foreground">{row.label}</span>
              <span className="font-mono text-[13px] tabular-nums text-foreground">{row.value}</span>
            </div>
          ))}
        </div>

        <DialogFooter className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => onEdit(asset)}
            disabled={isDemo}
            title={isDemo ? 'Non disponibile in modalità demo' : undefined}
          >
            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
            Modifica
          </Button>
          <Button
            type="button"
            variant={isPending ? 'destructive' : 'outline'}
            className={cn('flex-1', !isPending && 'text-destructive hover:text-destructive')}
            onClick={() => onDeleteClick(asset.id)}
            disabled={isDemo}
            title={isDemo ? 'Non disponibile in modalità demo' : undefined}
            aria-label={isPending ? 'Conferma eliminazione' : 'Elimina conto'}
          >
            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
            {isPending ? 'Conferma?' : 'Elimina'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
