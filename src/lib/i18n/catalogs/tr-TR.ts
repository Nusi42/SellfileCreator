import type { Catalog } from '../types'

const overrides: Catalog = {
  // App / Panels
  appBuilderTitle: 'Konfig Oluşturucu',
  loadConfigs: 'Konfigleri yükle (.hsfc)',
  configOne: 'konfig',
  configMany: 'konfigler',
  editNote: 'Notu düzenle',
  addNote: 'Not ekle',
  saveAllConfigs: 'Tüm konfigleri kaydet (.hsfc)',
  deleteConfigs: 'Konfigleri sil',

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
  // Rule Tester
  testerOpenLabel: 'Kural Testi…',
  testerOpenTooltip: 'Kural Testini aç',
  testerTitle: 'Kural Testi',
  testerIntro: 'Örnek eşyalar oluşturarak hangi kuralın önce eşleştiğini ve tutulup satılacağını görün.',
  testerEmptyHint: 'Hangi kuralın önce eşleştiğini test etmek için öğe ekleyin.',
  testerRule: 'Kural',
  testerConfig: 'Konfig',
  testerJumpToConfig: 'Yapılandırmaya git',
  testerNoMatch: 'Eşleşme yok',
  testerFinalSell: 'Son Satış',
  testerResetConfirmTitle: 'Kural Testi sıfırlansın mı?',
  testerResetConfirmBody: 'Bu işlem tüm test öğelerini temizleyip varsayılan örnekleri geri yükler.',
  noSetAccessories: 'Yok — yalnızca aksesuarlar',
  // Common UI bits used in Rule Tester
  add: 'Ekle',
  compact: 'Kompakt',
  expanded: 'Genişletilmiş',
  import: 'İçe aktar',
  export: 'Dışa aktar',

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

  // Generic
  rulesCountOne: '1 kural',
  rulesCountMany: '{n} kural',
  editingConfigNumbered: 'Konfig #{n} düzenleniyor',
  counting: 'Sayılıyor…',
  helpOpenLabel: 'Yardım',
  helpOpenTooltip: 'Yardımı / README\'yi aç',
  helpAriaLabel: 'Yardım / README',
  helpLanguage: 'Dil',


  titleDeleteAllConfigs: 'Tüm konfigler silinsin mi?',
  msgDeleteAllConfigs: 'Bu işlem tüm özel kural konfiglerini (HSFC) silecek. Geri alınamaz.',
  titleDeleteConfig: 'Bu konfig silinsin mi?',
  msgDeleteConfig: 'Yalnızca bu konfig HSFC’dan kaldırılacak.',
  titleDeleteSelectedConfigs: '{n} konfig silinsin mi?',
  msgDeleteSelectedConfigs: 'Seçili {n} konfig HSFC’dan kaldırılacak.',

  titlePasteConfigJson: 'Konfig JSON yapıştır',
  msgPasteInstructions: 'Tek bir konfig, konfig dizisi veya Configs içeren bir HSFC nesnesi yapıştırın.',
  placeholderPasteExample: 'Örnek: {example}',
  titleCopyConfigJson: 'Konfig JSON kopyala',
  msgBlockedClipboard: 'Tarayıcı pano erişimini engelledi. Elle seçip kopyalayın.',

  titleFinalSellRules: 'Nihai Satış Kuralları',
  msgFinalSellExplainer: '“Koru” kurallarıyla eşleşmeyen öğeler için nihai satış kuralları ekleyin.\nNihai satış açıkken bu kurallar bilinen tüm setleri açıkça içerir (önizlemede “Tüm bilinenler” olarak gösterilir; dışa aktarımda tam liste yer alır). Nihai satış olmadan eşleşmeyen öğeler korunur. Satış yalnızca bir satış kuralı eşleştiğinde olur.',
  labelGearToSell: 'Satılacak ekipman',
  labelLevelRanges: 'Seviye aralıkları',
  artifacts: 'Eserler',
  accessories: 'Aksesuarlar',
  offByDefaultTooltip: 'Tam gelişmiş ekipmanı satmamak için varsayılan olarak kapalıdır. Yanlış kullanımda değerli +16 öğeleri satabilir.',

  titleSubstatChipColors: 'Alt stat çip renkleri',
  msgChooseColors: 'Her alt stat için renkleri seçin.',
  labelText: 'Metin',
  labelBg: 'Arka plan',

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

  titleManageMetasets: 'Meta setleri yönet',
  addMetaset: 'Meta set ekle',
  titleClearMetaset: 'Bu meta setten setler temizlensin mi?',
  msgClearMetaset: 'Meta setten tüm setleri kaldırır. Meta set kalır.',
  titleDeleteMetaset: 'Bu meta set silinsin mi?',
  msgNoRefs: 'Meta set kaldırılacak. Hiçbir konfig onu kullanmıyor.',
  refsCount: '{n} konfig bu meta sete referans veriyor.',
  msgChooseUpdate: 'Bu konfigleri nasıl güncelleyeceğinizi seçin.',
  titleResetMetasets: 'Meta setler varsayılanlara sıfırlansın mı?',
  msgResetNoRefs: 'Hiçbir konfig mevcut meta setlerinizi kullanmıyor. Liste varsayılanlarla değiştirilecek.',
  msgResetSomeRefs: 'Bazı konfigler mevcut meta setlerinizi kullanıyor. Nasıl güncelleneceğini seçin.',

  // Sets search/order controls
  setsSearch: 'Set ara',
  setsClearSearch: 'Aramayı temizle',
  setsTooltipIcons: 'Simge ızgara görünümü',
  setsTooltipGame: 'Oyundaki sıra',
  setsTooltipAz: 'Alfabetik',
  menuMetasetsSection: 'Meta setler',

  // File drag overlay
  fileDropTitle: 'Yüklemek için dosyayı bırak',
  fileDropSubtitle: '.hsfc (konfigler + meta setler) ve .hsf (sellfile) kabul edilir',

  // Sets section labels
  setsTitle: 'Setler',
  setsUsageInConfigs: '({n} kullanım konfiglerde)',
  setsInNames: 'içinde: {names}',

  // Set tooltip bits
  setPieceCount: '{n} parça',
  setTooltipNamed: '{name} – {count}',

  // Set descriptions (tooltips). Locales may override these.
  // Armor (fixed-piece)
  setDesc_setAccuracy_text: '+40 ACC',
  setDesc_setAffinitybreaker_text: 'Kritik hasar +30%\nZayıf vuruşu kritik vuruşa çevirme şansı %50',
  setDesc_setAvenging_text: 'Taşıyıcıya bir debuff uygulandığında %45 karşı saldırı şansı',
  setDesc_setBloodthirst_text: 'Kritik oranı +12%\nVerilen hasarın %30\'u kadar iyileşir',
  setDesc_setBolster_text: 'Raund başında tüm müttefiklere, taşıyıcının maksimum HP\'sinin %30\'u kadar 3 tur korumalı {buff:Shield}',
  setDesc_setCleansing_text: 'Parça başına: Raund başında rastgele 1 debuff silme şansı %8; toplam: 1/2/3 parçada %8/%16/%24',
  setDesc_setCriticalRate_text: 'Kritik oranı +12%',
  setDesc_setCruel_text: 'ATK +15%\n%5 DEF yok sayar',
  setDesc_setCuring_text: 'İyileştirme +20%\nEk iyileştirme kadar yok edilen HP\'yi geri kazandırır',
  setDesc_setCursed_text: 'Saldırırken {debuff:Hex} uygulama şansı %50 (2 tur)',
  setDesc_setDaze_text: 'Saldırırken {debuff:Sleep} uygulama şansı %25 (1 tur)',
  setDesc_setDefense_text: '+15% DEF',
  setDesc_setDefiant_text: 'DEF +10%\nDüşman AoE saldırılarından alınan hasar -%15',
  setDesc_setDeflection_text: 'HP +20%\nDEF +20%\nTaşıyıcıya debuff geldiğinde %25 ihtimalle debuff\'ı saldırgana yansıtır',
  setDesc_setDestroy_text: 'Verilen hasarın %40\'ı kadar hedef maksimum HP\'sini düşürür',
  setDesc_setDivineCriticalRate_text: 'Kritik oranı +12%\nRaund başında 3 tur boyunca kendi üzerinde maksimum HP\'nin %15\'i kadar {buff:Shield}',
  setDesc_setDivineLife_text: 'HP +15%\nRaund başında 3 tur boyunca kendi üzerinde maksimum HP\'nin %15\'i kadar {buff:Shield}',
  setDesc_setDivineOffense_text: 'ATK +15%\nRaund başında 3 tur boyunca kendi üzerinde maksimum HP\'nin %15\'i kadar {buff:Shield}',
  setDesc_setDivineSpeed_text: 'SPD +12%\nRaund başında 3 tur boyunca kendi üzerinde maksimum HP\'nin %15\'i kadar {buff:Shield}',
  setDesc_setFatal_text: 'ATK +15%\nKritik oranı +5%',
  setDesc_setFortitude_text: 'DEF +10%\n+40 RES',
  setDesc_setFrenzy_text: 'Alınan her debuff için Turn Meter +5%',
  setDesc_setFrost_text: 'Vurulduğunda {debuff:Freeze} uygulama şansı %20 (1 tur)',
  setDesc_setFrostbite_text: '{debuff:Freeze} engelleme şansı %15\nVurulduğunda saldırgana {debuff:Freeze} uygulama şansı %10',
  setDesc_setFury_text: '76–100% HP: +10% hasar; 51–75% HP: +25% hasar; %51 altı HP: +50% hasar',
  setDesc_setGuardian_text: 'Müttefik hasarının %10\'unu emer\nHer tur %10 iyileşir',
  setDesc_setImmortal_text: 'HP +15%\nHer tur %3 iyileşir',
  setDesc_setImmunity_text: 'Raund başında 2 tur {buff:Block Debuffs}',
  setDesc_setImpulse_text: 'SPD +12%\nRastgele bir yetenek bekleme süresini 1 tur azaltma şansı %12',
  setDesc_setInstinct_text: 'SPD +12%\n%20 DEF yok sayar',
  setDesc_setKillstroke_text: 'Kritik hasar +20%\nSPD +5%',
  setDesc_setLethal_text: '%25 DEF yok sayar\nKritik oranı +10%',
  setDesc_setLife_text: '+15% HP',
  setDesc_setLifesteal_text: 'Verilen hasarın %30\'u kadar iyileşir',
  setDesc_setOffense_text: '+15% ATK',
  setDesc_setPerception_text: '+40 ACC\nSPD +5%',
  setDesc_setReaction_text: 'Parça başına: Taşıyıcının ilk turundan önce gelen kritik vuruşu normal vuruşa çevirme şansı %25; toplam: 1/2/3 parçada %25/%50/%75',
  setDesc_setReflex_text: 'Rastgele bir yetenek bekleme süresini 1 tur azaltma şansı %40',
  setDesc_setRefresh_text: 'Parça başına: Kullanılan yeteneğin beklemeye girmeme şansı %5; toplam: 1/2/3 parçada %5/%10/%15',
  setDesc_setRegeneration_text: 'Tur başında maksimum HP\'nin %15\'i kadar iyileşir',
  setDesc_setRelentless_text: 'Ek tur kazanma şansı %18',
  setDesc_setResilience_text: 'HP +10%\nDEF +10%',
  setDesc_setResistance_text: '+40 RES',
  setDesc_setRetaliation_text: 'Vurulduğunda karşı saldırı şansı %15',
  setDesc_setRevenge_text: 'Parça başına: Vurulduğunda karşı saldırı şansı %5; toplam: 1/2/3 parçada %5/%10/%15',
  setDesc_setRighteous_text: 'SPD +10%\n+40 RES',
  setDesc_setSavage_text: 'Saldırılar hedef DEF\'in %25\'ini yok sayar',
  setDesc_setShield_text: 'Raund başında tüm müttefiklere, taşıyıcının maksimum HP\'sinin %30\'u kadar 3 tur {buff:Shield}',
  setDesc_setSpeed_text: '+12% SPD',
  setDesc_setStalwart_text: 'Gelen AoE hasarı -%30',
  setDesc_setStun_text: 'Saldırırken {debuff:Stun} uygulama şansı %18 (1 tur)',
  setDesc_setSwiftParry_text: 'SPD +18%\nKritik hasar +30%\nÖlümcül darbe aldığında {buff:Unkillable} kazanma şansı %50 (1 tur)',
  setDesc_setToxic_text: 'Saldırırken %75 şansla 2 tur 2.5% {debuff:Poison} uygular',
  setDesc_setUntouchable_text: 'Raund başında 2 tur {buff:Block Debuffs}\n+40 RES',
  setDesc_setZeal_text: 'Kritik hasar +20%\nHer %25 mevcut HP için hasar +3%',
  setDesc_setCritDamage_text: 'Kritik hasar +20%',
  setDesc_setProvoke_text: 'Saldırırken {debuff:Provoke} uygulama şansı %30 (1 tur)',

  // Armor (variable 1–9 piece sets)
  // Chronophage
  setDesc_setChronophage_by_1: '+20 RES',
  setDesc_setChronophage_by_2: '+10% SPD',
  setDesc_setChronophage_by_3: '+20 RES',
  setDesc_setChronophage_by_4: 'Raund başında 1 {buff:Immutable} yığınıyla başlar',
  setDesc_setChronophage_by_5: '+10% SPD',
  setDesc_setChronophage_by_6: 'Raund başında 2 {buff:Immutable} yığınıyla başlar',
  setDesc_setChronophage_by_7: '+20 RES',
  setDesc_setChronophage_by_8: '+12% SPD',
  setDesc_setChronophage_by_9: 'Raund başında 3 {buff:Immutable} yığınıyla başlar',

  // Feral
  setDesc_setFeral_by_1: '+40 ACC',
  setDesc_setFeral_by_2: '+5% SPD',
  setDesc_setFeral_by_3: '+40 ACC',
  setDesc_setFeral_by_4: 'Raund başında 2 tur {buff:Block Debuffs} kazanır',
  setDesc_setFeral_by_5: '+5% SPD',
  setDesc_setFeral_by_6: 'Polymorph kaynaklı {debuff:Sheep} etkisini engelleme şansı %50',
  setDesc_setFeral_by_7: '+40 ACC',
  setDesc_setFeral_by_8: '+5% SPD',
  setDesc_setFeral_by_9: 'Taşıyıcının verdiği her debuff için müttefik hasarı +%5',

  // Merciless
  setDesc_setMerciless_by_1: '+10% ATK',
  setDesc_setMerciless_by_2: '+15% C.DMG',
  setDesc_setMerciless_by_3: '+5% SPD',
  setDesc_setMerciless_by_4: 'Rastgele bir yetenek bekleme süresini azaltma şansı %30',
  setDesc_setMerciless_by_5: '+15% ATK',
  setDesc_setMerciless_by_6: '%35 DEF yok sayar',
  setDesc_setMerciless_by_7: '+5% SPD',
  setDesc_setMerciless_by_8: '+15% C.DMG',
  setDesc_setMerciless_by_9: 'Vuruşta ekstra tur kazanma şansı %15',

  // Pinpoint
  setDesc_setPinpoint_by_1: '+20 ACC',
  setDesc_setPinpoint_by_2: '+10% SPD',
  setDesc_setPinpoint_by_3: '+20 ACC',
  setDesc_setPinpoint_by_4: 'Raund başında 1 {buff:Intercept} yığını',
  setDesc_setPinpoint_by_5: '+10% SPD',
  setDesc_setPinpoint_by_6: 'Raund başında 2 {buff:Intercept} yığını',
  setDesc_setPinpoint_by_7: '+20 ACC',
  setDesc_setPinpoint_by_8: '+12% SPD',
  setDesc_setPinpoint_by_9: 'Raund başında 4 {buff:Intercept} yığını',

  // Protection
  setDesc_setProtection_by_1: '+20 RES',
  setDesc_setProtection_by_2: '+15% HP',
  setDesc_setProtection_by_3: '+12% SPD',
  setDesc_setProtection_by_4: 'Taşıyıcının yerleştirdiği buffları koruma şansı %25',
  setDesc_setProtection_by_5: '+12% SPD',
  setDesc_setProtection_by_6: 'Taşıyıcının yerleştirdiği buffları koruma şansı %50',
  setDesc_setProtection_by_7: '+20 RES',
  setDesc_setProtection_by_8: '+8% SPD',
  setDesc_setProtection_by_9: 'Taşıyıcının yerleştirdiği buffları koruma şansı %75\nTaşıyıcının yerleştirdiği her buff için müttefik hasarı +%5',

  // Rebirth
  setDesc_setRebirth_by_1: '+20 RES',
  setDesc_setRebirth_by_2: '+10% SPD',
  setDesc_setRebirth_by_3: '+20 RES',
  setDesc_setRebirth_by_4: 'Dirildiğinde: +10% HP ve +10% Turn Meter',
  setDesc_setRebirth_by_5: '+10% SPD',
  setDesc_setRebirth_by_6: 'Müttefik ölünce (raund başına bir kez) 1 tur {buff:Block Damage} kazanır',
  setDesc_setRebirth_by_7: '+20 RES',
  setDesc_setRebirth_by_8: '+12% SPD',
  setDesc_setRebirth_by_9: 'Dirilen müttefiklerin yetenek bekleme sürelerini 1 tur azaltır',

  // Slayer
  setDesc_setSlayer_by_1: '+5% C.RATE',
  setDesc_setSlayer_by_2: '+15% C.DMG',
  setDesc_setSlayer_by_3: '+5% SPD',
  setDesc_setSlayer_by_4: 'AoE saldırılarının vurduğu düşman başına Turn Meter +5%',
  setDesc_setSlayer_by_5: '+10% C.RATE',
  setDesc_setSlayer_by_6: 'AoE yetenekleri düşman DEF\'inin %30\'unu yok sayar',
  setDesc_setSlayer_by_7: '+15% C.DMG',
  setDesc_setSlayer_by_8: '+5% SPD',
  setDesc_setSlayer_by_9: 'AoE hasarını tekrarlama şansı %30',

  // Stonecleaver
  setDesc_setStonecleaver_by_1: '+10% ATK',
  setDesc_setStonecleaver_by_2: '+15% C.DMG',
  setDesc_setStonecleaver_by_3: '+5% SPD',
  setDesc_setStonecleaver_by_4: 'Taş Deri kalkanlarına hasar +30%',
  setDesc_setStonecleaver_by_5: '+15% ATK',
  setDesc_setStonecleaver_by_6: '%20 DEF yok sayar',
  setDesc_setStonecleaver_by_7: '+5% SPD',
  setDesc_setStonecleaver_by_8: '+15% C.DMG',
  setDesc_setStonecleaver_by_9: 'Taş Deri kalkanlarına hasar +70%',

  // Stoneskin
  setDesc_setStoneskin_by_1: '+8% HP',
  setDesc_setStoneskin_by_2: '+40 RES',
  setDesc_setStoneskin_by_3: '+15% DEF',
  setDesc_setStoneskin_by_4: 'Raund başında 1 tur {buff:Stone Skin} (kaldırma/çalma engelleme şansı %50)',
  setDesc_setStoneskin_by_5: '+15% DEF',
  setDesc_setStoneskin_by_6: 'Raund başında 2 tur {buff:Stone Skin} (kaldırma/çalma engelleme şansı %50)',
  setDesc_setStoneskin_by_7: '+8% HP',
  setDesc_setStoneskin_by_8: '+40 RES',
  setDesc_setStoneskin_by_9: 'Stone Skin kalkan değeri = HP\'nin %75\'i',

  // Supersonic
  setDesc_setSupersonic_by_1: '+20 RES',
  setDesc_setSupersonic_by_2: '+15% HP',
  setDesc_setSupersonic_by_3: '+10% SPD',
  setDesc_setSupersonic_by_4: 'Düşmanların verdiği her buff için Turn Meter +2%',
  setDesc_setSupersonic_by_5: '+10% SPD',
  setDesc_setSupersonic_by_6: 'Turn Meter azaltma etkileri -%30',
  setDesc_setSupersonic_by_7: '+20 RES',
  setDesc_setSupersonic_by_8: '+12% SPD',
  setDesc_setSupersonic_by_9: 'Turn Meter artırma etkileri +%30',

  // Accessories (variable count not used; texts are per piece or fixed)
  setDesc_setBloodshield_text: 'Parça başına: Saldırı sonrası verilen hasarın %5\'i kadar {buff:Shield} (AoE %75 azaltılır); toplam: 1/2/3 parçada %5/%10/%15',

  
  

  // Rebirth
  
  
  
  
  
  
  
  
  

  // Slayer
  
  
  
  
  
  
  
  
  

  // Stonecleaver
  
  
  
  
  
  
  
  
  

  // Stoneskin
  
  
  
  
  
  
  
  
  

  // Supersonic
  
  
  
  
  
  
  
  
  

  // Accessories (variable count not used; texts are per piece or fixed)
  

  // Rules table: columns and UI
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
  rulesHeaderHelp: '{label} — sıralamak için sürükle; sağ koldan genişlik ayarla; sağ tık menüsü',
  rulesEmpty: 'Henüz RSL Helper satış kuralları yok.',
  rulesEmptyFiltered: 'Filtre nedeniyle kural yok.',
  keepValueKeep: 'Koru',
  keepValueSell: 'Sat',
  setAllKnownShorthand: 'Tüm bilinenler',
  // Config chip labels
  chipSubs: 'Alt stat',
  chipReq: 'Gerek',
  chipMaxRolls: 'Maks rulolar: {n}',
  chipMinRolls: 'Min rulolar: {n}',
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
  // Color-blind labels
  colorBlindNormal: 'Normal',
  colorBlindOkabeIto: 'Okabe–Ito',
  colorBlindTritan: 'Tritan',

  // Builder panel
  builderConfigName: 'Konfig adı',
  builderClearConfigName: 'Adı temizle',
  builderAction: 'Eylem',
  builderActionHelp: 'Bu konfigin ne yaptığını seçin. Koru: eşleşen ekipmanı korur. Sat: eşleşen ekipmanı satar.',
  builderEnabledInExport: 'Dışa aktarımda etkin',
  builderDisabledInExport: 'Dışa aktarımda kapalı',
  builderEnabledInSellfile: 'Sellfile içinde etkin',
  builderDisabledInSellfile: 'Sellfile içinde kapalı',
  builderHelpOpen: 'Hızlı yardımı aç',
  builderIntroCaption: 'Aşağıdaki oluşturucuyu kullanarak konfigler tanımlayıp özel setinize ekleyin. Metasetleri dahil olmak üzere özel konfiglerinizi (HSFC) yükleyebilir, kaydedebilir ve hepsini buradan yönetebilirsiniz.',
  builderRank: 'Rütbe',
  builderRankHelp: 'Hangi yıldız rütbeleri eşleşir. “Hepsi” tüm rütbelerle eşleşir.',
  any: 'Hepsi',
  builderSubstatValues: 'Alt stat değerleri…',
  builderMain: 'Ana stat',
  builderMainHelp: 'Ana stat(lar)ı seçin. “Hepsi” için boş bırakın.',
  builderSubstats: 'Alt statlar',
  builderSubstatsPickHelp: 'Alt statları seçin. Seçmek için tıklayın; kilitlemek için tekrar tıklayın (🔒) — eşya onu içermek zorunda olur.',
  builderSubstatsClickHint: 'Seçmek için tıklayın; kilitlemek için tekrar tıklayın (🔒).',
  builderSubstatFlexToggleAria: 'Alt stat joker permütasyonlarını aç/kapat',
  builderSubstatFlexToggleTooltip: 'Flex, zorunlu sayının ötesindeki tüm kombinasyonları kapsamak için isteğe bağlı alt statları sırayla dener; kilitli seçimler sabit kalır. Esnetilecek ekstra stat kalmadığında devre dışı kalır.',
  builderSlots: 'Yuvalar',
  builderSlotsHelp: 'Yalnızca bu yuvalara uygula.',
  builderSetsHelp: 'Bu konfigi yalnızca bu setlere veya meta setlere uygula.',
  builderMinLevel: 'Min seviye',
  builderMinLevelHelp: 'Kontrol için en erken seviye (+0, +4, …).',
  builderMaxLevel: 'Maks seviye',
  builderMaxLevelHelp: 'Kontrol için en geç seviye (+0, +4, …).',
  builderFaction: 'Faksiyon',
  builderFactionHelp: 'Yalnızca aksesuarlar (yüzük, tılsım, sancak). Diğer ekipman bunu yok sayar.',
  builderRarityExact: 'Tam',
  builderRarityGte: 'Aralıklar ≥',
  builderRarityLte: 'Aralıklar ≤',
  builderMilestoneThresholds: 'Kilometre Taşı Eşikleri',
  builderMilestoneThresholdsHelp: 'Rulo minimumları ayarladığınızda +16\'dan önce eşiklerin nasıl davrandığı. Yalnızca herhangi bir alt statın Min > 0 olması veya global Min gerekli rulolar ayarlanmışsa sonucu etkiler.',
  builderEarlyLabel: 'Erken',
  builderLateLabel: 'Geç',
  builderAutoGeLabel: 'Auto ≥ {tier}',
  builderManageMetasetsButton: 'Meta setleri yönet…',
  builderRequiredSubstats: 'Gerekli alt statlar',
  builderRequiredSubstatsHelp: 'Seçtiğiniz alt statlardan kaçına sahip olmalı. Kilitli alt statlar her zaman sayılır.',
  builderMinRequiredRolls: 'Min gerekli rulolar',
  builderMinRequiredRollsTip1: 'Seçtiğiniz alt statlar üzerindeki toplam en az rulo sayısı (toplam).',
  builderMinRequiredRollsTip2: '0, genel minimum yok demektir. Erken aşamalar sadece +16 hedefi ulaşılabilir tutan kuralları gösterir.',
  builderMinRequiredRollsTargetLocked: 'Hedef: Kilitli alt statlar',
  builderMinRequiredRollsTargetSelected: 'Hedef: Seçili alt statlar',
  builderMinRequiredRollsToggleAria: 'Min-rulo hedefini değiştir ({target})',
  builderMinRequiredRollsImpossibleWarn: 'Uyarı: Min gerekli rulolar mevcut stat üst sınırlarıyla +16\'ya kadar sağlanamaz',
  builderRarityHelpIntro: 'Auto, seçtiğiniz seviye aralığında seçimlerinizi mümkün kılan en düşük nadirliği seçer.',
  builderRarityHelpMinTotalRolls: 'Min toplam rulolar: +16\'ya kadar ulaşabilecek bir nadirlik seçer (5→Mitik). Aralıklar etiketlerde belirtildiği gibi daha yüksek veya daha düşük nadirlikleri içerir.',
  builderRarityHelpNoMinRolls: 'Min rulo yok: geniş kalır (tüm nadirliklerle çalışır).',
  builderRarityHelpStartSubs: '+0\'da 1/2/3/4 alt stat: Nadirliğin başlangıçta o kadar alt statla başlayabilmesini sağlar (1→≥Sıradışı, 2→≥Nadir, 3→≥Destansı, 4→≥Efsanevi).',
  builderMsgClearSets: 'Bu konfig için seçili tüm setleri ve meta setleri kaldırır.',
  builderInsertAfterSelected: 'Seçilenden sonra ekle',
  builderAddAsNew: 'Yeni konfig olarak ekle',
  builderSaveChangesToSelected: 'Değişiklikleri seçiliye kaydet',
  builderUnsavedChangesAria: 'kaydedilmemiş değişiklikler',
  builderMsgClearBuilder: 'Geçerli alanları ve seçimleri temizler.',

  // Builder quick help (popover)
  builderHelpTitle: 'Bu ayarlar nasıl çalışır',
  builderHelpKeepSellTitle: 'Koru vs Sat',
  builderHelpKeepSellBody: 'Bu konfig eşyaları eşleştirir. Koru ise eşleşen eşyalar korunur; Sat ise eşleşen eşyalar satılır. Rütbe, Nadirlik, Faksiyon, Yuvalar ve Setler önce eşyaları filtreler.',
  builderHelpLevelsTitle: 'Seviyeler & Kilometre Taşı Eşikleri',
  builderHelpLevelsB1: 'Min/Maks seviye ile kilometre taşı aralığını seçin (+0, +4, +8, +12, +16).',
  builderHelpLevelsB2: '+16\'dan önce nadirlik talep edilen alt stat sayısına henüz sahip olamıyorsa kurallar, o seviyede var olabilen sayıyı kullanır. +16\'da kurallar istediğiniz sayıyı kullanır.',
  builderHelpLevelsB3: '“Hepsi” nadirliği, alt stat varlığını ≥ Efsanevi gibi ele alır (ekleme yok); rulo planları yine nadirlik/aralık kurallarını izler.',
  builderHelpLevelsB4: 'Kilometre Taşı Eşikleri (Min rulolar ayarlandığında): Erken, şimdiye kadar kazanılan rulolara göre eşikleri gösterir; Geç, +16 hedefi ulaşılabilir kalsın diye şu anda olması gerekenleri ister. Sadece jokerler (★) ve bir Min toplam gerektiğinde, Erken her kilometre taşında en düşük bölünmeleri gösterir (stabil liste) ve Geç, bu minimum bölünmeleri +16\'da uygular, erken aşamada varlığı gösterir.',
  builderHelpSubstatsTitle: 'Alt statlar',
  builderHelpSubstatsB1: 'Seçmek için tıklayın; kilitlemek için tekrar tıklayın (🔒) — eşya onu içermek zorunda olur.',
  builderHelpSubstatsB2: 'Rulo göstergesi: Sol tık artırır; sağ tık azaltır. ★ için: Sol → Min (0–5), Sağ → Rulo üstü (0–4, 0 = rulo yok).',
  builderHelpSubstatsB3: 'Min = hedef seviyeye kadar en az o kadar rulo. Rulo üstü = bu stat üzerindeki maksimum rulo.',
  builderHelpRequiredTitle: 'Gerekli alt statlar',
  builderHelpRequiredBody: 'Eşyanın sahip olması gereken seçili alt stat sayısı. Kilitli alt statlar her zaman sayılır. “Auto”, min(4, seçili sayısı) değerine ayarlar ve alt stat ekleyip çıkardığınızda senkron tutar.',
  builderHelpMinRollsTitle: 'Min gerekli rulolar',
  builderHelpMinRollsBody: 'Seçtiğiniz alt statlar üzerindeki toplam minimum rulolar (toplam). 0, genel bir minimum olmadığı anlamına gelir. Örnek: 3, seçtiğiniz alt statların hedef seviyeye kadar toplamda en az 3 rulosu olduğu anlamına gelir. Sadece jokerler (★) olduğunda, Erken erken kuralları kısa tutar (kilometre taşına göre minimum bölünmeler); Geç varlığı erken gösterir ve +16\'da bu minimum bölünmeleri uygular.',
  builderAutoPlusLate: 'Auto + Geç',
  builderAutoGeExample: 'Bir alt stat için min=1 ve Auto ≥ {tier} örneği',
  builderAutoLateTitle: 'Auto + Geç eklemeleri',
  builderAutoLateIntro: 'Kilometre taşlarında (+4/+8/+12) ek ≥ nadirlik dalları ekler. Bu çip dahil edilecek minimum ≥ katmanını ayarlar.',
  builderAutoLateL4: '+4 → ≥{rare} mevcut ve ≥{uncommon} (gerekli - 1)',
  builderAutoLateL8: '+8 → ≥{epic} mevcut',
  builderAutoLateL12: '+12 → ≥{legendary} mevcut',
  builderAutoLateDisabledNote: 'Yalnızca Nadirlik Auto ve Kilometre Taşı Eşikleri Geç olduğunda etkinleşir.',
  builderHelpCommonTitle: 'Yaygın kurulumlar',
  builderHelpCommonAHeading: 'A) İki zorunlu + bir isteğe bağlı',
  builderHelpCommonAL1: 'Seçin: SPD, ACC, HP%, DEF%, RES',
  builderHelpCommonAL2: 'Kilitleyin: SPD ve ACC (iki kez tıklayın)',
  builderHelpCommonAL3: 'Gerekli alt statlar: 3',
  builderHelpCommonAL4: 'Sonuç: SPD ve ACC olmalı, ayrıca HP%/DEF%/RES\'den herhangi biri.',
  builderHelpCommonBHeading: 'B) Tam üç temel alt stat',
  builderHelpCommonBL1: 'Seçin: SPD, CR%, CDMG%',
  builderHelpCommonBL2: 'Gerekli alt statlar: 3',
  builderHelpCommonBL3: 'Sonuç: Üçü de olmalı. (İsterseniz rulo göstergelerini ayarlayın.)',
  // Metasets dialog
  metasetsHeaderBlurb: 'Adlandırılmış set grupları. Set seçicisinin üstünde görünürler.',
  metasetsChooseMetasetPlaceholder: 'Meta set seçin…',
  metasetsHiddenFromMenus: 'Menülerde gizli',
  metasetsVisibleInMenus: 'Menülerde görünür',
  metasetsMoveUp: 'Yukarı taşı',
  metasetsMoveDown: 'Aşağı taşı',
  metasetsUses: '{n} kullanım',
  metasetsUsesTooltip: 'Bu meta seti kullanan konfigleri seçmek için tıklayın',
  metasetsNoMetasetsToReplaceWith: 'Değiştirilecek meta set yok',
  metasetsDeleteRemoveRefsLabel: 'Sil ve referansları kaldır',
  metasetsDeleteReplaceWithMetasetLabel: 'Başka meta setle değiştir',
  metasetsDeleteReplaceWithSetsLabel: 'Belirli setlerle değiştir',
  metasetsDeleteReplaceWithSetsNotAvailable: 'Belirli setlerle değiştir (kullanılamıyor — set yok)',
  metasetsResetRemoveRefs: 'Sıfırla ve referansları kaldır',
  metasetsResetRemoveRefsLabel: 'Sıfırla ve meta set referanslarını kaldır',
  metasetsResetReplaceWithMetasetLabel: 'Sıfırla ve referansları meta setle değiştir',
  metasetsResetReplaceWithSetsLabel: 'Sıfırla ve referansları belirli setlerle değiştir',
  metasetsResetUseExplicitSets: 'Sıfırla ve belirli setleri kullan',
  metasetsResetUseMetaset: 'Sıfırla ve meta set kullan',

  // Filter panel
  filterRule: 'Kural',
  filterSets: 'Setler',
  filterMainstat: 'Ana stat',
  filterSubstats: 'Alt statlar',
  filterLevel: 'Seviye',
  filterSlots: 'Yuvalar',
  filterRank: 'Rütbe',
  filterRarity: 'Nadirlik',
  filterFaction: 'Faksiyon',
  filterReset: 'Filtreleri sıfırla',
  filterMatch: 'Eşleşme',
  filterAnyOf: 'En az biri',
  filterAllOf: 'Hepsi',
  filterShow: 'Göster',
  filterHide: 'Gizle',
  filterOnly: 'Yalnızca',
  filterHeader: 'Filtreler yalnızca bu görünümü etkiler. Dışa aktarma filtreleri yok sayar.',
  filterAnyTooltip: '{field} alanı "Hepsi" olduğunda kuralları etkiler. Göster = dahil et; Gizle = hariç tut; Yalnızca = sadece bunları göster.',
  filterMatchTooltipSets: 'Birden fazla Set seçtiğinizde: "En az biri" = en az bir seçili seti içeren kuralları dahil et. "Hepsi" = seçili setlerin tamamını içeren kuralları dahil et.',
  filterMatchTooltipSubstats: 'Birden fazla Alt stat seçtiğinizde: "En az biri" = en az bir seçili alt statı içeren kuralları dahil et. "Hepsi" = seçili alt statların tamamını içeren kuralları dahil et.',
  filterSelectRank13: '1★, 2★, 3★ seç',
  filterSelectRarityCU: 'Sıradan ve/veya Sıradışı seç',

  rarityCUShort: 'S/Sr',
  ariaCommonOrUncommon: 'Sıradan veya Sıradışı',

  // Rarity labels (generic)
  rarityCommon: 'Sıradan',
  rarityUncommon: 'Sıradışı',
  rarityRare: 'Nadir',
  rarityEpic: 'Destansı',
  rarityLegendary: 'Efsanevi',
  rarityMythical: 'Mitik',

  // Slot names (for future localization of labels next to icons)
  slotWeapon: 'Silah',
  slotHelmet: 'Miğfer',
  slotShield: 'Kalkan',
  slotGauntlets: 'Eldivenler',
  slotChestplate: 'Zırh',
  slotBoots: 'Botlar',
  slotRing: 'Yüzük',
  slotAmulet: 'Tılsım',
  slotBanner: 'Sancak',

  statATK: 'ATK',
  statATK_flat: 'ATK',
  statATK_percent: 'ATK%',
  statDEF: 'DEF',
  statDEF_flat: 'DEF',
  statDEF_percent: 'DEF%',
  statHP: 'HP',
  statHP_flat: 'HP',
  statHP_percent: 'HP%',
  statSPD: 'SPD',
  statRES: 'RES',
  statACC: 'ACC',
  statCR: 'CR%',
  statCDMG: 'CDMG%',

  // Note dialog
  noteTitle: 'Not',
  titleClearNote: 'Not silinsin mi?',
  msgClearNote: 'Bu işlem mevcut notu HSFC’dan kaldırır. Geri alınamaz.',
  noteColorTooltip: 'Renk: {name}',

  // Restore autosave dialog
  restoreAutosaveTitle: 'Son kaydedilen konfig geri yüklensin mi?',
  restoreAutosaveQuestion: 'Otomatik kaydedilmiş bir oturum bulundu. Geri yüklensin mi?',
  restoreAutosaveSummary: 'Konfigler: {configs} • Meta setler: {metas} • Not: {note}',
  yes: 'Evet',
  no: 'Hayır',

  // Help dialog
  
  

  // Tutorial chrome
  tutorialStep: 'Adım',
  tutorialExit: 'Öğreticiden çık',
  tutorialBack: 'Geri',
  tutorialNext: 'İleri',
  tutorialFinish: 'Bitti',

  // Roll indicator help
  rollIndicatorInline: 'Rulo göstergesi: Sol = daha fazla; Sağ = daha az. ★ için: Sol → Min (0–5), Sağ → Rulo üstü (0–4).',
  rollIndicatorTip1: 'Rulo göstergesi: Sol tık artırır; sağ tık azaltır.',
  rollIndicatorTip2: '★ için: Sol → Min (0..5), Sağ → Rulo üstü (0..4).',
  rollIndicatorTip3: 'Rulo üstü modunda: Sol aşağı iner (1→0→★), Sağ yukarı çıkar (0→1→…→4→★).',
  rollIndicatorTip4: 'Min yeşildir; Rulo üstü kırmızıdır.',
  
  
  

  // Filter helpers
  
  
  

  // Factions (UI labels)
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Stat labels (UI)
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Builder panel caption and toasts
  
  toastConfigsSaved: 'Konfigler kaydedildi. İndirilenler’i kontrol edin.',
  toastSellfileSaved: 'Sellfile kaydedildi. İndirilenler’i kontrol edin.',
  toastL10nLoaded: 'Yerelleştirme yüklendi: {lang}',
  toastL10nLoadFailed: 'Yerelleştirme dosyası yüklenemedi',

  // Tutorial section labels
  tutSectionBasicsLabel: 'Temeller',
  tutSectionAdvancedLabel: 'Gelişmiş',
  tutSectionMetasetsLabel: 'Meta setler',
  tutSectionConfigChipsLabel: 'Konfig çipleri',
  tutSectionFinalSellLabel: 'Nihai satış',
  tutSectionAutoLateLabel: 'Auto + Geç',
  tutSectionSaveExportLabel: 'Kaydet ve dışa aktar',

  // Note editor tooltips (Markdown toolbar)
  mdBold: 'Kalın',
  mdItalic: 'İtalik',
  mdStrikethrough: 'Üstü çizili',
  mdHeading: 'Başlık',
  mdQuote: 'Alıntı',
  mdCode: 'Kod',
  mdLink: 'Bağlantı',
  mdImage: 'Görsel',
  mdUnorderedList: 'Sırasız liste',
  mdOrderedList: 'Sıralı liste',
  mdCheckedList: 'Görev listesi',
  mdDivider: 'Ayraç',
  mdPreview: 'Önizleme',
  mdFullscreen: 'Tam ekran',
  mdColor: 'Renk',

  // Tutorial steps (titles and bodies)
  tutWelcomeTitle: 'Hoş geldiniz',
  tutWelcomeBody: '~~RSL Helper Sellfile Creator~~ ile `Konfig Oluşturucu` bölümünde kurallar oluşturabilir ve sonucu `Sellfile Preview` içinde görebilirsiniz. Hangi eşyanın korunup satılacağına karar vermek için statları, `Sets` ve `+16` gibi seviyeleri seçersiniz.\n\nİpucu: 💡 Bu öğreticiyi yardım düğmesinden istediğiniz zaman başlatabilirsiniz.',
  tutActionTitle: 'Eylem seçin',
  tutActionBody: '`Koru` veya `Sat` seçin. Bu, bu konfigle eşleşen öğelere ne olacağını belirler.',
  tutEnabledTitle: 'Sellfile içinde etkin',
  tutEnabledBody: '`Sellfile içinde etkin` anahtarını açıp kapatarak bu konfigi dışa aktarılan dosyaya dahil edebilir veya hariç tutabilirsiniz. Devre dışı konfigler kaydedilir ve `Sellfile Preview` içinde üstü çizili görünür. RSL Helper bu kuralları okur ancak dışa aktarılan dosyada uygulamaz.',
  tutBasicsTitle: 'Rütbe/Nadirlik/Seviyeler',
  tutBasicsBody: '`Rütbe`, `Nadirlik`, `Faksiyon`, `Min seviye` ve `Maks seviye` değerlerini ayarlayın. `Nadirlik` `Auto` ise (a) kilitli alt statların ilk seviyede mevcut olmasını sağlayan ve (b) `+16` seviyesine kadar istediğiniz `Min gerekli rulolar`a ulaşabilecek en düşük nadirliği seçer.',
  tutSlotsTitle: 'Yuvaları seçin',
  tutSlotsBody: '`Botlar`ı hedefleyelim. Seçmek için `Botlar` simgesine tıklayın. Şimdi sizin için seçeceğiz.',
  tutMainTitle: 'Ana stat seçin',
  tutMainBody: '`Ana stat`ta `SPD` seçin. Böylece kural sadece hız botları için geçerli olur.',
  tutSetsTitle: 'İsteğe bağlı: Set seçin',
  tutSetsBody: '`Sets` içinden (ör. Speed) seçin veya kapsamı geniş tutmak için açık bırakın. Burada örnek olarak Speed seçeceğiz.',
  tutAddConfigTitle: 'Konfig ekle',
  tutAddConfigBody: '`Yeni konfig olarak ekle`ye tıklayın. `İleri`ye basın; sizin için tıklarız. Eklendikten sonra düğme metni `Seçilenden sonra ekle` olarak değişir.',
  tutConfigAddedTitle: 'Konfig eklendi',
  tutConfigAddedBody: 'Harika! Yeni `konfig çipi` seçildi. Düğme artık `Seçilenden sonra ekle` diyor; yeni konfigler seçilinin ardından gelir.',
  tutSeeRulesTitle: 'Kurallarınızı görün',
  tutSeeRulesBody: '`Sellfile Preview`, bu konfigin ürettiği kuralları gösterir. `Alt statlar` seçilmediğinden bir kural görürsünüz — özünde: `Speed` setinde `SPD` ana statlı tüm `Botlar`ı koru. Bir satıra tıklamak ilgili konfigi seçer; bir çipe tıklamak ilk satıra gider.',

  tutAdvIntroTitle: 'Gelişmiş örnek',
  tutAdvIntroBody: 'Şimdi `Alt statlar` ve rulolarla daha güçlü parçaları hedefleyelim. Yeniden kullanılabilir, basit ve okunur hedefler belirleyeceğiz.',
  tutAdvSelectSlotsMainTitle: 'Yuvaları ve ana statları seçin',
  tutAdvSelectSlotsMainBody: '`Yuvalar`da `Zırh` ve `Botlar`ı seçin, `Ana stat`ta `HP%`, `ATK%`, `DEF%` seçin. Bunları sizin için uyguladık.',
  tutAdvNameTitle: 'Konfiginize ad verin',
  tutAdvNameBody: 'Bu konfige kısa ve net bir `Ad` verin. Şimdi bir örnek dolduracağız.',
  tutAdvChooseSubstatsTitle: 'Alt stat seçin',
  tutAdvChooseSubstatsBody: '`Alt statlar`da `SPD`, `CR%`, `CDMG%` seçin. Bir alt statı zorunlu kılmak için tekrar tıklayıp kilitleyin (🔒). Sadece `CDMG%`u kilitleyeceğiz.',
  tutAdvRequiredTitle: 'Gerekli alt statlar',
  tutAdvRequiredBody: '`Gerekli` değeri, seçtiğiniz alt statlardan kaçının eşya üzerinde bulunması gerektiğini belirler. Kilitli alt statlar zorunludur ve bir `Gerekli` yuvasını kullanır. `2` yapalım: `CDMG%` (🔒) ve `SPD` ya da `CR%`den biri.',
  tutAdvMinRollsTitle: 'Minimum gerekli rulolar',
  tutAdvMinRollsBody: '`Min gerekli rulolar`, seçtiğiniz alt statlar üzerindeki toplam yükseltme rulolarıdır. Örn. 3 demek, `+16`ya kadar seçili statlarda toplam en az üç rulo demektir (her biri 3 değil).\n\nİpucu: 💡 Hedefi `Seçilenler` ve yalnızca `🔒` arasında değiştirmek için `Min gerekli rulolar` etiketine tıklayın.',
  tutAdvMilestonesBody: '`Aşama eşikleri` ile erken satırları şekillendirin: `Erken`, rulolar geldikçe artar; `Geç`, `+16`yı bekler — öncesinde sadece şimdilik gerekeni ister ki `+16` hedefiniz mümkün kalsın.',
  tutMetasetsManageTitle: 'Meta setleri yönet',
  tutMetasetsManageBody: '`Meta setleri yönet`i açıp konfigler arasında yeniden kullanabileceğiniz adlandırılmış `Sets` grupları oluşturun.',
  tutMetasetsAddTitle: 'Meta set ekle',
  tutMetasetsAddBody: '`Meta set ekle`ye tıklayın. `İleri`de `Slow DD` adlı bir meta set oluşturacağız (`Lethal`, `Savage`, `Stoneskin`). Meta setleri istediğiniz zaman güncelleyebilirsiniz — değişiklikler mevcut konfiglere hemen yansır.',
  tutMetasetsAddedTitle: 'Meta set eklendi',
  tutMetasetsAddedBody: '`Slow DD` meta setiniz: `Lethal`, `Savage`, `Stoneskin`. İstediğiniz zaman yeniden adlandırabilir veya setleri değiştirebilirsiniz.',
  tutMetasetsIncludedTitle: 'Dahili meta setler',
  tutMetasetsIncludedBody: 'Varsayılan olarak yararlı meta setler dahildir: `Nuker`, `Support - Debuffer`, `Support - Survivability`. (Bu öğreticide gösterilmeyen başka varsayılanlar da vardır.)',
  tutMetasetsCloseTitle: 'Meta setleri kapat',
  tutMetasetsCloseBody: '`Kapat`a tıklayın. `Metasets`, hızlı seçim için `Sets` listesinin üstünde görünür.',
  tutMetasetsSelectTitle: 'Bir meta set seçin',
  tutMetasetsSelectBody: '`Sets`i açın ve üstteki `Metasets`ten seçim yapın. Konfigler arasında yeniden kullanılabilirler.',
  tutMetasetsInSetsTitle: 'Setlerde meta setler',
  tutMetasetsInSetsBody: '`Metasets` burada listenin üstünde hızlı kullanım için görünür.',
  tutAdvAddTitle: 'Gelişmiş konfig ekle',
  tutAdvAddBody: '`Yeni konfig olarak ekle`ye tıklayarak bu gelişmiş örneği kaydedin. Birden çok konfigi ve sıralarını yönetebilirsiniz; ilk eşleşme kazanır.',
  tutAdvAddedTitle: 'Gelişmiş konfig eklendi',
  tutAdvAddedBody: 'Süper! Gelişmiş `konfig çipi` eklendi ve seçildi. Çip menüsünden kopyala, taşı veya sil işlemlerini yapabilirsiniz.',
  tutAdvPreviewEarlyTitle: 'Bu kurallar ne yapar',
  tutAdvPreviewEarlyBody: '`Sellfile Preview`, bu konfigin oluşturduğu ~84 kuralı gösterir — `SPD`/`CR%`/`CDMG%` karışımlarından en az `2` rulo kabul edilir. `Erken` seçildiği için bu `2` rulo `+8` seviyesine kadar görünür. Eşleşmeyen ekipman diğer kurallarla kontrol edilir; hiçbiri eşleşmezse `Nihai satış` satabilir.',
  tutConfigChipsTitle: 'Konfig çipleri',
  tutConfigChipsBody: 'Konfigler `konfig çipi` olarak görünür. Seçili bir çipe sağ tıklamak menüyü açar — `Panoya kopyala` yalnızca o konfigi paylaşır (Discord/Telegram için kullanışlı). Boş alana sağ tıklayınca `Tüm konfigleri kopyala` ve `Sona yapıştır` çıkar.',
  tutFinalSellIntroTitle: 'Nihai satış (isteğe bağlı)',
  tutFinalSellIntroBody: '`Nihai satış`, konfiglerinizle eşleşmeyen öğeler için basit `Sat` kuralları ekler. `Nihai satış` düğmesiyle açıp kapatın. Açıkken `Nihai satış açık!` görürsünüz. Sadece açıkça tanımlı kurallar uygulansın istiyorsanız kapalı tutun.',
  tutFinalSellConfigureTitle: 'Nihai satışı yapılandır',
  tutFinalSellConfigureBody: '`Yapılandır` için sürgüler simgesine tıklayın. Sonraki adımda iletişim kutusunu açacağız.',
  tutFinalSellDialogTitle: 'Nihai satış iletişim kutusu',
  tutFinalSellDialogBody: 'Nelerin satılacağını (`Eserler`, `Aksesuarlar`) ve hangi `Seviye aralıkları`nı (ör. `0–3`, `4–7`, … `16`) seçin. Bunlar eşleşmeyen öğeler için Sat kuralları ekler. Bu öğreticide `Aksesuarlar`ı hedeflemedik; sadece `Eserler`i açıyoruz. Tam gelişmiş eşyaları satmamak için `+16` varsayılan olarak kapalıdır. İsterseniz burada açabilir veya ~~RSL Helper~~ içinde daha sonra kontrol ettikten sonra açabilirsiniz.',
  tutNoteTitle: 'Not ekleyin',
  tutNoteBody: '`Not ekle` ile gelecekteki kendinize kısa bir not bırakın — bu projenin amacı, sürüm bağlantıları vb. `.hsfc` paylaşırsanız not, dosyayı açan kişiye bağlam ve sonraki adımlar için de yardımcı olur. Notlar `.hsfc` içinde konfiglerle kaydedilir, dışa aktarılan `.hsf` içine girmez.',
  tutSaveExplainTitle: 'Konfigleri kaydet (.hsfc)',
  tutSaveExplainBody: '`Konfigleri kaydet (.hsfc)` ile projenizi kaydedin (`Konfigler`, `Meta setler`, `Not`). Tarayıcınızın İndirilenler klasörüne kaydedilir; dosya adında zaman damgası bulunur. Geri dönebilmek için sık kaydetmek güvenlidir.',
  tutExportExplainTitle: 'RSL Helper Sellfile dışa aktar',
  tutExportExplainBody: '`RSL Helper Sellfile dışa aktar`a tıklayıp `.hsf` kaydedin. Dosya tarayıcınızın İndirilenler klasörüne iner. Hata yaparsanız geri dönebilmek için birden çok kez dışa aktarmak güvenlidir — her birinde zaman damgası vardır.',
  tutPreviewHeaderMenuTitle: 'Önizleme başlık menüsü',
  tutPreviewHeaderMenuBody: '`Sellfile Preview` başlığına sağ tıklayarak tablo seçeneklerini açın. Burada `Çok satırlı satırlar`, `Yuva`/`Set` simgelerini aç/kapat, `Stat metni kenarlıkları`nı renklendir ve `Renk körü paleti` (Normal, Okabe–Ito, Tritan) seçebilirsiniz. Kapatmak için `Escape` veya dışarı tıklayın.',
  tutPreviewFinishTitle: 'Önizle ve bitir',
  tutPreviewFinishBody: '`Sellfile Preview` son kurallarınızı gösterir. Kurallarınızı bir `RSL Helper Sellfile` ile birleştirmek için `Sellfile yükle` yapabilirsiniz — genelde gerekmez. Yüklerseniz, onun kuralları sizin konfig kurallarınızdan (`konfig çipleri`) önce gelir. İlk eşleşme kazanır — dolayısıyla yüklenen dosyadaki `Sat` kuralları sizinkilerden önce eşleşebilir.\n\nİpucu: 💡 Bu öğreticiyi yardım düğmesinden istediğiniz zaman başlatabilirsiniz.',
  

  // Extra Example: Accessories — Auto Rarity + Late (Banner SPD)
  tutAutoLateIntroTitle: 'Aksesuar örneği: Auto + Geç',
  tutAutoLateIntroBody: '`Sancak` kuralını `Nadirlik`i `Auto`, `Kilometre Taşı Eşikleri`ni `Geç` yaparak oluşturalım. `SPD`yi bir `Alt stat` olarak seçin ve `+16`da `Min gerekli rulolar = 3` isteyin. `Auto`, hedefinize ulaşabilecek en düşük nadirliği seçer; `Geç`, tam hedefi `+16`da kontrol ederken şu anda gerekenleri ister.',
  tutAutoLateAddTitle: 'Bu konfigi ekle',
  tutAutoLateAddBody: '`Seçilenden sonra ekle`ye tıklayın. Önizlemede kuralları görebilmeniz için şimdi sizin için ekleyeceğiz.',
  tutAutoLatePreviewTitle: 'Auto + Geç önizlemede',
  tutAutoLatePreviewBody: '`Sellfile Preview` içinde artık hem `Destansı` hem `Efsanevi` `Sancak` eşyaları için kurallar görüyorsunuz. `Auto`, `+16`ya kadar `SPD` üzerinde toplam `3` ruloya ulaşabilecek nadirlikleri dahil eder. `Geç`, tam kontrolü `+16`ya erteler ve erken satırları mümkün kılar. Vurguyu görmeniz için sizin yerinize seçeceğiz.',
// Chips context menus
  chipsMenuSelectAll: 'Tümünü seç',
  chipsMenuCopyAllConfigs: 'Tüm konfigleri kopyala',
  chipsMenuPasteAtEnd: 'Sona yapıştır',
  chipTooltipEdit: 'Bu konfigi düzenlemek için tıklayın',
  chipTooltipDuplicateOf: 'Bu, konfig #{n} kopyasıdır',
  chipBtnMoveUp: 'Yukarı taşı',
  chipBtnMoveDown: 'Aşağı taşı',
  chipBtnDuplicate: 'Kopyasını oluştur',
  chipBtnDelete: 'Sil',
  chipMenuDuplicate: 'Kopyasını oluştur',
  chipMenuMoveTop: 'Başa taşı',
  chipMenuMoveUp: 'Yukarı taşı',
  chipMenuMoveDown: 'Aşağı taşı',
  chipMenuMoveBottom: 'Sona taşı',
  chipMenuCopy: 'Panoya kopyala',
  chipMenuPasteAfter: 'Sonrasına yapıştır',
  chipMenuDelete: 'Sil',
  multiselectLabel: 'Çoklu seçim',

  // Artifact set labels (UI)
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

  // Faction groupings and names
  factionGroupTelerianLeague: 'Telerian Birliği',
  factionGroupGaellenPact: 'Gaellen Paktı',
  factionGroupTheCorrupted: 'Yozlaşmışlar',
  factionGroupNyresanUnion: 'Nyresan Birliği',
  factionBannerLords: 'Sancak Lordları',
  factionHighElves: 'Yüce Elfler',
  factionSacredOrder: 'Kutsal Tarikat',
  factionBarbarians: 'Barbarlar',
  factionOgrynTribes: 'Ogryn Kabileleri',
  factionLizardmen: 'Kertenkele Halkı',
  factionSkinwalkers: 'Ten Değiştiriciler',
  factionOrcs: 'Orklar',
  factionDemonspawn: 'İblis Yaratıkları',
  factionUndeadHordes: 'Ölümsüz Sürüleri',
  factionDarkElves: 'Karanlık Elfler',
  factionKnightRevenant: 'Dirilmiş Şövalyeler',
  factionDwarves: 'Cüceler',
  factionShadowkin: 'Gölgekinler',
  factionSylvanWatchers: 'Sylvan Gözcüleri',
}

export default overrides
