# Sellfile Creator for RSL Helper

Sellfile Creator semplifica la creazione di Sellfile per RSL Helper — definisci filtri per l'equipaggiamento per set, slot, stat principale, sotto-stat e altro, visualizza in anteprima i risultati in tempo reale ed esporta Sellfile pronti all'uso in pochi secondi.

> Strumento indipendente creato dai fan. Non è affiliato con Plarium, Raid: Shadow Legends o RSL Helper. I marchi appartengono ai rispettivi proprietari.

## Funzionalità

- **Generatore di ricette** — crea ricette di conserva/vendi con nome e filtri per slot,
  set, rango, rarità, stat principale, sotto-stat (con minimi di roll e obiettivi),
  fazione e traguardi di livello. Costruisci una libreria riutilizzabile ed esportala come
  Sellfile RSL Helper (`.hsf`) in un clic.
- **Anteprima Sellfile** — visualizza in anteprima il Sellfile RSL Helper
  generato nella scheda Anteprima prima di esportare.
- **Metaset** — raggruppa i set di equipaggiamento (es. Velocità + Percezione) in
  collezioni con nome e riutilizzali nelle ricette e nelle salvaguardie.
- **Ispettore Equipaggiamento** — connetti RSL Helper per la sincronizzazione in tempo reale o carica un file `.db` per vedere quali oggetti corrispondono a ogni ricetta e quanti verrebbero conservati o venduti.
- **Confronto equipaggiamento** — attiva una vista prima/dopo per vedere esattamente quali pezzi passano tra *tieni* e *vendi* mentre regoli le ricette o provi le sostituzioni dinamiche. Un chip mostra i totali correnti; un elenco affiancato mostra ogni pezzo cambiato.
- **Simulatore dungeon** — consulta le percentuali di probabilità di conservare per il
  Cavaliere del Fuoco, il Drago e il Golem di Ghiaccio su livelli di difficoltà e
  potenziamento per confermare l'effetto del tuo Sellfile durante il farming o il
  potenziamento dell'equipaggiamento.
- **Salvaguardie** — definisci combinazioni di slot/set/stat che non vuoi mai perdere; lo
  scanner inietta automaticamente regole di conserva nel Sellfile quando la tua
  configurazione ridurrebbe una combinazione protetta al di sotto della sua quota.
- **Analisi Equipaggiamento** — dashboard analitica con schede KPI, grafici a filtro
  incrociato (slot, rango, rarità, fonte, livello), una mappa ad albero dei set, barre
  delle stat principali e un radar delle sotto-stat. Clicca su qualsiasi grafico per
  filtrare tutti gli altri; invia il filtro attivo direttamente all'Ispettore Equipaggiamento.
- **Vendita finale** — un solo toggle aggiunge regole di vendita catch-all per
  l'equipaggiamento non abbinato su fasce di livello configurabili, in modo che nulla sfugga.
- **Temi** — passa dalla modalità scura a quella chiara, personalizza colori e raggio dei
  bordi con l'editor temi integrato, o attiva una palette adatta ai daltonici.

## Come si usa

### File di ricette
- SFC (`.sfc`): il file di progetto per questa app. È come un salvataggio che puoi caricare o condividere. RSL Helper non usa direttamente gli SFC.
- HSF (`.hsf`): il Sellfile per RSL Helper. Esportalo da questa app e poi caricalo in RSL Helper.
- Il nome file salvato usa il formato predefinito `SellfileCreatorRecipes_AAAAmmGG_HHMM.sfc`.

### Generatore di ricette
- Compila il Generatore di ricette e assegna un "Nome ricetta" chiaro.
- Clicca "Aggiungi come nuova ricetta" per salvarla; quindi seleziona la ricetta salvata nell'elenco sotto il builder per modificarla e premi "Aggiorna ricetta selezionata".
- Carica/Salva: usa "Carica ricette" e "Salva ricette" per riutilizzare le tue regole personalizzate. Queste azioni salvano tutto ciò che serve per ricostruire l'anteprima dentro un file di ricette.
  - Fai clic sul chevron (▾) accanto a **Carica file SFC** per il relativo menu: **Carica da file…** apre il selettore file come di consueto; **Carica preset: Principiante** o **Carica preset: Midgame all'Endgame** carica uno dei preset integrati dopo una conferma (il setup attuale verrà sostituito).
- Menu Reset/Inserisci/Applica: clic destro su Reset, "Inserisci come ricetta" o "Applica come ricetta" per aprire il menu condiviso. Salva lo stato corrente del builder come modello predefinito, torna ai valori di fabbrica, abilita "Reset automatico dopo Inserisci" (svuota il builder subito dopo aver inserito una ricetta) oppure abilita "Applica automaticamente alla ricetta selezionata" (invia le modifiche nella ricetta evidenziata dopo ~400 ms di inattività). I due interruttori sono mutuamente esclusivi: attivarne uno disattiva l'altro e le preferenze restano salvate tra le sessioni.
- Nota: clicca "Aggiungi nota…" (o "Modifica nota…") per allegare una nota al tuo file di ricette. La nota viene mostrata automaticamente dopo aver caricato un file di ricette che la contiene. Usa `<!-- recipes:1,0 -->` per inserire i chip delle ricette desiderate (0 prende quella successiva). Usa `<!-- recipes-re:"speed" -->` per mostrare tutte le ricette con un nome che corrisponde al pattern (ignorando maiuscole/minuscole). Aggiungi `<!-- dungeon-simulator -->` per visualizzare una tabella in tempo reale delle probabilità di mantenimento per il Cavaliere del Fuoco, il Drago e il Golem di Ghiaccio su tre livelli di difficoltà (N20/N25/H10) e due modalità di potenziamento, con i tassi di mantenimento a +0/+4/+8/+12/+16. Aggiungi `<!-- recipe-overrides [columns=N] -->` per incorporare schede di domande interattive (gruppi radio/checkbox) che sostituiscono le modalità di esportazione e le impostazioni delle ricette durante la sessione — le ricette memorizzate non vengono mai modificate. Aggiungi `<!-- safeguard-overrides [columns=N] -->` per incorporare schede con cursori e opzioni che sostituiscono le proprietà delle salvaguardie (conteggio, attivazione, sottostati, probabilità di miglioramento e altro) durante la sessione — le salvaguardie memorizzate non vengono mai modificate. Non serve digitare questi blocchi a mano: durante la modifica della nota, il pulsante a matita su una scheda di domanda (o il pulsante corrispondente nella barra dell'editor per una nuova domanda) apre un editor visuale con cui costruire domande, opzioni ed effetti con controlli normali. Quando è presente uno di questi marker, il piè di nota mostra un pulsante **Disattiva / Attiva le sostituzioni dinamiche** e un pulsante **Reimposta opzioni**. Usa **Salva selezione corrente…** (nel menu «Sostituzioni dinamiche») per salvare le risposte attuali con un nome — i set di sostituzioni salvati compaiono nello stesso menu e possono essere ricaricati in un clic. Vengono salvate solo le selezioni presenti nella nota corrente; al caricamento di un set le domande non più presenti vengono ignorate.
- Ripristino Autosave: all'avvio il dialogo mostra ogni sezione salvata con la propria casella. Ripristina solo ciò che ti serve — ricette (incluso il chip selezionato), Metaset, Valori obiettivo delle sotto-stat, resto di Vendita finale, nota fissata, pannello filtri (stato aperto, chip, sezioni collassate) e importazioni dell'Ispettore Equipaggiamento. Lascia deselezionata una casella per tenere intatto il lavoro corrente. Autosave ricorda anche quali interruttori di Vendita finale (Artefatti, Accessori e intervalli di livello) erano attivi, quindi riaprire Strumenti replica esattamente ciò che avevi esportato l'ultima volta.

### Struttura del builder (dall'alto verso il basso)
- Azione e attivazione: indica al Sellfile cosa fare quando un oggetto corrisponde alla ricetta.
  - `Mantieni` contrassegna l'equipaggiamento corrispondente come Mantieni così RSL Helper lo ignora.
  - `Vendi` contrassegna l'equipaggiamento corrispondente come Vendi così RSL Helper lo aggiunge alla coda di vendita automatica.
  - L'interruttore "Attiva" decide se le righe di questa ricetta sono attive all'esportazione. Le ricette disattivate restano barrate nell'anteprima e non hanno effetto in RSL Helper; attiva "Escludi le regole disattivate durante l'esportazione" nel menu di esportazione se vuoi lasciarle fuori.
- Rango: limita la regola a specifici ranghi di stelle. Usa `Qualsiasi` quando ogni rango deve restare valido.
- Livelli: scegli il primo e l'ultimo traguardo di potenziamento coperti dalla regola. I traguardi seguono i livelli del gioco: +0, +4, +8, +12, +16. Le righe vengono generate solo dentro questo intervallo.
- Rarità: `Auto` (consigliato) sceglie la rarità più bassa che rende possibili le tue scelte ai livelli indicati.
- Nessun minimo per statistica o limiti superiori globali di roll? Auto mantiene la regola ampia così ogni rarità resta valida.
  - Hai bisogno che l'oggetto nasca con 1/2/3/4 sotto-stat? Auto garantisce una rarità in grado di generare quel numero (1→≥Non comune, 2→≥Rara, 3→≥Epica, 4→≥Leggendaria).
  - Richiedi conteggi di roll specifici? Auto sceglie la rarità più bassa che raggiunge quel numero di roll entro il +16, includendo Mitica per cinque roll.
  - Chip `Auto ≥` (sotto Soglie traguardo): alza la soglia, così Auto non scende sotto quel livello e, con soglie Tardive, aggiunge rami `≥` bonus a +4/+8/+12.
    - Tocca per ciclarla: Non comune → Rara → Epica. Per esempio, "Auto ≥ Rara" esclude la Non comune dalla regola.
    - Il chip è attivo solo quando Rarità è Auto e le Soglie traguardo sono Tardive. In caso contrario mostra una barra obliqua.
    - Esempio: Vessillo con SPD e ATK% dove ATK% necessita 2 roll. Imposta Rarità = Auto, Soglie traguardo = Tardive, Auto ≥ Epica. Il builder mantiene le righe Epiche per ogni traguardo e aggiunge rami ≥ Leggendari a +8 e +12 così gli oggetti più rari restano validi senza allentare i requisiti epici.
  - Prima del +16 il builder usa il numero di sotto-stat che la rarità può avere realmente a quel traguardo. Al +16 applica sempre il tuo conteggio richiesto.
- Fazione: restringi le regole accessori a una fazione specifica quando stai puntando una squadra. Anelli, Amuleti e Vessilli rispettano questo filtro; i pezzi artefatto lo ignorano, quindi `Qualsiasi` mantiene gli artefatti sicuri.
- Slot: concentrare la regola su pezzi precisi (Armi, Stivali, ecc.) per evitare corrispondenze fuori slot. Lascialo vuoto per coprire ogni slot.
- Set e Metaset: filtra la regola a set specifici o a Metaset nominati così solo quelle collezioni passano. Lascialo vuoto per accettare tutti i set.
- Riga Stat principale: richiedi determinate stat principali.
  - Seleziona più voci per accettare una qualsiasi tra esse. Lasciala vuota per permettere ogni stat principale.
  - Scegliere più stat principali genera una regola per ciascuna così restano esplicite nell'esportazione.
- Riga Sotto-stat: indica quali sotto-stat contano.
  - Clicca per attivare o disattivare una sotto-stat. Le sotto-stat bloccate compaiono sempre nelle righe generate.
  - Usa il badge con lucchetto (🔒) accanto all’etichetta per renderla obbligatoria; il clic destro apre le azioni rapide per bloccare/sbloccare e gestire i roll.
  - `Qualsiasi` è un collegamento per tornare alle "nessuna restrizione". Se selezioni sotto-stat specifiche, `Qualsiasi` si disattiva automaticamente.
  - Il totale di sotto-stat per riga è `max(conteggio richiesto, conteggio bloccato)` con un massimo di quattro, quindi bloccare una statistica le riserva sempre uno slot.
- Interruttore Flex: se hai più scelte facoltative del conteggio richiesto, Flex ruota quelle extra nelle righe così ogni combinazione valida viene coperta senza esplodere il numero di righe.
- Obiettivi di roll (Base/+1…+5): Fai clic destro su una sotto-stat selezionata per aprire la griglia degli obiettivi di roll. Base indica il valore a +0 e ogni campo +N rappresenta il valore dopo quel numero di roll aggiuntivi. Lascia un campo vuoto per riutilizzare i tuoi Obiettivi di sotto-stat oppure premi «Usa gli obiettivi globali di sotto-stat» per azzerarlo. Le etichette dell’anteprima si aggiornano subito così puoi verificare i numeri prima dell’export.
- Roll minimi (sommatoria Σ): il minimo richiesto si applica alla somma dei roll sulle sotto-stat selezionate entro il livello obiettivo.
- Roll minimi bloccati (🔒) appare quando blocchi almeno una sotto-stat. Clicca un numero nella riga del lucchetto per riservare quel conteggio di roll alle statistiche bloccate; il resto del builder continua a seguire il minimo globale. Se il valore bloccato eguaglia o supera il numero globale evidenziato, il badge globale si spegne così la soglia del lucchetto diventa l'unico vincolo aggregato. Sbloccare la sotto-stat (o toccare Auto) cancella entrambi; scegliere un numero globale più piccolo riaccende il badge globale accanto al lucchetto così capisci quale soglia si applica a ciascuna statistica.
- Esempio: blocca SPD e CR%, imposta Roll minimi = 3 e poi imposta la riga 🔒 a 2. Il builder ora richiede 3 roll totali sulle sotto-stat selezionate, almeno 2 dei quali devono cadere sulle SPD/CR% bloccate. Portare il lucchetto a 3 spegne automaticamente il badge globale perché i due valori coinciderebbero.
- Jolly con Minimo richiesto (somma roll): con sole sotto-stat stellate (★) e Minimo richiesto > 0, Anticipato mostra solo le ripartizioni minime a ogni traguardo (liste corte e stabili). Tardivo ripete le stesse ripartizioni minime ai traguardi iniziali e di nuovo a +16.
- Mitica (5 roll): la rarità Mitica può raggiungere 5 roll su una sotto-stat a +16 (contro 4 delle altre). Quando la tua selezione di Rarità include Mitica, il generatore considera il pre-roll. Con Rarità = Qualsiasi, impostare Minimo richiesto a 5 (o minimi per statistica che sommano a 5) viene trattato come compatibile con Mitica e considera anche un pre-roll a +0.

### Obiettivi di sotto-stat
- Il pulsante «Obiettivi di sotto-stat…» in alto a destra del builder apre la scheda **Obiettivi di sotto-stat** nella finestra Strumenti.
- Gli obiettivi sono globali: si applicano a tutte le ricette, non solo a quella selezionata.
- Vengono usati per calcolare le soglie per ogni intervallo di livello (0–3, 4–7, 8–11, 12–15, 16) e come fallback nella griglia degli Obiettivi di roll.
- Usa «Ripristina predefiniti» per tornare agli obiettivi consigliati.

### Metaset
- Clicca "Gestisci Metaset…" nella riga dei Set per aprire la finestra.
- Aggiungi o rinomina Metaset e scegli quali set include ciascuno. La finestra usa la stessa ricerca e gli stessi layout del selettore Set.
- I Metaset di base sono già inclusi così puoi iniziare subito. Puoi modificarli o rimuoverli in qualsiasi momento.
- "Ripristina predefiniti" (nella finestra) offre opzioni sicure quando i Metaset sono in uso:
  - Eliminare e rimuovere i riferimenti, oppure
  - Sostituire ogni utilizzo con i set espliciti di quel Metaset, oppure
  - Sostituire i riferimenti con un altro Metaset.

### Vendita finale
- Usa l’interruttore `Vendita finale` nell’intestazione dell’anteprima per aggiungere regole Vendi finali per gli oggetti non coperti dalle regole Mantieni. L’etichetta non cambia mai: il riempimento color ambra indica che è attiva e il bordo neutro indica che è disattivata.
- Clicca `Strumenti` accanto all’interruttore per aprire la scheda `Vendita finale` e decidere se copre Artefatti, Accessori e quali intervalli di livello (0–3, 4–7, 8–11, 12–15, 16). L’impostazione predefinita prende di mira 0–15 così gli oggetti a +16 restano al sicuro finché non abiliti `+16`.
- Senza `Vendita finale` gli oggetti che non corrispondono a nessuna regola vengono mantenuti automaticamente da RSL Helper. La vendita avviene solo quando una regola Vendi si attiva.
- Quando `Vendita finale` è attiva, le regole Vendi generate includono esplicitamente tutti i set conosciuti. Nell’anteprima la colonna Set mostra "Tutti i set attualmente noti" per ridurre il rumore; il file esportato elenca comunque ogni set.

### Salvaguardie
- Porta il builder in modalità **Salvaguardie** usando il pulsante di alternanza sopra il pannello builder per segnare le combinazioni che non vuoi vendere mai. Attiva `Attiva Salvaguardie` per permettere allo scanner di aggiungere righe di mantenimento (le modifiche lo attivano automaticamente).
- Le regole di salvaguardia non “consumano” gli oggetti—ogni regola valuta lo stesso pool di candidati. Se un pezzo corrisponde a più regole, conta per tutte.
- Ogni regola ti permette di scegliere slot, set o Metaset, ranghi, rarità, stat principali e (per gli accessori) fazioni. Lasciare un selettore vuoto significa «qualsiasi».
- La `Modalità` decide cosa fa la salvaguardia — i nomi corrispondono ai pulsanti dell'app: `Disattiva` spegne la regola, `Proteggi` conserva solo l'equipaggiamento corrispondente che già possiedi (fino alla quantità richiesta), `Anticipa` protegge anche i nuovi drop finché hai meno corrispondenze della quantità richiesta, e `Migliora` continua a vigilare anche a quantità raggiunta: un nuovo drop resta protetto solo finché la prob. miglioramento impostata indica che può ancora superare il tuo equipaggiamento attuale (verificato a ogni passo di potenziamento); senza prob. miglioramento impostata agisce come `Anticipa`.
- Le sotto-stat sono opzionali: scegline una o più per contare solo gli oggetti che hanno quelle sotto-stat. Le chip di corrispondenza impostano quante delle sotto-stat selezionate un pezzo deve avere — `≥1`–`≥4` (i chip sopra il numero che hai scelto sono disattivati) — oppure `Per Sotto-stat`, che applica la quota a ogni sotto-stat selezionata separatamente. Lascia le sotto-stat vuote per consentire qualsiasi sotto-stat.
- Le sotto-stat selezionate sono sempre classificate con il punteggio normalizzato (glifi ignorati); i controlli del peso compaiono in ogni modalità di conteggio minimo (`≥1`–`≥4`), mentre `Per Sotto-stat` mantiene la ponderazione uguale (i pareggi al limite restano protetti).
- `Pesa per rango` (la chip accanto a `Per stat principale`) fonde il rango nel punteggio stesso invece di lasciarlo come spareggio esatto. Il bonus è scalato dalla **stat principale**, e la dimensione esatta dipende dallo slot e dalla stat principale — una stat principale 5★ segna circa l'81–89 % del 6★ dello stesso slot, una 4★ ancora meno. Il divario tra ranghi adiacenti è piccolo: abbastanza da far vincere a un 6★ un pareggio *quasi* esatto contro un 5★ con la stessa stat principale e sotto-stat solo leggermente migliori, ma non abbastanza da battere un reale vantaggio di sotto-stat. Usa la stat principale al +16 del rango, quindi potenziare un pezzo non ne cambia mai il punteggio, e i punteggi delle sotto-stat non vengono toccati. Richiede almeno una sotto-stat selezionata; attivo di default sulle nuove regole.
  - Il pulsante di regolazione sulla chip `Pesa per rango` apre il pannello dei pesi, dove la stat principale compare come una propria riga pesata (`Stat principale (per rango)`) accanto alle sotto-stat. Il suo peso è un moltiplicatore sul bonus di rango sopra: lascialo a `1.0` per il comportamento predefinito, aumentalo affinché la stat principale di un pezzo di rango più alto superi le migliori sotto-stat di uno più basso, oppure abbassalo verso `0` per affidarti solo alle sotto-stat. È così che decidi se vince il rango o le sotto-stat quando sono in disaccordo — la lista dei candidati si riordina in tempo reale mentre lo regoli.
- `≥ Quantità richiesta` vive accanto alle chip di ambito: «Per salvaguardia» mantiene una quota unica; combina liberamente `Per slot`, `Per set`, `Per fazione` e `Per stat principale` per moltiplicare la quota per ogni combinazione rilevante (se li disattivi tutti si torna automaticamente a «Per salvaguardia»).
- Il tooltip di `Quantità richiesta` mostra la suddivisione attiva degli ambiti (`X per slot × per set × ...`) e una semplice riga dei mancanti (`({missing} mancanti)`).
- Usa il selettore `Filtro: Tutti / Selezione` sopra la griglia per passare da tutta la tua attrezzatura unica solo agli oggetti che corrispondono alla regola evidenziata; Selezione si comporta come Tutti finché nessuna regola è selezionata.
- Lo scanner aggiunge righe di mantenimento solo per gli oggetti che verrebbero venduti e solo quando la quantità richiesta non è soddisfatta. Con `Anticipa`, regole segnaposto coprono le corrispondenze che ancora mancano; con `Migliora`, restano attive regole di mantenimento extra a quantità raggiunta — ma solo per i drop la cui prob. miglioramento supera ancora la soglia della regola.
- **Opzioni ignora** (chip accanto all’interruttore di abilitazione della regola) affinano cosa conta ogni regola:
  - `Ignora salvaguardie precedenti` – quando la salvaguardia classifica i candidati per sotto-stat, scarta dal suo pool gli oggetti che salvaguardie precedenti hanno già mantenuto e sceglie invece i successivi migliori per punteggio. Utile quando impili una seconda salvaguardia SPD/CR dopo una generica e vuoi che scenda più in profondità nel ranking invece di proteggere ridondantemente gli stessi pezzi. Le regole senza sotto-stat non sono interessate. Predefinito: disattivato.
  - `Ignora equipaggiati (Collezione)` – esclude i pezzi attualmente equipaggiati sui campioni della collezione dal conteggio delle corrispondenze di questa regola, così non soddisfano la sua quota. Predefinito: disattivato.
  - `Ignora equipaggiati (Deposito)` – stessa idea ma per i campioni del deposito. Predefinito: disattivato.
- **`Probabilità di miglioramento ≥ N%`** (cercatore di talenti opzionale): allarga la rete di sicurezza oltre il top-N standard. Lo scanner mantiene sempre per prime le pezze del top-N in base al loro valore di sotto-stat **corrente** — quelle non sono mai a rischio. Poi protegge anche qualsiasi pezzo *fuori* da quel top-N la cui probabilità di miglioramento raggiunge la soglia. Il concetto è: «tieni i drop grezzi che hanno buone possibilità di essere competitivi una volta livellati».

  **Cos’è la probabilità di miglioramento?** L’app simula tutti i modi possibili in cui un pezzo potrebbe tirare durante i potenziamenti fino a +16 — alcuni tiri colpiscono la sotto-stat che ti interessa, altri no — e conta quante volte il pezzo finisce nel tuo top N su tutti questi futuri. Un pezzo con il 68 % di probabilità di miglioramento finisce nel top N in circa due percorsi simulati su tre.

  **La probabilità di miglioramento è una *previsione*, non la regola che conserva il tuo equipaggiamento: sono due sistemi distinti.** Questo crea spesso confusione, quindi è bene essere chiari:

  - Il safeguard **conserva sempre i pezzi top-N in base al loro valore di sotto-stat *in questo momento***. È questa classifica per valore attuale a proteggere davvero un pezzo.
  - La probabilità di miglioramento risponde a una domanda *diversa*: *«una volta che tutto è potenziato a +16, questo pezzo sarà ancora tra i miei migliori?»*. Valuta **sia il pezzo sia i suoi concorrenti in base ai loro valori previsti a +16** e conta quante volte il pezzo finisce nel top N.

  Poiché pongono domande diverse, le due cose possono non coincidere — ed è previsto, non è un bug:

  - Un pezzo può mostrare **0 % di probabilità di miglioramento ed essere comunque protetto.** È tra i tuoi migliori *oggi* (quindi il top-N per valore attuale lo conserva), ma la simulazione prevede che rivali ancora in fase di potenziamento lo superino entro il +16 (perciò la sua probabilità *futura* di top-N è ~0 %). Un singolo buon tiro che porta un pezzo nel tuo top-N attuale lo protegge subito — la sua probabilità di miglioramento può restare a 0 % per tutto il tempo, perché quel numero non è mai stato ciò che lo proteggeva.
  - Un pezzo può mostrare una **probabilità di miglioramento alta e non essere (ancora) protetto.** È un drop grezzo promettente non presente nel tuo top-N attuale: viene conservato solo se attivi la soglia qui sotto.

  **Regola fondamentale: la soglia può solo aggiungere alla protezione, mai toglierla.** Il tuo top-N attuale è sempre conservato, indipendentemente dalla loro probabilità di miglioramento. Un pezzo completamente potenziato (+16) conta direttamente il suo valore attuale bloccato — non può uscire dalla protezione perché «ha esaurito il potenziale di miglioramento».

  **Esempio — stendardi SPD, Quantità richiesta = 2, Per fazione (rango 6 leggendario):**

  | Stendardo | SPD | Livello | Prob. miglioramento | Standard | Soglia ≥ 50 % | Soglia ≥ 25 % |
  | --- | --- | --- | --- | --- | --- | --- |
  | A | 12 | +16 | 100 % | ✔ top-2 | ✔ top-2 | ✔ top-2 |
  | B | 6 | +16 | 0 % | ✔ top-2 | ✔ top-2 | ✔ top-2 |
  | C | 5 | +0 | 26 % | ✗ venduto | ✗ venduto | ✔ soglia aggiunge |

  Gli stendardi di rango 6 tirano SPD in incrementi di **5 o 6** per evento, quindi gli unici valori realistici allo stato grezzo sono **5** (minimo) o **6** (massimo). Lo SPD=12 dello stendardo A significa che ha ricevuto esattamente un tiro SPD bonus durante i potenziamenti (6 iniziale + 1 tiro da 6). Lo stendardo B è stato completamente livellato senza tiri SPD bonus — il suo punteggio è bloccato a 6.

  Lo stendardo B ottiene 0 % di probabilità di miglioramento: il suo SPD=6 fisso è destinato a perdere contro qualsiasi concorrente non livellato i cui futuri tiri potrebbero superarlo. Nonostante ciò rimane protetto perché è nel top-2 standard per valore **corrente**. La probabilità di miglioramento non può mai rimuovere oggetti dal top-N — solo la logica di espansione per soglia la usa.

  Lo stendardo C (SPD=5, grezzo) si trova appena fuori dal top-2 per valore corrente. La sua probabilità di miglioramento del 26 % significa che finirebbe nel top-2 in circa 1 percorso simulato su 4. Con soglia ≥ **25 %** viene protetto; con soglia ≥ 50 % resta venduto.

  Se lo stendardo C fosse partito con **SPD=6**, la sua probabilità di miglioramento sale al **68 %** — un candidato molto più solido. Soglia ≥ **65 %** lo proteggerebbe.

  **Gli stendardi epici di rango 6** ricevono solo **3 eventi di tiro SPD** (contro 4 per i leggendari, perché il potenziamento +4 aggiunge una nuova sotto-stat invece di tirare una esistente). Le probabilità risultanti sono quasi identiche: SPD=6 grezzo → **70 %**, SPD=5 grezzo → **26 %**.

  **Soglie suggerite (equipaggiamento di rango 6):**
  - **65 %** — protegge i drop grezzi al massimo (SPD=6, ~68–70 % di probabilità). Buon default se vuoi che i drop promettenti sopravvivano durante il livellamento.
  - **25 %** — protegge anche i drop al minimo (SPD=5, ~26 % di probabilità). Rete più ampia; usalo se lo spazio nell’inventario non è un problema.
  - Evita **100 %**: corrisponde solo a pezzi completamente livellati già tenuti dal top-N standard, quindi non aggiunge nulla rispetto alla modalità standard.

#### Ambiti della quota in breve

| Pulsante di ambito | Comportamento della quota | Quando è utile |
| --- | --- | --- |
| `Per salvaguardia` | Un unico pool condiviso per l’intera salvaguardia. | Mantiene cinque stivali SPD indipendentemente dal set. |
| `Per slot` | Duplica la quota per ogni slot. | Mantiene due anelli, due amuleti e due vessilli separatamente. |
| `Per set` | Duplica la quota per ogni set/metaset sulla scheda. | Tiene distinti due drop Stoneskin e due Protection. |
| `Per fazione` | Duplica la quota per ogni fazione. | Garantisce tre anelli Merciless per ogni fazione. |
| `Per stat principale` | Duplica la quota per ogni stat principale selezionata. | Divide i pool per vessilli ACC e RES. |

#### Gruppi: più protezioni che condividono un numero richiesto
Due protezioni possono finire per descrivere la *stessa* promessa senza volerlo. Una tiene 3 buoni anelli, un’altra ne tiene 2 — ma tu volevi solo 3 anelli in totale, e ora ne tieni 5.

Un **gruppo** risolve la cosa. Seleziona le protezioni (clic, poi Ctrl+clic) e scegli `Raggruppa le salvaguardie selezionate` dal menu contestuale. Ogni membro mostra ora un bordo colorato nell’elenco, e nel modulo compare una piccola striscia di gruppo proprio accanto al suo `Numero richiesto`: il numero proprio del gruppo e i suoi pulsanti di ambito.

- Ogni protezione in un gruppo continua a cercare **esattamente** ciò che ha sempre cercato — i propri slot, set, sottostatistiche, pesi e modalità. Un gruppo non cambia mai cosa cercano.
- Cambia dove finiscono i loro risultati. Una protezione in un gruppo non tiene più pezzi per conto suo: **offre** i suoi risultati al gruppo, e il suo `Numero richiesto` decide quanti ne offre.
- Il numero del gruppo (il campo `⊚ ≥` accanto a `Numero richiesto`) è quello che decide davvero. Scrivilo direttamente: è quanto il gruppo tiene di tutto ciò che le sue protezioni gli hanno offerto. Parte come somma dei numeri dei membri, quindi raggruppare non cambia nulla finché non lo abbassi. Modificarlo su un membro qualsiasi modifica il gruppo.
- I pulsanti di ambito del gruppo decidono cosa conta come lo stesso insieme. Metti `fazione` sul gruppo e ogni fazione avrà il proprio numero, comunque siano suddivise le protezioni al suo interno.
- Quando più protezioni offrono pezzi per lo stesso insieme, **vincono i pezzi migliori**. Ogni pezzo è giudicato con le sottostatistiche e i pesi della protezione che l’ha offerto, quindi un pezzo della seconda protezione può benissimo battere uno della prima. Il pannello dei candidati segna nel colore del gruppo i pezzi che il gruppo ha venduto, e il suo interruttore `Gruppo` mostra l’intero insieme ordinato insieme.
- I gruppi sono contigui: trascina una protezione dentro un gruppo (rilasciala nella parentesi colorata) o fuori (rilasciala a filo), oppure usa il menu contestuale — `Rimuovi dal gruppo`, `Unisciti al gruppo sopra/sotto`, `Separa gruppo`. Spostare una protezione su o giù non cambia mai il suo gruppo; un gruppo intero si sposta come un blocco.

**Esempio.** Vuoi cinque buoni accessori VEL per fazione, ma «buono» significa due cose diverse: `VEL + T.CRIT + D.CRIT` per chi fa danno, `VEL + PS + DIF` per i tank. Crea una protezione per ciascun profilo, raggruppale e imposta il gruppo su `5` con `fazione`. Ogni protezione offre i suoi pezzi migliori e il gruppo tiene i cinque venuti meglio fra le due, invece di cinque per ciascuna.

#### Esempi concreti

| Scenario | Filtri | Quantità richiesta | Chip di ambito | Cosa garantisce lo scanner |
| --- | --- | --- | --- | --- |
| Scarpe SPD in esaurimento | Slot = Stivali, Stat principale = SPD, Set vuoti | `5` | `Per salvaguardia` | Sopravvivono almeno cinque stivali SPD indipendentemente dal set. |
| Mischiare guanti Savage + Lethal | Slot = Guanti, Set = Savage + Lethal, Stat principale = CDMG% | `3` | `Per salvaguardia` | Conserva tre guanti ad alto danno anche se la miscela di set cambia. |
| Anelli Merciless per fazione | Slot = Anello, Set = Merciless, Fazione vuota | `3` | `Per fazione` | Ogni fazione conserva tre dei propri anelli Merciless. |
| Anelli HP% per fazione | Slot = Anello, Stat principale = HP%, Set vuoti | `2` | `Per fazione` | Assicura due anelli HP% per ogni fazione. |
| Accessori base per fazione | Tre regole (Anello, Amuleto, Vessillo), Set e Stat principale vuoti | `5` | `Per fazione` | Ogni fazione mantiene cinque anelli, amuleti e vessilli. |
| Cinque accessori per fazione, in qualsiasi slot | Le stesse tre regole, in un gruppo | `5` come numero del gruppo | `fazione` sul gruppo | Ogni fazione mantiene cinque accessori in totale, in qualunque slot si trovino. |
| Stoneskin + Protection per fazione | Slot = Anello/Amuleto/Vessillo, Set = Stoneskin + Protection, Stat principale vuota | `2` | `Per set` + `Per fazione` + `Per slot` | Ogni fazione tiene due drop Stoneskin e due Protection per ogni slot accessorio. |
| Accessori SPD più veloci | Slot = Anello/Amuleto/Vessillo, Sotto-stat = SPD | `5` | `Per salvaguardia` | Conserva i cinque migliori roll SPD sugli accessori (inclusi i pareggi). |
| Vessilli ACC con SPD | Slot = Vessillo, Stat principale = ACC, Sotto-stat = SPD + ACC, Pesi: SPD più alto | `3` | `Per fazione` | Ogni fazione tiene i migliori vessilli ACC dove SPD conta di più. |

Suggerimento: importa il tuo `.db` o incolla equipaggiamento nel dialogo Equipaggiamento prima di passare alla modalità Salvaguardie, così lo scanner analizza oggetti reali. Clicca una salvaguardia per evidenziare le corrispondenze; imposta `Filtro` su `Selezione` per vedere solo quelle.

### Drop dei dungeon (Simulatore)
Apri "Strumenti" e passa a **Drop dei dungeon**. Simula il farming dei dungeon con le tue regole Sellfile attuali per vedere quanto equipaggiamento manterresti per set e livello di potenziamento.

- Scegli un dungeon e una fase.
- Modalità di simulazione:
  - `Livellamento`: i roll si fermano appena l'oggetto verrebbe venduto, quindi rispecchia il livellamento reale.
  - `Istantanea`: i roll arrivano sempre fino a +16, anche se l'oggetto sarebbe stato venduto prima.
- La tabella mostra i drop tenuti divisi per tutti i drop di quella fase a +0 / +4 / +8 / +12 / +16.
- Clicca una cella per il dettaglio slot + stat principale, poi apri **Probabilità di sotto-stat specifiche** per le chance esatte e le stime di esecuzioni.

Note:
- Usa le tue regole attuali di Mantieni/Vendi, incluse Vendita finale e Salvaguardie.
- Circa 100.000 drop per fase e si aggiorna mentre gira.
- Tassi di drop e roll sono simulati, quindi i numeri sono stime.

### Analisi Equipaggiamento
Apri "Strumenti" e passa alla scheda **Analisi Equipaggiamento** per una panoramica analitica del tuo equipaggiamento importato.

**Schede KPI (riga superiore):** Otto schede percentuale — **Tasso 6★**, **Leggendaria+**, **Maxed (+16)**, **Equipaggiata**, **Bloccata in Deposito**, **Chaos'd**, **Glyphed**, **Ascesa** — ciascuna con tooltip.

**Donut a filtro incrociato:** Sei grafici — **Slot**, **Grado**, **Rarità**, **Risultato**, **Fonte**, **Livello** — si aggiornano a vicenda quando si clicca.
- Clicca un segmento per aggiungerlo come filtro per quella dimensione; ogni altro grafico si restringe immediatamente all'equipaggiamento corrispondente. Ogni grafico esclude la propria dimensione per mostrare sempre l'intera gamma.
- Doppio clic su un segmento del donut **Slot** per selezionare un intero gruppo in una volta: qualsiasi pezzo artefatto (Arma, Elmo, Scudo, Guanti, Corazza, Stivali) seleziona tutti e sei gli slot artefatto; qualsiasi accessorio (Anello, Amuleto, Vessillo) seleziona tutti e tre.
- I donut **Slot** e **Fonte** mostrano icone di categoria. Il donut **Livello** etichetta ogni arco con il testo del livello.


**Treemap dei Set:** Visualizzata sotto i donut. Ogni tessera rappresenta un set di equipaggiamento; l'area della tessera è proporzionale al numero di oggetti. Lo sfondo della tessera è suddiviso da sinistra a destra in bande colorate per risultato (Vendi / Protetto / Tieni / Nessuna corrispondenza). Clicca una tessera per aggiungere quel set come filtro incrociato.

**Chip di filtro:** Le selezioni attive per ciascuna dimensione appaiono come chip sotto i donut; clicca l'icona di eliminazione su un chip per rimuovere solo quel filtro. Anche le selezioni della stat principale appaiono come chip. Il pulsante **Cancella filtri** azzera tutte le dimensioni in una volta.

**Barra Stat principali:** Mostra la frequenza di ogni stat principale nell'equipaggiamento filtrato. Clicca una barra per approfondire — il grafico della frequenza delle sotto-stat si aggiorna mostrando solo le sotto-stat dell'equipaggiamento con quella stat principale selezionata. Clicca di nuovo per deselezionare.

**Probabilità di miglioramento:** Quanto è probabile che il tuo equipaggiamento migliori, raggruppato in fasce del 10%. Il numero a destra indica quanti oggetti rientrano in ciascun gruppo. L'equipaggiamento senza salvaguardia e quello al massimo (+16) vengono esclusi. Clicca un gruppo per mostrare solo quell'equipaggiamento.

**Radar Frequenza sotto-stat:** Mostra la frequenza di ogni sotto-stat nell'equipaggiamento filtrato (e opzionalmente limitato per stat principale) come grafico radar. Clicca una marca su un asse per selezionarla come pivot di co-occorrenza — il radar si restringe all'equipaggiamento che contiene tutte le sotto-stat selezionate insieme (fino a 4 pivot). I pivot attivi appaiono come chip sotto il grafico; × ne rimuove uno, **Cancella filtri** li rimuove tutti.

**Heatmap Slot × Stat principale:** Numero di oggetti per slot (colonne) × stat principale (righe). Clicca un'intestazione di colonna o una cella per filtrare per slot.

**Scheda Statistiche campioni:** Totali delle sotto-stat sommati sui pezzi equipaggiati per campione. Filtra per posizione (**Tutti** / **Collezione** / **Deposito**), attiva solo **Completamente equipaggiato** e includi o escludi i glifi. Mostra le serie Min/Media/Mediana/Max.

**Equipaggiamento campioni:** Copertura degli slot di equipaggiamento per campione in due tabelle compatte (**Collezione** / **Deposito**). Ogni riga mostra una griglia 3×3 (pieno = equipaggiato, contorno = vuoto, tratteggiato = bloccato finché il campione non ascende). Clicca uno slot pieno per selezionare quel pezzo — la selezione è condivisa con l’Ispettore Equipaggiamento. Attiva **Simula vendita** per colorare di rosso gli slot la cui pezza verrebbe venduta e contarli come mancanti, o **Mostra completi** per elencare anche i campioni completamente equipaggiati.

**Pulsanti:**
- **Copia istantanea:** Renderizza l'intera vista analitica come PNG e la copia negli appunti. Nota: la sezione Equipaggiamento campioni non è inclusa nell’istantanea.
- **Applica all'Ispettore Equipaggiamento:** Invia il filtro incrociato attivo nel filtro elenco dell'Ispettore Equipaggiamento (visibile solo quando è attivo un filtro).

### Gestione delle ricette
- Elenco ricette salvate: ogni ricetta appare come un'etichetta sotto il builder. Usa l'elenco per selezionare (clic sinistro), duplicare, riordinare o eliminare (con conferma). "Elimina ricette" rimuove tutte (con conferma).
- Collegamenti al passaggio del mouse: passando il mouse su una ricetta evidenzi tutte le righe correlate nell'Anteprima Sellfile. Passando su una riga dell'Anteprima Sellfile si evidenzia la ricetta salvata corrispondente.
- Collegamenti al clic: cliccando una riga dell'Anteprima Sellfile selezioni la ricetta salvata (e la carichi nel builder). Le righe provenienti dal `.hsf` di base non cambiano la selezione corrente.
- Menu contestuali: sulle ricette salvate (Duplica/Sposta/Copia/Elimina) e sull'area delle ricette salvate (Copia tutto, Incolla).
- Copia di backup: se l'accesso agli appunti è bloccato, si apre una finestra con il contenuto già selezionato — premi Ctrl/Cmd+C per copiarlo oppure incollalo nella finestra Incolla.
- Interruttore Ricette on/off: il pulsante nell'intestazione del builder disabilita globalmente tutte le ricette senza eliminarle, mettendo in pausa la pipeline di anteprima — utile per controllare rapidamente un export con sole salvaguardie o verificare cosa produce la Vendita Finale da sola.

### Anteprima Sellfile (Regole e Ispettore Equipaggiamento)
- L'intestazione dell'anteprima tiene insieme l'interruttore `Regole`/`Ispettore Equipaggiamento`, il pulsante “Strumenti” e il pulsante “Carica Sellfile di RSL Helper”, così sai sempre dove cambiare tabella o aprire il dialogo Equipaggiamento.
- Vista `Regole` (predefinita): mostra tutte le regole che verranno esportate, incluse le righe del `.hsf` base opzionale. I contatori rimangono su Mantieni vs Vendi, la riga dei filtri conserva i chip Qualsiasi/Solo per Slot/Rango/Rarità/Livello e ora offre entrambi i pulsanti Ricette in parallelo: `Restringi` decide se nascondere i chip fuori dai filtri correnti, mentre la `Selezione` funziona come un interruttore On/Off che limita le righe del Sellfile ai chip selezionati (e mantiene pronta la stessa selezione per l'Ispettore Equipaggiamento).
- Vista `Ispettore Equipaggiamento`: ribalta la tabella sulla lista importata così puoi scorrere gli import senza riaprire Strumenti. I contatori/indicatori passano a Mantieni/Vendi/Ambito/Senza regola secondo la regola “vince la prima ricetta corrispondente”, e la riga dei filtri mantiene entrambi i pulsanti Ricette (`Restringi` + `Selezione`). Il primo continua a governare la visibilità dei chip, mentre la `Selezione` applica il tri-stato (`Off` → `Prima` → `Per corrispondenza`) per isolare le righe dell'Ispettore Equipaggiamento e continua a limitare le righe del Sellfile alla tua selezione quando torni su `Regole`. Importare un `.db` commuta automaticamente su questa vista, ma puoi tornare alle Regole in qualsiasi momento.
- Il pulsante “Carica Sellfile di RSL Helper” si comporta esattamente come il drag & drop: `.sfc` sostituisce lo stato del builder, `.hsf` si sovrappone come Sellfile base opzionale e `.db` accodano gli oggetti nell'Ispettore Equipaggiamento senza toccare il builder. Il pulsante “Svuota” scollega il `.hsf` base opzionale.
- Usa l'icona della tavolozza per aprire Gestione colori per le etichette delle sotto-stat.
- In vista Regole la tabella mantiene le colonne “N.” e “Ricetta” (vuota per le righe del file base). In vista Ispettore Equipaggiamento nello stesso spazio vedi slot/set, statistiche dell'oggetto e il badge della prima ricetta corrispondente per capire subito cosa accadrà a ogni artefatto.

### Controlli dell'Anteprima Sellfile
- Gestisci colori: clicca l'icona della tavolozza sopra la tabella per personalizzare colori di testo/sfondo delle etichette delle sotto-stat. Usa "Ripristina predefiniti" nella finestra per tornare ai colori consigliati.
- Filtri: premi `Ctrl+F` (`Cmd+F` su macOS) per aprire il pannello e mettere subito a fuoco la ricerca Ricetta. Clic destro su qualsiasi intestazione di sezione (oppure `Ctrl`/`Cmd`+clic sul suo chevron) per collassare o espandere tutte le sezioni in un colpo solo. `Restringi` nasconde i chip delle ricette che non corrispondono al filtro attivo così l'anteprima resta leggibile. `Selezione` decide quali ricette sono ammesse nella tabella: resta un semplice On/Off in modalità Regole e passa da `Off` → `Prima` → `Per corrispondenza` quando l'Ispettore Equipaggiamento è attivo.
- Menu delle colonne: clic destro sull'intestazione della tabella per aprire i controlli:
  - Ripristina colonne: ripristina colonne e larghezze predefinite.
  - Adatta automaticamente: adatta le colonne alla larghezza della finestra.
  - Consenti righe multi-linea: attiva il ritorno a capo per Sotto-stat e altre.
  - Mostra/Nascondi colonne: caselle per controllare la visibilità di ogni colonna.
- Riordina colonne: trascina un'intestazione verso sinistra/destra.
- Ridimensiona colonne: trascina il bordo destro di un'intestazione.
- Clic: cliccando una riga selezioni la ricetta collegata (senza scorrimento automatico). Cliccando una ricetta salvata la tabella scorre fino alla prima riga corrispondente.

### Ispettore Equipaggiamento
- Clicca "Strumenti" nell'intestazione dell'anteprima per aprire il dialogo Equipaggiamento. Crea equipaggiamento di esempio. Gli oggetti si sincronizzano subito con l'anteprima, quindi chiudere il dialogo non svuota la griglia dell'Ispettore Equipaggiamento.
- Connetti RSL Helper per la sincronizzazione in tempo reale (il pulsante Connetti nell'intestazione dell'anteprima) o trascina file `.db` sull'app o usa il pulsante "Carica Sellfile di RSL Helper".- Ogni riga dell'Ispettore Equipaggiamento mostra slot, set, livello, stat principale, sotto-stat (con glifi e roll), provenienza (inventario vs posta) e i chip Mantieni/Vendi + la prima ricetta/regola che ha fatto match. Le regole disattivate non corrispondono mai, quindi le righe "Nessuna corrispondenza" rappresentano equipaggiamento che il Sellfile lascerebbe stare.
- I contatori dell'intestazione mostrano i totali Mantieni/Vendi/Ambito/Senza regola. I quattro pulsanti del filtro risultato — **Mantieni**, **Vendi**, **Ambito** e **Senza regola** — funzionano come interruttori indipendenti: attiva qualsiasi combinazione per restringere la lista. **Ambito** attenua (ma mantiene visibili) gli oggetti che condividono lo stesso set+slot di un pezzo che le tue regole venderebbero, così puoi confrontare un candidato con la sua concorrenza in un'unica vista senza dover fare due passaggi di filtro. Quando sono selezionate anche una o più **Sorgenti**, queste fungono da insieme di riferimento — solo gli oggetti contrassegnati per la vendita provenienti dalle sorgenti selezionate diventano elementi principali, mentre i compagni vengono ricercati in *tutte* le sorgenti, permettendoti di vedere ogni copia di quell'equipaggiamento indipendentemente da dove si trovi. **Senza regola** mostra l'equipaggiamento che nessuna regola tocca — utile per individuare lacune nelle ricette. Combinali con il selettore `Prima`/`Per corrispondenza` delle Ricette per concentrarti sui casi limite prima di esportare.
- Usa l'interruttore dell'anteprima per passare tra la tabella Regole e l'Ispettore Equipaggiamento senza riaprire Strumenti — perfetto per confrontare le righe generate con gli oggetti che le attivano.

- **Sovrapposizione Rango Salvaguardia:** il menu della griglia ha un pulsante **Rango Salvaguardia** che scorre ciò che mostra il chip di rango di ogni pezzo (per valore di sotto-stat attuale; **#1** è il migliore; verde = conservato, rosso = verrebbe venduto). **Off** lo nasconde; **Secchio** mostra il rango all'interno del proprio secchio del pezzo — l'ambito slot / set / fazione / stat principale che la regola conserva separatamente (es. **#2**); **Salvaguardia** mostra il rango sull'intera salvaguardia (es. **#7**); **Entrambi** mostra secchio poi salvaguardia come **#2 · #7** (2° nel suo secchio, 7° in totale). Il chip e il suggerimento sono ordinati per il rango mostrato, il chip riflette la regola corrispondente meglio classificata del pezzo, e cliccarlo porta a quella regola. Con regole selezionate, il chip riflette quelle regole; un pezzo classificato solo da un'*altra* regola mostra comunque il suo rango migliore, leggermente attenuato. Richiede le Salvaguardie attivate.

### Confronto equipaggiamento (Prima / Dopo)
- Il pulsante **Diff** nell'intestazione dell'Ispettore Equipaggiamento attiva un confronto che mostra quali pezzi passano tra **Tieni** e **Vendi** quando cambi qualcosa — utile per regolare le ricette o provare le sostituzioni dinamiche nella finestra Nota.
- Un piccolo chip accanto al pulsante mostra la variazione corrente rispetto al tuo punto di riferimento: quanti pezzi in più (o in meno) sono ora **Venduti**, **Tenuti** e protetti dalle **Salvaguardie**.
- Clic sinistro su **Diff** apre una vista **affiancata prima/dopo** dei pezzi cambiati (sinistra = prima, destra = dopo) con scorrimento sincronizzato. Clicca di nuovo per chiudere.
- Clic destro sul pulsante per le opzioni:
  - **Imposta riferimento** — fissa lo stato attuale come il «prima» con cui confronti.
  - **Segui riferimento automaticamente** (attivo per impostazione predefinita) — mantiene il «prima» sulla tua ultima modifica di ricetta/salvaguardia, così il confronto riflette sempre la tua modifica più recente.
- Due cose da sapere:
  - Attivare le **sostituzioni dinamiche** nella finestra Nota **si somma** — più sostituzioni mostrano il loro effetto combinato, non solo l'ultima.
  - Modificare una ricetta o una salvaguardia nel builder sposta il riferimento a quella modifica (finché «Segui riferimento automaticamente» è attivo). Disattivalo (o usa «Imposta riferimento») per confrontare tutto rispetto a un punto fisso.
- I tuoi filtri abituali dell'Ispettore Equipaggiamento continuano a valere: un pezzo appare se corrisponde al filtro prima o dopo la modifica.

### Esportazione
- Clicca "Esporta Sellfile di RSL Helper unito" (o "Esporta Sellfile di RSL Helper" quando non è caricato alcun file base).
- Usa "Salva ricette" e "Carica ricette" nella sezione Aggiungi regole per conservare e riutilizzare il tuo lavoro.
- Il nome file esportato usa il formato predefinito `Sellfile_AAAAmmGG_HHMM.hsf`.

### Account

Sellfile Creator può mantenere documenti separati (ricette, salvaguardie, nota, equipaggiamento) per più account di gioco. Il selettore degli account si trova nella barra superiore (e nella finestra della vista semplice): fai clic per cambiare account o crearne di nuovi, e usa l’icona dell’ingranaggio accanto a un account per aprire il gestore degli account. Lì puoi rinominare un account, sceglierne il colore d’accento, inserire l’id account di RSL Helper a cui appartiene, attivare o disattivare l’invio automatico per account, contrassegnare un account come predefinito per i dati che arrivano senza id, decidere se i dati dell’equipaggiamento ricevuti vengono salvati su questo dispositivo ed eliminare un account con tutti i suoi dati. Tieni premuto Shift mentre scegli un account nel selettore per unire il documento corrente in quell’account.

**Come avviene la transizione:**

- Dopo l’aggiornamento, tutti i tuoi dati esistenti vivono semplicemente in un account chiamato "Default" — per te non cambia nulla.
- Il supporto agli account viene introdotto a tappe insieme a RSL Helper, quindi alcune parti non sono ancora pienamente attive.
- Per ora RSL Helper non dice ancora a Sellfile Creator quale account di gioco sta inviando. Quei dati vanno al tuo account attivo — o all’account che hai contrassegnato come "predefinito per i dati senza id account" nel gestore.
- Non appena RSL Helper passerà l’id account all’avvio di Sellfile Creator, il tuo account "Default" esistente verrà collegato automaticamente a quell’id — i tuoi dati lo seguono e basta. Un secondo account di gioco riceverà poi un proprio account Sellfile Creator nuovo.
- Quando RSL Helper etichetterà anche i suoi pacchetti di dati con l’id account, tutto verrà instradato automaticamente: i dati di un altro account non si mescolano mai a quello su cui stai lavorando e, se quell’altro account ha l’invio automatico attivo, il suo sellfile viene ricostruito e rispedito in background.

## Esempi

Gli esempi seguenti assumono obiettivi di sotto-stat 6★ (unità per roll): SPD=5, CR%=5, CDMG%=5.

Anticipato vs Tardivo
- Anticipato: le soglie riflettono i roll già ottenuti. Con jolly + Minimo richiesto, mostra solo le ripartizioni minime a ogni traguardo (lista stabile). Altrimenti, prima del controllo di fattibilità, elenca il progresso con sole statistiche selezionate e poi collassa sui tuoi obiettivi per statistica (a meno che un minimo Σ globale richieda di più).
- Tardivo: richiede solo ciò che deve essere presente ora per raggiungere l'obiettivo +16. Con jolly + Minimo richiesto, ripete le stesse ripartizioni minime ai traguardi iniziali e di nuovo a +16. Con obiettivi per statistica emette i limiti inferiori necessari a ogni livello.

Esempio: Anticipato (2 sotto-stat) — SPD min=2, CR% min=1 (livelli 0..16)
- +0: SPD ≥ 5, CR ≥ 5
- +4: [10,5] e [5,10]
- +8: [15,5], [10,10], [5,15]
- +12/+16: [15,10]

Esempio: Tardivo (2 sotto-stat) — SPD min=2, CR% min=1 (livelli 0..16)
- +0/+4: [5,5]
- +8: [10,5] o [5,10]
- +12: [15,5] o [10,10]
- +16: [15,10]

Esempio: Anticipato (3 sotto-stat) — SPD min=2, CR% min=1, CDMG% libero, Richieste=3
- +0: [SPD,CR,CDMG] ≥ [5,5,5]
- +4: ripartizioni da un roll: [10,5,5], [5,10,5], [5,5,10]
- +8: ripartizioni da due roll sulle tre (rispettano i limiti superiori)
- +12/+16: [15,10,5]

Esempio: Tardivo (3 sotto-stat) — SPD min=2, CR% min=1, CDMG% libero, Richieste=3
- +0/+4: [5,5,5]
- +8: [10,5,5] o [5,10,5]
- +12: [15,5,5] o [10,10,5]
- +16: [15,10,5]

Suggerimento: usa i limiti superiori di roll per vietare roll su una statistica. Dal simbolo ★, clic destro per impostare il Limite superiore di roll e impostalo a 0. Per esempio, imposta il Limite superiore di roll di CDMG% = 0 per lasciarlo al valore base mentre SPD/CR ricevono i roll.

Esempio: blocca una statistica, richiedine due
- Seleziona sotto-stat: SPD, HP, ATK. Clicca SPD e poi il badge con lucchetto (🔒) per bloccarla.
- Imposta sotto-stat richieste = 2.
- Effetto: le regole includono SPD+HP e SPD+ATK. Non includono HP+ATK senza SPD (le sotto-stat bloccate sono sempre incluse).

Esempio: concentra i roll su 3 statistiche, vietali sulla 4ª
- Obiettivo: mantenere gli oggetti con SPD, CR%, CDMG% e una tra HP%/ATK%/DEF%, ma senza roll sulla 4ª sotto-stat.
- Seleziona sotto-stat: SPD, CR%, CDMG%, HP%, ATK%, DEF%.
- Sotto-stat richieste = 4.
- Indicatori di roll:
  - Dal simbolo ★, clic sinistro (Roll minimi): imposta SPD, CR%, CDMG% ai minimi desiderati (per esempio 1 ciascuno).
  - Dal simbolo ★, clic destro (Limite superiore di roll): imposta HP%, ATK%, DEF% a Limite superiore di roll = 0.
- Effetto: la quarta sotto-stat è sempre una tra HP%/ATK%/DEF% e qualunque sia, rimane senza roll. SPD/CR%/CDMG% ricevono i roll.

Esempio: Anticipato con un jolly (solo selezionate)
- Seleziona sotto-stat: SPD e ACC.
- Indicatori di roll: SPD Min = 2; ACC = ★ (jolly).
- Sotto-stat richieste: Auto (2).
- Livelli: Min +0, Max +16.
- Effetto: i traguardi Anticipati mostrano gli oggetti che possono ancora raggiungere SPD(2) entro +16 (visualizza le righe iniziali in cui rolla SPD o ACC). Quando due roll su SPD diventano possibili, appare la riga col minimo di SPD.

Esempio: somma dei roll con jolly (2 sotto-stat)
- Seleziona sotto-stat: SPD e ACC. Impostale entrambe a ★ (jolly).
- Sotto-stat richieste: 2. Roll minimi: 1.
- Anticipato:
  - +4/+8/+12/+16: due righe — SPD ≥ 10, ACC ≥ 9 e SPD ≥ 5, ACC ≥ 18 (ripartizioni minime; stabili tra i traguardi).
- Tardivo:
  - +0/+4/+8/+12: solo le righe di base (nulla in più richiesto); +16: le due righe sopra. Con valori più alti di Roll minimi, Tardivo impone la somma selezionata minima necessaria al traguardo corretto (es. con Roll minimi = 2, +12 mostra le ripartizioni da un roll; +16 mostra quelle da due roll).

## Note per i contributori

- Traduzioni: gli archivi di rilascio includono modelli di localizzazione in `i18n/` (ad es. `i18n/it-IT.l10n.json`).
- Modifica e test: apri l’app e trascina il tuo `*.l10n.json` modificato per applicarlo subito alla sessione corrente (nessuna installazione necessaria o possibile).
- Invio correzioni: invia il JSON aggiornato tramite messaggio su Discord. Mantieni le chiavi invariate; quelle mancanti tornano all’inglese.
- Lingue integrate: tutte le lingue distribuite sono compilate nell’unico HTML, quindi l’app funziona completamente offline. Le tue correzioni saranno incluse nel prossimo rilascio.
- `Stream-Helper-DB-to-Creator.bat` avvia il DB watcher e trasmette il database predefinito di RSL Helper in Sellfile Creator per controllare le ricette in tempo reale più facilmente.

## Ringraziamenti

Molte grazie a **[STBL] Nasgor** per i suoi contributi inestimabili,  
a **[SP] Panda** per i suoi Sellfile,  
a **KruYseN** per i suoi video di pulizia dell'equipaggiamento,  
e naturalmente a **Farbstoff** per RSL Helper!

## Autore
Creato da [STBL] Nusi㊷  
Localizzazione a cura di AI

© Nusi㊷ - 2026
