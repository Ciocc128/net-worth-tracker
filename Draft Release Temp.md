# Draft release notes

> Accumulates until the next tag (WORKFLOW.md § Where things are recorded). Grouped by area; one entry per
> surface, rewritten to its final state.

## ✨ New Features

- Added «Aggiorna valore» to Previdenza: the monthly overwrite of a pension fund's value from its statement now lives on the page — in the header beside «Registra versamento» and in the footer of «Il fondo oggi» — instead of in the asset form. The dialog states the trap before the field: «I 821 € versati questo mese sono già dentro l'estratto: non aggiungerli».

## 🐛 Bug Fixes

- Fixed the fiscal year of a contribution: it is now chosen around the payment date (the year before, the year, the year after) instead of typed freely, so a typo can no longer file a contribution into a year the page never shows; a January payment for the previous year reads «Competenza 2025, pagato nel 2026».
- Fixed the delete confirmation in the Versamenti ledger: the row now says what the delete undoes («eliminando, il conto verrà riaccreditato») while the button stays a compact «Conferma».

## 🔧 Improvements

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
