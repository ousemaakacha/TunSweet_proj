# Ottimizzazione immagini TUNISWEET

Verifica del 15 novembre 2026. Pesi espressi in byte; KB e MB decimali.

## Misure prima e dopo

| Asset | Dimensioni invariate | PNG originale | WebP usato dal sito | Riduzione |
| --- | --- | ---: | ---: | ---: |
| Hero | 1536 × 1024 px | 3.305.561 | 539.222 | 83,69% |
| Atlante prodotti | 1448 × 1086 px | 2.858.852 | 383.558 | 86,58% |
| Totale | | 6.164.413 | 922.780 | 85,03% |

Risparmio sui due file utilizzati: **5.241.633 byte**, circa 5,24 MB.
Gli originali restano in `public/images/`: lo spazio occupato dal repository aumenta,
mentre il sito carica le copie WebP più leggere.

## Utilizzo degli asset

Prima della modifica, `hero.png` era usato nella home (hero e sezione storia)
e in Chi siamo. `pastries-atlas.png` era lo sfondo delle foto prodotto:
home, catalogo, dettaglio, prodotti correlati, preferiti e carrello tramite `Photo`.
Seed, dati salvati e controlli del pannello indicavano il PNG.

Ora le tre foto editoriali usano `hero.webp`. Il seed usa `pastries-atlas.webp`;
il componente condiviso riconosce anche i vecchi percorsi PNG e serve il WebP,
senza migrare o riscrivere il database. Anche le anteprime del pannello usano
le copie ottimizzate per questi percorsi locali. Gli URL esterni e Cloudinary
rimangono invariati.

## Generazione e caricamento

Rigenerare con `npm run optimize:images`. Lo script usa `sharp` 0.35.5 già
installato nel backend: WebP, qualità 90, effort 6, senza ridimensionamenti.
Controlla che dimensioni e proporzioni siano conservate e che i file siano più piccoli.

Hero, foto principale del prodotto e prima foto del catalogo hanno
`loading="eager"` e `fetchPriority="high"`. Le altre foto prodotto, la storia,
le anteprime del pannello e l'eventuale logo nel footer usano `loading="lazy"`.
I testi alternativi IT/EN e la gestione degli errori delle immagini sono conservati.
Hero e foto editoriali hanno dimensioni esplicite; foto prodotto, miniature,
anteprime e logo mantengono lo spazio riservato dal CSS.

L'atlante conserva 4 colonne e 3 righe da 362 × 362 px. In `Photo` un'immagine
HTML, ritagliata dal contenitore quadrato, sostituisce lo sfondo: `scale(4, 3)`
e `transform-origin` ricavato da `imagePosition` riproducono i ritagli precedenti.
Questo permette il caricamento differito nativo. Un URL esterno con lo stesso
nome del file continua a essere trattato come foto singola.
L'atlante è condiviso: quando serve una sua cella, il browser scarica l'intero
WebP, riutilizzato per le altre celle.

## Verifiche

- Home `/`, catalogo `/catalogo` e prodotto `/dolci/1` controllati nel browser
  a 390 e 1440 px, con schermate prima/dopo e controllo di tutte le 11 celle usate.
- Nessun overflow orizzontale nelle sei viste. Posizioni e dimensioni dei blocchi
  misurati (hero, storia, foto, griglie e testo del dettaglio) coincidono:
  differenza massima 0 px. Il confronto visivo non mostra cambiamenti al design.
- Verificati nel DOM i percorsi WebP, gli alt e gli attributi di caricamento.
  Confermata anche la priorità della prima foto del catalogo alle due larghezze.
- `npm run check`: 50 test superati e build Vite riuscita. I test includono
  risoluzione/griglia, compatibilità dei percorsi PNG/WebP e round trip API
  del pannello con URL esterni, ritaglio e testi alternativi IT/EN.
- Gli hash SHA-256 dei PNG coincidono prima e dopo:
  `hero.png`: `a2ba0627eb694edee7b6d11c28ac318facd87799c692ce60da9927d90165984c`;
  `pastries-atlas.png`: `c903588b61ae08af9864dd20a1ca08f1dd621f246f7ba9f1958c684756014a56`.

Schermate e misure locali sono in `test-results/image-optimization/`, ignorata
da Git. `comparison.json` contiene il confronto dei blocchi nelle sei viste.

## Limiti delle misure

L'85,03% riguarda il peso dei due file, non il tempo di caricamento dell'intera
pagina. Non sono stati misurati LCP, CLS, Lighthouse o tempi su rete mobile:
non è quindi verificato un miglioramento percentuale della velocità.
La stabilità geometrica prima/dopo non costituisce una misurazione del CLS.
L'upload Cloudinary reale non è stato eseguito; i test dell'adapter usano il
provider simulato già previsto dal progetto.
