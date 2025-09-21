import type { Catalog } from '../types'

const overrides: Catalog = {
  // App / Panels
  appBuilderTitle: 'Añadir configs y reglas',
  loadConfigs: 'Cargar configs (.hsfr)',
  configOne: 'config',
  configMany: 'configs',
  editNote: 'Editar nota',
  addNote: 'Añadir nota',
  saveAllConfigs: 'Guardar todas las configs (.hsfr)',
  deleteConfigs: 'Eliminar configs',

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
  // Rule Tester
  testerOpenLabel: 'Probador de Reglas',
  testerOpenTooltip: 'Abrir el Probador de Reglas',
  testerTitle: 'Probador de Reglas',
  testerIntro: 'Crea elementos de ejemplo para ver qué regla coincide primero y si se conservarían o venderían.',
  testerEmptyHint: 'Añade elementos para probar qué regla coincide primero.',
  testerRule: 'Regla',
  testerConfig: 'Config',
  testerNoMatch: 'Sin coincidencia',
  testerFinalSell: 'Venta final',
  noSetAccessories: 'Ninguno – solo accesorios',
  // Common UI bits used in Rule Tester
  add: 'Añadir',
  compact: 'Compacto',
  expanded: 'Expandido',
  view: 'Ver',
  
  

  close: 'Cerrar',
  cancel: 'Cancelar',
  
  
  delete: 'Eliminar',
  deleteAll: 'Eliminar todo',
  reset: 'Restablecer',
  resetToDefaults: 'Restablecer a valores predeterminados',
  restore: 'Restaurar',
  dismiss: 'Descartar',
  startTutorial: 'Iniciar tutorial',

  // Generic
  
  
  
  helpOpenLabel: 'Ayuda',
  helpOpenTooltip: 'Abrir Ayuda / README',
  

  titleDeleteAllConfigs: '¿Eliminar todas las configs?',
  msgDeleteAllConfigs: 'Esto eliminará todas las configs de reglas personalizadas (HSFR). Esta acción no se puede deshacer.',
  titleDeleteConfig: '¿Eliminar esta config?',
  msgDeleteConfig: 'Esto eliminará solo esta config del HSFR.',
  titleDeleteSelectedConfigs: '¿Eliminar {n} config(es)?',
  msgDeleteSelectedConfigs: 'Esto eliminará las {n} config(es) seleccionadas del HSFR.',

  titlePasteConfigJson: 'Pegar JSON de config',
  msgPasteInstructions: 'Pega una sola config, un arreglo de configs o un objeto HSFR que contenga Configs.',
  placeholderPasteExample: 'Ejemplo: {example}',
  titleCopyConfigJson: 'Copiar JSON de config',
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
  msgNoRefs: 'Elimina el meta‑set. Ninguna config lo referencia.',
  refsCount: '{n} config(es) referencian este meta‑set.',
  msgChooseUpdate: 'Elige cómo actualizar esas configs.',
  titleResetMetasets: '¿Restablecer meta‑sets a los predeterminados?',
  msgResetNoRefs: 'Ninguna config referencia tus meta‑sets. La lista será reemplazada por los valores predeterminados.',
  msgResetSomeRefs: 'Algunas configs referencian tus meta‑sets. Elige cómo actualizarlas.',

  // Sets search/order controls
  setsSearch: 'Buscar sets',
  setsClearSearch: 'Borrar búsqueda',
  setsTooltipIcons: 'Vista de cuadrícula de iconos',
  setsTooltipGame: 'Orden del juego',
  setsTooltipAz: 'Alfabético',
  

  // File drag overlay
  fileDropTitle: 'Suelta el archivo para cargar',
  fileDropSubtitle: 'Acepta .hsfr (configs + meta‑sets) y .hsf (archivo de venta)',

  // Sets section labels
  setsTitle: 'Conjuntos',
  setsUsageInConfigs: '({n} uso(s) en configs)',
  setsInNames: 'en: {names}',

  // Set tooltip bits
  setPieceCount: '{n} pieza',
  setTooltipNamed: '{name} – {count} conjunto',

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
  // Config chip labels
  
  
  
  
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
  builderConfigName: 'Nombre de config',
  builderClearConfigName: 'Borrar nombre de config',
  builderAction: 'Acción',
  builderActionHelp: 'Elige lo que hace esta config. Conservar: mantiene el equipo coincidente. Vender: vende el equipo coincidente.',
  builderEnabledInExport: 'Activado en el export',
  builderDisabledInExport: 'Desactivado en el export',
  builderEnabledInSellfile: 'Activado en el archivo de venta',
  builderDisabledInSellfile: 'Desactivado en el archivo de venta',
  builderHelpOpen: 'Abrir ayuda rápida',
  builderRank: 'Rango',
  builderRankHelp: 'Qué rangos de estrellas coinciden. “Cualquiera” coincide con todos.',
  any: 'Cualquiera',
  builderSubstatValues: 'Valores de substats…',
  builderMain: 'Stat principal',
  builderMainHelp: 'Elige stat(s) principal(es). Deja vacío para Cualquiera.',
  
  
  
  builderSlots: 'Ranuras',
  builderSlotsHelp: 'Aplicar solo a estas ranuras.',
  builderSetsHelp: 'Aplicar esta config solo a estos sets o meta‑sets.',
  builderMinLevel: 'Nivel mínimo',
  builderMinLevelHelp: 'Nivel más temprano a comprobar (+0, +4, …).',
  builderMaxLevel: 'Nivel máximo',
  builderMaxLevelHelp: 'Nivel más tardío a comprobar (+0, +4, …).',
  builderFaction: 'Facción',
  builderFactionHelp: 'Solo accesorios (anillo, amuleto, estandarte). El resto de equipo lo ignora.',
  builderRarityExact: 'Exacto',
  builderRarityGte: 'Rangos ≥',
  builderRarityLte: 'Rangos ≤',
  builderMilestoneThresholds: 'Umbrales por hitos',
  builderEarlyLabel: 'Temprano',
  builderLateLabel: 'Tardío',
  
  
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
  builderMsgClearSets: 'Elimina todos los conjuntos y meta‑sets seleccionados para esta config.',
  builderInsertAfterSelected: 'Insertar después de la selección',
  builderAddAsNew: 'Agregar como nueva config',
  builderSaveChangesToSelected: 'Guardar cambios en la selección',
  builderUnsavedChangesAria: 'cambios no guardados',
  builderMsgClearBuilder: 'Esto borra los campos y selecciones actuales del builder.',

  // Builder quick help (popover)
  builderHelpTitle: 'Cómo funcionan estos ajustes',
  builderHelpKeepSellTitle: 'Conservar vs Vender',
  builderHelpKeepSellBody: 'Esta config hace coincidir objetos. En "Conservar" se mantienen los objetos coincidentes; en "Vender" se venden. Rango, Rareza, Facción, Ranuras y Sets filtran primero.',
  builderHelpLevelsTitle: 'Niveles y umbrales por hitos',
  builderHelpLevelsB1: 'Usa Nivel mín/máx para elegir la ventana de hitos (+0, +4, +8, +12, +16).',
  builderHelpLevelsB2: 'Antes de +16, si tu rareza aún no puede tener el número solicitado de substats, las reglas usan el número posible en ese nivel. En +16, usan tu número solicitado.',
  builderHelpLevelsB3: '“Cualquiera” trata la presencia de substats como ≥ Legendario (sin adiciones), mientras que los planes de tiradas siguen la rareza/el rango.',
  builderHelpLevelsB4: 'Umbrales por hitos (con mínimos de tiradas): "Temprano" muestra umbrales según las tiradas obtenidas; "Tardío" exige solo lo necesario ahora para que el objetivo +16 siga siendo posible. Con solo comodines (★) más una suma mínima, "Temprano" muestra repartos mínimos por hito (lista estable) y "Tardío" los aplica en +16 mostrando presencia antes.',
  builderHelpSubstatsTitle: 'Substats',
  builderHelpSubstatsB1: 'Clic para seleccionar; clic de nuevo para bloquear (🔒).',
  builderHelpSubstatsB2: 'Indicador de tiradas: clic izquierdo más; clic derecho menos. Desde ★: izquierda → Min (0–5), derecha → Tope (0–4, 0 = sin tiradas).',
  builderHelpSubstatsB3: 'Min = al menos tantas tiradas al nivel objetivo. Tope = máximo de tiradas en esa stat.',
  builderHelpRequiredTitle: 'Substats requeridos',
  builderHelpRequiredBody: 'Cuántos de tus substats elegidos debe tener el objeto. Los bloqueados siempre cuentan. "Auto" establece min(4, número seleccionado) y lo mantiene sincronizado.',
  builderHelpMinRollsTitle: 'Tiradas mínimas',
  builderHelpMinRollsBody: 'Suma mínima de tiradas en tus substats elegidos. 0 = sin mínimo global. Ej.: 3 significa al menos 3 tiradas en total al nivel objetivo. Con solo comodines (★), "Temprano" mantiene concisas las reglas; "Tardío" muestra presencia temprano y aplica las reparticiones mínimas en +16.',
  
  
  
  
  
  
  
  
  
  
  
  
  builderHelpCommonTitle: 'Configs comunes',
  builderHelpCommonAHeading: 'A) Dos imprescindibles + uno opcional',
  builderHelpCommonAL1: 'Seleccionar: SPD, ACC, HP%, DEF%, RES',
  builderHelpCommonAL2: 'Bloquear: SPD y ACC (doble clic)',
  builderHelpCommonAL3: 'Substats requeridos: 3',
  builderHelpCommonAL4: 'Resultado: debe tener SPD y ACC, más uno de HP%/DEF%/RES.',
  builderHelpCommonBHeading: 'B) Exactamente tres substats clave',
  builderHelpCommonBL1: 'Seleccionar: SPD, CR%, CDMG% ',
  builderHelpCommonBL2: 'Substats requeridos: 3',
  builderHelpCommonBL3: 'Resultado: debe tener los tres. (Indicadores de tiradas opcionales.)',

  // Metasets dialog
  metasetsHeaderBlurb: 'Grupos con nombre de conjuntos. Aparecen en la parte superior del selector de sets.',
  metasetsMoveUp: 'Subir',
  metasetsMoveDown: 'Bajar',
  metasetsHiddenFromMenus: 'Oculto en menús',
  metasetsVisibleInMenus: 'Visible en menús',
  metasetsUses: '{n} uso(s)',
  metasetsUsesTooltip: 'Haz clic para seleccionar las configs que usan este metaset',
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

  // Filter panel
  
  
  
  
  
  
  
  filterRarity: 'Rareza',
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Rarity labels (generic)
  rarityCommon: 'Común',
  rarityUncommon: 'Poco común',
  rarityRare: 'Rara',
  rarityEpic: 'Épica',
  rarityLegendary: 'Legendaria',
  rarityMythical: 'Mítica',

  // Slot names (for future localization of labels next to icons)
  
  
  
  
  
  
  
  
  

  // Note dialog
  noteTitle: 'Nota',
  titleClearNote: '¿Borrar nota?',
  msgClearNote: 'Esto eliminará la nota actual de HSFR. Esta acción no se puede deshacer.',

  // Restore autosave dialog
  restoreAutosaveTitle: '¿Restaurar la última config guardada?',
  restoreAutosaveQuestion: 'Se encontró una sesión autoguardada. ¿Deseas restaurarla?',
  restoreAutosaveSummary: 'Configs: {configs} • Meta‑sets: {metas} • Nota: {note}',
  yes: 'Sí',
  no: 'No',

  // Help dialog
  
  

  // Tutorial chrome
  
  tutorialExit: 'Salir del tutorial',
  
  
  

  // Roll indicator help
  
  
  
  
  
  

  // Filter helpers
  
  
  

  // Factions (UI labels)
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Stat labels (UI)
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Builder panel caption and toasts
  builderIntroCaption: 'Usa el constructor de abajo para definir configs y añadirlas a tu conjunto personalizado. También puedes cargar/guardar tus configs (HSFR), incluidos los meta‑sets, y gestionarlas aquí mismo.',
  toastConfigsSaved: 'Configs guardadas. Revisa tu carpeta Descargas.',
  toastSellfileSaved: 'Archivo de venta guardado. Revisa tu carpeta Descargas.',
  toastL10nLoaded: 'Localización cargada: {lang}',
  toastL10nLoadFailed: 'Error al cargar el archivo de localización',

  // Tutorial section labels
  tutSectionBasicsLabel: 'Conceptos básicos',
  tutSectionAdvancedLabel: 'Avanzado',
  tutSectionMetasetsLabel: 'Meta‑sets',
  tutSectionConfigChipsLabel: 'Chips de config',
  tutSectionFinalSellLabel: 'Venta final',
  tutSectionSaveExportLabel: 'Guardar y exportar',

  // Note editor tooltips (Markdown toolbar)
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Tutorial steps (titles and bodies)
  tutWelcomeTitle: 'Bienvenido',
  tutWelcomeBody: 'Con ~~RSL Helper Sellfile Creator~~ puedes crear reglas en `Añadir configs y reglas` y ver los resultados en `Vista previa del archivo de venta`. Elegirás stats, `Sets` y niveles como `+16` para decidir qué conservar o vender. Este tutorial dura unos 10 minutos.\n\nConsejo: 💡 puedes iniciar este tutorial en cualquier momento desde el botón de ayuda.',
  tutActionTitle: 'Elegir acción',
  tutActionBody: 'Elige `Conservar` o `Vender`. Esto decide qué ocurre con los objetos que coinciden con esta config.',
  tutEnabledTitle: 'Habilitada en el archivo de venta',
  tutEnabledBody: 'Activa `Habilitada en el archivo de venta` para incluir o excluir esta config en el archivo exportado. Las configs deshabilitadas se guardan y aparecen tachadas en la vista previa; RSL Helper las lee pero no las aplica en el archivo exportado.',
  tutBasicsTitle: 'Rango/Rareza/Niveles',
  tutBasicsBody: 'Ajusta `Rango`, `Rareza`, `Facción`, `Nivel mín` y `Nivel máx`. Si `Rareza` está en `Auto`, se elige la rareza más baja que (a) garantice todos los substats bloqueados en el primer nivel emitido y (b) pueda alcanzar tus `Tiradas mínimas requeridas` hacia `+16`.',
  tutSlotsTitle: 'Elegir ranuras',
  tutSlotsBody: 'Apuntemos a `Botas`. Haz clic en el icono de `Botas`. Lo seleccionaremos por ti ahora.',
  tutMainTitle: 'Seleccionar stat principal',
  tutMainBody: 'Elige `SPD` en `Stat principal`. La regla tratará solo sobre botas de Velocidad.',
  tutSetsTitle: 'Opcional: elegir sets',
  tutSetsBody: 'Elige `Sets` (como Velocidad) o déjalo vacío para mantenerlo amplio. Elegiremos Velocidad como ejemplo.',
  tutAddConfigTitle: 'Añadir config',
  tutAddConfigBody: 'Haz clic en `Añadir como nueva config`. Pulsa `Siguiente` y haremos clic por ti. Tras añadir, el botón cambia a `Insertar después de la selección`.',
  tutConfigAddedTitle: 'Config añadida',
  tutConfigAddedBody: '¡Nais! La nueva `chip de config` está seleccionada. El botón ahora muestra `Insertar después de la selección`, por lo que las nuevas configs irán detrás de la seleccionada.',
  tutSeeRulesTitle: 'Ver tus reglas',
  tutSeeRulesBody: 'La `Vista previa del archivo de venta` muestra las reglas que crea tu config. Ves una regla porque no se eligieron `Substats` — básicamente: conservar todas las `Botas` con `SPD` en el set `Velocidad`. Haz clic en una fila para seleccionar la config correspondiente; haz clic en un chip para saltar a su primera fila.',

  tutAdvIntroTitle: 'Ejemplo avanzado',
  tutAdvIntroBody: 'Ahora apuntemos a piezas más fuertes con `Substats` y tiradas.',
  tutAdvSelectSlotsMainTitle: 'Seleccionar ranuras y stats principales',
  tutAdvSelectSlotsMainBody: 'Nos centraremos en `Pechera` y `Botas` de daño con stats principales `HP%`, `ATK%` y `DEF%`. Esto muestra cómo dirigir ranura y stat principal a la vez. Selecciona `Pechera` y `Botas` en `Ranuras`, y elige `HP%`, `ATK%`, `DEF%` en `Stat principal`. Ya lo hemos aplicado por ti.',
  tutAdvNameTitle: 'Nombrar tu config',
  tutAdvNameBody: 'Pon un `Nombre` corto y claro. Lo rellenaremos por ti ahora.',
  tutAdvChooseSubstatsTitle: 'Elegir substats',
  tutAdvChooseSubstatsBody: 'Elige `SPD`, `CR%` y `CDMG%` en `Substats`. Haz clic de nuevo para bloquear (🔒). Solo bloquearemos `CDMG%`.',
  tutAdvRequiredTitle: 'Substats requeridos',
  tutAdvRequiredBody: 'Ajusta `Requeridos` al número de substats elegidos que el objeto debe tener. Los bloqueados siempre cuentan y ocupan un cupo `Requeridos`. Pondremos `2`: `CDMG%` (bloqueado) más uno de `SPD` o `CR%`.',
  tutAdvMinRollsTitle: 'Tiradas mínimas requeridas',
  tutAdvMinRollsBody: '`Tiradas mínimas requeridas` es una suma sobre tus substats elegidos. Ej.: 3 = al menos tres tiradas combinadas hacia `+16` (no 3 cada una).\n\nConsejo: 💡 haz clic en el icono detrás de la etiqueta `Tiradas mínimas requeridas` para alternar la diana entre `Seleccionados` y solo `Bloqueados`.',
  tutAdvMilestonesBody: 'Usa `Umbrales por hitos` para dar forma a las filas tempranas: `Temprano` sube con las tiradas; `Tardío` espera a `+16` — antes pide solo lo necesario para mantener alcanzable el objetivo `+16`.',
  tutMetasetsManageTitle: 'Gestionar meta‑sets',
  tutMetasetsManageBody: 'Abre `Gestionar meta‑sets` para crear grupos con nombre de `Sets` reutilizables.',
  tutMetasetsAddTitle: 'Añadir un meta‑set',
  tutMetasetsAddBody: 'Haz clic en `Añadir meta‑set`. En `Siguiente` crearemos `Slow DD` con `Lethal`, `Savage` y `Stoneskin`. Los cambios se aplican al instante.',
  tutMetasetsAddedTitle: 'Meta‑set añadido',
  tutMetasetsAddedBody: 'Aquí está tu meta‑set `Slow DD` con `Lethal`, `Savage` y `Stoneskin`. Puedes renombrarlo o cambiar sus sets.',
  tutMetasetsIncludedTitle: 'Meta‑sets incluidos',
  tutMetasetsIncludedBody: 'Por defecto, la app incluye `Nuker`, `Support - Debuffer` y `Support - Survivability`. Hay otros meta‑sets por defecto.',
  tutMetasetsCloseTitle: 'Cerrar meta‑sets',
  tutMetasetsCloseBody: 'Haz clic en `Cerrar` cuando acabes. Tus `Meta‑sets` aparecen arriba en `Sets`.',
  tutMetasetsSelectTitle: 'Seleccionar un meta‑set',
  tutMetasetsSelectBody: 'Abre `Sets` y elige de tus `Meta‑sets` arriba. Reutilizables entre configs.',
  tutMetasetsInSetsTitle: 'Meta‑sets en Sets',
  tutMetasetsInSetsBody: 'Tus `Meta‑sets` se muestran aquí arriba para uso rápido.',
  tutAdvAddTitle: 'Añadir config avanzada',
  tutAdvAddBody: 'Haz clic en `Añadir como nueva config` para guardar este ejemplo avanzado. Puedes gestionar múltiples configs y su orden; la primera coincidencia gana.',
  tutAdvAddedTitle: 'Config avanzada añadida',
  tutAdvAddedBody: '¡Genial! La `chip de config` avanzada está añadida y seleccionada. Usa el menú del chip para duplicar, mover o eliminar.',
  tutAdvPreviewEarlyTitle: 'Qué hacen estas reglas',
  tutAdvPreviewEarlyBody: 'La `Vista previa del archivo de venta` muestra unas 84 reglas que aceptan cualquier mezcla `SPD/CR%/CDMG%` con al menos `2` tiradas. Como elegimos `Temprano`, esas `2` tiradas aparecen hacia `+8`. Lo que no coincide lo comprueban las siguientes reglas; si nada coincide, una `Venta final` podría venderlo.',
  tutConfigChipsTitle: 'Chips de config',
  tutConfigChipsBody: 'Las configs aparecen como `chips de config`. Clic derecho para abrir el menú — `Copiar al portapapeles` comparte solo esa config. Clic derecho en el vacío para `Copiar todas las configs`/`Pegar al final`.',
  tutFinalSellIntroTitle: 'Venta final (opcional)',
  tutFinalSellIntroBody: '`Venta final` añade reglas `Vender` para los objetos no cubiertos. Al activarla verás `¡Venta final activada!`.',
  tutFinalSellConfigureTitle: 'Configurar venta final',
  tutFinalSellConfigureBody: 'Haz clic en el icono de deslizadores para `Configurar`. Abriremos el diálogo después.',
  tutFinalSellDialogTitle: 'Diálogo: Venta final',
  tutFinalSellDialogBody: 'Elige qué vender (`Artefactos`, `Accesorios`) y qué `Rangos de nivel` (como `0–3`, … `16`). Activamos `Artefactos`; `+16` está desactivado por defecto.',
  tutNoteTitle: 'Añadir nota',
  tutNoteBody: 'Usa `Añadir nota` para anotar un recordatorio. Las notas se guardan en `.hsfr`, no en el `.hsf` exportado.',
  tutSaveExplainTitle: 'Guardar configs (.hsfr)',
  tutSaveExplainBody: 'Guarda `Configs, Meta‑sets, Nota` en Descargas. Los nombres incluyen marca temporal — guardar a menudo es seguro.',
  tutExportExplainTitle: 'Exportar archivo de venta de RSL Helper',
  tutExportExplainBody: 'Haz clic en `Exportar archivo de venta de RSL Helper` para guardar tu `.hsf` (Descargas). Exportar varias veces es seguro; la marca temporal ayuda a volver atrás.',
  tutPreviewHeaderMenuTitle: 'Menú de cabecera de la vista previa',
  tutPreviewHeaderMenuBody: 'Clic derecho en `Vista previa del archivo de venta` para abrir opciones: `Filas multilínea`, iconos de Ranura y Set, `Colorear bordes de stats`, `Paleta para daltónicos` (Normal, Okabe–Ito, Tritan).',
  tutPreviewFinishTitle: 'Previsualizar y finalizar',
  tutPreviewFinishBody: 'La `Vista previa del archivo de venta` muestra tus reglas finales. Puedes `Cargar archivo de venta de RSL Helper` para fusionar — normalmente no hace falta. Las reglas cargadas van primero; la primera coincidencia gana. Consejo: inicia el tutorial desde el botón de ayuda.',
  tutSectionAutoLateLabel: 'Auto + Tardío',

  // Extra Example: Accessories — Auto Rarity + Late (Banner SPD)
  tutAutoLateIntroTitle: 'Ejemplo Accesorios: Auto + Late',
  tutAutoLateIntroBody: 'Creamos una regla simple para `Estandarte` con `Rareza` = `Auto` y `Hitos` = `Tardío`. Elige `VEL` como `Subestadística` y pide `Mejoras mínimas = 3` hasta `+16`. `Auto` elige la rareza más baja que aún permite tu objetivo; `Tardío` comprueba el objetivo completo en `+16` y antes pide solo lo necesario.',
  tutAutoLateAddTitle: 'Añadir esta config',
  tutAutoLateAddBody: 'Haz clic en `Insertar después de la selección`. La insertaremos a continuación para que veas sus reglas en la vista previa.',
  tutAutoLatePreviewTitle: 'Auto + Late en la vista previa',
  tutAutoLatePreviewBody: 'En `Vista previa de la venta`, ahora ves reglas para `Épico` y `Legendario` (Estandarte). `Auto` incluye rarezas que aún pueden llegar a `3` mejoras totales en `VEL` hasta `+16`. `Late` retrasa la comprobación completa a `+16`, manteniendo posibles las filas tempranas. Lo haremos por ti ahora para que veas el resaltado.',
  // Chips context menus
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Artifact set labels (UI)
  setLife: 'Vida',
  setOffense: 'Ataque',
  setDefense: 'Defensa',
  setSpeed: 'Velocidad',
  setCriticalRate: 'Prob. crítica',
  setCritDamage: 'Daño crítico',
  setAccuracy: 'Precisión',
  setResistance: 'Resistencia',
  setLifesteal: 'Robavida',
  setFury: 'Furia',
  setDaze: 'Atontamiento',
  setCursed: 'Maldito',
  setFrost: 'Escarcha',
  setFrenzy: 'Frenesí',
  setRegeneration: 'Regeneración',
  setImmunity: 'Inmunidad',
  setShield: 'Escudo',
  setRelentless: 'Implacable',
  setSavage: 'Salvaje',
  setDestroy: 'Destrucción',
  setStun: 'Aturdimiento',
  setToxic: 'Tóxico',
  setProvoke: 'Provocación',
  setRetaliation: 'Represalia',
  setAvenging: 'Vengador',
  setStalwart: 'Inquebrantable',
  setReflex: 'Reflejo',
  setCuring: 'Curación',
  setCruel: 'Cruel',
  setImmortal: 'Inmortal',
  setDivineOffense: 'Ataque divino',
  setDivineCriticalRate: 'Prob. crítica divina',
  setDivineLife: 'Vida divina',
  setDivineSpeed: 'Velocidad divina',
  setSwiftParry: 'Parada veloz',
  setDeflection: 'Desvío',
  setResilience: 'Robustez',
  setPerception: 'Percepción',
  setAffinitybreaker: 'Rompeafinidad',
  setUntouchable: 'Intocable',
  setFatal: 'Fatal',
  setFrostbite: 'Congelación',
  setBloodthirst: 'Sed de sangre',
  setGuardian: 'Guardián',
  setFortitude: 'Fortaleza',
  setLethal: 'Letal',
  setProtection: 'Protección',
  setStoneskin: 'Piel de piedra',
  setKillstroke: 'Golpe letal',
  setInstinct: 'Instinto',
  setBolster: 'Refuerzo',
  setDefiant: 'Desafiante',
  setImpulse: 'Impulso',
  setZeal: 'Celo',
  setRighteous: 'Rectitud',
  setSupersonic: 'Supersónico',
  setMerciless: 'Despiadado',
  setSlayer: 'Asesino',
  setFeral: 'Bestial',
  setPinpoint: 'Precisión fina',
  setStonecleaver: 'Quebrantapiedras',
  setRebirth: 'Renacer',
  setChronophage: 'Cronófago',
  setRefresh: 'Refrescar',
  setCleansing: 'Purificación',
  setBloodshield: 'Escudo de sangre',
  setReaction: 'Reacción',
  setRevenge: 'Venganza',
}

export default overrides
