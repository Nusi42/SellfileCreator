import type { Catalog } from '../types'
// Russian catalog overrides. Provider composes with English at runtime.
const overrides: Catalog = {
  // Rule Tester
  testerOpenLabel: 'Тестер правил',
  testerOpenTooltip: 'Открыть тестер правил',
  testerTitle: 'Тестер правил',
  testerIntro: 'Создайте примерные предметы, чтобы увидеть, какое правило сработает первым и будет ли предмет сохранён или продан.',
  testerEmptyHint: 'Добавьте предметы, чтобы проверить, какое правило сработает первым.',
  testerFinalSell: 'Финальная продажа',
  testerRule: 'Правило',
  testerConfig: 'Конфигурация',
  testerNoMatch: 'Нет совпадения',
  view: 'Просмотр',
  add: 'Добавить',
  compact: 'Компактный',
  expanded: 'Развёрнутый',
  noSetAccessories: 'Нет — только аксессуары',
  // Rarity labels
  rarityCommon: 'Обычный',
  rarityUncommon: 'Необычный',
  rarityRare: 'Редкий',
  rarityEpic: 'Эпический',
  rarityLegendary: 'Легендарный',
  rarityMythical: 'Мифический',
  // Tutorial chrome
  tutorialStep: 'Шаг',
  tutorialExit: 'Выйти из обучения',
  tutorialBack: 'Назад',
  tutorialNext: 'Далее',
  tutorialFinish: 'Готово',

  // HeaderActions / common actions
  loadConfigs: 'Загрузить конфигурации (.hsfr)',
  configOne: 'конфигурация',
  configMany: 'конфигурации',
  editNote: 'Редактировать заметку',
  addNote: 'Добавить заметку',
  saveAllConfigs: 'Сохранить все конфигурации (.hsfr)',
  deleteConfigs: 'Удалить конфигурации',

  // PreviewHeaderActions
  sellfilePreview: 'Предпросмотр файла продажи',
  manageColors: 'Управление цветами',
  optionalLoadSellfile: 'Необязательно: загрузите существующий Sellfile для просмотра слияния.',
  loadSellfile: 'Загрузить Sellfile RSL Helper',
  clear: 'Очистить',
  loadedBaseRuleOne: 'Загружено 1 базовое правило',
  loadedBaseRuleMany: 'Загружено базовых правил: {n}',
  filtersOn: 'Фильтры вкл.',
  filtersOff: 'Фильтры выкл.',
  filterTooltip: 'Фильтрует таблицу (только просмотр). Экспорт игнорирует фильтры.',
  addFinalSellTooltip: 'Добавить правила продажи для неподходящих предметов',
  finalSellOn: 'Финальная продажа включена!',
  finalSellOff: 'Без финальной продажи',
  configure: 'Настроить',
  configureFinalSellAria: 'Настроить финальную продажу',
  exportIgnoresFilters: 'Экспорт игнорирует фильтры',
  exportMergedSellfile: 'Экспортировать объединённый Sellfile RSL Helper',
  exportSellfile: 'Экспортировать Sellfile RSL Helper',
  manageColorsAria: 'Управление цветами',

  // Common buttons
  close: 'Закрыть',
  cancel: 'Отмена',
  enabled: 'Включено',
  disabled: 'Отключено',
  delete: 'Удалить',
  deleteAll: 'Удалить всё',
  reset: 'Сброс',
  resetToDefaults: 'Сброс к значениям по умолчанию',
  restore: 'Восстановить',
  dismiss: 'Скрыть',
  startTutorial: 'Запустить обучение',

  // Dialogs: delete/copy/paste
  titleDeleteAllConfigs: 'Удалить все конфигурации?',
  msgDeleteAllConfigs: 'Это удалит все пользовательские конфигурации правил (HSFR). Действие нельзя отменить.',
  titleDeleteConfig: 'Удалить эту конфигурацию?',
  msgDeleteConfig: 'Будет удалена только эта конфигурация из HSFR.',
  titleDeleteSelectedConfigs: 'Удалить {n} конфигураций?',
  msgDeleteSelectedConfigs: 'Это удалит выбранные {n} конфигурации из HSFR.',
  titlePasteConfigJson: 'Вставить JSON конфигурации',
  msgPasteInstructions: 'Вставьте одну конфигурацию, массив конфигураций или объект HSFR с полем Configs.',
  placeholderPasteExample: 'Пример: {example}',
  titleCopyConfigJson: 'Копировать JSON конфигурации',
  msgBlockedClipboard: 'Браузер заблокировал доступ к буферу обмена. Выделите и скопируйте вручную.',

  // Final Sell
  titleFinalSellRules: 'Правила финальной продажи',
  msgFinalSellExplainer:
    'Добавьте правила финальной продажи для предметов, не попавших под правила Сохранить.\nКогда финальная продажа включена, эти правила явно включают все известные на данный момент сеты (в превью показаны как «Все известные»; экспорт содержит полный список). Без финальной продажи неподходящие предметы автоматически сохраняются. Продажа происходит только при совпадении с правилом продажи.',
  labelGearToSell: 'Снаряжение для продажи',
  labelLevelRanges: 'Диапазоны уровней',
  artifacts: 'Артефакты',
  accessories: 'Аксессуары',
  offByDefaultTooltip:
    'По умолчанию выключено, чтобы не продавать полностью прокачанные вещи. При неверном использовании в RSL Helper может продать ценные предметы +16.',

  // Substat colors
  titleSubstatChipColors: 'Цвета чипов подстатов',
  msgChooseColors: 'Выберите цвета для каждого подстата.',
  labelText: 'Текст',
  labelBg: 'Фон',

  // Minima
  titleManageMinima: 'Минимальные значения подстатов',
  msgMinimaHelp: 'Используется при генерации порогов на каждом уровне.',
  showLowStars: 'Показать 1–4★',
  hideLowStars: 'Скрыть 1–4★',
  columnSubstat: 'Подстат',
  star6: '6★',
  star5: '5★',
  star4: '4★',
  star3: '3★',
  star2: '2★',
  star1: '1★',
  titleResetMinima: 'Сбросить минимумы к умолчанию?',
  msgResetMinima: 'Восстанавливает рекомендуемые значения из документации.',

  // Metasets
  titleManageMetasets: 'Управление метасетами',
  addMetaset: 'Добавить метасет',
  titleClearMetaset: 'Очистить сеты в этом метасете?',
  msgClearMetaset: 'Удалит все сеты из метасета. Сам метасет останется.',
  titleDeleteMetaset: 'Удалить этот метасет?',
  msgNoRefs: 'Метасет будет удалён. На него нет ссылок в конфигурациях.',
  refsCount: '{n} конфигураций ссылаются на этот метасет.',
  msgChooseUpdate: 'Выберите, как обновить эти конфигурации.',
  titleResetMetasets: 'Сбросить метасеты к умолчанию?',
  msgResetNoRefs: 'Ни одна конфигурация не использует ваши метасеты. Список будет заменён значениями по умолчанию.',
  msgResetSomeRefs: 'Некоторые конфигурации используют ваши метасеты. Выберите способ обновления.',

  // Sets search/order controls
  setsSearch: 'Поиск сетов',
  setsClearSearch: 'Очистить поиск',
  setsTooltipIcons: 'Вид: сетка значков',
  setsTooltipGame: 'Порядок в игре',
  setsTooltipAz: 'По алфавиту',
  menuMetasetsSection: 'Метасеты',

  // File drag overlay
  fileDropTitle: 'Перетащите файл для загрузки',
  fileDropSubtitle: 'Поддерживает .hsfr (конфиги + метасеты) и .hsf (sellfile)',

  // Sets section labels
  setsTitle: 'Сеты',
  setsUsageInConfigs: '({n} использ. в конфигурациях)',
  setsInNames: 'в: {names}',

  // Set tooltip bits
  setPieceCount: '{n} предмет',
  setTooltipNamed: '{name} — {count}',

  // Rules table
  colIdx: '№',
  colCfg: 'Cfg',
  colKeep: 'Оставить',
  colUse: 'Исп.',
  colSets: 'Сеты',
  colSlot: 'Слот',
  colRankRarity: 'Ранг/Редкость',
  colMain: 'Основной',
  colLevel: 'Уровень',
  colFaction: 'Фракция',
  colSub: 'Подстат',
  rulesHeaderHelp:
    '{label} — перетащите для изменения порядка; справа тяните для изменения ширины; правый клик для опций',
  rulesEmpty: 'Пока нет правил продажи RSL Helper.',
  rulesEmptyFiltered: 'Нет правил из‑за фильтра.',
  keepValueKeep: 'Оставить',
  keepValueSell: 'Продать',
  setAllKnownShorthand: 'Все известные',

  // Header menu controls
  rulesMenuWrapRows: 'Многострочные строки',
  rulesMenuSlotsAsIcons: 'Слоты как иконки',
  rulesMenuSetsAsIcons: 'Сеты как иконки',
  rulesMenuColorStatTexts: 'Цветной текст статов',
  rulesMenuColorBlindPalette: 'Палитра для дальтоников',
  commonOn: 'Вкл.',
  commonOff: 'Выкл.',
  headerMenuResetCols: 'Сбросить колонки',
  headerMenuAuto: 'Авто',
  headerMenuShown: 'Показано',
  headerMenuHidden: 'Скрыто',
  headerMenuShownInTable: 'Показано в таблице',
  headerMenuHiddenInTable: 'Скрыто в таблице',

  // Row context menu
  rowMenuClear: 'Очистить',
  rowMenuDuplicate: 'Дублировать',
  rowMenuMoveTop: 'В начало',
  rowMenuMoveUp: 'Выше',
  rowMenuMoveDown: 'Ниже',
  rowMenuMoveBottom: 'В конец',
  rowMenuCopy: 'Копировать в буфер',
  rowMenuPasteAfter: 'Вставить после',
  rowMenuDelete: 'Удалить',

  // Color‑blind labels
  colorBlindNormal: 'Обычная',
  colorBlindOkabeIto: 'Окабе–Ито',
  colorBlindTritan: 'Тритан',

  // Builder panel
  builderConfigName: 'Имя конфигурации',
  builderClearConfigName: 'Очистить имя конфигурации',
  builderAction: 'Действие',
  builderActionHelp:
    'Выберите, что делает эта конфигурация. Оставить: сохраняет подходящее снаряжение. Продать: продаёт подходящее снаряжение.',
  builderEnabledInExport: 'Включена в экспорт',
  builderDisabledInExport: 'Отключена в экспорт',
  builderEnabledInSellfile: 'Включена в Sellfile',
  builderDisabledInSellfile: 'Отключена в Sellfile',
  builderHelpOpen: 'Открыть краткую справку',
  builderRank: 'Ранг',
  builderRankHelp: 'Какие звёздные ранги совпадают. «Любой» — все.',
  any: 'Любой',
  builderSubstatValues: 'Значения подстатов…',
  builderMain: 'Основной стат',
  builderMainHelp: 'Выберите основной(ые) стат(ы). Оставьте пустым для «Любой».',
  builderSlots: 'Слоты',
  builderSlotsHelp: 'Применять только к этим слотам.',
  builderMsgClearSets: 'Удаляет все выбранные сеты и метасеты для этой конфигурации.',
  builderInsertAfterSelected: 'Вставить после выбранного',
  builderAddAsNew: 'Добавить как новую конфигурацию',
  builderSaveChangesToSelected: 'Сохранить изменения в выбранную',
  builderUnsavedChangesAria: 'несохранённые изменения',
  builderMsgClearBuilder: 'Очищает текущие поля и выборы конструктора.',

  // Note dialog
  noteTitle: 'Заметка',
  titleClearNote: 'Очистить заметку?',
  msgClearNote: 'Это удалит текущую заметку из HSFR. Действие нельзя отменить.',

  // Restore autosave dialog
  restoreAutosaveTitle: 'Восстановить последнюю сохранённую конфигурацию?',
  restoreAutosaveQuestion: 'Найдена автосохранённая сессия. Восстановить её?',
  restoreAutosaveSummary: 'Конфиги: {configs} • Метасеты: {metas} • Заметка: {note}',
  yes: 'Да',
  no: 'Нет',

  // New builder help/labels
  builderMinLevel: 'Мин. уровень',
  builderMinLevelHelp: 'Самый ранний уровень для проверки (+0, +4, …).',
  builderMaxLevel: 'Макс. уровень',
  builderMaxLevelHelp: 'Самый поздний уровень для проверки (+0, +4, …).',
  builderFaction: 'Фракция',
  builderFactionHelp:
    'Только аксессуары (кольцо, амулет, знамя). Другая экипировка игнорирует этот параметр.',
  builderRarityExact: 'Точно',
  builderRarityGte: 'Диапазоны ≥',
  builderRarityLte: 'Диапазоны ≤',
  builderRequiredSubstats: 'Обязательные подстаты',
  builderRequiredSubstatsHelp:
    'Сколько выбранных подстатов должен иметь предмет. Заблокированные подстаты всегда засчитываются.',
  builderMinRequiredRolls: 'Мин. требуемые роли',
  builderMinRequiredRollsTip1:
    'Минимальное общее число ролей по выбранным подстатам (сумма).',
  builderMinRequiredRollsTip2:
    '0 означает отсутствие глобального минимума. Ранние вехи показывают только правила, которые остаются достижимыми к +16.',
  builderMinRequiredOn: 'Целевые подстаты',
  builderMinRequiredOnSelected: 'Выбранные',
  builderMinRequiredOnLocked: 'Только 🔒',
  builderMilestones: 'Пороги по этапам',
  builderEarly: 'Рано',
  builderLate: 'Поздно',
  builderStrategy: 'Стратегия',
  builderStrategyHelp:
    'Запасная стратегия при отсутствии совпадений выше. Чёрный список: по умолчанию сохранять. Белый список: по умолчанию продавать.',
  builderStrategyBlacklist: 'Чёрный список (сохр.)',
  builderStrategyWhitelist: 'Белый список (прод.)',

  // Toasts
  toastConfigsSaved: 'Конфигурации сохранены. Проверьте папку «Загрузки».',
  toastSellfileSaved: 'Sellfile сохранён. Проверьте папку «Загрузки».',
  toastL10nLoaded: 'Загружена локализация: {lang}',
  toastL10nLoadFailed: 'Не удалось загрузить файл локализации',

  // Tutorial section labels
  tutSectionBasicsLabel: 'Основы',
  tutSectionAdvancedLabel: 'Продвинутое',
  tutSectionMetasetsLabel: 'Метасеты',
  tutSectionConfigChipsLabel: 'Конфиг‑чипы',
  tutSectionFinalSellLabel: 'Финальная продажа',
  tutSectionSaveExportLabel: 'Сохранение и экспорт',

  // Tutorial steps (titles and bodies)
  tutWelcomeTitle: 'Добро пожаловать',
  tutWelcomeBody:
    'С помощью ~~RSL Helper Sellfile Creator~~ вы можете создавать правила в `Add Configs and Rules` и видеть результат в `Sellfile Preview`. Вы будете выбирать статы, `Sets` и уровни вроде `+16`, чтобы решать, что оставлять или продавать.\n\nСовет: 💡 Запустить это обучение можно в любое время из кнопки помощи.',
  tutActionTitle: 'Выберите действие',
  tutActionBody:
    'Выберите `Оставить` или `Продать`. Это определяет, что будет с предметами, подходящими под эту конфигурацию.',
  tutEnabledTitle: 'Включено в Sellfile',
  tutEnabledBody:
    'Переключайте `Включена в Sellfile`, чтобы включать или исключать эту конфигурацию из экспортируемого файла. Отключённые конфигурации сохраняются и отображаются в `Sellfile Preview` зачёркнутыми. В экспортированном файле RSL Helper игнорирует эти правила.',
  tutBasicsTitle: 'Ранг/Редкость/Уровни',
  tutBasicsBody:
    'Задайте `Ранг`, `Редкость`, `Фракция`, `Мин. уровень` и `Макс. уровень`. Если `Редкость` — `Auto`, выбирается минимальная редкость, которая (a) гарантирует наличие всех 🔒 подстатов на первом уровне и (b) позволяет набрать ваши `Мин. требуемые роли` к `+16`.',
  tutSlotsTitle: 'Выбор слотов',
  tutSlotsBody:
    'Давайте нацелимся на `Сапоги`. Нажмите на иконку `Сапоги`, чтобы выбрать. Мы выберем её за вас.',
  tutMainTitle: 'Выбор основного стата',
  tutMainBody:
    'Выберите `SPD` в `Основной стат`. Так правило будет про быстрые сапоги (Speed).',
  tutSetsTitle: 'Необязательно: выбрать сеты',
  tutSetsBody:
    'Выберите `Sets` (например, Speed) или оставьте пустым для более широкого охвата. В примере возьмём Speed.',
  tutAddConfigTitle: 'Добавить конфигурацию',
  tutAddConfigBody:
    'Нажмите `Добавить как новую конфигурацию`. Жмите `Далее`, и мы нажмём за вас. После добавления текст кнопки станет `Вставить после выбранного`.',
  tutConfigAddedTitle: 'Конфигурация добавлена',
  tutConfigAddedBody:
    'Готово! Новый `конфиг‑чип` выбран. Кнопка теперь показывает `Вставить после выбранного`, то есть новые конфиги пойдут после выбранного.',
  tutSeeRulesTitle: 'Посмотреть правила',
  tutSeeRulesBody:
    '`Sellfile Preview` показывает правила, получившиеся из конфигурации. Видна одна запись, потому что `Подстаты` не выбраны — по сути: оставить все `Сапоги` с `SPD` в сете `Speed`. Клик по строке выбирает соответствующую конфигурацию; клик по чипу прокручивает к первой строке.',

  tutAdvIntroTitle: 'Продвинутый пример',
  tutAdvIntroBody:
    'Теперь нацелимся на более сильные вещи с помощью `Подстатов` и ролей. Поставим простые, понятные цели.',
  tutAdvGoalTitle: 'Цель примера',
  tutAdvGoalBody:
    'Сфокусируемся на `Нагруднике` и `Сапогах` с основными статами `HP%`, `ATK%`, `DEF%`. Это показывает, как согласованно выбирать слот и основной стат.',
  tutAdvSelectSlotsMainTitle: 'Выбор слотов и основных статов',
  tutAdvSelectSlotsMainBody:
    'Отметьте `Нагрудник` и `Сапоги` в `Слоты` и выберите `HP%`, `ATK%`, `DEF%` в `Основной стат`. Мы уже применили это.',
  tutAdvNameTitle: 'Назовите конфигурацию',
  tutAdvNameBody:
    'Дайте конфигурации короткое понятное `Имя`. Мы заполним его сейчас.',
  tutAdvChooseSubstatsTitle: 'Выбор подстатов',
  tutAdvChooseSubstatsBody:
    'Выберите `SPD`, `CR%` и `CDMG%` в `Подстаты`. Нажмите ещё раз, чтобы заблокировать (🔒) подстат — тогда он обязателен. Мы заблокируем только `CDMG%`.',
  tutAdvRequiredTitle: 'Обязательные подстаты',
  tutAdvRequiredBody:
    'Параметр `Обязательные` — сколько из выбранных подстатов должен иметь предмет. Заблокированные подстаты обязательны и занимают один слот `Обязательных`. Поставим `2`: нужен `CDMG%` (🔒) и один из `SPD` или `CR%`.',
  tutAdvMinRollsTitle: 'Минимум требуемых ролей',
  tutAdvMinRollsBody:
    '`Мин. требуемые роли` — суммарное число ролей по выбранным подстатам. Например, 3 означает минимум три суммарных роли по выбранным статам к `+16` (не по 3 на каждый).\n\nСовет: 💡 Клик по метке `Мин. требуемые роли` переключает цель между `Выбранные` и только `🔒`.',
  tutAdvMilestonesTitle: 'Пороги по вехам',
  tutAdvMilestonesBody:
    'Используйте `Пороги по этапам`, чтобы формировать ранние строки: `Рано` растёт по мере получения ролей; `Поздно` ждёт до `+16` — до этого просит только необходимое, сохраняя достижимость цели к `+16`.',

  tutMetasetsManageTitle: 'Управление метасетами',
  tutMetasetsManageBody:
    'Откройте `Управление метасетами`, чтобы создавать именованные группы `Sets` для повторного использования.',
  tutMetasetsAddTitle: 'Добавить метасет',
  tutMetasetsAddBody:
    'Нажмите `Добавить метасет`. На `Далее` мы создадим метасет `Slow DD` с сетами `Lethal`, `Savage` и `Stoneskin`. Метасеты можно менять в любой момент — изменения сразу применяются к текущим конфигам.',
  tutMetasetsAddedTitle: 'Метасет добавлен',
  tutMetasetsAddedBody:
    'Ваш `Slow DD` с сетами `Lethal`, `Savage` и `Stoneskin`. Можно переименовать и менять наборы в любое время.',
  tutMetasetsIncludedTitle: 'Встроенные метасеты',
  tutMetasetsIncludedBody:
    'По умолчанию доступны полезные метасеты: `Nuker`, `Support - Debuffer` и `Support - Survivability`. Есть и другие дефолтные (не показаны в этом обучении).',
  tutMetasetsCloseTitle: 'Закрыть метасеты',
  tutMetasetsCloseBody:
    'Нажмите `Закрыть`. Ваши `Metasets` появятся сверху списка `Sets` для быстрого выбора.',
  tutMetasetsSelectTitle: 'Выбрать метасет',
  tutMetasetsSelectBody:
    'Откройте `Sets` и выберите один из `Metasets` вверху. Их можно переиспользовать в разных конфигурациях.',
  tutMetasetsInSetsTitle: 'Метасеты в списке сетов',
  tutMetasetsInSetsBody:
    'Ваши `Metasets` отображаются здесь, в начале списка, для быстрого доступа.',

  tutAdvAddTitle: 'Добавить продвинутую конфигурацию',
  tutAdvAddBody:
    'Нажмите `Добавить как новую конфигурацию`, чтобы сохранить этот пример. Вы можете управлять несколькими конфигами и их порядком; побеждает первое совпадение.',
  tutAdvAddedTitle: 'Продвинутая конфигурация добавлена',
  tutAdvAddedBody:
    'Отлично! Продвинутый `конфиг‑чип` добавлен и выбран. Используйте меню чипа, чтобы дублировать, перемещать или удалять.',
  tutAdvPreviewEarlyTitle: 'Что делают эти правила',
  tutAdvPreviewEarlyBody:
    '`Sellfile Preview` показывает около 84 правил, принимающих любой микс `SPD`/`CR%`/`CDMG%` при условии минимум `2` ролей. Так как выбрано `Рано`, эти `2` роли появляются к `+8`. Неподходящее снаряжение проверят следующие правила; если ничего не совпадёт, его может продать `Финальная продажа`.',

  tutConfigChipsTitle: 'Конфиг‑чипы',
  tutConfigChipsBody:
    'Конфигурации отображаются как `конфиг‑чипы`. Правый клик по выбранному чипу открывает меню — используйте `Копировать в буфер`, чтобы поделиться именно этой конфигурацией (удобно для Discord/Telegram). Правый клик по пустому месту открывает меню для `Копировать все конфигурации` и `Вставить в конец`.',

  tutFinalSellIntroTitle: 'Финальная продажа (опционально)',
  tutFinalSellIntroBody:
    'Используйте `Финальная продажа`, чтобы добавить простые правила `Продать` для предметов, не совпавших с вашими конфигурациями. Нажмите кнопку `Финальная продажа` для переключения. Если включено, увидите `Финальная продажа включена!`. Держите выключенной, если хотите полагаться только на явные конфиги.',
  tutFinalSellConfigureTitle: 'Настроить финальную продажу',
  tutFinalSellConfigureBody:
    'Нажмите на иконку ползунков, чтобы открыть `Настроить`. Далее откроем диалог.',
  tutFinalSellDialogTitle: 'Диалог финальной продажи',
  tutFinalSellDialogBody:
    'Выберите, что продавать (`Артефакты`, `Аксессуары`) и какие `Диапазоны уровней` (например, `0–3`, `4–7`, … `16`). Они добавляют правила Продать для неподходящих предметов. Мы включим только `Артефакты` — аксессуары в этом обучении не нацеливали. `+16` по умолчанию выключен, чтобы не продавать полностью прокачанное. Можно включить здесь или в ~~RSL Helper~~ после проверки.',

  tutNoteTitle: 'Добавить заметку',
  tutNoteBody:
    'Используйте `Добавить заметку`, чтобы оставить себе короткое напоминание — о чём этот проект, ссылки на версии и т. п. Если вы делитесь `.hsfr`, заметка поможет другим понять контекст и следующие шаги. Заметки сохраняются вместе с конфигами в `.hsfr` и не попадают в экспортируемый `.hsf`.',
  tutSaveExplainTitle: 'Сохранить конфиги (.hsfr)',
  tutSaveExplainBody:
    'Нажмите `Сохранить все конфигурации (.hsfr)`, чтобы сохранить проект (`Конфиги`, `Метасеты`, `Заметка`). Файл попадёт в «Загрузки» и получит метку времени. Сохранять часто — безопасно.',
  tutExportExplainTitle: 'Экспортировать Sellfile RSL Helper',
  tutExportExplainBody:
    'Нажмите `Экспортировать Sellfile RSL Helper`, чтобы сохранить `.hsf`. Файл скачается в «Загрузки». Экспортировать можно много раз — в названии есть время, так что легко откатиться.',
  tutPreviewHeaderMenuTitle: 'Меню заголовка предпросмотра',
  tutPreviewHeaderMenuBody:
    'Клик правой кнопкой по заголовку `Sellfile Preview` открывает настройки таблицы. Здесь можно включить `Многострочные строки`, показывать/скрывать иконки `Слот`/`Сеты`, переключать `Цветной текст статов` и выбрать `Палитру для дальтоников` (Обычная, Окабе–Ито, Тритан). Нажмите `Esc` или вне меню, чтобы закрыть.',
  tutPreviewFinishTitle: 'Предпросмотр и завершение',
  tutPreviewFinishBody:
    '`Sellfile Preview` показывает итоговые правила. Можно `Загрузить Sellfile RSL Helper`, чтобы объединить (merge) его с вашими правилами — обычно это не нужно. Если загрузите, его правила будут идти первыми перед вашими (`конфиг‑чипы`). Побеждает первое совпадение — поэтому `Продать` из загруженного файла могут сработать раньше ваших.\n\nСовет: 💡 Запустить это обучение можно в любое время из кнопки помощи.',

  // Названия наборов артефактов (UI)
  setLife: 'Жизнь',
  setOffense: 'Атака',
  setDefense: 'Защита',
  setSpeed: 'Скорость',
  setCriticalRate: 'Крит. шанс',
  setCritDamage: 'Крит. урон',
  setAccuracy: 'Меткость',
  setResistance: 'Сопротивление',
  setLifesteal: 'Вампиризм',
  setFury: 'Ярость',
  setDaze: 'Дезориентация',
  setCursed: 'Проклятие',
  setFrost: 'Мороз',
  setFrenzy: 'Исступление',
  setRegeneration: 'Регенерация',
  setImmunity: 'Иммунитет',
  setShield: 'Щит',
  setRelentless: 'Неудержимость',
  setSavage: 'Свирепость',
  setDestroy: 'Разрушение',
  setStun: 'Оглушение',
  setToxic: 'Токсичность',
  setProvoke: 'Провокация',
  setRetaliation: 'Возмездие',
  setAvenging: 'Мщение',
  setStalwart: 'Стойкость',
  setReflex: 'Рефлекс',
  setCuring: 'Исцеление',
  setCruel: 'Жестокость',
  setImmortal: 'Бессмертие',
  setDivineOffense: 'Божественная атака',
  setDivineCriticalRate: 'Божеств. крит. шанс',
  setDivineLife: 'Божественная жизнь',
  setDivineSpeed: 'Божественная скорость',
  setSwiftParry: 'Стремительный парир',
  setDeflection: 'Отражение',
  setResilience: 'Живучесть',
  setPerception: 'Восприятие',
  setAffinitybreaker: 'Разрушитель аффинити',
  setUntouchable: 'Неприкосновенность',
  setFatal: 'Смертельный',
  setFrostbite: 'Обморожение',
  setBloodthirst: 'Кровожадность',
  setGuardian: 'Страж',
  setFortitude: 'Твёрдость',
  setLethal: 'Летальный',
  setProtection: 'Защита',
  setStoneskin: 'Каменная кожа',
  setKillstroke: 'Убийственный удар',
  setInstinct: 'Инстинкт',
  setBolster: 'Укрепление',
  setDefiant: 'Непреклонность',
  setImpulse: 'Импульс',
  setZeal: 'Рвение',
  setRighteous: 'Праведность',
  setSupersonic: 'Сверхзвуковой',
  setMerciless: 'Безжалостность',
  setSlayer: 'Убийца',
  setFeral: 'Дикий',
  setPinpoint: 'Точечный удар',
  setStonecleaver: 'Камнедробитель',
  setRebirth: 'Возрождение',
  setChronophage: 'Хронофаг',
  setRefresh: 'Обновление',
  setCleansing: 'Очищение',
  setBloodshield: 'Кровавый щит',
  setReaction: 'Реакция',
  setRevenge: 'Месть',
}

export default overrides
