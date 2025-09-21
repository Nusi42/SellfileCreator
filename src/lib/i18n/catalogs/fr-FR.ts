import type { Catalog } from '../types'

const overrides: Catalog = {
  // App / Panels
  appBuilderTitle: 'Ajouter des configs et des règles',
  loadConfigs: 'Charger des configs (.hsfr)',
  configOne: 'config',
  configMany: 'configs',
  editNote: 'Modifier la note',
  addNote: 'Ajouter une note',
  saveAllConfigs: 'Enregistrer toutes les configs (.hsfr)',
  deleteConfigs: 'Supprimer les configs',

  sellfilePreview: 'Aperçu du fichier de vente',
  manageColors: 'Gérer les couleurs',
  optionalLoadSellfile: 'Optionnel : charger un fichier de vente existant pour prévisualiser la fusion.',
  loadSellfile: 'Charger le fichier de vente RSL Helper',
  clear: 'Fermer',
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
  // Rule Tester
  testerOpenLabel: 'Testeur de règles',
  testerOpenTooltip: 'Ouvrir le testeur de règles',
  testerTitle: 'Testeur de règles',
  testerIntro: 'Créez des objets d’exemple pour voir quelle règle correspond en premier et s’ils seraient gardés ou vendus.',
  testerEmptyHint: 'Ajoutez des objets pour tester quelle règle correspond en premier.',
  testerRule: 'Règle',
  testerConfig: 'Config',
  testerNoMatch: 'Aucune correspondance',
  testerFinalSell: 'Vente finale',
  noSetAccessories: 'Aucun – accessoires uniquement',
  // Common UI bits used in Rule Tester
  add: 'Ajouter',
  compact: 'Compact',
  expanded: 'Étendu',
  view: 'Voir',
  
  

  close: 'Fermer',
  cancel: 'Annuler',
  
  
  delete: 'Supprimer',
  deleteAll: 'Tout supprimer',
  reset: 'Réinitialiser',
  resetToDefaults: 'Réinitialiser par défaut',
  restore: 'Restaurer',
  dismiss: 'Ignorer',
  startTutorial: 'Démarrer le tutoriel',

  // Generic
  
  
  
  helpOpenLabel: 'Aide',
  helpOpenTooltip: 'Ouvrir l’aide / README',
  

  titleDeleteAllConfigs: 'Supprimer toutes les configs ?',
  msgDeleteAllConfigs: 'Cela supprime toutes les configs de règles personnalisées (HSFR). Cette action est irréversible.',
  titleDeleteConfig: 'Supprimer cette config ?',
  msgDeleteConfig: 'Cela supprime uniquement cette config du HSFR.',
  titleDeleteSelectedConfigs: 'Supprimer {n} config(s) ?',
  msgDeleteSelectedConfigs: 'Cela supprime les {n} config(s) sélectionnées du HSFR.',

  titlePasteConfigJson: 'Coller le JSON de config',
  msgPasteInstructions: 'Collez une seule config, un tableau de configs, ou un objet HSFR contenant Configs.',
  placeholderPasteExample: 'Exemple : {example}',
  titleCopyConfigJson: 'Copier le JSON de config',
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
  msgNoRefs: 'Supprime le méta‑set. Aucune config ne s’y réfère.',
  refsCount: '{n} config(s) référencent ce méta‑set.',
  msgChooseUpdate: 'Choisissez comment mettre à jour ces configs.',
  titleResetMetasets: 'Réinitialiser les méta‑sets par défaut ?',
  msgResetNoRefs: 'Aucune config ne référence vos méta‑sets. La liste sera remplacée par les valeurs par défaut.',
  msgResetSomeRefs: 'Certaines configs référencent vos méta‑sets. Choisissez comment les mettre à jour.',

  // Sets search/order controls
  setsSearch: 'Rechercher des sets',
  setsClearSearch: 'Effacer la recherche',
  setsTooltipIcons: 'Vue en grille d’icônes',
  setsTooltipGame: 'Ordre du jeu',
  setsTooltipAz: 'Alphabétique',
  

  // File drag overlay
  fileDropTitle: 'Déposez un fichier à charger',
  fileDropSubtitle: 'Accepte .hsfr (configs + méta‑sets) et .hsf (fichier de vente)',

  // Sets section labels
  setsTitle: 'Sets',
  setsUsageInConfigs: '({n} utilisation(s) dans les configs)',
  setsInNames: 'dans : {names}',

  // Set tooltip bits
  setPieceCount: '{n} pièce',
  setTooltipNamed: '{name} – {count}',

  // Set descriptions (tooltips). Locales may override these.
  // Armor (fixed-piece)
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Armor (variable 1–9 piece sets)
  // Chronophage
  
  
  
  
  
  
  
  
  

  // Feral
  
  
  
  
  
  
  
  
  

  // Merciless
  
  
  
  
  
  
  
  
  

  // Pinpoint
  
  
  
  
  
  
  
  
  

  // Protection
  
  
  
  
  
  
  
  
  

  // Rebirth
  
  
  
  
  
  
  
  
  

  // Slayer
  
  
  
  
  
  
  
  
  

  // Stonecleaver
  
  
  
  
  
  
  
  
  

  // Stoneskin
  
  
  
  
  
  
  
  
  

  // Supersonic
  
  
  
  
  
  
  
  
  

  // Accessories (variable count not used; texts are per piece or fixed)
  

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
  // Config chip labels
  
  
  
  
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
  builderConfigName: 'Nom de la config',
  builderClearConfigName: 'Effacer le nom',
  builderAction: 'Action',
  builderActionHelp: 'Choisissez ce que fait cette config. Garder : garde l’équipement correspondant. Vendre : vend l’équipement correspondant.',
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
  builderSlotsHelp: 'N’appliquer cette config qu’à ces emplacements.',
  builderSetsHelp: 'Appliquer cette config uniquement à ces sets ou méta‑sets.',
  builderMinLevel: 'Niveau min',
  builderMinLevelHelp: 'Niveau le plus tôt à vérifier (+0, +4, …).',
  builderMaxLevel: 'Niveau max',
  builderMaxLevelHelp: 'Niveau le plus tard à vérifier (+0, +4, …).',
  builderFaction: 'Faction',
  builderFactionHelp: 'Accessoires uniquement (bague, amulette, bannière). Les autres équipements ignorent ce réglage.',
  builderRarityExact: 'Exact',
  builderRarityGte: 'Plages ≥',
  builderRarityLte: 'Plages ≤',
  builderMilestoneThresholds: 'Seuils par jalons',
  builderEarlyLabel: 'Tôt',
  builderLateLabel: 'Tard',
  
  
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
  builderMsgClearSets: 'Supprime tous les sets et méta‑sets sélectionnés pour cette config.',
  builderInsertAfterSelected: 'Insérer après la sélection',
  builderAddAsNew: 'Ajouter comme nouvelle config',
  builderSaveChangesToSelected: 'Enregistrer les modifications sur la sélection',
  builderUnsavedChangesAria: 'modifications non enregistrées',
  builderMsgClearBuilder: 'Efface les champs et sélections actuels du builder.',

  // Builder quick help (popover)
  builderHelpTitle: 'Comment fonctionnent ces réglages',
  builderHelpKeepSellTitle: 'Conserver vs Vendre',
  builderHelpKeepSellBody: 'Cette config fait correspondre des objets. En « Conserver », les objets correspondants sont conservés ; en « Vendre », ils sont vendus. Rang, Rareté, Faction, Emplacements et Sets filtrent d’abord.',
  builderHelpLevelsTitle: 'Niveaux et seuils jalons',
  builderHelpLevelsB1: 'Utilisez Niveau min/max pour choisir la fenêtre de jalons (+0, +4, +8, +12, +16).',
  builderHelpLevelsB2: 'Avant +16, si votre rareté ne peut pas encore avoir le nombre demandé de sous‑stats, les règles utilisent le nombre possible à ce niveau. À +16, elles utilisent votre nombre demandé.',
  builderHelpLevelsB3: '« Tous » traite la présence des sous‑stats comme ≥ Légendaire (pas d’ajouts), tandis que les plannings de lancers suivent toujours la rareté/la plage.',
  builderHelpLevelsB4: 'Seuils jalons (avec minima de lancers) : « Tôt » montre des seuils basés sur les lancers obtenus ; « Tard » exige seulement ce qui doit être présent maintenant pour que l’objectif +16 reste atteignable. Avec uniquement des jokers (★) plus une somme minimale, « Tôt » montre des répartitions minimales à chaque jalon (liste stable), et « Tard » les applique à +16 tout en affichant la présence avant.',
  builderHelpSubstatsTitle: 'Sous‑stats',
  builderHelpSubstatsB1: 'Cliquer pour sélectionner ; cliquer à nouveau pour verrouiller (🔒).',
  builderHelpSubstatsB2: 'Indicateur de lancers : clic gauche plus ; clic droit moins. Depuis ★ : gauche → Min (0–5), droite → Plafond (0–4, 0 = aucun lancer).',
  builderHelpSubstatsB3: 'Min = au moins autant de lancers au niveau cible. Plafond = lancers max sur cette stat.',
  builderHelpRequiredTitle: 'Sous‑stats requises',
  builderHelpRequiredBody: 'Combien de sous‑stats choisies l’objet doit avoir. Les verrouillées comptent toujours. « Auto » met min(4, nombre sélectionné) et garde la synchro.',
  builderHelpMinRollsTitle: 'Lancers min requis',
  builderHelpMinRollsBody: 'Somme minimale de lancers sur vos sous‑stats choisies. 0 = aucun minimum global. Exemple : 3 signifie au moins 3 lancers au total au niveau cible. Avec seulement des jokers (★), « Tôt » reste concis ; « Tard » montre la présence tôt et applique les répartitions minimales à +16.',
  
  
  
  
  
  
  
  
  
  
  
  
  builderHelpCommonTitle: 'Configs courantes',
  builderHelpCommonAHeading: 'A) Deux indispensables + un optionnel',
  builderHelpCommonAL1: 'Sélection : SPD, ACC, HP%, DEF%, RES',
  builderHelpCommonAL2: 'Verrouiller : SPD et ACC (double clic)',
  builderHelpCommonAL3: 'Sous‑stats requises : 3',
  builderHelpCommonAL4: 'Résultat : doit avoir SPD et ACC, plus l’un de HP%/DEF%/RES.',
  builderHelpCommonBHeading: 'B) Exactement trois sous‑stats clés',
  builderHelpCommonBL1: 'Sélection : SPD, CR%, CDMG% ',
  builderHelpCommonBL2: 'Sous‑stats requises : 3',
  builderHelpCommonBL3: 'Résultat : doit avoir les trois. (Indicateurs de lancers facultatifs.)',

  // Metasets dialog
  metasetsHeaderBlurb: 'Groupes nommés de sets. Ils apparaissent en haut du sélecteur de sets.',
  metasetsMoveUp: 'Monter',
  metasetsMoveDown: 'Descendre',
  metasetsHiddenFromMenus: 'Masqué dans les menus',
  metasetsVisibleInMenus: 'Visible dans les menus',
  metasetsUses: '{n} utilisation(s)',
  metasetsUsesTooltip: 'Cliquer pour sélectionner les configs utilisant ce métaset',
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

  // Filter panel
  
  
  
  
  
  
  
  filterRarity: 'Rareté',
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Rarity labels (generic)
  rarityCommon: 'Commun',
  rarityUncommon: 'Peu commun',
  rarityRare: 'Rare',
  rarityEpic: 'Épique',
  rarityLegendary: 'Légendaire',
  rarityMythical: 'Mythique',

  // Slot names (for future localization of labels next to icons)
  
  
  
  
  
  
  
  
  

  // Note dialog
  noteTitle: 'Note',
  titleClearNote: 'Effacer la note ?',
  msgClearNote: 'Cela supprimera la note actuelle du HSFR. Cette action est irréversible.',

  // Restore autosave dialog
  restoreAutosaveTitle: 'Restaurer la dernière config enregistrée ?',
  restoreAutosaveQuestion: 'Une session auto‑sauvegardée a été trouvée. Voulez‑vous la restaurer ?',
  restoreAutosaveSummary: 'Configs : {configs} • Méta‑sets : {metas} • Note : {note}',
  yes: 'Oui',
  no: 'Non',

  // Help dialog
  
  

  // Tutorial chrome
  
  tutorialExit: 'Quitter le tutoriel',
  
  
  

  // Roll indicator help
  
  
  
  
  
  

  // Filter helpers
  
  
  

  // Factions (UI labels)
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Stat labels (UI)
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Builder panel caption and toasts
  builderIntroCaption: 'Utilisez le builder ci‑dessous pour définir des configs et les ajouter à votre ensemble personnalisé. Vous pouvez aussi charger/enregistrer vos configs (HSFR), y compris les méta‑sets, et les gérer ici même.',
  toastConfigsSaved: 'Configs enregistrées. Vérifiez votre dossier Téléchargements.',
  toastSellfileSaved: 'Fichier de vente enregistré. Vérifiez votre dossier Téléchargements.',
  toastL10nLoaded: 'Localisation chargée : {lang}',
  toastL10nLoadFailed: 'Échec du chargement du fichier de localisation',

  // Tutorial section labels
  tutSectionBasicsLabel: 'Bases',
  tutSectionAdvancedLabel: 'Avancé',
  tutSectionMetasetsLabel: 'Méta‑sets',
  tutSectionConfigChipsLabel: 'Puce(s) de config',
  tutSectionFinalSellLabel: 'Vente finale',
  tutSectionSaveExportLabel: 'Enregistrer & Exporter',

  // Note editor tooltips (Markdown toolbar)
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Tutorial steps (titles and bodies)
  tutWelcomeTitle: 'Bienvenue',
  tutWelcomeBody: 'Avec ~~RSL Helper Sellfile Creator~~ vous pouvez créer des règles dans `Ajouter des configs et des règles` et voir les résultats dans `Prévisualisation du fichier de vente`. Vous choisirez des stats, des `Sets`, et des niveaux comme `+16` pour décider quoi garder ou vendre. Ce tutoriel dure environ 10 minutes.\n\nAstuce : 💡 vous pouvez lancer ce tutoriel à tout moment depuis le bouton d’aide.',
  tutActionTitle: 'Choisir l’action',
  tutActionBody: 'Choisissez `Garder` ou `Vendre`. Cela détermine ce qu’il arrive aux objets correspondant à cette config.',
  tutEnabledTitle: 'Activée dans le fichier de vente',
  tutEnabledBody: 'Activez `Activée dans le fichier de vente` pour inclure/exclure cette config du fichier exporté. Les configs désactivées restent enregistrées et apparaissent barrées dans la prévisualisation. RSL Helper lit ces règles mais ne les applique pas dans le fichier exporté.',
  tutBasicsTitle: 'Rang/Rareté/Niveaux',
  tutBasicsBody: 'Réglez `Rang`, `Rareté`, `Faction`, `Niveau min` et `Niveau max`. Si `Rareté` est `Auto`, la rareté la plus faible est choisie qui (a) garantit tous les sous‑stats verrouillés au premier niveau émis et (b) peut atteindre vos `Tirages min requis` d’ici `+16`.',
  tutSlotsTitle: 'Choisir les emplacements',
  tutSlotsBody: 'Ciblons les `Bottes`. Cliquez l’icône `Bottes`. Nous allons le faire pour vous maintenant.',
  tutMainTitle: 'Sélectionner la stat principale',
  tutMainBody: 'Choisissez `SPD` dans `Stat principale`. La règle ne concerne alors que des bottes Vitesse.',
  tutSetsTitle: 'Optionnel : choisir des sets',
  tutSetsBody: 'Choisissez des `Sets` (comme Vitesse) ou laissez vide pour rester large. Nous choisirons Vitesse ici comme exemple.',
  tutAddConfigTitle: 'Ajouter une config',
  tutAddConfigBody: 'Cliquez `Ajouter comme nouvelle config`. Appuyez sur `Suivant` et nous cliquerons pour vous. Après l’ajout, le bouton devient `Insérer après la sélection`.',
  tutConfigAddedTitle: 'Config ajoutée',
  tutConfigAddedBody: 'Nais ! La nouvelle `puce de config` est sélectionnée. Le bouton affiche maintenant `Insérer après la sélection` : les nouvelles configs iront après la sélection.',
  tutSeeRulesTitle: 'Voir vos règles',
  tutSeeRulesBody: 'La `Prévisualisation du fichier de vente` montre les règles créées par votre config. Vous voyez une règle car aucun `Sous‑stat` n’a été choisi — en gros : garder toutes les `Bottes` avec `SPD` dans le set `Vitesse`. Cliquez une ligne pour sélectionner la config associée ; cliquez une puce pour aller à sa première ligne.',

  tutAdvIntroTitle: 'Exemple avancé',
  tutAdvIntroBody: 'Ciblons maintenant des pièces plus fortes avec des `Sous‑stats` et des tirages.',
  tutAdvSelectSlotsMainTitle: 'Sélectionner emplacements et stats principales',
  tutAdvSelectSlotsMainBody: 'Nous visons des `Plastrons` et `Bottes` orientés dégâts avec `HP%`, `ATK%` et `DEF%` en principal. Cela montre comment piloter l’emplacement et la stat principale ensemble. Sélectionnez `Plastron` et `Bottes` dans `Emplacements`, et `HP%`, `ATK%`, `DEF%` dans `Stat principale`. Nous les avons appliqués pour vous.',
  tutAdvNameTitle: 'Nommer la config',
  tutAdvNameBody: 'Donnez un `Nom` court et clair à cette config. Nous allons le renseigner pour vous.',
  tutAdvChooseSubstatsTitle: 'Choisir des sous‑stats',
  tutAdvChooseSubstatsBody: 'Choisissez `SPD`, `CR%` et `CDMG%` dans `Sous‑stats`. Cliquez à nouveau pour verrouiller (🔒). Nous ne verrouillerons que `CDMG%`.',
  tutAdvRequiredTitle: 'Sous‑stats requises',
  tutAdvRequiredBody: 'Réglez `Requis` au nombre de sous‑stats choisies que l’objet doit avoir. Les verrouillées comptent toujours et consomment un emplacement `Requis`. Nous mettrons `2` : `CDMG%` (verrouillée) plus une de `SPD` ou `CR%`.',
  tutAdvMinRollsTitle: 'Tirages min requis',
  tutAdvMinRollsBody: '`Tirages min requis` est une somme sur vos sous‑stats choisies. Exemple : 3 = au moins trois tirages combinés d’ici `+16` (pas 3 chacun).\n\nAstuce : 💡 cliquez sur l’icône derrière le libellé `Tirages min requis` pour basculer la cible entre `Sélectionnées` et seulement `Verrouillées`.',
  tutAdvMilestonesBody: 'Utilisez les `Seuils par jalons` pour façonner les lignes précoces : `Tôt` augmente avec les tirages ; `Tard` attend `+16` — avant cela, il ne demande que le nécessaire pour garder l’objectif `+16` atteignable.',
  tutMetasetsManageTitle: 'Gérer les méta‑sets',
  tutMetasetsManageBody: 'Ouvrez `Gérer les méta‑sets` pour créer des groupes nommés de `Sets` réutilisables.',
  tutMetasetsAddTitle: 'Ajouter un méta‑set',
  tutMetasetsAddBody: 'Cliquez `Ajouter un méta‑set`. Au `Suivant`, nous créerons `Slow DD` avec `Lethal`, `Savage` et `Stoneskin`. Les modifications s’appliquent immédiatement.',
  tutMetasetsAddedTitle: 'Méta‑set ajouté',
  tutMetasetsAddedBody: 'Voici votre méta‑set `Slow DD` avec `Lethal`, `Savage` et `Stoneskin`. Vous pouvez le renommer ou modifier ses sets.',
  tutMetasetsIncludedTitle: 'Méta‑sets inclus',
  tutMetasetsIncludedBody: 'Par défaut, l’application inclut `Nuker`, `Support - Debuffer` et `Support - Survivability`. D’autres méta‑sets par défaut existent.',
  tutMetasetsCloseTitle: 'Fermer les méta‑sets',
  tutMetasetsCloseBody: 'Cliquez `Fermer` quand c’est terminé. Vos `Méta‑sets` apparaissent en haut de `Sets`.',
  tutMetasetsSelectTitle: 'Choisir un méta‑set',
  tutMetasetsSelectBody: 'Ouvrez `Sets` et choisissez parmi vos `Méta‑sets` en haut. Réutilisables entre configs.',
  tutMetasetsInSetsTitle: 'Méta‑sets dans Sets',
  tutMetasetsInSetsBody: 'Vos `Méta‑sets` s’affichent ici en haut de liste pour un accès rapide.',
  tutAdvAddTitle: 'Ajouter la config avancée',
  tutAdvAddBody: 'Cliquez `Ajouter comme nouvelle config` pour enregistrer cet exemple avancé. Vous pouvez gérer plusieurs configs et leur ordre ; la première correspondance gagne.',
  tutAdvAddedTitle: 'Config avancée ajoutée',
  tutAdvAddedBody: 'Parfait ! La `puce de config` avancée est ajoutée et sélectionnée. Utilisez le menu pour dupliquer, déplacer ou supprimer.',
  tutAdvPreviewEarlyTitle: 'Ce que font ces règles',
  tutAdvPreviewEarlyBody: 'La `Prévisualisation` montre environ 84 règles acceptant un mélange `SPD/CR%/CDMG%` avec au moins `2` tirages. Avec `Tôt`, ces `2` tirages apparaissent vers `+8`. Les objets non correspondants sont testés par les suivantes ; sans correspondance, une `Vente finale` pourrait s’appliquer.',
  tutConfigChipsTitle: 'Puce(s) de config',
  tutConfigChipsBody: 'Les configs apparaissent en `puces de config`. Clic droit pour ouvrir le menu — `Copier dans le presse‑papiers` partage seulement cette config. Clic droit sur le vide pour `Copier toutes les configs`/`Coller en fin`.',
  tutFinalSellIntroTitle: 'Vente finale (optionnel)',
  tutFinalSellIntroBody: '`Vente finale` ajoute des règles `Vendre` pour les éléments non couverts. Lorsqu’elle est activée, vous verrez `Vente finale activée !`.',
  tutFinalSellConfigureTitle: 'Configurer la vente finale',
  tutFinalSellConfigureBody: 'Cliquez l’icône des curseurs pour `Configurer`. Nous ouvrirons le dialogue ensuite.',
  tutFinalSellDialogTitle: 'Dialogue : Vente finale',
  tutFinalSellDialogBody: 'Choisissez quoi vendre (`Artefacts`, `Accessoires`) et quelles `Plages de niveaux` (par ex. `0–3`, … `16`). Nous activons `Artefacts` ; `+16` est désactivé par défaut.',
  tutNoteTitle: 'Ajouter une note',
  tutNoteBody: 'Utilisez `Ajouter une note` pour noter un rappel. Les notes se sauvegardent dans `.hsfr`, pas dans le `.hsf` exporté.',
  tutSaveExplainTitle: 'Enregistrer les configs (.hsfr)',
  tutSaveExplainBody: 'Enregistrez `Configs, Méta‑sets, Note` dans Téléchargements. Les noms incluent un horodatage — enregistrer souvent est sûr.',
  tutExportExplainTitle: 'Exporter le fichier de vente RSL Helper',
  tutExportExplainBody: 'Cliquez `Exporter le fichier de vente RSL Helper` pour sauvegarder votre `.hsf` (Téléchargements). Exporter plusieurs fois est sûr ; l’horodatage aide à revenir en arrière.',
  tutPreviewHeaderMenuTitle: 'Menu d’en‑tête de la prévisualisation',
  tutPreviewHeaderMenuBody: 'Clic droit sur `Prévisualisation du fichier de vente` pour ouvrir les options : `Lignes multi‑lignes`, icônes d’emplacement et de set, `Colorer les bordures des stats`, `Palette daltoniens` (Normal, Okabe–Ito, Tritan).',
  tutPreviewFinishTitle: 'Prévisualiser et terminer',
  tutPreviewFinishBody: 'La `Prévisualisation du fichier de vente` montre vos règles finales. Vous pouvez `Charger un fichier de vente RSL Helper` pour fusionner — généralement inutile. Les règles chargées viennent d’abord ; la première correspondance gagne. Astuce : relancez le tutoriel depuis le bouton d’aide.',
  tutSectionAutoLateLabel: 'Auto + Tard',

  // Extra Example: Accessories — Auto Rarity + Late (Banner SPD)
  tutAutoLateIntroTitle: 'Exemple Accessoires : Auto + Late',
  tutAutoLateIntroBody: 'Créons une règle simple pour `Bannière` avec `Rareté` = `Auto` et `Jalons` = `Tard`. Choisissez `VIT` comme `Sous-stat` et demandez `3` lancers min d\'ici `+16`. `Auto` prend la rareté la plus basse qui reste possible ; `Tard` reporte la vérification complète à `+16` et avant cela ne demande que le nécessaire.',
  tutAutoLateAddTitle: 'Ajouter cette config',
  tutAutoLateAddBody: 'Cliquez sur `Insérer après la sélection`. On l\'insère ensuite pour voir ses règles dans l\'aperçu.',
  tutAutoLatePreviewTitle: 'Auto + Late dans l\'aperçu',
  tutAutoLatePreviewBody: 'Dans `Aperçu de la vente`, vous voyez maintenant des règles pour `Épique` et `Légendaire` (Bannière). `Auto` inclut les raretés qui peuvent atteindre `3` lancers au total sur `VIT` d\'ici `+16`. `Late` reporte la vérif complète à `+16`, pour garder les lignes précoces possibles. Nous allons le faire pour vous maintenant afin que vous voyiez la mise en évidence.',
  // Chips context menus
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Artifact set labels (UI)
  setLife: 'Vie',
  setOffense: 'Attaque',
  setDefense: 'Défense',
  setSpeed: 'Vitesse',
  setCriticalRate: 'Taux critique',
  setCritDamage: 'Dégâts critiques',
  setAccuracy: 'Précision',
  setResistance: 'Résistance',
  setLifesteal: 'Vol de vie',
  setFury: 'Fureur',
  setDaze: 'Hébétude',
  setCursed: 'Maudit',
  setFrost: 'Givre',
  setFrenzy: 'Frénésie',
  setRegeneration: 'Régénération',
  setImmunity: 'Immunité',
  setShield: 'Bouclier',
  setRelentless: 'Implacable',
  setSavage: 'Sauvage',
  setDestroy: 'Destruction',
  setStun: 'Étourdissement',
  setToxic: 'Toxique',
  setProvoke: 'Provocation',
  setRetaliation: 'Représailles',
  setAvenging: 'Vengeur',
  setStalwart: 'Inébranlable',
  setReflex: 'Réflexe',
  setCuring: 'Soin',
  setCruel: 'Cruel',
  setImmortal: 'Immortel',
  setDivineOffense: 'Attaque divine',
  setDivineCriticalRate: 'Taux critique divin',
  setDivineLife: 'Vie divine',
  setDivineSpeed: 'Vitesse divine',
  setSwiftParry: 'Parade rapide',
  setDeflection: 'Déviation',
  setResilience: 'Résilience',
  setPerception: 'Perception',
  setAffinitybreaker: 'Brise-affinité',
  setUntouchable: 'Intouchable',
  setFatal: 'Fatal',
  setFrostbite: 'Gelure',
  setBloodthirst: 'Soif de sang',
  setGuardian: 'Gardien',
  setFortitude: "Robustesse",
  setLethal: 'Mortel',
  setProtection: 'Protection',
  setStoneskin: 'Peau de pierre',
  setKillstroke: 'Coup fatal',
  setInstinct: 'Instinct',
  setBolster: 'Renfort',
  setDefiant: 'Défiant',
  setImpulse: 'Impulsion',
  setZeal: 'Zèle',
  setRighteous: 'Vertueux',
  setSupersonic: 'Supersonique',
  setMerciless: 'Impitoyable',
  setSlayer: 'Tueur',
  setFeral: 'Féral',
  setPinpoint: 'Ciblage précis',
  setStonecleaver: 'Tranche-pierre',
  setRebirth: 'Renaissance',
  setChronophage: 'Chronophage',
  setRefresh: 'Rafraîchir',
  setCleansing: 'Purification',
  setBloodshield: 'Bouclier de sang',
  setReaction: 'Réaction',
  setRevenge: 'Vengeance',
}

export default overrides
