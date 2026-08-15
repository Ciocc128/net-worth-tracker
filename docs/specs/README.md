# Specifiche di implementazione — note di agosto 2026

Piano concordato in sessione (2026-08-15). Ogni file è autonomo: contiene la specifica puntuale,
il prompt da usare per la sessione di implementazione e il modello/effort consigliato.
Regola generale: **una spec = una sessione = un branch = un commit** (WORKFLOW.md).

| # | File | Cosa | Modello consigliato | Dipende da |
|---|------|------|---------------------|------------|
| 1 | `SPEC-1-pl-per-operazione.md` | P&L % + PMC alla vendita nel Registro operazioni; refactor effects nel motore ledger | Sonnet 5 · high | — |
| 2 | `SPEC-2-plusvalenze-storico.md` | ~~Serie additiva "Plusvalenze realizzate" (annuale) nel grafico Risparmio vs Investimenti~~ — **NON SI IMPLEMENTA** (2026-08-15: implementata e verificata, poi scartata — vedi il file per il motivo) | Sonnet 5 · high | SPEC-1 |
| 4A | `SPEC-4A-assistente-bugfix.md` | Bugfix e pulizia assistente (quarter ghost, PATCH memoria, scritture, web search gate…) | Sonnet 5 · high | — |
| 4B | `SPEC-4B-assistente-memoria-obiettivi.md` | Pipeline obiettivi v2: tool use su Haiku, valutazione su oggi, cron, Ignora durevole | Opus 5 / Fable 5 · high | 4A |
| 4C | `SPEC-4C-assistente-goal-investing.md` | Goal-Based Investing nel bundle + card di proposta con conferma + route POST /api/goals | Opus 5 / Fable 5 · high | 4A (meglio 4B) |
| 4D | `SPEC-4D-assistente-redesign.md` | Redesign pagina con impeccable (hero `[2fr_1fr]`, SegmentedPill, decomposizione) | Fable 5 / Opus 5 · high + impeccable | 4A+4B+4C |

Ordine suggerito: 4A → 4B → 4C → 4D in sequenza (SPEC-2 chiusa, non blocca nulla: nessuna spec
successiva dipendeva da lei).

Decisioni di prodotto già prese in sessione (non riaprirle durante l'implementazione):
- Righe di acquisto/rettifica/baseline nel registro: **nessun P&L**.
- Grafici Storico: il residuo resta; il ledger è solo **additivo**.
- Assistente: `quarter_analysis` **si elimina**; creazione goal **solo proposta + conferma utente**.
