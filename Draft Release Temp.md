# Draft release notes

> Accumulates until the next tag (WORKFLOW.md § Where things are recorded). Grouped by area; one entry per surface, rewritten to its final state.

## ✨ New Features

## 🐛 Bug Fixes

## 🔧 Improvements

- Patrimonio › Strumenti: a composite instrument (a 60/40 fund, a balanced ETF) is still one row, but its class chip now shows every class it holds — one segment per class, as wide as its share and in that class's colour: «Azioni · Obbl.» for two, «Misto» for three or more. A class under 5% gets no segment, and a screen reader hears every share («Azioni 60%, Obbligazioni 40%»). The group headers and the sort by class keep the prevailing class.

## 📚 Documentation

- The Patrimonio guide records how the composite chip is drawn (segments, labels, the 5% floor, why the ring is an overlay and not a border) and that the chip and the row's group share one ranking of the classes.
