'use client';

/**
 * "Allocazione ideale" (Impostazioni → Allocazione) — the weight optimizer's objectives
 * (doc/weight-optimizer-ate.md §7.3). A controlled leaf: the page owns the state, the load and
 * the Salva button; this component only edits `value` in place through `onChange`. Nothing here
 * writes to Firestore on its own (no second Save path — doc/guide/impostazioni.md § Settings —
 * the FIVE places).
 */

import { Fragment } from 'react';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber, formatPercentage } from '@/lib/services/chartService';
import { describeIdealAllocation } from '@/lib/utils/settingsNarrative';
import { areasFromCountries } from '@/lib/utils/weightOptimizer';
import { GEO_AREAS, GEO_AREA_LABELS } from '@/lib/constants/geoAreas';
import { INDEX_PROFILES } from '@/lib/constants/instrumentProfiles';
import type { AssetClass, IdealAllocationSettings, ObjectivePriority } from '@/types/assets';

const PRIORITY_OPTIONS: Array<{ value: ObjectivePriority; label: string }> = [
  { value: 'essential', label: 'Essenziale' },
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Media' },
  { value: 'low', label: 'Bassa' },
];

const LEVERAGE_PRIORITY_OPTIONS: Array<{ value: ObjectivePriority | 'off'; label: string }> = [
  { value: 'off', label: 'Off' },
  ...PRIORITY_OPTIONS,
];

/** Reference indices with a published country breakdown — the only ones usable as a geography target. */
const REFERENCE_INDEX_OPTIONS = Object.values(INDEX_PROFILES).filter(
  (profile) => (profile.countries?.length ?? 0) > 0
);

function createGroupLimitId(): string {
  return `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface FactorClassOption {
  assetClass: AssetClass;
  label: string;
}

export interface TradableAssetOption {
  id: string;
  label: string;
}

interface IdealAllocationTileProps {
  value: IdealAllocationSettings;
  onChange: (next: IdealAllocationSettings) => void;
  /** deriveTargetLeverageRatio(targets) — read-only, shown next to the Leva priority select. */
  targetLeverageRatio: number;
  /** Classes with sub-category targets enabled — the only ones a factor objective can target. */
  factorClassOptions: FactorClassOption[];
  tradableAssets: TradableAssetOption[];
  disabled?: boolean;
}

const rowLabelClass = 'text-[13px] font-medium';
const rowHintClass = 'mt-0.5 text-[11px] leading-[1.4] text-muted-foreground';

export function IdealAllocationTile({
  value,
  onChange,
  targetLeverageRatio,
  factorClassOptions,
  tradableAssets,
  disabled = false,
}: IdealAllocationTileProps) {
  const factorObjectiveByClass = new Map(value.factorObjectives.map((f) => [f.assetClass, f.priority]));
  const geographyProfile = value.geography ? INDEX_PROFILES[value.geography.referenceIndexId] : undefined;
  const geographyPreview =
    geographyProfile?.countries && geographyProfile.countries.length > 0
      ? areasFromCountries(
          geographyProfile.countries.map((c) => ({ key: c.code, weight: c.weight })),
          geographyProfile.otherAreaSplit,
          null
        ).areas
      : null;

  const assetOptions: MultiSelectOption[] = tradableAssets.map((a) => ({ value: a.id, label: a.label }));

  const readingInput = {
    enabled: value.enabled,
    classPriority: value.classPriority,
    leveragePriority: value.leveragePriority,
    targetLeverageRatio,
    factorObjectives: value.factorObjectives.map((f) => ({
      classLabel: factorClassOptions.find((c) => c.assetClass === f.assetClass)?.label ?? f.assetClass,
      priority: f.priority,
    })),
    geography: value.geography?.enabled
      ? {
          referenceIndexLabel: INDEX_PROFILES[value.geography.referenceIndexId]?.label ?? value.geography.referenceIndexId,
          priority: value.geography.priority,
        }
      : null,
  };

  const usedInstrumentAssetIds = new Set(value.instrumentLimits.map((l) => l.assetId));
  const firstUnusedAssetId = tradableAssets.find((a) => !usedInstrumentAssetIds.has(a.id))?.id;

  const updateInstrumentLimit = (assetId: string, patch: Partial<{ assetId: string; minPct?: number; maxPct?: number }>) => {
    onChange({
      ...value,
      instrumentLimits: value.instrumentLimits.map((limit) =>
        limit.assetId === assetId ? { ...limit, ...patch } : limit
      ),
    });
  };

  const removeInstrumentLimit = (assetId: string) => {
    onChange({ ...value, instrumentLimits: value.instrumentLimits.filter((l) => l.assetId !== assetId) });
  };

  const addInstrumentLimit = () => {
    if (!firstUnusedAssetId) return;
    onChange({ ...value, instrumentLimits: [...value.instrumentLimits, { assetId: firstUnusedAssetId }] });
  };

  const updateGroupLimit = (id: string, patch: Partial<IdealAllocationSettings['groupLimits'][number]>) => {
    onChange({
      ...value,
      groupLimits: value.groupLimits.map((group) => (group.id === id ? { ...group, ...patch } : group)),
    });
  };

  const removeGroupLimit = (id: string) => {
    onChange({ ...value, groupLimits: value.groupLimits.filter((g) => g.id !== id) });
  };

  const addGroupLimit = () => {
    onChange({
      ...value,
      groupLimits: [
        ...value.groupLimits,
        { id: createGroupLimitId(), label: '', assetIds: [], maxPct: 0, priority: 'medium' },
      ],
    });
  };

  const toggleFactorObjective = (assetClass: AssetClass, checked: boolean) => {
    if (checked) {
      onChange({
        ...value,
        factorObjectives: [...value.factorObjectives, { assetClass, priority: 'medium' }],
      });
    } else {
      onChange({
        ...value,
        factorObjectives: value.factorObjectives.filter((f) => f.assetClass !== assetClass),
      });
    }
  };

  const setFactorObjectivePriority = (assetClass: AssetClass, priority: ObjectivePriority) => {
    onChange({
      ...value,
      factorObjectives: value.factorObjectives.map((f) => (f.assetClass === assetClass ? { ...f, priority } : f)),
    });
  };

  const setGeographyEnabled = (checked: boolean) => {
    if (value.geography) {
      onChange({ ...value, geography: { ...value.geography, enabled: checked } });
      return;
    }
    if (!checked) return;
    const firstIndexId = REFERENCE_INDEX_OPTIONS[0]?.indexId;
    if (!firstIndexId) return;
    onChange({ ...value, geography: { enabled: true, referenceIndexId: firstIndexId, priority: 'medium' } });
  };

  return (
    <Tile eyebrow="Allocazione ideale" reading={describeIdealAllocation(readingInput)}>
      <div className="mt-3.5 flex items-center justify-between gap-4 py-2">
        <div className="min-w-0">
          <p className={rowLabelClass}>Attiva</p>
          <p className={rowHintClass}>Propone i pesi degli strumenti nel passo Target del PAC.</p>
        </div>
        <Switch
          checked={value.enabled}
          onCheckedChange={(checked) => onChange({ ...value, enabled: checked })}
          disabled={disabled}
          aria-label="Attiva allocazione ideale"
        />
      </div>

      {value.enabled && (
        <div className="mt-1 flex flex-col divide-y divide-border">
          {/* Classi */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <div className="min-w-0">
              <p className={rowLabelClass}>Classi</p>
              <p className={rowHintClass}>Target delle classi qui sopra</p>
            </div>
            <Select
              value={value.classPriority}
              onValueChange={(priority: ObjectivePriority) => onChange({ ...value, classPriority: priority })}
              disabled={disabled}
            >
              <SelectTrigger className="w-40" aria-label="Priorità classi">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Leva */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <div className="min-w-0">
              <p className={rowLabelClass}>Leva</p>
              <p className={rowHintClass}>Leva target: {formatNumber(targetLeverageRatio, 2)}×</p>
            </div>
            <Select
              value={value.leveragePriority}
              onValueChange={(priority: ObjectivePriority | 'off') => onChange({ ...value, leveragePriority: priority })}
              disabled={disabled}
            >
              <SelectTrigger className="w-40" aria-label="Priorità leva">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVERAGE_PRIORITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fattori */}
          <div className="py-3">
            <p className={rowLabelClass}>Fattori</p>
            {factorClassOptions.length === 0 ? (
              <p className={rowHintClass}>Nessuna classe con sotto-categorie abilitate qui sopra.</p>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                {factorClassOptions.map((opt) => {
                  const priority = factorObjectiveByClass.get(opt.assetClass);
                  return (
                    <div key={opt.assetClass} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <label className="flex min-w-0 items-center gap-2 text-[13px]">
                        <Checkbox
                          checked={priority !== undefined}
                          onCheckedChange={(state) => toggleFactorObjective(opt.assetClass, state === true)}
                          disabled={disabled}
                          aria-label={`Fattori — ${opt.label}`}
                        />
                        {opt.label}
                      </label>
                      {priority !== undefined && (
                        <Select
                          value={priority}
                          onValueChange={(p: ObjectivePriority) => setFactorObjectivePriority(opt.assetClass, p)}
                          disabled={disabled}
                        >
                          <SelectTrigger className="w-40" aria-label={`Priorità fattori — ${opt.label}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PRIORITY_OPTIONS.map((p) => (
                              <SelectItem key={p.value} value={p.value}>
                                {p.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Geografia */}
          <div className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <p className={rowLabelClass}>Geografia</p>
                <p className={rowHintClass}>Ambito: azioni</p>
              </div>
              <Switch
                checked={value.geography?.enabled ?? false}
                onCheckedChange={setGeographyEnabled}
                disabled={disabled || REFERENCE_INDEX_OPTIONS.length === 0}
                aria-label="Attiva geografia"
              />
            </div>
            {value.geography && (
              <div className="mt-2 flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <Select
                    value={value.geography.referenceIndexId}
                    onValueChange={(referenceIndexId: string) =>
                      onChange({ ...value, geography: { ...value.geography!, referenceIndexId } })
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger className="w-64" aria-label="Indice di riferimento">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REFERENCE_INDEX_OPTIONS.map((profile) => (
                        <SelectItem key={profile.indexId} value={profile.indexId}>
                          {profile.label}
                          {profile.asOf ? ` (${profile.asOf})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={value.geography.priority}
                    onValueChange={(priority: ObjectivePriority) =>
                      onChange({ ...value, geography: { ...value.geography!, priority } })
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger className="w-40" aria-label="Priorità geografia">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {geographyPreview && (
                  <p className={rowHintClass}>
                    {GEO_AREAS.map((area, index) => (
                      <Fragment key={area}>
                        {index > 0 && ' · '}
                        {GEO_AREA_LABELS[area]} {formatPercentage(geographyPreview[area] * 100, 1)}
                      </Fragment>
                    ))}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Limiti per strumento */}
          <div className="py-3">
            <p className={cn(TILE_SUB_EYEBROW_CLASS)}>Limiti per strumento</p>
            <div className="mt-2 flex flex-col gap-2">
              {value.instrumentLimits.map((limit) => {
                const options = tradableAssets.filter(
                  (a) => a.id === limit.assetId || !usedInstrumentAssetIds.has(a.id)
                );
                return (
                  <div key={limit.assetId} className="flex flex-wrap items-center gap-2">
                    <Select
                      value={limit.assetId}
                      onValueChange={(assetId: string) => updateInstrumentLimit(limit.assetId, { assetId })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="w-52" aria-label="Strumento">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="Min %"
                      className="w-24"
                      value={limit.minPct ?? ''}
                      onChange={(e) =>
                        updateInstrumentLimit(limit.assetId, {
                          minPct: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      disabled={disabled}
                      aria-label={`Minimo % — ${limit.assetId}`}
                    />
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="Max %"
                      className="w-24"
                      value={limit.maxPct ?? ''}
                      onChange={(e) =>
                        updateInstrumentLimit(limit.assetId, {
                          maxPct: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      disabled={disabled}
                      aria-label={`Massimo % — ${limit.assetId}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeInstrumentLimit(limit.assetId)}
                      disabled={disabled}
                      aria-label="Rimuovi limite"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addInstrumentLimit}
                disabled={disabled || !firstUnusedAssetId}
                className="w-fit"
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Aggiungi limite
              </Button>
            </div>
          </div>

          {/* Limiti di gruppo */}
          <div className="py-3">
            <p className={cn(TILE_SUB_EYEBROW_CLASS)}>Limiti di gruppo</p>
            <div className="mt-2 flex flex-col gap-2">
              {value.groupLimits.map((group) => (
                <div key={group.id} className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      placeholder="Etichetta"
                      className="w-40"
                      value={group.label}
                      onChange={(e) => updateGroupLimit(group.id, { label: e.target.value })}
                      disabled={disabled}
                      aria-label="Etichetta del gruppo"
                    />
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="Tetto %"
                      className="w-24"
                      value={group.maxPct}
                      onChange={(e) => updateGroupLimit(group.id, { maxPct: Number(e.target.value) || 0 })}
                      disabled={disabled}
                      aria-label="Tetto % del gruppo"
                    />
                    <Select
                      value={group.priority}
                      onValueChange={(priority: ObjectivePriority) => updateGroupLimit(group.id, { priority })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="w-36" aria-label="Priorità del gruppo">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeGroupLimit(group.id)}
                      disabled={disabled}
                      aria-label="Rimuovi gruppo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <MultiSelect
                    options={assetOptions}
                    defaultValue={group.assetIds}
                    onValueChange={(assetIds) => updateGroupLimit(group.id, { assetIds })}
                    placeholder="Strumenti del gruppo"
                    disabled={disabled}
                  />
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addGroupLimit} disabled={disabled} className="w-fit">
                <Plus className="mr-1 h-3.5 w-3.5" /> Aggiungi gruppo
              </Button>
            </div>
          </div>
        </div>
      )}
    </Tile>
  );
}
