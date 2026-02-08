# RSL Helper Sellfile Creator

Erstelle, prüfe und exportiere Verkaufsregeln für RSL Helper mit einer übersichtlichen Oberfläche.

> Dies ist ein unabhängiges Fan-Projekt. Es besteht keine Verbindung zu Plarium, Raid: Shadow Legends oder RSL Helper. Alle Marken gehören ihren jeweiligen Eigentümern.

## Funktionen
- Regeln erstellen und speichern: Baue Konfigs und behalte eine Bibliothek, die du wiederverwenden kannst.
- Sellfile-Vorschau-Umschalter: Wechsle direkt im Header zwischen der Regel-Tabelle und der Regel Tester-Tabelle. Zähler/Ergebnis-Chips passen sich an (Behalten/Verkaufen für Regeln, Treffer/Kein Treffer für den Tester) und die Filter folgen dem gewählten Modus.
- Drag & Drop oder Laden-Button: Ziehe `.hsfc`, `.hsf` oder `.db` überall in die App (Overlay bestätigt) oder klicke auf „RSL Helper Sellfile laden“. Beide Wege verhalten sich identisch: `.hsfc` ersetzt den Builder, `.hsf` ergänzt eine optionale Basis-Sellfile, `.db` landet direkt in der Regel Tester-Warteschlange ohne deine Konfigs anzurühren.
- Metasets: Benenne Set-Gruppen (z. B. Speed + Wahrnehmung) und nutze sie in mehreren Regeln.
- Export mit einem Klick: Exportiere eine HSF-Datei (die RSL Helper Sellfile), die sofort in RSL Helper geladen werden kann.
- „Logic Hub“-Button: Öffne den Dialog direkt aus dem Vorschau-Header, um `Finaler Verkauf`, `Unikate behalten` und den Dialog „Ausrüstung“ (Logic-Hub-Tab „Ausrüstung“) gemeinsam zu erreichen. Erstelle Beispielgear, füge Zeilen ein oder ziehe `%APPDATA%\\RslHelper\\Config` herüber; danach kannst du den Dialog schließen und die Vorschau auf der gewünschten Tabelle lassen — die Tester-Warteschlange bleibt sichtbar.
- Tab „Unikate behalten“: Definiere Kombinationen, die du nie verlieren willst. Sobald deine Konfigs plus deine aktuell aktiven Verkaufsregeln jedes Exemplar dieser Kombination löschen würden, generiert der Scanner automatisch passende Behalte-Regeln.

## Nutzung

### Konfigs-Datei
- HSFC (`.hsfc`): Das Projektfile der App. Betrachte es wie einen Spielstand, den du laden oder teilen kannst. RSL Helper verwendet HSFC nicht direkt.
- HSF (`.hsf`): Die RSL Helper Sellfile. Exportiere sie hier und lade sie anschließend in RSL Helper.
- Der Standardname beim Speichern lautet `SellfileCreatorRules_YYYYMMDD_HHMM.hsfc`.

### Konfig-Builder
- Fülle den Konfig-Builder aus und gib deiner Konfig einen eindeutigen „Konfig-Namen“.
- Klicke auf „Als neue Konfig hinzufügen“, um sie zu speichern. Wähle die gespeicherte Konfig in der Liste unter dem Builder aus, um sie zu bearbeiten, und sichere Änderungen mit „Ausgewählte Konfig aktualisieren“.
- Laden/Speichern: Nutze „Konfigs laden“ und „Konfigs speichern“, um deine Regeln erneut zu verwenden. Beide Aktionen enthalten alles, was nötig ist, um die Vorschau exakt wiederherzustellen.
- Reset/Einfügen/Anwenden-Menüs: Rechtsklick auf „Reset“, „Als Konfig einfügen“ oder „Konfig anwenden“ öffnet ein gemeinsames Optionsmenü. Speichere den aktuellen Builder-Zustand als neue Standardvorlage, springe auf die Werkseinstellungen zurück, aktiviere „Auto nach Einfügen zurücksetzen“ (räumt den Builder direkt nach dem Einfügen) oder „Auto auf ausgewählte Konfig anwenden“ (schiebt Änderungen nach ca. 400 ms Inaktivität in die markierte Konfig). Auto-Reset und Auto-Apply schließen sich gegenseitig aus – das Aktivieren des einen schaltet das andere aus – und beide Einstellungen bleiben zwischen Sitzungen erhalten.
- Notiz: Über „Notiz hinzufügen…“ (oder „Notiz bearbeiten…“) kannst du deiner Konfigs-Datei eine Notiz anhängen. Beim Laden einer Konfigs-Datei mit Notiz wird diese automatisch angezeigt. Verwende `<!-- configs:1,0 -->`, um bestimmte Konfig-Chips einzufügen (0 nimmt die nächste Konfig). Mit `<!-- configs-re:"speed" -->` erscheinen alle Konfigs, deren Name dem Muster entspricht (Groß/Kleinschreibung wird ignoriert).
- Autosave-Wiederherstellung: Beim Start listet der Dialog jede gespeicherte Sektion mit eigener Checkbox auf. Lade nur, was du brauchst – Konfigs (inklusive gewähltem Chip), Metasets, Substat-Richtwerte, Final-Sell-Rest, angepinnte Notiz, Filterleiste (Offen/Zu, Chips, eingeklappte Bereiche) und Regel Tester-Importe. Alles, was du abwählst, bleibt unangetastet. Autosave merkt sich außerdem, welche Final-Sell-Schalter (Artefakte, Zubehör sowie die Levelbereiche) aktiv waren, damit der Dialog exakt den Exportzustand von zuletzt widerspiegelt.

### Aufbau des Builders (von oben nach unten)
- Aktion & Aktiviert: Sage dem Sellfile, was passieren soll, sobald ein Gegenstand zur Konfig passt.
  - `Behalten` markiert das Item als Behalten; RSL Helper rührt es nicht an.
  - `Verkaufen` markiert das Item als Verkaufen; RSL Helper stellt es in die Verkaufswarteschlange.
  - Der Schalter „Im Sellfile aktiviert“ entscheidet, ob die erzeugten Zeilen aktiv exportiert werden. Deaktivierte Zeilen werden mit Use = false exportiert (im Preview durchgestrichen); aktiviere im Exportmenü „Deaktivierte Regeln beim Export auslassen“, wenn sie gar nicht im Sellfile landen sollen.
- Rang: Begrenze die Regel auf bestimmte Sternränge, wenn du z. B. 6★ anders als 5★ behandeln möchtest. `Beliebig` lässt alle Ränge zu.
- Level: Wähle Mindest- und Maximal-Level aus den Spielmeilensteinen +0, +4, +8, +12, +16. Zeilen werden nur innerhalb dieses Fensters erzeugt.
- Seltenheit: `Auto` (empfohlen) sucht die niedrigste Seltenheit, mit der deine Vorgaben an den gewählten Leveln möglich bleiben.
  - Keine Mindestrollen oder Summe verlangt? Auto hält die Regel breit, sodass jede Seltenheit passt.
  - 1/2/3/4 Start-Substats gefordert? Auto stellt sicher, dass die Seltenheit mit so vielen Substats starten kann (1→≥ Ungewöhnlich, 2→≥ Selten, 3→≥ Episch, 4→≥ Legendär).
  - Gesamtzahl an Rollen gefordert? Auto wählt die niedrigste Seltenheit, die diese Summe bis +16 erreicht (5 Rollen erfordern Mythisch).
- `Auto ≥`-Chip (unter Meilenstein-Schwellen): hebt die Untergrenze an und fügt bei Late zusätzliche ≥-Zweige bei +4/+8/+12 hinzu.
    - Klickreihenfolge: Ungewöhnlich → Selten → Episch. „Auto ≥ Selten“ schließt Ungewöhnlich aus.
    - Aktiv nur, wenn Seltenheit = Auto und Meilenstein-Schwellen = Spät. Anderenfalls zeigt der Chip einen diagonalen Strich.
    - Beispiel: Banner mit SPD und ATK%, ATK% braucht 2 Rollen. Seltenheit = Auto, Meilenstein-Schwellen = Spät, Auto ≥ Episch. Ergebnis: Epische Zeilen an jedem Meilenstein plus ≥ Legendär bei +8 und +12, damit seltenere Drops nicht durchs Raster fallen.
  - Vor +16 verwendet der Builder die Substat-Anzahl, die die aktuelle Seltenheit tatsächlich tragen kann. Bei +16 gilt deine Zielanzahl.
- Fraktion: Beschränke Zubehör-Regeln auf eine Fraktion, wenn du ein Team gezielt ausstattest. Ringe, Amulette und Banner beachten den Filter; Rüstung ignoriert Fraktionen, daher ist `Beliebig` dort am sichersten.
- Slots: Fokussiere die Regel auf bestimmte Slots (Waffe, Stiefel etc.), damit Off-Slot-Drops nicht matchen. Leer lassen = alle Slots.
- Sets & Metasets: Filtere auf explizite Sets oder benannte Metasets, wenn nur bestimmte Kombinationen zugelassen sein sollen. Leer lassen = alle Sets.
- Mainstats: Bestimme, welche Mainstats zulässig sind.
  - Mehrfachauswahl erlaubt; keine Auswahl = jedes Mainstat ist gültig.
  - Mehrere Mainstats erzeugen jeweils eigene Zeilen, damit sie im Export eindeutig bleiben.
- Substats: Bestimme, welche Substats relevant sind.
  - Klick zum Ein-/Ausschalten. Gesperrte Substats erscheinen immer in den erzeugten Regeln.
  - Über das Schloss-Badge (🔒) neben dem Label machst du den Stat verpflichtend; Rechtsklick öffnet die Schnellaktionen für Sperren/Entsperren und Roll-Ziele.
- `Beliebig` setzt die Auswahl zurück und bedeutet „keine Einschränkung“. Sobald du konkrete Substats wählst, wird `Beliebig` deaktiviert.
  - Pro Zeile gilt `max(Erforderlich, Anzahl gesperrt)`, höchstens vier Substats. Ein gesperrter Stat reserviert also immer einen Platz.
- Flex-Schalter: Mit mehr optionalen Picks als Pflichtanzahl rotiert Flex diese Extras durch alle Permutationen, damit jede gültige Mischung entsteht. Gesperrte Substats bleiben fix. Gibt es nichts zu rotieren, deaktiviert sich Flex automatisch.
- Roll-Anzeige: Jeder ausgewählte Substat zeigt einen Kreis für Upgrade-Rollen.
  - Linksklick erhöht Erwartungen; Rechtsklick verringert sie.
- Vom Zustand ★ aus: Links schaltet auf grüne Mindestrollen (0→1→…→5), Rechts auf rote Roll-Obergrenzen (0→1→…→4).
- Bei einer Roll-Obergrenze senkt Links den Grenzwert (1→0→★), Rechts erhöht ihn (0→1→…→4→★). Mindestwert und Obergrenze schließen sich gegenseitig aus.
- Roll-Richtwerte (Basis/+1…+5): Rechtsklick auf einen ausgewählten Substat öffnet das Raster für Roll-Richtwerte. „Basis“ steht für den Wert bei +0, jedes +N-Feld übernimmt den Wert nach so vielen zusätzlichen Rollen. Lass Felder leer, um deine Substat-Richtwerte zu verwenden, oder klicke auf „Globale Substat-Richtwerte verwenden“, um sie zu löschen. Die Vorschau-Chips aktualisieren sich sofort, damit du die Zahlen vor dem Export prüfen kannst.
- Erforderliche Substats: Lege fest, wie viele deiner ausgewählten Substats das Item besitzen muss, damit die Regel greift.
  - `Auto` hält die Anzahl synchron zur Auswahl (bis maximal vier).
  - Gesperrte Substats (🔒) zählen immer toward the requirement. Warnhinweise erscheinen, wenn die Auswahl unmöglich ist.
- Mindest-Rollen (global): Lege fest, wie viele Rollen sich deine ausgewählten oder gesperrten Substats insgesamt teilen müssen. `0` überspringt die Aggregatsprüfung. `Auto` hält den Wert synchron zur Anzahl deiner erforderlichen Substats (sobald mindestens zwei verfolgt werden) und begrenzt ihn auf das, was die aktuelle Seltenheit tatsächlich rollen kann; Einzelstat-Konfigs bleiben bei 0. Früh listet weiterhin nur Aufteilungen, die dein Ziel bis +16 noch schaffen können.
- Gesperrte Mindest-Rollen (🔒) erscheinen, sobald mindestens ein Substat gesperrt ist. Klicke eine Zahl in der Schloss-Zeile, um Rollen speziell für die gesperrten Stats zu reservieren; der Rest folgt weiterhin dem globalen Minimum. Erreicht oder übertrifft das Schloss den global markierten Wert, blendet sich das globale Badge aus und das Schloss bleibt als einzige Untergrenze übrig. Entsperrst du den Stat (oder stellst auf Auto zurück), verschwinden beide Badges; ein kleineres globales Minimum lässt beide Anzeigen parallel aufleuchten, damit klar bleibt, welche Untergrenze für welche Stats gilt.
- Beispiel: Sperre SPD und CR%, setze Mindest-Rollen (global) = 3 und danach die 🔒-Zeile auf 2. Der Builder verlangt jetzt insgesamt 3 Rollen über alle ausgewählten Substats, mindestens 2 davon auf den gesperrten SPD/CR%-Picks. Schloss = 3 blendet das globale Badge aus, weil beide Untergrenzen identisch wären.
- Meilenstein-Schwellen: Lege fest, wie pro-Stat-Mindestwerte vor +16 wirken, sobald du Mindestrollen verlangst.
  - `Früh` verfolgt, welche Rollen du an jedem Meilenstein bereits hast.
  - `Spät` fordert nur, was jetzt schon vorhanden sein muss, damit das +16-Ziel erreichbar bleibt.
  - Das Umschalten ist nur relevant, wenn mindestens ein Substat Min > 0 hat oder das globale Minimum > 0 liegt.

### Stufen & Rolls: Kurzübersicht
- Früh-Schwellen: Sobald deine Anforderungen erfüllbar sind, fallen die Zeilen auf deine Substat-Richtwerte und bleiben stabil. Vorher zeigt Früh nur Kombinationen, die unterwegs funktionieren.
- Summe der Rollen (Σ): Mindest-Rollen beziehen sich auf die Gesamtzahl der Rollen über alle ausgewählten Substats zum Ziel-Level.
- Wildcards mit Mindest-Summe: Mit ausschließlich ★-Substats und Mindest-Rollen > 0 zeigt Früh nur die minimalen Aufteilungen je Meilenstein. Spät wiederholt diese Aufteilungen bei den frühen Meilensteinen und erneut bei +16.
- Mythisch (5 Rollen): Mythische Seltenheit kann bis +16 fünf Rollen auf einen Substat bringen (sonst max. vier). Sobald Mythos erlaubt ist, berücksichtigt der Generator den zusätzlichen Start-Roll.

### Substat-Richtwerte
- Öffne das Dialogfeld über „Substat-Richtwerte…“ in der oberen rechten Ecke des Builders.
- Die Richtwerte gelten global für alle Konfigs.
- Sie bestimmen die Schwellen für die Levelbereiche (0–3, 4–7, 8–11, 12–15, 16) und dienen als Fallback im Roll-Richtwerte-Raster.
- „Auf Standard zurücksetzen“ stellt die empfohlenen Richtwerte wieder her.

### Metasets
- Klicke auf „Metasets verwalten…“, um das Dialogfeld zu öffnen.
- Erstelle oder benenne Metasets und wähle, welche Sets sie enthalten. Die Ansicht nutzt dieselbe Suche wie der Sets-Picker.
- Startmetasets sind enthalten und können jederzeit angepasst oder gelöscht werden.
- „Auf Standard zurücksetzen“ bietet sichere Optionen, wenn Metasets verwendet werden (löschen, mit expliziten Sets ersetzen oder durch anderes Metaset ersetzen).

### Finaler Verkauf
- Nutze den Schalter `Finaler Verkauf` im Vorschau-Header, um abschließende Verkaufsregeln für übrig gebliebene Items zu aktivieren. Die Beschriftung bleibt gleich: Ein orangefarbener Hintergrund bedeutet aktiv, die neutrale Umrandung bedeutet aus.
- Klicke auf „Logic Hub“ neben dem Schalter, um den Tab `Finaler Verkauf` zu öffnen und festzulegen, ob Artefakte, Schmuckstücke und welche Stufenbereiche (0–3, 4–7, 8–11, 12–15, 16) gelten. Standardmäßig bleibt `+16` aus, damit voll gelevelte Teile geschützt bleiben.
- Ohne `Finaler Verkauf` behält RSL Helper alle Items, die keine Regel treffen. Verkauft wird nur, wenn eine Sell-Regel greift.
- Bei aktivem `Finaler Verkauf` umfassen die erzeugten Sell-Regeln alle bekannten Sets. In der Vorschau steht „Alle bekannten Sets“, der Export listet trotzdem jedes Set einzeln.

### Unikate behalten
- Klicke im Vorschau-Header auf „Logic Hub“ und wechsle zur Registerkarte `Unikate behalten`, um Kombinationen zu markieren, die niemals verloren gehen sollen. Aktiviere `Unikate behalten`, damit der Scanner Behalte-Zeilen hinzufügen kann (Bearbeitungen schalten es ebenfalls automatisch ein).
- Unikate-behalten-Regeln „verbrauchen“ keine Items – jede Regel bewertet denselben Kandidatenpool. Wenn ein Teil mehreren Regeln entspricht, zählt es für alle.
- Jede Behalte-Regel lässt dich Slot, Sets oder Metasets, Ränge, Seltenheiten, Mainstats und (bei Zubehör) Fraktionen festlegen. Leer bedeutet „egal“.
- `Modus` bestimmt, wie die Regel ausgegeben wird: `Aus` deaktiviert sie, `Bestehendes schützen` fügt Behalte-Zeilen für verkaufsgefährdete Treffer hinzu, bis die Quote erreicht ist, und `Lücken vorab sichern` ergänzt Platzhalter-Regeln für fehlende Kombinationen, damit neue Drops geschützt bleiben, bis die DB aktualisiert wurde.
- Substats sind optional: Wähle einen oder mehrere, damit nur Items zählen, die diese Substats haben. Der Match‑Chip (`Beliebige Substat` / `Alle Substats` / `Pro Substat`) bestimmt, ob mindestens eine, alle oder jede ausgewählte Substat ihre eigene Quote bekommt. Leer lassen bedeutet: kein Substat-Filter.
- Ausgewählte Substats werden immer mit der normalisierten Substat-Wertung gerankt (Glyphen ignoriert); Gewichtungen erscheinen bei `Beliebige Substat` und `Alle Substats`, `Pro Substat` bleibt bei der Standardgewichtung (Gleichstände an der Grenze bleiben geschützt).
- `≥ Benötigte Anzahl` definiert das Versprechen, das die App halten soll. Direkt darunter entscheiden Chips für `Pro Slot`, `Pro Set`, `Pro Fraktion` und `Pro Hauptstat`, wie das Kontingent aufgeteilt wird. Sind alle Chips aus, gilt automatisch `Pro Regel` (ein gemeinsamer Pool).
- Der Zähler `Vorhanden {have} / Behalten {keep}` zeigt: **Vorhanden** = passende Items (bei ausgewählten Substats zählen nur Top-Rolls + Gleichstände), **Behalten** = Quote nach Bereichen. Der Chip wird rot, wenn die Quote verfehlt wird.
- Der Scanner fügt nur Behalte-Zeilen für passende Items hinzu, die sonst verkauft würden, und nur wenn die Quote nicht erfüllt ist. Im Modus `Lücken vorab sichern` kommen Platzhalter-Regeln für fehlende Kombinationen dazu.

#### Kontingentbereiche auf einen Blick
Mehrere Bereichs-Chips stapeln die Kontingente. Lass `Pro Regel` aktiv, um einen gemeinsamen Pool zu behalten, und kombiniere `Pro Slot`, `Pro Set`, `Pro Fraktion` und `Pro Hauptstat`, wenn Slot × Set × Fraktion × Hauptstat getrennte Quoten erhalten sollen.

| Bereichs-Schalter | Kontingent-Verhalten | Geeignet für |
| --- | --- | --- |
| `Pro Regel` | Ein gemeinsamer Pool für die komplette Regel. | Mindestens fünf SPD-Stiefel unabhängig vom Set sichern. |
| `Pro Slot` | Dupliziert das Kontingent für jeden Slot. | Je zwei Ringe, Amulette und Banner getrennt behalten. |
| `Pro Set` | Erstellt ein eigenes Kontingent pro Set/Metaset. | Zwei Stoneskin- und zwei Protection-Drops separat verfolgen. |
| `Pro Fraktion` | Gibt jeder Fraktion ihr eigenes Budget. | Drei Merciless-Ringe pro Fraktion garantieren. |
| `Pro Hauptstat` | Splittet das Kontingent pro Hauptstat. | ACC- und RES-Banner unabhängig voreinander halten. |

#### Praxisbeispiele

| Szenario | Filter | Benötigte Anzahl | Bereiche | Was der Scanner garantiert |
| --- | --- | --- | --- | --- |
| SPD-Stiefel gehen aus | Slot = Stiefel, Mainstat = SPD, Sets leer | `5` | `Pro Regel` | Mindestens fünf SPD-Stiefel bleiben übrig, egal welches Set. |
| Savage + Lethal mischen | Slot = Handschuhe, Sets = Savage + Lethal, Mainstat = CDMG% | `3` | `Pro Regel` | Drei High-Damage-Handschuhe überleben auch bei wechselnder Set-Mischung. |
| Merciless-Ringe pro Fraktion | Slot = Ring, Set = Merciless, Fraktion leer | `3` | `Pro Fraktion` | Jede Fraktion behält drei eigene Merciless-Ringe. |
| HP%-Ringe pro Fraktion | Slot = Ring, Mainstat = HP%, Sets leer | `2` | `Pro Fraktion` | Zwei HP%-Ringe pro Fraktion bleiben im Inventar. |
| Kernzubehör pro Fraktion | Drei Regeln (Ring, Amulett, Banner), Sets/Main leer | `5` | `Pro Fraktion` | Fünf Ringe, Amulette und Banner bestehen pro Fraktion. |
| Stoneskin + Protection pro Fraktion | Slot = Ring/Amulett/Banner, Sets = Stoneskin + Protection, Mainstat leer | `2` | `Pro Set` + `Pro Fraktion` + `Pro Slot` | Jede Fraktion behält zwei Stoneskin- und zwei Protection-Drops pro Zubehör-Slot. |
| Schnellste SPD-Zubehörteile | Slot = Ring/Amulett/Banner, Substats = SPD | `5` | `Pro Regel` | Behält die besten fünf SPD-Substat-Rolls über dein Zubehör hinweg (inkl. Gleichstände). |
| ACC-Banner mit SPD-Rolls | Slot = Banner, Mainstat = ACC, Substats = SPD + ACC, Gewichte: SPD höher | `3` | `Pro Fraktion` | Jede Fraktion behält die besten ACC-Banner, bei denen SPD besonders zählt. |

Tipp: Importiere deine `.db` oder füge Items im Dialog „Ausrüstung” ein, bevor du die Registerkarte „Unikate behalten“ öffnest, damit der Scanner echte Ausrüstung bewertet. Klicke eine Regelkarte an, um passende Ausrüstung hervorzuheben; stelle `Filter` auf `Auswahl`, um nur diese Treffer zu sehen.

### Konfigs verwalten
- Gespeicherte Konfigs erscheinen als Chips unter dem Builder. Linksklick wählt sie zum Bearbeiten, Rechtsklick öffnet das Kontextmenü (Duplizieren, Verschieben, Kopieren, Löschen). „Delete Konfigs“ entfernt alle Konfigs (mit Sicherheitsabfrage).
- Hover-Verknüpfung: Über einer Konfig schweben markiert alle zugehörigen Zeilen in der Sellfile-Vorschau und umgekehrt.
- Klick-Verknüpfung: Klick auf eine Tabellenzeile wählt automatisch die Konfig aus, von der sie stammt (Basis-HSF-Zeilen bleiben unberührt).
- Zwischenablagen-Fallback: Wenn das Kopieren per API blockiert ist, öffnet ein Dialog mit vorausgewähltem Text zum manuellen Kopieren.

### Sellfile-Vorschau (Regeln & Regel Tester)
- Der Header bündelt den `Regeln`/`Regel Tester`-Schalter, den Button „Ausrüstung...” und „RSL Helper Sellfile laden“, damit du sofort siehst, wo du die Tabelle wechselst oder den Dialog „Ausrüstung” (Logic Hub → Tab „Ausrüstung”) öffnest.
- Ansicht `Regeln` (Standard): zeigt alle exportierten Regeln inklusive optionaler Basis-`.hsf`-Zeilen. Die Header-Zähler bleiben bei Behalten vs. Verkaufen, die Filterleiste behält die Beliebig/Nur-Chips (`Any/Only`) für Slot/Rang/Seltenheit/Level und beide Konfig-Buttons sind immer sichtbar: „Vorschau-Konfigs“ blendet Chips aus, deren Regeln den aktuellen Filter nicht bestehen, und der „Konfig-Filter“ ist hier ein einfacher An/Aus-Schalter, der Sellfile-Zeilen außerhalb deiner ausgewählten Konfig-Chips versteckt (und dabei den Filterzustand für den Tester vormerkt).
- Ansicht `Regel Tester`: schaltet auf die Liste der importierten Ausrüstung, sodass du externe oder manuell erstellte Items prüfen kannst, ohne den Logic-Hub-Dialog erneut zu öffnen. Zähler wechseln zu „Treffer“ vs. „Kein Treffer“ (plus Behalten/Verkaufen nach der Regel „erste passende Konfig gewinnt“), und die Filterleiste zeigt weiterhin beide Konfig-Buttons nebeneinander: „Vorschau-Konfigs“ für die Chip-Sichtbarkeit sowie den „Konfig-Filter“, der hier als Tri-State (`Off` → `First-Match-Auswertung` → `Beliebig`) arbeitet, um die Ausrüstungszeilen zwischen Ersttreffern und beliebigen Treffern zu trennen, während beim Zurückwechseln weiterhin nur die Regeln deiner Auswahl sichtbar bleiben. `.db`-Importe springen automatisch in diese Ansicht; zurück zu `Regeln` kannst du jederzeit.
- Der Button „RSL Helper Sellfile laden“ macht genau dasselbe wie Drag & Drop: `.hsfc` ersetzt den Builder-Zustand, `.hsf` ergänzt eine optionale Basis-Sellfile, `.db` schieben Ausrüstung direkt in die Regel Tester-Vorschau (ohne deine Konfigs zu ändern). „Leeren“ trennt die optionale Basis-`.hsf`.
- Das Paletten-Icon öffnet „Farben verwalten“, um Text- und Hintergrundfarben für Substats anzupassen.
- In `Regeln` bleiben die Spalten „Idx“ und „Konf“ erhalten (Basisdatei-Zeilen haben einen leeren Konf-Wert). In `Regel Tester` zeigen dieselben Flächen Slot/Set, Item-Stats und das Badge der zuerst passenden Konfig, damit du direkt im Preview siehst, was mit jedem Artefakt passieren würde.

### Sellfile-Vorschau: Steuerelemente
- Farben verwalten: Über das Paletten-Icon Farben anpassen; „Auf Standard zurücksetzen“ stellt die empfohlenen Werte wieder her.
- Filter: Drücke `Ctrl+F` (`Cmd+F` auf macOS), um das Panel zu öffnen und sofort die Konfig-Suche zu fokussieren. Rechtsklick auf eine Abschnittsüberschrift (oder `Ctrl`/`Cmd` + Klick auf den Chevron) klappt alle Bereiche gemeinsam ein oder aus. „Vorschau-Konfigs“ blendet Chips aus, die nicht zum aktiven Filter passen, damit die Tabelle übersichtlich bleibt. „Konfig-Filter“ entscheidet, welche Konfigs in der Tabelle erlaubt sind: In `Regeln` ist er ein An/Aus-Schalter, im `Regel Tester`-Modus rotiert er durch `Off` → `First-Match` → `Beliebig` (`Any-Match`).
- Spaltenmenü (Rechtsklick auf Kopfzeile):
  - Spalten zurücksetzen: Standardspalten und -breiten wiederherstellen.
  - Spaltenbreiten anpassen: Breiten automatisch an die Ansicht anpassen.
  - Mehrzeilige Zeilen erlauben: Umschalten für Zeilenumbruch (z. B. Substats).
  - Spalten ein-/ausblenden: Checkboxen pro Spalte.
- Spalten neu anordnen: Kopfzeile horizontal ziehen.
- Spaltenbreite ändern: Rechte Kante der Kopfzeile ziehen.
- Klickverhalten: Tabellenzeilen wählen die zugehörige Konfig (ohne Auto-Scroll). Klick auf einen Konfig-Chip scrollt zur ersten passenden Zeile.

### Regel Tester-Vorschau
- Klicke auf „Ausrüstung...” im Header der Sellfile-Vorschau, um den Dialog „Ausrüstung” (Logic Hub → Tab „Ausrüstung”) zu öffnen. Erstelle Beispielausrüstung oder füge Zeilen (JSON/Text) ein. Die Einträge landen sofort in der Vorschau, daher bleibt dein Raster auch bei geschlossenem Dialog erhalten.
- Importiere deine RSL-Helper-Ausrüstungsdatenbank, indem du `.db`-Dateien in die App ziehst oder den Button „RSL Helper Sellfile laden“ nutzt (gleiches Verhalten). Diese Importe stellen tausende Artefakte plus Posteingang in die Warteschlange, schalten die Vorschau auf die Tester-Tabelle und lassen Builder sowie Exportzustand unangetastet.
- Jede Zeile zeigt Slot, Set, Level, Mainstat, Substats (inkl. Glyphen und Rollen), die Quelle (Inventar vs. Posteingang) sowie Chips für Behalten/Verkaufen und die zuerst passende Regel/Konfig. Deaktivierte Regeln matchen nie, daher stehen „Kein Treffer“-Zeilen für Ausrüstung, die der Sellfile unverändert lassen würde.
- Die Header-Zähler springen auf Treffer vs. Kein Treffer plus Behalten/Verkaufen. Kombiniere diese Totale mit den Regel Tester-Filtern (Keep/Sell-Ergebnis, Treffer/Kein Treffer sowie Konfig `Off`/`First-Match-Auswertung`/`Beliebig`), um Randfälle vor dem Export gezielt zu prüfen.
- Nutze den Vorschau-Umschalter, um zwischen Regeln- und Regel Tester-Tabelle zu wechseln, ohne den Logic-Hub-Dialog erneut zu öffnen – perfekt, um die erzeugten Regelzeilen mit der Ausrüstung zu vergleichen, die sie ausgelöst hat.

### Export
- „Zusammengeführte RSL Helper Sellfile exportieren“ exportiert mit Basisdatei, sonst „RSL Helper Sellfile exportieren“.
- Nutze „Konfigs speichern“ und „Konfigs laden“ im Builder-Bereich, um deine Arbeit zu sichern.
- Der Standardname für Exporte lautet `Sellfile_YYYYMMDD_HHMM.hsf`.

## Beispiele

Alle Beispiele verwenden 6★-Mindestwerte pro Roll-Einheit: SPD=5, CR%=5, CDMG%=5.

**Früh- vs. Spät-Schwellen**
- **Früh**: Schwellen spiegeln die bereits erreichten Rollen wider. Bei Wildcards + Mindest-Summe listet Früh an jedem Meilenstein die minimalen Aufteilungen (bleibt also stabil). Andernfalls zeigt Früh nur die ausgewählten Substats, bis das +16-Ziel erreichbar ist, und reduziert dann auf deine Substat-Richtwerte (außer eine globale Σ-Vorgabe verlangt mehr).
- **Spät**: Fordert nur das, was jetzt vorhanden sein muss, damit das Ziel bei +16 erreichbar bleibt. Mit Wildcards + Mindest-Summe wiederholt Spät dieselben minimalen Aufteilungen bei den frühen Meilensteinen und erneut bei +16. Für per-Stat-Ziele erzeugt Spät pro Level die minimalen Untergrenzen.

#### Builder-Szenarien auf einen Blick

| Szenario | Setup | Ausgabe des Builders |
| --- | --- | --- |
| Früh (2 Substats) | SPD Min = 2, CR% Min = 1, Level +0..+16 | `+0:` SPD ≥ 5, CR ≥ 5<br>`+4:` [10,5] und [5,10]<br>`+8:` [15,5], [10,10], [5,15]<br>`+12/+16:` [15,10] |
| Spät (2 Substats) | Wie oben | `+0/+4:` [5,5]<br>`+8:` [10,5] oder [5,10]<br>`+12:` [15,5] oder [10,10]<br>`+16:` [15,10] |
| Früh (3 Substats) | SPD Min = 2, CR% Min = 1, CDMG% ausgewählt, Erforderlich = 3 | `+0:` [SPD,CR,CDMG] ≥ [5,5,5]<br>`+4:` Ein-Roll-Aufteilungen<br>`+8:` Alle Zwei-Roll-Permutationen (inkl. Obergrenzen)<br>`+12/+16:` [15,10,5] |
| Spät (3 Substats) | Gleiche Stats wie oben | `+0/+4:` [5,5,5]<br>`+8:` [10,5,5] oder [5,10,5]<br>`+12:` [15,5,5] oder [10,10,5]<br>`+16:` [15,10,5] |
| Einen Stat sperren, zwei verlangen | Substats SPD/HP/ATK, SPD gesperrt (🔒), Erforderliche Substats = 2 | Builder erzeugt SPD+HP und SPD+ATK. HP+ATK entfällt, weil der gesperrte Stat immer enthalten sein muss. |
| Rollen auf 3 Stats fokussieren | Substats SPD/CR%/CDMG%/HP%/ATK%/DEF%, Erforderliche Substats = 4, SPD/CR%/CDMG% Min Roll = 1, HP%/ATK%/DEF% Roll-Obergrenze = 0 | SPD, CR% und CDMG% erhalten die Rollen; das vierte Stat (HP%/ATK%/DEF%) bleibt auf dem Basiswert. Roll-Obergrenzen (Rechtsklick ab ★) verhindern zusätzliche Rollen. |
| Früh mit Wildcard | Substats SPD (Min = 2) und ACC (★), Erforderliche Substats = Auto, Level +0..+16 | Früh markiert Items, die SPD(2) bis +16 schaffen (Zeilen, in denen SPD oder ACC rollt). Sobald zwei SPD-Rollen möglich sind, erscheint die SPD-Minimum-Zeile. |
| Rollen-Summe mit Wildcards | Substats SPD und ACC beide auf ★, Erforderliche Substats = 2, Mindest-Rollen = 1 | **Früh:** +4/+8/+12/+16 zeigen die beiden minimalen Aufteilungen (SPD ≥ 10 & ACC ≥ 9 sowie SPD ≥ 5 & ACC ≥ 18).<br>**Spät:** +0/+4/+8/+12 zeigen Basiszeilen, +16 wiederholt die gleichen beiden Aufteilungen. Höhere Mindestwerte zwingen Spät dazu, die Summen früher einzufordern (z. B. zeigt +12 bereits die Ein-Roll-Aufteilungen, +16 die Zwei-Roll-Aufteilungen). |

## Hinweise für Mitwirkende

- Übersetzungen: Release-ZIPs enthalten Lokalisierungsvorlagen unter `i18n/` (z. B. `i18n/de-DE.l10n.json`).
- Bearbeiten & Testen: Öffne die App und ziehe deine bearbeitete `*.l10n.json` darauf, um sie sofort für die aktuelle Sitzung zu verwenden (keine Installation nötig oder möglich).
- Fixes einreichen: Sende die aktualisierte JSON per Discord-Nachricht. Lass die Keys unverändert; fehlende Keys fallen auf Englisch zurück.
- Eingebaute Sprachen: Alle ausgelieferten Sprachen sind in die einzelne HTML-Datei eingebettet, damit die App offline funktioniert. Deine Anpassungen werden im nächsten Release übernommen.
- `Stream-Helper-DB-to-Creator.bat` startet den DB-Watcher und streamt die Standarddatenbank von RSL Helper in Sellfile Creator, damit du Konfigs live einfacher prüfen kannst.

## Danksagungen

Vielen Dank an **[STBL] Nasgor** für seine unschätzbaren Beiträge,  
an **[SP] Panda** für seine Sellfiles,  
an **KruYseN** für seine Gear-Cleanse-Videos,  
und natürlich an **Farbstoff** für RSL Helper!

## Autor
Erstellt von [STBL] Nusi㊷  
Lokalisierung von Codex

© Nusi㊷ - 2026
