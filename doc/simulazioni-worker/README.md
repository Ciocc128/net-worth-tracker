# F12 · Simulazioni FIRE senza ricalcolo e in un Web Worker (P2, P4)

> Dossier della card Todoist «F12 FEAT prestazioni: simulazioni FIRE senza ricalcolo e in un Web Worker (P2, P4),
> prima di R9», gruppo 12 del piano della review Fable (14/11). Fonte: Library `prestazioni-reali.html`
> (proposte 2, 4, 5) e `parte-3-interazioni-simulazioni.md`. Sblocca R9 (FIRE in tre schede, ondata 3 del
> riordino). Stato: specifica scritta il 2026-11-24, decisioni da confermare (§ 7).

## 1. Obiettivo

Due schede di FIRE bloccano la pagina per secondi **a ogni apertura**, con gli stessi input:

| Scheda | Blocco, telefono 390 a CPU 4× | Blocco, desktop |
| --- | --- | --- |
| Dopo il FIRE | 4,7–5,1 s (un solo long task) | 1,2–1,3 s |
| Proiezione | 2,0 s | 0,5 s |

Il tempo è tutto nei motori (`runMonteCarloSimulation`, `runAccumulationSimulation`), lineare nei 10.000 percorsi
e negli anni. Il risultato vive nello `useState` della scheda e Radix smonta la scheda quando se ne esce: aprire
Dopo il FIRE, guardare Proiezione e tornare costa 5 + 2 + 5 s di blocco per le stesse cifre (il seme è fisso).
R9 porta le due schede vicine sotto «Approfondimenti»: senza questa task ogni passaggio fra loro ricalcola.

Due rimedi, nello stesso hook:

1. **P2 — l'ultima corsa fuori dal componente.** Riaprire una scheda con gli stessi input mostra il risultato
   senza ricalcolare.
2. **P4 — il calcolo in un Web Worker.** Anche la prima corsa non blocca: la pagina resta viva, si scorre e si
   tocca mentre calcola.

**Nessuna cifra cambia**: stessi motori, stesso seme, stessi 10.000 percorsi.

## 2. Perimetro

**Incluso**
- Un hook comune, `useSimulationRun`, che le due schede usano al posto del loro `setTimeout` + `useState`; non
  conosce le schede, così R9 può spostarle senza toccarlo.
- Un deposito in memoria delle ultime corse, indicizzato sugli input.
- Un solo Web Worker di modulo per i due motori, con il calcolo sul thread principale come riserva.
- `computeMonteCarloRun` e `computeProjectionRun` escono dai componenti verso un modulo puro in `lib/` (oggi
  sono funzioni di modulo dentro `MonteCarloTab.tsx` e `ProjectionTab.tsx`), letto sia dal worker sia dalla riserva.

**Escluso**
- **Calcolatore (P5, 0,6 s a ogni ritorno sulla scheda)**: va prima profilato, perché non si sa quale fra
  ventaglio, proiezione deterministica e sensibilità pesi (D-SW1).
- Meno percorsi, o una prima risposta veloce a 2000 percorsi poi 10.000 (D-SW4).
- Un indicatore di avanzamento in percentuale (D-SW5).
- Le altre schede FIRE (Coast, What If, Traguardi: 0–0,1 s) e l'ottimizzatore dei pesi (millisecondi).
- Lo scenario INP delle schede FIRE nel benchmark (P8, card «Fable minori · Prestazioni»).

## 3. Casi d'uso

| # | Cosa fa l'utente | Oggi | Dopo |
| --- | --- | --- | --- |
| CU1 | Apre Dopo il FIRE la prima volta | 5 s di pagina ferma sul telefono | La scheda mostra «sto calcolando», la pagina scorre e risponde; le cifre arrivano nello stesso tempo o poco più |
| CU2 | Va su Proiezione e torna su Dopo il FIRE | Ricalcola: altri 5 s fermi | Le cifre compaiono subito, nessun calcolo |
| CU3 | Lascia Dopo il FIRE mentre calcola | Il calcolo era già finito (la pagina era ferma) | Il calcolo continua nel worker; tornando, la scheda trova il risultato o lo aspetta |
| CU4 | Cambia un input e preme «Calcola» | 5 s fermi | Calcolo nel worker; se nel frattempo preme di nuovo «Calcola» con altri input, la corsa vecchia si ferma |
| CU5 | Salva il piano, o un'ipotesi in Impostazioni › Simulazioni | Gli input cambiano, la scheda ricalcola alla riapertura | Uguale: input diversi sono una chiave diversa, quindi una corsa nuova |
| CU6 | Esce dall'account, o un account condiviso passa all'altro proprietario | — | Il deposito si svuota: nessuna corsa di un account resta in memoria per l'altro |
| CU7 | Browser senza Worker, o il worker fallisce | — | Calcolo sul thread principale come oggi (stesso `setTimeout` per dipingere prima lo stato) |

## 4. Regole

**RW1 · La chiave.** Una corsa si ritrova solo con input **identici**: la chiave è la serializzazione JSON
dell'intero oggetto di input della corsa (`MonteCarloRunInputs` o `ProjectionRunInputs`, compresi mercato
risolto, correlazioni, incertezza, flussi datati, afflussi, seme implicito) più il tipo di simulazione e
l'`ownerId`. Non `haveRunInputsChanged`: quella decide cosa dire all'utente (The Stale-Run Rule) e confronta solo
i campi che l'utente vede cambiare, mentre il deposito deve essere più severo.

**RW2 · Il deposito.** In memoria, a livello di modulo, **mai persistito** (né IndexedDB né la cache persistita di
React Query): tiene le **ultime 3 corse per tipo** (Monte Carlo, Proiezione), la più vecchia esce per prima. Tiene
anche la corsa **in volo**, così due richieste uguali ne fanno una (la seconda aspetta la stessa promessa). Si
svuota al cambio di `ownerId` e all'uscita.

**RW3 · Il worker.** Un solo modulo `lib/workers/fireSimulation.worker.ts`, creato alla prima corsa
(`new Worker(new URL(…, import.meta.url), { type: 'module' })`) e tenuto vivo finché la pagina vive. Riceve
`{ id, kind, inputs }`, risponde `{ id, result }` o `{ id, error }`. Una corsa nuova con input diversi mentre una è
in volo **termina** il worker e ne crea uno nuovo (sul telefono non si sprecano secondi di CPU per cifre che
nessuno vedrà). Uscire dalla scheda **non** ferma la corsa: il risultato entra nel deposito.

**RW4 · Cosa attraversa il confine.** Gli input sono dati puri (numeri, stringhe, array, oggetti; nessuna
funzione, il generatore casuale nasce dentro il worker dal seme). Il risultato torna senza
`MonteCarloResults.simulations` — i 10.000 percorsi anno per anno di ogni scenario, che nessuna parte della UI
legge (le cifre leggono percentili, distribuzione, conteggi) e che oggi restano in memoria: copiarli indietro
costerebbe sul thread principale quello che il worker ha appena risparmiato. Gli array tipizzati del risultato,
se ce ne sono, viaggiano come transferable.

**RW5 · La riserva.** Se `Worker` non esiste (Vitest, server, browser vecchio), se la costruzione fallisce o se il
worker emette `error`, la corsa gira sul thread principale con la funzione identica, dopo i 60 ms che oggi
lasciano dipingere lo stato «sto calcolando». Un worker fallito non si ricrea per il resto della sessione.

**RW6 · Lo stato nella scheda.** L'hook restituisce `{ lastRun, isRunning, run(inputs) }` con la stessa forma di
oggi (`lastRun.inputs` + risultato), così narrativa, Stale-Run, Dettaglio e strisce non cambiano. La corsa
automatica all'apertura passa dal deposito: con input già calcolati la scheda mostra le cifre senza lo stato
«sto calcolando».

## 5. Prove

- **Stesse cifre** (Vitest): per Monte Carlo (con e senza leva, con flussi datati e afflussi) e Proiezione, il
  gestore dei messaggi del worker, chiamato direttamente, restituisce un risultato **identico** float per float a
  quello della funzione di oggi, `simulations` a parte; con percorsi ridotti (200) per tenere la prova veloce.
  Valori di riferimento: quelli della funzione di oggi su input inventati e tondi (WORKFLOW § 1.7).
- **Nessun ricalcolo** (Vitest, regola 9 di WORKFLOW): due richieste con input identici chiamano il motore **una**
  volta; con un input diverso di un centesimo lo chiamano due volte; la quarta corsa distinta fa uscire la prima;
  il cambio di `ownerId` svuota il deposito. La prova fallisce senza il deposito.
- **Corsa superata** (Vitest, worker finto): la seconda corsa termina la prima e solo la seconda arriva alla scheda.
- **Riserva** (Vitest): senza `Worker` il risultato arriva lo stesso, identico.
- **E2E nel cloud**: `e2e/fire.spec.ts`, `fire.mobile.spec.ts`, `fire.degraded.spec.ts` verdi, con il worker vero
  in `next dev`.
- **Sul Mac**: `perf:build` + `perf:budget` (il worker è un chunk nuovo); la misura prima/dopo del blocco
  all'apertura di Dopo il FIRE e Proiezione a CPU 4× (lo script della review Fable in Library); la profilazione
  del Calcolatore per P5 (`perf:census -- --scenario=mount --route=fire-simulations` su una build con i nomi).

## 6. Criteri di accettazione

| # | Criterio | Come si verifica |
| --- | --- | --- |
| CA1 | Le cifre di Dopo il FIRE e Proiezione sono le stesse di prima, al centesimo | Vitest sul gestore; E2E FIRE verdi |
| CA2 | Riaprire una scheda con gli stessi input non chiama il motore | Vitest sul deposito |
| CA3 | Aprire Dopo il FIRE a CPU 4× non produce un long task del calcolo: nessun blocco oltre 200 ms dovuto alla simulazione (resta il disegno della scheda) | Misura sul Mac, prima/dopo |
| CA4 | Tornare su Dopo il FIRE o Proiezione dopo averle aperte: nessun long task oltre 200 ms | Misura sul Mac |
| CA5 | Senza Worker la scheda funziona come oggi | Vitest |
| CA6 | Uscendo dall'account il deposito è vuoto | Vitest |
| CA7 | `perf:budget` verde, o il tetto alzato con il suo `raisedBy` | Mac |

## 7. Decisioni

Proposte il 2026-11-24, **da confermare da Giorgio**.

| ID | Decisione proposta | Alternative scartate | Motivo |
| --- | --- | --- | --- |
| D-SW1 | **P5 (Calcolatore) fuori da questa task**: nel giro sul Mac lo si profila, e la correzione va in una card a parte (o dentro R9, che ricompone il Calcolatore) | Includerlo adesso | Non si sa quale delle tre parti pesi; correggere alla cieca rischia di spostare il lavoro sbagliato, e R9 ridisegna proprio quella scheda |
| D-SW2 | Il deposito è **in memoria, non persistito**, ultime 3 corse per tipo, chiave = input completi + `ownerId` | Una chiave di React Query (anche non persistita); IndexedDB | React Query lega le chiavi ai dati letti e alle loro invalidazioni, qui non c'è nulla da leggere; persistere 10.000 percorsi su disco pesa, e le ancore BCE cambiano ogni giorno, quindi una corsa di ieri raramente vale oggi |
| D-SW3 | **Un worker per i due motori**, tenuto vivo; una corsa nuova termina quella in volo; lasciare la scheda non la ferma | Un worker per scheda; un worker per corsa; fermare la corsa quando si esce dalla scheda | Un worker solo carica il motore una volta; terminare libera la CPU del telefono; lasciar finire rende istantaneo il ritorno (CU3), che è il caso di R9 |
| D-SW4 | **10.000 percorsi invariati**, nessuna prima risposta ridotta | 2000 subito e 10.000 dopo; ridurre i percorsi | Cambierebbe le cifre e le prove a seme fisso; la review lo indica solo se worker e deposito non bastano |
| D-SW5 | Mentre calcola la scheda mostra **lo stato di oggi** («sto calcolando»), nessuna percentuale | Barra di avanzamento | Servirebbe spezzare il motore in pezzi e mandare messaggi a metà; nessuna interfaccia nuova da disegnare (nessuno schizzo «oggi / proposta» richiesto, WORKFLOW § 1.8) |
| D-SW6 | Il risultato perde `simulations` (i percorsi uno per uno), anche nella riserva sul thread principale | Tenerli | Nessuna cifra li legge; copiarli dal worker costerebbe centinaia di ms sul thread principale; liberano memoria |

## 8. Punti aperti

- Il blocco residuo alla ricezione del risultato (copia strutturata di percentili e distribuzione di quattro
  scenari): atteso sotto i 50 ms, da confermare con la misura sul Mac.
- La CSP è in sola segnalazione (`Content-Security-Policy-Report-Only`) con `script-src 'self'`: un worker dallo
  stesso dominio è ammesso. Quando la CSP diventerà bloccante servirà `worker-src 'self'` (lo è già per
  ricaduta su `script-src`).

## 9. File

- `lib/utils/fireSimulationRuns.ts` — `computeMonteCarloRun`, `computeProjectionRun` (spostate dai componenti), il
  taglio di `simulations`.
- `lib/workers/fireSimulation.worker.ts` — il gestore dei messaggi.
- `lib/simulation/simulationStore.ts` — il deposito e il client del worker (riserva compresa).
- `lib/hooks/useSimulationRun.ts` — l'hook delle due schede.
- `components/fire-simulations/MonteCarloTab.tsx`, `ProjectionTab.tsx` — usano l'hook.
- `__tests__/fireSimulationRuns.test.ts`, `__tests__/simulationStore.test.ts`.
- `doc/guide/fire-monte-carlo.md`, `doc/guide/fire-proiezione.md`, `doc/guide/velocita.md` — una riga ciascuno.
