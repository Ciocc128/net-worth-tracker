# Draft release notes

> Accumulates until the next tag (WORKFLOW.md § Where things are recorded). Grouped by area; one entry per
> surface, rewritten to its final state.

## ✨ New Features

- Added deep links from the Panoramica: a row of «Spese per categoria» or «Entrate per categoria» opens that category's Scheda on Analisi, the two tiles read the concentration («Il 29% va in Mutuo; le prime tre fanno il 63%») and close on «Tutte le categorie in Analisi», Composizione on «Il piano in Allocazione».

- Added «Aggiorna valore» to Previdenza: the monthly overwrite of a pension fund's value from its statement now lives on the page — in the header beside «Registra versamento» and in the footer of «Il fondo oggi» — instead of in the asset form. The dialog states the trap before the field: «I 821 € versati questo mese sono già dentro l'estratto: non aggiungerli».

## 🐛 Bug Fixes

- Fixed the Panoramica's verdict printing a database key («e pension hanno fatto il grosso del lavoro»): the pension funds now read as «i fondi pensione», and the Cashflow tile says «Ad agosto» instead of «A agosto».
- Fixed the light-mode chart palette: Liquidità and Immobili were two oranges a reader could not tell apart, Trend Following and Obbligazioni two teals, and the net-worth curve was drawn in the colour of a loss; every class now keeps the same hue in light and dark (Azioni blue, Obbligazioni green, Criptovalute amber, Immobili violet, Liquidità coral), in the emails and the PDF too.
- Fixed the truncated category names in the ranked lists of the Panoramica, Tracciamento, Analisi, Dividendi, Hall of Fame and Previdenza («Stipendio Giu…», «Entrate da inv…»): the name now takes the room it needs and the bar beside it takes the rest.

- Fixed the transfer form: origin and destination accounts are now required and must differ, with the reason under each field; a transfer could be saved without accounts and moved no money.

- Fixed «Scarica dividendi storici» for an instrument added to the app after its dividends: the download now says how many payments were left out because they precede the day you hold the instrument, and how to include them (record the purchase in the Registro operazioni with its real date). It used to say only «Nessun nuovo dividendo trovato».

- Fixed the fiscal year of a contribution: it is now chosen around the payment date (the year before, the year, the year after) instead of typed freely, so a typo can no longer file a contribution into a year the page never shows; a January payment for the previous year reads «Competenza 2025, pagato nel 2026».
- Fixed the delete confirmation in the Versamenti ledger: the row now says what the delete undoes («eliminando, il conto verrà riaccreditato») while the button stays a compact «Conferma».

## 🔧 Improvements

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
