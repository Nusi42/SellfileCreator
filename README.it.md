# Creatore di Sellfile per RSL Helper

Crea, visualizza in anteprima ed esporta regole di vendita per RSL Helper tramite un'interfaccia semplice.

> Strumento indipendente creato dai fan. Non è affiliato con Plarium, Raid: Shadow Legends o RSL Helper. I marchi appartengono ai rispettivi proprietari.

## Funzionalità
- Crea regole e salvale: costruisci ricette e mantieni una libreria da riutilizzare.
- Interruttore Anteprima Sellfile: passa dalla tabella Regole alla tabella dell'Ispettore Equipaggiamento direttamente dall'intestazione. I contatori/gli indicatori di esito si adattano (Mantieni/Vendi per le regole, `Matched`/`No Match` per l'Ispettore Equipaggiamento) e i filtri seguono la tabella scelta.
- Drag & drop o pulsante Carica: rilascia `.sfr`, `.hsf` o `.db` ovunque (l'overlay conferma) oppure clicca "Load RSL Helper Sellfile". Entrambe le opzioni si comportano allo stesso modo: `.sfr` sostituisce il builder, `.hsf` si affianca come Sellfile base opzionale e i dump `.db` finiscono direttamente nella coda dell'Ispettore Equipaggiamento senza toccare il builder.
- Tieni premuto `Shift` durante il caricamento di un `.sfr` (selettore file o drag & drop) per aprire un dialogo di import aggiuntivo in cui puoi scegliere separatamente Ricette, Nota, Metaset e Salvaguardie.
- Metaset: assegna un nome a gruppi di set (es. Velocità + Percezione) e riutilizzali nelle regole.
- Esporta con un clic: esporta un file HSF (il Sellfile di RSL Helper) pronto per RSL Helper.
- Pulsante "Strumenti": apri il dialogo dall'intestazione per raggiungere `Vendita finale`, `Drop dei dungeon` e il dialogo Equipaggiamento nello stesso punto. Crea equip di esempio, incolla righe oppure trascina `%APPDATA%\\RslHelper\\Config`, poi chiudi il dialogo e lascia l'interruttore dell'anteprima sulla tabella che ti serve: la coda dell'Ispettore Equipaggiamento resta visibile senza riaprire nulla.
- Modalità Salvaguardie: definisci le combinazioni che non vuoi perdere mai. Quando le tue ricette più le tue regole di vendita attualmente attive eliminerebbero tutte le copie, lo scanner genera automaticamente regole di mantenimento.
- Dialogo di ripristino Autosave: quando troviamo un Autosave, scegli con precisione cosa ricaricare: ricette, Metaset, Valori obiettivo delle sotto-stat, resto di Vendita finale, nota fissata, stato del pannello filtri e perfino le importazioni dell'Ispettore Equipaggiamento.
- Copia la cartella del DB di RSL Helper: l'intestazione dell'anteprima offre un pulsante negli appunti che copia `%APPDATA%\RslHelper\Config` così puoi incollare subito il percorso in Esplora risorse prima di trascinare dentro il `.db`.

## Come si usa

### File di ricette
- SFR (`.sfr`): il file di progetto per questa app. È come un salvataggio che puoi caricare o condividere. RSL Helper non usa direttamente gli SFR.
- HSF (`.hsf`): il Sellfile per RSL Helper. Esportalo da questa app e poi caricalo in RSL Helper.
- Il nome file salvato usa il formato predefinito `SellfileCreatorRecipes_AAAAmmGG_HHMM.sfr`.

### Generatore di ricette
- Compila il Generatore di ricette e assegna un "Nome ricetta" chiaro.
- Clicca "Aggiungi come nuova ricetta" per salvarla; quindi seleziona la ricetta salvata nell'elenco sotto il builder per modificarla e premi "Aggiorna ricetta selezionata".
- Carica/Salva: usa "Carica ricette" e "Salva ricette" per riutilizzare le tue regole personalizzate. Queste azioni salvano tutto ciò che serve per ricostruire l'anteprima dentro un file di ricette.
- Menu Reset/Inserisci/Applica: clic destro su Reset, "Inserisci come ricetta" o "Applica come ricetta" per aprire il menu condiviso. Salva lo stato corrente del builder come modello predefinito, torna ai valori di fabbrica, abilita "Reset automatico dopo Inserisci" (svuota il builder subito dopo aver inserito una ricetta) oppure abilita "Applica automaticamente alla ricetta selezionata" (invia le modifiche nella ricetta evidenziata dopo ~400 ms di inattività). I due interruttori sono mutuamente esclusivi: attivarne uno disattiva l'altro e le preferenze restano salvate tra le sessioni.
- Nota: clicca "Aggiungi nota…" (o "Modifica nota…") per allegare una nota al tuo file di ricette. La nota viene mostrata automaticamente dopo aver caricato un file di ricette che la contiene. Usa `<!-- recipes:1,0 -->` per inserire i chip delle ricette desiderate (0 prende quella successiva). Usa `<!-- recipes-re:"speed" -->` per mostrare tutte le ricette con un nome che corrisponde al pattern (ignorando maiuscole/minuscole).
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
- Fazione: restringi le regole accessori a una fazione specifica quando stai puntando una squadra. Anelli, Amuleti e Vessilli rispettano questo filtro; i pezzi d'armatura lo ignorano, quindi `Qualsiasi` mantiene le armature sicure.
- Slot: concentrare la regola su pezzi precisi (Armi, Stivali, ecc.) per evitare corrispondenze fuori slot. Lascialo vuoto per coprire ogni slot.
- Set e Metaset: filtra la regola a set specifici o a Metaset nominati così solo quelle collezioni passano. Lascialo vuoto per accettare tutti i set.
- Riga Stat principale: richiedi determinate statistiche principali.
  - Seleziona più voci per accettare una qualsiasi tra esse. Lasciala vuota per permettere ogni statistica principale.
  - Scegliere più statistiche principali genera una regola per ciascuna così restano esplicite nell'esportazione.
- Riga Sotto-stat: indica quali sotto-stat contano.
  - Clicca per attivare o disattivare una sotto-stat. Le sotto-stat bloccate compaiono sempre nelle righe generate.
  - Usa il badge con lucchetto (🔒) accanto all’etichetta per renderla obbligatoria; il clic destro apre le azioni rapide per bloccare/sbloccare e gestire i roll.
  - `Qualsiasi` è un collegamento per tornare alle "nessuna restrizione". Se selezioni sotto-stat specifiche, `Qualsiasi` si disattiva automaticamente.
  - Il totale di sotto-stat per riga è `max(conteggio richiesto, conteggio bloccato)` con un massimo di quattro, quindi bloccare una statistica le riserva sempre uno slot.
- Interruttore Flex: se hai più scelte facoltative del conteggio richiesto, Flex ruota quelle extra nelle righe così ogni combinazione valida viene coperta senza esplodere il numero di righe.
- Obiettivi di roll (Base/+1…+5): Fai clic destro su una sotto-stat selezionata per aprire la griglia degli obiettivi di roll. Base indica il valore a +0 e ogni campo +N rappresenta il valore dopo quel numero di roll aggiuntivi. Lascia un campo vuoto per riutilizzare i tuoi Obiettivi di substat oppure premi «Usa gli obiettivi globali di substat» per azzerarlo. Le etichette dell’anteprima si aggiornano subito così puoi verificare i numeri prima dell’export.
- Roll minimi (sommatoria Σ): il minimo richiesto si applica alla somma dei roll sulle sotto-stat selezionate entro il livello obiettivo.
- Roll minimi bloccati (🔒) appare quando blocchi almeno una sotto-stat. Clicca un numero nella riga del lucchetto per riservare quel conteggio di roll alle statistiche bloccate; il resto del builder continua a seguire il minimo globale. Se il valore bloccato eguaglia o supera il numero globale evidenziato, il badge globale si spegne così la soglia del lucchetto diventa l'unico vincolo aggregato. Sbloccare la sotto-stat (o toccare Auto) cancella entrambi; scegliere un numero globale più piccolo riaccende il badge globale accanto al lucchetto così capisci quale soglia si applica a ciascuna statistica.
- Esempio: blocca SPD e CR%, imposta Roll minimi = 3 e poi imposta la riga 🔒 a 2. Il builder ora richiede 3 roll totali sulle sotto-stat selezionate, almeno 2 dei quali devono cadere sulle SPD/CR% bloccate. Portare il lucchetto a 3 spegne automaticamente il badge globale perché i due valori coinciderebbero.
- Jolly con Minimo richiesto (somma roll): con sole sotto-stat stellate (★) e Minimo richiesto > 0, Anticipato mostra solo le ripartizioni minime a ogni traguardo (liste corte e stabili). Tardivo ripete le stesse ripartizioni minime ai traguardi iniziali e di nuovo a +16.
- Mitica (5 roll): la rarità Mitica può raggiungere 5 roll su una sotto-stat a +16 (contro 4 delle altre). Quando la tua selezione di Rarità include Mitica, il generatore considera il pre-roll. Con Rarità = Qualsiasi, impostare Minimo richiesto a 5 (o minimi per statistica che sommano a 5) viene trattato come compatibile con Mitica e considera anche un pre-roll a +0.

### Obiettivi di substat
- Apri la finestra tramite «Obiettivi di substat…» nell’angolo in alto a destra del builder.
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

### Mantieni unici
- Porta il builder in modalità **Salvaguardie** usando il pulsante di alternanza sopra il pannello builder per segnare le combinazioni che non vuoi vendere mai. Attiva `Mantieni unici` per permettere allo scanner di aggiungere righe di mantenimento (le modifiche lo attivano automaticamente).
- Le regole “Mantieni unici” non “consumano” gli oggetti—ogni regola valuta lo stesso pool di candidati. Se un pezzo corrisponde a più regole, conta per tutte.
- Ogni regola ti permette di scegliere slot, set o Metaset, ranghi, rarità, statistiche principali e (per gli accessori) fazioni. Lasciare un selettore vuoto significa «qualsiasi».
- La `Modalità` decide come viene emessa la regola: `Disattiva` la spegne, `Proteggi esistenti` aggiunge righe di mantenimento per le corrispondenze che verrebbero vendute finché la quota non è raggiunta, e `Anticipa lacune` aggiunge regole segnaposto per le combinazioni mancanti così i nuovi drop restano protetti finché il DB non viene aggiornato.
- I substat sono opzionali: scegli uno o più per contare solo gli oggetti che hanno quei substat. La chip di corrispondenza (`Qualsiasi Substat` / `Tutte le Substat` / `Per Substat`) decide se basta uno, se devono esserci tutti o se ogni substat ha la propria quota. Lasciare vuoto significa: nessun filtro substat.
- I substat selezionati sono sempre classificati con il punteggio normalizzato (glifi ignorati); i pesi compaiono con `Qualsiasi Substat` e `Tutte le Substat`, `Per Substat` mantiene la ponderazione uguale (i pareggi al limite restano protetti).
- `≥ Quantità richiesta` vive accanto alle chip di ambito: «Per regola» mantiene una quota unica; combina liberamente `Per slot`, `Per set`, `Per fazione` e `Per statistica principale` per moltiplicare la quota per ogni combinazione rilevante (se li disattivi tutti si torna automaticamente a «Per regola»).
- Il tooltip di `Quantità richiesta` mostra la suddivisione attiva degli ambiti (`X per slot × per set × ...`) e una semplice riga dei mancanti (`({missing} mancanti)`).
- Usa il selettore `Filtro: Tutti / Selezione` sopra la griglia per passare da tutta la tua attrezzatura unica solo agli oggetti che corrispondono alla regola evidenziata; Selezione si comporta come Tutti finché nessuna regola è selezionata.
- Lo scanner aggiunge righe di mantenimento solo per gli oggetti che verrebbero venduti e solo quando la quota non è soddisfatta. In `Anticipa lacune`, aggiunge anche regole segnaposto per combinazioni mancanti.

#### Ambiti della quota in breve

| Pulsante di ambito | Comportamento della quota | Quando è utile |
| --- | --- | --- |
| `Per regola` | Un unico pool condiviso per l’intera regola. | Mantiene cinque stivali SPD indipendentemente dal set. |
| `Per slot` | Duplica la quota per ogni slot. | Mantiene due anelli, due amuleti e due vessilli separatamente. |
| `Per set` | Duplica la quota per ogni set/metaset sulla scheda. | Tiene distinti due drop Stoneskin e due Protection. |
| `Per fazione` | Duplica la quota per ogni fazione. | Garantisce tre anelli Merciless per ogni fazione. |
| `Per statistica principale` | Duplica la quota per ogni statistica principale selezionata. | Divide i pool per vessilli ACC e RES. |

#### Esempi concreti

| Scenario | Filtri | Quantità richiesta | Chip di ambito | Cosa garantisce lo scanner |
| --- | --- | --- | --- | --- |
| Scarpe SPD in esaurimento | Slot = Stivali, Stat principale = SPD, Set vuoti | `5` | `Per regola` | Sopravvivono almeno cinque stivali SPD indipendentemente dal set. |
| Mischiare guanti Savage + Lethal | Slot = Guanti, Set = Savage + Lethal, Stat principale = CDMG% | `3` | `Per regola` | Conserva tre guanti ad alto danno anche se la miscela di set cambia. |
| Anelli Merciless per fazione | Slot = Anello, Set = Merciless, Fazione vuota | `3` | `Per fazione` | Ogni fazione conserva tre dei propri anelli Merciless. |
| Anelli HP% per fazione | Slot = Anello, Stat principale = HP%, Set vuoti | `2` | `Per fazione` | Assicura due anelli HP% per ogni fazione. |
| Accessori base per fazione | Tre regole (Anello, Amuleto, Vessillo), Set e Stat principale vuoti | `5` | `Per fazione` | Ogni fazione mantiene cinque anelli, amuleti e vessilli. |
| Stoneskin + Protection per fazione | Slot = Anello/Amuleto/Vessillo, Set = Stoneskin + Protection, Stat principale vuota | `2` | `Per set` + `Per fazione` + `Per slot` | Ogni fazione tiene due drop Stoneskin e due Protection per ogni slot accessorio. |
| Accessori SPD più veloci | Slot = Anello/Amuleto/Vessillo, Substat = SPD | `5` | `Per regola` | Conserva i cinque migliori roll SPD sugli accessori (inclusi i pareggi). |
| Vessilli ACC con SPD | Slot = Vessillo, Stat principale = ACC, Substat = SPD + ACC, Pesi: SPD più alto | `3` | `Per fazione` | Ogni fazione tiene i migliori vessilli ACC dove SPD conta di più. |

Suggerimento: importa il tuo `.db` o incolla equipaggiamento nel dialogo Equipaggiamento prima di passare alla modalità Salvaguardie, così lo scanner analizza oggetti reali. Clicca una scheda regola per evidenziare le corrispondenze; imposta `Filtro` su `Selezione` per vedere solo quelle.

### Drop dei dungeon (Simulatore)
Apri "Strumenti" e passa a **Drop dei dungeon**. Simula il farming dei dungeon con le tue regole Sellfile attuali per vedere quanto equipaggiamento manterresti per set e livello di potenziamento.

- Scegli un dungeon e una fase.
- Modalità di simulazione:
  - `Livellamento`: i roll si fermano appena l'oggetto verrebbe venduto, quindi rispecchia il livellamento reale.
  - `Istantanea`: i roll arrivano sempre fino a +16, anche se l'oggetto sarebbe stato venduto prima.
- La tabella mostra i drop tenuti divisi per tutti i drop di quella fase a +0 / +4 / +8 / +12 / +16.
- Clicca una cella per il dettaglio slot + statistica principale, poi apri **Probabilità di sotto-stat specifiche** per le chance esatte e le stime di esecuzioni.

Note:
- Usa le tue regole attuali di Mantieni/Vendi, incluso Vendita finale e Mantieni unici.
- Circa 100.000 drop per fase e si aggiorna mentre gira.
- Tassi di drop e roll sono simulati, quindi i numeri sono stime.

### Gestione delle ricette
- Elenco ricette salvate: ogni ricetta appare come un'etichetta sotto il builder. Usa l'elenco per selezionare (clic sinistro), duplicare, riordinare o eliminare (con conferma). "Elimina ricette" rimuove tutte (con conferma).
- Collegamenti al passaggio del mouse: passando il mouse su una ricetta evidenzi tutte le righe correlate nell'Anteprima Sellfile. Passando su una riga dell'Anteprima Sellfile si evidenzia la ricetta salvata corrispondente.
- Collegamenti al clic: cliccando una riga dell'Anteprima Sellfile selezioni la ricetta salvata (e la carichi nel builder). Le righe provenienti dal `.hsf` di base non cambiano la selezione corrente.
- Menu contestuali: sulle ricette salvate (Duplica/Sposta/Copia/Elimina) e sull'area delle ricette salvate (Copia tutto, Incolla).
- Copia di backup: se l'accesso agli appunti è bloccato, si apre una finestra con il contenuto già selezionato — premi Ctrl/Cmd+C per copiarlo oppure incollalo nella finestra Incolla.

### Anteprima Sellfile (Regole e Ispettore Equipaggiamento)
- L'intestazione dell'anteprima tiene insieme l'interruttore `Rules`/`Ispettore Equipaggiamento`, il pulsante “Strumenti” e il pulsante “Load RSL Helper Sellfile”, così sai sempre dove cambiare tabella o aprire il dialogo Equipaggiamento.
- Vista `Rules` (predefinita): mostra tutte le regole che verranno esportate, incluse le righe del `.hsf` base opzionale. I contatori rimangono su Mantieni vs Vendi, la riga dei filtri conserva i chip Qualsiasi/Solo per Slot/Rango/Rarità/Livello e ora offre entrambi i pulsanti Ricette in parallelo: `Restringi` decide se nascondere i chip fuori dai filtri correnti, mentre la `Selezione` funziona come un interruttore On/Off che limita le righe del Sellfile ai chip selezionati (e mantiene pronta la stessa selezione per l'Ispettore Equipaggiamento).
- Vista `Ispettore Equipaggiamento`: ribalta la tabella sulla lista importata così puoi scorrere gli import senza riaprire Strumenti. I contatori/indicatori passano a `Matched` vs `No Match` (più il riepilogo Mantieni/Vendi) secondo la regola “vince la prima ricetta corrispondente”, e la riga dei filtri mantiene entrambi i pulsanti Ricette (`Restringi` + `Selezione`). Il primo continua a governare la visibilità dei chip, mentre la `Selezione` applica il tri-stato (`Off` → `Prima` → `Per corrispondenza`) per isolare le righe dell'Ispettore Equipaggiamento e continua a limitare le righe del Sellfile alla tua selezione quando torni su `Rules`. Si aggiunge anche il filtro sugli esiti (Mantieni/Vendi vs `Matched`/`No Match`), così puoi isolare gli oggetti colpiti per primi (o ovunque) dalla tua selezione senza nascondere i chip. Importare un `.db` commuta automaticamente su questa vista, ma puoi tornare alle Regole in qualsiasi momento.
- Il pulsante “Load RSL Helper Sellfile” si comporta esattamente come il drag & drop: `.sfr` sostituisce lo stato del builder, `.hsf` si sovrappone come Sellfile base opzionale e `.db` accodano gli oggetti nell'Ispettore Equipaggiamento senza toccare il builder. Il pulsante “Svuota” scollega il `.hsf` base opzionale.
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
- Importa il database dell'equipaggiamento di RSL Helper trascinando file `.db` sull'app oppure usando il pulsante "Load RSL Helper Sellfile" (stesso comportamento). Questi import accodano migliaia di artefatti (più gli oggetti dell'inbox), commutano l'anteprima sull'Ispettore Equipaggiamento e lasciano invariati builder ed esportazione.
- Ogni riga dell'Ispettore Equipaggiamento mostra slot, set, livello, statistica principale, sotto-stat (con glifi e roll), provenienza (inventario vs inbox) e i chip Mantieni/Vendi + la prima ricetta/regola che ha fatto match. Le regole disattivate non corrispondono mai, quindi le righe "No match" rappresentano equipaggiamento che il Sellfile lascerebbe stare.
- I contatori dell'intestazione mostrano i totali `Matched` vs `No Match` più la ripartizione Mantieni/Vendi. Combinali con i filtri dell'Ispettore Equipaggiamento (esito + Matched/No Match + `Ricette dell'Ispettore Equipaggiamento` impostato su `Off`/`Prima`/`Per corrispondenza`) per concentrarti sui casi limite prima di esportare.
- Usa l'interruttore dell'anteprima per passare tra la tabella Regole e l'Ispettore Equipaggiamento senza riaprire Strumenti — perfetto per confrontare le righe generate con gli oggetti che le attivano.

### Esportazione
- Clicca "Esporta Sellfile di RSL Helper unito" (o "Esporta Sellfile di RSL Helper" quando non è caricato alcun file base).
- Usa "Salva ricette" e "Carica ricette" nella sezione Aggiungi regole per conservare e riutilizzare il tuo lavoro.
- Il nome file esportato usa il formato predefinito `Sellfile_AAAAmmGG_HHMM.hsf`.

## Esempi

Gli esempi seguenti assumono obiettivi di substat 6★ (unità per roll): SPD=5, CR%=5, CDMG%=5.

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
