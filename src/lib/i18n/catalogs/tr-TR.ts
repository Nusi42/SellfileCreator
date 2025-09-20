import type { Catalog } from '../types'
import enUS from './en-US'

// Turkish catalog overrides. Export composes over English to keep keys in sync.
const overrides: Catalog = {
  // Tutorial chrome
  tutorialStep: 'Adım',
  tutorialExit: 'Öğreticiden çık',
  tutorialBack: 'Geri',
  tutorialNext: 'İleri',
  tutorialFinish: 'Bitti',

  // HeaderActions / common actions
  loadConfigs: 'Yapılandırmaları yükle (.hsfr)',
  configOne: 'yapılandırma',
  configMany: 'yapılandırma',
  editNote: 'Notu düzenle',
  addNote: 'Not ekle',
  saveAllConfigs: 'Tüm yapılandırmaları kaydet (.hsfr)',
  deleteConfigs: 'Yapılandırmaları sil',

  // PreviewHeaderActions
  sellfilePreview: 'Satış dosyası önizlemesi',
  manageColors: 'Renkleri yönet',
  optionalLoadSellfile: 'İsteğe bağlı: Birleşimi görmek için mevcut bir Sellfile yükleyin.',
  loadSellfile: 'RSL Helper Sellfile yükle',
  clear: 'Temizle',
  loadedBaseRuleOne: '1 temel kural yüklendi',
  loadedBaseRuleMany: '{n} temel kural yüklendi',
  filtersOn: 'Filtreler açık',
  filtersOff: 'Filtreler kapalı',
  filterTooltip: 'Tabloyu filtreler (yalnızca görüntüleme). Dışa aktarma filtreleri yok sayar.',
  addFinalSellTooltip: 'Eşleşmeyen öğeler için satış kuralları ekle',
  finalSellOn: 'Nihai satış açık!',
  finalSellOff: 'Nihai satış yok',
  configure: 'Yapılandır',
  configureFinalSellAria: 'Nihai satışı yapılandır',
  exportIgnoresFilters: 'Dışa aktarma filtreleri yok sayar',
  exportMergedSellfile: 'Birleştirilmiş RSL Helper Sellfile dışa aktar',
  exportSellfile: 'RSL Helper Sellfile dışa aktar',
  manageColorsAria: 'Renkleri yönet',

  // Common buttons
  close: 'Kapat',
  cancel: 'İptal',
  enabled: 'Etkin',
  disabled: 'Devre dışı',
  delete: 'Sil',
  deleteAll: 'Tümünü sil',
  reset: 'Sıfırla',
  resetToDefaults: 'Varsayılanlara sıfırla',
  restore: 'Geri yükle',
  dismiss: 'Gizle',
  startTutorial: 'Öğreticiyi başlat',

  // Dialogs: delete/copy/paste
  titleDeleteAllConfigs: 'Tüm yapılandırmalar silinsin mi?',
  msgDeleteAllConfigs: 'Bu işlem tüm özel kural yapılandırmalarını (HSFR) silecek. Geri alınamaz.',
  titleDeleteConfig: 'Bu yapılandırma silinsin mi?',
  msgDeleteConfig: 'Yalnızca bu yapılandırma HSFR’dan kaldırılacak.',
  titleDeleteSelectedConfigs: '{n} yapılandırma silinsin mi?',
  msgDeleteSelectedConfigs: 'Seçili {n} yapılandırma HSFR’dan kaldırılacak.',
  titlePasteConfigJson: 'Yapılandırma JSON yapıştır',
  msgPasteInstructions: 'Tek bir yapılandırma, yapılandırma dizisi veya Configs içeren bir HSFR nesnesi yapıştırın.',
  placeholderPasteExample: 'Örnek: {example}',
  titleCopyConfigJson: 'Yapılandırma JSON kopyala',
  msgBlockedClipboard: 'Tarayıcı pano erişimini engelledi. Elle seçip kopyalayın.',

  // Final Sell
  titleFinalSellRules: 'Nihai Satış Kuralları',
  msgFinalSellExplainer:
    '“Koru” kurallarıyla eşleşmeyen öğeler için nihai satış kuralları ekleyin.\nNihai satış açıkken bu kurallar bilinen tüm setleri açıkça içerir (önizlemede “Tüm bilinenler” olarak gösterilir; dışa aktarımda tam liste yer alır). Nihai satış olmadan eşleşmeyen öğeler korunur. Satış yalnızca bir satış kuralı eşleştiğinde olur.',
  labelGearToSell: 'Satılacak ekipman',
  labelLevelRanges: 'Seviye aralıkları',
  artifacts: 'Eserler',
  accessories: 'Aksesuarlar',
  offByDefaultTooltip:
    'Tam gelişmiş ekipmanı satmamak için varsayılan olarak kapalıdır. Yanlış kullanımda değerli +16 öğeleri satabilir.',

  // Substat colors
  titleSubstatChipColors: 'Alt stat çip renkleri',
  msgChooseColors: 'Her alt stat için renkleri seçin.',
  labelText: 'Metin',
  labelBg: 'Arka plan',

  // Minima
  titleManageMinima: 'Alt stat asgari değerleri',
  msgMinimaHelp: 'Her seviyede eşik üretirken kullanılır.',
  showLowStars: '1–4★ göster',
  hideLowStars: '1–4★ gizle',
  columnSubstat: 'Alt stat',
  star6: '6★',
  star5: '5★',
  star4: '4★',
  star3: '3★',
  star2: '2★',
  star1: '1★',
  titleResetMinima: 'Asgariler varsayılanlara sıfırlansın mı?',
  msgResetMinima: 'Dokümantasyondaki önerilen değerlere döndürür.',

  // Metasets
  titleManageMetasets: 'Meta setleri yönet',
  addMetaset: 'Meta set ekle',
  titleClearMetaset: 'Bu meta setten setler temizlensin mi?',
  msgClearMetaset: 'Meta setten tüm setleri kaldırır. Meta set kalır.',
  titleDeleteMetaset: 'Bu meta set silinsin mi?',
  msgNoRefs: 'Meta set kaldırılacak. Hiçbir yapılandırma onu kullanmıyor.',
  refsCount: '{n} yapılandırma bu meta sete referans veriyor.',
  msgChooseUpdate: 'Bu yapılandırmaları nasıl güncelleyeceğinizi seçin.',
  titleResetMetasets: 'Meta setler varsayılanlara sıfırlansın mı?',
  msgResetNoRefs: 'Hiçbir yapılandırma mevcut meta setlerinizi kullanmıyor. Liste varsayılanlarla değiştirilecek.',
  msgResetSomeRefs: 'Bazı yapılandırmalar mevcut meta setlerinizi kullanıyor. Nasıl güncelleneceğini seçin.',

  // Sets search/order controls
  setsSearch: 'Set ara',
  setsClearSearch: 'Aramayı temizle',
  setsTooltipIcons: 'Simge ızgara görünümü',
  setsTooltipGame: 'Oyundaki sıra',
  setsTooltipAz: 'Alfabetik',
  menuMetasetsSection: 'Meta setler',

  // File drag overlay
  fileDropTitle: 'Yüklemek için dosyayı bırak',
  fileDropSubtitle: '.hsfr (yapılandırmalar + meta setler) ve .hsf (sellfile) kabul edilir',

  // Sets section labels
  setsTitle: 'Setler',
  setsUsageInConfigs: '({n} kullanım yapılandırmalarda)',
  setsInNames: 'içinde: {names}',

  // Set tooltip bits
  setPieceCount: '{n} parça',
  setTooltipNamed: '{name} – {count}',

  // Rules table
  colIdx: 'No',
  colCfg: 'Cfg',
  colKeep: 'Koru',
  colUse: 'Kullan',
  colSets: 'Setler',
  colSlot: 'Yuvalar',
  colRankRarity: 'Rütbe/Nadirlik',
  colMain: 'Ana',
  colLevel: 'Seviye',
  colFaction: 'Faksiyon',
  colSub: 'Alt',
  rulesHeaderHelp:
    '{label} — sıralamak için sürükle; sağ koldan genişlik ayarla; sağ tık menüsü',
  rulesEmpty: 'Henüz RSL Helper satış kuralları yok.',
  rulesEmptyFiltered: 'Filtre nedeniyle kural yok.',
  keepValueKeep: 'Koru',
  keepValueSell: 'Sat',
  setAllKnownShorthand: 'Tüm bilinenler',

  // Header menu controls
  rulesMenuWrapRows: 'Çok satırlı satırlar',
  rulesMenuSlotsAsIcons: 'Yuvalar simge olarak',
  rulesMenuSetsAsIcons: 'Setler simge olarak',
  rulesMenuColorStatTexts: 'Stat metinlerini renklendir',
  rulesMenuColorBlindPalette: 'Renk körü paleti',
  commonOn: 'Açık',
  commonOff: 'Kapalı',
  headerMenuResetCols: 'Sütunları sıfırla',
  headerMenuAuto: 'Oto',
  headerMenuShown: 'Görünür',
  headerMenuHidden: 'Gizli',
  headerMenuShownInTable: 'Tabloda görünür',
  headerMenuHiddenInTable: 'Tabloda gizli',

  // Row context menu
  rowMenuClear: 'Temizle',
  rowMenuDuplicate: 'Kopyasını oluştur',
  rowMenuMoveTop: 'Başa taşı',
  rowMenuMoveUp: 'Yukarı taşı',
  rowMenuMoveDown: 'Aşağı taşı',
  rowMenuMoveBottom: 'Sona taşı',
  rowMenuCopy: 'Panoya kopyala',
  rowMenuPasteAfter: 'Sonrasına yapıştır',
  rowMenuDelete: 'Sil',

  // Color‑blind labels
  colorBlindNormal: 'Normal',
  colorBlindOkabeIto: 'Okabe–Ito',
  colorBlindTritan: 'Tritan',

  // Builder panel
  builderConfigName: 'Yapılandırma adı',
  builderClearConfigName: 'Adı temizle',
  builderAction: 'Eylem',
  builderActionHelp:
    'Bu yapılandırmanın ne yaptığını seçin. Koru: eşleşen ekipmanı korur. Sat: eşleşen ekipmanı satar.',
  builderEnabledInExport: 'Dışa aktarımda etkin',
  builderDisabledInExport: 'Dışa aktarımda kapalı',
  builderEnabledInSellfile: 'Sellfile içinde etkin',
  builderDisabledInSellfile: 'Sellfile içinde kapalı',
  builderHelpOpen: 'Hızlı yardımı aç',
  builderRank: 'Rütbe',
  builderRankHelp: 'Hangi yıldız rütbeleri eşleşir. “Herhangi” hepsiyle eşleşir.',
  any: 'Herhangi',
  builderSubstatValues: 'Alt stat değerleri…',
  builderMain: 'Ana stat',
  builderMainHelp: 'Ana stat(lar)ı seçin. Herhangi için boş bırakın.',
  builderSlots: 'Yuvalar',
  builderSlotsHelp: 'Yalnızca bu yuvalara uygula.',
  builderMsgClearSets: 'Bu yapılandırma için seçili tüm setleri ve meta setleri kaldırır.',
  builderInsertAfterSelected: 'Seçilenden sonra ekle',
  builderAddAsNew: 'Yeni yapılandırma olarak ekle',
  builderSaveChangesToSelected: 'Değişiklikleri seçiliye kaydet',
  builderUnsavedChangesAria: 'kaydedilmemiş değişiklikler',
  builderMsgClearBuilder: 'Geçerli alanları ve seçimleri temizler.',

  // Note dialog
  noteTitle: 'Not',
  titleClearNote: 'Not silinsin mi?',
  msgClearNote: 'Bu işlem mevcut notu HSFR’dan kaldırır. Geri alınamaz.',

  // Restore autosave dialog
  restoreAutosaveTitle: 'Son kaydedilen yapılandırma geri yüklensin mi?',
  restoreAutosaveQuestion: 'Otomatik kaydedilmiş bir oturum bulundu. Geri yüklensin mi?',
  restoreAutosaveSummary: 'Yapılandırmalar: {configs} • Meta setler: {metas} • Not: {note}',
  yes: 'Evet',
  no: 'Hayır',

  // New builder help/labels
  builderMinLevel: 'Min seviye',
  builderMinLevelHelp: 'Kontrol için en erken seviye (+0, +4, …).',
  builderMaxLevel: 'Maks seviye',
  builderMaxLevelHelp: 'Kontrol için en geç seviye (+0, +4, …).',
  builderFaction: 'Faksiyon',
  builderFactionHelp:
    'Yalnızca aksesuarlar (yüzük, tılsım, sancak). Diğer ekipman bunu yok sayar.',
  builderRarityExact: 'Tam',
  builderRarityGte: 'Aralıklar ≥',
  builderRarityLte: 'Aralıklar ≤',
  builderRequiredSubstats: 'Gerekli alt statlar',
  builderRequiredSubstatsHelp:
    'Seçtiğiniz alt statlardan kaçına sahip olmalı. Kilitli alt statlar her zaman sayılır.',
  builderMinRequiredRolls: 'Min gerekli rulolar',
  builderMinRequiredRollsTip1:
    'Seçtiğiniz alt statlar üzerindeki toplam en az rulo sayısı (toplam).',
  builderMinRequiredRollsTip2:
    '0, genel minimum yok demektir. Erken aşamalar sadece +16 hedefi ulaşılabilir tutan kuralları gösterir.',
  builderMinRequiredOn: 'Hedef alt statlar',
  builderMinRequiredOnSelected: 'Seçilenler',
  builderMinRequiredOnLocked: 'Yalnızca 🔒',
  builderMilestones: 'Aşama eşikleri',
  builderEarly: 'Erken',
  builderLate: 'Geç',
  builderStrategy: 'Strateji',
  builderStrategyHelp:
    'Yukarıda eşleşme yoksa yedek davranış. Kara liste: varsayılan koru. Beyaz liste: varsayılan sat.',
  builderStrategyBlacklist: 'Kara liste (koru)',
  builderStrategyWhitelist: 'Beyaz liste (sat)',

  // Toasts
  toastConfigsSaved: 'Yapılandırmalar kaydedildi. İndirilenler’i kontrol edin.',
  toastSellfileSaved: 'Sellfile kaydedildi. İndirilenler’i kontrol edin.',
  toastL10nLoaded: 'Yerelleştirme yüklendi: {lang}',
  toastL10nLoadFailed: 'Yerelleştirme dosyası yüklenemedi',

  // Tutorial section labels
  tutSectionBasicsLabel: 'Temeller',
  tutSectionAdvancedLabel: 'Gelişmiş',
  tutSectionMetasetsLabel: 'Meta setler',
  tutSectionConfigChipsLabel: 'Yapılandırma çipleri',
  tutSectionFinalSellLabel: 'Nihai satış',
  tutSectionSaveExportLabel: 'Kaydet ve dışa aktar',

  // Tutorial steps (titles and bodies)
  tutWelcomeTitle: 'Hoş geldiniz',
  tutWelcomeBody:
    '~~RSL Helper Sellfile Creator~~ ile `Add Configs and Rules` bölümünde kurallar oluşturabilir ve sonucu `Sellfile Preview` içinde görebilirsiniz. Hangi eşyanın korunup satılacağına karar vermek için statları, `Sets` ve `+16` gibi seviyeleri seçersiniz.\n\nİpucu: 💡 Bu öğreticiyi yardım düğmesinden istediğiniz zaman başlatabilirsiniz.',
  tutActionTitle: 'Eylem seçin',
  tutActionBody:
    '`Koru` veya `Sat` seçin. Bu, bu yapılandırmayla eşleşen öğelere ne olacağını belirler.',
  tutEnabledTitle: 'Sellfile içinde etkin',
  tutEnabledBody:
    '`Sellfile içinde etkin` anahtarını açıp kapatarak bu yapılandırmayı dışa aktarılan dosyaya dahil edebilir veya hariç tutabilirsiniz. Devre dışı yapılandırmalar kaydedilir ve `Sellfile Preview` içinde üstü çizili görünür. Dışa aktarılan dosyada RSL Helper bu kuralları yok sayar.',
  tutBasicsTitle: 'Rütbe/Nadirlik/Seviyeler',
  tutBasicsBody:
    '`Rütbe`, `Nadirlik`, `Faksiyon`, `Min seviye` ve `Maks seviye` değerlerini ayarlayın. `Nadirlik` `Auto` ise (a) kilitli alt statların ilk seviyede mevcut olmasını sağlayan ve (b) `+16` seviyesine kadar istediğiniz `Min gerekli rulolar`a ulaşabilecek en düşük nadirliği seçer.',
  tutSlotsTitle: 'Yuva(lar)ı seçin',
  tutSlotsBody:
    '`Botlar`ı hedefleyelim. Seçmek için `Botlar` simgesine tıklayın. Şimdi sizin için seçeceğiz.',
  tutMainTitle: 'Ana stat seçin',
  tutMainBody:
    '`Ana stat`ta `SPD` seçin. Böylece kural sadece hız botları için geçerli olur.',
  tutSetsTitle: 'İsteğe bağlı: Set seçin',
  tutSetsBody:
    '`Sets` içinden (ör. Speed) seçin veya kapsamı geniş tutmak için açık bırakın. Burada örnek olarak Speed seçeceğiz.',
  tutAddConfigTitle: 'Yapılandırma ekle',
  tutAddConfigBody:
    '`Yeni yapılandırma olarak ekle`ye tıklayın. `İleri`ye basın; sizin için tıklarız. Eklendikten sonra düğme metni `Seçilenden sonra ekle` olarak değişir.',
  tutConfigAddedTitle: 'Yapılandırma eklendi',
  tutConfigAddedBody:
    'Harika! Yeni `yapılandırma çipi` seçildi. Düğme artık `Seçilenden sonra ekle` diyor; yeni yapılandırmalar seçilinin ardından gelir.',
  tutSeeRulesTitle: 'Kurallarınızı görün',
  tutSeeRulesBody:
    '`Sellfile Preview`, bu yapılandırmanın ürettiği kuralları gösterir. `Alt statlar` seçilmediğinden bir kural görürsünüz — özünde: `Speed` setinde `SPD` ana statlı tüm `Botlar`ı koru. Bir satıra tıklamak ilgili yapılandırmayı seçer; bir çipe tıklamak ilk satıra gider.',

  tutAdvIntroTitle: 'Gelişmiş örnek',
  tutAdvIntroBody:
    'Şimdi `Alt statlar` ve rulolarla daha güçlü parçaları hedefleyelim. Yeniden kullanılabilir, basit ve okunur hedefler belirleyeceğiz.',
  tutAdvGoalTitle: 'Bu örneğin hedefi',
  tutAdvGoalBody:
    '`HP%`, `ATK%` ve `DEF%` ana statlı `Zırh` ve `Botlar`a odaklanacağız. Bu, yuva ve ana statı birlikte yönlendirmenin nasıl olduğunu gösterir.',
  tutAdvSelectSlotsMainTitle: 'Yuvaları ve ana statları seçin',
  tutAdvSelectSlotsMainBody:
    '`Yuvalar`da `Zırh` ve `Botlar`ı seçin, `Ana stat`ta `HP%`, `ATK%`, `DEF%` seçin. Bunları sizin için uyguladık.',
  tutAdvNameTitle: 'Yapılandırmanıza ad verin',
  tutAdvNameBody:
    'Bu yapılandırmaya kısa ve net bir `Ad` verin. Şimdi bir örnek dolduracağız.',
  tutAdvChooseSubstatsTitle: 'Alt stat seçin',
  tutAdvChooseSubstatsBody:
    '`Alt statlar`da `SPD`, `CR%`, `CDMG%` seçin. Bir alt statı zorunlu kılmak için tekrar tıklayıp kilitleyin (🔒). Sadece `CDMG%`u kilitleyeceğiz.',
  tutAdvRequiredTitle: 'Gerekli alt statlar',
  tutAdvRequiredBody:
    '`Gerekli` değeri, seçtiğiniz alt statlardan kaçının eşya üzerinde bulunması gerektiğini belirler. Kilitli alt statlar zorunludur ve bir `Gerekli` yuvasını kullanır. `2` yapalım: `CDMG%` (🔒) ve `SPD` ya da `CR%`den biri.',
  tutAdvMinRollsTitle: 'Minimum gerekli rulolar',
  tutAdvMinRollsBody:
    '`Min gerekli rulolar`, seçtiğiniz alt statlar üzerindeki toplam yükseltme rulolarıdır. Örn. 3 demek, `+16`ya kadar seçili statlarda toplam en az üç rulo demektir (her biri 3 değil).\n\nİpucu: 💡 Hedefi `Seçilenler` ve yalnızca `🔒` arasında değiştirmek için `Min gerekli rulolar` etiketine tıklayın.',
  tutAdvMilestonesTitle: 'Aşama eşikleri',
  tutAdvMilestonesBody:
    '`Aşama eşikleri` ile erken satırları şekillendirin: `Erken`, rulolar geldikçe artar; `Geç`, `+16`yı bekler — öncesinde sadece şimdilik gerekeni ister ki `+16` hedefiniz mümkün kalsın.',

  tutMetasetsManageTitle: 'Meta setleri yönet',
  tutMetasetsManageBody:
    '`Meta setleri yönet`i açıp yapılandırmalar arasında yeniden kullanabileceğiniz adlandırılmış `Sets` grupları oluşturun.',
  tutMetasetsAddTitle: 'Meta set ekle',
  tutMetasetsAddBody:
    '`Meta set ekle`ye tıklayın. `İleri`de `Slow DD` adlı bir meta set oluşturacağız (`Lethal`, `Savage`, `Stoneskin`). Meta setleri istediğiniz zaman güncelleyebilirsiniz — değişiklikler mevcut yapılandırmalara hemen yansır.',
  tutMetasetsAddedTitle: 'Meta set eklendi',
  tutMetasetsAddedBody:
    '`Slow DD` meta setiniz: `Lethal`, `Savage`, `Stoneskin`. İstediğiniz zaman yeniden adlandırabilir veya setleri değiştirebilirsiniz.',
  tutMetasetsIncludedTitle: 'Dahili meta setler',
  tutMetasetsIncludedBody:
    'Varsayılan olarak yararlı meta setler dahildir: `Nuker`, `Support - Debuffer`, `Support - Survivability`. (Bu öğreticide gösterilmeyen başka varsayılanlar da vardır.)',
  tutMetasetsCloseTitle: 'Meta setleri kapat',
  tutMetasetsCloseBody:
    '`Kapat`a tıklayın. `Metasets`, hızlı seçim için `Sets` listesinin üstünde görünür.',
  tutMetasetsSelectTitle: 'Bir meta set seçin',
  tutMetasetsSelectBody:
    '`Sets`i açın ve üstteki `Metasets`ten seçim yapın. Yapılandırmalar arasında yeniden kullanılabilirler.',
  tutMetasetsInSetsTitle: 'Setlerde meta setler',
  tutMetasetsInSetsBody:
    '`Metasets` burada listenin üstünde hızlı kullanım için görünür.',

  tutAdvAddTitle: 'Gelişmiş yapılandırma ekle',
  tutAdvAddBody:
    '`Yeni yapılandırma olarak ekle`ye tıklayarak bu gelişmiş örneği kaydedin. Birden çok yapılandırmayı ve sıralarını yönetebilirsiniz; ilk eşleşme kazanır.',
  tutAdvAddedTitle: 'Gelişmiş yapılandırma eklendi',
  tutAdvAddedBody:
    'Süper! Gelişmiş `yapılandırma çipi` eklendi ve seçildi. Çip menüsünden kopyala, taşı veya sil işlemlerini yapabilirsiniz.',
  tutAdvPreviewEarlyTitle: 'Bu kurallar ne yapar',
  tutAdvPreviewEarlyBody:
    '`Sellfile Preview`, bu yapılandırmanın oluşturduğu ~84 kuralı gösterir — `SPD`/`CR%`/`CDMG%` karışımlarından en az `2` rulo kabul edilir. `Erken` seçildiği için bu `2` rulo `+8` seviyesine kadar görünür. Eşleşmeyen ekipman diğer kurallarla kontrol edilir; hiçbiri eşleşmezse `Nihai satış` satabilir.',

  tutConfigChipsTitle: 'Yapılandırma çipleri',
  tutConfigChipsBody:
    'Yapılandırmalar `yapılandırma çipi` olarak görünür. Seçili bir çipe sağ tıklamak menüyü açar — `Panoya kopyala` yalnızca o yapılandırmayı paylaşır (Discord/Telegram için kullanışlı). Boş alana sağ tıklayınca `Tüm yapılandırmaları kopyala` ve `Sona yapıştır` çıkar.',

  tutFinalSellIntroTitle: 'Nihai satış (isteğe bağlı)',
  tutFinalSellIntroBody:
    '`Nihai satış`, yapılandırmalarınızla eşleşmeyen öğeler için basit `Sat` kuralları ekler. `Nihai satış` düğmesiyle açıp kapatın. Açıkken `Nihai satış açık!` görürsünüz. Sadece açıkça tanımlı kurallar uygulansın istiyorsanız kapalı tutun.',
  tutFinalSellConfigureTitle: 'Nihai satışı yapılandır',
  tutFinalSellConfigureBody:
    '`Yapılandır` için sürgüler simgesine tıklayın. Sonraki adımda iletişim kutusunu açacağız.',
  tutFinalSellDialogTitle: 'Nihai satış iletişim kutusu',
  tutFinalSellDialogBody:
    'Nelerin satılacağını (`Eserler`, `Aksesuarlar`) ve hangi `Seviye aralıkları`nı (ör. `0–3`, `4–7`, … `16`) seçin. Bunlar eşleşmeyen öğeler için Sat kuralları ekler. Bu öğreticide `Aksesuarlar`ı hedeflemedik; sadece `Eserler`i açıyoruz. Tam gelişmiş eşyaları satmamak için `+16` varsayılan olarak kapalıdır. İsterseniz burada açabilir veya ~~RSL Helper~~ içinde daha sonra kontrol ettikten sonra açabilirsiniz.',

  tutNoteTitle: 'Not ekleyin',
  tutNoteBody:
    '`Not ekle` ile gelecekteki kendinize kısa bir not bırakın — bu projenin amacı, sürüm bağlantıları vb. `.hsfr` paylaşırsanız not, dosyayı açan kişiye bağlam ve sonraki adımlar için de yardımcı olur. Notlar `.hsfr` içinde yapılandırmalarla kaydedilir, dışa aktarılan `.hsf` içine girmez.',
  tutSaveExplainTitle: 'Yapılandırmaları kaydet (.hsfr)',
  tutSaveExplainBody:
    '`Yapılandırmaları kaydet (.hsfr)` ile projenizi kaydedin (`Yapılandırmalar`, `Meta setler`, `Not`). Tarayıcınızın İndirilenler klasörüne kaydedilir; dosya adında zaman damgası bulunur. Geri dönebilmek için sık kaydetmek güvenlidir.',
  tutExportExplainTitle: 'RSL Helper Sellfile dışa aktar',
  tutExportExplainBody:
    '`RSL Helper Sellfile dışa aktar`a tıklayıp `.hsf` kaydedin. Dosya tarayıcınızın İndirilenler klasörüne iner. Hata yaparsanız geri dönebilmek için birden çok kez dışa aktarmak güvenlidir — her birinde zaman damgası vardır.',
  tutPreviewHeaderMenuTitle: 'Önizleme başlık menüsü',
  tutPreviewHeaderMenuBody:
    '`Sellfile Preview` başlığına sağ tıklayarak tablo seçeneklerini açın. Burada `Çok satırlı satırlar`, `Yuva`/`Set` simgelerini aç/kapat, `Stat metni kenarlıkları`nı renklendir ve `Renk körü paleti` (Normal, Okabe–Ito, Tritan) seçebilirsiniz. Kapatmak için `Escape` veya dışarı tıklayın.',
  tutPreviewFinishTitle: 'Önizle ve bitir',
  tutPreviewFinishBody:
    '`Sellfile Preview` son kurallarınızı gösterir. Kurallarınızı bir `RSL Helper Sellfile` ile birleştirmek için `Sellfile yükle` yapabilirsiniz — genelde gerekmez. Yüklerseniz, onun kuralları sizin yapılandırma kurallarınızdan (`yapılandırma çipleri`) önce gelir. İlk eşleşme kazanır — dolayısıyla yüklenen dosyadaki `Sat` kuralları sizinkilerden önce eşleşebilir.\n\nİpucu: 💡 Bu öğreticiyi yardım düğmesinden istediğiniz zaman başlatabilirsiniz.',

  // Eşya seti etiketleri (UI)
  setLife: 'Can',
  setOffense: 'Saldırı',
  setDefense: 'Savunma',
  setSpeed: 'Hız',
  setCriticalRate: 'Kritik oranı',
  setCritDamage: 'Kritik hasar',
  setAccuracy: 'İsabet',
  setResistance: 'Direnç',
  setLifesteal: 'Can çalma',
  setFury: 'Öfke',
  setDaze: 'Sersemleme',
  setCursed: 'Lanetli',
  setFrost: 'Don',
  setFrenzy: 'Çılgınlık',
  setRegeneration: 'Yenilenme',
  setImmunity: 'Bağışıklık',
  setShield: 'Kalkan',
  setRelentless: 'Amansız',
  setSavage: 'Vahşi',
  setDestroy: 'Yıkım',
  setStun: 'Sersemletme',
  setToxic: 'Zehirli',
  setProvoke: 'Kışkırtma',
  setRetaliation: 'Misilleme',
  setAvenging: 'İntikamcı',
  setStalwart: 'Sarsılmaz',
  setReflex: 'Refleks',
  setCuring: 'İyileştirme',
  setCruel: 'Zalim',
  setImmortal: 'Ölümsüz',
  setDivineOffense: 'İlahi saldırı',
  setDivineCriticalRate: 'İlahi kritik oranı',
  setDivineLife: 'İlahi can',
  setDivineSpeed: 'İlahi hız',
  setSwiftParry: 'Süratli savuşturma',
  setDeflection: 'Saptırma',
  setResilience: 'Dayanıklılık',
  setPerception: 'Algı',
  setAffinitybreaker: 'Uyumkıran',
  setUntouchable: 'Dokunulmaz',
  setFatal: 'Ölümcül',
  setFrostbite: 'Don yanığı',
  setBloodthirst: 'Kan susamışlığı',
  setGuardian: 'Muhafız',
  setFortitude: 'Metanet',
  setLethal: 'Öldürücü',
  setProtection: 'Koruma',
  setStoneskin: 'Taş deri',
  setKillstroke: 'Ölüm darbesi',
  setInstinct: 'İçgüdü',
  setBolster: 'Takviye',
  setDefiant: 'Meydan okuyan',
  setImpulse: 'Dürtü',
  setZeal: 'Gayret',
  setRighteous: 'Doğru',
  setSupersonic: 'Süpersonik',
  setMerciless: 'Acımasız',
  setSlayer: 'Cellat',
  setFeral: 'Yabanî',
  setPinpoint: 'Nokta atışı',
  setStonecleaver: 'Taş yarıcı',
  setRebirth: 'Yeniden doğuş',
  setChronophage: 'Kronofaj',
  setRefresh: 'Yenile',
  setCleansing: 'Arındırma',
  setBloodshield: 'Kan kalkanı',
  setReaction: 'Tepki',
  setRevenge: 'İntikam',
}

const tr: Catalog = { ...enUS, ...overrides }
export default tr
