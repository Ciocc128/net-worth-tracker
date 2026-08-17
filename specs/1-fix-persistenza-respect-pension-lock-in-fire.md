# Spec 1 — Fix persistenza di `respectPensionLockInFire`

> **Ordine**: 1 di 5. Nessuna dipendenza. È prerequisito della Spec 3 (che riusa questo campo).
> **Tipo**: bugfix puro, nessuna decisione di prodotto.

## Problema

Il toggle **"Considera il fondo pensione come capitale bloccato fino allo sblocco"**
(`components/fire-simulations/FireCalculatorTab.tsx`, Switch `id="respectPensionLockIn"`) non
sopravvive a un hard refresh: si abilita, si preme Salva (toast di successo), si ricarica → è di
nuovo disabilitato.

## Diagnosi (verificata sul codice, 2026-08-17)

È l'esatto pattern documentato in AGENTS.md → *Settings — the FIVE places*: un setting deve stare
in 5 posti o "silently disappears". `respectPensionLockInFire` sta in 2 posti su 5:

| # | Posto | Stato |
|---|---|---|
| 1 | Tipo — `types/assets.ts` (`AssetAllocationSettings`, campo `respectPensionLockInFire?: boolean` con commento, ~riga 305) | ✅ presente |
| 2 | Read mapping — `assetAllocationService.getSettings` (whitelist esplicita di ~40 campi) | ❌ **MANCA** |
| 3 | Write chain A — ramo `targets !== undefined` di `setSettings` (`setDoc` senza merge) | ❌ **MANCA** |
| 4 | Write chain B — ramo merge di `setSettings` | ❌ **MANCA** |
| 5 | Wiring UI — qui vive in `FireCalculatorTab.tsx`, non in `settings/page.tsx`: state (`respectPensionLockIn`), dirty-check, load-effect, reset, payload del mutation, save | ✅ presente |

Doppia rottura indipendente, stesso sintomo: il campo non viene **mai scritto** (nessuno dei due
rami di `setSettings` lo copia in `docData`; il ramo che gira davvero è quello no-merge, perché
`FireCalculatorTab` invia sempre `targets`) e, anche se fosse scritto, verrebbe **droppato in
lettura** da `getSettings`. Al refetch `settings?.respectPensionLockInFire` è `undefined` e
l'effect di load resetta lo switch a `false`.

C'è anche un **secondo read-path** che lo omette: la whitelist server-side in
`lib/services/dashboardOverviewService.ts` (mappa i settings per l'overview; include già
`withdrawalRate` e `includePrimaryResidenceInFIRE`).

Il test di guardia `__tests__/settingsRoundTrip.test.ts` non lo copre: `STORED_SETTINGS` non
contiene il campo — per questo la regressione non è mai scattata.

## Modifiche richieste

Tutte le modifiche seguono il precedente **`includePrimaryResidenceInFIRE`**, che è il gemello
esatto di questo campo (boolean FIRE, stesso ciclo di vita, presente in tutti e 5 i posti): per
ogni file sotto, individuare dove compare `includePrimaryResidenceInFIRE` e replicare il pattern.

1. **`lib/services/assetAllocationService.ts` — `getSettings`**: aggiungere
   `respectPensionLockInFire: data.respectPensionLockInFire` alla whitelist dell'oggetto ritornato.

2. **`lib/services/assetAllocationService.ts` — `setSettings`, ramo no-merge** (quello con
   `targets`): aggiungere

   ```ts
   if (settings.respectPensionLockInFire !== undefined) {
     docData.respectPensionLockInFire = settings.respectPensionLockInFire;
   }
   ```

   La guardia `!== undefined` è corretta qui (non serve `'x' in settings`): il campo è un boolean
   scritto solo da `FireCalculatorTab` con form completo e non è user-clearable — stesso
   ragionamento del vicino `includePrimaryResidenceInFIRE` (AGENTS.md → *Firestore Writes*,
   "clear-guard depends on whether partial callers exist").

3. **`lib/services/assetAllocationService.ts` — `setSettings`, ramo merge**: stesso blocco.

4. **`lib/services/dashboardOverviewService.ts` — mapper dei settings** (funzione che costruisce
   l'oggetto settings dal doc admin, vicino a `withdrawalRate`/`includePrimaryResidenceInFIRE`):
   aggiungere il campo. Oggi nessun consumer server lo usa, ma la Spec 3 lo userà e la whitelist
   incompleta è lo stesso bug in attesa.

5. **`__tests__/settingsRoundTrip.test.ts`**: aggiungere `respectPensionLockInFire: true` a
   `STORED_SETTINGS`, così il round-trip guard copre il campo per sempre. Verificare che il test
   fallisca PRIMA del fix (rosso visto davvero — WORKFLOW.md "prove the check can fail") e passi
   dopo.

## Cosa NON toccare

- Nessuna modifica a `FireCalculatorTab.tsx`: il wiring UI è già completo e corretto.
- Nessuna modifica alla semantica del toggle (resta "sottrai il capitale bloccato"): la nuova
  semantica bridge è la Spec 3.
- Non toccare gli altri campi delle whitelist.

## Verifica

1. `npx vitest run __tests__/settingsRoundTrip.test.ts` — rosso prima del fix (col solo test
   aggiornato), verde dopo.
2. `npx tsc --noEmit` (rilanciarlo DOPO aver scritto i test).
3. Suite correlate: `npx vitest run __tests__/dashboardOverviewService.test.ts` (la whitelist
   server è cambiata).
4. **Collaudo guidato** (WORKFLOW.md, emulatori — mai produzione): con `npm run emulators` +
   `dev:emulator`, abilitare il toggle nel tab FIRE, salvare, hard refresh → il toggle resta
   abilitato. Leggere il doc `assetAllocationTargets/{uid}` dall'emulatore via REST
   (`Authorization: Bearer owner`) e confermare `respectPensionLockInFire: true` nel documento —
   assert sul dato, non sul pixel.

## Criteri di accettazione

- [ ] Toggle on → Salva → hard refresh → toggle ancora on; doc Firestore contiene il campo.
- [ ] Toggle off → Salva → il campo persiste `false` (non sparisce dal doc: `false !== undefined`).
- [ ] `settingsRoundTrip` copre il campo ed è stato visto rosso prima del fix.
- [ ] `tsc` pulito, suite Vitest verde (anche sotto `TZ=Europe/Rome`).

---

## Implementazione consigliata

- **Modello**: `claude-sonnet-5` · **Effort**: medium
  (fix meccanico a pattern noto, guardato da un test di round-trip; non serve un modello maggiore)

### Prompt di implementazione

```
Leggi TASSATIVAMENTE prima di ogni cosa: AGENTS.md, CLAUDE.md, WORKFLOW.md, COMMENTS.md,
DEVELOPMENT_GUIDELINES.md. Crea un branch dalla branch attiva (una branch per sessione, commit
solo dopo mia approvazione esplicita). Crea/aggiorna SESSION_NOTES.md per tracciare il lavoro.

Implementa ESATTAMENTE la specifica in specs/1-fix-persistenza-respect-pension-lock-in-fire.md:
il campo respectPensionLockInFire manca dalla read-whitelist di getSettings, da ENTRAMBI i rami
di scrittura di setSettings (lib/services/assetAllocationService.ts) e dal mapper settings di
lib/services/dashboardOverviewService.ts. Replica il pattern del campo gemello
includePrimaryResidenceInFIRE in ognuno dei quattro punti.

Ordine obbligatorio: (1) aggiungi respectPensionLockInFire: true a STORED_SETTINGS in
__tests__/settingsRoundTrip.test.ts e verifica che il test FALLISCA (rosso visto davvero);
(2) applica il fix nei 4 punti; (3) verifica verde; (4) npx tsc --noEmit e la suite anche con
TZ=Europe/Rome. Poi conduci il collaudo guidato sugli emulatori secondo WORKFLOW.md: toggle on →
salva → hard refresh → ancora on, e leggi il doc assetAllocationTargets dall'emulatore (header
Authorization: Bearer owner) per confermare il campo scritto. Non toccare FireCalculatorTab.tsx
né la semantica del toggle. Al termine riassumi il diff e chiedi l'OK per il commit.
```
