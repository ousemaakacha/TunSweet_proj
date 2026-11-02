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

La creazione ordine verifica nuovamente prezzi, pubblicazione, stock e capienza. La chiave di idempotenza evita duplicati. L’amministrazione non può ridurre una fascia sotto i ritiri già prenotati o rimuovere una fascia occupata. Le note del calendario e dei clienti sono private.

Stati ordine: In attesa, Confermato, In preparazione, Pronto per il ritiro, Completato, Annullato. Un ordine annullato non può essere riattivato. Il pagamento al ritiro viene registrato separatamente, con data e amministratore; annullare un ordine non restituisce denaro né reintegra lo stock. La dashboard conta gli incassi registrati degli ordini non annullati. Il CSV neutralizza le formule e usa il separatore `;`.

L’indirizzo di casa non deve comparire nelle impostazioni o nei testi pubblici. Il negozio comunica privatamente l’indirizzo di ritiro dopo la conferma.

## API e conservazione

Le API pubbliche espongono prodotti pubblicati, recensioni approvate, disponibilità e impostazioni pubbliche. Consentono l’invio di ordini e le operazioni di account. Gli elenchi degli ordini, i clienti, le note e tutte le modifiche del catalogo richiedono la sessione amministrativa. Il generatore di validatori proviene dal backend Boolean; modificare `types.ts`, non `schema.js`.

Le mutazioni sono serializzate nello stesso processo e i file sono salvati con scrittura temporanea e rename. Non esiste una transazione atomica tra più archivi: un arresto tra la scrittura dello stock e quella dell’ordine richiede riconciliazione. Eseguire backup, usare storage persistente e un solo processo. `DATABASE_DIR` cambia la directory degli archivi e permette ai test di usare dati isolati.

Prima di gestire più processi o volumi maggiori, migrare a un database transazionale. Prima della pubblicazione completare identità del titolare, dati fiscali, recapiti, tempi di conservazione e condizioni applicabili, facendo verificare le informative da un professionista.
