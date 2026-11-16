# SQLite: configurazione, migrazione e ripristino

## Ambiente verificato e scelta

Il workspace usa Node.js 24.11.1, npm 11.6.2 e un backend Express avviato come processo persistente. Il modulo integrato `node:sqlite` è disponibile senza dipendenze aggiuntive; nel runtime verificato include SQLite 3.50.4 ed emette un avviso di API sperimentale. I manifest richiedono Node.js >=24.11.1. I comandi di sviluppo usano Vite come proxy verso Express.

Il repository non contiene configurazioni di hosting, container o funzioni serverless. La documentazione esistente prevede un solo processo Express con disco persistente. SQLite è adatto a questo ambiente; il runtime e il volume di un eventuale hosting reale devono essere controllati prima della pubblicazione. Questa modifica non esegue distribuzioni né migrazioni sui dati attivi.

`DATABASE_DIR` individua la directory dati. Usare un percorso assoluto su disco locale persistente, scrivibile dall’utente del backend e non pubblicato dal web server. Il valore predefinito resta `backend/database`. Per esempio, in `backend/.env`:

```dotenv
DATABASE_DIR=C:/tunisweet/data-sqlite
```

Usare una sola istanza applicativa. Account, sessioni, recensioni, clienti salvati e registro immagini mantengono la persistenza JSON precedente. Cluster, autoscaling, istanze sovrapposte durante un rilascio e filesystem di rete non sono una configurazione supportata. Un filesystem effimero non conserva gli ordini ai riavvii.

## Dati e transazioni

Solo `product.json`, `order.json`, `availability.json` e `storesetting.json` vengono importati in `shop.sqlite`. Il database conserva un documento JSON completo per record, con posizione originale e ID numerico. Importi, varianti, riepiloghi acquistati, proprietari, stati, dati di pagamento e timestamp non vengono ricalcolati. Gli ordini mantengono anche eventuali proprietà storiche aggiuntive, incluse quelle annidate. Nessun ordine viene attribuito a un account tramite email.

Ogni checkout apre `BEGIN IMMEDIATE`, rilegge i quattro archivi, risolve il proprietario dalla sessione e controlla l’idempotenza. Per un ordine nuovo verifica calendario, capienza, pubblicazione, disponibilità e quantità; poi scrive stock e ordine e conferma con `COMMIT`. Una chiave già presente restituisce l’ordine soltanto al medesimo proprietario, oppure al checkout ospite per un ordine ospite. Un indice univoco SQL impedisce due ordini con la stessa chiave anche tra connessioni indipendenti. La risposta HTTP parte dopo il commit.

Le modifiche amministrative di prodotti, ordini, calendario e impostazioni prendono lo stesso lock e rileggono lo stato corrente. Le regole precedenti restano valide: non si riduce la capienza sotto le prenotazioni, non si riattiva un ordine annullato e l’annullamento non reintegra lo stock. I JSON degli altri archivi mantengono la coda di scrittura precedente.

SQLite usa journal `DELETE`, `synchronous=FULL` e attesa del lock fino a cinque secondi. Il rollback riguarda l’intera transazione anche quando l’inserimento dell’ordine fallisce dopo le scritture dello stock. Dopo un arresto improvviso SQLite recupera il journal alla riapertura. Non cancellare un file `shop.sqlite-journal` lasciato da un arresto: può servire al recupero.

## Prova su una copia isolata

Questi comandi PowerShell vanno eseguiti dalla root del progetto. Copiano gli archivi in una directory temporanea; l’importatore lavora esclusivamente sulla copia. Per una fotografia coerente di un negozio in uso, fermare prima il backend. Il percorso e i dati originali rimangono invariati.

```powershell
$sourceData = (Resolve-Path -LiteralPath '.\backend\database').Path
$rehearsalRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('tunisweet-sqlite-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $rehearsalRoot | Out-Null
$testData = Join-Path $rehearsalRoot 'data'
$jsonBackup = Join-Path $rehearsalRoot 'json-before'
Copy-Item -LiteralPath $sourceData -Destination $testData -Recurse
npm --prefix backend run storage:migrate -- --directory "$testData" --backup "$jsonBackup"
```

L’importatore richiede esplicitamente directory dati e directory di backup. `product.json` e `order.json` devono esistere. Disponibilità e impostazioni assenti vengono importate come array vuoti, conservando i valori predefiniti applicativi. La directory di backup deve essere nuova e il suo genitore deve esistere.

Il backup contiene i byte originali dei soli archivi migrati e `manifest.json`, con conteggi, hash SHA-256 e impronta della sorgente. Campi noti malformati, ID mancanti o duplicati e chiavi di idempotenza duplicate interrompono l’importazione: nessun record viene scartato o rinumerato. Il database viene costruito in un file temporaneo, in una transazione, controllato con `integrity_check` e pubblicato con rename soltanto dopo il successo.

Ripetere lo stesso comando verifica l’impronta e non modifica SQLite, anche se nel frattempo l’amministrazione ha aggiornato prodotti o ordini. Se i JSON sorgente cambiano, l’importatore rifiuta di sovrascrivere il database esistente. Non esiste un’opzione di forzatura. Un errore lascia i sorgenti invariati e conserva l’eventuale backup già prodotto; scegliere una nuova directory di backup per una nuova prova.

Un file `shop.sqlite.migration.lock` impedisce importazioni simultanee. Se l’importatore viene terminato forzatamente, fermare tutti i processi interessati e verificare che nessuna importazione sia ancora in corso. Solo allora rimuovere il lock e gli eventuali file `shop.sqlite.import-*` nella directory della prova. Non rimuovere `shop.sqlite` né il suo journal per ripetere un’importazione.

Per avviare il backend sulla copia, nello stesso terminale:

```powershell
$env:DATABASE_DIR = $testData
$env:PORT = '3101'
npm --prefix backend start
```

Controllare catalogo, disponibilità, accesso cliente, storico e pannello amministrativo sulla copia. Gli ID delle varianti mancanti vengono assegnati una sola volta all’avvio, come prima, e salvati nella stessa transazione SQLite. Arrestare con Ctrl+C al termine. Per un ambiente iniziale senza archivi, `npm run seed` prepara i JSON nella directory predefinita; copiarli e importarli prima di avviare il backend.

## Passaggio a SQLite nel negozio

La procedura seguente è documentata per l’operatore e non viene eseguita automaticamente:

1. Verificare Node.js, disco locale persistente, spazio disponibile, permessi, configurazione `DATABASE_DIR` e disponibilità di un backup ripristinabile.
2. Fermare il backend precedente e impedire nuove scritture, anche dal pannello amministrativo. Copiare l’intera directory dati in un backup protetto: contiene anche account e sessioni non migrati.
3. Creare una nuova copia completa della directory dati per il nuovo backend. Importare in questa copia con `storage:migrate`, indicando una nuova directory per il backup dei quattro JSON.
4. Confrontare conteggi e documenti, verificare uno storico con varianti, proprietà degli account e pagamenti, quindi configurare `DATABASE_DIR` verso la copia importata. Conservare invariati i sorgenti e la versione precedente del codice.
5. Avviare una sola istanza del nuovo backend. Verificare accesso, calendario, stock e ordini prima di riaprire il negozio.

Il server rifiuta l’avvio se SQLite manca o non supera i controlli di versione, journal e integrità. Non importa i JSON all’avvio e non li usa come ripiego. Dopo il passaggio, i quattro JSON originali diventano copie storiche: modificarli o eseguire il seed non aggiorna SQLite. Usare le API amministrative.

## Backup ordinario e ripristino

Per un backup completo e coerente fermare il backend, attendere la chiusura del processo e copiare l’intera `DATABASE_DIR` in una directory nuova, fuori dalla directory dati. Non copiare soltanto SQLite dimenticando gli archivi di autenticazione. Non copiare il solo file `.sqlite` mentre il backend sta scrivendo. Verificare il backup avviandone una copia isolata e controllando `PRAGMA integrity_check`, ordini e accessi. Proteggere backup e manifest come dati personali; non inserirli in Git.

Per ripristinare un backup SQLite:

1. Fermare il backend e mantenere il negozio chiuso alle scritture.
2. Conservare l’intera directory corrente in una directory separata per eventuale riconciliazione. Non cancellare journal di un database che necessita di recupero.
3. Copiare il backup completo in una nuova directory. Verificarne SQLite e archivi non migrati con una prova isolata.
4. Con la stessa versione compatibile del codice, impostare `DATABASE_DIR` verso la directory ripristinata e avviare una sola istanza.
5. Controllare conteggi, stock, proprietà, pagamenti e ultimo ordine atteso prima di riaprire.

Il ripristino riporta tutti i dati all’istante del backup: gli ordini successivi richiedono riconciliazione prima della riapertura. Per tornare al backend JSON precedente usare la precedente versione del codice e il backup completo precedente all’importazione. Questa scelta è immediata soltanto se il nuovo backend non ha ancora accettato scritture; altrimenti non usare i JSON rimasti fermi alla migrazione per sostituire ordini più recenti.

## Verifiche e limiti

Eseguire `npm run check` dalla root. Oltre ai test precedenti, la suite verifica backup e importazione ripetibile, conservazione dei dati storici, unicità SQL, processi HTTP concorrenti, stock base e varianti, capienza, aggiornamenti amministrativi, riavvio, recupero da arresto forzato e ripristino di un backup a backend fermo. Il fallimento dell’inserimento viene simulato con un trigger SQL; l’arresto forzato avviene nel checkout HTTP dopo le scritture SQL dello stock e prima dell’inserimento ordine. Questi strumenti di guasto esistono solo nei test.

Tutti gli archivi delle prove sono copie o fixture temporanee. Il test di arresto controlla che il documento prodotto completo e gli ordini coincidano con il contenuto precedente al tentativo, poi ripete la richiesta e verifica una sola riduzione dello stock e un solo ordine.

Le operazioni SQLite sono sincrone e rileggono i quattro archivi; il salvataggio riscrive i record dell’archivio modificato. Questa soluzione è pensata per il piccolo negozio esistente. Un lock prolungato produce errore HTTP 500 dopo il timeout: riprovare conservando la stessa chiave. Per carichi maggiori occorreranno query mirate; per più istanze occorrerà adeguare anche gli archivi JSON ancora in uso. Le garanzie di durabilità richiedono filesystem e hardware che rispettino le sincronizzazioni su disco e backup verificati.

Riferimenti tecnici: [API SQLite di Node.js](https://nodejs.org/api/sqlite.html), [transazioni SQLite](https://www.sqlite.org/lang_transaction.html), [commit atomico e recupero](https://www.sqlite.org/atomiccommit.html).
