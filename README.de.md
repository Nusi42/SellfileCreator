# RSL Helper Sellfile Creator

Erstelle, prüfe und exportiere Verkaufsregeln für RSL Helper mit einer übersichtlichen Oberfläche.

> Dies ist ein unabhängiges Fan-Projekt. Es besteht keine Verbindung zu Plarium, Raid: Shadow Legends oder RSL Helper. Alle Marken gehören ihren jeweiligen Eigentümern.

## Funktionen
- Regeln erstellen und speichern: Baue Konfigs und behalte eine Bibliothek, die du wiederverwenden kannst.
- Sellfile-Vorschau: Sieh dir deine erzeugten Regeln an – mit oder ohne deine aktuelle Sellfile.
- Vorschau mit deiner aktuellen Sellfile (optional): Ziehe deine `.hsf` in die App, um sie zusammen mit deinen Regeln zu prüfen. Du kannst auch eine Konfigs-Datei (`.hsfc`) ablegen; ein Overlay bestätigt, welche Dateien akzeptiert werden.
- Metasets: Benenne Set-Gruppen (z. B. Speed + Wahrnehmung) und nutze sie in mehreren Regeln.
- Export mit einem Klick: Exportiere eine HSF-Datei (die RSL Helper Sellfile), die sofort in RSL Helper geladen werden kann.

## Nutzung

### Konfigs-Datei
- HSFC (`.hsfc`): Das Projektfile der App. Betrachte es wie einen Spielstand, den du laden oder teilen kannst. RSL Helper verwendet HSFC nicht direkt.
- HSF (`.hsf`): Die RSL Helper Sellfile. Exportiere sie hier und lade sie anschließend in RSL Helper.
- Der Standardname beim Speichern lautet `SellfileCreatorRules_YYYYMMDD_HHMM.hsfc`.

### Konfig-Builder
- Fülle den Konfig-Builder aus und gib deiner Konfig einen eindeutigen „Konfig-Namen“.
- Klicke auf „Als neue Konfig hinzufügen“, um sie zu speichern. Wähle die gespeicherte Konfig in der Liste unter dem Builder aus, um sie zu bearbeiten, und sichere Änderungen mit „Ausgewählte Konfig aktualisieren“.
- Laden/Speichern: Nutze „Konfigs laden“ und „Konfigs speichern“, um deine Regeln erneut zu verwenden. Beide Aktionen enthalten alles, was nötig ist, um die Vorschau exakt wiederherzustellen.
- Notiz: Über „Notiz hinzufügen…“ (oder „Notiz bearbeiten…“) kannst du deiner Konfigs-Datei eine Notiz anhängen. Beim Laden einer Konfigs-Datei mit Notiz wird diese automatisch angezeigt. Verwende `<!-- configs:1,0 -->`, um bestimmte Konfig-Chips einzufügen (0 nimmt die nächste Konfig). Mit `<!-- configs-re:"speed" -->` erscheinen alle Konfigs, deren Name dem Muster entspricht (Groß/Kleinschreibung wird ignoriert).

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
- Slots: Fokussiere die Regel auf bestimmte Ausrüstungsstücke (Waffe, Stiefel etc.), damit Off-Slot-Drops nicht matchen. Leer lassen = alle Slots.
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
- Mindest-Rollen (global): Setze die Gesamtzahl an Rollen, die sich deine ausgewählten oder gesperrten Substats teilen müssen. `0` überspringt die Prüfung. Früh listet nur Aufteilungen, die dein Ziel bis +16 noch schaffen können.
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

### Sellfile-Vorschau (optional mit Basisdatei)
- Lade optional eine vorhandene `.hsf`, um deine Regeln mit einer Basisdatei zu kombinieren.
  - Klicke auf „RSL Helper Sellfile laden“ (oder ziehe die Datei hinein).
  - „Leeren“ entfernt die geladene Datei.
- Das Paletten-Icon öffnet „Farben verwalten“, um Text- und Hintergrundfarben für Substats anzupassen.
- Die Tabelle zeigt alle exportierten Regeln. Spalten „Idx“ und „Konf“ helfen, Reihen einer Konfig zuzuordnen; für Basisdateien bleibt „Konf“ leer.

### Sellfile-Vorschau: Steuerelemente
- Farben verwalten: Über das Paletten-Icon Farben anpassen; „Auf Standard zurücksetzen“ stellt die empfohlenen Werte wieder her.
- Spaltenmenü (Rechtsklick auf Kopfzeile):
  - Spalten zurücksetzen: Standardspalten und -breiten wiederherstellen.
  - Spaltenbreiten anpassen: Breiten automatisch an die Ansicht anpassen.
  - Mehrzeilige Zeilen erlauben: Umschalten für Zeilenumbruch (z. B. Substats).
  - Spalten ein-/ausblenden: Checkboxen pro Spalte.
- Spalten neu anordnen: Kopfzeile horizontal ziehen.
- Spaltenbreite ändern: Rechte Kante der Kopfzeile ziehen.
- Klickverhalten: Tabellenzeilen wählen die zugehörige Konfig (ohne Auto-Scroll). Klick auf einen Konfig-Chip scrollt zur ersten passenden Zeile.

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

## Danksagungen

Vielen Dank an **[STBL] Nasgor** für seine unschätzbaren Beiträge,  
an **[SP] Panda** für seine Sellfiles,  
an **[IPЯ] KruYseN** für seine Gear-Cleanse-Videos,  
und natürlich an **Farbstoff** für RSL Helper!

## Autor
Erstellt von [STBL] Nusi㊷  
Lokalisierung von Codex
