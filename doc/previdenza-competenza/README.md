# Previdenza — versamenti, data di competenza e valorizzazione

> Dossier aperto il 2026-11-06 (thread «Allineare i versamenti previdenza alla data di competenza»).
> Area: `doc/guide/previdenza.md`. Nessun calcolo cambia: il dossier specifica solo testi del
> dialog, della guida e del toast (D-PV1).

## 1. Il caso da cui nasce

Il fondo pensione del proprietario funziona così:

| Evento | Quando | Esempio (ottobre 2026) |
|---|---|---|
| Stipendio e trattenuta | il 27, o il giorno lavorativo precedente | 27/10 |
| Data operazione sul sito del fondo | il giorno dello stipendio | 27/10 |
| Data di competenza | sempre l'ultimo del mese | 31/10 |
| Valorizzazione visibile (NAV con il versamento) | circa metà del mese successivo | ~15/11 |

La domanda: il versamento di ottobre si registra a novembre, quando il saldo lo mostra. Lo snapshot
di ottobre è chiuso. Serve una data di competenza? Va corretto lo snapshot? Si rischia di contare
il versamento due volte?

## 2. Come funziona oggi (letto nel codice il 2026-11-06)

- **Il valore del fondo si muove quando registri.** `recordPensionContribution`
  (`lib/services/pensionContributionService.ts`) somma l'importo a `quantity` subito, per ogni natura.
- **Il mese dell'effetto è quello di registrazione**, non quello della data: `valueEffectMonth`
  (`lib/utils/pensionReturn.ts`) legge `createdAt`. È voluto: uno snapshot è una foto congelata e solo
  quello del mese corrente viene riscritto dal cron (`app/api/cron/monthly-snapshot/route.ts`), quindi un
  versamento registrato a novembre è nello snapshot di novembre e mai in quello di ottobre. La stessa
  regola la leggono Panoramica, Storico (Driver), Rendimenti e l'attribuzione per strumento.
- **La «Data» del versamento** decide l'anno fiscale (di default il suo anno, ±1 ammesso) e l'ordine
  nel registro. Se il mese di registrazione è successivo, la riga di «Versamenti» dice «registrato il …»
  (`summarizeLedger.recordedInLaterMonth`).
- **Il valore dell'estratto conto** (`updatePensionFundValue`) sovrascrive `quantity` e non è un versamento.
- **Nessuna spesa**: TFR e datoriale non creano righe di cashflow; il volontario trattenuto in busta
  (conto «Nessuno») nemmeno; solo il volontario da un conto crea un `transfer` a saldo zero.
- **Lo snapshot passato** si riscrive solo con «Snapshot passato» in Storico
  (`CreateManualSnapshotModal` → `/api/portfolio/snapshot/manual`): tutto a mano, `byAsset` vuoto se non
  lo reinserisci, nessun campo `pension`. Il fondo sparisce da quel mese della serie
  (`buildPensionValueSeries` scarta i mesi senza il fondo in `byAsset`) e Storico torna alla stima.
  `/api/portfolio/snapshot` con `month` passato fotograferebbe i valori di OGGI nel mese passato.

**Conseguenza.** Il flusso del proprietario è già misurato bene se registra i versamenti nello stesso
momento in cui scrive il nuovo valore: lo snapshot del mese M porta sempre il fondo con il NAV di fine
M−1, un ritardo costante di un mese che non sporca il rendimento.

## 3. AFU

### Obiettivo
Chi ha un fondo che valorizza il mese dopo deve sapere, dal dialog e senza leggere la guida, quando
registrare un versamento e in che ordine rispetto al valore, e non deve mai scalare un conto per una
trattenuta in busta paga.

### Perimetro
- **Incluso**: testi di `PensionContributionDialog` (suggerimento sotto «Data», `NATURE_OPTIONS`),
  `PENSION_CONTRIBUTION_COPY`, `PENSION_CONTRIBUTION_RECORDED`, `describePensionValueCopy` in
  `lib/utils/dialogNarrative.ts`; un paragrafo in `doc/guide/previdenza.md` § Contributions; i test che
  fissano quei testi.
- **Escluso**: un campo «data di competenza» (D-PV1); un campo «data di valorizzazione» o lo stato
  «in attesa di accredito» (già scartato il 2026-08-26 nella guida, resta il rimedio se mai servisse);
  ogni modifica a `valueEffectMonth`, agli snapshot, al cron o allo «Snapshot passato».

### Casi d'uso
1. **Fondo che valorizza il mese dopo (il caso del proprietario).** A metà novembre il saldo mostra il
   versamento di ottobre. Registra TFR, datoriale e trattenuta di ottobre con data 27/10 (o 31/10), poi
   «Aggiorna valore» con il saldo. Rendimento di novembre corretto, ottobre intatto.
2. **Fondo che valorizza subito.** Registra il giorno dello stipendio e aggiorna il valore quando
   l'estratto lo include. Nessun cambiamento.
3. **Errore d'ordine.** Scrive prima il valore e poi i versamenti: il fondo risulta gonfiato della somma
   dei versamenti fino al prossimo valore. Il dialog del valore già lo previene; il testo va reso vero
   anche per il caso 1.
4. **Trattenuta in busta con un conto scelto.** Il conto scende di un importo mai uscito da lì. Il
   suggerimento della natura deve dirlo prima del salvataggio.
5. **Registrazione dimenticata per due mesi.** Effetto nel mese in cui registra: il mese del NAV che già
   lo conteneva legge un guadagno, quello di registrazione una perdita, il totale della finestra torna.
   Comportamento noto (guida, 2026-08-26), solo documentato.

### Regole di calcolo
Nessuna nuova. Restano: effetto sul valore = mese di `createdAt`; anno fiscale = `taxYear`;
mercato del mese = valore − valore dello snapshot precedente − versamenti con effetto nel mese.

### Decisioni
- **D-PV1 — Nessuna data di competenza, solo guida e suggerimenti.** *Presa dal proprietario il
  2026-11-06.* Alternative scartate: un campo informativo «Data di competenza» nel registro (nessun
  calcolo lo leggerebbe: il 27 e il 31 cadono nello stesso mese e quindi nello stesso anno fiscale);
  un flusso unico «Aggiorna dal rendiconto» che registra versamenti e valore insieme (il più robusto,
  ma il costo non vale finché l'ordine si insegna con due frasi).
- **D-PV2 — Lo snapshot chiuso non si corregge.** *Proposta, da confermare.* Il ritardo di un mese è
  costante; riscriverlo a mano rompe la serie del fondo (§ 2). Alternativa scartata: ricostruire lo
  snapshot passato con il versamento (nessuna pipeline lo sa fare senza i prezzi di quel giorno).
- **D-PV3 — Il dialog del valore parla di versamenti «registrati», non «versati», questo mese.**
  *Proposta, da confermare.* Il conteggio è per mese di registrazione (`valueEffectMonth`), e nel caso 1
  il versamento è datato il mese prima: «versati questo mese» è falso.
- **D-PV4 — Il suggerimento sotto «Data» dice cosa decide la data.** *Proposta, da confermare.*

### Testi proposti (D-PV3, D-PV4, caso 4)
| Dove | Oggi | Proposto |
|---|---|---|
| Suggerimento sotto «Data» (nuovo, `pc-date-hint`) | — | «Il giorno della trattenuta: decide l'anno fiscale. Il valore del fondo sale oggi, quindi registra quando l'estratto conto mostra il versamento.» |
| `NATURE_OPTIONS.voluntary.hint` | «… se invece è trattenuto in busta paga, lascia il campo vuoto.» | «… se invece è trattenuto in busta paga, scegli «Nessuno»: un conto scenderebbe di soldi mai usciti da lì.» |
| `PENSION_CONTRIBUTION_RECORDED.next` | «Quando arriva l'estratto conto, aggiorna il valore del fondo: lo include già.» | «Ora aggiorna il valore del fondo con l'estratto conto che include questo versamento.» |
| `describePensionValueCopy`, con versamenti | «I X € versati questo mese sono già dentro l'estratto: non aggiungerli.» | «I X € registrati questo mese devono essere già dentro l'estratto: se non lo sono, aspetta il prossimo.» |
| `describePensionValueCopy`, senza | «Se questo mese hai versato, registra prima i versamenti: l'estratto li include già.» | «Se l'estratto mostra versamenti nuovi, anche del mese scorso, registrali prima: il valore li include già.» |

### Punti aperti
- Nessuno bloccante. Se in futuro due fondi del nucleo valorizzassero con ritardi diversi, rivalutare
  il flusso «Aggiorna dal rendiconto» scartato in D-PV1.

### Criteri di accettazione (valori di riferimento)
Fondo con valore 10.000,00 € nello snapshot di ottobre (NAV di fine settembre). Versamenti di ottobre:
TFR 150,00 €, datoriale 50,00 €, trattenuta 60,00 € (totale 260,00 €), registrati il 15/11 con data
27/10. Estratto del 15/11: 10.400,00 €.
1. Ordine giusto (versamenti poi valore): valore del fondo 10.400,00 €; snapshot di ottobre invariato a
   10.000,00 €; mercato di novembre = 10.400 − 10.000 − 260 = **140,00 €**; versato 2026 +260,00 €
   (deducibili 110,00 €); nessuna riga nuova in cashflow; la riga del registro dice «registrato il 15 nov».
2. Il dialog del valore, aperto dopo i tre versamenti, dice «I 260,00 € registrati questo mese …».
3. Una trattenuta in busta con conto «Nessuno» non cambia il saldo di nessun conto.
4. I testi della tabella compaiono come scritti; `tsc` pulito; i test di `dialogNarrative` e del dialog
   aggiornati e verdi.
