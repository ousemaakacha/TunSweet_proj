# Backend TUNISWEET

Express con account cliente verificati via email, amministrazione protetta, catalogo e ordini con pagamento al ritiro.

Richiede Node.js >=24.11.1. Prima dell’avvio preparare SQLite seguendo la [procedura di migrazione, backup e ripristino](../docs/sqlite-storage.md). L’avvio non importa automaticamente i JSON.

Dalla root avviare con `npm --prefix backend run dev`.
Per inizializzare l’amministratore usare `npm --prefix backend run admin:create`. Non esistono credenziali predefinite.
Leggere la [documentazione operativa](../docs/operations.md) per configurazione SMTP e Cloudinary, dati, API, sicurezza, varianti, carrelli salvati, calendario e verifiche.
