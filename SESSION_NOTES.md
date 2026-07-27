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
- [ ] Implementazione spec 7 (leva)
- [ ] Implementazione spec 8 (aliquota)
- [ ] Implementazione spec 9 (etichette)
- [ ] Implementazione spec 6 (classe asset)
- [ ] Implementazione spec 10 (Rendimenti, fasi 1→5)

Aggiornare questo file al termine di ogni implementazione (i prompt nelle spec lo richiedono).
