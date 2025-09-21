import type { Catalog } from '../types'

const overrides: Catalog = {
  // App / Panels
  appBuilderTitle: 'Додати конфіги та правила',
  loadConfigs: 'Завантажити конфіги (.hsfr)',
  configOne: 'конфіг',
  configMany: 'конфіги',
  editNote: 'Редагувати нотатку',
  addNote: 'Додати нотатку',
  saveAllConfigs: 'Зберегти всі конфіги (.hsfr)',
  deleteConfigs: 'Видалити конфіги',

  sellfilePreview: 'Попередній перегляд файлу продажу',
  manageColors: 'Керування кольорами',
  optionalLoadSellfile: 'Необов’язково: завантажте наявний файл продажу для перегляду злиття.',
  loadSellfile: 'Завантажити файл продажу RSL Helper',
  clear: 'Очистити',
  loadedBaseRuleOne: 'Завантажено 1 базове правило',
  loadedBaseRuleMany: 'Завантажено базових правил: {n}',
  filtersOn: 'Фільтри увімкн.',
  filtersOff: 'Фільтри вимкн.',
  filterTooltip: 'Фільтрує таблицю (лише перегляд). Експорт ігнорує фільтри.',
  addFinalSellTooltip: 'Додати правила продажу для невідповідних предметів',
  finalSellOn: 'Фінальний продаж увімкнено!',
  finalSellOff: 'Без фінального продажу',
  configure: 'Налаштувати',
  configureFinalSellAria: 'Налаштувати фінальний продаж',
  exportIgnoresFilters: 'Експорт ігнорує фільтри',
  exportMergedSellfile: 'Експортувати об’єднаний файл продажу RSL Helper',
  exportSellfile: 'Експортувати файл продажу RSL Helper',
  manageColorsAria: 'Керування кольорами',
  // Rule Tester
  testerOpenLabel: 'Тестер правил',
  testerOpenTooltip: 'Відкрити тестер правил',
  testerTitle: 'Тестер правил',
  testerIntro: 'Створіть прикладові предмети, щоб побачити, яке правило спрацює першим, і чи буде предмет збережено чи продано.',
  testerEmptyHint: 'Додайте предмети, щоб перевірити, яке правило спрацює першим.',
  testerRule: 'Правило',
  testerConfig: 'Конфіг',
  testerNoMatch: 'Немає збігів',
  testerFinalSell: 'Фінальний продаж',
  noSetAccessories: 'Немає — лише аксесуари',
  // Common UI bits used in Rule Tester
  add: 'Додати',
  compact: 'Компактний',
  expanded: 'Розгорнутий',
  view: 'Переглянути',
  
  

  close: 'Закрити',
  cancel: 'Скасувати',
  enabled: 'Увімкнено',
  disabled: 'Вимкнено',
  delete: 'Видалити',
  deleteAll: 'Видалити все',
  reset: 'Скинути',
  resetToDefaults: 'Скинути до стандартних',
  restore: 'Відновити',
  dismiss: 'Закрити',
  startTutorial: 'Почати навчання',

  // Generic
  
  
  
  helpOpenLabel: 'Довідка',
  helpOpenTooltip: 'Відкрити довідку / README',
  

  titleDeleteAllConfigs: 'Видалити всі конфіги?',
  msgDeleteAllConfigs: 'Це видалить усі користувацькі конфіги правил (HSFR). Дію не можна скасувати.',
  titleDeleteConfig: 'Видалити цей конфіг?',
  msgDeleteConfig: 'Буде видалено лише цей конфіг з HSFR.',
  titleDeleteSelectedConfigs: 'Видалити {n} конфігів?',
  msgDeleteSelectedConfigs: 'Це видалить вибрані {n} конфіги з HSFR.',

  titlePasteConfigJson: 'Вставити JSON конфіга',
  msgPasteInstructions: 'Вставте один конфіг, масив конфігів або об’єкт HSFR з полем Configs.',
  placeholderPasteExample: 'Приклад: {example}',
  titleCopyConfigJson: 'Копіювати JSON конфіга',
  msgBlockedClipboard: 'Браузер заблокував доступ до буфера обміну. Виділіть і скопіюйте вручну.',

  titleFinalSellRules: 'Правила фінального продажу',
  msgFinalSellExplainer: 'Додайте правила фінального продажу для предметів, яких не охоплюють правила Зберегти.\nКоли фінальний продаж увімкнено, ці правила явно включають усі на даний момент відомі сети (в перегляді показано як «Усі відомі»; експортується повний список). Без фінального продажу невідповідні предмети автоматично зберігаються. Продаж відбувається лише за збігу з правилом продажу.',
  labelGearToSell: 'Спорядження для продажу',
  labelLevelRanges: 'Діапазони рівнів',
  artifacts: 'Артефакти',
  accessories: 'Аксесуари',
  offByDefaultTooltip: 'Типово вимкнено, аби не продавати повністю прокачане спорядження. За неправильного використання в RSL Helper може продати цінні предмети +16.',

  titleSubstatChipColors: 'Кольори чипів підстатів',
  msgChooseColors: 'Виберіть кольори для кожного підстату.',
  labelText: 'Текст',
  labelBg: 'Фон',

  titleManageMinima: 'Мінімальні значення підстатів',
  msgMinimaHelp: 'Використовується під час генерації порогів на кожному рівні.',
  showLowStars: 'Показати 1–4★',
  hideLowStars: 'Сховати 1–4★',
  columnSubstat: 'Підстат',
  star6: '6★',
  star5: '5★',
  star4: '4★',
  star3: '3★',
  star2: '2★',
  star1: '1★',
  titleResetMinima: 'Скинути мінімуми до стандартних?',
  msgResetMinima: 'Відновлює рекомендовані значення з документації.',

  titleManageMetasets: 'Керування метасетами',
  addMetaset: 'Додати метасет',
  titleClearMetaset: 'Очистити сети в цьому метасеті?',
  msgClearMetaset: 'Видалить усі сети з метасету. Сам метасет залишиться.',
  titleDeleteMetaset: 'Видалити цей метасет?',
  msgNoRefs: 'Метасет буде видалено. Жоден конфіг на нього не посилається.',
  refsCount: '{n} конфігів посилаються на цей метасет.',
  msgChooseUpdate: 'Виберіть, як оновити ці конфіги.',
  titleResetMetasets: 'Скинути метасети до стандартних?',
  msgResetNoRefs: 'Жоден конфіг не використовує ваші метасети. Список буде замінено стандартним.',
  msgResetSomeRefs: 'Деякі конфіги використовують ваші метасети. Виберіть спосіб оновлення.',

  // Sets search/order controls
  setsSearch: 'Пошук сетів',
  setsClearSearch: 'Очистити пошук',
  setsTooltipIcons: 'Подання: сітка значків',
  setsTooltipGame: 'Порядок у грі',
  setsTooltipAz: 'Алфавітний',
  menuMetasetsSection: 'Метасети',

  // File drag overlay
  fileDropTitle: 'Перетягніть файл для завантаження',
  fileDropSubtitle: 'Підтримує .hsfr (конфіги + метасети) та .hsf (файл продажу)',

  // Sets section labels
  setsTitle: 'Сети',
  setsUsageInConfigs: '({n} використ. у конфігах)',
  setsInNames: 'у: {names}',

  // Set tooltip bits
  setPieceCount: '{n} предмет',
  setTooltipNamed: '{name} — {count}',

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
  colIdx: '№',
  colCfg: 'Cfg',
  colKeep: 'Зберегти',
  colUse: 'Вик.',
  colSets: 'Сети',
  colSlot: 'Слот',
  colRankRarity: 'Ранг/Рідкість',
  colMain: 'Основний',
  colLevel: 'Рівень',
  colFaction: 'Фракція',
  colSub: 'Підстат',
  rulesHeaderHelp: '{label} — перетягніть для зміни порядку; праворуч тягніть для зміни ширини; правий клік — опції',
  rulesEmpty: 'Поки немає правил продажу RSL Helper.',
  rulesEmptyFiltered: 'Немає правил через фільтр.',
  keepValueKeep: 'Зберегти',
  keepValueSell: 'Продати',
  setAllKnownShorthand: 'Усі відомі',
  // Config chip labels
  
  
  
  
  // Header menu controls
  rulesMenuWrapRows: 'Багаторядкові рядки',
  rulesMenuSlotsAsIcons: 'Слоти як значки',
  rulesMenuSetsAsIcons: 'Сети як значки',
  rulesMenuColorStatTexts: 'Кольоровий текст статів',
  rulesMenuColorBlindPalette: 'Палітра для дальтоніків',
  commonOn: 'Увімк.',
  commonOff: 'Вимк.',
  headerMenuResetCols: 'Скинути колонки',
  headerMenuAuto: 'Авто',
  headerMenuShown: 'Показано',
  headerMenuHidden: 'Приховано',
  headerMenuShownInTable: 'Показано в таблиці',
  headerMenuHiddenInTable: 'Приховано в таблиці',
  // Row context menu
  rowMenuClear: 'Очистити',
  rowMenuDuplicate: 'Дублювати',
  rowMenuMoveTop: 'На початок',
  rowMenuMoveUp: 'Вище',
  rowMenuMoveDown: 'Нижче',
  rowMenuMoveBottom: 'В кінець',
  rowMenuCopy: 'Копіювати в буфер',
  rowMenuPasteAfter: 'Вставити після',
  rowMenuDelete: 'Видалити',
  // Color-blind labels
  colorBlindNormal: 'Звичайна',
  colorBlindOkabeIto: 'Окабе–Іто',
  colorBlindTritan: 'Тритан',

  // Builder panel
  builderConfigName: 'Назва конфіга',
  builderClearConfigName: 'Очистити назву',
  builderAction: 'Дія',
  builderActionHelp: 'Виберіть, що робить цей конфіг. Зберегти: зберігає відповідне спорядження. Продати: продає відповідне спорядження.',
  builderEnabledInExport: 'Увімкнено в експорті',
  builderDisabledInExport: 'Вимкнено в експорті',
  builderEnabledInSellfile: 'Увімкнено у файлі продажу',
  builderDisabledInSellfile: 'Вимкнено у файлі продажу',
  builderHelpOpen: 'Відкрити підказку',
  builderRank: 'Ранг',
  builderRankHelp: 'Які зіркові ранги відповідають. «Будь‑який» — усі.',
  any: 'Будь‑який',
  builderSubstatValues: 'Значення підстатів…',
  builderMain: 'Основний стат',
  builderMainHelp: 'Виберіть основні стат(и). Залиште порожнім для «Будь‑який».',
  
  
  
  builderSlots: 'Слоти',
  builderSlotsHelp: 'Застосовувати лише до цих слотів.',
  
  builderMinLevel: 'Мін. рівень',
  builderMinLevelHelp: 'Найраніший рівень для перевірки (+0, +4, …).',
  builderMaxLevel: 'Макс. рівень',
  builderMaxLevelHelp: 'Найпізніший рівень для перевірки (+0, +4, …).',
  builderFaction: 'Фракція',
  builderFactionHelp: 'Лише аксесуари (кільце, амулет, прапор). Інше спорядження ігнорує цей параметр.',
  builderRarityExact: 'Точно',
  builderRarityGte: 'Діапазони ≥',
  builderRarityLte: 'Діапазони ≤',
  builderMilestoneThresholds: 'Пороги за етапами',
  builderEarlyLabel: 'Рано',
  builderLateLabel: 'Пізно',
  
  
  builderRequiredSubstats: 'Обов’язкові підстати',
  builderRequiredSubstatsHelp: 'Скільки вибраних підстатів має мати предмет. Заблоковані підстати завжди зараховуються.',
  builderMinRequiredRolls: 'Мін. потрібні рулони',
  builderMinRequiredRollsTip1: 'Мінімальна загальна кількість рулонів за вибраними підстатами (сума).',
  builderMinRequiredRollsTip2: '0 означає відсутність глобального мінімуму. Ранні віхи показують лише правила, що залишаються досяжними до +16.',
  
  
  
  builderMilestoneThresholdsHelp: 'Як поводяться пороги до +16, коли задаєте мінімальні кидки. Впливає лише якщо якийсь підстат має Min > 0 або задано глобальний мінімум кидків.',
  
  builderMsgClearSets: 'Видаляє всі вибрані сети та метасети для цього конфіга.',
  builderInsertAfterSelected: 'Вставити після вибраного',
  builderAddAsNew: 'Додати як новий конфіг',
  builderSaveChangesToSelected: 'Зберегти зміни до вибраної',
  builderUnsavedChangesAria: 'незбережені зміни',
  builderMsgClearBuilder: 'Очищає поточні поля та вибори конструктора.',

  // Builder quick help (popover)
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Metasets dialog
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Filter panel
  
  
  
  
  
  
  
  filterRarity: 'Рідкість',
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Rarity labels (generic)
  rarityCommon: 'Звичайна',
  rarityUncommon: 'Незвичайна',
  rarityRare: 'Рідкісна',
  rarityEpic: 'Епічна',
  rarityLegendary: 'Легендарна',
  rarityMythical: 'Міфічна',

  // Slot names (for future localization of labels next to icons)
  
  
  
  
  
  
  
  
  

  // Note dialog
  noteTitle: 'Нотатка',
  titleClearNote: 'Очистити нотатку?',
  msgClearNote: 'Це видалить поточну нотатку з HSFR. Дію не можна скасувати.',

  // Restore autosave dialog
  restoreAutosaveTitle: 'Відновити останній збережений конфіг?',
  restoreAutosaveQuestion: 'Знайдено автозбережену сесію. Відновити її?',
  restoreAutosaveSummary: 'Конфіги: {configs} • Метасети: {metas} • Нотатка: {note}',
  yes: 'Так',
  no: 'Ні',

  // Help dialog
  
  

  // Tutorial chrome
  tutorialStep: 'Крок',
  tutorialExit: 'Вийти з навчання',
  tutorialBack: 'Назад',
  tutorialNext: 'Далі',
  tutorialFinish: 'Готово',

  // Roll indicator help
  
  
  
  
  
  

  // Filter helpers
  
  
  

  // Factions (UI labels)
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Stat labels (UI)
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Builder panel caption and toasts
  
  toastConfigsSaved: 'Конфіги збережено. Перевірте папку «Завантаження».',
  toastSellfileSaved: 'Файл продажу збережено. Перевірте папку «Завантаження».',
  toastL10nLoaded: 'Локалізацію завантажено: {lang}',
  toastL10nLoadFailed: 'Не вдалося завантажити файл локалізації',

  // Tutorial section labels
  tutSectionBasicsLabel: 'Основи',
  tutSectionAdvancedLabel: 'Розширене',
  tutSectionMetasetsLabel: 'Метасети',
  tutSectionConfigChipsLabel: 'Конфіг-чипи',
  tutSectionFinalSellLabel: 'Фінальний продаж',
  tutSectionSaveExportLabel: 'Збереження й експорт',

  // Note editor tooltips (Markdown toolbar)
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Tutorial steps (titles and bodies)
  tutWelcomeTitle: 'Ласкаво просимо',
  tutWelcomeBody: 'З ~~RSL Helper Sellfile Creator~~ ви можете створювати правила у `Додати конфіги та правила` і бачити результат у `Попередній перегляд файлу продажу`. Ви обиратимете статі, `Sets` та рівні на кшталт `+16`, щоб вирішувати, що зберігати або продавати. Цей навчальний курс триває приблизно 10 хвилин.\n\nПорада: 💡 Цей навчальний курс можна запустити будь‑коли з кнопки довідки.',
  tutActionTitle: 'Оберіть дію',
  tutActionBody: 'Виберіть `Зберегти` або `Продати`. Це визначає, що станеться з предметами, які відповідають цьому конфігу.',
  tutEnabledTitle: 'Увімкнено у файлі продажу',
  tutEnabledBody: 'Перемикайте `Увімкнено у файлі продажу`, щоб включати або виключати цей конфіг з експортованого файлу. Вимкнені конфіги зберігаються і відображаються в `Попередній перегляд файлу продажу` перекресленими. Під час експорту RSL Helper зчитує ці правила, але не застосовує їх.',
  tutBasicsTitle: 'Ранг/Рідкість/Рівні',
  tutBasicsBody: 'Задайте `Ранг`, `Рідкість`, `Фракція`, `Мін. рівень` і `Макс. рівень`. Якщо `Рідкість` — `Auto`, береться найнижча рідкість, яка (a) гарантує всі 🔒 підстати на першому рівні й (b) дозволяє досягти ваших `Мін. потрібних рулонів` до `+16`.',
  tutSlotsTitle: 'Вибір слотів',
  tutSlotsBody: 'Націлимось на `Черевики`. Натисніть на іконку `Черевики`, щоб вибрати. Ми виберемо за вас.',
  tutMainTitle: 'Вибір основного стату',
  tutMainBody: 'Виберіть `SPD` у `Основний стат`. Так правило стосується лише швидкісних черевиків.',
  tutSetsTitle: 'Необов’язково: оберіть сети',
  tutSetsBody: 'Виберіть `Sets` (наприклад, Speed) або залиште порожнім для ширшого охоплення. Тут виберемо Speed.',
  tutAddConfigTitle: 'Додати конфіг',
  tutAddConfigBody: 'Натисніть `Додати як нову конфіг`. Тисніть `Далі`, і ми натиснемо за вас. Після додавання кнопка зміниться на `Вставити після вибраного`.',
  tutConfigAddedTitle: 'Конфіг додано',
  tutConfigAddedBody: 'Готово! Новий `конфіг-чип` вибрано. Кнопка тепер показує `Вставити після вибраного`, тобто нові конфіги підуть після вибраного.',
  tutSeeRulesTitle: 'Перегляньте правила',
  tutSeeRulesBody: '`Попередній перегляд файлу продажу` показує правила, створені цим конфігом. Видно лише одне правило, бо `Підстати` не обрані — по суті: зберігати всі `Черевики` з `SPD` у сеті `Speed`. Клік по рядку вибирає пов’язану конфіг; клік по чипу прокручує до першого рядка.',

  tutAdvIntroTitle: 'Розширений приклад',
  tutAdvIntroBody: 'Тепер націлимось на сильніші речі за допомогою `Підстатів` та рулонів. Задамо прості, читабельні цілі.',
  tutAdvSelectSlotsMainTitle: 'Оберіть слоти та основні статі',
  tutAdvSelectSlotsMainBody: 'Позначте `Нагрудник` і `Черевики` у `Слоти` та виберіть `HP%`, `ATK%`, `DEF%` у `Основний стат`. Ми вже застосували це.',
  tutAdvNameTitle: 'Назвіть конфіг',
  tutAdvNameBody: 'Задайте коротку, зрозумілу `Назву`. Ми заповнимо її зараз.',
  tutAdvChooseSubstatsTitle: 'Оберіть підстати',
  tutAdvChooseSubstatsBody: 'Оберіть `SPD`, `CR%`, `CDMG%` у `Підстати`. Клікніть ще раз, щоб заблокувати (🔒) підстат — тоді він обов’язковий. Ми заблокуємо лише `CDMG%`.',
  tutAdvRequiredTitle: 'Обов’язкові підстати',
  tutAdvRequiredBody: 'Поле `Обов’язкові` — скільки обраних підстатів має бути в предметі. Заблоковані підстати обов’язкові й займають один слот `Обов’язкових`. Ставимо `2`: потрібні `CDMG%` (🔒) плюс один з `SPD` або `CR%`.',
  tutAdvMinRollsTitle: 'Мінімум потрібних рулонів',
  tutAdvMinRollsBody: '`Мін. потрібні рулони` — сума рулонів за обраними підстатами. Напр.: 3 означає щонайменше три сумарні рулони до `+16` (не по 3 на кожен).\n\nПорада: 💡 Натисніть на іконку позаду мітки `Мін. потрібні рулони`, щоб перемикати ціль між `Вибрані` та лише `🔒`.',
  tutAdvMilestonesBody: 'Скеровуйте ранні рядки через `Пороги за етапами`: `Рано` зростає з рулонами; `Пізно` чекає до `+16` — до того вимагає лише необхідне, зберігаючи досяжність цілі.',
  tutMetasetsManageTitle: 'Керування метасетами',
  tutMetasetsManageBody: 'Відкрийте `Керування метасетами`, щоб створити іменовані групи `Sets` для повторного використання.',
  tutMetasetsAddTitle: 'Додати метасет',
  tutMetasetsAddBody: 'Натисніть `Додати метасет`. На `Далі` ми створимо `Slow DD` із сетами `Lethal`, `Savage`, `Stoneskin`. Метасети можна змінювати в будь‑який час — зміни миттєво впливають на поточні конфіги.',
  tutMetasetsAddedTitle: 'Метасет додано',
  tutMetasetsAddedBody: 'Ваш `Slow DD` із сетами `Lethal`, `Savage`, `Stoneskin`. Можна перейменувати та змінювати сети будь‑коли.',
  tutMetasetsIncludedTitle: 'Вбудовані метасети',
  tutMetasetsIncludedBody: 'Типово доступні корисні метасети: `Nuker`, `Support - Debuffer`, `Support - Survivability`. Є й інші типові (у цьому навчанні не показані).',
  tutMetasetsCloseTitle: 'Закрити метасети',
  tutMetasetsCloseBody: 'Натисніть `Закрити`. Ваші `Metasets` з’являться зверху списку `Sets` для швидкого вибору.',
  tutMetasetsSelectTitle: 'Вибрати метасет',
  tutMetasetsSelectBody: 'Відкрийте `Sets` і виберіть один із ваших `Metasets` угорі. Їх можна перевикористовувати в різних конфігах.',
  tutMetasetsInSetsTitle: 'Метасети в списку сетів',
  tutMetasetsInSetsBody: 'Ваші `Metasets` відображаються тут, на початку списку, для швидкого доступу.',
  tutAdvAddTitle: 'Додати розширений конфіг',
  tutAdvAddBody: 'Натисніть `Додати як нову конфіг`, щоб зберегти цей приклад. Можна керувати кількома конфігами та їх порядком; перший збіг перемагає.',
  tutAdvAddedTitle: 'Розширений конфіг додано',
  tutAdvAddedBody: 'Чудово! Розширений `конфіг-чип` додано й вибрано. Меню чипа дозволяє дублювати, переміщати або видаляти конфіги.',
  tutAdvPreviewEarlyTitle: 'Що роблять ці правила',
  tutAdvPreviewEarlyBody: '`Попередній перегляд файлу продажу` показує ≈84 правила, що приймають будь‑яку комбінацію `SPD`/`CR%`/`CDMG%` за умови мінімум `2` рулонів. Через `Рано` ці `2` рулони з’являються до `+8`. Невідповідні речі перевірять наступні правила; якщо збігів немає, їх може продати `Фінальний продаж`.',
  tutConfigChipsTitle: 'Конфіг-чипи',
  tutConfigChipsBody: 'Конфіги відображаються як `конфіг-чипи`. Правий клік по вибраному чипу відкриває меню — `Копіювати в буфер` ділиться лише цим конфігом (зручно для Discord/Telegram). Правий клік по порожньому місцю відкриває `Копіювати всі конфіги` та `Вставити в кінець`.',
  tutFinalSellIntroTitle: 'Фінальний продаж (необов’язково)',
  tutFinalSellIntroBody: 'Використовуйте `Фінальний продаж`, щоб додати прості правила `Продати` для предметів, що не збіглися з вашими конфігами. Кнопка `Фінальний продаж` перемикає режим. Якщо увімкнено, бачите `Фінальний продаж увімкнено!`. Тримайте вимкненим, якщо потрібні лише явні конфіги.',
  tutFinalSellConfigureTitle: 'Налаштувати фінальний продаж',
  tutFinalSellConfigureBody: 'Натисніть іконку повзунків, щоб `Налаштувати`. Далі відкриємо діалог.',
  tutFinalSellDialogTitle: 'Діалог фінального продажу',
  tutFinalSellDialogBody: 'Оберіть, що продавати (`Артефакти`, `Аксесуари`) і які `Діапазони рівнів` (напр., `0–3`, `4–7`, … `16`). Це додасть правила Продати для невідповідних речей. Ми увімкнемо тільки `Артефакти`. `+16` вимкнено, аби не продавати повністю прокачане. Можна увімкнути тут або в ~~RSL Helper~~ після перевірки.',
  tutNoteTitle: 'Додати нотатку',
  tutNoteBody: 'Скористайтесь `Додати нотатку`, щоб залишити коротке нагадування — про що цей проєкт, посилання на версії тощо. Якщо ділитеся `.hsfr`, нотатка допоможе іншим зрозуміти контекст і наступні кроки. Нотатки зберігаються з конфігами в `.hsfr` і не потрапляють у `.hsf`.',
  tutSaveExplainTitle: 'Зберегти конфіги (.hsfr)',
  tutSaveExplainBody: 'Натисніть `Зберегти всі конфіги (.hsfr)`, щоб зберегти проєкт (`Конфіги`, `Метасети`, `Нотатка`). Файл з’явиться в «Завантаженнях» і міститиме час. Часто зберігати — безпечно.',
  tutExportExplainTitle: 'Експортувати файл продажу RSL Helper',
  tutExportExplainBody: 'Натисніть `Експортувати файл продажу RSL Helper`, щоб зберегти `.hsf`. Файл завантажується до «Завантажень». Можна експортувати багато разів — мітка часу допоможе повернутись.',
  tutPreviewHeaderMenuTitle: 'Меню заголовка попереднього перегляду',
  tutPreviewHeaderMenuBody: 'Клацніть правою кнопкою по заголовку `Попередній перегляд файлу продажу`, щоб відкрити опції таблиці. Тут можна вмикати `Багаторядкові рядки`, показувати/ховати іконки `Слот`/`Сети`, перемикати `Кольоровий текст статів` і вибрати `Палітру для дальтоніків` (Звичайна, Окабе–Іто, Тритан). `Esc` або клік поза меню — закрити.',
  tutPreviewFinishTitle: 'Попередній перегляд і завершення',
  tutPreviewFinishBody: '`Попередній перегляд файлу продажу` показує фінальні правила. Можна `Завантажити файл продажу RSL Helper`, щоб об’єднати його з вашими — зазвичай це не потрібно. Якщо завантажите, його правила підуть першими перед вашими (`конфіг-чипи`). Перемагає перший збіг — тож `Продати` з завантаженого файлу можуть спрацювати раніше ваших.\n\nПорада: 💡 Цей курс можна запустити будь‑коли з кнопки довідки.',
  tutSectionAutoLateLabel: 'Авто + Пізно',

  // Extra Example: Accessories — Auto Rarity + Late (Banner SPD)
  tutAutoLateIntroTitle: 'Приклад аксесуарів: Авто + Пізно',
  tutAutoLateIntroBody: 'Зробімо просте правило для `Прапора` з `Рідкість` = `Авто` і `Віхи` = `Пізно`. Оберіть `SPD` як `Підстат` і задайте `Мін. проків = 3` до `+16`. `Авто` бере найнижчу рідкість, що ще дозволяє ціль; `Пізно` повну перевірку робить на `+16`, а до того вимагає лише необхідне.',
  tutAutoLateAddTitle: 'Додати цей конфіг',
  tutAutoLateAddBody: 'Натисніть `Вставити після вибраного`. Ми додамо її — побачите правила в перегляді.',
  tutAutoLatePreviewTitle: 'Авто + Пізно у перегляді',
  tutAutoLatePreviewBody: 'У `Попередньому перегляді файлу продажу` тепер є правила і для `Епічних`, і для `Легендарних` Прапорів. `Авто` охоплює рідкості, що можуть набрати `3` сумарні проки в `SPD` до `+16`. `Пізно` відкладає повну перевірку до `+16`, тож ранні рядки лишаються здійсненними. Ми зробимо це за вас просто зараз, щоб ви побачили підсвічування.',
  // Chips context menus
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Artifact set labels (UI)
  setLife: 'Життя',
  setOffense: 'Атака',
  setDefense: 'Захист',
  setSpeed: 'Швидкість',
  setCriticalRate: 'Шанс крит.',
  setCritDamage: 'Крит. шкода',
  setAccuracy: 'Точність',
  setResistance: 'Опір',
  setLifesteal: 'Вампіризм',
  setFury: 'Лють',
  setDaze: 'Дезорієнтація',
  setCursed: 'Прокляття',
  setFrost: 'Мороз',
  setFrenzy: 'Шаленість',
  setRegeneration: 'Регенерація',
  setImmunity: 'Імунітет',
  setShield: 'Щит',
  setRelentless: 'Невпинність',
  setSavage: 'Лютість',
  setDestroy: 'Руйнування',
  setStun: 'Оглушення',
  setToxic: 'Токсичність',
  setProvoke: 'Провокація',
  setRetaliation: 'Відплата',
  setAvenging: 'Помста',
  setStalwart: 'Непохитний',
  setReflex: 'Рефлекс',
  setCuring: 'Зцілення',
  setCruel: 'Жорстокість',
  setImmortal: 'Безсмертя',
  setDivineOffense: 'Божественна атака',
  setDivineCriticalRate: 'Божеств. крит. шанс',
  setDivineLife: 'Божественне життя',
  setDivineSpeed: 'Божественна швидкість',
  setSwiftParry: 'Швидкий парир',
  setDeflection: 'Відбиття',
  setResilience: 'Стійкість',
  setPerception: 'Сприйняття',
  setAffinitybreaker: 'Руйнувач афінітету',
  setUntouchable: 'Недоторканний',
  setFatal: 'Фатальний',
  setFrostbite: 'Обмороження',
  setBloodthirst: 'Кровожерність',
  setGuardian: 'Охоронець',
  setFortitude: 'Міць',
  setLethal: 'Смертельний',
  setProtection: 'Захист',
  setStoneskin: "Кам'яна шкіра",
  setKillstroke: 'Вбивчий удар',
  setInstinct: 'Інстинкт',
  setBolster: 'Підсилення',
  setDefiant: 'Непокірний',
  setImpulse: 'Імпульс',
  setZeal: 'Ревність',
  setRighteous: 'Праведність',
  setSupersonic: 'Надзвуковий',
  setMerciless: 'Безжальний',
  setSlayer: 'Вбивця',
  setFeral: 'Дикий',
  setPinpoint: 'Точний приціл',
  setStonecleaver: 'Каменеріз',
  setRebirth: 'Переродження',
  setChronophage: 'Хронофаг',
  setRefresh: 'Оновлення',
  setCleansing: 'Очищення',
  setBloodshield: 'Кривавий щит',
  setReaction: 'Реакція',
  setRevenge: 'Помста',
}

export default overrides
