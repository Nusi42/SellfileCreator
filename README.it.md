# Creatore di Sellfile per RSL Helper

Crea, visualizza in anteprima ed esporta regole di vendita per RSL Helper tramite un'interfaccia semplice.

> Strumento indipendente creato dai fan. Non è affiliato con Plarium, Raid: Shadow Legends o RSL Helper. I marchi appartengono ai rispettivi proprietari.

## Funzionalità
- Crea regole e salvale: costruisci configurazioni e mantieni una libreria da riutilizzare.
- Interruttore Anteprima Sellfile: passa dalla tabella Regole alla tabella dell'equipaggiamento del Rule Tester direttamente dall'intestazione. I contatori/gli indicatori di esito si adattano (Mantieni/Vendi per le regole, `Matched`/`No Match` per il tester) e i filtri seguono la tabella scelta.
- Drag & drop o pulsante Carica: rilascia `.hsfc`, `.hsf` o `.db` ovunque (l'overlay conferma) oppure clicca "Load RSL Helper Sellfile". Entrambe le opzioni si comportano allo stesso modo: `.hsfc` sostituisce il builder, `.hsf` si affianca come Sellfile base opzionale e i dump `.db` finiscono direttamente nella coda del Rule Tester senza toccare il builder.
- Metaset: assegna un nome a gruppi di set (es. Velocità + Percezione) e riutilizzali nelle regole.
- Esporta con un clic: esporta un file HSF (il Sellfile di RSL Helper) pronto per RSL Helper.
- Anteprima Rule Tester + dialogo "Equipaggiamento...": crea equipaggiamento di esempio, incolla righe oppure trascina il database di RSL Helper (di solito `%APPDATA%\RslHelper\Config`) nel dialog per vedere quale regola si applica per prima e se l'oggetto viene mantenuto o venduto. Poi lascia chiuso il dialogo e usa l'interruttore dell'anteprima per tenere visibili quelle righe mentre confronti i risultati con le tue regole.

## Come si usa

### File di configurazioni
- HSFC (`.hsfc`): il file di progetto per questa app. È come un salvataggio che puoi caricare o condividere. RSL Helper non usa direttamente gli HSFC.
- HSF (`.hsf`): il Sellfile per RSL Helper. Esportalo da questa app e poi caricalo in RSL Helper.
- Il nome file salvato usa il formato predefinito `SellfileCreatorRules_AAAAmmGG_HHMM.hsfc`.

### Generatore di configurazioni
- Compila il Generatore di configurazioni e assegna un "Nome configurazione" chiaro.
- Clicca "Aggiungi come nuova configurazione" per salvarla; quindi seleziona la configurazione salvata nell'elenco sotto il builder per modificarla e premi "Aggiorna configurazione selezionata".
- Carica/Salva: usa "Carica configurazioni" e "Salva configurazioni" per riutilizzare le tue regole personalizzate. Queste azioni salvano tutto ciò che serve per ricostruire l'anteprima dentro un file di configurazioni.
- Nota: clicca "Aggiungi nota…" (o "Modifica nota…") per allegare una nota al tuo file di configurazioni. La nota viene mostrata automaticamente dopo aver caricato un file di configurazioni che la contiene. Usa `<!-- configs:1,0 -->` per inserire i chip delle configurazioni desiderate (0 prende quella successiva). Usa `<!-- configs-re:"speed" -->` per mostrare tutte le configurazioni con un nome che corrisponde al pattern (ignorando maiuscole/minuscole).

### Struttura del builder (dall'alto verso il basso)
- Azione e attivazione: indica al Sellfile cosa fare quando un oggetto corrisponde alla configurazione.
  - `Mantieni` contrassegna l'equipaggiamento corrispondente come Mantieni così RSL Helper lo ignora.
  - `Vendi` contrassegna l'equipaggiamento corrispondente come Vendi così RSL Helper lo aggiunge alla coda di vendita automatica.
  - L'interruttore "Attiva" decide se le righe di questa configurazione sono attive all'esportazione. Le configurazioni disattivate esportano con Use = false (mostrate barrate nell'anteprima); attiva "Escludi le regole disattivate durante l'esportazione" nel menu di esportazione se vuoi lasciarle fuori.
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
- Jolly con Minimo richiesto (somma roll): con sole sotto-stat stellate (★) e Minimo richiesto > 0, Anticipato mostra solo le ripartizioni minime a ogni traguardo (liste corte e stabili). Tardivo ripete le stesse ripartizioni minime ai traguardi iniziali e di nuovo a +16.
- Mitica (5 roll): la rarità Mitica può raggiungere 5 roll su una sotto-stat a +16 (contro 4 delle altre). Quando la tua selezione di Rarità include Mitica, il generatore considera il pre-roll. Con Rarità = Qualsiasi, impostare Minimo richiesto a 5 (o minimi per statistica che sommano a 5) viene trattato come compatibile con Mitica e considera anche un pre-roll a +0.

### Obiettivi di substat
- Apri la finestra tramite «Obiettivi di substat…» nell’angolo in alto a destra del builder.
- Gli obiettivi sono globali: si applicano a tutte le configurazioni, non solo a quella selezionata.
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
- Interruttore vicino all'esportazione per aggiungere regole Vendi finali per gli oggetti non coperti dalle regole Mantieni. Vendita finale è attiva per impostazione predefinita.
- Configura quale equipaggiamento (Artefatti e/o Accessori) e quali intervalli di livello (0–3, 4–7, 8–11, 12–15, 16). L'impostazione predefinita prende di mira 0–15 per evitare di vendere oggetti a +16.
- Senza Vendita finale gli oggetti che non corrispondono a nessuna regola vengono mantenuti automaticamente da RSL Helper. La vendita avviene solo quando una regola Vendi si attiva.
- Quando Vendita finale è attiva, le regole Vendi generate includono esplicitamente tutti i set conosciuti. Nell'anteprima la colonna Set mostra "Tutti i set attualmente noti" per ridurre il rumore; il file esportato elenca comunque ogni set.

### Gestione delle configurazioni
- Elenco configurazioni salvate: ogni configurazione appare come un'etichetta sotto il builder. Usa l'elenco per selezionare (clic sinistro), duplicare, riordinare o eliminare (con conferma). "Elimina configurazioni" rimuove tutte (con conferma).
- Collegamenti al passaggio del mouse: passando il mouse su una configurazione evidenzi tutte le righe correlate nell'Anteprima Sellfile. Passando su una riga dell'Anteprima Sellfile si evidenzia la configurazione salvata corrispondente.
- Collegamenti al clic: cliccando una riga dell'Anteprima Sellfile selezioni la configurazione salvata (e la carichi nel builder). Le righe provenienti dal `.hsf` di base non cambiano la selezione corrente.
- Menu contestuali: sulle configurazioni salvate (Duplica/Sposta/Copia/Elimina) e sull'area delle configurazioni salvate (Copia tutto, Incolla).
- Copia di backup: se l'accesso agli appunti è bloccato, si apre una finestra con il contenuto già selezionato — premi Ctrl/Cmd+C per copiarlo oppure incollalo nella finestra Incolla.

### Anteprima Sellfile (Regole e Rule Tester)
- L'intestazione dell'anteprima tiene insieme l'interruttore `Rules`/`Rule Tester`, il pulsante "Gear..." e il pulsante "Load RSL Helper Sellfile", così sai sempre dove cambiare tabella o aprire il dialogo del Rule Tester.
- Vista `Rules` (predefinita): mostra tutte le regole che verranno esportate, incluse le righe del `.hsf` base opzionale. I contatori rimangono su Mantieni vs Vendi, la riga dei filtri conserva i chip Qualsiasi/Solo per Slot/Rango/Rarità/Livello e l'interruttore Configs controlla la visibilità dei chip delle configurazioni.
- Vista `Rule Tester`: ribalta la tabella sulla lista degli oggetti del tester così puoi scorrere gli import senza riaprire il dialogo. I contatori/indicatori passano a `Matched` vs `No Match` (più il riepilogo Mantieni/Vendi) in base al primo match, e la riga dei filtri diventa un filtro sugli esiti del tester con il pulsante tri-stato delle configurazioni (`Off` → `First` → `Any`) per isolare gli oggetti il cui primo match appartiene alla tua selezione. Importare un `.db` commuta automaticamente su questa vista, ma puoi tornare alle Regole in qualsiasi momento.
- Il pulsante "Load RSL Helper Sellfile" si comporta esattamente come il drag & drop: `.hsfc` sostituisce lo stato del builder, `.hsf` si sovrappone come Sellfile base opzionale e `.db` accodano gli oggetti nella preview del Rule Tester senza toccare il builder. Il pulsante "Svuota" scollega il `.hsf` base opzionale.
- Usa l'icona della tavolozza per aprire Gestione colori per le etichette delle sotto-stat.
- In vista Regole la tabella mantiene le colonne "N." e "Cfg" (vuota per le righe del file base). In vista Rule Tester nello stesso spazio vedi slot/set, statistiche dell'oggetto e il badge della prima configurazione corrispondente per capire subito cosa accadrà a ogni artefatto.

### Controlli dell'Anteprima Sellfile
- Gestisci colori: clicca l'icona della tavolozza sopra la tabella per personalizzare colori di testo/sfondo delle etichette delle sotto-stat. Usa "Ripristina predefiniti" nella finestra per tornare ai colori consigliati.
- Filtri: in vista Regole hai i chip Qualsiasi/Solo per Slot/Rango/Rarità/Livello più l'interruttore Configs che mostra o nasconde i chip delle configurazioni. Passa a Rule Tester e la riga sostituisce quei controlli con un filtro Mantieni/Vendi vs `Matched`/`No Match` e con il pulsante tri-stato delle configurazioni (`Off` → `First` → `Any`) per concentrare la tabella sugli oggetti corrispondenti (o meno) alle configurazioni selezionate. "Reset filtri" riporta il controllo del tester su `Off`.
- Menu delle colonne: clic destro sull'intestazione della tabella per aprire i controlli:
  - Ripristina colonne: ripristina colonne e larghezze predefinite.
  - Adatta automaticamente: adatta le colonne alla larghezza della finestra.
  - Consenti righe multi-linea: attiva il ritorno a capo per Sotto-stat e altre.
  - Mostra/Nascondi colonne: caselle per controllare la visibilità di ogni colonna.
- Riordina colonne: trascina un'intestazione verso sinistra/destra.
- Ridimensiona colonne: trascina il bordo destro di un'intestazione.
- Clic: cliccando una riga selezioni la configurazione collegata (senza scorrimento automatico). Cliccando una configurazione salvata la tabella scorre fino alla prima riga corrispondente.

### Anteprima Rule Tester
- Clicca "Gear..." nell'intestazione dell'anteprima per aprire il dialogo del Rule Tester. Crea equipaggiamento di esempio o incolla righe (JSON/testo). Gli oggetti si sincronizzano subito con l'anteprima, quindi chiudere il dialogo non svuota la griglia del tester.
- Importa il database dell'equipaggiamento di RSL Helper trascinando file `.db` sull'app oppure usando il pulsante "Load RSL Helper Sellfile" (stesso comportamento). Questi import accodano migliaia di artefatti (più gli oggetti dell'inbox), commutano l'anteprima sulla tabella del tester e lasciano invariati builder ed esportazione.
- Ogni riga del tester mostra slot, set, livello, statistica principale, sotto-stat (con glifi e roll), provenienza (inventario vs inbox) e i chip Mantieni/Vendi + la prima configurazione/regola che ha fatto match. Le regole disattivate non corrispondono mai, quindi le righe "No match" rappresentano equipaggiamento che il Sellfile lascerebbe stare.
- I contatori dell'intestazione mostrano i totali `Matched` vs `No Match` più la ripartizione Mantieni/Vendi. Combinali con i filtri del tester (esito + Matched/No Match + Config `First`/`Any`) per concentrarti sui casi limite prima di esportare.
- Usa l'interruttore dell'anteprima per passare tra le tabelle Regole e Rule Tester senza riaprire il dialogo — perfetto per confrontare le righe generate con gli oggetti che le attivano.

### Esportazione
- Clicca "Esporta Sellfile di RSL Helper unito" (o "Esporta Sellfile di RSL Helper" quando non è caricato alcun file base).
- Usa "Salva configurazioni" e "Carica configurazioni" nella sezione Aggiungi regole per conservare e riutilizzare il tuo lavoro.
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
- Monitora il DB di RSL Helper: esegui `scripts/run-sample-server.ps1 -WatchGearDb` (o specifica `-GearDbPath <file>`) per osservare `%APPDATA%\\RslHelper\\Config`. Ogni modifica della `.db` viene inviata al Rule Tester avviato dallo script e, se sono presenti più database, il tool ti chiede quale seguire.
- Avvio rapido: `Stream-Helper-DB-to-Creator.bat` lancia il server di esempio in PowerShell con `-WatchGearDb -GearDbPath "%APPDATA%\\RslHelper\\Config"` così puoi trasmettere il database predefinito di RSL Helper senza usare la console; aggiungi eventuali flag dopo il nome del `.bat` per personalizzare l’esecuzione.

## Ringraziamenti

Molte grazie a **[STBL] Nasgor** per i suoi contributi inestimabili,  
a **[SP] Panda** per i suoi Sellfile,  
a **[IPЯ] KruYseN** per i suoi video di pulizia dell'equipaggiamento,  
e naturalmente a **Farbstoff** per RSL Helper!

## Autore
Creato da [STBL] Nusi㊷  
Localizzazione a cura di Codex

© Nusi㊷ - 2025
