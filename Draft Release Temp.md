# Draft release notes

> Accumulates until the next tag (WORKFLOW.md § Where things are recorded). Grouped by area; one entry per surface, rewritten to its final state.

## ✨ New Features

- Allocazione › Composizione ideale: a third mode, «Con vendite mirate», between Ideale (sells everything overweight) and Raggiungibile col PAC (sells nothing). Set a tax ceiling in euro and tick «Non vendere» on the instruments you want to keep: the optimizer sells first what costs least in tax for each point of target gained, and stays under the ceiling. The table shows the estimated tax on every row in sale and a total — for example «Vendi 8.000 €, paghi circa 300 € di tasse (tetto 300 €).». A high enough ceiling gives exactly Ideale's weights; a ceiling of 0 sells only positions at a loss. An instrument whose fiscal cost is unknown is never sold. If your limits in Impostazioni force a sale, the least tax that sale costs becomes the ceiling, and the total line says so.

- Added an optional reading of Analisi › Flusso by 50/30/20 role (Necessità · Desideri · Risparmi): switch it on in Impostazioni › Spese, give each spending category a role (a subcategory can override it), and the Flusso opens on «Per ruolo» with «Per tipo» one tap away. What has no role yet reads «Da classificare», a period that spent more than it earned shows the gap as «Coperto dal patrimonio», and when some spending is itself a saving the reading says how much was set aside and how much was left over. (Contributed by Ciocc128.)

- Added, in Cashflow › Divisione, the income left «In comune» paying the shared spending first: a refund on a shared bill or a salary nobody attributed comes off the pool before the shares, the «In comune» tile shows it under its figure («Entrate in comune −300 €», «Da dividere 2110 €») and the verdict says it in the same sentence («le spese in comune sono 2410 €, meno 300 € di entrate in comune: 2110 € da dividere, 1266 € a Giuseppe (60%)…»); when the shared income covers the shared spending whole the surplus is stated («avanzano 100 €») rather than handed out. The shares now come from every income attributed to a person whatever its category, so the tab no longer depends on the categories marked as labor income and says «entrate» where it said «stipendio» («Registra le entrate di Marcella in Tracciamento e intestagliele»); the monthly email's «Spese in comune» section carries the same figures.

## 🐛 Bug Fixes

- Fixed a category edited in Impostazioni › Spese (name, type or role) keeping its old values in Analisi for up to five minutes: the change now arrives at once.

- Fixed the smallest categories of the Analisi › Flusso chart being painted black — invisible on a dark theme — when a branch held more than seven categories: a shade now never goes darker than 55% of its colour.

## 🔧 Improvements

- Improved the AI comment of the periodic and weekly budget emails: it now goes through a small provider layer (`lib/server/llm`) and runs on an open model through OpenRouter, set with `OPENROUTER_API_KEY`; which surface calls which provider and model is written in one place (`lib/constants/aiModels.ts`), so an installation with only an Anthropic key can route the emails back to Claude. Every request asks for providers that neither train on nor retain the data, free model variants are refused, and every call writes one `[ai-usage]` line (surface, model, tokens, cost) in the server logs. An answer that arrives cut off is now discarded rather than printed half-way, and whatever goes wrong the email is still sent, without the comment. The web search the monthly comment could use is gone. On a typical month the comments cost a fraction of a cent.

- Improved Rendimenti without an Anthropic key: «Analizza con AI» is no longer shown, instead of opening a dialog that could only fail.

- Improved Analisi › Flusso on a phone: it is now a bar of the period's spending split by type, each type's categories as rows (a row opens its Scheda) and what was left over as a closing line, instead of a Sankey too narrow to read; the printed shares always add up to 100, a type that rounds to zero reads «<1%», and when the period holds amounts that are only scheduled the closing line says so. From 640px up the Sankey is unchanged. (Contributed by Ciocc128.)

- Improved Patrimonio › Strumenti for a composite instrument (a 60/40 fund, a balanced ETF): still one row, but its class chip now shows every class it holds — one segment per class, as wide as its share and in that class's colour, «Azioni · Obbl.» for two, «Misto» for three or more. A class under 5% gets no segment, a screen reader hears every share, and the group headers and the sort by class keep the prevailing class. (Contributed by Ciocc128.)

## 📚 Documentation

- SETUP.md, README.md and `.env.local.example` describe `OPENROUTER_API_KEY` and what `ANTHROPIC_API_KEY` still enables; the email guide describes the provider layer, what makes a comment be discarded, and a known gap found while testing it: the periodic email still measures allocation on the whole net worth and reads «mercato» as net worth change minus savings, while the app now measures both on the portfolio base and with the trade ledger — an alignment planned before the models are compared.

- The optimizer guide describes the third mode: the three paths (Ideale, no taxed sale, the ceiling binding), why the binding case uses an exact active-set solver, the rounding that never invents a sale, and the known limits (conflicts at a fixed tax multiplier, losses not offset against gains, fees not counted).

- Added the specification for the new Esposizione as the first of the performance series — leverage as notional exposure, an honest coverage line, the Allocazione portfolio as the base, a cache per instrument — and amended the performance and mobile specifications to match the code after the three contributions above. The contributor's guide now says how a contribution that arrives while that work is open is reviewed and merged.

- Added the mobile composition dossier (no code touched): the current small-screen layout measured on 19 surfaces at 390, 768 and 1024px, three directions drawn and tested, the «first screen» one chosen (a short verdict, a strip of at most four figures, one open tile, the rest as closed rows), and nine specifications to implement after the performance ones.
