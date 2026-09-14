# Draft release notes

> Accumulates until the next tag (WORKFLOW.md § Where things are recorded). Grouped by area; one entry per
> surface, rewritten to its final state.

## ✨ New Features

- Added a second sentence to the Cashflow verdict whenever the calendar reaches past today: the judgement is on what has happened («A settembre finora le spese superano le entrate di 355 €: entrate 302 €, spese 656 €»), then «Con 1297 € di spese e 2456 € di entrate già in calendario da qui a fine mese, il mese chiude a +805 € (il 29%)» — both sides always named, an empty one as «nessuna entrata attesa». On the 14th the page said «Settembre sta andando bene · 29%» on a salary dated the 15th.
- Added the «solo questa o tutte?» modal for deleting a row of an instalment plan or a recurring series (from the table and from the feed), naming the row, the plan and what the account gets back; a plain row of the Tabella view now arms in place and prints «Eliminando, il conto viene riaccreditato di 373,81 €» beside «Conferma».
- Added memory to the «Feed | Tabella» switch of Movimenti: the table stays the table across visits.

- Added «in calendario» as its own figure on Cashflow › Budget: the verdict names what is spent and what is still dated after today («hai speso 656 € e hai altri 1297 € già in calendario (1953 € su 3000 €, il 65% del tetto)»), the hero prints the spent amount with «+ 1297 € in calendario» beside it, and the bar carries two fills — spent, then scheduled in a lighter shade.
- Added the calendar to every Avvisi row: «soglia 50% · anno al 70%» under a crossed threshold, painted amber only when the share is ahead of its own window, «da gennaio» on an annual budget already over, and «soglie di quota» in the aside.
- Added «Conferma» in words to every budget row's delete, the consequence printed in the row («Eliminando, il budget di Cibo sparisce; le spese restano.») and an announcement for screen readers; the pencil steps aside while the row is armed.

- Added the maturity and the next coupon under a bond’s name in the Strumenti table («scade il 10/03/2032 · prossima cedola 10/12»), on desktop and on a phone: a BTP no longer reads like a crypto row.
- Added «Andamento» as a view of the Strumenti table: the three Δ windows take the place of Quantità, Prezzo, PMC and TER, are sortable, and the table no longer scrolls sideways at 1440; both toggles are remembered.

- Added deep links from the Panoramica: a row of «Spese per categoria» or «Entrate per categoria» opens that category's Scheda on Analisi, the two tiles read the concentration («Il 29% va in Mutuo; le prime tre fanno il 63%») and close on «Tutte le categorie in Analisi», Composizione on «Il piano in Allocazione».

- Added «Aggiorna valore» to Previdenza: the monthly overwrite of a pension fund's value from its statement now lives on the page — in the header beside «Registra versamento» and in the footer of «Il fondo oggi» — instead of in the asset form. The dialog states the trap before the field: «I 821 € versati questo mese sono già dentro l'estratto: non aggiungerli».

## 🐛 Bug Fixes

- Fixed the Cashflow delta of the month in progress, which compared fourteen days against the whole previous month («in calo del 59,8% su agosto»): it now compares the same days («sui primi 14 giorni di agosto», «vs 1–14 ago»); the month-end projection still reads last month whole.
- Fixed the type colours of the Movimenti table, which painted income blue and fixed expenses green while the legend above said the opposite — the same green meant «Entrate» in one place and «Spese Fisse» in the other; dot, badge and legend now share one colour per type, and an income amount takes the gain colour.
- Fixed «89% · 9% · 2%» painted outside the «Entrate per categoria» tile at 1440: the share column yields when the list is narrower than 250px.
- Fixed the expense form refusing an empty submit with «Invalid input» in English and a silent reading line: every message is Italian, the reading says «Mancano 2 campi: Importo e Categoria.», the first field scrolls into view and takes the focus, and step 2 keeps «Passo 2 di 2 · Spesa variabile».
- Fixed the transfer form: origin and destination accounts are now required and must differ, with the reason under each field; a transfer could be saved without accounts and moved no money.
- Fixed the Movimenti table for a screen reader and for the eye: every header names its column and the sorted one says its direction, dates and amounts are in the mono face; «Tutte le categorie in Analisi» is a 32px target (44 on touch).
- Fixed the tense of a future period («Nel 2043 hai speso») — a year of instalments is not gone yet.

- Fixed the Budget verdict and hero calling «usato/speso» what was still in the calendar: with a mortgage due on the 27th the page said «hai usato il 65% del tetto … 18 punti avanti rispetto al calendario» on the 14th, for 656 € actually spent; the reading now compares only the spent share («il 22% del tetto al 47% del mese: 25 punti indietro … con le spese in calendario sei al 65%»).
- Fixed the Budget thresholds counting rows dated after today and ignoring the calendar: «Budget complessivo 65% · soglia 50%» in amber for a ceiling at 22%, and «Tecnologia 54% · soglia 50%» in amber with the year at 70%; a threshold is now a fact of what is spent, and a row behind its calendar is a number, not a warning.
- Fixed the budget form refusing in silence: the submit was disabled until the form was valid and the two refusals were red paragraphs under the amount; the reading line now says «Mancano 2 campi: Categoria e Importo.» or «L'importo supera i 2330 € disponibili sotto il tetto.», the field is marked and focused, the four radios are one tab stop, and the focus returns to «Aggiungi budget» on close.
- Fixed the Budget touch targets under 44px on a phone (the threshold chips, the ceiling input, the switch's row, the drawer's radios, select and amount, the empty state's button) and the progress bars announcing an exceeded budget as «100» to a screen reader (now «231%, oltre di 1963 €»).
- Fixed «Salvato» staying in the Per categoria aside forever, the «fissa» rule repeated in three footers (now once, with its cause: the category's type), and the small animations of the tab that ignored the reduced-motion setting.

- Fixed the reading line of every modal, which was rendered smaller and greyer than designed and never turned red on a refused submit («Mancano 2 campi: …» was grey since the modals were unified): a refusal is now in the alert colour at the reading's size, on every form.

- Fixed the Registro’s XIRR on a young position: a position opened 47 days earlier printed «+4388,68% annualizzato»; under six months the vital is now «Rendimento sul periodo · +66,92% · in 53 giorni, non annualizzato».
- Fixed the asset form refusing a submit in English and in silence («Ticker is required»): the messages are Italian, the reading line says «Mancano 2 campi: Ticker e Nome.» and the first refused field scrolls into view.
- Fixed the cash-account detail: Escape while «Elimina» was armed closed the modal with the row still armed; the delete is now a two-click confirm without a timer and, while armed, the reading says what the second press loses and that it is not reversible.
- Fixed hand-valued rows in the Strumenti table (a property, a pension fund, a private-equity stake): they printed a quantity of 130.000 at 1,0000 € and a «+0,00 €» gain that measured nothing; they now print «—» there, «valore a mano dal 12/08» under the name, and no G/P.
- Fixed the sale note of «Quanto costa vendere» in target mode, which re-read the gross value typed as a net proceed and added the tax on top.

- Fixed the Panoramica's verdict printing a database key («e pension hanno fatto il grosso del lavoro»): the pension funds now read as «i fondi pensione», and the Cashflow tile says «Ad agosto» instead of «A agosto».
- Fixed the light-mode chart palette: Liquidità and Immobili were two oranges a reader could not tell apart, Trend Following and Obbligazioni two teals, and the net-worth curve was drawn in the colour of a loss; every class now keeps the same hue in light and dark (Azioni blue, Obbligazioni green, Criptovalute amber, Immobili violet, Liquidità coral), in the emails and the PDF too.
- Fixed the truncated category names in the ranked lists of the Panoramica, Tracciamento, Analisi, Dividendi, Hall of Fame and Previdenza («Stipendio Giu…», «Entrate da inv…»): the name now takes the room it needs and the bar beside it takes the rest.

- Fixed «Scarica dividendi storici» for an instrument added to the app after its dividends: the download now says how many payments were left out because they precede the day you hold the instrument, and how to include them (record the purchase in the Registro operazioni with its real date). It used to say only «Nessun nuovo dividendo trovato».

- Fixed the fiscal year of a contribution: it is now chosen around the payment date (the year before, the year, the year after) instead of typed freely, so a typo can no longer file a contribution into a year the page never shows; a January payment for the previous year reads «Competenza 2025, pagato nel 2026».
- Fixed the delete confirmation in the Versamenti ledger: the row now says what the delete undoes («eliminando, il conto verrà riaccreditato») while the button stays a compact «Conferma».

## 🔧 Improvements

- Improved «Aggiungi conto» on Patrimonio: it opens on the account form instead of asking «Che cosa vuoi aggiungere?» with eight choices; the asset form keeps its step counter («Passo 2 di 2 · ETF») and its labels are lower-case Italian.
- Improved Patrimonio’s two-click deletes on every row: no 3-second timer, Escape or a click elsewhere disarms, the arm is announced once per tile, and every row action names its instrument.
- Improved Patrimonio’s accessibility: the sortable headers are buttons, the actions header is named for a screen reader only, the sparklines on a phone are images and not thirteen mute tab stops, the reading order matches the visual one, the count line links to the table, the footer links and info buttons are 32px on desktop and 44px on touch.

- Improved the falling-month verdict: when the market gained and the tax withheld on a sale explains the drop, the headline says so — «Settembre è in calo per le tasse sulla vendita di VWCE, non per il mercato.» — and the sale comes right after the variation.
- Improved the period control of the net-worth chart on the Panoramica: readable labels, thumb-sized targets on a phone, arrow-key navigation, and unselected periods that stay legible in light mode — the same control every other page uses.
- Improved the Panoramica's third row (three equal tiles) and the Costi tile, whose «Pesano di più» now follows the figures instead of leaving a gap; «Costo annuo» is no longer amber on every account.

- Improved the Rendimento tile on Previdenza: each row's caption («retribuzione, non rendimento», «mercato + datore») sits on its own line under the label, so «Contributo datoriale» no longer breaks mid-word into three lines on desktop.
- Improved «Il fondo oggi»: its footer judges the age of the hand-kept value — «valore fermo dal 12 ago 2026» when the last update belongs to a closed month — instead of printing a neutral date.
- Improved the contribution flow: after a contribution the confirmation names the next step («Quando arriva l'estratto conto, aggiorna il valore del fondo: lo include già») with an «Aggiorna valore» action, so the order that prevents a double count is taught where it matters.
- Improved the fiscal-year switch on Previdenza: it scrolls inside itself once the years outgrow the row, and «Il fondo oggi» no longer recomputes when the year changes.
- Improved Previdenza on a first run: when nothing is measurable yet, the «Dettaglio» with «Come aggiornare il valore» opens by itself.
- Improved touch targets on Previdenza: 44px on phones, 32px on desktop (they were 28px) for the ledger's delete, «Mostra tutti» and the aside links; the header actions are 40px on touch.
- Improved accessibility on Previdenza: every form error is announced with its field, the year switch is a radio group, the tiles' names carry the year they show, and the ledger announces arm and cancel once instead of once per row.

- Improved Impostazioni: a category without a colour of its own now takes the theme's first chart colour instead of a fixed blue, so it follows the selected theme like everything else.

## 📚 Documentation

- Previdenza's guide records what was deliberately left as is and why: the snapshots query stays whole, the skeleton waits for every query, and a contribution can be deleted but not edited.
