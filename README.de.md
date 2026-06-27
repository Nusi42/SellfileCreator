# Sellfile Creator for RSL Helper

Sellfile Creator erleichtert das Erstellen von Sell-Dateien für RSL Helper — definiere Ausrüstungsfilter nach Set, Slot, Hauptstat, Substats und mehr, sieh dir die Treffer live an und exportiere fertige Sell-Dateien in Sekunden.

> Dies ist ein unabhängiges Fan-Projekt. Es besteht keine Verbindung zu Plarium, Raid: Shadow Legends oder RSL Helper. Alle Marken gehören ihren jeweiligen Eigentümern.

## Features

- **Rezept-Builder** — erstelle benannte Behalten/Verkaufen-Rezepte mit Filtern für Slot,
  Set, Rang, Seltenheit, Hauptstat, Substats (mit Roll-Minima und Zielwerten), Fraktion
  und Stufenmeilensteinen. Baue eine wiederverwendbare Bibliothek auf und exportiere sie
  mit einem Klick als RSL-Helper-Verkaufsdatei (`.hsf`).
- **Sellfile-Vorschau** — sieh dir die generierte RSL-Helper-Verkaufsdatei im
  Vorschau-Tab an, bevor du exportierst.
- **Metasets** — fasse Ausrüstungssets (z. B. Geschwindigkeit + Wahrnehmung) in benannten
  Sammlungen zusammen und verwende sie in Rezepten und Schutzregeln wieder.
- **Ausrüstungs-Inspektor** — verbinde RSL Helper für Live-Synchronisation oder lade eine `.db`-Datei, um zu sehen, welche Items auf jedes Rezept passen und wie viele behalten oder verkauft würden.
- **Ausrüstungs-Diff** — schalte eine Vorher/Nachher-Ansicht ein, um genau zu sehen, welche Ausrüstungsteile beim Anpassen von Rezepten oder beim Ausprobieren der dynamischen Überbrückungen zwischen *Behalten* und *Verkaufen* wechseln. Ein Chip zeigt die laufenden Summen; eine Seite-an-Seite-Liste zeigt jedes geänderte Teil.
- **Dungeon-Simulator** — sieh dir Behalten-Chancen in Prozent für Feuerritter, Drachen
  und Eisgolem über Schwierigkeitsstufen und Ausbaustufen an, um die Wirkung deiner
  Verkaufsdatei beim Farmen oder Verbessern von Ausrüstung zu bestätigen.
- **Schutzregeln** — definiere Slot/Set/Stat-Kombinationen, die du nie verlieren willst;
  der Scanner fügt automatisch Behalten-Regeln in die Verkaufsdatei ein, wenn deine
  Einstellung eine geschützte Kombination unter ihre Quote senken würde.
- **Ausrüstungsanalyse** — Analyse-Dashboard mit KPI-Karten, Kreuzfilter-Diagrammen
  (Slot, Rang, Seltenheit, Quelle, Stufe), einer Sets-Baumkarte, Hauptstat-Balken und
  einem Substat-Radar. Klicke auf ein Diagramm, um alle anderen zu filtern; sende den
  aktiven Filter direkt in den Ausrüstungs-Inspektor.
- **Finaler Verkauf** — ein Schalter fügt Auffangregeln für nicht zugeordnete Ausrüstung
  über konfigurierbare Stufenbereiche hinzu, damit nichts durch die Lücken fällt.
- **Designs** — wechsle zwischen dunklem und hellem Modus, passe Farben und Eckenradius
  im integrierten Design-Editor an oder aktiviere eine farbenblindfreundliche Palette.

## Nutzung

### Rezept-Datei
- SFC (`.sfc`): Das Projektfile der App. Betrachte es wie einen Spielstand, den du laden oder teilen kannst. RSL Helper verwendet SFC nicht direkt.
- HSF (`.hsf`): Die RSL Helper Sellfile. Exportiere sie hier und lade sie anschließend in RSL Helper.
- Der Standardname beim Speichern lautet `SellfileCreatorRecipes_YYYYMMDD_HHMM.sfc`.

### Rezept-Editor
- Fülle den Rezept-Builder aus und gib deinem Rezept einen eindeutigen „Rezept-Namen“.
- Klicke auf „Als neues Rezept hinzufügen“, um es zu speichern. Wähle das gespeicherte Rezept in der Liste unter dem Builder aus, um es zu bearbeiten, und sichere Änderungen mit „Ausgewähltes Rezept aktualisieren“.
- Laden/Speichern: Nutze „Rezepte laden“ und „Rezepte speichern“, um deine Regeln erneut zu verwenden. Beide Aktionen enthalten alles, was nötig ist, um die Vorschau exakt wiederherzustellen.
  - Über den Chevron (▾) neben **SFC-Datei laden** öffnest du das Menü: **Aus Datei laden…** öffnet wie gewohnt den Datei-Auswahldialog; **Voreinstellung laden: Anfänger** oder **Voreinstellung laden: Midgame bis Endgame** lädt eine der mitgelieferten Voreinstellungen nach einer Bestätigungsabfrage (das aktuelle Setup wird ersetzt).
- Reset/Einfügen/Anwenden-Menüs: Rechtsklick auf „Reset“, „Als Rezept einfügen“ oder „Rezept anwenden“ öffnet ein gemeinsames Optionsmenü. Speichere den aktuellen Builder-Zustand als neue Standardvorlage, springe auf die Werkseinstellungen zurück, aktiviere „Auto nach Einfügen zurücksetzen“ (räumt den Builder direkt nach dem Einfügen) oder „Auto auf ausgewähltes Rezept anwenden“ (schiebt Änderungen nach ca. 400 ms Inaktivität in das markierte Rezept). Auto-Reset und Auto-Apply schließen sich gegenseitig aus – das Aktivieren des einen schaltet das andere aus – und beide Einstellungen bleiben zwischen Sitzungen erhalten.
- Notiz: Über „Notiz hinzufügen…” (oder „Notiz bearbeiten…”) kannst du deiner Rezept-Datei eine Notiz anhängen. Beim Laden einer Rezept-Datei mit Notiz wird diese automatisch angezeigt. Verwende `<!-- recipes:1,0 -->`, um bestimmte Rezept-Chips einzufügen (0 nimmt das nächste Rezept). Mit `<!-- recipes-re:”speed” -->` erscheinen alle Rezepte, deren Name dem Muster entspricht (Groß/Kleinschreibung wird ignoriert). Füge `<!-- dungeon-simulator -->` ein, um eine Live-Keep-Chance-Tabelle für Feuerritter, Drachen und Eisgolem über drei Schwierigkeitsstufen (N20/N25/H10) und zwei Boost-Modi anzuzeigen, mit Keep-Raten bei +0/+4/+8/+12/+16. Füge `<!-- recipe-overrides [columns=N] -->` ein, um interaktive Fragekarten (Radio-/Checkbox-Gruppen) einzubetten, die Rezept-Exportmodi und -Einstellungen zur Laufzeit überbrücken – gespeicherte Rezepte werden nie geändert. Füge `<!-- safeguard-overrides [columns=N] -->` ein, um interaktive Schieberegler- und Optionskarten einzubetten, die Schutzregel-Eigenschaften (Anzahl, Aktivierung, Substats, Verbesserungschance u. v. m.) zur Laufzeit überbrücken – gespeicherte Schutzregeln werden nie geändert. Sobald einer dieser Marker vorhanden ist, erscheinen im Notiz-Footer ein **Dynamische Überbrückungen deaktivieren / aktivieren**-Schalter und eine Schaltfläche **Optionen auf Standardwerte zurücksetzen**. Über **Aktuelle Auswahl speichern…** (im Menü „Dynamische Überbrückungen") lassen sich die aktuellen Antworten unter einem Namen ablegen — gespeicherte Überbrückungs-Sets erscheinen im selben Menü und können per Klick wieder geladen werden. Es werden nur Auswahlen gespeichert, die in der aktuellen Notiz vorhanden sind; beim Laden eines Sets werden Fragen, die nicht mehr vorkommen, übersprungen.
- Autosave-Wiederherstellung: Beim Start listet der Dialog jede gespeicherte Sektion mit eigener Checkbox auf. Lade nur, was du brauchst – Rezepte (inklusive gewähltem Chip), Metasets, Substat-Richtwerte, Final-Sell-Rest, angepinnte Notiz, Filterleiste (Offen/Zu, Chips, eingeklappte Bereiche) und Ausrüstungsinspektor-Importe. Alles, was du abwählst, bleibt unangetastet. Autosave merkt sich außerdem, welche Final-Sell-Schalter (Artefakte, Schmuckstücke sowie die Levelbereiche) aktiv waren, damit der Tools-Dialog exakt den Exportzustand von zuletzt widerspiegelt.

### Aufbau des Builders (von oben nach unten)
- Aktion & Aktiviert: Sage dem Sellfile, was passieren soll, sobald ein Gegenstand zur Rezept passt.
  - `Behalten` markiert das Item als Behalten; RSL Helper rührt es nicht an.
  - `Verkaufen` markiert das Item als Verkaufen; RSL Helper stellt es in die Verkaufswarteschlange.
  - Der Schalter „Im Sellfile aktiviert“ entscheidet, ob die erzeugten Zeilen aktiv exportiert werden. Deaktivierte Rezepte sind im Preview durchgestrichen und haben in RSL Helper keine Wirkung; aktiviere im Exportmenü „Deaktivierte Regeln beim Export auslassen“, wenn sie gar nicht im Sellfile landen sollen.
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
- Fraktion: Beschränke Schmuckstück-Regeln auf eine Fraktion, wenn du ein Team gezielt ausstattest. Ringe, Amulette und Banner beachten den Filter; Artefakte ignorieren Fraktionen, daher ist `Beliebig` dort am sichersten.
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
- Mindest-Rollen (global): Lege fest, wie viele Rollen sich deine ausgewählten oder gesperrten Substats insgesamt teilen müssen. `0` überspringt die Aggregatsprüfung. `Auto` hält den Wert synchron zur Anzahl deiner erforderlichen Substats (sobald mindestens zwei verfolgt werden) und begrenzt ihn auf das, was die aktuelle Seltenheit tatsächlich rollen kann; Einzelstat-Rezepte bleiben bei 0. Früh listet weiterhin nur Aufteilungen, die dein Ziel bis +16 noch schaffen können.
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
- Über „Substat-Richtwerte…” oben rechts im Builder öffnest du den gleichnamigen **Substat-Richtwerte**-Tab im Tools-Dialog.
- Die Richtwerte gelten global für alle Rezepte.
- Sie bestimmen die Schwellen für die Levelbereiche (0–3, 4–7, 8–11, 12–15, 16) und dienen als Fallback im Roll-Richtwerte-Raster.
- „Auf Standard zurücksetzen“ stellt die empfohlenen Richtwerte wieder her.

### Metasets
- Klicke auf „Metasets verwalten…“, um das Dialogfeld zu öffnen.
- Erstelle oder benenne Metasets und wähle, welche Sets sie enthalten. Die Ansicht nutzt dieselbe Suche wie der Sets-Picker.
- Startmetasets sind enthalten und können jederzeit angepasst oder gelöscht werden.
- „Auf Standard zurücksetzen“ bietet sichere Optionen, wenn Metasets verwendet werden (löschen, mit expliziten Sets ersetzen oder durch anderes Metaset ersetzen).

### Finaler Verkauf
- Nutze den Schalter `Finaler Verkauf` im Vorschau-Header, um abschließende Verkaufsregeln für übrig gebliebene Items zu aktivieren. Die Beschriftung bleibt gleich: Ein orangefarbener Hintergrund bedeutet aktiv, die neutrale Umrandung bedeutet aus.
- Klicke auf „Tools” neben dem Schalter, um den Tab `Finaler Verkauf` zu öffnen und festzulegen, ob Artefakte, Schmuckstücke und welche Stufenbereiche (0–3, 4–7, 8–11, 12–15, 16) gelten. Standardmäßig bleibt `+16` aus, damit voll gelevelte Teile geschützt bleiben.
- Ohne `Finaler Verkauf` behält RSL Helper alle Items, die keine Regel treffen. Verkauft wird nur, wenn eine Sell-Regel greift.
- Bei aktivem `Finaler Verkauf` umfassen die erzeugten Sell-Regeln alle bekannten Sets. In der Vorschau steht „Alle bekannten Sets“, der Export listet trotzdem jedes Set einzeln.

### Schutzregeln
- Schalte den Builder über den Umschalter oben am Builder-Panel in den **Schutzregeln**-Modus, um Kombinationen zu markieren, die niemals verloren gehen sollen. Aktiviere `Schutzregeln`, damit der Scanner Behalte-Zeilen hinzufügen kann (Bearbeitungen schalten es ebenfalls automatisch ein).
- Schutzregeln „verbrauchen“ keine Items – jede Schutzregel bewertet denselben Kandidatenpool. Wenn ein Teil mehreren Schutzregeln entspricht, zählt es für alle.
- Jede Behalte-Regel lässt dich Slot, Sets oder Metasets, Ränge, Seltenheiten, Mainstats und (bei Schmuckstücken) Fraktionen festlegen. Leer bedeutet „egal“.
- `Modus` bestimmt, wie die Regel ausgegeben wird: `Aus` deaktiviert sie, `Bestehendes schützen` fügt Behalte-Zeilen für verkaufsgefährdete Treffer hinzu, bis die Quote erreicht ist, und `Lücken vorab sichern` ergänzt Platzhalter-Regeln für fehlende Kombinationen, damit neue Drops geschützt bleiben, bis die DB aktualisiert wurde.
- Substats sind optional: Wähle einen oder mehrere, damit nur Items zählen, die diese Substats haben. Der Match‑Chip (`Beliebige Substat` / `Alle Substats` / `Pro Substat`) bestimmt, ob mindestens eine, alle oder jede ausgewählte Substat ihre eigene Quote bekommt. Leer lassen bedeutet: kein Substat-Filter.
- Ausgewählte Substats werden immer mit der normalisierten Substat-Wertung gerankt (Glyphen ignoriert); Gewichtungen erscheinen bei `Beliebige Substat` und `Alle Substats`, `Pro Substat` bleibt bei der Standardgewichtung (Gleichstände an der Grenze bleiben geschützt).
- `Nach Rang gewichten` (Chip neben `Pro Hauptstat`) verschafft höherrangiger Ausrüstung einen Wertungsvorteil — nur beim **Hauptstat**: ein 6★-Hauptstat zählt voll, ein 5★ etwa 85 %. So schlägt ein 6★ ein nahezu gleichwertiges 5★ mit gleichem Hauptstat, dessen Substats nur leicht besser sind. Es schärft nur die Reihenfolge innerhalb desselben Hauptstats (kein pauschaler Bonus für jedes höherrangige Teil) und nutzt den Hauptstat-Wert bei max. Stufe, sodass Aufwerten die Wertung nie ändert. Mindestens ein Substat muss ausgewählt sein; bei neuen Regeln standardmäßig an. Jedes Teil wird mit dem besten seines eigenen Slots und Hauptstats verglichen.
- `≥ Benötigte Anzahl` definiert das Versprechen, das die App halten soll. Direkt darunter entscheiden Chips für `Pro Slot`, `Pro Set`, `Pro Fraktion` und `Pro Hauptstat`, wie das Kontingent aufgeteilt wird. Sind alle Chips aus, gilt automatisch `Pro Schutzregel` (ein gemeinsamer Pool).
- Der Hinweis bei `Benötigte Anzahl` zeigt die aktive Bereichs-Aufteilung (`X je Slot × je Set × ...`) plus eine einfache Fehlmenge (`({missing} fehlen)`).
- Der Scanner fügt nur Behalte-Zeilen für passende Items hinzu, die sonst verkauft würden, und nur wenn die Quote nicht erfüllt ist. Im Modus `Lücken vorab sichern` kommen Platzhalter-Regeln für fehlende Kombinationen dazu.
- **Ignorier-Schalter** (Chips neben dem Aktivieren-Schalter der Regel) verfeinern, was die Regel zählt:
  - `Vorherige Schutzregeln ignorieren` – wenn die Schutzregel Kandidaten nach Substats sortiert, lässt sie Items, die frühere Schutzregeln bereits behalten haben, aus ihrem Pool fallen und wählt stattdessen die nächsten Top-Picks. Nützlich, wenn du nach einer allgemeinen Schutzregel eine zweite SPD/CR-Schutzregel stapelst und möchtest, dass sie tiefer in die Punkterangordnung greift, statt redundant dieselben Teile zu schützen. Schutzregeln ohne Substats sind nicht betroffen. Standard: aus.
  - `Ausgerüstete ignorieren (Sammlung)` – schließt Items, die aktuell auf Sammlungs-Champions ausgerüstet sind, aus dem Trefferzähler dieser Regel aus, damit sie die Quote der Regel nicht erfüllen. Standard: aus.
  - `Ausgerüstete ignorieren (Höhle)` – dasselbe Prinzip, aber für Höhlen-Champions. Standard: aus.
- **`Verbesserungschance ≥ N%`** (optionaler Talentspäher): erweitert die Schutzregel über das Standard-Top-N hinaus. Der Scanner behält zuerst immer die Top-N-Teile nach ihrem **aktuellen** Substat-Wert – diese sind nie gefährdet. Zusätzlich schützt er alle Teile *außerhalb* des Top-N, deren Verbesserungschance den Schwellenwert erreicht. Gedanke dahinter: „Halte die rohen Drops fest, die gute Chancen haben, nach dem Aufwerten konkurrenzfähig zu sein."

  **Was ist die Verbesserungschance?** Die App simuliert alle möglichen Wege, wie ein Teil beim Aufwerten auf +16 würfeln könnte – manche Würfe treffen den gewünschten Substat, manche nicht – und zählt, wie oft das Teil dabei im Top-N landet. Ein Teil mit 68 % Verbesserungschance landet in etwa zwei von drei simulierten Aufwertungspfaden im Top-N.

  **Die Verbesserungschance ist eine *Vorhersage*, nicht die Regel, die dein Gear behält – das sind zwei getrennte Systeme.** Das verwirrt oft, deshalb hier ganz deutlich:

  - Der Safeguard behält **immer die Top-N-Teile nach ihrem Substat-Wert *jetzt gerade***. Diese Reihung nach aktuellem Wert ist es, die ein Teil tatsächlich schützt.
  - Die Verbesserungschance beantwortet eine *andere* Frage: *„Wird dieses Teil, wenn alles auf +16 aufgewertet ist, immer noch zu meinen besten gehören?“* Sie bewertet **sowohl das Teil als auch seine Konkurrenten anhand ihrer voraussichtlichen +16-Werte** und zählt, wie oft das Teil im Top-N landet.

  Da sie unterschiedliche Fragen stellen, können beide voneinander abweichen – das ist erwartet, kein Fehler:

  - Ein Teil kann **0 % Verbesserungschance anzeigen und trotzdem geschützt sein.** Es gehört *heute* zu deinen besten (also behält es das Top-N nach aktuellem Wert), aber die Simulation erwartet, dass Konkurrenten, die selbst noch aufgewertet werden, es bis +16 überholen (also liegt seine *zukünftige* Top-N-Chance bei ~0 %). Ein einzelner guter Wurf, der ein Teil ins aktuelle Top-N hebt, schützt es sofort – seine Verbesserungschance kann dabei die ganze Zeit 0 % bleiben, denn diese Zahl war nie das, was es geschützt hat.
  - Ein Teil kann eine **hohe Verbesserungschance anzeigen und trotzdem (noch) nicht geschützt sein.** Es ist ein vielversprechender Rohdrop, der nicht im aktuellen Top-N ist – es wird nur behalten, wenn du den Schwellenwert unten einschaltest.

  **Wichtige Regel: Der Schwellenwert kann den Schutz nur erweitern, nie verringern.** Das aktuelle Top-N bleibt immer erhalten, unabhängig von der Verbesserungschance. Ein vollständig aufgewertetes Teil (+16) zählt seinen eingefrorenen aktuellen Wert direkt – es kann nicht aus dem Schutz fallen, weil es „keine Aufwertungsmöglichkeiten mehr hat".

  **Beispiel – SPD-Banner, Benötigte Anzahl = 2, Pro Fraktion (Rang 6, legendär):**

  | Banner | SPD | Level | Verbesserungschance | Standard | Schwelle ≥ 50 % | Schwelle ≥ 25 % |
  | --- | --- | --- | --- | --- | --- | --- |
  | A | 12 | +16 | 100 % | ✔ Top-2 | ✔ Top-2 | ✔ Top-2 |
  | B | 6 | +16 | 0 % | ✔ Top-2 | ✔ Top-2 | ✔ Top-2 |
  | C | 5 | +0 | 26 % | ✗ verkauft | ✗ verkauft | ✔ Schwelle greift |

  Rang-6-Banner würfeln SPD in Schritten von **5 oder 6** pro Ereignis, daher sind die einzigen realistischen Frisch-Werte **5** (Minimum) oder **6** (Maximum). Banner A mit SPD=12 hat beim Aufwerten genau einen Bonus-SPD-Würfel erhalten (6 initial + 1 Wurf von 6). Banner B wurde vollständig aufgewertet ohne Bonus-SPD-Würfel – sein Wert ist bei 6 eingefroren.

  Banner B hat 0 % Verbesserungschance: Sein fester SPD-Wert von 6 wird voraussichtlich gegen jeden noch nicht aufgewerteten Konkurrenten verlieren, dessen zukünftige Würfe ihn übertreffen könnten. Trotzdem bleibt es geschützt, weil es im Standard-Top-2 nach dem **aktuellen** Wert liegt. Die Verbesserungschance kann Teile niemals aus dem Top-N entfernen – nur die Schwellenwert-Erweiterung nutzt sie.

  Banner C (SPD=5, frisch) liegt knapp außerhalb des Top-2 nach aktuellem Wert. Seine Verbesserungschance von 26 % bedeutet, dass es in etwa 1 von 4 simulierten Aufwertungspfaden im Top-2 landen würde. Mit Schwelle ≥ **25 %** wird es geschützt; bei Schwelle ≥ 50 % bleibt es verkauft.

  Hätte Banner C stattdessen mit **SPD=6** begonnen, steigt seine Verbesserungschance auf **68 %** – ein deutlich stärkerer Kandidat. Schwelle ≥ **65 %** würde es schützen.

  **Rang-6-Epic-Banner** erhalten nur **3 SPD-Wurfereignisse** (gegenüber 4 bei legendären, da das +4-Upgrade einen neuen Substat hinzufügt statt einen vorhandenen zu würfeln). Die resultierenden Chancen sind nahezu identisch: SPD=6 frisch → **70 %**, SPD=5 frisch → **26 %**.

  **Empfohlene Schwellenwerte (Rang-6-Ausrüstung):**
  - **65 %** — schützt frische Maximum-Drops (SPD=6, ~68–70 % Chance). Guter Standard, wenn vielversprechende Drops beim Aufwerten erhalten bleiben sollen.
  - **25 %** — schützt auch Minimum-Drops (SPD=5, ~26 % Chance). Weiteres Netz; geeignet, wenn Platz im Inventar kein Problem ist.
  - **100 % vermeiden**: trifft nur vollständig aufgewertete Teile, die bereits im Standard-Top-N gehalten werden – daher bringt es gegenüber dem Standardmodus nichts.

#### Kontingentbereiche auf einen Blick
Mehrere Bereichs-Chips stapeln die Kontingente. Lass `Pro Schutzregel` aktiv, um einen gemeinsamen Pool zu behalten, und kombiniere `Pro Slot`, `Pro Set`, `Pro Fraktion` und `Pro Hauptstat`, wenn Slot × Set × Fraktion × Hauptstat getrennte Quoten erhalten sollen.

| Bereichs-Schalter | Kontingent-Verhalten | Geeignet für |
| --- | --- | --- |
| `Pro Schutzregel` | Ein gemeinsamer Pool für die komplette Schutzregel. | Mindestens fünf SPD-Stiefel unabhängig vom Set sichern. |
| `Pro Slot` | Dupliziert das Kontingent für jeden Slot. | Je zwei Ringe, Amulette und Banner getrennt behalten. |
| `Pro Set` | Erstellt ein eigenes Kontingent pro Set/Metaset. | Zwei Stoneskin- und zwei Protection-Drops separat verfolgen. |
| `Pro Fraktion` | Gibt jeder Fraktion ihr eigenes Budget. | Drei Merciless-Ringe pro Fraktion garantieren. |
| `Pro Hauptstat` | Splittet das Kontingent pro Hauptstat. | ACC- und RES-Banner unabhängig voreinander halten. |

#### Praxisbeispiele

| Szenario | Filter | Benötigte Anzahl | Bereiche | Was der Scanner garantiert |
| --- | --- | --- | --- | --- |
| SPD-Stiefel gehen aus | Slot = Stiefel, Mainstat = SPD, Sets leer | `5` | `Pro Schutzregel` | Mindestens fünf SPD-Stiefel bleiben übrig, egal welches Set. |
| Savage + Lethal mischen | Slot = Handschuhe, Sets = Savage + Lethal, Mainstat = CDMG% | `3` | `Pro Schutzregel` | Drei High-Damage-Handschuhe überleben auch bei wechselnder Set-Mischung. |
| Merciless-Ringe pro Fraktion | Slot = Ring, Set = Merciless, Fraktion leer | `3` | `Pro Fraktion` | Jede Fraktion behält drei eigene Merciless-Ringe. |
| HP%-Ringe pro Fraktion | Slot = Ring, Mainstat = HP%, Sets leer | `2` | `Pro Fraktion` | Zwei HP%-Ringe pro Fraktion bleiben im Inventar. |
| Kern-Schmuckstücke pro Fraktion | Drei Regeln (Ring, Amulett, Banner), Sets/Main leer | `5` | `Pro Fraktion` | Fünf Ringe, Amulette und Banner bestehen pro Fraktion. |
| Stoneskin + Protection pro Fraktion | Slot = Ring/Amulett/Banner, Sets = Stoneskin + Protection, Mainstat leer | `2` | `Pro Set` + `Pro Fraktion` + `Pro Slot` | Jede Fraktion behält zwei Stoneskin- und zwei Protection-Drops pro Schmuckstück-Slot. |
| Schnellste SPD-Schmuckstücke | Slot = Ring/Amulett/Banner, Substats = SPD | `5` | `Pro Schutzregel` | Behält die besten fünf SPD-Substat-Rolls über deine Schmuckstücke hinweg (inkl. Gleichstände). |
| ACC-Banner mit SPD-Rolls | Slot = Banner, Mainstat = ACC, Substats = SPD + ACC, Gewichte: SPD höher | `3` | `Pro Fraktion` | Jede Fraktion behält die besten ACC-Banner, bei denen SPD besonders zählt. |

Tipp: Importiere deine `.db` oder füge Items im Dialog „Ausrüstung” ein, bevor du in den Schutzregeln-Modus wechselst, damit der Scanner echte Ausrüstung bewertet. Klicke eine Schutzregel an, um passende Ausrüstung hervorzuheben; stelle `Filter` auf `Auswahl`, um nur diese Treffer zu sehen.

### Dungeon-Beute (Simulator)
Öffne „Tools" und wechsle zu **Dungeon-Beute**. Es simuliert Dungeon-Drops mit deinen aktuellen Sellfile-Regeln, damit du siehst, wie viel Ausrüstung du pro Set und Aufwertungsstufe behalten würdest.

- Wähle ein Dungeon und eine Stufe.
- Simulationsmodus:
  - `Aufwertung`: Rolls stoppen, sobald das Item verkauft würde, also wie beim echten Aufwerten.
  - `Momentaufnahme`: Rolls laufen immer bis +16, auch wenn das Item vorher verkauft worden wäre.
- Die Tabelle zeigt behaltene Drops geteilt durch alle Drops dieser Stufe bei +0 / +4 / +8 / +12 / +16.
- Klicke auf eine Zelle für Slot- und Mainstat-Aufschlüsselungen, dann öffne **Spezifische Substat-Chancen** für genaue Substat-Wahrscheinlichkeiten und Schätzungen für Durchläufe.

Hinweise:
- Nutzt deine aktuellen Behalten/Verkaufen-Regeln inklusive Finaler Verkauf und Schutzregeln.
- Läuft mit etwa 100.000 Drops pro Stufe und aktualisiert sich währenddessen.
- Drop-Raten und Rolls sind simuliert, die Zahlen sind Schätzungen.

### Ausrüstungsanalyse
Öffne „Tools" und wechsle zum Tab **Ausrüstungsanalyse** für eine Analyseübersicht deiner importierten Ausrüstung.

**KPI-Karten (obere Zeile):** Acht Prozentkarten — **6★-Rate**, **Legendär+**, **Maxed (+16)**, **Angelegt**, **Tresor-gesperrt**, **Chaos'd**, **Glyphed**, **Aufgestiegen** — jeweils mit Tooltip.

**Crossfilter-Donuts:** Sechs Charts — **Slots**, **Rang**, **Seltenheit**, **Ergebnis**, **Quelle**, **Level** — aktualisieren sich gegenseitig beim Klicken.
- Klicke auf ein Segment, um es als Filter für diese Dimension hinzuzufügen; jeder andere Chart grenzt sich sofort auf die passende Ausrüstung ein. Jeder Chart schließt seine eigene Dimension aus, damit er stets seinen vollen Bereich zeigt.
- Doppelklick auf ein Segment im **Slots**-Donut wählt eine ganze Gruppe auf einmal: ein beliebiges Artefakt (Waffe, Helm, Schild, Handschuhe, Brustpanzer, Stiefel) wählt alle sechs Artefakt-Slots; ein Schmuckstück (Ring, Amulett, Banner) wählt alle drei.
- **Slots** und **Quelle** zeigen Kategorie-Icons. Der **Level**-Donut beschriftet jeden Bogen mit seinem Leveltext.


**Sets-Treemap:** Unterhalb der Donuts angezeigt. Jede Kachel steht für ein Gear-Set; die Kachelfläche ist proportional zur Anzahl der Items. Der Kachel-Hintergrund ist von links nach rechts in Ergebnisfarbbänder unterteilt (Verkaufen / Geschützt / Behalten / Kein Treffer). Klicke auf eine Kachel, um dieses Set als Crossfilter hinzuzufügen.

**Filter-Chips:** Aktive Auswahlen für jede Dimension erscheinen als Chips unterhalb der Donuts; klicke das Lösch-Icon auf einem Chip, um nur diesen Filter zu entfernen. Mainstat-Auswahlen erscheinen ebenfalls als Chips. Der Button **Filter löschen** setzt alle Dimensionen auf einmal zurück.

**Mainstat-Balken:** Zeigt, wie oft jeder Mainstat in der gefilterten Ausrüstung vorkommt. Klicke auf einen Balken, um ihn aufzubohren — das Substat-Frequenz-Chart zeigt dann nur Substats aus Ausrüstung mit dem ausgewählten Mainstat. Erneut klicken hebt die Auswahl auf.

**Verbesserungschance:** Wie wahrscheinlich es ist, dass sich deine Ausrüstung verbessert, in 10 %-Schritten gruppiert. Die Zahl rechts gibt an, wie viele Gegenstände in jede Gruppe fallen. Ausrüstung ohne Schutzregel sowie voll aufgewertete +16-Ausrüstung werden ausgelassen. Klicke auf eine Gruppe, um nur diese Ausrüstung anzuzeigen.

**Substat-Frequenz-Radar:** Zeigt, wie oft jeder Substat in der gefilterten (und optional nach Mainstat eingeschränkten) Ausrüstung vorkommt – als Spinnennetz-Diagramm. Klicke auf eine Achsenmarkierung, um sie als Kookkurrenz-Pivot zu wählen – der Radar zeigt dann nur Ausrüstung, die alle gewählten Substats enthält (bis zu 4 Pivots). Aktive Pivots erscheinen als Chips unterhalb des Charts; × entfernt einen einzelnen Chip, **Filter löschen** alle.

**Slot × Mainstat-Heatmap:** Anzahl der Items pro Slot (Spalten) × Mainstat (Zeilen). Klicke auf einen Spaltenheader oder eine Zelle, um nach diesem Slot zu filtern.

**Champion-Stats-Tab:** Substat-Gesamtwerte summiert über angelegte Teile pro Champion. Filtere nach Standort (**Alle** / **Sammlung** / **Tresor**), schalte **Voll ausgerüstet** ein und schließe Glyphen ein oder aus. Zeigt Min/Ø/Median/Max-Reihen.

**Champion-Ausrüstung:** Ausrüstungsabdeckung pro Champion in zwei kompakten Tabellen (**Sammlung** / **Tresor**). Jede Zeile zeigt ein 3×3-Slot-Raster (gefüllt = ausgerüstet, Umriss = leer, gestrichelt = bis zur Aszension gesperrt). Klicke auf einen gefüllten Slot, um das Teil auszuwählen — die Auswahl wird mit dem Ausrüstungsinspektor geteilt. Aktiviere **Verkauf simulieren**, um verkaufte Slots rot zu zeichnen und als fehlend zu zählen, oder **Voll ausgerüstete zeigen**, um auch vollständig ausgerüstete Champions zu listen.

**Buttons:**
- **Snapshot kopieren:** Rendert die vollständige Analyseansicht als PNG und kopiert sie in die Zwischenablage. Hinweis: Die Champion-Ausrüstung wird nicht im Snapshot mit kopiert.
- **Im Ausrüstungsinspektor anwenden:** Überträgt den aktiven Crossfilter in den Listenfilter des Ausrüstungsinspektors (nur sichtbar, wenn ein Filter aktiv ist).

### Rezepte verwalten
- Gespeicherte Rezepte erscheinen als Chips unter dem Builder. Linksklick wählt sie zum Bearbeiten, Rechtsklick öffnet das Kontextmenü (Duplizieren, Verschieben, Kopieren, Löschen). „Delete Rezepte“ entfernt alle Rezepte (mit Sicherheitsabfrage).
- Hover-Verknüpfung: Über einer Rezept schweben markiert alle zugehörigen Zeilen in der Sellfile-Vorschau und umgekehrt.
- Klick-Verknüpfung: Klick auf eine Tabellenzeile wählt automatisch die Rezept aus, von der sie stammt (Basis-HSF-Zeilen bleiben unberührt).
- Zwischenablagen-Fallback: Wenn das Kopieren per API blockiert ist, öffnet ein Dialog mit vorausgewähltem Text zum manuellen Kopieren.
- Rezepte an/aus: Der Schalter im Builder-Header deaktiviert alle Rezepte global, ohne sie zu löschen, und pausiert die Vorschau-Pipeline – nützlich, um schnell einen Export nur mit Schutzregeln zu prüfen oder zu sehen, was der Finale Verkauf allein produziert.

### Sellfile-Vorschau (Regeln & Ausrüstungsinspektor)
- Der Header bündelt den `Regeln`/`Ausrüstungsinspektor`-Schalter, den Button „Tools” und „RSL Helper Sellfile laden”, damit du sofort siehst, wo du die Tabelle wechselst oder den Dialog „Ausrüstung” öffnest.
- Ansicht `Regeln` (Standard): zeigt alle exportierten Regeln inklusive optionaler Basis-`.hsf`-Zeilen. Die Header-Zähler bleiben bei Behalten vs. Verkaufen, die Filterleiste behält die Beliebig/Nur-Chips (`Any/Only`) für Slot/Rang/Seltenheit/Level und beide Rezept-Buttons sind immer sichtbar: „Eingrenzen” blendet Chips aus, deren Regeln den aktuellen Filter nicht bestehen, und die „Auswahl” ist hier ein einfacher An/Aus-Schalter, der Sellfile-Zeilen außerhalb deiner ausgewählten Rezept-Chips versteckt (und dabei den Filterzustand für den Ausrüstungsinspektor vormerkt).
- Ansicht `Ausrüstungsinspektor`: schaltet auf die Liste der importierten Ausrüstung, sodass du externe oder manuell erstellte Items prüfen kannst, ohne den Tools-Dialog erneut zu öffnen. Zähler wechseln zu Behalten/Verkaufen/Bereich/Kein Treffer (nach der Regel „erste passende Rezept gewinnt”), und die Filterleiste zeigt weiterhin beide Rezept-Buttons nebeneinander: „Eingrenzen” für die Chip-Sichtbarkeit sowie die „Auswahl”, die hier als Tri-State (`Off` → `First-Match-Auswertung` → `Nach Treffer`) arbeitet, um die Ausrüstungszeilen zwischen Ersttreffern und beliebigen Treffern zu trennen, während beim Zurückwechseln weiterhin nur die Regeln deiner Auswahl sichtbar bleiben. `.db`-Importe springen automatisch in diese Ansicht; zurück zu `Regeln` kannst du jederzeit.
- Der Button „RSL Helper Sellfile laden” macht genau dasselbe wie Drag & Drop: `.sfc` ersetzt den Builder-Zustand, `.hsf` ergänzt eine optionale Basis-Sellfile, `.db` schieben Ausrüstung direkt in den Ausrüstungsinspektor (ohne deine Rezepte zu ändern). „Leeren” trennt die optionale Basis-`.hsf`.
- Das Paletten-Icon öffnet „Farben verwalten”, um Text- und Hintergrundfarben für Substats anzupassen.
- In `Regeln` bleiben die Spalten „Idx” und „Rezept” erhalten (Basisdatei-Zeilen haben einen leeren Rezept-Wert). Im `Ausrüstungsinspektor` zeigen dieselben Flächen Slot/Set, Item-Stats und das Badge der zuerst passenden Rezept, damit du direkt im Vorschau siehst, was mit jedem Artefakt passieren würde.

### Sellfile-Vorschau: Steuerelemente
- Farben verwalten: Über das Paletten-Icon Farben anpassen; „Auf Standard zurücksetzen“ stellt die empfohlenen Werte wieder her.
- Filter: Drücke `Ctrl+F` (`Cmd+F` auf macOS), um das Panel zu öffnen und sofort die Rezept-Suche zu fokussieren. Rechtsklick auf eine Abschnittsüberschrift (oder `Ctrl`/`Cmd` + Klick auf den Chevron) klappt alle Bereiche gemeinsam ein oder aus. „Eingrenzen” blendet Chips aus, die nicht zum aktiven Filter passen, damit die Tabelle übersichtlich bleibt. „Auswahl” entscheidet, welche Rezepte in der Tabelle erlaubt sind: In `Regeln` ist es ein An/Aus-Schalter, im `Ausrüstungsinspektor`-Modus rotiert es durch `Off` → `First-Match` → `Nach Treffer`.
- Spaltenmenü (Rechtsklick auf Kopfzeile):
  - Spalten zurücksetzen: Standardspalten und -breiten wiederherstellen.
  - Spaltenbreiten anpassen: Breiten automatisch an die Ansicht anpassen.
  - Mehrzeilige Zeilen erlauben: Umschalten für Zeilenumbruch (z. B. Substats).
  - Spalten ein-/ausblenden: Checkboxen pro Spalte.
- Spalten neu anordnen: Kopfzeile horizontal ziehen.
- Spaltenbreite ändern: Rechte Kante der Kopfzeile ziehen.
- Klickverhalten: Tabellenzeilen wählen die zugehörige Rezept (ohne Auto-Scroll). Klick auf einen Rezept-Chip scrollt zur ersten passenden Zeile.

### Ausrüstungsinspektor
- Klicke auf „Tools” im Header der Sellfile-Vorschau, um den Dialog „Ausrüstung” zu öffnen. Erstelle Beispielausrüstung. Die Einträge landen sofort in der Vorschau, daher bleibt dein Raster im Ausrüstungsinspektor auch bei geschlossenem Dialog erhalten.
- Verbinde RSL Helper für Live-Synchronisation (der Connect-Button im Vorschau-Header) oder importiere eine `.db`-Datei durch Ziehen oder den Button „RSL Helper Sellfile laden”.- Jede Zeile zeigt Slot, Set, Level, Mainstat, Substats (inkl. Glyphen und Rollen), die Quelle (Inventar vs. Posteingang) sowie Chips für Behalten/Verkaufen und die zuerst passende Regel/Rezept. Deaktivierte Regeln matchen nie, daher stehen „Kein Treffer”-Zeilen für Ausrüstung, die der Sellfile unverändert lassen würde.
- Die Header-Zähler zeigen Behalten/Verkaufen/Bereich/Kein Treffer. Die vier Ergebnisfilter-Buttons — **Behalten**, **Verkaufen**, **Bereich** und **Kein Treffer** — funktionieren als unabhängige Schalter: jede Kombination lässt sich aktivieren, um die Liste einzugrenzen. **Bereich** dunkelt Items ab (hält sie aber sichtbar), die denselben Set+Slot wie ein zum Verkauf stehendes Stück teilen – so kannst du einen Kandidaten direkt im Vergleich zu seiner Konkurrenz sehen, ohne zwei Filterdurchläufe. Sind zusätzlich eine oder mehrere **Quellen** ausgewählt, fungieren diese als Referenzgruppe – nur als Verkauf markierte Items aus den gewählten Quellen werden zu Haupttreffern, während Begleiter aus *allen* Quellen stammen und du so jedes Exemplar dieser Ausrüstung unabhängig von seinem Standort siehst. **Kein Treffer** zeigt Ausrüstung, die von keiner Regel erfasst wird – nützlich, um Lücken in deinen Rezepten aufzudecken. Kombiniere dies mit dem `First-Match-Auswertung`/`Nach Treffer`-Schalter, um vor dem Export gezielt auf Randfälle zu fokussieren.
- Nutze den Vorschau-Umschalter, um zwischen der Regeln-Tabelle und dem Ausrüstungsinspektor zu wechseln, ohne den Tools-Dialog erneut zu öffnen – perfekt, um die erzeugten Regelzeilen mit der Ausrüstung zu vergleichen, die sie ausgelöst hat.

- **Schutzregel-Rang-Überlagerung:** Im Grid-Menü gibt es eine Schaltfläche **Schutzregel-Rang**, die durchschaltet, was der Rang-Chip jedes Teils anzeigt (nach aktuellem Substat-Wert, **#1** ist der beste; grün = behalten, rot = würde verkauft). **Aus** blendet ihn aus; **Gruppe** zeigt den Rang innerhalb der eigenen Gruppe des Teils — dem Bereich aus Slot / Set / Fraktion / Hauptwert, den die Regel getrennt behält (z. B. **#2**); **Schutzregel** zeigt den Rang über die gesamte Schutzregel (z. B. **#7**); **Beide** zeigt Gruppe, dann Schutzregel als **#2 · #7** (in seiner Gruppe 2., insgesamt 7.). Chip und Tooltip sind nach dem angezeigten Rang sortiert, der Chip zeigt die bestplatzierte passende Regel des Teils, und ein Klick springt zu dieser Regel. Sind Schutzregeln ausgewählt, bezieht sich der Chip auf diese Regeln; ein Teil, das nur von einer *anderen* Regel eingestuft wird, zeigt trotzdem seinen besten Rang, leicht abgeblendet. Erfordert aktivierte Safeguards.

### Ausrüstungs-Diff (Vorher / Nachher)
- Der **Diff**-Schalter in der Kopfzeile des Ausrüstungsinspektors aktiviert einen Vergleich, der zeigt, welche Teile zwischen **Behalten** und **Verkaufen** wechseln, wenn du etwas änderst — praktisch beim Feinjustieren von Rezepten oder beim Ausprobieren der dynamischen Überbrückungen im Notiz-Dialog.
- Ein kleiner Chip neben dem Schalter zeigt die laufende Änderung gegenüber deinem Referenzpunkt: wie viele Teile jetzt mehr (oder weniger) **Verkauft**, **Behalten** und durch **Schutzregeln** geschützt sind.
- Linksklick auf **Diff** öffnet eine **Seite-an-Seite-Vorher/Nachher-Ansicht** der geänderten Teile (links = vorher, rechts = nachher) mit synchronisiertem Scrollen. Erneut klicken zum Schließen.
- Rechtsklick auf den Schalter für Optionen:
  - **Referenz setzen** — friert den aktuellen Stand als „Vorher" ein, mit dem du vergleichst.
  - **Referenz automatisch folgen** (standardmäßig an) — hält das „Vorher" auf deiner letzten Rezept-/Schutzregeln-Änderung, sodass der Diff stets deine jüngste Änderung zeigt.
- Zwei Dinge, die du wissen solltest:
  - Das Umschalten der **dynamischen Überbrückungen** im Notiz-Dialog **summiert sich** — mehrere Überbrückungen zeigen ihre kombinierte Wirkung, nicht nur die letzte.
  - Das Bearbeiten eines Rezepts oder einer Schutzregel im Builder verschiebt die Referenz auf diese Änderung (solange „Referenz automatisch folgen" aktiv ist). Schalte es aus (oder nutze „Referenz setzen"), um alles gegen einen festen Punkt zu vergleichen.
- Deine üblichen Ausrüstungsinspektor-Filter gelten weiterhin: Ein Teil wird angezeigt, wenn es den Filter entweder vorher oder nachher erfüllt.

### Export
- „Zusammengeführte RSL Helper Sellfile exportieren“ exportiert mit Basisdatei, sonst „RSL Helper Sellfile exportieren“.
- Nutze „Rezepte speichern“ und „Rezepte laden“ im Builder-Bereich, um deine Arbeit zu sichern.
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
- `Stream-Helper-DB-to-Creator.bat` startet den DB-Watcher und streamt die Standarddatenbank von RSL Helper in Sellfile Creator, damit du Rezepte live einfacher prüfen kannst.

## Danksagungen

Vielen Dank an **[STBL] Nasgor** für seine unschätzbaren Beiträge,  
an **[SP] Panda** für seine Sellfiles,  
an **KruYseN** für seine Gear-Cleanse-Videos,  
und natürlich an **Farbstoff** für RSL Helper!

## Autor
Erstellt von [STBL] Nusi㊷  
Lokalisierung von AI

© Nusi㊷ - 2026
