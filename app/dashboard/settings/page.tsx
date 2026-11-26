/**
 * SETTINGS PAGE — the orchestrator (2026-10-08).
 *
 * Five tabs, five views, ONE draft (RU9, 2026-11-26: Account · Funzioni · Cashflow · Investimenti ·
 * Avanzate, by «whose adjustment it is»; the old seven are aliases of `?tab=`, and `?tab=allocazione`
 * — the targets left for Allocazione › Strategia with RU8 — redirects there). Until 2026-10-08 this file was one 4100-line component with 70
 * `useState`s, and every keystroke re-ran the whole function (286 components per key on one
 * machine with the compiler on, 318 on another — the census, doc/guide/velocita.md). Now the page holds
 * the draft in a single `useReducer(settingsDraftReducer)`
 * (lib/utils/settingsDraft.ts) and each tab — `components/settings/tabs/*Tab.tsx` — is a
 * controlled view of its SLICE: it receives the slice, emits a patch, keeps no form state. It has
 * to be so: Radix unmounts an inactive panel, a view with fields of its own would lose them at
 * the first tab change, and «Salva» from another tab would never see them.
 *
 * What this file keeps:
 *   - the read: the settings document OBSERVED through the key every page shares (`useSettings`),
 *     seeding the draft during render — from the persisted cache at once on a warm visit, from
 *     the fresh read behind it while no tab is dirty; the skeleton only for a first visit;
 *   - the tab: which one is active, which ones were mounted (`aria-controls` only names a panel
 *     that exists), the `?tab=` canonicalised on mount only when absent, invalid or an old id;
 *     Account is in this page's JavaScript, the other four are chunks (`lazyComponent`) loaded
 *     when the document has been read and the browser is idle, or when their tab opens (P6);
 *   - the ONE «Salva»: `composeSettingsDocument` validates the tree as it will be written and
 *     names the first market figure out of range — the page then opens Avanzate;
 *   - the save state PER TAB: a dot on each tab holding edits (`isSliceDirty`), a bar at the
 *     bottom naming them, «Annulla modifiche» as a RE-READ of the saved document, never a copy.
 *
 * The colour theme and the light/dark mode are the exception: they save themselves (Account).
 */

'use client';

import { useCallback, useEffect, useEffectEvent, useMemo, useReducer, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save, Receipt, ToggleRight, UserRound, Landmark, Dices } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { setSettings } from '@/lib/services/assetAllocationService';
import {
  composeSettingsDocument,
  createSettingsDraft,
  parseFamilyMemberDrafts,
  DEFAULT_SETTINGS_TAB,
  isSliceDirty,
  resolveAvanzateGold,
  resolveRequestedTab,
  settingsDraftReducer,
  DIVIDENDI_TILE_ID,
  WRITABLE_TABS,
  type AccountSlice,
  type AvanzateSlice,
  type CashflowSlice,
  type FunzioniSlice,
  type InvestimentiSlice,
  type SettingsTabId,
} from '@/lib/utils/settingsDraft';
import type { Asset } from '@/types/assets';
import type { ExpenseCategory } from '@/types/expenses';
import { queryKeys } from '@/lib/query/queryKeys';
import { settingsQueryOptions, useSettings } from '@/lib/hooks/useSettings';
import { useAssets } from '@/lib/hooks/useAssets';
import { useExpenseCategories } from '@/lib/hooks/useExpenses';
import { useFreshness } from '@/lib/hooks/useFreshness';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageTabs } from '@/components/layout/PageTabs';
import type { TabDef } from '@/components/layout/PageTabBar';
import { usePublishOpenTab, useViewAreas } from '@/contexts/ViewAreasContext';
import { filterTabsByArea } from '@/lib/utils/viewAreas';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import { describeUnsavedChanges } from '@/lib/utils/settingsNarrative';
import { useMarketAnchors } from '@/lib/hooks/useMarketAnchors';
import { resolveRiskFreeEstimate } from '@/lib/utils/riskFreeRate';
import { AccountTab } from '@/components/settings/tabs/AccountTab';
import { runGuarded, SettingsTabFallback, SETTINGS_TABS_LAYOUT_ID } from '@/components/settings/tabs/shared';
import { lazyComponent, usePreloadWhenIdle } from '@/components/ui/lazy-component';
import {
  AVANZATE_SKELETON_CELLS,
  CASHFLOW_SETTINGS_SKELETON_CELLS,
  FUNZIONI_SKELETON_CELLS,
  INVESTIMENTI_SKELETON_CELLS,
} from '@/lib/constants/settingsTabSkeletons';
import { summarizeCategoryClassification } from '@/lib/utils/spendingRoles';
import { SAVED_BUTTON_CLASS, SaveButtonContent } from '@/components/ui/save-button-content';
import { useSavedFlash } from '@/lib/hooks/useSavedFlash';
import { cn } from '@/lib/utils';

// Module-level tab definitions drive both the mobile pill and the desktop underline tabs. Five
// tabs: the pill holds them without scrolling at 390 (the seven it replaced did not).
const SETTINGS_TABS: TabDef[] = [
  { value: 'account',      label: 'Account',      icon: UserRound   },
  { value: 'funzioni',     label: 'Funzioni',     icon: ToggleRight },
  { value: 'cashflow',     label: 'Cashflow',     icon: Receipt     },
  { value: 'investimenti', label: 'Investimenti', icon: Landmark    },
  { value: 'avanzate',     label: 'Avanzate',     icon: Dices       },
];

// The four tabs that are not the default load their code on demand (P6, D-RU23): the draft stays in
// this page (the views are controlled), so a chunk that arrives late loses nothing. Each draws its
// own skeleton until it arrives (`lazyComponent`, no Suspense) and they are preloaded once the
// document has been read. Never import a VALUE from these modules here: it would put them back in
// the page's initial graph (types only).
const FunzioniTab = lazyComponent(() => import('@/components/settings/tabs/FunzioniTab').then((m) => m.FunzioniTab));
const CashflowTab = lazyComponent(() => import('@/components/settings/tabs/CashflowTab').then((m) => m.CashflowTab));
const InvestimentiTab = lazyComponent(() => import('@/components/settings/tabs/InvestimentiTab').then((m) => m.InvestimentiTab));
const AvanzateTab = lazyComponent(() => import('@/components/settings/tabs/AvanzateTab').then((m) => m.AvanzateTab));
// A module-level array: `usePreloadWhenIdle` runs its effect on its identity.
const SETTINGS_LAZY_TABS = [FunzioniTab, CashflowTab, InvestimentiTab, AvanzateTab];

const EMPTY_CATEGORIES: ExpenseCategory[] = [];
const EMPTY_ASSETS: Asset[] = [];

const PAGE_HEADER = { label: 'Configurazione', title: 'Impostazioni', description: 'Account, funzioni e regole di calcolo' } as const;

export default function SettingsPage() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const { saved: justSaved, flash: flashSaved } = useSavedFlash();

  // THE draft: one reducer, one slice per tab (lib/utils/settingsDraft.ts).
  const [draft, dispatch] = useReducer(settingsDraftReducer, undefined, createSettingsDraft);
  const { account, funzioni, cashflow, investimenti, avanzate } = draft.slices;
  const setAccount = (patch: Partial<AccountSlice>) => dispatch({ type: 'account/set', patch });
  const setFunzioni = (patch: Partial<FunzioniSlice>) => dispatch({ type: 'funzioni/set', patch });
  const setCashflow = (patch: Partial<CashflowSlice>) => dispatch({ type: 'cashflow/set', patch });
  const setInvestimenti = (patch: Partial<InvestimentiSlice>) => dispatch({ type: 'investimenti/set', patch });
  const setAvanzate = (patch: Partial<AvanzateSlice>) => dispatch({ type: 'avanzate/set', patch });

  // The expense categories from the key Cashflow, Analisi and the expense form read (2026-09-29).
  // `isLoading` is true before the first read, so an empty list is «not read yet», never «no
  // categories»; `isError` = the categories were not read, and every tile fed by them says so.
  const categoriesQuery = useExpenseCategories(ownerId);
  const { data: expenseCategories = EMPTY_CATEGORIES, isLoading: loadingCategories, isError: categoriesFailed } = categoriesQuery;

  // The cash accounts for the default debit/credit pickers, from the assets key: an actual conto,
  // not just a "cash-class" asset — a money-market ETF (assetClass 'cash') is not a settlement
  // account. Strict convention (doc/guide/patrimonio.md § Asset Pricing, FX and Assets). A failed
  // read is `isError`, never `[]`: the tile used to tell the reader to create an account they had.
  const accountsQuery = useAssets(ownerId);
  const { data: allAssets = EMPTY_ASSETS, isLoading: loadingAccounts, isError: accountsFailed } = accountsQuery;
  const cashAssets = useMemo(() => allAssets.filter((a) => a.type === 'cash' && a.assetClass === 'cash'), [allAssets]);

  // The settings document, OBSERVED through the key every page shares (2026-10-08). On a warm
  // visit the persisted cache hands the document at once and the form is seeded from it — no
  // skeleton — while the fresh read lands behind, dated by «Aggiornato alle…» in the header
  // (the owner's decision of 2026-09-29, doc/guide/impostazioni.md). The skeleton is for the first
  // visit of the account only.
  const settingsQuery = useSettings(ownerId);
  const marketAnchors = useMarketAnchors();
  const riskFreeEstimate = resolveRiskFreeEstimate(marketAnchors);
  const settingsDocument = settingsQuery.data; // undefined = not read yet; null = no document
  const freshness = useFreshness([settingsQuery, categoriesQuery, accountsQuery]);
  // After the document is read, never during it: a preload is a download competing with the first read.
  usePreloadWhenIdle(SETTINGS_LAZY_TABS, settingsDocument !== undefined);

  // Tab navigation — lazy-loading pattern (same as Assets/Cashflow pages): Account is the default,
  // every panel mounts once opened; `aria-controls` may only name a panel that exists. The old
  // `?tab=` ids are aliases (D-RU21) and `?tab=allocazione` is the old address of the targets
  // (bookmarks, links in emails): it lands on Allocazione › Strategia (RU8, D-ST1), by `replace`,
  // so the back button does not return to a redirect.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = resolveRequestedTab(searchParams.get('tab'));
  const initialTab: SettingsTabId = requested.kind === 'tab' ? requested.tab : DEFAULT_SETTINGS_TAB;
  const [mountedTabs, setMountedTabs] = useState<Set<SettingsTabId>>(new Set([initialTab]));
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const renderedPanels = new Set<string>(mountedTabs);
  // `?focus=dividendi`: the old `?tab=dividendi` and the gear of Cashflow › Dividendi (a tab change drops it).
  const focusDividendi = searchParams.get('focus') === DIVIDENDI_TILE_ID;

  const handleTabChange = (value: string) => {
    setActiveTab(value as SettingsTabId);
    setMountedTabs((prev) => new Set(prev).add(value as SettingsTabId));
    router.replace(`${pathname}?tab=${value}`, { scroll: false });
  };

  // Canonicalize the URL on mount only when the tab param is absent, invalid or an old id (as
  // Cashflow does): an unconditional replace re-rendered every `useSearchParams` consumer of the
  // shell. An Effect Event: the URL and the router are read, never triggers — it runs once, at mount.
  const canonicalizeTabParam = useEffectEvent(() => {
    if (requested.kind === 'redirect') {
      router.replace(requested.href);
      return;
    }
    if (searchParams.get('tab') !== initialTab) {
      const focus = requested.focusDividendi ? `&focus=${DIVIDENDI_TILE_ID}` : '';
      router.replace(`${pathname}?tab=${initialTab}${focus}`, { scroll: false });
    }
  });
  useEffect(() => {
    canonicalizeTabParam();
  }, []);

  // One dirty flag per tab that has fields «Salva» writes — each slice holds the fields of the
  // tab that EDITS them (doc/guide/impostazioni.md § Settings — the FIVE places). The tab
  // definitions are rebuilt only when the SET of dirty tabs changes (a string key, not the draft):
  // the two tab bars and their icons re-rendered on every keystroke otherwise (the census, 2026-10-08).
  const unsavedKey = WRITABLE_TABS.filter((tab) => draft.loaded && isSliceDirty(tab, draft.slices, draft.saved)).join(',');
  const settingsTabs = useMemo(() => {
    const unsaved = new Set(unsavedKey.split(','));
    return SETTINGS_TABS.map((tab) => ({ ...tab, unsaved: unsaved.has(tab.value) }));
  }, [unsavedKey]);
  // The viewer's view (doc/essenziale/README.md D-ES12): Avanzate follows Simulazioni; the other four tabs always. A
  // hidden tab with unsaved edits still counts in the sentence below (the draft is the page's, not the bar's).
  const { areas: viewAreas } = useViewAreas();
  const shownSettingsTabs = filterTabsByArea('/dashboard/settings', settingsTabs, viewAreas, activeTab);
  const shownLoadingTabs = filterTabsByArea('/dashboard/settings', SETTINGS_TABS, viewAreas, activeTab);
  usePublishOpenTab('/dashboard/settings', activeTab);
  const unsavedSentence = describeUnsavedChanges(settingsTabs.filter((tab) => tab.unsaved).map((tab) => tab.label));
  const hasUnsavedChanges = unsavedSentence !== null;

  // The draft is seeded from the document — settled DURING render on the (owner, read) subject
  // (AGENTS.md § Motion, the third answer): the first document of this owner seeds it, a fresher
  // read reseeds it ONLY while no tab is dirty — a co-owner's save never overwrites what the
  // reader is typing; it lands at the next «Salva» or «Annulla», which re-read anyway.
  const seedSubject = settingsDocument === undefined ? null : `${ownerId}:${settingsQuery.dataUpdatedAt}`;
  const [seededFrom, setSeededFrom] = useState<string | null>(null);
  if (seedSubject !== null && seedSubject !== seededFrom && !(draft.loaded && hasUnsavedChanges)) {
    setSeededFrom(seedSubject);
    dispatch({ type: 'reset', document: settingsDocument ?? null });
  }
  // The skeleton: this owner's document not read yet and not failed (a first visit, or a switch to
  // an account never read). A failed FIRST read is not a form full of defaults (below).
  const loading = settingsDocument === undefined && !settingsQuery.isError;
  const loadFailed = settingsDocument === undefined && settingsQuery.isError;

  // Re-read the categories after a write in Spese (a category created, moved, deleted, imported)
  // and «Riprova»: an invalidation of the key every reader shares, never a private re-read.
  const loadExpenseCategories = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.expenses.categories(ownerId || '') }),
    [queryClient, ownerId],
  );

  /** «Riprova» on the accounts: the assets key, which Patrimonio invalidates on every write. */
  const loadCashAccounts = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId || '') }),
    [queryClient, ownerId],
  );

  // Invalidate every Cashflow query key that reads expenses/categories/overview data (the import
  // may have created categories), so the freshly imported transactions show up without a manual
  // page reload.
  const handleExpenseImported = () => {
    if (ownerId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all(ownerId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.categories(ownerId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) });
    }
  };

  const handleSave = async () => {
    if (!user || !ownerId) return;

    // Validated as it will be written, BEFORE any read: a refused save
    // costs no round trip. The fields the document carries through (the FIRE plan's and the
    // optimizer's) come from the CURRENT document, pre-read below. The Oro in force and the
    // baseline are what the Avanzate write needs (it is written only when that tab holds edits).
    const context = {
      saved: draft.saved,
      effectiveGoldSubCategory: resolveAvanzateGold(avanzate, settingsDocument?.targets, allAssets).effectiveGoldSubCategory,
    };
    const checked = composeSettingsDocument(draft.slices, null, context);
    if (!checked.ok) {
      const [first, ...others] = checked.marketProblems;
      handleTabChange('avanzate');
      toast.error(`Ipotesi di mercato fuori intervallo — ${first.message}${others.length > 0 ? ` (+${others.length})` : ''}`);
      return;
    }

    await runGuarded(async () => {
      setSaving(true);

      // Fetch the CURRENT settings (never the cache) to preserve the fields other pages write.
      const current = await queryClient.fetchQuery({ ...settingsQueryOptions(ownerId), staleTime: 0 });
      const composed = composeSettingsDocument(draft.slices, current, context);
      if (!composed.ok) return; // the same tree was just validated

      await setSettings(ownerId, composed.document);
      toast.success('Impostazioni salvate');
      flashSaved();
      if (composed.adaptedPairs.length > 0) {
        toast.warning(`Correlazioni corrette: ${composed.adaptedPairs.length} ${composed.adaptedPairs.length === 1 ? 'coppia adattata' : 'coppie adattate'} per renderle coerenti`);
      }
      // Other consumers (AssetDialog's family-member Select, PensionOverview) read settings via
      // React Query with a 5-minute staleTime — without this, a just-added member wouldn't be
      // selectable there until that cache naturally expired. Awaited BEFORE the baseline moves:
      // the pre-read above stamped the cache with the document as it was before this write, and a
      // clean draft reseeds from the newest read — so a «saved» dispatched first was reseeded from
      // that stale read, and a legacy market (still `migrated` there) put the bar back.
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.all(ownerId) });
      // The baseline is what was WRITTEN (the corrected market), so an adapted pair does not
      // leave the tab marked as unsaved.
      dispatch({ type: 'saved', avanzate: composed.avanzate });
    }, (error) => {
      console.error('Error saving settings:', error);
      toast.error('Errore nel salvataggio delle impostazioni');
    }, () => {
      setSaving(false);
    });
  };

  // «Annulla modifiche»: back to what is saved, by READING it again (the current document,
  // `staleTime: 0`, through the shared key) — never a copy kept in memory, so a co-owner's save
  // comes back too. A failed re-read leaves the draft as it is and says so.
  const handleRevert = async () => {
    if (!ownerId) return;
    await runGuarded(async () => {
      const document = await queryClient.fetchQuery({ ...settingsQueryOptions(ownerId), staleTime: 0 });
      dispatch({ type: 'reset', document });
      toast.info('Modifiche annullate: il modulo mostra di nuovo le impostazioni salvate.');
    }, (error) => {
      console.error('Error re-reading the settings:', error);
      toast.error('Lettura delle impostazioni fallita: le modifiche restano nel modulo.');
    });
  };

  // A reload or a closed tab with edits pending asks first (the browser's own prompt). An
  // in-app link does not: the App Router has no navigation guard, so the bar at the bottom is
  // the reminder there.
  useEffect(() => {
    if (!hasUnsavedChanges || isDemo) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedChanges, isDemo]);

  if (loading) {
    return (
      <PageContainer>
        <PageHeader {...PAGE_HEADER} freshness={freshness} />
        <PageTabs
          tabs={shownLoadingTabs}
          value={activeTab}
          onValueChange={handleTabChange}
          layoutId={SETTINGS_TABS_LAYOUT_ID}
          ariaLabel="Sezioni delle Impostazioni"
          loading
        >
          <TileGridSkeleton verdict={false} className="mt-4" cells={[{ span: 5 }, { span: 7 }, { span: 12, lines: 8 }]} />
        </PageTabs>
      </PageContainer>
    );
  }

  // A failed read must not become a form full of defaults: saving those would OVERWRITE the
  // settings that were never read (lib/utils/statesNarrative.ts).
  if (loadFailed) {
    return (
      <PageContainer>
        <PageHeader {...PAGE_HEADER} freshness={freshness} />
        <ErrorNotice
          className="mt-4 max-w-[920px]"
          onRetry={() => void settingsQuery.refetch()}
          notice={describeReadFailure({
            consequence:
              'Le tue impostazioni non sono state lette: il modulo mostrerebbe i valori predefiniti, e salvarli sovrascriverebbe i tuoi.',
            untouched: 'Nessuna impostazione è stata modificata.',
            canRetry: true,
          })}
        />
      </PageContainer>
    );
  }

  const categoriesState = resolveSurfaceState({ loading: loadingCategories, failed: categoriesFailed });
  // The cash sub-categories (the «Conto» of the default debit) as SAVED: their editor is
  // Allocazione › Strategia now, and an unsaved edit there is not a place money can sit yet.
  const cashConfig = settingsDocument?.targets?.cash?.subCategoryConfig;
  const cashSubCategories = cashConfig?.enabled ? cashConfig.categories : [];
  const accountsState = resolveSurfaceState({ loading: loadingAccounts, failed: accountsFailed });
  // Funzioni's reading and its Ruoli row: Famiglia's size (the Divisione needs two) and how far the roles got.
  const familyMemberCount = parseFamilyMemberDrafts(account.familyMembers).length;
  const categoryClassification = summarizeCategoryClassification(expenseCategories);

  return (
    <PageContainer>
      <PageHeader
        {...PAGE_HEADER}
        freshness={freshness}
        actions={
          <div className="flex items-center gap-2">
            {/* The save STATE is the bar at the bottom of the page (it names the tabs) and the dot
                on each tab; the header keeps the actions. In demo the disabled reason is visible
                copy (never a title). */}
            {isDemo && (
              <span className="hidden sm:inline-flex items-center rounded-full border border-border bg-muted px-2 py-1 text-xs text-foreground">
                Modalità demo: salvataggio disattivato
              </span>
            )}
            <Button size="sm" data-band-label="" onClick={handleSave} disabled={isDemo || saving} className={cn('h-11 desktop:h-8', justSaved && SAVED_BUTTON_CLASS)}>
              <SaveButtonContent saving={saving} saved={justSaved} icon={<Save className="h-4 w-4" />} idle="Salva" />
            </Button>
          </div>
        }
      />

      <PageTabs
        tabs={shownSettingsTabs}
        value={activeTab}
        onValueChange={handleTabChange}
        layoutId={SETTINGS_TABS_LAYOUT_ID}
        ariaLabel="Sezioni delle Impostazioni"
        renderedPanels={renderedPanels}
      >
        {/* Each view is a controlled view of its slice. Account is in this page's JavaScript; the
            other four are chunks that draw a skeleton of their own geometry until they arrive. */}
        {mountedTabs.has('account') && (
          <AccountTab slice={account} onChange={setAccount} ownerId={ownerId} isDemo={isDemo} />
        )}

        {mountedTabs.has('funzioni') && (
          <FunzioniTab
            fallback={<SettingsTabFallback tab="funzioni" label="Funzioni" cells={FUNZIONI_SKELETON_CELLS} />}
            slice={funzioni}
            onChange={setFunzioni}
            familyMemberCount={familyMemberCount}
            classification={categoryClassification}
            categoriesState={categoriesState}
          />
        )}

        {mountedTabs.has('cashflow') && (
          <CashflowTab
            fallback={<SettingsTabFallback tab="cashflow" label="Cashflow" cells={CASHFLOW_SETTINGS_SKELETON_CELLS} />}
            slice={cashflow}
            onChange={setCashflow}
            ownerId={ownerId}
            isDemo={isDemo}
            focusDividendi={focusDividendi}
            spendingRolesEnabled={funzioni.spendingRolesEnabled}
            expenseCategories={expenseCategories}
            categoriesState={categoriesState}
            onRetryCategories={loadExpenseCategories}
            cashAssets={cashAssets}
            accountsState={accountsState}
            onRetryAccounts={() => void loadCashAccounts()}
            onExpenseImported={handleExpenseImported}
          />
        )}

        {mountedTabs.has('investimenti') && (
          <InvestimentiTab
            fallback={<SettingsTabFallback tab="investimenti" label="Investimenti" cells={INVESTIMENTI_SKELETON_CELLS} />}
            slice={investimenti}
            onChange={setInvestimenti}
            cashSubCategories={cashSubCategories}
            riskFreeEstimate={riskFreeEstimate}
          />
        )}

        {mountedTabs.has('avanzate') && (
          <AvanzateTab
            fallback={<SettingsTabFallback tab="avanzate" label="Avanzate" cells={AVANZATE_SKELETON_CELLS} />}
            slice={avanzate}
            saved={draft.saved}
            onChange={setAvanzate}
            assets={accountsQuery.data}
            {...resolveAvanzateGold(avanzate, settingsDocument?.targets, accountsQuery.data)}
            isDemo={isDemo}
          />
        )}
      </PageTabs>

      {/* The save state, where the thumb and the eye are: a bar that sticks to the bottom of the
          scroll area while any tab holds edits, naming them, with the way back beside «Salva».
          Sticky, not fixed: it lives in `<main>`'s flow, so its offset is measured from the
          scroller's content edge — clear of the phone's bottom pill (main's 88px portrait
          padding) and of the sidebar on desktop without a single hand-tuned inset. */}
      {!isDemo && unsavedSentence && (
        <div className="sticky bottom-4 z-20 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2">
          <section
            aria-label="Modifiche non salvate"
            className="mx-auto flex max-w-[720px] flex-wrap desktop:ml-0 items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-lg"
          >
            <p className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-foreground">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              {unsavedSentence}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="sm" className="h-11 desktop:h-8" onClick={() => void handleRevert()} disabled={saving}>
                Annulla modifiche
              </Button>
              <Button size="sm" className={cn('h-11 desktop:h-8', justSaved && SAVED_BUTTON_CLASS)} onClick={handleSave} disabled={saving}>
                <SaveButtonContent saving={saving} saved={justSaved} icon={<Save className="h-4 w-4" />} idle="Salva" />
              </Button>
            </div>
          </section>
        </div>
      )}
      {/* Said once when the set of unsaved tabs changes; the bar above is its visible twin. */}
      <span className="sr-only" role="status" aria-live="polite">
        {isDemo ? '' : unsavedSentence ?? ''}
      </span>
    </PageContainer>
  );
}
