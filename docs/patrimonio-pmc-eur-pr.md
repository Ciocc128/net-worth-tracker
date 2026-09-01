# Patrimonio: il G/P confronta due valute diverse su una posizione estera

> **Aperta il 2026-09-01 come PR verso `develop` di upstream, dal branch
> `pr/patrimonio-pmc-eur` (`upstream/develop` + un solo commit).**
>
> Questo file è il corpo inviato a GitHub. Vale la regola del repo: il corpo non cita mai file che
> esistono solo in questo fork.

## Il problema

`computeUnrealizedGain` (e la copia server-side in `dashboardOverviewService.ts` che alimenta
`topAssets.returnPercent`) calcola il G/P come `calculateAssetValue(asset) − quantity · averageCost`.
`calculateAssetValue` è sempre in EUR (converte con `currentPriceEur`); `averageCost` è invece il
PMC nella **valuta nativa** del titolo — dollari, sterline, franchi svizzeri.

Per un titolo in EUR i due lati coincidono e il bug è invisibile. Per un titolo estero il segno e
l'ampiezza del G/P dipendono dal cambio corrente rispetto al cambio medio d'acquisto, non solo
dall'andamento del titolo: un titolo USD comprato quando l'euro era forte e rivenduto (sulla carta)
quando l'euro è debole legge un G/P inflazionato anche a prezzo nativo fermo, o viceversa un G/P
compresso o negativo con il titolo in utile.

Il motore che ricostruisce la posizione dal registro operazioni (`assetTransactionUtils.ts`)
calcola già, per ogni operazione, il controvalore in EUR al cambio della data del trade
(`AssetTransaction.priceEur`, risolto da `tradeFxService.resolveTradePriceEur`), e ne deriva un PMC
in EUR (`costBasisEur / quantity`) dentro `LedgerPositionState`. Quel numero non arrivava mai sul
documento asset: `buildDerivedAssetFields` proiettava solo il PMC nativo.

## La correzione

- **`averageCostEur`**, nuovo campo su `Asset`, proiettato da `buildDerivedAssetFields` insieme al
  PMC nativo esistente e scritto sul documento asset ad ogni mutazione del registro operazioni
  (`commitTradeMutation`) — stessa vita di `averageCost`, stessa regola "lasciato intatto a
  quantità zero".
- **`costBasisPerUnitEur`**, unica funzione che risolve il PMC da confrontare con il valore EUR:
  usa `averageCostEur` quando presente, altrimenti ricade su `averageCost` solo per un asset già in
  EUR (dove i due coincidono per costruzione). `hasCostBasis`/`computeUnrealizedGain`/
  `summarizeUnrealizedGains` e il calcolo di `topAssets.returnPercent` la condividono, così il G/P
  della tabella, la percentuale sotto il valore e il ranking del Rendimento non possono divergere.
- **`backfillAverageCostEur`**, ricalcolo one-shot idempotente per le posizioni già esistenti: non
  servono nuove chiamate al cambio, perché ogni operazione — baseline di migrazione inclusa — porta
  già un `priceEur` corretto dalla propria data. È una pura riproiezione via
  `replayTransactions` + `buildDerivedAssetFields`, stesso schema della migrazione del registro
  (meta doc come segnale "fatto", innescato una volta sola all'apertura della pagina).

## Profilo di rischio

Nessun cambiamento per un asset in EUR: `costBasisPerUnitEur` ricade su `averageCost`, identico a
prima. Cambia solo il G/P mostrato per una posizione in valuta estera — dove oggi mescola due
valute — e solo dopo che il backfill ha popolato `averageCostEur` (silenzioso, un'unica volta per
utente).

## Verifica

`tsc` pulito, suite Vitest verde sotto `TZ=Europe/Rome`. Test nuovi su `buildDerivedAssetFields`
(un trade con FX diverso dal prezzo nativo produce due PMC distinti), sul path di scrittura atomico
(`commitTradeMutation` proietta `averageCostEur`), sul backfill (no-op prima della migrazione,
no-op se già eseguito, ricalcolo corretto, idempotente) e su `computeUnrealizedGain`/
`hasCostBasis`/`summarizeUnrealizedGains` (il confronto in EUR contro il vecchio mix di valute, il
fallback per un asset EUR-nativo, l'assenza di base comparabile per un asset estero che precede il
backfill).
