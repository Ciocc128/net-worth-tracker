'use client';

/**
 * Impostazioni › Account (`account`, the tab the page opens on) — whose adjustments these are: the
 * person and the house. The appearance (mode, colour theme: they save themselves), Famiglia (one
 * RAL/eligibility per taxpayer: the IRPEF ceiling is per person), the account's sharing and the
 * periodic emails. What the Assistant's own popover owns is pointed at in «Si regola altrove», not
 * copied here (D-RU20).
 *
 * A controlled view of the `account` slice: `slice` in, `onChange(patch)` out. What stays local is
 * ephemeral — a recipient being typed, a test send in flight, the dev dialogs.
 */

import { useState } from 'react';
import { FlaskConical, Plus, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Tile, TILE_CELL_CLASS, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { AccountSharingSection } from '@/components/settings/AccountSharingSection';
import { AppearanceTiles } from '@/components/settings/AppearanceTiles';
import { CreateDummySnapshotModal } from '@/components/CreateDummySnapshotModal';
import { DeleteDummyDataDialog } from '@/components/DeleteDummyDataDialog';
import { cn } from '@/lib/utils';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { describeEmails, describeFamily } from '@/lib/utils/settingsNarrative';
import { parseFamilyMemberDrafts, type AccountSlice, type FamilyMemberDraft } from '@/lib/utils/settingsDraft';
import { ElsewhereLine, INTERACTIVE_CONTROL_CLASS, runGuarded, SettingsTabPanel } from './shared';

// The assistant is a route gated by this flag; its «Si regola altrove» pointer follows the same gate.
const SHOW_ASSISTANT = process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED !== 'false';

const ELSEWHERE = SHOW_ASSISTANT
  ? [{ what: 'Preferenze dell\'Assistente (stile, memoria, contesto web)', where: 'Assistente', href: '/dashboard/assistant' }]
  : [];

type TestEmailType = 'monthly' | 'quarterly' | 'semiannual' | 'yearly' | 'weekly-budget';

// Famiglia — a local id for a member row. CoastFireTab.tsx has an identical `createLocalId`, not
// exported; duplicated here rather than introducing a cross-module import for a one-line helper.
function createFamilyMemberId(): string {
  return `family-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface AccountTabProps {
  slice: AccountSlice;
  onChange: (patch: Partial<AccountSlice>) => void;
  /** For the dev-only snapshot tools. */
  ownerId: string | undefined;
  isDemo: boolean;
}

export function AccountTab({ slice, onChange, ownerId, isDemo }: AccountTabProps) {
  const {
    monthlyEmailEnabled, quarterlyEmailEnabled, semiAnnualEmailEnabled, yearlyEmailEnabled,
    weeklyBudgetEmailEnabled, monthlyEmailRecipients, familyMembers,
  } = slice;

  // Ephemeral — not part of the slice: a recipient being typed, a send in flight, the dev tools.
  const [newEmailInput, setNewEmailInput] = useState<string>('');
  const [sendingTestEmailType, setSendingTestEmailType] = useState<TestEmailType | null>(null);
  const [dummySnapshotModalOpen, setDummySnapshotModalOpen] = useState(false);
  const [deleteDummyDataDialogOpen, setDeleteDummyDataDialogOpen] = useState(false);
  const enableTestSnapshots = process.env.NEXT_PUBLIC_ENABLE_TEST_SNAPSHOTS === 'true';

  const familyMembersForReading = parseFamilyMemberDrafts(familyMembers);
  const anyEmailEnabled = monthlyEmailEnabled || quarterlyEmailEnabled || semiAnnualEmailEnabled || yearlyEmailEnabled || weeklyBudgetEmailEnabled;

  // Famiglia — add/update/remove a member row, each a patch of the slice.
  const addFamilyMemberRow = () => {
    onChange({
      familyMembers: [
        ...familyMembers,
        { id: createFamilyMemberId(), name: '', grossAnnualIncome: '', isFirstEmploymentPost2007: false, firstEmploymentYear: '' },
      ],
    });
  };
  const updateFamilyMemberRow = (id: string, field: keyof Omit<FamilyMemberDraft, 'id'>, value: string | boolean) => {
    onChange({ familyMembers: familyMembers.map((member) => (member.id === id ? { ...member, [field]: value } : member)) });
  };
  const removeFamilyMemberRow = (id: string) => {
    onChange({ familyMembers: familyMembers.filter((member) => member.id !== id) });
  };

  // A recipient is a draft edit like any other: it waits for «Salva».
  const addRecipient = () => {
    const email = newEmailInput.trim();
    if (email && !monthlyEmailRecipients.includes(email)) {
      onChange({ monthlyEmailRecipients: [...monthlyEmailRecipients, email] });
      setNewEmailInput('');
    }
  };

  const sendTestEmail = async (type: TestEmailType) => {
    setSendingTestEmailType(type);
    await runGuarded(async () => {
      const res = await authenticatedFetch('/api/user/monthly-email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodType: type }),
      });
      if (res.ok) {
        toast.success('Email inviata ai destinatari.');
      } else {
        const resBody = await res.json().catch(() => ({}));
        toast.error(resBody.error ?? "Errore durante l'invio");
      }
    }, () => {
      toast.error("Errore durante l'invio dell'email");
    }, () => {
      setSendingTestEmailType(null);
    });
  };

  return (
    <SettingsTabPanel tab="account" label="Account">
      {/* Modalità and Tema colori — they save themselves */}
      <AppearanceTiles />

      {/* Famiglia — one RAL/eligibility per taxpayer (the IRPEF ceiling is per person) */}
      <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
        <Tile
          eyebrow="Famiglia"
          aside={familyMembers.length === 1 ? '1 membro' : `${familyMembers.length} membri`}
          reading={describeFamily({ members: familyMembersForReading })}
        >
          {familyMembers.length > 0 && (
            <div className="mt-3 hidden grid-cols-[minmax(0,1fr)_120px_150px_110px_44px] items-center gap-x-3 pb-1.5 desktop:grid">
              <span className={TILE_SUB_EYEBROW_CLASS}>Nome</span>
              <span className={TILE_SUB_EYEBROW_CLASS}>RAL</span>
              <span className={TILE_SUB_EYEBROW_CLASS}>Prima occupazione dopo il 2007</span>
              <span className={TILE_SUB_EYEBROW_CLASS}>Primo anno</span>
              <span aria-hidden="true" />
            </div>
          )}
          <div className="flex flex-col divide-y divide-border">
            {familyMembers.map((member) => (
              <div
                key={member.id}
                className="grid grid-cols-2 items-center gap-3 py-3 desktop:grid-cols-[minmax(0,1fr)_120px_150px_110px_44px] desktop:gap-x-3"
              >
                <Input
                  value={member.name}
                  onChange={(e) => updateFamilyMemberRow(member.id, 'name', e.target.value)}
                  placeholder="Nome"
                  aria-label="Nome del membro"
                  disabled={isDemo}
                  className={cn('col-span-2 desktop:col-span-1', INTERACTIVE_CONTROL_CLASS)}
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  value={member.grossAnnualIncome}
                  onChange={(e) => updateFamilyMemberRow(member.id, 'grossAnnualIncome', e.target.value)}
                  placeholder="RAL"
                  aria-label="Reddito annuo lordo (RAL)"
                  disabled={isDemo}
                  className={cn('text-right font-mono', INTERACTIVE_CONTROL_CLASS)}
                />
                <div className="flex items-center justify-end gap-2 desktop:justify-start">
                  <Switch
                    id={`family-firstjob-${member.id}`}
                    checked={member.isFirstEmploymentPost2007}
                    onCheckedChange={(checked) => updateFamilyMemberRow(member.id, 'isFirstEmploymentPost2007', checked)}
                    disabled={isDemo}
                    aria-label="Prima occupazione dopo il 2007"
                    className={INTERACTIVE_CONTROL_CLASS}
                  />
                  <Label htmlFor={`family-firstjob-${member.id}`} className="text-[11px] text-muted-foreground desktop:hidden">
                    Post 2007
                  </Label>
                </div>
                <Input
                  type="number"
                  value={member.firstEmploymentYear}
                  onChange={(e) => updateFamilyMemberRow(member.id, 'firstEmploymentYear', e.target.value)}
                  placeholder="anno"
                  aria-label="Anno di prima occupazione"
                  disabled={isDemo || !member.isFirstEmploymentPost2007}
                  className={cn('text-right font-mono', INTERACTIVE_CONTROL_CLASS)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFamilyMemberRow(member.id)}
                  disabled={isDemo}
                  aria-label={`Rimuovi ${member.name || 'membro'}`}
                  className="h-10 w-10 justify-self-end shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className={familyMembers.length > 0 ? 'mt-2' : 'mt-3'}>
            <Button type="button" variant="outline" size="sm" onClick={addFamilyMemberRow} disabled={isDemo}>
              <Plus className="mr-2 h-4 w-4" />
              Aggiungi membro
            </Button>
          </div>
          <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
            Colleghi un fondo pensione a un membro dalla sua scheda in Patrimonio; «Prima occupazione dopo il 2007»
            abilita il recupero del plafond di deducibilità.
          </div>
        </Tile>
      </div>

      {/* Condivisione account — its own tile and documents: a grant is written where it is granted */}
      <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
        <AccountSharingSection disabled={isDemo} />
      </div>

      {/* Email periodiche — toggles + recipients + manual send */}
      <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
        <Tile
          eyebrow="Email periodiche"
          aside={monthlyEmailRecipients.length === 1 ? '1 destinatario' : `${monthlyEmailRecipients.length} destinatari`}
          reading={describeEmails({
            monthly: monthlyEmailEnabled,
            quarterly: quarterlyEmailEnabled,
            semiAnnual: semiAnnualEmailEnabled,
            yearly: yearlyEmailEnabled,
            weeklyBudget: weeklyBudgetEmailEnabled,
            recipientCount: monthlyEmailRecipients.length,
          })}
        >
          <div className="mt-1 grid grid-cols-1 gap-x-10 desktop:grid-cols-2">
            <div className="flex flex-col divide-y divide-border">
              {([
                { id: 'monthlyEmailEnabled', label: 'Report mensile', help: "L'ultimo giorno del mese", checked: monthlyEmailEnabled },
                { id: 'quarterlyEmailEnabled', label: 'Report trimestrale', help: 'Marzo, giugno, settembre e dicembre', checked: quarterlyEmailEnabled },
                { id: 'semiAnnualEmailEnabled', label: 'Report semestrale', help: '30 giugno e 31 dicembre', checked: semiAnnualEmailEnabled },
                { id: 'yearlyEmailEnabled', label: 'Report annuale', help: 'Il 31 dicembre', checked: yearlyEmailEnabled },
                { id: 'weeklyBudgetEmailEnabled', label: 'Report budget settimanale', help: 'Ogni domenica, con lo stato dei budget', checked: weeklyBudgetEmailEnabled },
              ] as const).map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <Label htmlFor={row.id} className="text-[13px] font-medium">{row.label}</Label>
                    <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">{row.help}</p>
                  </div>
                  <Switch
                    id={row.id}
                    checked={row.checked}
                    onCheckedChange={(checked) => onChange({ [row.id]: checked })}
                    disabled={isDemo}
                    className={cn('shrink-0', INTERACTIVE_CONTROL_CLASS)}
                  />
                </div>
              ))}
            </div>

            {anyEmailEnabled && (
              <div className="mt-4 flex flex-col desktop:mt-0 desktop:border-l desktop:border-border desktop:pl-10">
                <p className={cn(TILE_SUB_EYEBROW_CLASS, 'pt-3')}>Destinatari</p>
                <div className="mt-2 flex gap-2">
                  <Input
                    type="email"
                    placeholder="email@esempio.com"
                    value={newEmailInput}
                    onChange={(e) => setNewEmailInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addRecipient();
                      }
                    }}
                    disabled={isDemo}
                    aria-label="Nuovo destinatario"
                    className={INTERACTIVE_CONTROL_CLASS}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isDemo || !newEmailInput.trim() || monthlyEmailRecipients.includes(newEmailInput.trim())}
                    onClick={addRecipient}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Aggiungi
                  </Button>
                </div>

                {monthlyEmailRecipients.length > 0 && (
                  <ul className="mt-2.5 space-y-2">
                    {monthlyEmailRecipients.map((email) => (
                      <li
                        key={email}
                        className="flex items-center justify-between rounded-md border border-border bg-muted/30 py-0.5 pl-3 pr-0.5 text-sm"
                      >
                        <span className="truncate text-foreground">{email}</span>
                        {/* Removing a recipient is a draft edit like any other: it waits for «Salva». */}
                        <button
                          type="button"
                          aria-label={`Rimuovi ${email}`}
                          disabled={isDemo}
                          onClick={() => onChange({ monthlyEmailRecipients: monthlyEmailRecipients.filter((r) => r !== email) })}
                          className="ml-3 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40 desktop:h-8 desktop:w-8"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3.5 flex flex-wrap gap-2">
                  {([
                    { type: 'monthly' as const, label: 'Invia mensile ora', enabled: monthlyEmailEnabled },
                    { type: 'quarterly' as const, label: 'Invia trimestrale ora', enabled: quarterlyEmailEnabled },
                    { type: 'semiannual' as const, label: 'Invia semestrale ora', enabled: semiAnnualEmailEnabled },
                    { type: 'yearly' as const, label: 'Invia annuale ora', enabled: yearlyEmailEnabled },
                    { type: 'weekly-budget' as const, label: 'Invia report budget ora', enabled: weeklyBudgetEmailEnabled },
                  ] as const).filter(({ enabled }) => enabled).map(({ type, label }) => (
                    <Button
                      key={type}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isDemo || monthlyEmailRecipients.length === 0 || sendingTestEmailType !== null}
                      onClick={() => void sendTestEmail(type)}
                    >
                      {sendingTestEmailType === type ? (
                        <span className="flex items-center gap-2">
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Invio in corso…
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Send className="h-4 w-4" />
                          {label}
                        </span>
                      )}
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-[1.45] text-muted-foreground">
                  Invia il riepilogo del periodo corrente per verificare il formato. Salva prima le impostazioni.
                </p>
              </div>
            )}
          </div>
        </Tile>
      </div>

      <ElsewhereLine items={ELSEWHERE} />

      {/* Development Features — clearly separated from user-facing settings, only shown in dev mode */}
      {enableTestSnapshots && (
        <div className="mt-6 border-t border-border pt-6 space-y-4 tablet:col-span-2 desktop:col-span-12">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-orange-500" />
            <p className="text-xs text-orange-500">Strumenti di sviluppo</p>
          </div>
          <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/10 dark:border-orange-900">
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="rounded-lg bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-800 p-4">
                <p className="text-sm text-orange-900 dark:text-orange-200 font-semibold">⚠️ Attenzione</p>
                <p className="text-sm text-orange-800 dark:text-orange-300 mt-1">
                  Questa sezione è visibile solo quando la variabile d&apos;ambiente{' '}
                  <code className="bg-orange-200 dark:bg-orange-800 px-1 rounded">NEXT_PUBLIC_ENABLE_TEST_SNAPSHOTS</code>{' '}
                  è impostata su <code className="bg-orange-200 dark:bg-orange-800 px-1 rounded">true</code>.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-foreground">Generazione Snapshot di Test</h3>
                <p className="text-sm text-muted-foreground">
                  Genera snapshot mensili fittizi per testare grafici e statistiche.
                  Gli snapshot verranno salvati nella stessa collection Firebase degli snapshot reali.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setDummySnapshotModalOpen(true)}
                  className="border-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/30"
                >
                  <FlaskConical className="mr-2 h-4 w-4" />
                  Genera Snapshot di Test
                </Button>
              </div>

              <div className="space-y-3 border-t border-orange-200 dark:border-orange-800 pt-4">
                <h3 className="font-semibold text-sm text-foreground">Eliminazione Dati di Test</h3>
                <p className="text-sm text-muted-foreground">
                  Elimina tutti i dati dummy (snapshot, spese e categorie) in un&apos;unica operazione.
                  Questa azione è irreversibile.
                </p>
                <Button
                  variant="destructive"
                  onClick={() => setDeleteDummyDataDialogOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Elimina Tutti i Dati Dummy
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {enableTestSnapshots && (
        <CreateDummySnapshotModal
          open={dummySnapshotModalOpen}
          onOpenChange={setDummySnapshotModalOpen}
          userId={ownerId || ''}
        />
      )}
      {enableTestSnapshots && (
        <DeleteDummyDataDialog
          open={deleteDummyDataDialogOpen}
          onOpenChange={setDeleteDummyDataDialogOpen}
          userId={ownerId || ''}
          onDeleted={() => {
            // Refresh page or data after deletion
            window.location.reload();
          }}
        />
      )}
    </SettingsTabPanel>
  );
}
