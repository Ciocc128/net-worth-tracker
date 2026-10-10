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

Scritto il 10/10/2026 dalla conoscenza dei termini delle fonti, **senza consultare i testi aggiornati** (la rete del
container non raggiunge quei siti): da confermare dal proprietario prima che la repo diventi più pubblica di quanto sia.

| Fonte | Cosa si sa | Nella repo |
| --- | --- | --- |
| **testfolio** (serie VTSIM, GLDSIM, GSGSIM, DBMFSIM, UEQCSIM, CASH*) | Il sito non dichiara condizioni di riuso che io conosca; le serie sono simulazioni costruite su indici di terzi (MSCI/FTSE, S&P GSCI, fondo DBMF, UBS UEQC). | **No** i giornalieri. **Sì** i rendimenti annui derivati (≈ 50 numeri per serie): un calcolo nostro, non la serie. |
| **BCE** (€STR, curva AAA, SPF) | Dati statistici della BCE: riuso consentito con citazione della fonte, secondo le condizioni del sito. | Solo le **ancore** come numeri in `monteCarloMarketDefaults.ts`; le serie restano fuori (non servono). |
| **FRED** (Bund 10 anni, CPI, cambi) | Ogni serie ha il suo titolare (OECD, Eurostat, Fed): FRED non concede un riuso generale. | **No** le serie. **Sì** il solo CPI annuo derivato, come colonna di `annual_series.csv`. |
| **Damodaran** | Usato solo dai default v1 (dollari), restano per la migrazione; non entra in questo archivio. | No. |

Se una fonte risultasse non riutilizzabile nemmeno in forma annua, si toglie la sua colonna da `annual_series.csv`: il test
si ferma al manifest (impronte) per quella classe e lo dice. Stessa domanda della card «RICERCA bootstrap storico: serie
salvabili nella repo» — la risposta di quella ricerca vale anche qui.

## Cosa controlla il test

- **AQ42**: ogni file del manifest presente ha l'impronta scritta; un file cambiato fa fallire il test con il suo nome.
- **AQ43**: CAGR reale, volatilità (anche coperta) e incertezza `s/√N` di Azioni, Oro e Materie prime ricalcolati dalle serie
  annue entro 0,005 dai default; volatilità di Obbligazioni e Liquidità; le correlazioni, con la regola di V-D4
  (significativa al 5% con Fisher, o meccanica → misurata a 0,05; altrimenti 0), uguali ai default in tutte le **16**
  combinazioni di copertura.
- **AQ44**: un default cambiato a mano fa fallire il test e dice classe e campo.
- **Ingressi**: premio, volatilità e incertezza di Trend e Carry, incertezze di Obbligazioni e Liquidità, ancore: il test li
  confronta con i default così come sono nel manifest (vengono dalla BCE e da una scelta di giudizio, DQ1).
