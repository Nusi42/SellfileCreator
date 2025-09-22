# RSL Helper Sellfile Creator

Erstelle, prüfe und exportiere Verkaufsregeln für RSL Helper mit einer übersichtlichen Oberfläche.

> Dies ist ein unabhängiges Fan-Projekt. Es besteht keine Verbindung zu Plarium, Raid: Shadow Legends oder RSL Helper. Alle Marken gehören ihren jeweiligen Eigentümern.

## Funktionen
- Regeln erstellen und speichern: baue Konfigurationen und lege dir eine wiederverwendbare Bibliothek an.
- Sellfile-Vorschau: sieh deine erzeugten Regeln – mit oder ohne deine aktuelle Sellfile.
- Vorschau mit deiner aktuellen Sellfile (optional): ziehe deine `.hsf` in die App, um beide zusammen zu sehen. Du kannst auch eine Configs-Datei (`.hsfc`) ablegen. Die Overlay-Anzeige bestätigt, welche Dateien akzeptiert werden.
- Metasets: benenne Gruppen von Sets (z. B. Speed + Wahrnehmung) und nutze sie in mehreren Regeln.
- Export mit einem Klick: exportiere eine HSF-Datei (die RSL Helper Sellfile), die direkt in RSL Helper geladen werden kann.

## Nutzung

### Configs-Datei
- HSFC (`.hsfc`): dein Projektfile für diese App. Betrachte sie als Spielstand, den du laden oder teilen kannst. RSL Helper verwendet HSFC nicht direkt.
- HSF (`.hsf`): die RSL Helper Sellfile. Exportiere sie aus dieser App und lade sie anschließend in RSL Helper.
- Der Standardname beim Speichern lautet `SellfileCreatorRules_YYYYMMDD_HHMM.hsfc`.

### Configs Builder
- Fülle den Configs Builder aus und gib deiner Konfiguration einen eindeutigen „Config-Namen“.
- Klicke auf „Als neue Config hinzufügen“, um sie zu speichern. Wähle die gespeicherte Config in der Liste unter dem Builder aus, um sie zu bearbeiten, und speichere Änderungen mit „Ausgewählte Config aktualisieren“.
- Laden/Speichern: Nutze „Configs laden“ und „Configs speichern“, um deine individuellen Regeln erneut zu verwenden. Beide Aktionen enthalten alles, was nötig ist, um die Vorschau exakt wiederherzustellen.
- Notiz: Über „Notiz hinzufügen“ (oder „Notiz bearbeiten“) kannst du deinem Configs-File eine Notiz anhängen. Beim Laden einer Configs-Datei mit Notiz wird diese automatisch angezeigt.

### Aufbau des Builders (von oben nach unten)
- Aktion: Behalten oder Verkaufen sowie Aktiviert.
  - „Aktiviert“ steuert, ob die Regeln dieser Konfiguration aktiv sind. Wenn deaktiviert, werden sie zwar exportiert, aber von RSL Helper ignoriert. In der Sellfile-Vorschau erscheinen deaktivierte Reihen mit einem weißen Durchstrich; der gespeicherte Config-Name zeigt nur den durchgestrichenen „Behalten/Verkaufen“-Text.
- Rang, Seltenheit, Fraktion, Level.
  - Fraktion (optional) gilt nur für Zubehör (Ring, Amulett, Banner).
  - Level: Wähle Mindest- und Maximal-Level aus +0, +4, +8, +12, +16. Regeln werden für jeden Meilenstein innerhalb dieses Fensters erzeugt.
  - Seltenheit = Auto (empfohlen): Auto wählt die niedrigste Seltenheit, mit der deine Vorgaben im gewählten Levelbereich möglich sind.
    - Keine Mindestrollen gesetzt? Auto hält die Regeln breit und kompatibel mit allen Seltenheiten.
    - Du verlangst 1/2/3/4 Substats bei +0? Auto stellt sicher, dass die Seltenheit mit so vielen Substats starten kann (1 → ≥ Uncommon, 2 → ≥ Rare, 3 → ≥ Epic, 4 → ≥ Legendary).
    - Du verlangst Roll-Anzahlen (z. B. „mindestens 3 Rollen gesamt“)? Auto wählt die Seltenheit, die bis +16 so viele Rollen erreicht. Für 5 Rollen wird Mythical gewählt.
    - Auto-≥-Chip (neben Seltenheit): setzt eine Untergrenze für Auto und fügt bei „Late“ zusätzliche „≥“-Reihen an den relevanten Meilensteinen hinzu.
      - Tippfolge: Uncommon → Rare → Epic. „Auto ≥ Rare“ bedeutet, dass Auto nicht unter ≥ Rare fällt.
      - Funktioniert am besten mit Late + Roll-Mindestwerten. Ist sie inaktiv, siehst du „Auto + Late“ mit einem diagonalen Strich.
      - Beispiel: Banner mit Substats SPD und ATK%, ATK% braucht 2 Rollen. Setze Seltenheit = Auto, Behalten-Modus = Late und Auto ≥ Epic.
        - Du erhältst Epic-Reihen über den Levelbereich hinweg sowie zusätzliche ≥ Legendary-Reihen bei +8/+12 (Legendary bekommt oft die letzte Rolle bei +16).
        - Ergebnis: Epic bleibt strikt im Timing, Legendary fair. Kein Item fällt nur wegen höherer Seltenheit heraus.
    - Präsenz vor +16: Kann deine Seltenheit die gewünschte Anzahl Substats noch nicht besitzen, verwenden die Regeln die Zahl, die an diesem Meilenstein verfügbar ist. Ab +16 gelten deine Zielwerte.

- Mainstat und Substats – dieselben drei Zeilen an Toggle-Buttons:
  1) Any
  2) HP, HP%, ATK, ATK%, DEF, DEF%
  3) SPD, RES, ACC, CR%, CDMG%
  - Mainstat erlaubt Mehrfachauswahl. Keine Auswahl = Any. Bei mehreren Werten erzeugt die App je Mainstat eine Regel.
  - „Any“ dient als schneller Reset. Bei Substats entspricht „Any“ keiner Auswahl; sobald du Substats wählst, wird Any deaktiviert.
  - Substats besitzen drei Zustände: Klick = auswählen; erneut klicken = fixieren (🔒); nochmals klicken = entfernen. Fixierte Substats erscheinen immer in den Regeln. Die Gesamtzahl der angezielten Substats ist max(Erforderlich, Fixiert) und auf 4 begrenzt.
  - Roll-Indikator: ein kleiner Kreis erscheint auf jedem gewählten Substat.
    - Linksklick = erhöhen. Rechtsklick = verringern.
    - Wildcard (★): Rollen dürfen beliebig auf diesem Stat landen und halten die Auswahl offen.
    - Linksklick auf ★ setzt Mindestrollen (grün): 0 → 1 → 2 → 3 → 4 → 5 → ★.
    - Rechtsklick auf ★ setzt Roll-Cap (rot): 0 → 1 → 2 → 3 → 4 → ★. Roll-Cap ist die maximale Roll-Anzahl. Roll-Cap = 0 verbietet Rollen.
    - Min und Roll-Cap schließen sich aus.
- Erforderliche Substats – rechts neben den Substats. Bestimmt, wie viele deiner gewählten Substats vorhanden sein müssen. Fixierte Substats zählen immer mit.
- Auswahl bestehender Sets/Metasets: Die Chips unter der Substat-Sektion zeigen ausgewählte Sets und Metasets.
- Modus Early/Late:
  - Early: Jeder Level-Meilenstein enthält exakt die Verteilungen, die überall bis zum Endziel funktionieren. Für Wildcards + Min Required erzeugt Early alle rollbaren Aufteilungen pro Stufe. Bei Roll-Caps bleiben die Grenzen erhalten.
  - Late: Fordert zu jedem Zeitpunkt nur das Nötigste, damit das Ziel bei +16 erreichbar bleibt. Für Wildcard + Min Required zeigt Late Anwesenheit auf frühen Leveln und setzt die minimalen Splits bei +16 an. Bei per-Stat-Minima erzeugt Late pro Level die minimal erforderlichen Untergrenzen.

Beispiel: Early (2 Substats) – SPD min = 2, CR% min = 1 (Level 0..16)
- +0: SPD ≥ 5, CR ≥ 5
- +4: [10,5] und [5,10]
- +8: [15,5], [10,10], [5,15]
- +12/+16: [15,10]

Beispiel: Late (2 Substats) – SPD min = 2, CR% min = 1 (Level 0..16)
- +0/+4: [5,5]
- +8: [10,5] oder [5,10]
- +12: [15,5] oder [10,10]
- +16: [15,10]

Beispiel: Early (3 Substats) – SPD min = 2, CR% min = 1, CDMG% beliebig, Required = 3
- +0: [SPD, CR, CDMG] ≥ [5,5,5]
- +4: Ein-Roll-Aufteilungen: [10,5,5], [5,10,5], [5,5,10]
- +8: Zwei-Roll-Verteilungen (alle Caps berücksichtigt)
- +12/+16: [15,10,5]

Beispiel: Late (3 Substats) – SPD min = 2, CR% min = 1, CDMG% beliebig, Required = 3
- +0/+4: [5,5,5]
- +8: [10,5,5] oder [5,10,5]
- +12: [15,5,5] oder [10,10,5]
- +16: [15,10,5]

Tipp: Nutze Roll-Caps, um Rollen auf einem Stat zu verbieten. Vom ★ aus Rechtsklick → Roll-Cap, dann auf 0 setzen. So bleibt etwa CDMG% auf Basiswert, während SPD/CR die Rollen erhalten.

Beispiel: Einen Stat sperren, zwei verlangen
- Wähle Substats: SPD, HP, ATK. Klicke SPD zweimal, um es zu sperren (🔒).
- Setze Required Substats = 2.
- Ergebnis: Regeln enthalten SPD+HP und SPD+ATK, aber kein HP+ATK ohne SPD.

Beispiel: Auf drei Stats fokussieren, Rollen auf dem vierten verbieten
- Ziel: Items mit SPD, CR%, CDMG% und einem von HP%/ATK%/DEF% behalten, ohne dass das vierte Stat Rollen bekommt.
- Wähle Substats: SPD, CR%, CDMG%, HP%, ATK%, DEF%.
- Required Substats = 4.
- Rollenanzeige:
  - Ab ★ per Linksklick (Min-Rollen): setze SPD, CR%, CDMG% auf deine Wunsch-Minima (z. B. jeweils 1).
  - Ab ★ per Rechtsklick (Roll-Cap): setze HP%, ATK%, DEF% auf Roll-Cap = 0.
- Ergebnis: Das vierte Stat ist immer eines der drei, erhält aber keine Rollen; SPD/CR%/CDMG% bekommen die Rollen.

Beispiel: Early mit Wildcard (nur ausgewählte Substats)
- Wähle Substats: SPD und ACC.
- Rollenanzeige: SPD Min = 2; ACC = ★ (Wildcard).
- Required Substats: Auto (2).
- Level: Min +0, Max +16.
- Ergebnis: Early zeigt Items, die bis +16 SPD(2) erreichen können (frühe Reihen, in denen entweder SPD oder ACC gerollt hat). Sobald zwei SPD-Rollen möglich sind, erscheint die Mindestreihe.

Beispiel: Summe der Rollen mit Wildcards (2 Substats)
- Wähle Substats: SPD und ACC. Setze beide auf ★.
- Required Substats: 2. Min Required Rolls: 1.
- Early:
  - +4/+8/+12/+16: zwei Reihen – SPD ≥ 10, ACC ≥ 9 und SPD ≥ 5, ACC ≥ 18 (minimale Splits; stabil über alle Meilensteine).
- Late:
  - +0/+4/+8/+12: Präsenz (Minimalbedarf jetzt = 0); +16: die beiden Reihen oben. Mit höheren Min Required-Werten erzwingt Late auf passenden Stufen die minimal nötigen Summen (z. B. bei Min Required = 2 zeigt +12 die Ein-Roll-Splits, +16 die Zwei-Roll-Splits).

## Persistenz & Fehlerbehebung
- Für Fortgeschrittene: Hinweise zu Browser-Speicher und Zwischenablage.
- Beim direkten Öffnen von `index.html` (file://) ist Site Storage oft eingeschränkt:
  - Autosave (Configs, Metasets, Minima) sowie Tabellen-/Farbeinstellungen bleiben ggf. nicht erhalten.
  - „In Zwischenablage kopieren“ kann blockiert werden; die App zeigt dann einen Fallback-Dialog.
- Für verlässliche Speicherung über http(s) bereitstellen (z. B. Vite Dev-Server oder eigener Webserver).
- Wiederherstellungsdialog erscheint nicht? Entweder existiert noch kein Autosave oder du nutzt file://, wo localStorage fehlt bzw. nicht persistent ist.
- Spalten setzen sich zurück? Privates/Inkognito-Browsen oder das Löschen von Seitendaten entfernt gespeicherte Tabellen- und Farbeinstellungen.
- Farben für Farbenblindheit: Rechtsklick auf den Sellfile-Vorschaubalken und „Farbschwachen-Palette“ auswählen. Optionen:
  - Normal: Standardfarben für Erfolg/Warnung/Fehler.
  - Okabe–Ito: Palette für Deuteran-/Protanopie (Blau/Orange/Zinnober).
  - Tritan: Palette für Tritanopie (Grün/Orange/Magenta).
- Diese Einstellung wird lokal gespeichert und gilt appweit überall, wo Erfolg/Warnung/Fehlerfarben verwendet werden.

## Danksagungen

Vielen Dank an [STBL] Nasgor für seine unschätzbaren Beiträge,  
und natürlich auch an Farbstoff für RSL Helper!

## Autor
Erstellt von [STBL] Nusi㊷
Lokalisierung von Codex
