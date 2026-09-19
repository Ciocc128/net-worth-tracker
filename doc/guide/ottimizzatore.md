# Allocazione › Ottimizzatore dei pesi

> **Quando aprire questa guida** — chi tocca `lib/utils/{weightOptimizer,weightOptimizerNarrative,boxProjection}.ts`,
> `lib/constants/geoAreas.ts`, `lib/server/exposure/profileResolver.ts` (le parti su `otherAreaSplit`
> e `includeZeroQuantity`), `app/api/portfolio/instrument-profiles/route.ts`,
> `lib/hooks/useInstrumentProfiles.ts`, `components/settings/IdealAllocationTile.tsx` o
> `components/allocation/OptimizerPanel.tsx`. La specifica chiusa è `doc/weight-optimizer-ate.md`
> (§1 le decisioni funzionali O1–O9); questa guida ne è la traduzione operativa e i limiti trovati
> scrivendo il codice. Prerequisito: la feature PAC (`doc/pac-ate.md`, `doc/guide/accumulo.md`).

## Cosa fa

Il motore (`optimizeWeights`, `lib/utils/weightOptimizer.ts`) propone i **pesi di mercato** degli
strumenti candidati di una bozza PAC a partire dagli obiettivi di "Allocazione ideale"
(Impostazioni → Allocazione): classi, leva, fattori (sotto-categorie), geografia dell'azionario in
tre macro-aree, limiti per strumento e per gruppo. I pesi riempiono il passo Target del PAC
(`OptimizerPanel`) e restano modificabili a mano — l'ottimizzatore non scrive mai da solo, propone
soltanto (stessa filosofia del matching col ledger, doc/guide/accumulo.md § Abbinamento).

## La formulazione

Un problema quadratico convesso: ogni obiettivo morbido `k` è una riga lineare `r_k(w)` in punti
percentuali (o una cerniera `max(0, ...)` per un tetto di gruppo), penalizzata al quadrato e pesata
per priorità:

```
J(w) = Σ_k λ(priority_k) · r_k(w)²  +  ε · Σ_i (100 · (w_i − wRef_i))²
λ: essenziale 1000, alta 100, media 10, bassa 1        ε = 0,01
```

I vincoli rigidi — somma = 100% e il box `[lowerPct, upperPct]` di ogni candidato — vivono SOLO
nella proiezione (`projectOntoBudgetBox`), mai come termine di penalità: è la stessa proiezione del
motore a leva di Allocazione (`leverageAwareAllocationUtils.ts`), estratta in `boxProjection.ts`
perché i due motori la condividono byte per byte. Il termine di regolarizzazione `ε` rende l'ottimo
unico (senza, più configurazioni di pesi darebbero lo stesso `J`); il riferimento `wRef` è il peso di
mercato corrente dei candidati (uniforme se il totale è zero).

Il solver è una discesa del gradiente proiettata con backtracking (fino a 3000 iterazioni,
`not_converged` se non converge), seguita da due passaggi puramente meccanici: l'euristica del 2%
(§6.4 — un peso sotto 2 punti con limite inferiore 0 viene azzerato, a meno che azzerarlo renda
impossibile coprire il 100%) e l'arrotondamento a 0,5 punti col metodo dei resti maggiori (§6.5).
Determinismo garantito: stesso input → stesso output bit per bit, nessun ordinamento instabile.

## "Altri paesi" — la regola di attribuzione (O4)

Un profilo curato (`INDEX_PROFILES`) o Yahoo restituisce quasi sempre un residuo `OTHER` non
itemizzato. `areasFromCountries` lo risolve in ordine, MAI a caso:

1. **Regionale**: se tutti i paesi espliciti del profilo cadono in una sola area, `OTHER` va lì.
2. **Curato**: se il profilo porta un `otherAreaSplit` (un factsheet che scompone il residuo per
   area — `lib/constants/instrumentProfiles.ts`, propagato da `profileResolver.ts` sulla gamba
   equity quando le countries vengono dall'indice curato), lo segue.
3. **Stimato**: altrimenti stima dai paesi del riferimento geografico (esclusi quelli già espliciti
   in questo profilo ed esclusa la voce `OTHER` del riferimento), e marca la quota come stimata
   (`geo_estimated`/`reference_estimated`).
4. **Ripiego**: se il passo 3 non ha dati, `OTHER` va tutto a Sviluppati ex USA, stimato.

**Nessun profilo curato porta ancora un `otherAreaSplit` reale** (2026-09-19): il campo esiste e si
propaga, ma resta vuoto finché un umano non lo compila da un factsheet — stesso spirito di
`INDEX_PROFILES`'s dichiarati "declared gap" in `instrumentProfiles.ts`. Fino a quel momento ogni
indice di riferimento e ogni strumento passano dal passo 3 (stima) o 4 (ripiego).

## Classificazione geografica: una sola, MSCI

`lib/constants/geoAreas.ts` usa la classificazione MSCI Emerging Markets per TUTTI — sia gli
strumenti sia l'indice di riferimento — anche quando l'indice di riferimento scelto (es. FTSE
All-World) classifica diversamente. FTSE mette la Corea del Sud tra gli Sviluppati, MSCI tra gli
Emergenti: con FTSE All-World come riferimento, circa 2,4 punti di Corea passano da Sviluppati a
Emergenti. È voluto — coerenza INTERNA prima della fedeltà a un singolo provider (altrimenti lo
stesso paese vestirebbe due aree diverse nello stesso rapporto, a seconda di quale lato lo guarda).

## Perché la proiezione è condivisa col motore a leva

`dot`, `clamp`, `projectOntoBudgetBox` erano funzioni PRIVATE di
`lib/utils/leverageAwareAllocationUtils.ts` (il planner di Allocazione): stesso identico problema —
proiettare un vettore su un simplesso con limiti per componente — quindi O1 le ha spostate in
`boxProjection.ts` senza toccarle, e il motore a leva le importa da lì. Un solo posto dove la
proiezione può avere un bug, verificato da entrambi i motori (`__tests__/boxProjection.test.ts` +
`__tests__/leverageAwareAllocationUtils.test.ts`, quest'ultimo invariato dall'estrazione).

## Profili sul client — `includeZeroQuantity` (O3)

Il PAC può proporre pesi anche per uno strumento a **quantità 0** (una posizione "Nuovo asset",
doc/guide/accumulo.md § D7) — che `resolveInstrumentProfiles` esclude per costruzione dal calcolo
dell'Esposizione (dove uno strumento a quantità 0 non ha alcun peso nel portafoglio). L'opzione
`{ includeZeroQuantity: true }` toglie SOLO quel filtro, mai il filtro sul ruolo (`tradable`/
`frozen`); ogni chiamante esistente (`portfolioExposureService.ts`) non la passa e mantiene il
comportamento di prima. La route `GET /api/portfolio/instrument-profiles` (delegation-aware, stesso
modello di `/api/asset-transactions`) è l'unica a passarla, per i membri di TUTTE le posizioni della
bozza — non ha una cache propria: il resolver ha già la cache di 30 giorni per ticker.

## Limiti noti

- **I gruppi proxy assumono la stessa esposizione per euro del buy asset per tutti i membri** (§5.1
  della ATE): se un membro differisce di oltre 0,05 in qualunque classe o area dal buy asset, il
  candidato porta l'avviso `proxy_mismatch` e il calcolo procede comunque con i soli valori del buy
  asset — un'approssimazione dichiarata, non un errore silenzioso.
- **Un tetto di gruppo è un obiettivo MORBIDO** (una cerniera penalizzata, non un vincolo rigido
  nella proiezione): con priorità bassa e altri obiettivi in conflitto, il risultato può superarlo.
  Il rapporto lo mostra comunque col suo gap.
- **L'euristica del 2% è a due passaggi, non ricorsiva all'infinito** (§6.4, max 5 giri): un peso
  che scende sotto 2 punti solo dopo il quarto giro resta com'è.
- **Nessun profilo curato ha ancora un `otherAreaSplit`** (vedi sopra) — finché resta così, "Altri
  paesi" passa sempre dalla stima o dal ripiego, mai dal passo curato.
- **Perimetro v1: solo il PAC** (O9) — nessuna integrazione in Versa, Ribilancia, Preleva della
  pagina Allocazione.
