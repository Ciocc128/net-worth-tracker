import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AlertCircle, Settings, ChevronDown } from 'lucide-react';
import { MonteCarloParams } from '@/types/assets';
import { formatCurrency } from '@/lib/services/chartService';
import { getDefaultMarketParameters } from '@/lib/services/monteCarloService';
import { useState, useEffect } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface ParametersFormProps {
  params: MonteCarloParams;
  onParamsChange: (params: MonteCarloParams) => void;
  onRunSimulation: () => void;
  totalNetWorth: number;
  liquidNetWorth: number;
  isRunning: boolean;
  hideMarketParams?: boolean; // Hide advanced section when scenario mode handles market params
}

type AllocationKey =
  | 'equityPercentage'
  | 'bondsPercentage'
  | 'realEstatePercentage'
  | 'commoditiesPercentage'
  | 'trendFollowingPercentage'
  | 'carryPercentage';

type MarketParamKey =
  | 'equityReturn' | 'equityVolatility'
  | 'bondsReturn' | 'bondsVolatility'
  | 'realEstateReturn' | 'realEstateVolatility'
  | 'commoditiesReturn' | 'commoditiesVolatility'
  | 'trendFollowingReturn' | 'trendFollowingVolatility'
  | 'carryReturn' | 'carryVolatility';

// Module-level, data-driven field definitions — one entry per asset class instead of a
// hand-duplicated JSX block per class. Adding a class means adding one row here.
const ALLOCATION_FIELDS: { key: AllocationKey; label: string }[] = [
  { key: 'equityPercentage', label: 'Equity (%)' },
  { key: 'bondsPercentage', label: 'Bonds (%)' },
  { key: 'realEstatePercentage', label: 'Immobili (%)' },
  { key: 'commoditiesPercentage', label: 'Materie Prime (%)' },
  { key: 'trendFollowingPercentage', label: 'Trend Following (%)' },
  { key: 'carryPercentage', label: 'Carry (%)' },
];

const MARKET_PARAM_FIELDS: { returnKey: MarketParamKey; volatilityKey: MarketParamKey; label: string }[] = [
  { returnKey: 'equityReturn', volatilityKey: 'equityVolatility', label: 'Equity' },
  { returnKey: 'bondsReturn', volatilityKey: 'bondsVolatility', label: 'Bonds' },
  { returnKey: 'realEstateReturn', volatilityKey: 'realEstateVolatility', label: 'Immobili' },
  { returnKey: 'commoditiesReturn', volatilityKey: 'commoditiesVolatility', label: 'Materie Prime' },
  { returnKey: 'trendFollowingReturn', volatilityKey: 'trendFollowingVolatility', label: 'Trend Following' },
  { returnKey: 'carryReturn', volatilityKey: 'carryVolatility', label: 'Carry' },
];

/**
 * Configuration form for Monte Carlo simulation parameters.
 *
 * Split into two tiers:
 * - Base (always visible): initial portfolio, retirement years, annual withdrawal, asset allocation
 * - Advanced (Collapsible): market parameters per asset class, number of simulations
 *
 * The advanced section auto-opens on mount when the loaded params differ from defaults,
 * so users with customized market assumptions see them immediately.
 *
 * State management pattern:
 * Local string state for each numeric input allows partial values while typing.
 * Values sync with the parent only on blur after validation. Allocation % and market
 * return/volatility inputs are keyed maps (ALLOCATION_FIELDS/MARKET_PARAM_FIELDS) rather
 * than one useState per field, so adding an asset class doesn't require new hooks or JSX.
 */
export function ParametersForm({
  params,
  onParamsChange,
  onRunSimulation,
  totalNetWorth,
  liquidNetWorth,
  isRunning,
  hideMarketParams = false,
}: ParametersFormProps) {
  // ===== Advanced section open state =====

  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Auto-open on mount when market params differ from defaults
  useEffect(() => {
    const defaults = getDefaultMarketParameters();
    const isNonDefault = MARKET_PARAM_FIELDS.some(
      (field) =>
        Math.abs(params[field.returnKey] - defaults[field.returnKey]) > 0.001 ||
        Math.abs(params[field.volatilityKey] - defaults[field.volatilityKey]) > 0.001
    ) || Math.abs(params.inflationRate - defaults.inflationRate) > 0.001;

    const hasNonDefaultSimCount = params.numberOfSimulations !== 10000;

    if (isNonDefault || hasNonDefaultSimCount) setAdvancedOpen(true);
  }, []); // Only on mount — params may not be auto-filled yet but Collapsible can reopen later

  // ===== Input State Management =====
  // Each numeric field maintains local string state to allow partial input while typing.
  // Values sync with parent params only on blur after validation.

  const [allocationInputs, setAllocationInputs] = useState<Record<AllocationKey, string>>(() =>
    Object.fromEntries(ALLOCATION_FIELDS.map((f) => [f.key, params[f.key].toString()])) as Record<AllocationKey, string>
  );

  const [marketInputs, setMarketInputs] = useState<Record<MarketParamKey, string>>(() =>
    Object.fromEntries(
      MARKET_PARAM_FIELDS.flatMap((f) => [
        [f.returnKey, params[f.returnKey].toFixed(1)],
        [f.volatilityKey, params[f.volatilityKey].toFixed(1)],
      ])
    ) as Record<MarketParamKey, string>
  );

  const [initialPortfolioInput, setInitialPortfolioInput] = useState<string>(
    params.initialPortfolio.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );

  const [inflationRateInput, setInflationRateInput] = useState<string>(params.inflationRate.toFixed(1));

  // Sync initialPortfolio display when the value changes from quick-select buttons
  useEffect(() => {
    setInitialPortfolioInput(
      params.initialPortfolio.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
  }, [params.initialPortfolio]);

  // Sync allocation inputs when params change (e.g., auto-filled from real portfolio)
  useEffect(() => {
    setAllocationInputs(
      Object.fromEntries(ALLOCATION_FIELDS.map((f) => [f.key, params[f.key].toString()])) as Record<AllocationKey, string>
    );
  }, [
    params.equityPercentage,
    params.bondsPercentage,
    params.realEstatePercentage,
    params.commoditiesPercentage,
    params.trendFollowingPercentage,
    params.carryPercentage,
  ]);

  /**
   * Generic helper to update a single parameter and trigger parent callback.
   */
  const updateParam = <K extends keyof MonteCarloParams>(key: K, value: MonteCarloParams[K]) => {
    onParamsChange({ ...params, [key]: value });
  };

  const handleUseTotalPortfolio = () => updateParam('initialPortfolio', Math.round(totalNetWorth));
  const handleUseLiquidPortfolio = () => updateParam('initialPortfolio', Math.round(liquidNetWorth));

  const allocationSum = ALLOCATION_FIELDS.reduce((sum, f) => sum + params[f.key], 0);
  const allocationRemaining = 100 - allocationSum;

  const handleAllocationBlur = (key: AllocationKey) => {
    const value = parseFloat(allocationInputs[key]);
    if (!isNaN(value) && value >= 0 && value <= 100) {
      updateParam(key, value);
      setAllocationInputs((prev) => ({ ...prev, [key]: value.toString() }));
    } else {
      setAllocationInputs((prev) => ({ ...prev, [key]: params[key].toString() }));
    }
  };

  const handleInitialPortfolioChange = (value: string) => setInitialPortfolioInput(value);

  /**
   * Parses Italian-locale number format (e.g. "50.000,00" → 50000) on blur.
   */
  const handleInitialPortfolioBlur = () => {
    const cleanValue = initialPortfolioInput.replace(/[^\d,.-]/g, '');
    const normalizedValue = cleanValue.replace(',', '.');
    const value = parseFloat(normalizedValue);
    if (!isNaN(value) && value >= 0) {
      updateParam('initialPortfolio', Math.round(value));
      setInitialPortfolioInput(
        Math.round(value).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      );
    } else {
      setInitialPortfolioInput(
        params.initialPortfolio.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      );
    }
  };

  /**
   * Generic blur handler for per-class market parameters (return/volatility).
   * Validates within ±100% range before syncing.
   */
  const handleMarketParamBlur = (key: MarketParamKey) => {
    const value = parseFloat(marketInputs[key]);
    if (!isNaN(value) && value >= -100 && value <= 100) {
      updateParam(key, value);
      setMarketInputs((prev) => ({ ...prev, [key]: value.toFixed(1) }));
    } else {
      setMarketInputs((prev) => ({ ...prev, [key]: params[key].toFixed(1) }));
    }
  };

  const handleInflationBlur = () => {
    const value = parseFloat(inflationRateInput);
    if (!isNaN(value) && value >= -100 && value <= 100) {
      updateParam('inflationRate', value);
      setInflationRateInput(value.toFixed(1));
    } else {
      setInflationRateInput(params.inflationRate.toFixed(1));
    }
  };

  const canRunSimulation = params.initialPortfolio > 0 && params.annualWithdrawal > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Parametri Simulazione
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ===== Base params: always visible ===== */}

        {/* Patrimonio Iniziale */}
        <div className="space-y-3">
          <Label htmlFor="initialPortfolio" className="text-base font-semibold">
            Patrimonio Iniziale
          </Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUseTotalPortfolio}
              className="w-full sm:flex-1"
            >
              Usa Patrimonio Totale ({formatCurrency(totalNetWorth)})
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUseLiquidPortfolio}
              className="w-full sm:flex-1"
            >
              Usa Patrimonio Liquido ({formatCurrency(liquidNetWorth)})
            </Button>
          </div>
          <Input
            id="initialPortfolio"
            type="text"
            placeholder="Inserisci importo (€)"
            value={initialPortfolioInput}
            onChange={(e) => handleInitialPortfolioChange(e.target.value)}
            onBlur={handleInitialPortfolioBlur}
          />
        </div>

        {/* Anni di Pensionamento + Prelievo Annuale */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="retirementYears">Anni di Pensionamento</Label>
            <Input
              id="retirementYears"
              type="number"
              value={params.retirementYears}
              onChange={(e) => updateParam('retirementYears', parseInt(e.target.value) || 30)}
              onWheel={(e) => e.currentTarget.blur()}
              min="1"
              max="60"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">Durata del pensionamento</p>
          </div>
          <div>
            <Label htmlFor="annualWithdrawal">Prelievo Annuale (€)</Label>
            <Input
              id="annualWithdrawal"
              type="number"
              value={params.annualWithdrawal}
              onChange={(e) => updateParam('annualWithdrawal', parseInt(e.target.value, 10) || 0)}
              onWheel={(e) => e.currentTarget.blur()}
              step="1000"
              min="0"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">Spesa annuale durante il pensionamento</p>
          </div>
        </div>

        {/* Asset Allocation — 6 classes, must sum to 100% */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">Asset Allocation</Label>
            <span
              className={`text-xs font-medium ${
                Math.abs(allocationRemaining) < 0.01
                  ? 'text-green-600 dark:text-green-400'
                  : allocationRemaining > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-destructive'
              }`}
            >
              {Math.abs(allocationRemaining) < 0.01
                ? 'Totale: 100%'
                : `Rimanente: ${allocationRemaining > 0 ? '+' : ''}${allocationRemaining.toFixed(1)}%`}
            </span>
          </div>
          <div className="grid gap-4 grid-cols-2 desktop:grid-cols-3">
            {ALLOCATION_FIELDS.map((field) => (
              <div key={field.key}>
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  type="number"
                  value={allocationInputs[field.key]}
                  onChange={(e) => setAllocationInputs((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  onBlur={() => handleAllocationBlur(field.key)}
                  onWheel={(e) => e.currentTarget.blur()}
                  min="0"
                  max="100"
                  step="5"
                  className="mt-1"
                />
              </div>
            ))}
          </div>
          {Math.abs(allocationSum - 100) > 0.01 && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              La somma delle allocazioni deve essere 100% (attuale: {allocationSum.toFixed(1)}%)
            </p>
          )}
        </div>

        {/* ===== Advanced params: Collapsible (hidden entirely in scenario mode) ===== */}
        {!hideMarketParams && (
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <div className="group flex cursor-pointer select-none items-center justify-between border-t pt-4 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                <span>Parametri di mercato avanzati</span>
                <ChevronDown className="h-4 w-4 transition-transform duration-200 motion-reduce:transition-none group-data-[state=open]:rotate-180" />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-4 pt-4">
                <p className="text-xs text-muted-foreground">
                  Valori default basati su medie storiche di lungo periodo. Modifica per testare scenari diversi.
                </p>

                {MARKET_PARAM_FIELDS.map((field) => (
                  <div key={field.returnKey} className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor={field.returnKey}>Rendimento {field.label} (%/anno)</Label>
                      <Input
                        id={field.returnKey}
                        type="number"
                        value={marketInputs[field.returnKey]}
                        onChange={(e) => setMarketInputs((prev) => ({ ...prev, [field.returnKey]: e.target.value }))}
                        onBlur={() => handleMarketParamBlur(field.returnKey)}
                        onWheel={(e) => e.currentTarget.blur()}
                        step="0.1"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor={field.volatilityKey}>Volatilità {field.label} (%)</Label>
                      <Input
                        id={field.volatilityKey}
                        type="number"
                        value={marketInputs[field.volatilityKey]}
                        onChange={(e) => setMarketInputs((prev) => ({ ...prev, [field.volatilityKey]: e.target.value }))}
                        onBlur={() => handleMarketParamBlur(field.volatilityKey)}
                        onWheel={(e) => e.currentTarget.blur()}
                        step="0.1"
                        className="mt-1"
                      />
                    </div>
                  </div>
                ))}

                {/* Inflazione */}
                <div>
                  <Label htmlFor="inflationRate">Inflazione (%/anno)</Label>
                  <Input
                    id="inflationRate"
                    type="number"
                    value={inflationRateInput}
                    onChange={(e) => setInflationRateInput(e.target.value)}
                    onBlur={handleInflationBlur}
                    onWheel={(e) => e.currentTarget.blur()}
                    step="0.1"
                    className="mt-1"
                  />
                </div>

                {/* Numero di Simulazioni */}
                <div>
                  <Label htmlFor="numberOfSimulations">Numero di Simulazioni</Label>
                  <Input
                    id="numberOfSimulations"
                    type="number"
                    value={params.numberOfSimulations}
                    onChange={(e) =>
                      updateParam('numberOfSimulations', parseInt(e.target.value) || 10000)
                    }
                    onWheel={(e) => e.currentTarget.blur()}
                    step="1000"
                    min="1000"
                    max="50000"
                    className="mt-1"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Più simulazioni = risultati più accurati (ma più lente)
                  </p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* ===== Run Simulation CTA — always visible ===== */}
        <Button
          onClick={onRunSimulation}
          disabled={!canRunSimulation || isRunning}
          className="w-full"
          size="lg"
        >
          {isRunning ? 'Simulazione in corso...' : 'Esegui Simulazione'}
        </Button>
      </CardContent>
    </Card>
  );
}
