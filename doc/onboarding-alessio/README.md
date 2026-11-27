# Onboarding del primo amico · dal foglio Excel all'app

> Dossier della card Todoist «Utenti · Portare a bordo il primo amico» (label `epic-utenti`). Tipo: spec. Fonte:
> il file Excel con cui l'amico ha tenuto la contabilità da marzo a novembre 2026, letto il 2026-11-27, e il
> codice di `main` a `bfe202c`. Stato: **decisioni proposte, da confermare** (§ 7); il CSV convertito è stato
> importato con successo sugli emulatori il 2026-11-27 (§ 10).
>
> **Riservatezza.** La repo è pubblica. Qui non c'è nessun dato vero: né importi, né nomi di persone, né
> descrizioni delle spese. Le cifre degli esempi sono inventate e tonde (WORKFLOW.md § 1 regola 7). Il file
> originale, il CSV convertito, il convertitore e il riepilogo con le cifre vere stanno nei file del progetto,
> cartella `onboarding-alessio/` (D-OA1).

## 1. Obiettivo

Portare l'amico nell'app **con la sua storia**, non con un'app vuota: il giorno del primo accesso deve trovare
in Cashflow i suoi nove mesi di spese ed entrate, le sue categorie, il suo budget e le spese ricorrenti, così
che Tracciamento, Analisi spese e Budget rispondano da subito alle domande a cui oggi risponde il foglio.

Lo si fa **senza scrivere codice nuovo**: il foglio si converte nel CSV che l'import di Impostazioni già legge
(`lib/utils/expenseImport.ts`), e quello che l'import non copre si fa a mano nel primo accesso, in pochi passi.

## 2. Il foglio, in breve

Cinque fogli, un solo anno (le formule fissano il 2026), dati da marzo a novembre.

| Foglio | Cosa contiene | Volume |
| --- | --- | --- |
| **Spese** | La tabella `Table4` (Categoria · Descrizione · Spesa Ordinaria Si/No · Pagamento · Mese · Giorno · Importo · Banca, più tre colonne calcolate) e, sopra, quattro blocchi: il promemoria a testo libero (una disdetta da fare), l'elenco delle **spese ricorrenti mensili** con il giorno e l'avviso «potrebbero averti accreditato…», il contatore dei **buoni pasto**, e la tabella **categorie × benchmark** del mese corrente | circa 880 righe utili su 2.600 preparate |
| **Analisi** | Tabelle pivot: spesa per giorno della settimana e media, spesa per giorno del mese, filtrabili per categoria e per «Spesa Ordinaria» | solo pivot |
| **Recap Mensili** | Per mese: le **entrate** in cinque righe (busta paga, buoni pasto, bonifici dei genitori, regali, altro), le uscite per categoria contro il benchmark, il bilancio del mese e il «Delta BM» | 12 colonne-mese |
| **Spese Viaggio Po** | Il registro delle spese di un viaggio divise con la compagna: chi deve a chi, chiesto/rimborsato, aperto/chiuso, e gli scenari di saldo | circa 15 righe |
| **Mesi** (nascosto) | Gli elenchi a tendina: mesi, Si/No, metodi di pagamento e banche, «BP (1)…BP (8)» | elenchi |

Tre abitudini del foglio pesano sulla migrazione:

1. **Il risparmio è una spesa.** Ogni mese due righe fisse «Risparmi» e «Investimenti» (quota mensile) entrano
   nelle uscite, e il bilancio del mese torna circa a zero: è un budget a base zero.
2. **Le entrate non hanno data**: sono cinque totali mensili in Recap Mensili, non righe.
3. **Un rimborso è una spesa negativa** nella categoria della spesa originale (tre righe di agosto, che sono
   le voci chiuse del foglio Spese Viaggio).

## 3. Perimetro

**Incluso**
- La mappa di ogni foglio e colonna verso l'app (§ 4) e le categorie da creare (§ 5).
- La conversione del foglio Spese e delle entrate di Recap Mensili nel CSV dell'import (§ 6), con un esempio
  inventato in `esempio-import.csv`.
- Le cose che l'import non porta e che si fanno a mano il primo giorno: budget, spese ricorrenti, conti (§ 8).
- La lista del giorno dell'onboarding (§ 9).

**Escluso**
- Codice nuovo nell'app. Due lacune emerse sono proposte come card a parte (§ 8, P-OA7 e P-OA8), non qui.
- Il **saldo con la compagna** («chi deve a chi»): l'app non ha questa funzione e Divisione dichiara di non
  averla per scelta (`doc/guide/cashflow-divisione.md`, «There is NO reconciliation of who paid») (D-OA10).
- L'**avviso «potrebbero averti accreditato»** e il **promemoria di disdetta**: l'app non ha promemoria.
  Le serie ricorrenti scrivono le righe in anticipo, quindi la domanda «me l'hanno già addebitata?» non serve
  più; la disdetta va nel calendario dell'amico.
- Patrimonio, strumenti e storico degli snapshot: il foglio non li contiene.

## 4. Mappa foglio → app

### 4.1 Foglio Spese, la tabella

| Colonna | Nell'app | Regola |
| --- | --- | --- |
| Categoria | `categoria` del CSV | Le dieci categorie del foglio restano con lo stesso nome (D-OA3). Quattro righe di maggio hanno la categoria scritta male («A1 - Voli Aerei» … «A4 - Voli Aerei»): diventano **Viaggi**. «Risparmi» e «Investimenti» non entrano (D-OA6). |
| Descrizione Spesa | `note`, primo pezzo | Il testo resta intero; da qui si ricava anche la sottocategoria (D-OA5). |
| Spesa Ordinaria (Si/No) | `note`, «straordinaria» | Nessun campo dell'app ha questo significato (D-OA11). |
| Pagamento · Banca | `note`, ultimo pezzo | Es. «Carta Banca A», «Contanti». Con «BP (n)» la nota dice «buoni pasto ×n». L'import non collega le righe ai conti (D-OA12). |
| Mese · Giorno | `data` | `2026-MM-GG`. |
| Importo | `importo`, `tipo` | Positivo → una spesa. Negativo → una **entrata** nella categoria «Rimborsi» (D-OA9). Zero → scartata (una riga). |
| Giorno_2 · GiornoMese · Univoco | — | Colonne calcolate per le pivot: l'app ricava le stesse cose dalla data. |

### 4.2 Gli altri blocchi e fogli

| Nel foglio | Nell'app | Come |
| --- | --- | --- |
| Spese ricorrenti mensili (giorno, importo) | **Serie ricorrenti** mensili in Cashflow (`isRecurring`, `recurringDay`) | A mano, dal primo mese dopo l'import (§ 8.2). |
| Avviso «potrebbero averti accreditato…» | — | Non serve: la serie scrive le righe in anticipo, Tracciamento le mostra come «già in calendario». |
| Promemoria di disdetta | — | Fuori dall'app (calendario). Alla disdetta si accorcia la serie. |
| Buoni pasto accumulati | Una categoria di entrata «Buoni pasto» + la nota «buoni pasto ×n» sulle spese | Il saldo dei buoni non si traccia (P-OA3). |
| Categorie × benchmark mensile | **Cashflow › Budget**: un budget mensile per categoria | A mano (§ 8.1). |
| Bilancio mensile, «Delta BM» | Tracciamento (Risparmio del mese) e Budget | Ricavati, niente da portare. |
| Analisi: spesa per giorno della settimana | Analisi spese › **Calendario delle spese** (il giorno che pesa di più) | Ricavato. |
| Analisi: spesa per giorno del mese | Tracciamento › **Andamento del mese** | Ricavato. |
| Analisi: filtro per categoria e «Spesa Ordinaria» | Analisi spese per categoria; «straordinaria» si cerca nelle note | Il filtro Si/No non ha un equivalente (D-OA11). |
| Recap Mensili: entrate | Righe di entrata, una per voce e per mese (D-OA8) | Nel CSV. |
| Recap Mensili: uscite per categoria contro il benchmark | Budget e Analisi spese | Ricavati. |
| Spese Viaggio: voci chiuse | Già nel foglio Spese come importi negativi → «Rimborsi» | Nel CSV. |
| Spese Viaggio: voci aperte e scenari | — | Fuori dall'app (D-OA10, P-OA4). |
| Mesi | — | Elenchi a tendina, niente da portare. |

## 5. Categorie che l'import crea

L'import crea le categorie che non esistono, con le sottocategorie, alla conferma dell'anteprima. Su un
account nuovo sono **quattordici**:

| Categoria | Tipo | Sottocategorie (D-OA5) |
| --- | --- | --- |
| Casa | Spese Fisse (D-OA4) | Affitto · Condominio · Internet · Bollette · Arredamento e oggetti casa |
| Spesa Alimentare | Spese Variabili | Supermercato · Caffè lavoro · Mensa lavoro |
| Abbonamenti & Trasporti | Spese Variabili | Palestra · PayTV e streaming · Telefono e cloud · Trasporti |
| Tempo Libero & Svaghi | Spese Variabili | Ristoranti · Colazioni · Aperitivi · Esperienze |
| Viaggi | Spese Variabili | Voli · Hotel · Treni e bus · Esperienze di viaggio |
| Shopping Personale | Spese Variabili | Vestiti · Cura personale · Elettronica · Hobby |
| Salute | Spese Variabili | Farmacia · Lenti a contatto · Visite ed esami |
| Altro | Spese Variabili | Regali · Altre spese |
| Stipendio | Entrate | — |
| Buoni pasto | Entrate | — |
| Bonifici dai genitori | Entrate | — |
| Regali ricevuti | Entrate | — |
| Altre entrate | Entrate | — |
| Rimborsi | Entrate | — |

Le sottocategorie seguono l'elenco «Spese di Pertinenza» che il foglio scrive accanto a ogni categoria. Dopo
l'import l'amico può rinominarle, spostarle o assegnare un ruolo 50/30/20 da Impostazioni.

## 6. Regole di conversione

Il convertitore (`converti.py`, nei file del progetto) applica queste regole, nell'ordine:

1. **Righe lette**: dalla riga 34 del foglio Spese in giù, solo quelle con una categoria. Le righe sotto la
   tabella (un piccolo calcolo «prezzo base / prezzo bundle») sono scartate.
2. **Categoria**: «A*n* - Voli Aerei» → Viaggi.
3. **Scartate**: importo zero; categorie «Risparmi» e «Investimenti» (D-OA6); la caparra dell'affitto (D-OA7).
4. **Data**: `2026-{mese}-{giorno}`.
5. **Tipo e segno**: importo > 0 → spesa, `fixed` per Casa e `variable` per le altre; importo < 0 → `income`
   nella categoria «Rimborsi», importo in valore assoluto, la nota dice «rimborso di {categoria}».
6. **Sottocategoria**: la prima regola che riconosce la descrizione (parole chiave per categoria, es. «mensa»
   → Mensa lavoro, «affitto» → Affitto); altrimenti la sottocategoria «di resto» della categoria
   (Supermercato, Ristoranti, Trasporti, Altre spese…).
7. **Nota**: `descrizione · straordinaria? · pagamento banca` oppure `· buoni pasto ×n`.
8. **Entrate**: per ogni mese e ogni voce di Recap Mensili con un valore, una riga `income` datata il **27 del
   mese** (P-OA1) nella categoria della tabella del § 5.
9. **File**: `;` come separatore, virgola decimale senza separatore delle migliaia, UTF-8 con BOM, intestazioni
   `data;importo;tipo;categoria;sottocategoria;note;valuta`.

### 6.1 Quadratura (valori di riferimento sul file d'esempio)

`esempio-import.csv` è inventato e segue le stesse regole. L'anteprima dell'import deve dire:

| | Marzo 2026 | Aprile 2026 | Totale |
| --- | --- | --- | --- |
| Righe | 13 | 8 | **21** |
| Uscite | 700 + 50 + 10 + 40 + 4 + 30 + 20 + 120 + 60 + 15 + 25 = **1.074 €** | 700 + 50 + 45 + 35 = **830 €** | **1.904 €** |
| Entrate | 2.000 + 140 = **2.140 €** | 60 + 2.000 + 150 + 100 = **2.310 €** | **4.450 €** |
| Categorie da creare | | | **12** (8 di spesa, 4 di entrata) |

Sui dati veri la quadratura è mese per mese contro Recap Mensili, con tre differenze attese e spiegate (le
cifre sono nel riepilogo nei file del progetto):

- uscite dell'app = uscite del foglio − quote Risparmi e Investimenti (D-OA6) − caparra (D-OA7, solo marzo);
- maggio ha in più le quattro righe «A*n* - Voli Aerei», che Recap Mensili non conta perché la categoria non è
  nella sua tabella;
- agosto ha in più, nelle uscite e nelle entrate, i tre rimborsi: il foglio li sottrae, l'app li conta come
  entrata (D-OA9). Il risparmio del mese non cambia.

## 7. Decisioni

Proposte il 2026-11-27, **da confermare**. Ognuna con l'alternativa scartata e il motivo.

| ID | Decisione | Alternative scartate e perché |
| --- | --- | --- |
| **D-OA1** | Nella repo solo regole ed esempi inventati; il file originale, il CSV convertito, il convertitore e il riepilogo con le cifre vere nei file del progetto. | *Committare il CSV vero*: la repo è pubblica, e la regola 7 tiene fuori anche le cifre di Giorgio. *Script nel repo (`scripts/`)*: legge un solo foglio di una sola persona, una volta. |
| **D-OA2** | Nessun codice nuovo per l'onboarding: CSV + passi a mano. | *Estendere l'import (conto, fuori budget, centro di costo)*: utile anche ad altri, ma diventa una card a sé (P-OA7) e non serve per partire. |
| **D-OA3** | Le dieci categorie del foglio restano con lo stesso nome. | *Rifarle sulle categorie di Giorgio*: l'amico le conosce e il budget resta uno a uno con i suoi benchmark. |
| **D-OA4** | Il tipo è per categoria: **Casa = Spese Fisse**, le altre Spese Variabili. Le poche spese di casa occasionali (oggetti, una spesa) restano in Casa come nel foglio. | *Tipo per riga* (le voci della lista ricorrenti fisse, il resto variabile): l'app identifica la categoria con (nome, tipo), quindi nascerebbero due «Casa» e due «Abbonamenti & Trasporti», e il budget per categoria si spezza. *Tutto variabile*: Analisi perde la divisione fisse/variabili, e il benchmark di Casa è quasi tutto affitto, condominio e internet. |
| **D-OA5** | Sottocategorie ricavate dalla descrizione con parole chiave, seguendo le «Spese di Pertinenza» del foglio; quello che non si riconosce va nella sottocategoria di resto. | *Nessuna sottocategoria*: Analisi spese si ferma alla categoria. *Una sottocategoria per descrizione*: centinaia di voci («Gelato X», «Spesa Y»). |
| **D-OA6** | Le quote mensili «Risparmi» e «Investimenti» **non** entrano come spese. Il risparmio nell'app è entrate − spese, e i soldi messi da parte sono nei conti di Patrimonio. | *Importarle come spese*: il risparmio del mese leggerebbe circa zero ogni mese e il Panoramica direbbe che non risparmia. *Come trasferimenti*: l'import li rifiuta (servono i conti d'origine e di destinazione). |
| **D-OA7** | La caparra dell'affitto (marzo) non è una spesa: entra in Patrimonio come strumento a valore manuale, se l'amico la vuole vedere. | *Importarla come spesa di Casa*: marzo leggerebbe una spesa straordinaria che tornerà indietro, e la media dei mesi salirebbe. |
| **D-OA8** | Le entrate di Recap Mensili diventano una riga per voce e per mese, nelle cinque categorie di entrata del § 5. | *Una sola riga «Entrate» al mese*: si perde la differenza tra stipendio e regali in Analisi. |
| **D-OA9** | Un importo negativo diventa un'**entrata** «Rimborsi», come l'app tratta un rimborso (`budgetUtils.ts`, `countsTowardBudget`). La spesa originale resta lorda. | *Spesa con importo positivo nella stessa categoria*: l'import prende il valore assoluto e la scriverebbe come spesa, raddoppiandola. *Sottrarla dalla riga originale*: cambia i dati e la riga originale è spesso in un altro mese. |
| **D-OA10** | Il saldo con la compagna resta fuori dall'app; quando si chiude, la cifra ricevuta è una riga «Rimborsi». | *Divisione*: risponde a «quanto resta a ciascuno», non a «chi deve a chi», e chiede le entrate di entrambi. *Centro di costo per il viaggio*: utile per sapere quanto è costato, non per il saldo (facoltativo, P-OA4). |
| **D-OA11** | «Spesa Ordinaria = No» diventa la parola «straordinaria» nella nota. | *Tipo di spesa*: fisse/variabili è un'altra cosa. *«Fuori dal budget»*: escluderebbe la spesa dal budget, che il foglio non faceva. *Una sottocategoria*: mescola due assi. |
| **D-OA12** | Le righe importate non sono collegate ai conti; i conti si creano in Patrimonio con il saldo di oggi. | *Collegarle*: l'import non lo fa per scelta (`expenseImportService.ts`: lo storico non deve muovere i saldi), e i saldi di oggi li sa l'amico. |

## 8. Cosa si fa a mano il primo giorno

### 8.1 Budget

Cashflow › Budget, un budget **mensile per categoria** per le otto categorie di spesa, con i benchmark del
foglio. Il tetto complessivo è la somma delle otto, **senza** Risparmi e Investimenti (D-OA6). Il dialogo
propone un importo dagli anni passati: con meno di un anno di storia va scritto a mano.

### 8.2 Spese ricorrenti

Per ogni voce della lista «Spese Ricorrenti mensili» del foglio: Nuova spesa › ricorrente, mensile, nel suo
giorno, con la categoria e la sottocategoria del § 5, **dal primo mese non importato** (dicembre 2026), così
che non si sovrapponga alle righe già importate. Una voce con una disdetta in vista nasce con il numero di
mesi che le restano. Il collegamento al conto si sceglie qui (le serie lo supportano, l'import no).

### 8.3 Conti

Patrimonio: un conto per ogni banca della colonna Banca (le carte prepagate e PayPal come metodo, non come
conto, salvo che l'amico ci tenga un saldo), più i contanti se li vuole seguire, ognuno con il saldo di oggi.
Lo strumento della caparra, se D-OA7 resta (P-OA2).

## 9. Il giorno dell'onboarding

Prima (Giorgio, dal Mac):

1. Backup completo (`npm run backup:export`), come chiede la card.
2. Chiedere all'amico le risposte ai punti aperti P-OA1…P-OA5 e, se cambia qualcosa, rilanciare il
   convertitore.
3. Aprire la registrazione solo per la sua email (`doc/sicurezza/S2-utenti-ammessi.md` caso d'uso 3):
   `REGISTRATION_WHITELIST` con la sua email e `NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED=true` su Vercel,
   redeploy, iscrizione riaperta nella console Firebase.

Insieme (circa 30 minuti):

4. Lui si registra da `/register`. La registrazione crea il profilo, l'allocazione di default e lo ammette
   (`/api/auth/activate`); entra nella vista **Essenziale** (`doc/essenziale/README.md`). **Non** crearlo
   dalla console Firebase: quella strada salta il profilo e l'allocazione di default (`AuthContext.tsx`,
   `signUp`), e va poi completata con `users:allow`.
5. Giorgio richiude subito l'iscrizione nella console.
6. Impostazioni › Cashflow › Import CSV: carica `spese-alessio-import.csv`. Controllare l'anteprima contro il
   riepilogo (righe, entrate, uscite, 14 categorie, nessuna riga scartata) e importare. Se qualcosa non va,
   «Annulla import» cancella tutto il lotto.
7. Conti (§ 8.3), budget (§ 8.1), serie ricorrenti (§ 8.2).
8. Tema, e se servono le aree della vista Completa (Impostazioni › Funzioni › «Cosa vedi»).
9. Dirgli le tre cose della card (Giorgio può vedere i suoi dati, esiste un backup, può avere la sua copia).
10. Assistente AI ed email periodiche: oggi le email vanno solo a Giorgio (`EMAIL_RECIPIENT_ALLOWLIST`); se
    sono anche per lui, aggiungere la sua email.

Dopo:

11. Un `backup:export -- --email <sua email>` per avere la prima copia del suo account.
12. Nei giorni seguenti, il grafico «Letture» della console Firebase (la card).

## 10. Prove fatte

Il 2026-11-27, in un container cloud, sugli emulatori (`npm run emulators` + `npm run dev:emulator`), con uno
script Playwright usa e getta:

- account **nuovo** registrato da `/register` → entra in Essenziale;
- `esempio-import.csv` e il CSV vero letti con `parseImportCsv` + `buildImportPlan` (gli stessi del wizard):
  nessun errore; l'esempio dà le cifre del § 6.1;
- il CSV vero caricato dal wizard: l'anteprima mostra le righe attese, 0 scartate, 14 categorie con le
  sottocategorie del § 5; «Importa» scrive tutte le righe; le somme per mese in Firestore coincidono con il
  riepilogo del convertitore al centesimo; nessuna riga ha `linkedCashAssetId`;
- Tracciamento sul mese corrente mostra entrate, spese, risparmio e l'andamento del mese dai dati importati.

Non provato: il primo accesso in produzione e l'aspetto delle pagine con i suoi dati (si guarda insieme a lui).

## 11. Punti aperti

- **P-OA1** Il giorno delle entrate: il 27 è un'ipotesi. Da chiedere: quando arriva la busta paga e quando i
  buoni pasto.
- **P-OA2** La caparra: la vuole in Patrimonio, o fuori dall'app?
- **P-OA3** I buoni pasto: basta la categoria di entrata, o vuole un «conto» Buoni pasto in Patrimonio per
  vederne il saldo?
- **P-OA4** Il viaggio con la compagna: un centro di costo per il viaggio (si assegna a mano dopo l'import,
  circa venti righe con «Spagna» nella descrizione)? E le voci ancora aperte, che fine fanno?
- **P-OA5** Tre voci da capire con lui: la sigla ricorrente in «Altro» (nove righe), il piano di accumulo
  mensile per un'altra persona (resta una spesa, o è un suo investimento?) e le righe «Accantonamento» (una spesa
  messa da parte prima di farla: restano spese nel mese in cui le ha messe da parte, come nel foglio).
- **P-OA6** Marzo non ha entrate in Recap Mensili: o lui le ricorda, o marzo resta un mese di sole spese (la
  pagina Risparmio nel tempo lo salta).
- **P-OA7** Card possibile, fuori da qui: l'import CSV con colonne facoltative per il conto e per «Fuori dal
  budget».
- **P-OA8** Visto nella prova: su un account con 8 mesi di storia, Tracciamento › Risparmio nel tempo dice
  «In media il 14% su 11 mesi chiusi», ma la media è sui 7 mesi con entrate. Da verificare se è la frase o il
  conto; card a parte se è un difetto.

## 12. Criteri di accettazione

- **CA1** L'anteprima dell'import di `esempio-import.csv` su un account vuoto dice 21 voci, 0 scartate, 12
  categorie da creare, 4.450 € di entrate e 1.904 € di uscite, dal 01/03/2026 al 27/04/2026.
- **CA2** L'anteprima del CSV vero dice 0 scartate e 14 categorie, e le cifre del riepilogo nei file del
  progetto.
- **CA3** Dopo l'import, per ogni mese da marzo a novembre 2026, le uscite e le entrate di Tracciamento
  coincidono con il riepilogo, e la differenza da Recap Mensili è spiegata dalle tre voci del § 6.1.
- **CA4** Nessuna riga importata ha un conto collegato; i saldi dei conti sono quelli scritti a mano.
- **CA5** Il budget ha otto voci mensili per categoria e nessuna per Risparmi e Investimenti.
- **CA6** Le serie ricorrenti partono da dicembre 2026: nessun mese importato ha la stessa spesa due volte.

## 13. File

- `doc/onboarding-alessio/README.md` (questo), `doc/onboarding-alessio/esempio-import.csv` (inventato).
- Nei file del progetto, `onboarding-alessio/`: `converti.py`, `spese-alessio-import.csv`, `riepilogo.md`.
- Codice letto: `lib/utils/expenseImport.ts`, `lib/services/expenseImportService.ts`,
  `components/settings/ExpenseImportSection.tsx`, `lib/utils/budgetUtils.ts`, `lib/utils/expenseBreakdown.ts`,
  `contexts/AuthContext.tsx`, `doc/guide/cashflow{,-budget,-divisione}.md`, `doc/sicurezza/S2-utenti-ammessi.md`.
