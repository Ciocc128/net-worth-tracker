# SESSION_NOTES — Analisi bug e scrittura spec (2026-07-27)

Sessione di **sola analisi e documentazione**: nessun file di codice modificato. Output: 5 spec sotto `docs/specs/` + questo file.

## Cosa è stato fatto

1. Analisi approfondita (3 agenti di esplorazione in parallelo) dei 4 bug segnalati + audit dei calcoli della pagina Rendimenti + caccia a bug adiacenti.
2. Decisioni di prodotto prese con l'utente (vincolanti, riportate nelle spec):
   - **Tassazione**: campo unico `taxRate` (niente aliquota dividendi separata).
   - **Etichette grafici**: fallback a `asset.name` nel resolver centrale; nessun campo alias per i tipi senza ticker.
   - **Rendimenti**: spec completa a fasi (tutti i 12 finding).
   - **XEON/bollo**: ETF classe cash = titolo (0,2%); convenzione stretta per bollo/storico prezzi/picker conti; aggregati di liquidità restano larghi (AGENTS.md hardening 2026-07-26).
3. Scritte le 5 spec, ognuna con diagnosi file:linea, decisioni fissate, modifiche per file, impatti, test, e prompt di implementazione finale con modello/effort consigliato.

## Le spec (ordine di implementazione consigliato)

| Spec | Bug | Modello/effort | Note |
|---|---|---|---|
| `docs/specs/7-leverage-target-save.md` | Allocazione >100% non salvabile | Sonnet 5, medio | Fix più piccolo e urgente: 1 guard + copy. Svista del commit L2 990cc56. |
| `docs/specs/8-asset-tax-rate-restore.md` | Aliquota fiscale irraggiungibile per asset a ledger | Sonnet 5, medio | Regressione Fase C ledger; persistenza già pronta, solo UI. Danno attuale: BTP tassati 26% dal cron. |
| `docs/specs/9-asset-chart-labels.md` | Conti correnti senza etichetta nei grafici Panoramica | Sonnet 5, basso/medio | Fallback name nel resolver + sweep 7 consumatori + fix key React duplicate. |
| `docs/specs/6-asset-class-selection.md` | Classe asset non scegliibile in create (XEON) + classe prevalente fondo pensione | Sonnet 5, alto | Include l'allineamento di 3 call site alla convenzione stretta (bollo 0,2%, storico prezzi, picker conti). |
| `docs/specs/10-performance-calculations.md` | 12 errori nei calcoli Rendimenti (A1–A12) | Fasi 1-2: Opus 5 alto; Fasi 3-5: Sonnet 5 alto | 5 fasi separate, una per branch. Fase 1 (baseline data-driven) è la più impattante: corregge TWR/ROI/CAGR di Storico. |

## Diagnosi in una riga per bug

1. **Classe asset (XEON)**: `handleTypeSelect` stampa `TYPE_TO_CLASS[type]` e in create la classe non è più modificabile; il pricing però è type-based, quindi ETF+classe cash funzionerebbe già — è un vincolo solo di UI.
2. **Leva**: `handleSave` (settings/page.tsx:1059-1065) ha ancora il guard `=== 100`; il commit L2 aggiornò solo la variabile di render.
3. **Aliquota**: il campo `taxRate` è finito dentro il blocco Cost Basis, nascosto per tutti i tipi a ledger; `updateAssetMetadata` lo sa già scrivere.
4. **Etichette**: `prepareAssetDistributionData` etichetta col ticker (vuoto per i conti) e scarta il nome; `getAssetDisplayTicker` non ha fallback su name.
5. **Rendimenti**: radice principale = `hasBaseline` euristico (indovinato dal tipo di periodo invece che dai dati) → tre errori a cascata su Storico/YTD/finestre corte; più cache key incompleta, rolling con l'ultimo mese di spese perso, IRR shiftato di un mese.

## Segnalazioni fuori scope (non spec-ate, da valutare)

- **Riferimenti a spec cancellate** — ✅ RISOLTO (2026-07-27, stessa sessione): eliminate TUTTE le citazioni alle spec archiviate (1-asset-transactions, 2-pension-fund, 3-leveraged-etf-allocation, 4-ticker-display-alias, 5-expense-csv-import, specs README, security-review-spec) dai commenti del codice e da CLAUDE.md — ~90 siti in ~45 file, solo commenti (+1 stringa di log in seedEmulator). Dove il commento si appoggiava alla spec (matrici di test, invarianti) la frase è stata riformulata per stare in piedi da sola. Decisione: niente file ARCHIVE.md — le spec restano recuperabili dalla git history (`git show 0186c0d^:docs/specs/...`, `git show 4fb7d33^:docs/security-review-spec.md`) e a implementazione conclusa la fonte di verità sono codice + AGENTS.md. Verifica: grep pulito, `tsc` verde. Rimosse in un secondo passaggio anche le 3 citazioni residue in AGENTS.md (riga 716 + due titoli di sezione): per coerenza con la pulizia, e non perdevano informazione.
- **`computeBalanceScore` con leva target non raggiunta**: degrada semanticamente (documentato in spec 7 come limite noto, da annotare in CLAUDE.md → Known Issues in fase di implementazione).
- **Guard `autoUpdatePrice === undefined` morto** in AssetDialog (AGENTS.md 848-853): non costruirci sopra; toccarlo solo se si rifattorizza il dialog.

## Stato

- [x] Analisi e diagnosi (2026-07-27)
- [x] 5 spec scritte
- [x] Implementazione spec 7 (leva) — 2026-07-27, branch `fix/leverage-target-save`
- [ ] Implementazione spec 8 (aliquota)
- [ ] Implementazione spec 9 (etichette)
- [ ] Implementazione spec 6 (classe asset)
- [ ] Implementazione spec 10 (Rendimenti, fasi 1→5)

Aggiornare questo file al termine di ogni implementazione (i prompt nelle spec lo richiedono).

## Implementazione spec 7 — Salvataggio Allocazione Target ≥ 100% (Leva) — 2026-07-27

Branch `fix/leverage-target-save`. Fix chirurgico, un solo file di codice + CLAUDE.md.

**Cosa è stato fatto** (`app/dashboard/settings/page.tsx`):
1. Estratta una helper di modulo `isTargetTotalValid(total) = total >= 100 - 0.01` (accanto a `roundToTwoDecimals`), condivisa da `handleSave` e dal render (`isValidTotal`) — prima erano due copie della stessa regola con `handleSave` rimasta indietro alla vecchia `=== 100`.
2. `handleSave`: il guard ora blocca solo `total < 100 - 0.01`; il toast d'errore riporta anche il residuo da allocare.
3. Copy aggiornata: header del file (commento "Asset classes must sum to...") e la riga in "Note e dettagli tecnici" ("almeno 100%, oltre = leva target").
4. Audit dei 4 `max="100"` residui (stampDutyRate, riskFreeRate, sub-categoria %, asset specifico %): tutti percentuali *interne al padre* (non target top-level di classe), quindi lasciati invariati — nessuna modifica lì. Il cap top-level era già stato rimosso alla riga ~2657 in un commit precedente.
5. `CLAUDE.md` → Known Issues: aggiunta la riga sul limite semantico di `computeBalanceScore` con leva target non ancora raggiunta.

Non toccato (come da scope): validazione sotto-categorie, `validateSpecificAssets`, `computeBalanceScore`, `firestore.rules`.

Nessuna helper pura estratta in `lib/utils`/`lib/services` (resta un const locale al componente, Firestore-coupled), quindi nessuna suite vitest nuova per lo scope della spec — `isTargetTotalValid` è comunque testabile a mano coi 4 casi sotto.

**Gate**: `npx tsc --noEmit` ✅ pulito. `npm run build` ✅ (Next.js 16.2.6, Turbopack) — compilazione e generazione pagine statiche ok.

**Come testare a mano** (i 4 scenari della spec):
1. Target 60/30/20 (=110) → Salva: nessun toast d'errore, chip "Leva target 1,10×" verde nella card di riepilogo. Ricarica la pagina → i valori restano 60/30/20.
2. Target con totale 90 → Salva: toast d'errore con il residuo da allocare (es. "...residuo da allocare 10,00%"), nessuna scrittura su Firestore (ricaricando la pagina i valori pre-tentativo restano quelli salvati in precedenza).
3. Sotto-categorie di una classe a 80 (invece di 100) → Salva: errore invariato "Il totale delle sotto-categorie ... deve essere 100%" (guard separato, non toccato).
4. Vai su Allocazione dopo aver salvato lo scenario 1 (110%) → i piani Ribilancia/Versa riflettono la leva target 1,10× (comportamento già coperto da `__tests__/{assetExposure,compareAllocations,leverageAwareAllocationUtils}.test.ts`, non ri-testato in questa sessione).

- **Cosa**: rimosso il guard di salvataggio in `handleSave` (`app/dashboard/settings/page.tsx`) che rifiutava qualunque totale target diverso da 100% esatto; ora blocca solo se `total < 100 - 0.01`, allineandolo alla regola già usata dal render (`isValidTotal`, chip "Leva target"). Estratta la regola in una helper di modulo `isTargetTotalValid(total)` condivisa da entrambi. Aggiornata la copy stantia (header file + "Note e dettagli tecnici") e documentato in CLAUDE.md il limite noto di `computeBalanceScore` con leva target non ancora raggiunta.
- **Perché**: la UI (chip, badge verde, "Residuo da allocare") trattava già un totale ≥100% come valido — 100% = nessuna leva, sopra 100% = leva target legittima — ma il salvataggio era rimasto alla vecchia regola `=== 100`, svista del commit L2 `990cc56` che aveva aggiornato solo la variabile di render e non `handleSave`. Risultato: un utente non poteva salvare un target di leva anche se la UI glielo mostrava come corretto.
- **Nota**: le sotto-categorie e gli asset specifici restano a 100% esatto per design (sono percentuali *interne al padre*, non toccate dalla leva) — i 4 input `max="100"` residui verificati uno per uno sono tutti di questo tipo (o percentuali non correlate come aliquota bollo/risk-free rate), quindi lasciati invariati. Non esiste validazione server-side sul totale (invariato rispetto a prima, fuori scope): un totale <100% può ancora arrivare a Firestore da client vecchi/manipolati.
