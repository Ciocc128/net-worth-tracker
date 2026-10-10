# data/montecarlo — archivio dei default del Monte Carlo

Dossier: `doc/montecarlo/README.md` § 14.13 (Q5, regola RQ10). Chi lo usa: `npm run montecarlo:defaults` e
`__tests__/monteCarloDefaultsArchive.test.ts`; nulla nell'app.

## Cosa c'è

| File | Cosa è |
| --- | --- |
| `manifest.json` | Ogni file da cui escono i default: percorso, fonte, URL, data, SHA-256, se sta nella repo. Più gli **ingressi** non ricalcolati (ancore BCE, premi di Trend e Carry, volatilità e incertezze di giudizio). |
| `annual_series.csv` | Rendimenti annui **nominali in euro** per classe (e coperti, dove la copertura esiste) e CPI europeo, 1972–2025: circa 55 righe × 12 colonne. Le classi partono dal loro primo anno pieno (Azioni 1972, Oro 1981, Materie prime 1980, Trend 2001, Carry 2002). |
| `build_annual.py` | Come `annual_series.csv` esce dai file grezzi (stesso metodo di R0-bis `b0_load.py`/`b4_corr.py`). Si lancia a mano quando cambiano i dati; poi si rigenera l'impronta nel manifest. |

I **giornalieri e mensili grezzi** (testfolio, BCE, FRED, CPI) restano in `/mnt/project-files/montecarlo/` (`r0-bis/raw/`,
`r0-dati-2/`, `r0-validazione/`); il manifest ne custodisce le impronte e il test le verifica per ogni file presente su
quella macchina (in un clone senza la cartella condivisa il controllo passa su quelli che ci sono).

## Licenze: cosa sta nella repo e perché

Controllate il 10/10/2026 sui siti originali dove si sono potuti raggiungere (FRED e le pagine delle sue serie); **non
raggiungibili dal container: il sito della BCE e testfol.io** (il gateway risponde 403 o il nome non si risolve). Per la BCE
vale il riassunto della politica di riuso delle statistiche del SEBC trovato in una ricerca, non il testo ufficiale.

| Fonte | Cosa dicono i termini | Nella repo |
| --- | --- | --- |
| **testfolio** (VTSIM, GLDSIM, GSGSIM, DBMFSIM, UEQCSIM, CASH*) | **Non verificato**: testfol.io non è raggiungibile e una ricerca non trova termini d'uso. Le serie sono simulazioni su indici di terzi. | **No** i giornalieri. **Sì** i rendimenti annui derivati (≈ 50 numeri per serie). Da leggere i termini sul sito prima di dare la repo per sicura. |
| **BCE** (€STR, curva AAA, SPF) | Politica di riuso delle statistiche del SEBC (da una ricerca, non dal testo ufficiale): riuso gratuito citando la fonte («Source: ECB statistics»), dati e metadati non modificati; esclusi i dati di terzi. | Solo le **ancore** come numeri, identici a quelli pubblicati, in `monteCarloMarketDefaults.ts` e nel manifest; le serie restano fuori. Fonte da citare: ECB statistics. |
| **FRED › OECD** (`IRLTLT01DEM156N` Bund 10 anni, `DEUCPIALLMINMEI` CPI Germania) | Pagina della serie: «Copyrighted: Citation Required»; da citare nel formato OECD. FRED stessa (termini API): le serie di terzi, per un uso che non sia personale, vanno chiesti al titolare. | Nessuna serie. Restano due colonne **derivate** di `annual_series.csv` (`bonds` dal Bund, `cpi_eur` anche dal CPI tedesco fino al 1996). **Rischio residuo**: sono un calcolo nostro, ma il titolare non ha dato un permesso. |
| **FRED › Eurostat** (`CP0000EZ19M086NEST` HICP area euro) | «Copyright, European Union»; «Citation Required». | Solo nella colonna derivata `cpi_eur` dal 1997. Fonte da citare: Eurostat. |
| **FRED › Fed** (`EXUSEU`, `EXUSEC`, `EXGEUS` cambi) | «Public Domain: Citation Requested». | Nessuna: servono solo al controllo del cambio implicito, restano fuori dalla repo. |
| **Damodaran** | Non entra in questo archivio (solo i default v1 della migrazione). | No. |

**Cosa ne segue**: la repo tiene solo numeri derivati e le impronte; le fonti da citare sono testfolio, ECB statistics, OECD
e Eurostat (via FRED). Il punto aperto è doppio: i termini di testfolio, da leggere dal sito, e se un calcolo annuo
derivato da una serie OECD/Eurostat basti senza il permesso del titolare (la lettura prudente dei termini FRED è che per un
uso non personale lo chieda). Se la risposta è no, si toglie la colonna `bonds` e/o `cpi_eur` da `annual_series.csv`: il test
si ferma al manifest (impronte) per quelle classi e lo dice. Stessa domanda della card «RICERCA bootstrap storico: serie
salvabili nella repo».

## Cosa controlla il test

- **AQ42**: ogni file del manifest presente ha l'impronta scritta; un file cambiato fa fallire il test con il suo nome.
- **AQ43**: CAGR reale, volatilità (anche coperta) e incertezza `s/√N` di Azioni, Oro e Materie prime ricalcolati dalle serie
  annue entro 0,005 dai default; volatilità di Obbligazioni e Liquidità; le correlazioni, con la regola di V-D4
  (significativa al 5% con Fisher, o meccanica → misurata a 0,05; altrimenti 0), uguali ai default in tutte le **16**
  combinazioni di copertura.
- **AQ44**: un default cambiato a mano fa fallire il test e dice classe e campo.
- **Ingressi**: premio, volatilità e incertezza di Trend e Carry, incertezze di Obbligazioni e Liquidità, ancore: il test li
  confronta con i default così come sono nel manifest (vengono dalla BCE e da una scelta di giudizio, DQ1).
