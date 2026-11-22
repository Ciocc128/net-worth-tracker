# F03 · Backup del database dal Mac (`backup:export`)

> Dossier della card Todoist «F03 FEAT backup: script backup:export lanciato dal Mac (D1)», gruppo 3 del
> piano della review Fable (14/11). Fonte: Library `review-sicurezza/parte-4-secret-perdita-dati.md` § D1;
> requisito `--uid` dal rapporto `capacita/README.md` § 10 (card «Utenti · Portare a bordo il primo amico»
> e «Utenti · Piano di uscita»). Stato: implementato il 2026-11-22, in attesa della prima prova sui dati veri
> dal Mac (§ 10).

## 1. Obiettivo

Firestore è sul piano Spark: niente point-in-time recovery, niente backup programmati, e oggi nessuna copia
di riserva. Quasi ogni cancellazione nell'app è definitiva, e gli snapshot mensili sono l'unica storia del
patrimonio: non si ricostruiscono. Prima di portare a bordo il primo amico serve:

1. una **copia completa e datata** del database, presa dal Mac con la chiave Admin di `.env.local`, che si
   rilegge e si ripristina;
2. la stessa copia **di un solo account** (`--uid`), che fa da backup di quell'account e da pacchetto per
   spostarlo su un suo progetto (il futuro `account:import`).

## 2. Perimetro

**Incluso**
- `npm run backup:export`: database intero o un account, in un JSON datato fuori dal repository.
- Il **registro** delle collezioni (`scripts/lib/backup/registry.ts`), con un test che lo tiene completo.
- Il **serializzatore** che conserva i tipi di Firestore, con il test di andata e ritorno (D-T3).
- `npm run backup:restore`: un file intero negli emulatori, oppure un solo documento (anche in produzione).
- La **rotazione** delle copie e la **pianificazione** settimanale sul Mac (`npm run backup:schedule`).

**Escluso**
- Ripristino di più di un documento in produzione (D-BK5): un file intero va negli emulatori, si guarda, e si
  ripristinano i documenti che servono uno alla volta. L'import di un account in un altro progetto è la card
  «Utenti · Piano di uscita» (`account:import`), che rileggerà questo stesso formato.
- Le password: l'export elenca gli utenti di Authentication senza hash. Per spostare un utente con la sua
  password si usa `firebase auth:export` / `auth:import` (capacità § 10, passo 4).
- «Esporta i miei dati» in Impostazioni (card «Parcheggio Fable»).
- Cifratura del file: il file ha i permessi 600 in una cartella 700. Se Giorgio sceglie una cartella che
  si sincronizza (iCloud), la protezione è quella del suo account Apple.

## 3. Casi d'uso

| # | Chi | Comando | Esito |
|---|---|---|---|
| CU1 | Giorgio, ogni domenica (automatico) | `backup:export` | Un file `nwt-backup-<progetto>-all-<data>.json` in più, le copie vecchie oltre la rotazione cancellate |
| CU2 | Giorgio, prima di un'operazione rischiosa | `backup:export` | Come CU1, a mano |
| CU3 | Giorgio, prima di far entrare un amico o di spostarlo | `backup:export -- --email <email>` | `nwt-backup-<progetto>-user-<uid>-<data>.json`, mai cancellato dalla rotazione |
| CU4 | Giorgio, un documento cancellato o rovinato | `backup:restore:prod -- <file> --doc <percorso>` | Mostra i campi che tornano, spariscono e cambiano, chiede l'id del progetto, scrive il documento |
| CU5 | Giorgio, «com'era il mio patrimonio prima?» | `backup:restore -- <file>` | Il file negli emulatori, con gli account creati (password `test1234`): si apre l'app con `dev:emulator` |
| CU6 | Il piano di uscita, passo 3 | `backup:restore -- <file dell'amico>` | Prova a vuoto: ogni documento riletto uguale al file, i conteggi per collezione |

## 4. Che cosa appartiene a chi (il registro)

`scripts/lib/backup/registry.ts` elenca ogni collezione, con tre tipi di proprietà:

| Proprietà | Lettura di un account | Collezioni |
|---|---|---|
| `userField` | `where('userId', '==', uid)` | `assets`, `expenses`, `expenseCategories`, `monthly-snapshots` (+ `versions/`), `assetTransactions`, `pensionContributions`, `dividends`, `costCenters`, `accumulationPlans`, `assistantThreads` (+ `messages/`) |
| `docId` | `collection/{uid}` | `users`, `assetAllocationTargets`, `assetTransactionsMeta`, `budgets`, `budgetHistory` (+ `months/`), `goalBasedInvesting`, `modelPortfolios`, `userPreferences`, `assistantMemory`, `allowed-users`, `account-access`, `hall-of-fame`; cache: `performance-cache`, `exposure-cache`, `dashboardOverviewSummaries` |
| `global` | mai | cache di mercato: `benchmark-cache`, `fx-rate-cache`, `ecb-rate-cache`, `instrument-profile-cache` |

- Le **sottocollezioni** di un account si leggono sotto ogni suo documento padre. Il padre `docId` può essere
  un documento fantasma (`budgetHistory/{uid}` contiene solo `months/`): si legge comunque.
- `account-access` aggiunge, all'export di un account, i documenti di **altri** proprietari che lo nominano
  in `memberUids`: dicono di chi è membro.
- **Il database intero** non parte dal registro: elenca le collezioni con `listCollections()`. Una
  collezione che il registro non conosce si copia comunque, e il comando lo segnala. Le sottocollezioni
  dichiarate si leggono con un collection group, una per nome.
- **Le cache** (`cache: true`) restano fuori di default. Si ricalcolano da sole e costano letture.
  `--with-caches` le include.
- **Il test** (`__tests__/backupRegistry.test.ts`) fallisce se `firestore.rules`, una costante `*_COLLECTION`
  o un letterale `.collection('…')` / `collection(db, '…')` / `doc(db, '…')` nel codice nomina una
  collezione assente dal registro.

## 5. Il file

```jsonc
{
  "format": "nwt-backup", "version": 1,
  "createdAt": "2026-11-22T20:00:00.000Z", "projectId": "…", "source": "production",
  "scope": { "kind": "all" },            // oppure { "kind": "user", "uid": "…", "email": "…" }
  "withCaches": false,
  "counts": { "assets": 40, "monthly-snapshots/*/versions": 2, … },
  "unknownCollections": [],
  "auth": [ { "uid", "email", "displayName", "disabled", "emailVerified", "providers", "createdAt", "lastSignInAt" } ],
  "documents": [ { "path": "monthly-snapshots/u-2025-3/versions/abc", "data": { … } } ]
}
```

**Regole di codifica** (`scripts/lib/backup/serializer.ts`): i valori JSON restano come sono. Ogni tipo che
JSON non ha diventa un oggetto con un'etichetta:

| Firestore | Nel file |
|---|---|
| Timestamp (e `Date`) | `{ "__type": "timestamp", "seconds", "nanoseconds" }` |
| Riferimento | `{ "__type": "reference", "path" }`, ricostruito sul database in cui si scrive |
| GeoPoint | `{ "__type": "geopoint", "latitude", "longitude" }` |
| Byte | `{ "__type": "bytes", "base64" }` |
| `NaN`, `±Infinity`, `-0` | `{ "__type": "number", "value": "NaN" }` |
| Una mappa che ha già una chiave `__type` | `{ "__type": "map", "value": { … } }` |

Un oggetto di una classe sconosciuta (per esempio un `VectorValue`) fa fallire l'export: meglio un backup
che si rifiuta che uno che perde un campo senza dirlo. **Approssimazione nota:** un double salvato come
`2.0` torna come intero `2`. È lo stesso valore, e l'app lo legge allo stesso modo.

**Valori di riferimento** (calcolati a mano, `__tests__/backupSerializer.test.ts`):
`Timestamp(1700000000, 500000000)` → `seconds 1700000000, nanoseconds 500000000`.
`Date 2025-03-01T12:00:00.250Z` → 1740830400250 ms → `seconds 1740830400, nanoseconds 250000000`.
`Date 1969-12-31T23:59:59.500Z` → −500 ms → `seconds −1, nanoseconds 500000000`.
I byte `[1,2,3]` → `"AQID"`.

**Nome:** `nwt-backup-<progetto>-all-AAAA-MM-GGTHH-MM.json` oppure `…-user-<uid>-…`, con l'ora italiana e
senza `:` (Finder mostrerebbe `/`). I nomi si ordinano nel tempo.

## 6. Dove e quante copie

- **Cartella**: `BACKUP_DIR` in `.env.local`, altrimenti `~/Documents/net-worth-tracker-backup` (D-BK1).
  È creata con i permessi 700, il file 600. Il comando rifiuta una cartella dentro il repository.
- **Scrittura sicura**: prima `….json.partial`, poi il file viene riletto e ricontato. Solo se i conteggi
  tornano diventa `….json`. Un file `.partial` rimasto in cartella non è affidabile.
- **Rotazione** (D-BK2, `selectBackupsToPrune`): dei backup completi dello stesso progetto restano gli
  ultimi 8 più il primo di ogni mese, per sempre. Gli export di un solo account, i backup di altri progetti
  (per esempio quelli degli emulatori) e gli altri file non vengono toccati.
  *Esempio di riferimento:* 12 domeniche dal 4 gennaio al 22 marzo. Restano dall'1/2 al 22/3 (le ultime 8)
  più il 4/1. Si cancellano l'11, il 18 e il 25 gennaio.

## 7. Ripristino

- `npm run backup:restore -- <file>` scrive tutto il file **negli emulatori** (lo script rifiuta di girare
  senza `FIRESTORE_EMULATOR_HOST`, che lo script npm imposta). Crea gli account del file nell'emulatore con
  la password `test1234`. `allowed-users` arriva con il file, quindi gli account sono già ammessi. Poi
  rilegge ogni documento e lo confronta campo per campo con il file. Basta un documento diverso per
  terminare con un errore.
- `--doc <percorso>` ripristina un solo documento, negli emulatori o in produzione con
  `backup:restore:prod`. Prima stampa i campi che tornano, spariscono e cambiano. Se il documento è già
  uguale non scrive niente. In produzione chiede di digitare l'id del progetto (`confirmProductionWrite`)
  e rifiuta un file di un altro progetto. Il documento viene sostituito intero (`set`, senza merge).
- In produzione `backup:restore:prod` senza `--doc` si rifiuta (D-BK5).

## 8. Ricordarsi di lanciarlo

`npm run backup:schedule` (D-BK3) installa un agente launchd (`~/Library/LaunchAgents/com.networthtracker.backup.plist`)
che ogni **domenica alle 21:00** lancia `npm run backup:export` da questa cartella, in una shell di login
(così `npm` è nel PATH), e scrive in `backup.log` nella cartella dei backup. A fine lavoro una notifica di
macOS dice «Backup fatto» oppure «Backup NON riuscito». Altri comandi: `--status` (installato? ultime righe
del log), `--now` (lancialo subito), `--remove`.

- Se a quell'ora il Mac **dorme**, launchd lo lancia al risveglio. Se è **spento**, salta fino alla
  domenica dopo.
- Se si sposta il checkout, va rilanciato `backup:schedule`.
- **Il PATH**: launchd parte con un PATH minimo, e una shell di login non legge `.zshrc`, dove nvm mette
  `node`. La prima installazione sul Mac (22/11) è finita in `npm: command not found`. Da allora il plist
  porta un `PATH` con, per prima, la cartella del `node` che ha lanciato `backup:schedule`. Se si cambia
  versione di node con nvm, va rilanciato `backup:schedule`.
- **Accesso a Scrivania e Documenti**: macOS non lascia scrivere un agente launchd in `~/Documents`, e non
  chiede nemmeno il permesso. Nella prova del 22/11 il log diceva `operation not permitted`. Per questo il
  job gira da una copia di `main` in `~/nwt-backup-runner`, fuori dalla Scrivania, con la sua `.env.local`
  (permessi 600), e `BACKUP_DIR` punta fuori da Documenti. L'alternativa è dare l'accesso completo al disco
  a `/bin/zsh` e a `node`.

## 9. Costo in letture

Si paga una lettura per documento, più una per ogni query vuota. Il comando stampa la stima. L'export
dell'intero database di oggi, senza cache, costa qualche migliaio di letture su 50.000 al giorno. Quello di
un account, nell'ordine di centinaia o migliaia, più una lettura per ogni snapshot e per ogni conversazione
(le query delle sottocollezioni `versions` e `messages`).

## 10. Prove

**Fatte nel cloud** (2026-11-22, emulatori con il seed `emulators:seed` più un documento per ogni tipo
difficile: una versione di snapshot, un mese di `budgetHistory`, una conversazione con un messaggio che
contiene GeoPoint, riferimento, byte e una mappa con `__type`, la memoria dell'assistente, un
`account-access` di un altro proprietario che nomina l'utente, una collezione sconosciuta, una cache):
- export completo: 24 documenti; la collezione sconosciuta copiata e segnalata; la cache esclusa;
  cartella 700, file 600;
- export di un account per email: 23 documenti, compreso l'`account-access` dell'altro proprietario;
- database e Auth degli emulatori svuotati → `backup:restore` del file completo → 24 documenti riletti
  uguali al file, account ricreato → nuovo export: `documents` identico, byte per byte, a quello di partenza;
- `--doc` su un asset modificato: la differenza è stampata (`extra` sparisce, `quantity` cambia), il
  documento torna uguale; la seconda volta «niente da scrivere»;
- `--out` dentro il repository rifiutato; rotazione su 9 file finti: nessuno cancellato (corretto).
- Vitest: `backupSerializer`, `backupRegistry`, `backupFile`, `backupSchedule` (26 test).

**Da fare sul Mac, con l'ok di Giorgio nel thread** (leggono la produzione):
1. `npm run backup:export`: annotare il numero di documenti, la stima delle letture e il peso del file.
   Controllare che `unknownCollections` sia vuoto.
2. `npm run emulators` + `npm run backup:restore -- <file>`, poi `npm run dev:emulator`: entrare con la
   propria email e `test1234`, e verificare patrimonio di oggi, numero di snapshot e spese dell'ultimo anno.
   Alla fine svuotare gli emulatori (o cancellare `.emulator-data`), perché contengono i dati veri.
3. `npm run backup:schedule`, poi `npm run backup:schedule -- --now`: arriva la notifica? Il log dice
   `Operation not permitted`? (§ 8)
4. Lunedì: `npm run backup:schedule -- --status` mostra il giro di domenica.

## 11. Decisioni

| ID | Decisione | Alternative scartate | Motivo |
|---|---|---|---|
| D-BK0 | Backup con uno script lanciato dal Mac, senza cambiare piano Firebase (Giorgio, 14/11) | PITR e backup di Firestore (richiedono Blaze) | Restare su Spark |
| D-BK1 | Cartella `BACKUP_DIR`, di default `~/Documents/net-worth-tracker-backup` | Una cartella solo locale; un percorso fisso | Con iCloud su Documenti si ha una seconda copia fuori dal Mac senza fare niente. Confermata da Giorgio il 22/11. |
| D-BK2 | Gli ultimi 8 completi più il primo di ogni mese, per sempre. Gli export di un account mai cancellati | Gli ultimi 12; tutti | Pochi MB l'uno; la storia mensile resta. Confermata da Giorgio il 22/11. |
| D-BK3 | Agente launchd la domenica alle 21:00, con notifica dell'esito | Task ricorrente su Todoist | Non dipende dalla memoria. Confermata da Giorgio il 22/11. |
| D-BK4 | Utenti di Authentication nell'export, senza hash delle password | Nessun utente; gli hash | Bastano per ricreare gli account negli emulatori; le password si spostano con `firebase auth:export`. Confermata da Giorgio il 22/11. |
| D-BK5 | In produzione si ripristina un documento alla volta; il file intero va negli emulatori | Ripristino di una collezione in produzione | Una scrittura di massa in produzione da un file vecchio è il danno che il backup deve evitare. Confermata da Giorgio il 22/11. |
| D-BK6 | Il database intero si legge con `listCollections()`, non dal registro | Solo il registro | Una collezione nuova finisce nel backup anche se nessuno l'ha registrata |
| D-BK7 | Le cache fuori di default (`--with-caches` per includerle) | Sempre dentro | Si ricalcolano da sole; costano letture e spazio |
| D-BK8 | Il mirror (`mirror:seed`) resta com'è | Farlo leggere dal registro | Copia per un giro guidato, con gli id ricodificati: è un altro lavoro. Il registro è la fonte per backup e migrazione |

## 12. Punti aperti

- L'accesso al disco dell'agente launchd (§ 8), da verificare sul Mac.
- `account:import` e `account:remove --uid` (card «Utenti · Piano di uscita») useranno questo formato e il
  registro. L'import dovrà decidere cosa fare dei documenti `account-access` di altri proprietari che il file
  porta con sé.

## 13. Criteri di accettazione

- CA1: i test `backupSerializer`, `backupRegistry`, `backupFile` e `backupSchedule` sono verdi. Il test del
  registro diventa rosso se si toglie una collezione dal registro (provato togliendo `costCenters` e
  `assistantMemory`).
- CA2: sugli emulatori, export completo → database svuotato → restore → export: `documents` identico.
- CA3: sul Mac, l'export della produzione finisce con `unknownCollections` vuoto, e il restore negli
  emulatori mostra le stesse tre cifre dell'app di produzione (patrimonio di oggi, numero di snapshot,
  spese dell'ultimo anno).
- CA4: l'agente gira la domenica e lascia nel log una riga con `✓ … documenti`.

## 14. File

`scripts/backupExport.mts`, `scripts/backupRestore.mts`, `scripts/backupSchedule.mts`;
`scripts/lib/backup/{registry,serializer,backupFile,reader,adminApp,firestoreKinds,schedule}.ts`;
`__tests__/backup{Serializer,Registry,File,Schedule}.test.ts`.
