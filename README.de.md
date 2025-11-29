# RSL Helper Sellfile Creator

Erstelle, prüfe und exportiere Verkaufsregeln für RSL Helper mit einer übersichtlichen Oberfläche.

> Dies ist ein unabhängiges Fan-Projekt. Es besteht keine Verbindung zu Plarium, Raid: Shadow Legends oder RSL Helper. Alle Marken gehören ihren jeweiligen Eigentümern.

## Funktionen
- Regeln erstellen und speichern: Baue Konfigs und behalte eine Bibliothek, die du wiederverwenden kannst.
- Sellfile-Vorschau-Umschalter: Wechsle direkt im Header zwischen der Regel-Tabelle und der Regel Tester-Tabelle. Zähler/Ergebnis-Chips passen sich an (Behalten/Verkaufen für Regeln, Treffer/Kein Treffer für den Tester) und die Filter folgen dem gewählten Modus.
- Drag & Drop oder Laden-Button: Ziehe `.hsfc`, `.hsf` oder `.db` überall in die App (Overlay bestätigt) oder klicke auf „RSL Helper Sellfile laden“. Beide Wege verhalten sich identisch: `.hsfc` ersetzt den Builder, `.hsf` ergänzt eine optionale Basis-Sellfile, `.db` landet direkt in der Regel Tester-Warteschlange ohne deine Konfigs anzurühren.
- Metasets: Benenne Set-Gruppen (z. B. Speed + Wahrnehmung) und nutze sie in mehreren Regeln.
- Export mit einem Klick: Exportiere eine HSF-Datei (die RSL Helper Sellfile), die sofort in RSL Helper geladen werden kann.
- Regel Tester-Vorschau + Dialog „Ausrüstung...”: Erstelle Beispielausrüstung, füge Zeilen ein oder ziehe deine RSL-Helper-Ausrüstungsdatenbank (meist `%APPDATA%\\RslHelper\\Config`) in den Dialog. Lass den Dialog geschlossen und nutze den Vorschau-Umschalter, um diese Ausrüstung sichtbar zu halten, während du sie mit deinen Regeln vergleichst.
- Autosave-Wiederherstellungsdialog: Sobald eine Autosave gefunden wird, kannst du exakt auswählen, was geladen wird – Konfigs, Metasets, Substat-Richtwerte, Final-Sell-Rest, angepinnte Notiz, Filterleiste (Zustand, Chips, eingeklappte Bereiche) und sogar Regel Tester-Importe.
- RSL-Helper-DB-Ordner kopieren: Der Vorschau-Header enthält eine Zwischenablage-Schaltfläche, die `%APPDATA%\\RslHelper\\Config` kopiert, damit du den Ordnerpfad direkt in den Explorer einfügen kannst, bevor du die `.db` in Sellfile Creator ziehst.

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
- Rang: Begrenze die Regel auf bestimmte Sternränge, wenn du z. B. 6★ anders als 5★ behandeln möchtest. `Alle` lässt alle Ränge zu.
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
- Fraktion: Beschränke Zubehör-Regeln auf eine Fraktion, wenn du ein Team gezielt ausstattest. Ringe, Amulette und Banner beachten den Filter; Rüstung ignoriert Fraktionen, daher ist `Alle` dort am sichersten.
- Slots: Fokussiere die Regel auf bestimmte Slots (Waffe, Stiefel etc.), damit Off-Slot-Drops nicht matchen. Leer lassen = alle Slots.
- Sets & Metasets: Filtere auf explizite Sets oder benannte Metasets, wenn nur bestimmte Kombinationen zugelassen sein sollen. Leer lassen = alle Sets.
- Mainstats: Bestimme, welche Mainstats zulässig sind.
  - Mehrfachauswahl erlaubt; keine Auswahl = jedes Mainstat ist gültig.
  - Mehrere Mainstats erzeugen jeweils eigene Zeilen, damit sie im Export eindeutig bleiben.
- Substats: Bestimme, welche Substats relevant sind.
  - Klick zum Ein-/Ausschalten. Gesperrte Substats erscheinen immer in den erzeugten Regeln.
  - Über das Schloss-Badge (🔒) neben dem Label machst du den Stat verpflichtend; Rechtsklick öffnet die Schnellaktionen für Sperren/Entsperren und Roll-Ziele.
  - `Any` setzt die Auswahl zurück und bedeutet „keine Einschränkung“. Sobald du konkrete Substats wählst, wird `Any` deaktiviert.
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
- Schalter neben Export, um abschließende Verkaufsregeln für übrig gebliebene Items zu aktivieren. Standardmäßig eingeschaltet.
- Bestimme, ob Artefakte und/oder Zubehör sowie welche Levelbereiche (0–3, 4–7, 8–11, 12–15, 16) betroffen sind. Standard: 0–15, damit voll gelevelte Items nicht verkauft werden.
- Ohne finalen Verkauf behält RSL Helper alle Items, die keine Regel treffen. Verkauft wird nur, wenn eine Sell-Regel greift.
- Bei aktivem finalem Verkauf umfassen die erzeugten Sell-Regeln alle bekannten Sets. In der Vorschau steht „Alle bekannten Sets“, der Export listet trotzdem jedes Set einzeln.

### Konfigs verwalten
- Gespeicherte Konfigs erscheinen als Chips unter dem Builder. Linksklick wählt sie zum Bearbeiten, Rechtsklick öffnet das Kontextmenü (Duplizieren, Verschieben, Kopieren, Löschen).
- „Delete Konfigs“ entfernt alle Konfigs (mit Sicherheitsabfrage).
- Hover-Verknüpfung: Über einer Konfig schweben markiert alle zugehörigen Zeilen in der Sellfile-Vorschau und umgekehrt.
- Klick-Verknüpfung: Klick auf eine Tabellenzeile wählt automatisch die Konfig aus, von der sie stammt (Basis-HSF-Zeilen bleiben unberührt).
- Zwischenablagen-Fallback: Wenn das Kopieren per API blockiert ist, öffnet ein Dialog mit vorausgewähltem Text zum manuellen Kopieren.

### Sellfile-Vorschau (Regeln & Regel Tester)
- Der Header bündelt den `Regeln`/`Regel Tester`-Schalter, den Button „Ausrüstung...” und „RSL Helper Sellfile laden“, damit du sofort siehst, wo du die Tabelle wechselst oder den Regel Tester-Dialog öffnest.
- Ansicht `Regeln` (Standard): zeigt alle exportierten Regeln inklusive optionaler Basis-`.hsf`-Zeilen. Die Header-Zähler bleiben bei Behalten vs. Verkaufen, die Filterleiste behält die Any/Only-Chips für Slot/Rang/Seltenheit/Level und beide Konfig-Buttons sind immer sichtbar: „Vorschau-Konfigs“ blendet Chips aus, deren Regeln den aktuellen Filter nicht bestehen, und der „Konfig-Filter“ ist hier ein einfacher An/Aus-Schalter, der Sellfile-Zeilen außerhalb deiner ausgewählten Konfig-Chips versteckt (und dabei den Filterzustand für den Tester vormerkt).
- Ansicht `Regel Tester`: schaltet auf die Liste der importierten Ausrüstung, sodass du externe oder manuell erstellte Items prüfen kannst, ohne den Dialog erneut zu öffnen. Zähler wechseln zu „Treffer“ vs. „Kein Treffer“ (plus Behalten/Verkaufen nach der Regel „erste passende Konfig gewinnt“), und die Filterleiste zeigt weiterhin beide Konfig-Buttons nebeneinander: „Vorschau-Konfigs“ für die Chip-Sichtbarkeit sowie den „Konfig-Filter“, der hier als Tri-State (`Off` → `First-Match-Auswertung` → `Beliebig`) arbeitet, um die Ausrüstungszeilen zwischen Ersttreffern und beliebigen Treffern zu trennen, während beim Zurückwechseln weiterhin nur die Regeln deiner Auswahl sichtbar bleiben. Zusätzlich kommt der Regel Tester-spezifische Ergebnisfilter (Keep/Sell vs. Treffer/Kein Treffer) hinzu, sodass du Items isolierst, bei denen deine Auswahl zuerst (oder irgendwo) getroffen hat, ohne die Chips zu verstecken. `.db`-Importe springen automatisch in diese Ansicht; zurück zu `Regeln` kannst du jederzeit.
- Der Button „RSL Helper Sellfile laden“ macht genau dasselbe wie Drag & Drop: `.hsfc` ersetzt den Builder-Zustand, `.hsf` ergänzt eine optionale Basis-Sellfile, `.db` schieben Ausrüstung direkt in die Regel Tester-Vorschau (ohne deine Konfigs zu ändern). „Leeren“ trennt die optionale Basis-`.hsf`.
- Das Paletten-Icon öffnet „Farben verwalten“, um Text- und Hintergrundfarben für Substats anzupassen.
- In `Regeln` bleiben die Spalten „Idx“ und „Konf“ erhalten (Basisdatei-Zeilen haben einen leeren Konf-Wert). In `Regel Tester` zeigen dieselben Flächen Slot/Set, Item-Stats und das Badge der zuerst passenden Konfig, damit du direkt im Preview siehst, was mit jedem Artefakt passieren würde.

### Sellfile-Vorschau: Steuerelemente
- Farben verwalten: Über das Paletten-Icon Farben anpassen; „Auf Standard zurücksetzen“ stellt die empfohlenen Werte wieder her.
- Filter: Drücke `Ctrl+F` (`Cmd+F` auf macOS), um das Panel zu öffnen und sofort die Konfig-Suche zu fokussieren. Rechtsklick auf eine Abschnittsüberschrift (oder `Ctrl`/`Cmd` + Klick auf den Chevron) klappt alle Bereiche gemeinsam ein oder aus. „Vorschau-Konfigs“ blendet Chips aus, die nicht zum aktiven Filter passen, damit die Tabelle übersichtlich bleibt. „Konfig-Filter“ entscheidet, welche Konfigs in der Tabelle erlaubt sind: In `Regeln` ist er ein einfacher An/Aus-Schalter, im `Regel Tester`-Modus rotiert er durch `Off` → `First-Match` → `Any-Match`, sodass die Ausrüstungszeilen zwischen Ersttreffern und beliebigen Treffern wechseln. Der Regel Tester-spezifische Level-Schieberegler und das Roll-Glyphen-Popover bleiben Teil desselben Panels, damit du Filter-Spannen und Roll-Symbole direkt nach dem Shortcut anpassen kannst. „Filter zurücksetzen“ aktiviert alle Chips und setzt den Konfig-Filter zurück auf `Off`.
- Spaltenmenü (Rechtsklick auf Kopfzeile):
  - Spalten zurücksetzen: Standardspalten und -breiten wiederherstellen.
  - Spaltenbreiten anpassen: Breiten automatisch an die Ansicht anpassen.
  - Mehrzeilige Zeilen erlauben: Umschalten für Zeilenumbruch (z. B. Substats).
  - Spalten ein-/ausblenden: Checkboxen pro Spalte.
- Spalten neu anordnen: Kopfzeile horizontal ziehen.
- Spaltenbreite ändern: Rechte Kante der Kopfzeile ziehen.
- Klickverhalten: Tabellenzeilen wählen die zugehörige Konfig (ohne Auto-Scroll). Klick auf einen Konfig-Chip scrollt zur ersten passenden Zeile.

### Regel Tester-Vorschau
- Klicke auf „Ausrüstung...” im Header der Sellfile-Vorschau, um den Regel Tester-Dialog zu öffnen. Erstelle Beispielausrüstung oder füge Zeilen (JSON/Text) ein. Die Einträge landen sofort in der Vorschau, daher bleibt dein Raster auch bei geschlossenem Dialog erhalten.
- Importiere deine RSL-Helper-Ausrüstungsdatenbank, indem du `.db`-Dateien in die App ziehst oder den Button „RSL Helper Sellfile laden“ nutzt (gleiches Verhalten). Diese Importe stellen tausende Artefakte plus Posteingang in die Warteschlange, schalten die Vorschau auf die Tester-Tabelle und lassen Builder sowie Exportzustand unangetastet.
- Jede Zeile zeigt Slot, Set, Level, Mainstat, Substats (inkl. Glyphen und Rollen), die Quelle (Inventar vs. Posteingang) sowie Chips für Behalten/Verkaufen und die zuerst passende Regel/Konfig. Deaktivierte Regeln matchen nie, daher stehen „Kein Treffer“-Zeilen für Ausrüstung, die der Sellfile unverändert lassen würde.
- Die Header-Zähler springen auf Treffer vs. Kein Treffer plus Behalten/Verkaufen. Kombiniere diese Totale mit den Regel Tester-Filtern (Keep/Sell-Ergebnis, Treffer/Kein Treffer sowie Konfig `Off`/`First-Match-Auswertung`/`Beliebig`), um Randfälle vor dem Export gezielt zu prüfen.
- Nutze den Vorschau-Umschalter, um zwischen Regeln- und Regel Tester-Tabelle zu wechseln, ohne den Dialog erneut zu öffnen – perfekt, um die erzeugten Regelzeilen mit der Ausrüstung zu vergleichen, die sie ausgelöst hat.

### Export
- „Zusammengeführte RSL Helper Sellfile exportieren“ exportiert mit Basisdatei, sonst „RSL Helper Sellfile exportieren“.
- Nutze „Konfigs speichern“ und „Konfigs laden“ im Builder-Bereich, um deine Arbeit zu sichern.
- Der Standardname für Exporte lautet `Sellfile_YYYYMMDD_HHMM.hsf`.

## Beispiele

Alle Beispiele verwenden 6★-Mindestwerte pro Roll-Einheit: SPD=5, CR%=5, CDMG%=5.

Früh vs. Spät
- Früh: Schwellen spiegeln die bereits erreichten Rollen wider. Mit ★ + Mindest-Summe zeigt Früh nur minimale Aufteilungen je Meilenstein (stabile Liste). Andernfalls listet Früh zuerst ausgewählte Substats, bis das Ziel erreichbar ist, und reduziert dann auf die Mindestwerte (es sei denn, eine globale Σ-Vorgabe verlangt mehr).
- Spät: Fordert nur das, was jetzt vorhanden sein muss, damit das Ziel bei +16 erreichbar bleibt. Mit ★ + Mindest-Summe zeigt Spät dieselben minimalen Aufteilungen an frühen Meilensteinen und wieder bei +16. Mit per-Stat-Richtwerten erzeugt Spät pro Level die minimalen Untergrenzen.

Beispiel: Früh (2 Substats) — SPD Min=2, CR% Min=1 (Level 0..16)
- +0: SPD ≥ 5, CR ≥ 5
- +4: [10,5] und [5,10]
- +8: [15,5], [10,10], [5,15]
- +12/+16: [15,10]

Beispiel: Spät (2 Substats) — SPD Min=2, CR% Min=1 (Level 0..16)
- +0/+4: [5,5]
- +8: [10,5] oder [5,10]
- +12: [15,5] oder [10,10]
- +16: [15,10]

Beispiel: Früh (3 Substats) — SPD Min=2, CR% Min=1, CDMG% beliebig, Erforderlich=3
- +0: [SPD, CR, CDMG] ≥ [5,5,5]
- +4: Ein-Roll-Aufteilungen: [10,5,5], [5,10,5], [5,5,10]
- +8: Zwei-Roll-Aufteilungen (Obergrenzen berücksichtigt)
- +12/+16: [15,10,5]

Beispiel: Spät (3 Substats) — SPD Min=2, CR% Min=1, CDMG% beliebig, Erforderlich=3
- +0/+4: [5,5,5]
- +8: [10,5,5] oder [5,10,5]
- +12: [15,5,5] oder [10,10,5]
- +16: [15,10,5]

Tipp: Nutze Roll-Obergrenzen, um Rollen auf einem Stat zu verbieten. Vom ★-Zustand Rechtsklick → Roll-Obergrenze und auf 0 setzen. So bleibt CDMG% auf Basiswert, während SPD/CR die Rollen erhalten.

Beispiel: Einen Substat sperren, zwei verlangen
- Wähle Substats: SPD, HP, ATK. Klicke SPD und aktiviere das Schloss-Badge (🔒), um es zu sperren.
- Setze Erforderliche Substats = 2.
- Ergebnis: Regeln enthalten SPD+HP und SPD+ATK. HP+ATK ohne SPD kommt nicht vor (gesperrte Substats sind immer enthalten).

Beispiel: Rollen auf 3 Stats fokussieren, den 4. sperren
- Ziel: Items mit SPD, CR%, CDMG% sowie einem von HP%/ATK%/DEF% behalten, ohne dass das vierte Stat Rollen bekommt.
- Wähle Substats: SPD, CR%, CDMG%, HP%, ATK%, DEF%.
- Erforderliche Substats = 4.
- Roll-Anzeigen:
  - Vom ★-Zustand Linksklick (Mindestrollen): Setze SPD, CR%, CDMG% auf die gewünschten Werte (z. B. je 1).
  - Vom ★-Zustand Rechtsklick (Roll-Obergrenze): Setze HP%, ATK%, DEF% auf Roll-Obergrenze = 0.
- Ergebnis: Das vierte Substat ist immer eines der drei, erhält aber keine Rollen; SPD/CR%/CDMG% bekommen die Rollen.

Beispiel: Früh mit Wildcard (nur ausgewählte Substats)
- Wähle Substats: SPD und ACC.
- Rollen: SPD Min = 2; ACC = ★.
- Erforderliche Substats: Auto (2).
- Level: Min +0, Max +16.
- Effekt: Früh zeigt Items, die SPD(2) bis +16 erreichen können (Zeilen, in denen SPD oder ACC gerollt hat). Sobald zwei SPD-Rollen möglich sind, erscheint die Zeile mit SPD-Minimum.

Beispiel: Rollen-Summe mit Wildcards (2 Substats)
- Wähle Substats: SPD und ACC. Setze beide auf ★.
- Erforderliche Substats: 2. Mindest-Rollen: 1.
- Früh:
  - +4/+8/+12/+16: zwei Zeilen — SPD ≥ 10, ACC ≥ 9 sowie SPD ≥ 5, ACC ≥ 18 (minimale Aufteilungen; stabil über alle Meilensteine).
- Spät:
  - +0/+4/+8/+12: nur Basiszeilen (noch keine zusätzliche Forderung); +16: dieselben beiden Zeilen. Bei höheren Mindestwerten erzwingt Spät an passenden Meilensteinen die nötigen Summen (z. B. zeigt +12 die Ein-Roll-Aufteilungen, +16 die Zwei-Roll-Aufteilungen).

## Hinweise für Mitwirkende

- Übersetzungen: Release-ZIPs enthalten Lokalisierungsvorlagen unter `i18n/` (z. B. `i18n/de-DE.l10n.json`).
- Bearbeiten & Testen: Öffne die App und ziehe deine bearbeitete `*.l10n.json` darauf, um sie sofort für die aktuelle Sitzung zu verwenden (keine Installation nötig oder möglich).
- Fixes einreichen: Sende die aktualisierte JSON per Discord-Nachricht. Lass die Keys unverändert; fehlende Keys fallen auf Englisch zurück.
- Eingebaute Sprachen: Alle ausgelieferten Sprachen sind in die einzelne HTML-Datei eingebettet, damit die App offline funktioniert. Deine Anpassungen werden im nächsten Release übernommen.
- RSL-Helper-DB überwachen: Starte `scripts/run-sample-server.ps1 -WatchGearDb` (oder `-GearDbPath <Datei>`), um `%APPDATA%\\RslHelper\\Config` zu beobachten. Jede Aktualisierung der `.db` schiebt der Sample-Server direkt in den vom Skript gestarteten Regel Tester und fragt nach, falls mehrere Datenbanken vorhanden sind.
- Doppelklick-Helfer: `Stream-Helper-DB-to-Creator.bat` startet den Sample-Server unter PowerShell mit `-WatchGearDb "%APPDATA%\\RslHelper\\Config"` und streamt so die Standard-RSL-Helper-Datenbank ganz ohne Konsole; zusätzliche Schalter kannst du einfach hinter den `.bat`-Namen setzen.

## Danksagungen

Vielen Dank an **[STBL] Nasgor** für seine unschätzbaren Beiträge,  
an **[SP] Panda** für seine Sellfiles,  
an **[IPЯ] KruYseN** für seine Gear-Cleanse-Videos,  
und natürlich an **Farbstoff** für RSL Helper!

## Autor
Erstellt von [STBL] Nusi㊷  
Lokalisierung von Codex

© Nusi㊷ - 2025
