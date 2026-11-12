# Configurazione operativa

## Ambiente e amministrazione

Il backend legge `backend/.env` tramite dotenv. Il frontend usa solo variabili con prefisso `VITE_`: non inserirvi password o segreti. I file di ambiente e gli archivi degli account sono esclusi da Git.

`HOST` vale `127.0.0.1` e `PORT` vale `3001` se non configurati. `FRONTEND_ORIGINS` contiene le origini ammesse, separate da virgole. In produzione usare un proxy HTTPS sulla stessa origine del frontend, inoltrando `/api` a Express. `API_PROXY_TARGET` cambia il backend raggiunto dal proxy Vite durante lo sviluppo; il valore predefinito è `http://127.0.0.1:3001`.

Creare l’amministratore con `npm --prefix backend run admin:create`. Per sostituire l’account esistente, con backend fermo:

```powershell
npm --prefix backend run admin:create -- --replace
```

La sostituzione revoca tutte le sessioni amministrative. Riavviare il backend al termine. Le password richiedono 12–128 caratteri e sono salvate con hash scrypt e sale casuale. L’account amministrativo è separato dagli account cliente.

Le sessioni durano otto ore, persistono al riavvio e vengono revocate al logout. I cookie sono HttpOnly/SameSite e diventano Secure con `NODE_ENV=production` o `AUTH_COOKIE_SECURE=true`. L’accesso amministrativo ammette dieci tentativi ogni 15 minuti. Nessun token di sessione è restituito a JavaScript.

## Email di verifica

Configurare `backend/.env` con i dati del proprio servizio SMTP:

```dotenv
PUBLIC_SITE_URL=https://il-tuo-dominio.it
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
AUTH_COOKIE_SECURE=true
```

Per TLS sulla porta 465 usare `SMTP_SECURE=true`; sulla 587 il server richiede STARTTLS. Il fornitore può richiedere la verifica del mittente o del dominio. Riavviare il backend dopo le modifiche. Durante lo sviluppo locale HTTP lasciare `AUTH_COOKIE_SECURE=false`.

I link sono monouso e scadono dopo un’ora. Un account non verificato non può accedere. Se l’invio fallisce, l’account resta in attesa e si può richiedere un nuovo link dopo la configurazione. I link segreti non vengono scritti nei log. Le email automatiche riguardano la verifica account; le comunicazioni sugli ordini sono manuali.

## Immagini

Per caricare file dal pannello impostare `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` e `CLOUDINARY_API_SECRET` soltanto in `backend/.env`, poi riavviare il backend. Non serve un upload preset unsigned.

Il server accetta JPEG, PNG e WebP fino a 5 MB e 40 milioni di pixel, verifica il contenuto e ricodifica in WebP con Sharp. Sono consentite fino a 12 immagini per prodotto, con principale, ordine e testi alternativi IT/EN. Un’immagine ancora associata a un prodotto o al logo non può essere eliminata da Cloudinary; salvare prima la rimozione. Gli URL esterni non vengono cancellati dal provider.

Senza Cloudinary resta disponibile l’inserimento di URL HTTPS. Gli asset iniziali e i relativi prompt sono documentati in [assets/image-prompts.md](assets/image-prompts.md).

## Calendario e ordini

Il calendario iniziale è martedì–sabato, 16–20, con fasce di un’ora e quattro ordini per fascia. Sono richiesti due giorni di anticipo; l’orizzonte è di 21 giorni. Le impostazioni del pannello definiscono giorni e orari; ogni data può avere chiusure o fasce proprie.

La creazione ordine verifica nuovamente prezzi, pubblicazione, stock e capienza. La chiave di idempotenza evita duplicati e il retry richiede lo stesso proprietario, oppure un ordine senza proprietario per il checkout ospite. L’amministrazione non può ridurre una fascia sotto i ritiri già prenotati o rimuovere una fascia occupata. Le note del calendario e dei clienti sono private.

Gli ordini effettuati con una sessione cliente verificata vengono associati all’ID account risolto dal server tramite il cookie HttpOnly. Email e identificativi nel corpo della richiesta restano dati non attendibili per stabilire il proprietario. Senza cookie il checkout resta ospite; un cookie invalido, scaduto o revocato produce `401 authSessionExpired` e viene cancellato, così il cliente può accedere di nuovo o riprovare come ospite. Gli ordini esistenti e ospite restano senza associazione: non viene eseguita alcuna attribuzione tramite email.

Stati ordine: In attesa, Confermato, In preparazione, Pronto per il ritiro, Completato, Annullato. Un ordine annullato non può essere riattivato. Il pagamento al ritiro viene registrato separatamente, con data e amministratore; annullare un ordine non restituisce denaro né reintegra lo stock. La dashboard conta gli incassi registrati degli ordini non annullati. Il CSV neutralizza le formule e usa il separatore `;`.

L’indirizzo di casa non deve comparire nelle impostazioni o nei testi pubblici. Il negozio comunica privatamente l’indirizzo di ritiro dopo la conferma.

## Varianti acquistabili e carrelli salvati

Le varianti hanno un `id` UUID persistente. All’avvio il server assegna e salva gli ID mancanti nei cataloghi precedenti, prima di accettare richieste. Il pannello conserva gli ID durante modifiche e riordini; una variante nuova riceve un nuovo ID. Non usare posizione, nome o formato come identificativo. Inviare una variante esistente senza il suo ID la rende una nuova variante e invalida le precedenti selezioni nel carrello. Gli ID duplicati nello stesso prodotto vengono rifiutati.

Un prodotto con almeno una variante richiede una scelta esplicita nella scheda prodotto. Le schede del catalogo mostrano il prezzo minimo delle varianti acquistabili e il collegamento «Scegli variante». Per questi prodotti prezzo e stock principali non vengono usati nell’acquisto: valgono quelli della variante. Pubblicazione e disponibilità del prodotto restano interruttori generali. Il server controlla anche disponibilità e stock della variante; alla vendita scala soltanto quello stock, disabilitando la variante esaurita. Prodotti senza varianti, anche con `variants: []`, continuano a usare prezzo e stock principali.

Ogni riga del carrello contiene soltanto `id` prodotto, `variantId` opzionale e quantità intera positiva. Aggiunta, variazione quantità, rimozione e totale distinguono la coppia prodotto/variante. Le righe duplicate della stessa coppia vengono sommate prima del controllo stock, anche sul server. La richiesta a `POST /orders` usa `{ productId, variantId?, quantity }`: prezzo, totale, nomi e formati inviati dal browser non determinano l’ordine. Il server usa centesimi interi per il calcolo e rifiuta quantità o somme non rappresentabili come interi sicuri. Il checkout aggiorna il catalogo e segnala variazioni di prezzo prima del primo invio.

I carrelli `ts-cart` precedenti rimangono utilizzabili per prodotti senza varianti. Se ora occorre una variante, la riga priva di scelta resta visibile ma blocca il checkout: va rimossa e aggiunta nuovamente dalla scheda prodotto. Nessuna variante viene selezionata automaticamente. Varianti eliminate, disabilitate o esaurite bloccano ugualmente l’acquisto; rimuovere tutte le varianti da un prodotto non converte una vecchia selezione nel prodotto base. Record locali malformati vengono scartati; una somma quantità oltre il limite degli interi sicuri azzera il carrello corrotto. Prezzi e descrizioni salvati localmente non vengono riutilizzati.

Le nuove righe d’ordine conservano titolo IT/EN, ID e nome della variante IT/EN quando presente, formato IT/EN, quantità e prezzo unitario acquistati. Nome e formato inglesi sono opzionali nel pannello e usano l’italiano come ripiego. Conferma, storico cliente e dettaglio/stampa amministrativi leggono questo riepilogo salvato, senza dipendere dal catalogo corrente. Modifiche o eliminazioni successive non cambiano l’ordine. I campi aggiunti sono opzionali per leggere gli ordini storici senza migrazioni o ricostruzioni del contenuto.

Un retry con la stessa chiave e lo stesso proprietario restituisce l’ordine esistente prima di ricontrollare catalogo, stock e calendario; non scala nuovamente lo stock. Il checkout mantiene la chiave per gli invii invariati nella stessa pagina e, dopo un errore di rete o server, permette il retry anche se l’acquisto può aver esaurito la variante. La chiave del tentativo non persiste dopo ricaricamento o abbandono della pagina: in caso di esito incerto controllare lo storico o contattare il negozio prima di ricreare l’ordine. Una scrittura ordine fallita ripristina stock e disponibilità precedenti; resta il limite di atomicità tra archivi descritto sotto.

## API e conservazione

Le API pubbliche espongono prodotti pubblicati, recensioni approvate, disponibilità e impostazioni pubbliche. Consentono l’invio di ordini e le operazioni di account. `GET /account/orders` richiede una sessione cliente verificata e restituisce soltanto gli ordini con lo stesso `accountId`, dal più recente, senza recapiti, note, chiavi di idempotenza o dati dell’amministratore. L’area «I miei ordini» è nella pagina `/account`. L’elenco completo degli ordini, i clienti, le note e tutte le modifiche del catalogo richiedono la sessione amministrativa. Il campo `accountId` nell’archivio ordini è opzionale per mantenere la compatibilità con gli archivi precedenti. Il generatore di validatori proviene dal backend Boolean; modificare `types.ts`, non `schema.js`.

Le mutazioni sono serializzate nello stesso processo e i file sono salvati con scrittura temporanea e rename. Non esiste una transazione atomica tra più archivi: un arresto tra la scrittura dello stock e quella dell’ordine richiede riconciliazione. Eseguire backup, usare storage persistente e un solo processo. `DATABASE_DIR` cambia la directory degli archivi e permette ai test di usare dati isolati.

Prima di gestire più processi o volumi maggiori, migrare a un database transazionale. Prima della pubblicazione completare identità del titolare, dati fiscali, recapiti, tempi di conservazione e condizioni applicabili, facendo verificare le informative da un professionista.

## Verifiche locali

Dalla root eseguire `npm run check`: rigenera i validatori, esegue i test e compila il frontend. I test degli ordini cliente usano archivi temporanei e il server HTTP reale; verificano due account, accesso anonimo, identità falsificate, sessioni invalide, retry, ordini ospite e storici, aggiornamenti amministrativi e persistenza al riavvio.

Le verifiche delle varianti coprono normalizzazione dei carrelli salvati, righe distinte, testi IT/EN, migrazione e persistenza degli ID, validazione amministrativa, quantità malformate e aggregate, prezzi manipolati, stock insufficiente, varianti mancanti/disabilitate/esaurite, ordini misti, snapshot dopo modifica/eliminazione e riavvio, invii concorrenti con chiavi uguali o diverse e ripristino dello stock dopo un errore di scrittura. Tutti gli archivi delle prove HTTP sono temporanei.
