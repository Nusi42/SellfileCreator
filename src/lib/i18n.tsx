/**
 * Minimal i18n layer (strictly typed)
 *
 * Why: Keep multi-language support small and dependency-free. We centralize
 * UI strings in typed catalogs and expose a React context with a `t` helper.
 * We persist the selected language in localStorage to keep behavior stable.
 */
import React from 'react'
import { LANG_KEY } from './constants'

export type Language = 'en' | 'de' | 'fr' | 'es' | 'pt'

// Base (English) catalog is the source of truth for keys
const en = {
  // HeaderActions
  loadConfigs: 'Load Configs (.hsfr)',
  configOne: 'config',
  configMany: 'configs',
  editNote: 'Edit Note',
  addNote: 'Add Note',
  saveAllConfigs: 'Save all configs (.hsfr)',
  deleteConfigs: 'Delete Configs',

  // PreviewHeaderActions
  sellfilePreview: 'Sellfile Preview',
  manageColors: 'Manage Colors',
  optionalLoadSellfile: 'Optional: Load an existing Sellfile to preview the merge.',
  loadSellfile: 'Load RSL Helper Sellfile',
  clear: 'Clear',
  loadedBaseRuleOne: 'Loaded 1 base rule',
  loadedBaseRuleMany: 'Loaded {n} base rules',
  filtersOn: 'Filters On',
  filtersOff: 'Filters Off',
  filterTooltip: 'Filter the table (view only). Export ignores filters.',
  addFinalSellTooltip: 'Add Sell rules for unmatched items',
  finalSellOn: 'Final Sell is On!',
  finalSellOff: 'No Final Sell',
  configure: 'Configure',
  configureFinalSellAria: 'Configure final sell',
  exportIgnoresFilters: 'Export ignores filters',
  exportMergedSellfile: 'Export merged RSL Helper Sellfile',
  exportSellfile: 'Export RSL Helper Sellfile',
  manageColorsAria: 'Manage colors',

  // Common buttons
  close: 'Close',
  cancel: 'Cancel',
  delete: 'Delete',
  deleteAll: 'Delete all',
  reset: 'Reset',
  resetToDefaults: 'Reset to defaults',
  restore: 'Restore',
  dismiss: 'Dismiss',
  startTutorial: 'Start Tutorial',

  // ConfirmDialogs
  titleDeleteAllConfigs: 'Delete all configs?',
  msgDeleteAllConfigs: 'This will delete all custom rule configurations (HSFR). This action cannot be undone.',
  titleDeleteConfig: 'Delete this configuration?',
  msgDeleteConfig: 'This will remove only this configuration from HSFR.',
  titleDeleteSelectedConfigs: 'Delete {n} configurations?',
  msgDeleteSelectedConfigs: 'This will remove the selected {n} configurations from HSFR.',

  // Paste/Copy dialogs
  titlePasteConfigJson: 'Paste Config JSON',
  msgPasteInstructions: 'Paste a single config, an array of configs, or an HSFR object containing Configs.',
  placeholderPasteExample: 'Example: {example}',
  titleCopyConfigJson: 'Copy Config JSON',
  msgBlockedClipboard: 'Your browser blocked clipboard access. Select and copy manually.',

  // Final Sell dialog
  titleFinalSellRules: 'Final Sell Rules',
  msgFinalSellExplainer: 'Add final Sell rules for items not matched by your Keep rules.\nWhen Final Sell is on, these Sell rules include all currently known sets explicitly (shown as “All Currently Known” in the preview; exported with the full set list). Without Final Sell, items that do not match any rule are automatically kept. Selling only happens when a Sell rule matches.',
  labelGearToSell: 'Gear to Sell',
  labelLevelRanges: 'Level Ranges',
  artifacts: 'Artifacts',
  accessories: 'Accessories',
  offByDefaultTooltip: 'Off by default to avoid selling fully leveled gear. Turning this on can sell valuable +16 items if misused in RSL Helper.',

  // Manage Colors dialog
  titleSubstatChipColors: 'Substat Chip Colors',
  msgChooseColors: 'Choose colors per substat.',
  labelText: 'Text',
  labelBg: 'Bg',

  // Minima dialog
  titleManageMinima: 'Manage Minimum Substat Values',
  msgMinimaHelp: 'Used when generating thresholds at each level.',
  showLowStars: 'Show 1–4★',
  hideLowStars: 'Hide 1–4★',
  columnSubstat: 'Substat',
  star6: '6★',
  star5: '5★',
  star4: '4★',
  star3: '3★',
  star2: '2★',
  star1: '1★',
  titleResetMinima: 'Reset minima to defaults?',
  msgResetMinima: 'This restores the recommended values from the documentation.',

  // Metasets dialog (subset)
  titleManageMetasets: 'Manage Metasets',
  addMetaset: 'Add metaset',
  titleClearMetaset: 'Clear sets from this metaset?',
  msgClearMetaset: 'This removes all gear sets from the metaset. The metaset itself remains.',
  titleDeleteMetaset: 'Delete this metaset?',
  msgNoRefs: 'This removes the metaset. No configs reference it.',
  refsCount: '{n} config(s) reference this metaset.',
  msgChooseUpdate: 'Choose how to update those configs.',
  titleResetMetasets: 'Reset metasets to defaults?',
  msgResetNoRefs: 'No configs reference your current metasets. This will replace your metasets list with defaults.',
  msgResetSomeRefs: 'Some configs reference your current metasets. Choose how to update them.',
}

const de: Catalog = {
  // HeaderActions
  loadConfigs: 'Konfigurationen laden (.hsfr)',
  configOne: 'Konfiguration',
  configMany: 'Konfigurationen',
  editNote: 'Notiz bearbeiten',
  addNote: 'Notiz hinzufügen',
  saveAllConfigs: 'Alle Konfigurationen speichern (.hsfr)',
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
  msgDeleteAllConfigs: 'Dies löscht alle benutzerdefinierten Regelkonfigurationen (HSFR). Dieser Vorgang kann nicht rückgängig gemacht werden.',
  titleDeleteConfig: 'Diese Konfiguration löschen?',
  msgDeleteConfig: 'Dies entfernt nur diese Konfiguration aus HSFR.',
  titleDeleteSelectedConfigs: '{n} Konfiguration(en) löschen?',
  msgDeleteSelectedConfigs: 'Dadurch werden die ausgewählten {n} Konfiguration(en) aus HSFR entfernt.',
  titlePasteConfigJson: 'Config‑JSON einfügen',
  msgPasteInstructions: 'Füge eine einzelne Konfiguration, ein Array von Konfigurationen oder ein HSFR‑Objekt mit „Configs“ ein.',
  placeholderPasteExample: 'Beispiel: {example}',
  titleCopyConfigJson: 'Config‑JSON kopieren',
  msgBlockedClipboard: 'Der Browser hat den Zugriff auf die Zwischenablage blockiert. Bitte manuell markieren und kopieren.',
  titleFinalSellRules: 'Finale Verkaufsregeln',
  msgFinalSellExplainer: 'Füge finale Verkaufsregeln für Gegenstände hinzu, die von deinen Behalten‑Regeln nicht erfasst werden.\nWenn „Finaler Verkauf“ aktiviert ist, enthalten diese Regeln explizit alle aktuell bekannten Sets (im Vorschaubildschirm als „Alle aktuell bekannten“ angezeigt; Export mit vollständiger Setliste). Ohne finalen Verkauf werden nicht zugeordnete Gegenstände automatisch behalten. Verkauft wird nur, wenn eine Verkaufsregel greift.',
  labelGearToSell: 'Ausrüstung zum Verkaufen',
  labelLevelRanges: 'Stufenbereiche',
  artifacts: 'Artefakte',
  accessories: 'Accessoires',
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
}

const fr: Catalog = {
  // HeaderActions
  loadConfigs: 'Charger des configurations (.hsfr)',
  configOne: 'configuration',
  configMany: 'configurations',
  editNote: 'Modifier la note',
  addNote: 'Ajouter une note',
  saveAllConfigs: 'Enregistrer toutes les configurations (.hsfr)',
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
  msgDeleteAllConfigs: 'Cela supprime toutes les configurations de règles personnalisées (HSFR). Cette action est irréversible.',
  titleDeleteConfig: 'Supprimer cette configuration ?',
  msgDeleteConfig: 'Cela supprime uniquement cette configuration du HSFR.',
  titleDeleteSelectedConfigs: 'Supprimer {n} configuration(s) ?',
  msgDeleteSelectedConfigs: 'Cela supprime les {n} configuration(s) sélectionnées du HSFR.',
  titlePasteConfigJson: 'Coller le JSON de configuration',
  msgPasteInstructions: 'Collez une seule configuration, un tableau de configurations, ou un objet HSFR contenant Configs.',
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
}

const es: Catalog = {
  // HeaderActions
  loadConfigs: 'Cargar configuraciones (.hsfr)',
  configOne: 'configuración',
  configMany: 'configuraciones',
  editNote: 'Editar nota',
  addNote: 'Añadir nota',
  saveAllConfigs: 'Guardar todas las configuraciones (.hsfr)',
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
  msgDeleteAllConfigs: 'Esto eliminará todas las configuraciones de reglas personalizadas (HSFR). Esta acción no se puede deshacer.',
  titleDeleteConfig: '¿Eliminar esta configuración?',
  msgDeleteConfig: 'Esto eliminará solo esta configuración del HSFR.',
  titleDeleteSelectedConfigs: '¿Eliminar {n} configuración(es)?',
  msgDeleteSelectedConfigs: 'Esto eliminará las {n} configuración(es) seleccionadas del HSFR.',
  titlePasteConfigJson: 'Pegar JSON de configuración',
  msgPasteInstructions: 'Pega una sola configuración, un arreglo de configuraciones o un objeto HSFR que contenga Configs.',
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
}

const pt: Catalog = {
  // HeaderActions
  loadConfigs: 'Carregar configurações (.hsfr)',
  configOne: 'configuração',
  configMany: 'configurações',
  editNote: 'Editar nota',
  addNote: 'Adicionar nota',
  saveAllConfigs: 'Salvar todas as configurações (.hsfr)',
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
  msgDeleteAllConfigs: 'Isto excluirá todas as configurações de regras personalizadas (HSFR). Esta ação não pode ser desfeita.',
  titleDeleteConfig: 'Excluir esta configuração?',
  msgDeleteConfig: 'Isto removerá apenas esta configuração do HSFR.',
  titleDeleteSelectedConfigs: 'Excluir {n} configurações?',
  msgDeleteSelectedConfigs: 'Isto removerá as {n} configurações selecionadas do HSFR.',
  titlePasteConfigJson: 'Colar JSON da configuração',
  msgPasteInstructions: 'Cole uma única configuração, um array de configurações ou um objeto HSFR contendo Configs.',
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
}

type I18nKey = keyof typeof en
type Catalog = { [K in I18nKey]: string }

const CATALOGS: Record<Language, Catalog> = { en: en as Catalog, de, fr, es, pt }

function safeGetLanguage(): Language {
  try {
    const raw = localStorage.getItem(LANG_KEY)
    if (raw === 'de' || raw === 'fr' || raw === 'es' || raw === 'pt') return raw as Language
    // No explicit preference stored: auto-detect
    return detectPreferredLanguage()
  } catch {
    return detectPreferredLanguage()
  }
}

type I18nContextValue = {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: I18nKey, params?: Record<string, string | number>) => string
  // Register a runtime catalog for quick testing (e.g., via dropped file)
  registerRuntimeCatalog: (langCode: string, catalog: Partial<Catalog>) => void
}

const I18nContext = React.createContext<I18nContextValue | null>(null)

function detectPreferredLanguage(): Language {
  try {
    const supported: Language[] = ['en', 'de', 'fr', 'es', 'pt']
    const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]).map((l) => String(l || '').toLowerCase())
    for (const entry of langs) {
      const base = entry.split('-')[0] as Language
      if ((supported as string[]).includes(base)) return base
    }
    return 'en'
  } catch { return 'en' }
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Language>(safeGetLanguage)
  const [runtimeCatalogs, setRuntimeCatalogs] = React.useState<Record<string, Catalog>>({})

  const setLang = React.useCallback((l: Language) => {
    setLangState(l)
    try {
      const auto = detectPreferredLanguage()
      if (l === auto) {
        // Do not persist if it matches auto-detected, so next launch re-autodetects.
        localStorage.removeItem(LANG_KEY)
      } else {
        localStorage.setItem(LANG_KEY, l)
      }
    } catch {}
  }, [])

  const registerRuntimeCatalog = React.useCallback((langCode: string, patch: Partial<Catalog>) => {
    const base = en as Catalog
    const merged: Catalog = { ...base, ...(CATALOGS[langCode as Language] || {}), ...(patch as Catalog) }
    setRuntimeCatalogs((prev) => ({ ...prev, [langCode]: merged }))
    // Switch to the runtime language without persisting selection
    setLangState((langCode as Language) || 'en')
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
