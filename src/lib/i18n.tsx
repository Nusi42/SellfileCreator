/* eslint-disable no-irregular-whitespace */
/**
 * Minimal i18n layer (strictly typed)
 *
 * Why: Keep multi-language support small and dependency-free. We centralize
 * UI strings in typed catalogs and expose a React context with a `t` helper.
 * We persist the selected language in localStorage to keep behavior stable.
 */
import React from 'react'
import { LANG_KEY } from './constants'
import type { Language } from './i18n/types'
import enUS from './i18n/catalogs/en-US'
import deDE from './i18n/catalogs/de-DE'
import frFR from './i18n/catalogs/fr-FR'
import esES from './i18n/catalogs/es-ES'
import ptPT from './i18n/catalogs/pt-PT'
import ruRU from './i18n/catalogs/ru-RU'
import ukUA from './i18n/catalogs/uk-UA'
import trTR from './i18n/catalogs/tr-TR'

// Base (English) catalog is the source of truth for keys
const en = enUS

// Catalogs are defined in src/lib/i18n/catalogs/*.ts and imported above.
/* Legacy inline catalog (de) removed; see git history.
  // HeaderActions
  loadConfigs: 'Konfigurationen laden (.hsfc)',
  configOne: 'Konfiguration',
  configMany: 'Konfigurationen',
  editNote: 'Notiz bearbeiten',
  addNote: 'Notiz hinzufügen',
  saveAllConfigs: 'Alle Konfigurationen speichern (.hsfc)',
  deleteConfigs: 'Konfigurationen löschen',

  // PreviewHeaderActions
  sellfilePreview: 'Verkaufsdatei‑Vorschau',
  manageColors: 'Farben verwalten',
  optionalLoadSellfile: 'Optional: Bestehende Verkaufsdatei laden, um die Zusammenführung anzuzeigen.',
  loadSellfile: 'RSL‑Helper‑Verkaufsdatei laden',
  clear: 'Leeren',
  loadedBaseRuleOne: '1 Basisregel geladen',
  loadedBaseRuleMany: '{n} Basisregeln geladen',
  filtersOn: 'Filter an',
  filtersOff: 'Filter aus',
  filterTooltip: 'Tabelle filtern (nur Ansicht). Export ignoriert Filter.',
  addFinalSellTooltip: 'Verkaufsregeln für nicht passende Gegenstände hinzufügen',
  finalSellOn: 'Finaler Verkauf aktiviert!',
  finalSellOff: 'Kein finaler Verkauf',
  configure: 'Konfigurieren',
  configureFinalSellAria: 'Finalen Verkauf konfigurieren',
  exportIgnoresFilters: 'Export ignoriert Filter',
  exportMergedSellfile: 'Zusammengeführte RSL‑Helper‑Verkaufsdatei exportieren',
  exportSellfile: 'RSL‑Helper‑Verkaufsdatei exportieren',
  manageColorsAria: 'Farben verwalten',
  close: 'Schließen',
  cancel: 'Abbrechen',
  delete: 'Löschen',
  deleteAll: 'Alle löschen',
  reset: 'Zurücksetzen',
  resetToDefaults: 'Auf Standard zurücksetzen',
  restore: 'Wiederherstellen',
  dismiss: 'Verwerfen',
  startTutorial: 'Tutorial starten',
  titleDeleteAllConfigs: 'Alle Konfigurationen löschen?',
  msgDeleteAllConfigs: 'Dies löscht alle benutzerdefinierten Regelkonfigurationen (HSFC). Dieser Vorgang kann nicht rückgängig gemacht werden.',
  titleDeleteConfig: 'Diese Konfiguration löschen?',
  msgDeleteConfig: 'Dies entfernt nur diese Konfiguration aus HSFC.',
  titleDeleteSelectedConfigs: '{n} Konfiguration(en) löschen?',
  msgDeleteSelectedConfigs: 'Dadurch werden die ausgewählten {n} Konfiguration(en) aus HSFC entfernt.',
  titlePasteConfigJson: 'Config‑JSON einfügen',
  msgPasteInstructions: 'Füge eine einzelne Konfiguration, ein Array von Konfigurationen oder ein HSFC‑Objekt mit „Configs“ ein.',
  placeholderPasteExample: 'Beispiel: {example}',
  titleCopyConfigJson: 'Config‑JSON kopieren',
  msgBlockedClipboard: 'Der Browser hat den Zugriff auf die Zwischenablage blockiert. Bitte manuell markieren und kopieren.',
  titleFinalSellRules: 'Finale Verkaufsregeln',
  msgFinalSellExplainer: 'Füge finale Verkaufsregeln für Gegenstände hinzu, die von deinen Behalten‑Regeln nicht erfasst werden.\nWenn „Finaler Verkauf“ aktiviert ist, enthalten diese Regeln explizit alle aktuell bekannten Sets (im Vorschaubildschirm als „Alle aktuell bekannten“ angezeigt; Export mit vollständiger Setliste). Ohne finalen Verkauf werden nicht zugeordnete Gegenstände automatisch behalten. Verkauft wird nur, wenn eine Verkaufsregel greift.',
  labelGearToSell: 'Ausrüstung zum Verkaufen',
  labelLevelRanges: 'Stufenbereiche',
  artifacts: 'Artefakte',
  accessories: 'Schmuckstücke',
  offByDefaultTooltip: 'Standardmäßig aus, um voll aufgewertete Ausrüstung nicht zu verkaufen. Aktivieren kann wertvolle +16‑Gegenstände verkaufen, wenn falsch verwendet.',
  titleSubstatChipColors: 'Substat‑Chip‑Farben',
  msgChooseColors: 'Farben pro Substat wählen.',
  labelText: 'Text',
  labelBg: 'Hintergrund',
  titleManageMinima: 'Minimale Substat‑Werte verwalten',
  msgMinimaHelp: 'Wird zum Generieren von Schwellenwerten auf jeder Stufe verwendet.',
  showLowStars: '1–4★ anzeigen',
  hideLowStars: '1–4★ ausblenden',
  columnSubstat: 'Substat',
  star6: '6★',
  star5: '5★',
  star4: '4★',
  star3: '3★',
  star2: '2★',
  star1: '1★',
  titleResetMinima: 'Minima auf Standard zurücksetzen?',
  msgResetMinima: 'Stellt die empfohlenen Werte aus der Dokumentation wieder her.',
  titleManageMetasets: 'Metasets verwalten',
  addMetaset: 'Metaset hinzufügen',
  titleClearMetaset: 'Sets aus diesem Metaset entfernen?',
  msgClearMetaset: 'Entfernt alle Sets aus dem Metaset. Das Metaset bleibt bestehen.',
  titleDeleteMetaset: 'Dieses Metaset löschen?',
  msgNoRefs: 'Entfernt das Metaset. Keine Konfigurationen verweisen darauf.',
  refsCount: '{n} Konfiguration(en) verweisen auf dieses Metaset.',
  msgChooseUpdate: 'Wähle, wie diese Konfigurationen aktualisiert werden sollen.',
  titleResetMetasets: 'Metasets auf Standard zurücksetzen?',
  msgResetNoRefs: 'Keine Konfigurationen verweisen auf deine Metasets. Die Liste wird durch Standardwerte ersetzt.',
  msgResetSomeRefs: 'Einige Konfigurationen verweisen auf deine Metasets. Wähle, wie sie aktualisiert werden sollen.',

  // Sets search/order controls
  setsSearch: 'Sets suchen',
  setsClearSearch: 'Suche löschen',
  setsTooltipIcons: 'Iconraster‑Ansicht',
  setsTooltipGame: 'In‑Game‑Reihenfolge',
  setsTooltipAz: 'Alphabetisch',

  // File drag overlay
  fileDropTitle: 'Datei zum Laden ablegen',
  fileDropSubtitle: 'Akzeptiert .hsfc (Configs + Metasets) und .hsf (Sellfile)',

  // Sets section labels
  setsTitle: 'Sets',
  setsUsageInConfigs: '({n} Verwendung(en) in Konfigurationen)',
  setsInNames: 'in: {names}',

  // Set tooltip bits
  setPieceCount: '{n} Teil',
  setTooltipNamed: '{name} – {count} Set',

  // Rules table: columns and UI
  colIdx: 'Nr',
  colCfg: 'Cfg',
  colKeep: 'Behalten',
  colUse: 'Nutzen',
  colSets: 'Sets',
  colSlot: 'Slot',
  colRankRarity: 'Rang/Seltenheit',
  colMain: 'Main',
  colLevel: 'Stufe',
  colFaction: 'Fraktion',
  colSub: 'Sub',
  rulesHeaderHelp: '{label} — zum Umordnen ziehen; Ziehgriff am rechten Rand zum Größenändern; Rechtsklick für Optionen',
  rulesEmpty: 'Noch keine RSL‑Helper‑Verkaufsregel.',
  rulesEmptyFiltered: 'Keine Verkaufsregeln aufgrund des Filters.',
  keepValueKeep: 'Behalten',
  keepValueSell: 'Verkaufen',
  setAllKnownShorthand: 'Alle aktuell bekannten',
  // Header menu controls
  rulesMenuWrapRows: 'Mehrzeilige Zeilen',
  rulesMenuSlotsAsIcons: 'Slots als Symbole',
  rulesMenuSetsAsIcons: 'Sets als Symbole',
  rulesMenuColorStatTexts: 'Stat‑Texte färben',
  rulesMenuColorBlindPalette: 'Farbschwachen‑Palette',
  commonOn: 'An',
  commonOff: 'Aus',
  headerMenuResetCols: 'Spalten zurücksetzen',
  headerMenuAuto: 'Auto',
  headerMenuShown: 'Sichtbar',
  headerMenuHidden: 'Versteckt',
  headerMenuShownInTable: 'In Tabelle sichtbar',
  headerMenuHiddenInTable: 'In Tabelle versteckt',
  // Row context menu
  rowMenuClear: 'Leeren',
  rowMenuDuplicate: 'Duplizieren',
  rowMenuMoveTop: 'Nach oben',
  rowMenuMoveUp: 'Hoch',
  rowMenuMoveDown: 'Runter',
  rowMenuMoveBottom: 'Nach unten',
  rowMenuCopy: 'In Zwischenablage kopieren',
  rowMenuPasteAfter: 'Einfügen danach',
  rowMenuDelete: 'Löschen',
  // Color-blind labels
  colorBlindNormal: 'Normal',
  colorBlindOkabeIto: 'Okabe–Ito',
  colorBlindTritan: 'Tritan',

  // Builder panel
  builderConfigName: 'Konfigurationsname',
  builderClearConfigName: 'Konfigurationsname löschen',
  builderAction: 'Aktion',
  builderActionHelp: 'Wähle, was diese Konfiguration tut. Behalten: passendes Gear wird behalten. Verkaufen: passendes Gear wird verkauft.',
  builderEnabledInExport: 'Im Export aktiviert',
  builderDisabledInExport: 'Im Export deaktiviert',
  builderEnabledInSellfile: 'In Sellfile aktiviert',
  builderDisabledInSellfile: 'In Sellfile deaktiviert',
  builderHelpOpen: 'Schnellhilfe öffnen',
  builderRank: 'Rang',
  builderRankHelp: 'Welche Sternränge passen. „Beliebig“ passt alle.',
  any: 'Beliebig',
  builderSubstatValues: 'Substat‑Werte…',
  builderMain: 'Mainstat',
  builderMainHelp: 'Hauptwerte wählen. Leer lassen für Beliebig.',
  builderSlots: 'Slots',
  builderSlotsHelp: 'Nur auf diese Ausrüstungsplätze anwenden.',
  builderMsgClearSets: 'Dies entfernt alle ausgewählten Sets und Metasets für diese Konfiguration.',
  builderInsertAfterSelected: 'Nach Auswahl einfügen',
  builderAddAsNew: 'Als neue Konfig hinzufügen',
  builderSaveChangesToSelected: 'Änderungen an Auswahl speichern',
  builderUnsavedChangesAria: 'ungespeicherte Änderungen',
  builderMsgClearBuilder: 'Dies leert die aktuellen Builder‑Felder und Auswahlen.',

  // Metasets dialog
  metasetsHeaderBlurb: 'Benannte Set‑Gruppen. Diese erscheinen oben im Sets‑Auswahldialog.',
  metasetsMoveUp: 'Nach oben',
  metasetsMoveDown: 'Nach unten',
  metasetsHiddenFromMenus: 'In Menüs versteckt',
  metasetsVisibleInMenus: 'In Menüs sichtbar',
  metasetsUses: '{n} Verwendung(en)',
  metasetsDeleteRemoveRefs: 'Löschen und Verweise entfernen',
  metasetsDeleteReplaceWithSets: 'Durch explizite Sets ersetzen',
  metasetsDeleteReplaceWithMetaset: 'Durch Metaset ersetzen',
  metasetsDeleteRemoveRefsLabel: 'Löschen und Verweise entfernen',
  metasetsDeleteReplaceWithSetsLabel: 'Durch explizite Sets ersetzen',
  metasetsDeleteReplaceWithSetsNotAvailable: 'Durch explizite Sets ersetzen (nicht verfügbar — keine Sets)',
  metasetsDeleteReplaceWithMetasetLabel: 'Durch anderes Metaset ersetzen',
  metasetsNoMetasetsToReplaceWith: 'Keine Metasets zum Ersetzen vorhanden',
  metasetsChooseMetasetPlaceholder: 'Metaset auswählen…',
  metasetsResetRemoveRefs: 'Zurücksetzen und Verweise entfernen',
  metasetsResetUseExplicitSets: 'Zurücksetzen und explizite Sets verwenden',
  metasetsResetUseMetaset: 'Zurücksetzen und Metaset verwenden',
  metasetsResetRemoveRefsLabel: 'Metaset‑Verweise entfernen',
  metasetsResetReplaceWithSetsLabel: 'Verweise durch explizite Sets ersetzen',
  metasetsResetReplaceWithMetasetLabel: 'Verweise durch Metaset ersetzen',
  // Note dialog
  noteTitle: 'Notiz',
  titleClearNote: 'Notiz löschen?',
  msgClearNote: 'Dies entfernt die aktuelle Notiz aus HSFC. Dieser Vorgang kann nicht rückgängig gemacht werden.',
  // Restore autosave dialog
  restoreAutosaveTitle: 'Letzte gespeicherte Konfiguration wiederherstellen?',
  restoreAutosaveQuestion: 'Es wurde eine automatisch gespeicherte Sitzung gefunden. Möchtest du sie wiederherstellen?',
  restoreAutosaveSummary: 'Konfigurationen: {configs} • Metasets: {metas} • Notiz: {note}',
  yes: 'Ja',
  no: 'Nein',

  // New: Builder panel extra labels/help and help-popover
  builderMinLevel: 'Mindeststufe',
  builderMinLevelHelp: 'Früheste Stufe zur Prüfung (+0, +4, …).',
  builderMaxLevel: 'Maximalstufe',
  builderMaxLevelHelp: 'Späteste Stufe zur Prüfung (+0, +4, …).',
  builderFaction: 'Fraktion',
  builderFactionHelp: 'Nur Schmuckstücke (Ring, Amulett, Banner). Andere Ausrüstung ignoriert dies.',
  builderRarityExact: 'Genau',
  builderRarityGte: '≥ Bereiche',
  builderRarityLte: '≤ Bereiche',
  builderRequiredSubstats: 'Erforderliche Substats',
  builderRequiredSubstatsHelp: 'Wie viele deiner ausgewählten Substats der Gegenstand haben muss. Gesperrte Substats zählen immer.',
  builderMinRequiredRolls: 'Mindest‑Rolls',
  builderMinRequiredRollsTip1: 'Minimale Gesamtzahl von Rolls über deine ausgewählten Substats (Summe).',
  builderMinRequiredRollsTip2: '0 bedeutet kein Gesamtminimum. Frühe Meilensteine zeigen nur Regeln, die diese Summe bis +16 noch erreichen können.',
  builderMinRequiredRollsTargetLocked: 'Ziel: Gesperrte Substats',
  builderMinRequiredRollsTargetSelected: 'Ziel: Ausgewählte Substats',
  builderMinRequiredRollsToggleAria: 'Ziel für Mindest‑Rolls umschalten ({target})',
  builderMilestoneThresholdsHelp: 'Wie sich Schwellenwerte vor +16 verhalten, wenn du Roll‑Minima setzt. Wirkt nur, wenn irgendein Substat ein Min > 0 hat oder ein globales Mindest‑Rolls gesetzt ist.',
  builderMinRequiredRollsImpossibleWarn: 'Warnung: Mindest‑Rolls können bis +16 mit aktuellen per‑Stat‑Obergrenzen nicht erreicht werden',
  builderSetsHelp: 'Diese Konfiguration nur auf diese Sets oder Metasets anwenden.',

} */
/* const fr: Catalog = {
  // HeaderActions
  loadConfigs: 'Charger des configurations (.hsfc)',
  configOne: 'configuration',
  configMany: 'configurations',
  editNote: 'Modifier la note',
  addNote: 'Ajouter une note',
  saveAllConfigs: 'Enregistrer toutes les configurations (.hsfc)',
  deleteConfigs: 'Supprimer les configurations',

  // PreviewHeaderActions
  sellfilePreview: 'Aperçu du fichier de vente',
  manageColors: 'Gérer les couleurs',
  optionalLoadSellfile: 'Optionnel : charger un fichier de vente existant pour prévisualiser la fusion.',
  loadSellfile: 'Charger le fichier de vente RSL Helper',
  clear: 'Effacer',
  loadedBaseRuleOne: '1 règle de base chargée',
  loadedBaseRuleMany: '{n} règles de base chargées',
  filtersOn: 'Filtres activés',
  filtersOff: 'Filtres désactivés',
  filterTooltip: 'Filtrer le tableau (vue seulement). L’export ignore les filtres.',
  addFinalSellTooltip: 'Ajouter des règles de vente pour les éléments non correspondants',
  finalSellOn: 'Vente finale activée !',
  finalSellOff: 'Pas de vente finale',
  configure: 'Configurer',
  configureFinalSellAria: 'Configurer la vente finale',
  exportIgnoresFilters: 'L’export ignore les filtres',
  exportMergedSellfile: 'Exporter le fichier de vente RSL Helper fusionné',
  exportSellfile: 'Exporter le fichier de vente RSL Helper',
  manageColorsAria: 'Gérer les couleurs',
  close: 'Fermer',
  cancel: 'Annuler',
  delete: 'Supprimer',
  deleteAll: 'Tout supprimer',
  reset: 'Réinitialiser',
  resetToDefaults: 'Réinitialiser par défaut',
  restore: 'Restaurer',
  dismiss: 'Ignorer',
  startTutorial: 'Démarrer le tutoriel',
  titleDeleteAllConfigs: 'Supprimer toutes les configurations ?',
  msgDeleteAllConfigs: 'Cela supprime toutes les configurations de règles personnalisées (HSFC). Cette action est irréversible.',
  titleDeleteConfig: 'Supprimer cette configuration ?',
  msgDeleteConfig: 'Cela supprime uniquement cette configuration du HSFC.',
  titleDeleteSelectedConfigs: 'Supprimer {n} configuration(s) ?',
  msgDeleteSelectedConfigs: 'Cela supprime les {n} configuration(s) sélectionnées du HSFC.',
  titlePasteConfigJson: 'Coller le JSON de configuration',
  msgPasteInstructions: 'Collez une seule configuration, un tableau de configurations, ou un objet HSFC contenant Configs.',
  placeholderPasteExample: 'Exemple : {example}',
  titleCopyConfigJson: 'Copier le JSON de configuration',
  msgBlockedClipboard: 'Le navigateur a bloqué l’accès au presse‑papiers. Sélectionnez et copiez manuellement.',
  titleFinalSellRules: 'Règles de vente finale',
  msgFinalSellExplainer: 'Ajoutez des règles de vente finale pour les éléments non couverts par vos règles Conserver.\nLorsque la vente finale est activée, ces règles incluent explicitement tous les sets connus (affiché « Tous actuellement connus » dans l’aperçu ; exporté avec la liste complète). Sans vente finale, les éléments non correspondants sont conservés. La vente ne se produit que lorsqu’une règle de vente correspond.',
  labelGearToSell: 'Équipement à vendre',
  labelLevelRanges: 'Plages de niveau',
  artifacts: 'Artefacts',
  accessories: 'Accessoires',
  offByDefaultTooltip: 'Désactivé par défaut pour éviter de vendre les objets au niveau max. L’activer peut vendre des objets +16 de valeur si mal utilisé.',
  titleSubstatChipColors: 'Couleurs des puces de sous‑stats',
  msgChooseColors: 'Choisissez des couleurs par sous‑stat.',
  labelText: 'Texte',
  labelBg: 'Fond',
  titleManageMinima: 'Gérer les valeurs minimales des sous‑stats',
  msgMinimaHelp: 'Utilisé lors de la génération des seuils à chaque niveau.',
  showLowStars: 'Afficher 1–4★',
  hideLowStars: 'Masquer 1–4★',
  columnSubstat: 'Sous‑stat',
  star6: '6★',
  star5: '5★',
  star4: '4★',
  star3: '3★',
  star2: '2★',
  star1: '1★',
  titleResetMinima: 'Réinitialiser les minima par défaut ?',
  msgResetMinima: 'Restaure les valeurs recommandées de la documentation.',
  titleManageMetasets: 'Gérer les méta‑sets',
  addMetaset: 'Ajouter un méta‑set',
  titleClearMetaset: 'Vider les sets de ce méta‑set ?',
  msgClearMetaset: 'Cela retire tous les sets du méta‑set. Le méta‑set reste.',
  titleDeleteMetaset: 'Supprimer ce méta‑set ?',
  msgNoRefs: 'Supprime le méta‑set. Aucune configuration ne s’y réfère.',
  refsCount: '{n} configuration(s) référencent ce méta‑set.',
  msgChooseUpdate: 'Choisissez comment mettre à jour ces configurations.',
  titleResetMetasets: 'Réinitialiser les méta‑sets par défaut ?',
  msgResetNoRefs: 'Aucune configuration ne référence vos méta‑sets. La liste sera remplacée par les valeurs par défaut.',
  msgResetSomeRefs: 'Certaines configurations référencent vos méta‑sets. Choisissez comment les mettre à jour.',

  // Sets search/order controls
  setsSearch: 'Rechercher des sets',
  setsClearSearch: 'Effacer la recherche',
  setsTooltipIcons: 'Vue en grille d’icônes',
  setsTooltipGame: 'Ordre du jeu',
  setsTooltipAz: 'Alphabétique',

  // File drag overlay
  fileDropTitle: 'Déposez un fichier à charger',
  fileDropSubtitle: 'Accepte .hsfc (configs + méta‑sets) et .hsf (sellfile)',

  // Sets section labels
  setsTitle: 'Sets',
  setsUsageInConfigs: '({n} utilisation(s) dans les configs)',
  setsInNames: 'dans : {names}',

  // Set tooltip bits
  setPieceCount: '{n} pièce',
  setTooltipNamed: '{name} – {count}',

  // Rules table: columns and UI
  colIdx: 'N°',
  colCfg: 'Cfg',
  colKeep: 'Garder',
  colUse: 'Utiliser',
  colSets: 'Sets',
  colSlot: 'Empl.',
  colRankRarity: 'Rang/Rareté',
  colMain: 'Principal',
  colLevel: 'Niveau',
  colFaction: 'Faction',
  colSub: 'Sous',
  rulesHeaderHelp: '{label} — glisser pour réordonner ; poignée à droite pour redimensionner ; clic droit pour options',
  rulesEmpty: 'Aucune règle de vente RSL Helper pour le moment.',
  rulesEmptyFiltered: 'Aucune règle à cause du filtre.',
  keepValueKeep: 'Garder',
  keepValueSell: 'Vendre',
  setAllKnownShorthand: 'Tous actuellement connus',
  // Header menu controls
  rulesMenuWrapRows: 'Lignes multi‑lignes',
  rulesMenuSlotsAsIcons: 'Emplacements en icônes',
  rulesMenuSetsAsIcons: 'Sets en icônes',
  rulesMenuColorStatTexts: 'Colorer les textes des stats',
  rulesMenuColorBlindPalette: 'Palette daltonien',
  commonOn: 'Activé',
  commonOff: 'Désactivé',
  headerMenuResetCols: 'Réinitialiser les colonnes',
  headerMenuAuto: 'Auto',
  headerMenuShown: 'Affiché',
  headerMenuHidden: 'Masqué',
  headerMenuShownInTable: 'Affiché dans le tableau',
  headerMenuHiddenInTable: 'Masqué dans le tableau',
  // Row context menu
  rowMenuClear: 'Effacer',
  rowMenuDuplicate: 'Dupliquer',
  rowMenuMoveTop: 'Déplacer en haut',
  rowMenuMoveUp: 'Monter',
  rowMenuMoveDown: 'Descendre',
  rowMenuMoveBottom: 'Déplacer en bas',
  rowMenuCopy: 'Copier dans le presse‑papiers',
  rowMenuPasteAfter: 'Coller après',
  rowMenuDelete: 'Supprimer',
  // Color-blind labels
  colorBlindNormal: 'Normal',
  colorBlindOkabeIto: 'Okabe–Ito',
  colorBlindTritan: 'Tritan',

  // Builder panel
  builderConfigName: 'Nom de la configuration',
  builderClearConfigName: 'Effacer le nom',
  builderAction: 'Action',
  builderActionHelp: 'Choisissez ce que fait cette configuration. Garder : garde l’équipement correspondant. Vendre : vend l’équipement correspondant.',
  builderEnabledInExport: 'Activé dans l’export',
  builderDisabledInExport: 'Désactivé dans l’export',
  builderEnabledInSellfile: 'Activé dans le fichier de vente',
  builderDisabledInSellfile: 'Désactivé dans le fichier de vente',
  builderHelpOpen: 'Ouvrir l’aide rapide',
  builderRank: 'Rang',
  builderRankHelp: 'Quels rangs d’étoiles correspondent. « Tous » correspond à tous.',
  any: 'Tous',
  builderSubstatValues: 'Valeurs des sous‑stats…',
  builderMain: 'Stat principale',
  builderMainHelp: 'Choisissez la(les) stat(s) principale(s). Laissez vide pour Tous.',
  builderSlots: 'Emplacements',
  builderSlotsHelp: 'N’appliquer cette configuration qu’à ces emplacements.',
  builderMsgClearSets: 'Supprime tous les sets et méta‑sets sélectionnés pour cette configuration.',
  builderInsertAfterSelected: 'Insérer après la sélection',
  builderAddAsNew: 'Ajouter comme nouvelle config',
  builderSaveChangesToSelected: 'Enregistrer les modifications sur la sélection',
  builderUnsavedChangesAria: 'modifications non enregistrées',
  builderMsgClearBuilder: 'Efface les champs et sélections actuels du builder.',

  // Metasets dialog
  metasetsHeaderBlurb: 'Groupes nommés de sets. Ils apparaissent en haut du sélecteur de sets.',
  metasetsMoveUp: 'Monter',
  metasetsMoveDown: 'Descendre',
  metasetsHiddenFromMenus: 'Masqué dans les menus',
  metasetsVisibleInMenus: 'Visible dans les menus',
  metasetsUses: '{n} utilisation(s)',
  metasetsDeleteRemoveRefs: 'Supprimer et retirer les références',
  metasetsDeleteReplaceWithSets: 'Remplacer par des sets explicites',
  metasetsDeleteReplaceWithMetaset: 'Remplacer par un méta‑set',
  metasetsDeleteRemoveRefsLabel: 'Supprimer et retirer les références',
  metasetsDeleteReplaceWithSetsLabel: 'Remplacer par des sets explicites',
  metasetsDeleteReplaceWithSetsNotAvailable: 'Remplacer par des sets explicites (indisponible — aucun set)',
  metasetsDeleteReplaceWithMetasetLabel: 'Remplacer par un autre méta‑set',
  metasetsNoMetasetsToReplaceWith: 'Aucun méta‑set pour remplacer',
  metasetsChooseMetasetPlaceholder: 'Choisir un méta‑set…',
  metasetsResetRemoveRefs: 'Réinitialiser et retirer les références',
  metasetsResetUseExplicitSets: 'Réinitialiser et utiliser des sets explicites',
  metasetsResetUseMetaset: 'Réinitialiser et utiliser un méta‑set',
  metasetsResetRemoveRefsLabel: 'Supprimer les références aux méta‑sets',
  metasetsResetReplaceWithSetsLabel: 'Remplacer les références par des sets explicites',
  metasetsResetReplaceWithMetasetLabel: 'Remplacer les références par un méta‑set',
  // Note dialog
  noteTitle: 'Note',
  titleClearNote: 'Effacer la note ?',
  msgClearNote: 'Cela supprimera la note actuelle du HSFC. Cette action est irréversible.',
  // Restore autosave dialog
  restoreAutosaveTitle: 'Restaurer la dernière configuration enregistrée ?',
  restoreAutosaveQuestion: 'Une session auto‑sauvegardée a été trouvée. Voulez‑vous la restaurer ?',
  restoreAutosaveSummary: 'Configs : {configs} • Méta‑sets : {metas} • Note : {note}',
  yes: 'Oui',
  no: 'Non',

  // New: Builder panel extra labels/help and help-popover
  builderMinLevel: 'Niveau min',
  builderMinLevelHelp: 'Niveau le plus tôt à vérifier (+0, +4, …).',
  builderMaxLevel: 'Niveau max',
  builderMaxLevelHelp: 'Niveau le plus tard à vérifier (+0, +4, …).',
  builderFaction: 'Faction',
  builderFactionHelp: 'Accessoires uniquement (bague, amulette, bannière). Les autres équipements ignorent ce réglage.',
  builderRarityExact: 'Exact',
  builderRarityGte: 'Plages ≥',
  builderRarityLte: 'Plages ≤',
  builderRequiredSubstats: 'Sous‑stats requises',
  builderRequiredSubstatsHelp: 'Combien de sous‑stats choisies l’objet doit avoir. Les sous‑stats verrouillées comptent toujours.',
  builderMinRequiredRolls: 'Lancers min requis',
  builderMinRequiredRollsTip1: 'Nombre total minimal de lancers sur vos sous‑stats choisies (somme).',
  builderMinRequiredRollsTip2: '0 signifie aucun minimum global. Les premiers jalons affichent seulement des règles qui peuvent encore atteindre cette somme à +16.',
  builderMinRequiredRollsTargetLocked: 'Cible : Sous‑stats verrouillées',
  builderMinRequiredRollsTargetSelected: 'Cible : Sous‑stats sélectionnées',
  builderMinRequiredRollsToggleAria: 'Basculer la cible des lancers min ({target})',
  builderMilestoneThresholdsHelp: 'Comportement des seuils avant +16 lorsque des minima de lancers sont définis. Affecte seulement s’il existe un Min > 0 sur une sous‑stat ou un minimum global.',
  builderMinRequiredRollsImpossibleWarn: 'Avertissement : les lancers min ne peuvent pas être atteints à +16 avec les plafonds par stat actuels',
  builderSetsHelp: 'Appliquer cette configuration uniquement à ces sets ou méta‑sets.',

} */
/* const es: Catalog = {
  // HeaderActions
  loadConfigs: 'Cargar configuraciones (.hsfc)',
  configOne: 'configuración',
  configMany: 'configuraciones',
  editNote: 'Editar nota',
  addNote: 'Añadir nota',
  saveAllConfigs: 'Guardar todas las configuraciones (.hsfc)',
  deleteConfigs: 'Eliminar configuraciones',

  // PreviewHeaderActions
  sellfilePreview: 'Vista previa del archivo de venta',
  manageColors: 'Gestionar colores',
  optionalLoadSellfile: 'Opcional: carga un archivo de venta existente para previsualizar la fusión.',
  loadSellfile: 'Cargar archivo de venta de RSL Helper',
  clear: 'Limpiar',
  loadedBaseRuleOne: '1 regla base cargada',
  loadedBaseRuleMany: 'Se cargaron {n} reglas base',
  filtersOn: 'Filtros activados',
  filtersOff: 'Filtros desactivados',
  filterTooltip: 'Filtra la tabla (solo vista). La exportación ignora los filtros.',
  addFinalSellTooltip: 'Añadir reglas de venta para elementos no coincidentes',
  finalSellOn: '¡Venta final activada!',
  finalSellOff: 'Sin venta final',
  configure: 'Configurar',
  configureFinalSellAria: 'Configurar venta final',
  exportIgnoresFilters: 'La exportación ignora los filtros',
  exportMergedSellfile: 'Exportar archivo de venta de RSL Helper fusionado',
  exportSellfile: 'Exportar archivo de venta de RSL Helper',
  manageColorsAria: 'Gestionar colores',
  close: 'Cerrar',
  cancel: 'Cancelar',
  delete: 'Eliminar',
  deleteAll: 'Eliminar todo',
  reset: 'Restablecer',
  resetToDefaults: 'Restablecer a valores predeterminados',
  restore: 'Restaurar',
  dismiss: 'Descartar',
  startTutorial: 'Iniciar tutorial',
  titleDeleteAllConfigs: '¿Eliminar todas las configuraciones?',
  msgDeleteAllConfigs: 'Esto eliminará todas las configuraciones de reglas personalizadas (HSFC). Esta acción no se puede deshacer.',
  titleDeleteConfig: '¿Eliminar esta configuración?',
  msgDeleteConfig: 'Esto eliminará solo esta configuración del HSFC.',
  titleDeleteSelectedConfigs: '¿Eliminar {n} configuración(es)?',
  msgDeleteSelectedConfigs: 'Esto eliminará las {n} configuración(es) seleccionadas del HSFC.',
  titlePasteConfigJson: 'Pegar JSON de configuración',
  msgPasteInstructions: 'Pega una sola configuración, un arreglo de configuraciones o un objeto HSFC que contenga Configs.',
  placeholderPasteExample: 'Ejemplo: {example}',
  titleCopyConfigJson: 'Copiar JSON de configuración',
  msgBlockedClipboard: 'El navegador bloqueó el acceso al portapapeles. Selecciona y copia manualmente.',
  titleFinalSellRules: 'Reglas de venta final',
  msgFinalSellExplainer: 'Agrega reglas de venta final para elementos no cubiertos por tus reglas de Conservar.\nCuando la venta final está activada, estas reglas incluyen explícitamente todos los sets conocidos (mostrado como “Todos los conocidos” en la vista previa; exportado con la lista completa). Sin venta final, los elementos no coincidentes se conservan. La venta solo ocurre cuando una regla de venta coincide.',
  labelGearToSell: 'Equipo a vender',
  labelLevelRanges: 'Rangos de nivel',
  artifacts: 'Artefactos',
  accessories: 'Accesorios',
  offByDefaultTooltip: 'Desactivado por defecto para evitar vender equipo al nivel máximo. Activarlo puede vender objetos +16 valiosos si se usa mal.',
  titleSubstatChipColors: 'Colores de las chips de substats',
  msgChooseColors: 'Elige colores por substat.',
  labelText: 'Texto',
  labelBg: 'Fondo',
  titleManageMinima: 'Gestionar valores mínimos de substats',
  msgMinimaHelp: 'Se usa al generar umbrales en cada nivel.',
  showLowStars: 'Mostrar 1–4★',
  hideLowStars: 'Ocultar 1–4★',
  columnSubstat: 'Substat',
  star6: '6★',
  star5: '5★',
  star4: '4★',
  star3: '3★',
  star2: '2★',
  star1: '1★',
  titleResetMinima: '¿Restablecer mínimos a los predeterminados?',
  msgResetMinima: 'Restaura los valores recomendados de la documentación.',
  titleManageMetasets: 'Gestionar meta‑sets',
  addMetaset: 'Añadir meta‑set',
  titleClearMetaset: '¿Vaciar los sets de este meta‑set?',
  msgClearMetaset: 'Elimina todos los sets del meta‑set. El meta‑set permanece.',
  titleDeleteMetaset: '¿Eliminar este meta‑set?',
  msgNoRefs: 'Elimina el meta‑set. Ninguna configuración lo referencia.',
  refsCount: '{n} configuración(es) referencian este meta‑set.',
  msgChooseUpdate: 'Elige cómo actualizar esas configuraciones.',
  titleResetMetasets: '¿Restablecer meta‑sets a los predeterminados?',
  msgResetNoRefs: 'Ninguna configuración referencia tus meta‑sets. La lista será reemplazada por los valores predeterminados.',
  msgResetSomeRefs: 'Algunas configuraciones referencian tus meta‑sets. Elige cómo actualizarlas.',

  // Sets search/order controls
  setsSearch: 'Buscar sets',
  setsClearSearch: 'Borrar búsqueda',
  setsTooltipIcons: 'Vista de cuadrícula de iconos',
  setsTooltipGame: 'Orden del juego',
  setsTooltipAz: 'Alfabético',

  // File drag overlay
  fileDropTitle: 'Suelta el archivo para cargar',
  fileDropSubtitle: 'Acepta .hsfc (configs + meta‑sets) y .hsf (sellfile)',

  // Sets section labels
  setsTitle: 'Conjuntos',
  setsUsageInConfigs: '({n} uso(s) en configuraciones)',
  setsInNames: 'en: {names}',

  // Set tooltip bits
  setPieceCount: '{n} pieza',
  setTooltipNamed: '{name} – {count} conjunto',

  // Rules table: columns and UI
  colIdx: 'N.º',
  colCfg: 'Cfg',
  colKeep: 'Conservar',
  colUse: 'Usar',
  colSets: 'Conjuntos',
  colSlot: 'Ranura',
  colRankRarity: 'Rango/Rareza',
  colMain: 'Principal',
  colLevel: 'Nivel',
  colFaction: 'Facción',
  colSub: 'Sub',
  rulesHeaderHelp: '{label} — arrastra para reordenar; asa derecha para redimensionar; clic derecho para opciones',
  rulesEmpty: 'Aún no hay reglas de venta de RSL Helper.',
  rulesEmptyFiltered: 'Sin reglas debido al filtro.',
  keepValueKeep: 'Conservar',
  keepValueSell: 'Vender',
  setAllKnownShorthand: 'Todos los conocidos',
  // Header menu controls
  rulesMenuWrapRows: 'Filas multi‑línea',
  rulesMenuSlotsAsIcons: 'Ranuras como iconos',
  rulesMenuSetsAsIcons: 'Conjuntos como iconos',
  rulesMenuColorStatTexts: 'Colorear textos de stats',
  rulesMenuColorBlindPalette: 'Paleta daltónica',
  commonOn: 'Activado',
  commonOff: 'Desactivado',
  headerMenuResetCols: 'Restablecer columnas',
  headerMenuAuto: 'Auto',
  headerMenuShown: 'Mostrado',
  headerMenuHidden: 'Oculto',
  headerMenuShownInTable: 'Mostrado en la tabla',
  headerMenuHiddenInTable: 'Oculto en la tabla',
  // Row context menu
  rowMenuClear: 'Limpiar',
  rowMenuDuplicate: 'Duplicar',
  rowMenuMoveTop: 'Mover al principio',
  rowMenuMoveUp: 'Subir',
  rowMenuMoveDown: 'Bajar',
  rowMenuMoveBottom: 'Mover al final',
  rowMenuCopy: 'Copiar al portapapeles',
  rowMenuPasteAfter: 'Pegar después',
  rowMenuDelete: 'Eliminar',
  // Color-blind labels
  colorBlindNormal: 'Normal',
  colorBlindOkabeIto: 'Okabe–Ito',
  colorBlindTritan: 'Tritán',

  // Builder panel
  builderConfigName: 'Nombre de configuración',
  builderClearConfigName: 'Borrar nombre de configuración',
  builderAction: 'Acción',
  builderActionHelp: 'Elige lo que hace esta configuración. Conservar: mantiene el equipo coincidente. Vender: vende el equipo coincidente.',
  builderEnabledInExport: 'Activado en el export',
  builderDisabledInExport: 'Desactivado en el export',
  builderEnabledInSellfile: 'Activado en Sellfile',
  builderDisabledInSellfile: 'Desactivado en Sellfile',
  builderHelpOpen: 'Abrir ayuda rápida',
  builderRank: 'Rango',
  builderRankHelp: 'Qué rangos de estrellas coinciden. “Cualquiera” coincide con todos.',
  any: 'Cualquiera',
  builderSubstatValues: 'Valores de substats…',
  builderMain: 'Stat principal',
  builderMainHelp: 'Elige stat(s) principal(es). Deja vacío para Cualquiera.',
  builderSlots: 'Ranuras',
  builderSlotsHelp: 'Aplicar solo a estas ranuras.',
  builderMsgClearSets: 'Elimina todos los conjuntos y meta‑sets seleccionados para esta configuración.',
  builderInsertAfterSelected: 'Insertar después de la selección',
  builderAddAsNew: 'Agregar como nueva config',
  builderSaveChangesToSelected: 'Guardar cambios en la selección',
  builderUnsavedChangesAria: 'cambios no guardados',
  builderMsgClearBuilder: 'Esto borra los campos y selecciones actuales del builder.',

  // Metasets dialog
  metasetsHeaderBlurb: 'Grupos con nombre de conjuntos. Aparecen en la parte superior del selector de sets.',
  metasetsMoveUp: 'Subir',
  metasetsMoveDown: 'Bajar',
  metasetsHiddenFromMenus: 'Oculto en menús',
  metasetsVisibleInMenus: 'Visible en menús',
  metasetsUses: '{n} uso(s)',
  metasetsDeleteRemoveRefs: 'Eliminar y quitar referencias',
  metasetsDeleteReplaceWithSets: 'Reemplazar por sets explícitos',
  metasetsDeleteReplaceWithMetaset: 'Reemplazar por meta‑set',
  metasetsDeleteRemoveRefsLabel: 'Eliminar y quitar referencias',
  metasetsDeleteReplaceWithSetsLabel: 'Reemplazar por sets explícitos',
  metasetsDeleteReplaceWithSetsNotAvailable: 'Reemplazar por sets explícitos (no disponible — sin sets)',
  metasetsDeleteReplaceWithMetasetLabel: 'Reemplazar por otro meta‑set',
  metasetsNoMetasetsToReplaceWith: 'No hay meta‑sets para reemplazar',
  metasetsChooseMetasetPlaceholder: 'Elegir meta‑set…',
  metasetsResetRemoveRefs: 'Restablecer y quitar referencias',
  metasetsResetUseExplicitSets: 'Restablecer y usar sets explícitos',
  metasetsResetUseMetaset: 'Restablecer y usar meta‑set',
  metasetsResetRemoveRefsLabel: 'Eliminar referencias a meta‑sets',
  metasetsResetReplaceWithSetsLabel: 'Reemplazar referencias por sets explícitos',
  metasetsResetReplaceWithMetasetLabel: 'Reemplazar referencias por meta‑set',
  // Note dialog
  noteTitle: 'Nota',
  titleClearNote: '¿Borrar nota?',
  msgClearNote: 'Esto eliminará la nota actual de HSFC. Esta acción no se puede deshacer.',
  // Restore autosave dialog
  restoreAutosaveTitle: '¿Restaurar la última configuración guardada?',
  restoreAutosaveQuestion: 'Se encontró una sesión autoguardada. ¿Deseas restaurarla?',
  restoreAutosaveSummary: 'Configs: {configs} • Meta‑sets: {metas} • Nota: {note}',
  yes: 'Sí',
  no: 'No',

  // New: Builder panel extra labels/help and help-popover
  builderMinLevel: 'Nivel mínimo',
  builderMinLevelHelp: 'Nivel más temprano a comprobar (+0, +4, …).',
  builderMaxLevel: 'Nivel máximo',
  builderMaxLevelHelp: 'Nivel más tardío a comprobar (+0, +4, …).',
  builderFaction: 'Facción',
  builderFactionHelp: 'Solo accesorios (anillo, amuleto, estandarte). El resto de equipo lo ignora.',
  builderRarityExact: 'Exacto',
  builderRarityGte: 'Rangos ≥',
  builderRarityLte: 'Rangos ≤',
  builderRequiredSubstats: 'Substats requeridos',
  builderRequiredSubstatsHelp: 'Cuántos de tus substats elegidos debe tener el objeto. Los bloqueados siempre cuentan.',
  builderMinRequiredRolls: 'Tiradas mínimas requeridas',
  builderMinRequiredRollsTip1: 'Total mínimo de tiradas sobre tus substats elegidos (suma).',
  builderMinRequiredRollsTip2: '0 significa sin mínimo global. Los hitos tempranos solo muestran reglas que aún pueden alcanzar esta suma a +16.',
  builderMinRequiredRollsTargetLocked: 'Objetivo: Substats bloqueados',
  builderMinRequiredRollsTargetSelected: 'Objetivo: Substats seleccionados',
  builderMinRequiredRollsToggleAria: 'Alternar objetivo de tiradas mínimas ({target})',
  builderMilestoneThresholdsHelp: 'Cómo se comportan los umbrales antes de +16 cuando estableces mínimos de tiradas. Afecta solo si algún substat tiene Min > 0 o si hay un mínimo global.',
  builderMinRequiredRollsImpossibleWarn: 'Aviso: las tiradas mínimas no pueden alcanzarse para +16 con los topes por stat actuales',
  builderSetsHelp: 'Aplicar esta configuración solo a estos sets o meta‑sets.',


} */
/* const pt: Catalog = {
  // HeaderActions
  loadConfigs: 'Carregar configurações (.hsfc)',
  configOne: 'configuração',
  configMany: 'configurações',
  editNote: 'Editar nota',
  addNote: 'Adicionar nota',
  saveAllConfigs: 'Salvar todas as configurações (.hsfc)',
  deleteConfigs: 'Excluir configurações',

  // PreviewHeaderActions
  sellfilePreview: 'Prévia do arquivo de venda',
  manageColors: 'Gerenciar cores',
  optionalLoadSellfile: 'Opcional: carregue um arquivo de venda existente para pré-visualizar a mesclagem.',
  loadSellfile: 'Carregar arquivo de venda do RSL Helper',
  clear: 'Limpar',
  loadedBaseRuleOne: '1 regra base carregada',
  loadedBaseRuleMany: '{n} regras base carregadas',
  filtersOn: 'Filtros ativados',
  filtersOff: 'Filtros desativados',
  filterTooltip: 'Filtre a tabela (somente visualização). A exportação ignora os filtros.',
  addFinalSellTooltip: 'Adicionar regras de venda para itens não correspondentes',
  finalSellOn: 'Venda final ativada!',
  finalSellOff: 'Sem venda final',
  configure: 'Configurar',
  configureFinalSellAria: 'Configurar venda final',
  exportIgnoresFilters: 'A exportação ignora os filtros',
  exportMergedSellfile: 'Exportar arquivo de venda do RSL Helper mesclado',
  exportSellfile: 'Exportar arquivo de venda do RSL Helper',
  manageColorsAria: 'Gerenciar cores',
  close: 'Fechar',
  cancel: 'Cancelar',
  delete: 'Excluir',
  deleteAll: 'Excluir tudo',
  reset: 'Redefinir',
  resetToDefaults: 'Redefinir para padrões',
  restore: 'Restaurar',
  dismiss: 'Descartar',
  startTutorial: 'Iniciar tutorial',
  titleDeleteAllConfigs: 'Excluir todas as configurações?',
  msgDeleteAllConfigs: 'Isto excluirá todas as configurações de regras personalizadas (HSFC). Esta ação não pode ser desfeita.',
  titleDeleteConfig: 'Excluir esta configuração?',
  msgDeleteConfig: 'Isto removerá apenas esta configuração do HSFC.',
  titleDeleteSelectedConfigs: 'Excluir {n} configurações?',
  msgDeleteSelectedConfigs: 'Isto removerá as {n} configurações selecionadas do HSFC.',
  titlePasteConfigJson: 'Colar JSON da configuração',
  msgPasteInstructions: 'Cole uma única configuração, um array de configurações ou um objeto HSFC contendo Configs.',
  placeholderPasteExample: 'Exemplo: {example}',
  titleCopyConfigJson: 'Copiar JSON da configuração',
  msgBlockedClipboard: 'O navegador bloqueou o acesso à área de transferência. Selecione e copie manualmente.',
  titleFinalSellRules: 'Regras de venda final',
  msgFinalSellExplainer: 'Adicione regras de venda final para itens não cobertos por suas regras de Manter.\nQuando a venda final está ativada, essas regras incluem explicitamente todos os conjuntos conhecidos (mostrado como “Todos os atualmente conhecidos” na prévia; exportado com a lista completa). Sem venda final, os itens não correspondentes são mantidos. A venda só ocorre quando uma regra de venda corresponde.',
  labelGearToSell: 'Equipamentos para vender',
  labelLevelRanges: 'Intervalos de nível',
  artifacts: 'Artefatos',
  accessories: 'Acessórios',
  offByDefaultTooltip: 'Desativado por padrão para evitar vender equipamentos no nível máximo. Ativar pode vender itens +16 valiosos se mal utilizado.',
  titleSubstatChipColors: 'Cores dos chips de substats',
  msgChooseColors: 'Escolha cores por substat.',
  labelText: 'Texto',
  labelBg: 'Fundo',
  titleManageMinima: 'Gerenciar valores mínimos de substats',
  msgMinimaHelp: 'Usado ao gerar limiares em cada nível.',
  showLowStars: 'Mostrar 1–4★',
  hideLowStars: 'Ocultar 1–4★',
  columnSubstat: 'Substat',
  star6: '6★',
  star5: '5★',
  star4: '4★',
  star3: '3★',
  star2: '2★',
  star1: '1★',
  titleResetMinima: 'Redefinir mínimos para padrões?',
  msgResetMinima: 'Restaura os valores recomendados da documentação.',
  titleManageMetasets: 'Gerenciar meta‑sets',
  addMetaset: 'Adicionar meta‑set',
  titleClearMetaset: 'Limpar sets deste meta‑set?',
  msgClearMetaset: 'Remove todos os sets do meta‑set. O meta‑set permanece.',
  titleDeleteMetaset: 'Excluir este meta‑set?',
  msgNoRefs: 'Remove o meta‑set. Nenhuma configuração o referencia.',
  refsCount: '{n} configuração(ões) referenciam este meta‑set.',
  msgChooseUpdate: 'Escolha como atualizar essas configurações.',
  titleResetMetasets: 'Redefinir meta‑sets para padrões?',
  msgResetNoRefs: 'Nenhuma configuração referencia seus meta‑sets. A lista será substituída pelos padrões.',
  msgResetSomeRefs: 'Algumas configurações referenciam seus meta‑sets. Escolha como atualizá‑las.',

  // Sets search/order controls
  setsSearch: 'Pesquisar sets',
  setsClearSearch: 'Limpar pesquisa',
  setsTooltipIcons: 'Visualização em grade de ícones',
  setsTooltipGame: 'Ordem do jogo',
  setsTooltipAz: 'Alfabética',

  // File drag overlay
  fileDropTitle: 'Solte o arquivo para carregar',
  fileDropSubtitle: 'Aceita .hsfc (configs + meta‑sets) e .hsf (sellfile)',

  // Sets section labels
  setsTitle: 'Conjuntos',
  setsUsageInConfigs: '({n} uso(s) nas configurações)',
  setsInNames: 'em: {names}',

  // Set tooltip bits
  setPieceCount: '{n} peça',
  setTooltipNamed: '{name} – {count} conjunto',

  // Rules table: columns and UI
  colIdx: 'Nº',
  colCfg: 'Cfg',
  colKeep: 'Manter',
  colUse: 'Usar',
  colSets: 'Conjuntos',
  colSlot: 'Slot',
  colRankRarity: 'Rank/Raridade',
  colMain: 'Principal',
  colLevel: 'Nível',
  colFaction: 'Facção',
  colSub: 'Sub',
  rulesHeaderHelp: '{label} — arraste para reordenar; alça à direita para redimensionar; clique direito para opções',
  rulesEmpty: 'Ainda não há regras de venda do RSL Helper.',
  rulesEmptyFiltered: 'Sem regras devido ao filtro.',
  keepValueKeep: 'Manter',
  keepValueSell: 'Vender',
  setAllKnownShorthand: 'Todos os conhecidos',
  // Header menu controls
  rulesMenuWrapRows: 'Linhas multilinhas',
  rulesMenuSlotsAsIcons: 'Slots como ícones',
  rulesMenuSetsAsIcons: 'Conjuntos como ícones',
  rulesMenuColorStatTexts: 'Colorir textos de stats',
  rulesMenuColorBlindPalette: 'Paleta para daltônicos',
  commonOn: 'Ativo',
  commonOff: 'Inativo',
  headerMenuResetCols: 'Redefinir colunas',
  headerMenuAuto: 'Auto',
  headerMenuShown: 'Visível',
  headerMenuHidden: 'Oculto',
  headerMenuShownInTable: 'Visível na tabela',
  headerMenuHiddenInTable: 'Oculto na tabela',
  // Row context menu
  rowMenuClear: 'Limpar',
  rowMenuDuplicate: 'Duplicar',
  rowMenuMoveTop: 'Mover para o início',
  rowMenuMoveUp: 'Mover para cima',
  rowMenuMoveDown: 'Mover para baixo',
  rowMenuMoveBottom: 'Mover para o fim',
  rowMenuCopy: 'Copiar para a área de transferência',
  rowMenuPasteAfter: 'Colar depois',
  rowMenuDelete: 'Excluir',
  // Color-blind labels
  colorBlindNormal: 'Normal',
  colorBlindOkabeIto: 'Okabe–Ito',
  colorBlindTritan: 'Tritano',

  // Builder panel
  builderConfigName: 'Nome da configuração',
  builderClearConfigName: 'Limpar nome da configuração',
  builderAction: 'Ação',
  builderActionHelp: 'Escolha o que esta configuração faz. Manter: mantém o equipamento correspondente. Vender: vende o equipamento correspondente.',
  builderEnabledInExport: 'Ativado no export',
  builderDisabledInExport: 'Desativado no export',
  builderEnabledInSellfile: 'Ativado no Sellfile',
  builderDisabledInSellfile: 'Desativado no Sellfile',
  builderHelpOpen: 'Abrir ajuda rápida',
  builderRank: 'Rank',
  builderRankHelp: 'Quais classificações de estrela correspondem. “Qualquer” corresponde a todas.',
  any: 'Qualquer',
  builderSubstatValues: 'Valores de substats…',
  builderMain: 'Stat principal',
  builderMainHelp: 'Escolha a(s) stat(s) principal(is). Deixe vazio para Qualquer.',
  builderSlots: 'Slots',
  builderSlotsHelp: 'Aplicar apenas a estes slots.',
  builderMsgClearSets: 'Remove todos os sets e meta‑sets selecionados para esta configuração.',
  builderInsertAfterSelected: 'Inserir após a seleção',
  builderAddAsNew: 'Adicionar como nova config',
  builderSaveChangesToSelected: 'Salvar alterações na seleção',
  builderUnsavedChangesAria: 'alterações não salvas',
  builderMsgClearBuilder: 'Isto limpa os campos e seleções atuais do builder.',

  // Metasets dialog
  metasetsHeaderBlurb: 'Grupos nomeados de conjuntos. Eles aparecem no topo do seletor de sets.',
  metasetsMoveUp: 'Mover para cima',
  metasetsMoveDown: 'Mover para baixo',
  metasetsHiddenFromMenus: 'Oculto nos menus',
  metasetsVisibleInMenus: 'Visível nos menus',
  metasetsUses: '{n} uso(s)',
  metasetsDeleteRemoveRefs: 'Excluir e remover referências',
  metasetsDeleteReplaceWithSets: 'Substituir por sets explícitos',
  metasetsDeleteReplaceWithMetaset: 'Substituir por meta‑set',
  metasetsDeleteRemoveRefsLabel: 'Excluir e remover referências',
  metasetsDeleteReplaceWithSetsLabel: 'Substituir por sets explícitos',
  metasetsDeleteReplaceWithSetsNotAvailable: 'Substituir por sets explícitos (indisponível — sem sets)',
  metasetsDeleteReplaceWithMetasetLabel: 'Substituir por outro meta‑set',
  metasetsNoMetasetsToReplaceWith: 'Não há meta‑sets para substituir',
  metasetsChooseMetasetPlaceholder: 'Escolher meta‑set…',
  metasetsResetRemoveRefs: 'Redefinir e remover referências',
  metasetsResetUseExplicitSets: 'Redefinir e usar sets explícitos',
  metasetsResetUseMetaset: 'Redefinir e usar meta‑set',
  metasetsResetRemoveRefsLabel: 'Remover referências a meta‑sets',
  metasetsResetReplaceWithSetsLabel: 'Substituir referências por sets explícitos',
  metasetsResetReplaceWithMetasetLabel: 'Substituir referências por meta‑set',
  // Note dialog
  noteTitle: 'Nota',
  titleClearNote: 'Limpar nota?',
  msgClearNote: 'Isso removerá a nota atual do HSFC. Esta ação não pode ser desfeita.',
  // Restore autosave dialog
  restoreAutosaveTitle: 'Restaurar a última configuração salva?',
  restoreAutosaveQuestion: 'Foi encontrada uma sessão salva automaticamente. Deseja restaurá‑la?',
  restoreAutosaveSummary: 'Configs: {configs} • Meta‑sets: {metas} • Nota: {note}',
  yes: 'Sim',
  no: 'Não',

  // New: Builder panel extra labels/help and help-popover
  builderMinLevel: 'Nível mínimo',
  builderMinLevelHelp: 'Nível mais cedo a verificar (+0, +4, …).',
  builderMaxLevel: 'Nível máximo',
  builderMaxLevelHelp: 'Nível mais tarde a verificar (+0, +4, …).',
  builderFaction: 'Facção',
  builderFactionHelp: 'Apenas acessórios (anel, amuleto, estandarte). Outros equipamentos ignoram isso.',
  builderRarityExact: 'Exato',
  builderRarityGte: 'Intervalos ≥',
  builderRarityLte: 'Intervalos ≤',
  builderRequiredSubstats: 'Substats necessários',
  builderRequiredSubstatsHelp: 'Quantos dos seus substats escolhidos o item deve ter. Os bloqueados sempre contam.',
  builderMinRequiredRolls: 'Rolagens mínimas',
  builderMinRequiredRollsTip1: 'Total mínimo de rolagens nos seus substats escolhidos (soma).',
  builderMinRequiredRollsTip2: '0 significa nenhum mínimo global. Marcos iniciais mostram apenas regras que ainda podem atingir essa soma em +16.',
  builderMinRequiredRollsTargetLocked: 'Alvo: Substats bloqueados',
  builderMinRequiredRollsTargetSelected: 'Alvo: Substats selecionados',
  builderMinRequiredRollsToggleAria: 'Alternar alvo de rolagens mínimas ({target})',
  builderMilestoneThresholdsHelp: 'Como os limiares se comportam antes de +16 quando define mínimos de rolagens. Afeta apenas se algum substat tem Min > 0 ou se há um mínimo global.',
  builderMinRequiredRollsImpossibleWarn: 'Aviso: as rolagens mínimas não podem ser atingidas até +16 com os limites atuais por stat',
  builderSetsHelp: 'Aplicar esta configuração apenas a estes sets ou meta‑sets.',

} */

type I18nKey = keyof typeof en
type StrictCatalog = { [K in I18nKey]: string }

// Dev-only empty catalog: same keys, all values empty.
const EMPTY_CATALOG: StrictCatalog = Object.fromEntries(Object.keys(en).map((k) => [k, ''])) as unknown as StrictCatalog

const CATALOGS: Record<Language, StrictCatalog> = {
  'en-US': en as StrictCatalog,
  'de-DE': ({ ...en, ...deDE } as unknown) as StrictCatalog,
  'fr-FR': ({ ...en, ...frFR } as unknown) as StrictCatalog,
  'es-ES': ({ ...en, ...esES } as unknown) as StrictCatalog,
  'pt-PT': ({ ...en, ...ptPT } as unknown) as StrictCatalog,
  'ru-RU': ({ ...en, ...ruRU } as unknown) as StrictCatalog,
  'uk-UA': ({ ...en, ...ukUA } as unknown) as StrictCatalog,
  'tr-TR': ({ ...en, ...trTR } as unknown) as StrictCatalog,
  // Dev-only: show blank strings so any hardcoded/untagged text pops visually
  'empty': EMPTY_CATALOG,
}

function safeGetLanguage(): Language {
  const isDev: boolean = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
  try {
    const raw = localStorage.getItem(LANG_KEY)
    if (raw === 'en-US' || raw === 'de-DE' || raw === 'fr-FR' || raw === 'es-ES' || raw === 'pt-PT' || raw === 'ru-RU' || raw === 'uk-UA' || raw === 'tr-TR' || (isDev && raw === 'empty')) return raw as Language
    // No explicit preference stored: in dev, auto-detect; in prod, default to English
    return isDev ? detectPreferredLanguage() : 'en-US'
  } catch {
    return 'en-US'
  }
}

type I18nContextValue = {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: I18nKey, params?: Record<string, string | number>) => string
  // Register a runtime catalog for quick testing (e.g., via dropped file)
  registerRuntimeCatalog: (langCode: string, catalog: Partial<StrictCatalog>) => void
}

const I18nContext = React.createContext<I18nContextValue | null>(null)

function detectPreferredLanguage(): Language {
  try {
    const supported: Language[] = ['en-US', 'de-DE', 'fr-FR', 'es-ES', 'pt-PT', 'ru-RU', 'uk-UA', 'tr-TR']
    const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]).map((l) => String(l || '').toLowerCase())
    for (const entry of langs) {
      const base = entry.split('-')[0]
      const mapped = base === 'en' ? 'en-US' :
        base === 'de' ? 'de-DE' :
        base === 'fr' ? 'fr-FR' :
        base === 'es' ? 'es-ES' :
        base === 'pt' ? 'pt-PT' :
        base === 'ru' ? 'ru-RU' :
        base === 'uk' ? 'uk-UA' :
        base === 'tr' ? 'tr-TR' : ''
      if (mapped && (supported as string[]).includes(mapped)) return mapped as Language
    }
    return 'en-US'
  } catch { return 'en-US' }
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const isDev: boolean = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
  const [lang, setLangState] = React.useState<Language>(safeGetLanguage)
  const [runtimeCatalogs, setRuntimeCatalogs] = React.useState<Record<string, StrictCatalog>>({})

  const setLang = React.useCallback((l: Language) => {
    setLangState(l)
    try {
      const auto = isDev ? detectPreferredLanguage() : 'en-US'
      if (l === auto) {
        // Do not persist if it matches auto-detected, so next launch re-autodetects.
        localStorage.removeItem(LANG_KEY)
      } else {
        localStorage.setItem(LANG_KEY, l)
      }
    } catch {}
  }, [isDev])

  const registerRuntimeCatalog = React.useCallback((langCode: string, patch: Partial<StrictCatalog>) => {
    const base = en as StrictCatalog
    const merged: StrictCatalog = { ...base, ...(CATALOGS[langCode as Language] || {}), ...(patch as StrictCatalog) }
    setRuntimeCatalogs((prev) => ({ ...prev, [langCode]: merged }))
    // Switch to the runtime language without persisting selection
    setLangState((langCode as Language) || 'en-US')
  }, [])

  const t = React.useCallback((key: I18nKey, params?: Record<string, string | number>) => {
    const cat = runtimeCatalogs[lang] || CATALOGS[lang] || en
    let val = (cat[key] ?? en[key]) as string
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      }
    }
    return val
  }, [lang, runtimeCatalogs])

  const value = React.useMemo<I18nContextValue>(() => ({ lang, setLang, t, registerRuntimeCatalog }), [lang, setLang, t, registerRuntimeCatalog])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = React.useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}

export function formatRulesCount(t: I18nContextValue['t'], count: number): string {
  // Shared helper so Builder and Preview chips stay localized consistently.
  return count === 1 ? t('rulesCountOne') : t('rulesCountMany', { n: count })
}
