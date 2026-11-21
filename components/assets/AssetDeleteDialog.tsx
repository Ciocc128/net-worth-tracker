'use client';

/**
 * «Elimina {strumento}?» — the ONE way an asset is deleted (doc/cancellazione-strumenti/README.md
 * § 4.6, D-CA1): opened by the Strumenti row, the mobile `AssetRow` and the cash account's detail,
 * it reads where the asset is used (`GET /api/assets/[id]/usage`) and then says, in this order:
 * what STOPS the deletion, what happens to the registry (the one thing the user chooses), what the
 * deletion removes by itself, and what stays. A `ResponsiveModal` `sm` in the app's vocabulary; the
 * words come from `assetUsageNarrative.ts`, and the single click on «Elimina» is the confirmation.
 * If the report cannot be read the dialog offers no action: it never deletes blindly.
 */

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { useAssetUsage, useDeleteAsset } from '@/lib/hooks/useAssets';
import { AssetInUseError } from '@/lib/services/assetService';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import type { LedgerChoice, UsageLine } from '@/lib/utils/assetUsage';
import {
  NOT_USED_ELSEWHERE,
  SHARES_LEAVE_WARNING,
  describeDeleteLedger,
  describeDeletion,
  describeDividends,
  describeKeepLedger,
} from '@/lib/utils/assetUsageNarrative';
import type { Asset } from '@/types/assets';

interface AssetDeleteDialogProps {
  /** The asset to delete; null keeps the modal closed. */
  asset: Asset | null;
  ownerId: string | undefined;
  onClose: () => void;
  /** Called after the asset is gone (the cash account's detail closes itself here). */
  onDeleted?: () => void;
  /** «Registra prima la vendita» — only offered while shares are still held. */
  onRegisterSale?: (asset: Asset) => void;
  /** The toast on success: «Asset eliminato» / «Conto eliminato». */
  successMessage?: string;
}

function Lines({ lines, tone }: { lines: UsageLine[]; tone: 'stop' | 'clean' | 'stay' }) {
  return (
    <ul className={tone === 'stay' ? 'space-y-1 text-[13px] text-muted-foreground' : 'space-y-1 text-[13px] text-foreground'}>
      {lines.map((line, index) => (
        <li key={`${line.code}-${index}`} className="flex flex-wrap gap-x-2">
          <span>{line.sentence}</span>
          {line.href && (
            <Link href={line.href} className="text-primary underline underline-offset-2">
              Apri {line.area}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

export function AssetDeleteDialog({ asset, ownerId, onClose, onDeleted, onRegisterSale, successMessage = 'Asset eliminato' }: AssetDeleteDialogProps) {
  const usageQuery = useAssetUsage(ownerId, asset?.id ?? null);
  const deleteMutation = useDeleteAsset(ownerId || '');
  // The choice is the user's own: it only counts for the asset it was made on.
  const [picked, setPicked] = useState<{ assetId: string; value: LedgerChoice } | null>(null);

  const usage = usageQuery.data;
  const choice: LedgerChoice | null =
    picked && picked.assetId === asset?.id ? picked.value : (usage?.defaultLedgerChoice ?? null);
  const blocked = (usage?.blockers.length ?? 0) > 0;
  const needsChoice = usage?.needsLedgerChoice ?? false;
  const busy = deleteMutation.isPending;
  const canDelete = !!usage && !blocked && !busy && (!needsChoice || choice !== null);

  const handleDelete = async () => {
    if (!asset || !usage) return;
    try {
      await deleteMutation.mutateAsync({ assetId: asset.id, ledger: needsChoice ? (choice ?? undefined) : undefined });
      toast.success(successMessage);
      onDeleted?.();
      onClose();
    } catch (error) {
      if (error instanceof AssetInUseError) {
        toast.error('Qualcosa usa ancora questo strumento: ricontrollo.');
        void usageQuery.refetch();
        return;
      }
      console.error('Error deleting asset:', error);
      toast.error(describeWriteError(error));
    }
  };

  const nothing = usage && !blocked && !needsChoice && usage.cleanups.length === 0 && usage.kept.length === 0;
  const dividends = usage ? describeDividends(usage.dividends.future, usage.dividends.past) : null;
  const pensionCount = usage?.pensionContributions ?? 0;
  const ledgerCount = usage?.ledger.count ?? 0;
  const failed = usageQuery.isError;

  return (
    <ResponsiveModal
      open={asset !== null}
      onClose={onClose}
      width="sm"
      eyebrow="Patrimonio · Elimina"
      title={asset ? `Elimina ${asset.name}?` : 'Elimina'}
      reading={
        asset
          ? failed
            ? { narrative: [{ text: 'Non riesco a leggere dove è usato: non elimino alla cieca. Riprova tra poco.' }], tone: 'negative' }
            : usage
              ? { narrative: [{ text: describeDeletion(usage.asset.name, ledgerCount, usage.asset.quantity) }], tone: 'neutral' }
              : { narrative: [{ text: 'Leggo dove è usato…' }], tone: 'neutral' }
          : null
      }
      description="Dice dove lo strumento è usato e cosa succede a ciò che lo cita prima di eliminarlo."
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {blocked || failed ? 'Chiudi' : 'Annulla'}
          </Button>
          {failed && (
            <Button type="button" variant="outline" onClick={() => void usageQuery.refetch()}>
              Riprova
            </Button>
          )}
          {!blocked && !failed && (
            <Button type="button" variant="destructive" disabled={!canDelete} onClick={() => void handleDelete()}>
              Elimina
            </Button>
          )}
        </>
      }
    >
      {asset && usageQuery.isLoading && (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}

      {usage && (
        <div className="space-y-4">
          {nothing && <p className="text-[13px] text-muted-foreground">{NOT_USED_ELSEWHERE}</p>}

          {blocked && (
            <Section title="Ti ferma">
              <Lines lines={usage.blockers} tone="stop" />
            </Section>
          )}

          {!blocked && needsChoice && (
            <Section title="Il registro">
              {usage.ledger.quantity > 0 && ledgerCount > 0 && (
                <div className="space-y-1 text-[13px] text-foreground">
                  <p>{SHARES_LEAVE_WARNING}</p>
                  {onRegisterSale && asset && (
                    <Button type="button" variant="link" className="h-auto p-0 text-[13px]" onClick={() => onRegisterSale(asset)}>
                      Registra prima la vendita
                    </Button>
                  )}
                </div>
              )}
              <RadioGroup
                value={choice ?? ''}
                onValueChange={(value) => asset && setPicked({ assetId: asset.id, value: value as LedgerChoice })}
                className="gap-2"
              >
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="keep" id="ledger-keep" className="mt-0.5" />
                  <Label htmlFor="ledger-keep" className="text-[13px] font-normal leading-snug">
                    {describeKeepLedger(ledgerCount, pensionCount)}
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="delete" id="ledger-delete" className="mt-0.5" />
                  <Label htmlFor="ledger-delete" className="text-[13px] font-normal leading-snug">
                    {describeDeleteLedger(ledgerCount, pensionCount)}
                  </Label>
                </div>
              </RadioGroup>
            </Section>
          )}

          {!blocked && usage.cleanups.length > 0 && (
            <Section title="Lo tolgo io">
              <Lines lines={usage.cleanups} tone="clean" />
            </Section>
          )}

          {(usage.kept.length > 0 || dividends) && (
            <Section title="Resta">
              <Lines lines={usage.kept} tone="stay" />
              {dividends && <p className="text-[13px] text-muted-foreground">{dividends}</p>}
            </Section>
          )}
        </div>
      )}
    </ResponsiveModal>
  );
}
