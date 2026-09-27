# Draft release notes

> Accumulates until the next tag (WORKFLOW.md § Where things are recorded). Grouped by area; one entry per surface, rewritten to its final state.

## ✨ New Features

- Allocazione › Composizione ideale: a third mode, «Con vendite mirate», between Ideale (sells everything overweight) and Raggiungibile col PAC (sells nothing). Set a tax ceiling in euro and tick «Non vendere» on the instruments you want to keep: the optimizer sells first what costs least in tax for each point of target gained, and stays under the ceiling. The table shows the estimated tax on every row in sale and a total — for example «Vendi 8.000 €, paghi circa 300 € di tasse (tetto 300 €).». A high enough ceiling gives exactly Ideale's weights; a ceiling of 0 sells only positions at a loss. An instrument whose fiscal cost is unknown is never sold. If your limits in Impostazioni force a sale, the least tax that sale costs becomes the ceiling, and the total line says so.

## 🐛 Bug Fixes

## 🔧 Improvements

- Patrimonio › Strumenti: a composite instrument (a 60/40 fund, a balanced ETF) is still one row, but its class chip now shows every class it holds — one segment per class, as wide as its share and in that class's colour: «Azioni · Obbl.» for two, «Misto» for three or more. A class under 5% gets no segment, and a screen reader hears every share («Azioni 60%, Obbligazioni 40%»). The group headers and the sort by class keep the prevailing class.

## 📚 Documentation

- The optimizer guide describes the third mode: the three paths (Ideale, no taxed sale, the ceiling binding), why the binding case uses an exact active-set solver, the rounding that never invents a sale, and the known limits (conflicts at a fixed tax multiplier, losses not offset against gains, fees not counted).

- The Patrimonio guide records how the composite chip is drawn (segments, labels, the 5% floor, why the ring is an overlay and not a border) and that the chip and the row's group share one ranking of the classes.
