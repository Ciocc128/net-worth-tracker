# Previdenza: un TWR che i versamenti hanno prodotto non è una misura

> **Aperta il 2026-08-31 come [PR #323](https://github.com/GiuseppeDM98/net-worth-tracker/pull/323)**
> su `develop` di upstream, dal branch `pr/previdenza-copertura-contraddittoria`
> (`upstream/develop` + un solo commit). Tenuta in draft per un quarto d'ora mentre Giorgio
> verificava un altro numero delle metriche, poi aperta su sua indicazione: **ready for review**,
> `MERGEABLE`.
>
> Questo file è il corpo inviato a GitHub. Vale la regola del repo: il corpo non cita mai file che
> esistono solo in questo fork.

## Il problema

`computePensionReturn` (`lib/utils/pensionReturn.ts`) sa già che un rendimento può non essere una
misura, ma guarda **da un lato solo**. `isCoverageSuspicious` intercetta il caso in cui il fondo
cresce più di quanto i versamenti registrati spieghino — crescita troppo bella per essere vera,
quindi *mancano* dei versamenti.

La rottura opposta passava invece per misura: **versamenti registrati per più della crescita che
dovrebbero spiegare**.

Capita a chi inserisce lo storico dei versamenti *a posteriori* mentre teneva «Valore attuale»
aggiornato a mano dall'estratto conto. Quei soldi erano già dentro il valore, e `valueEffectMonth`
attribuisce ogni versamento al mese in cui è stato **registrato**: dieci versamenti inseriti nello
stesso giorno finiscono tutti su un mese solo.

Il TWR mensile è `(valore − versamenti del mese) / valore precedente`. Se a un mese sono attribuiti
più versamenti di quanti il fondo intero ne valga, quel fattore collassa — o diventa negativo — e la
pagina Previdenza stampa un rendimento vicino a **−100 %** come se fosse mercato, con sotto tutta la
scomposizione in euro che dovrebbe spiegarlo.

Un mese più in là il difetto peggiora in silenzio: l'indice della finestra diventa **negativo**,
`Math.pow(negativo, 12/5)` è `NaN`, e un `NaN` supera ogni confronto a valle senza far scattare
niente (`NaN > 20` è `false`) fino ad arrivare a schermo come **«NaN%»**.

## La correzione

- **`isCoverageContradictory`**, nuovo flag su `PensionReturnResult`. Tenuto **separato** da
  `isCoverageSuspicious` e non fuso in un unico «copertura rotta»: le due cause sono opposte e
  vogliono frasi opposte — «registra i versamenti mancanti» sarebbe qui il consiglio esattamente
  sbagliato. Il messaggio giusto è che un versamento è stato contato due volte, o era già dentro il
  valore inserito a mano.
- **`annualizedTwr` normalizzato a `null`** quando non è finito. `null` è già il «non calcolabile»
  di quel campo (lo usa la soglia dei 3 mesi), quindi non ci sono nuovi stati da gestire a valle.
- **`isPensionReturnMeasurable`** include il nuovo flag: cade la percentuale *e* con essa tutta la
  scomposizione in euro, esattamente come per gli altri due stati non misurabili. «Guadagno di
  mercato» stampato sotto un avviso che dice «quella differenza non è rendimento di mercato» si
  contraddice a quaranta pixel di distanza.
- **`pensionSummary`** aggiunge lo stato `contradictory` alla union `PensionReturnState` e
  **`pensionNarrative`** le sue due frasi (clausola di mercato e blocco «Rendimento»), che dicono
  quanto è cresciuto il fondo, quanti versamenti risultano, e che non è un rendimento negativo ma un
  dato da sistemare.

## Le soglie stanno all'impossibile, non all'implausibile

Una guardia che si mangia i ribassi legittimi è peggio del problema che risolve: il 2022 ha fatto
−20 % a comparti azionari veri. Qui passa solo ciò che è **aritmeticamente escluso**:

| condizione | perché |
|---|---|
| un mese chiude a `valore − versamenti <= 0` | a quel mese sono attribuiti più versamenti di quanti il fondo intero ne valga |
| TWR cumulato `< −100 %` | senza leva un fondo non può valere meno di zero |
| TWR `< −75 %` **con il valore in crescita** | un fondo che cresce e "rende" −75 % descrive i dati, non il mercato |

Un test fissa il confine dall'altro lato: **−25 % in un anno resta una misura**, e continua a
comparire come tale.

## Profilo di rischio

**Nessun cambiamento** per chi ha i versamenti registrati in modo coerente con il valore: i tre
predicati sono falsi e il risultato è identico a prima. Cambia solo dove oggi la pagina mostra un
numero che nessuna misurazione ha davvero prodotto.

## Verifica

`tsc` pulito, **146 file / 3262 test verdi** sotto `TZ=Europe/Rome` su questa base. Quattro test
nuovi su `computePensionReturn`, uno su `pensionNarrative`: la finestra contraddittoria, l'indice
negativo che darebbe `NaN`, la stessa storia che torna misurabile riaprendo la finestra al mese in
cui i versamenti sono stati registrati (il rimedio lato utente, senza modifiche al codice), e il
ribasso di mercato vero che **non** deve scattare.
