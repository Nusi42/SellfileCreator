import type { Catalog } from '../types'

const overrides: Catalog = {
  // App / Panels
  appBuilderTitle: 'Konfig Oluşturucu',
  loadConfigs: 'Konfigleri yükle (.hsfc)',
  configOne: 'konfig',
  configMany: 'konfigler',
  editNote: 'Notu düzenle...',
  addNote: 'Not ekle...',
  saveAllConfigs: 'Tüm konfigleri kaydet (.hsfc)',
  deleteConfigs: 'Konfigleri sil',

  sellfilePreview: 'Sellfile önizlemesi',
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
  pushMergedSellfile: 'Birleştirilmiş Sellfile’ı RSL Helper’a gönder',
  pushSellfile: 'Sellfile’ı RSL Helper’a gönder',
  pushSellfileTooltip: '{endpoint} adresine Sellfile gönderir',
  manageColorsAria: 'Renkleri yönet',
  // Rule Tester
  testerOpenLabel: 'Kural Testi…',
  testerTitle: 'Kural Testi',
  testerIntro: 'Örnek eşyalar oluşturarak hangi kuralın önce eşleştiğini ve tutulup satılacağını görün.',
  testerEmptyHint: 'Hangi kuralın önce eşleştiğini test etmek için öğe ekleyin.',
  testerRule: 'Kural',
  testerConfig: 'Konfig',
  testerJumpToConfig: 'Konfige git',
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
  builderResetButton: 'Konfigi sıfırla',
  restore: 'Geri yükle',
  dismiss: 'Gizle',
  startTutorial: 'Öğreticiyi başlat',

  // Generic
  rulesCountOne: '1 kural',
  rulesCountMany: '{n} kural',
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
  msgFinalSellExplainer: '“Koru” kurallarıyla eşleşmeyen öğeler için nihai satış kuralları ekleyin.\nNihai satış olmadan eşleşmeyen öğeler korunur. Satış yalnızca bir satış kuralı eşleştiğinde olur.',
  msgFinalSellExplicitSetsWarning: 'Final Satış kuralları, tüm bilinen setleri açıkça listeleyecek şekilde genişler (“Hepsi” jokersiz). Oyun ileride yeni bir set eklerse listede yer almaz, böylece dışa aktarılan Sellfile o taptaze ekipmanı otomatik satmaz. Bu önlem yalnızca Final Satış için geçerlidir; oluşturduğunuz kurallar olduğu gibi kalır.',
  labelGearToSell: 'Satılacak ekipman',
  hintFinalSellStatusLead: 'Nihai satış şu anda',
  hintFinalSellStatusWordOn: 'açık',
  hintFinalSellStatusWordOff: 'kapalı',
  hintFinalSellStatusOnDetail: 'Kapatmak için tüm ekipman türlerini kapatın veya tüm seviye aralıklarını kaldırın.',
  hintFinalSellStatusOffDetail: 'Açmak için en az bir ekipman türünü ve bir seviye aralığını etkinleştirin.',
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
  rulesMenuFactionsAsIcons: 'Fraksiyonlar simge olarak',
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
  builderActionHelp: 'Eşleşen bir eşya bulunduğunda Sellfile için ne yapılacağını belirtin.\n• Koru: eşyayı Koru olarak işaretler, RSL Helper dokunmaz.\n• Sat: eşyayı Sat olarak işaretler, RSL Helper satış kuyruğuna ekler.',
  builderEnabledInExport: 'Dışa aktarımda etkin',
  builderDisabledInExport: 'Dışa aktarımda kapalı',
  builderEnabledInSellfile: 'Sellfile içinde etkin',
  builderDisabledInSellfile: 'Sellfile içinde kapalı',
  builderHelpOpen: 'Builder için hızlı kılavuzu aç',
  builderIntroCaption: 'Bu çalışma alanını, Sellfile\'a neyin tutulup neyin satılacağını söylemek için kullanın. Konfigleri burada hazırlayın, listenize ekleyin ve panelden ayrılmadan metasetlerle birlikte HSFC dosyalarını yükleyip kaydedin.',
  builderRank: 'Rütbe',
  builderRankHelp: '6★ eşyayı 5★\'den farklı değerlendirmek için kuralı belirli yıldız rütbeleriyle sınırlandırın.\n• “Hepsi” tüm rütbeleri geçerli bırakır.',
  any: 'Hepsi',
  builderSubstatValues: 'Alt stat değerleri…',
  builderMain: 'Ana stat',
  builderMainHelp: 'Yalnızca istediğiniz yapılar eşleşsin diye belirli ana statları zorunlu kılın.\n• Birden fazla stat seçerek bunlardan herhangi birini kabul edin.\n• Her ana stat uygunsa boş bırakın.',
  builderClearMainStats: 'Ana stat seçimini temizle',
  builderSubstats: 'Alt statlar',
  builderSubstatsPickHelp: 'Bu konfig için hangi alt statların önemli olduğunu belirtin. `Gerekli Alt Statlar` ve rulo hedefleri burada beslenir.',
  builderSubstatsClickHint: 'Bir kez tıklamak alt stati kabul eder; tekrar tıklamak kilitler (🔒) ve eşyanın onu taşıması gerekir.',
  builderClearSubstats: 'Alt stat seçimini temizle',
  builderSubstatFlexToggleAria: 'Alt stat joker permütasyonlarını aç/kapat',
  builderSubstatFlexToggleTooltip: 'Flex, zorunlu sayının üzerindeki tüm geçerli kombinasyonları üretmek için isteğe bağlı alt statları sırayla dolaştırır.\n• “Bu üçten herhangi ikisi” gibi durumlar için kullanın.\n• Kilitlenmiş seçimler sabit kalır.\n• Döndürülecek ekstra stat kalmadığında otomatik kapanır.',
  builderSlots: 'Yuvalar',
  builderSlotsHelp: 'Konfigi belirli yuvalara (Silah, Çizme vb.) odaklayın; slot dışı parçalar eşleşmesin.\n• Tüm yuvaları kapsamak için boş bırakın.',
  builderClearSlots: 'Yuva seçimini temizle',
  builderSetsHelp: 'Konfigi belirli setlere veya isimli meta setlere filtreleyin; yalnızca bu koleksiyonlar eşleşsin.\n• Tüm setleri dahil etmek için boş bırakın.',
  builderMinLevel: 'Min seviye',
  builderMinLevelHelp: 'Konfigin dikkate alacağı en erken geliştirme basamağını seçin.\n• Basamaklar oyun seviyelerini izler: +0, +4, +8, +12, +16.',
  builderMaxLevel: 'Maks seviye',
  builderMaxLevelHelp: 'Konfigin uygulayacağı son geliştirme basamağını seçin.\n• Builder bu noktanın üstündeki basamakları atlar.',
  builderFaction: 'Faksiyon',
  builderFactionHelp: 'Yalnızca belirli bir takıma yönelik loot ararken aksesuar kurallarını bir faksiyonla sınırlayın.\n• Yüzük, tılsım ve sancak bu filtreyi uygular.\n• Zırh faksiyon filtrelerini yok sayar; onlar için “Hepsi” en güvenlidir.',
  builderRarityExact: 'Tam',
  builderRarityGte: 'Aralıklar ≥',
  builderRarityLte: 'Aralıklar ≤',
  builderMilestoneThresholds: 'Kilometre Taşı Eşikleri',
  builderMilestoneThresholdsHelp: 'Rulo minimumu istediğiniz anda +16 öncesi davranışı belirler.\n• Erken, her basamakta halihazırda sahip olduğunuz ruloları gösterir.\n• Geç, +16 hedefi ulaşılabilir kalsın diye şu anda mevcut olması gerekenleri ister.\n• Sadece herhangi bir alt statte Min > 0 ise veya genel bir minimum belirlediyseniz etkili olur.',
  builderEarlyLabel: 'Erken',
  builderLateLabel: 'Geç',
  builderAutoGeLabel: 'Auto ≥ {tier}',
  builderManageMetasetsButton: 'Meta setleri yönet…',
  builderRequiredSubstats: 'Gerekli alt statlar',
  builderRequiredSubstatsHelp: 'Bir kuralın geçmesi için seçtiğiniz alt statlerden kaçının bulunması gerektiğini ayarlayın.\n• Kilitli alt statlar (🔒) her zaman sayılır.\n• “Oto” sayıyı seçili alt statlerle senkron tutar (en fazla dört).',
  builderFlexChipOn: 'Flex: Açık',
  builderFlexChipOff: 'Flex: Kapalı',
  builderMinRequiredRolls: 'Min gerekli rulolar',
  builderMinRequiredRollsTipSummary: 'Gerekli alt statler için paylaşılan geliştirme rulo hedefini belirler.',
  builderMinRequiredRollsTip1: 'Auto, seçtiğin alt stat sayısına (en fazla 4) göre ayarlayarak kuralın uygulanabilir kalmasını sağlar.',
  builderMinRequiredRollsTip2: 'Manuel değerler, dışa aktarmadan önce hedefin +16’da hâlâ ulaşılabilir olduğunu doğrular.',
  builderMinRequiredRollsTip3: 'Çip, kilitli olmayan alt statlerin bu toplamda sayılıp sayılmadığını belirler.',
  builderMinRequiredRollsTargetLocked: 'Hedef: Kilitli alt statlar',
  builderMinRequiredRollsTargetSelected: 'Hedef: Seçili alt statlar',
  builderMinRequiredRollsChipLocked: 'Sadece kilitli',
  builderMinRequiredRollsChipSelected: 'Tüm alt statlar',
  builderMinRequiredRollsToggleAria: 'Min-rulo hedefini değiştir ({target})',
  builderMinRequiredRollsChipSelectedTooltip: 'Her seçili alt stati minimum rulo toplamına dahil eder.\n• Kilitli alt statler her zaman sayılır.\n• İsteğe bağlı seçimleri yok saymak için «Sadece kilitli»ye geç.',
  builderMinRequiredRollsChipLockedTooltip: 'Minimum rulo toplamında yalnızca kilitli alt statleri sayar.\n• Auto Min kapalıyken isteğe bağlı seçimlerin esnek kalmasını sağlar.\n• Kilitli olmayanları dahil etmek için tekrar «Tüm alt statlar»a dön.',
  builderMinRequiredRollsChipDisabledTooltip: 'Hedefi değiştirmek için en az bir alt stati kilitle.\n• Kilitli alt stat yoksa tüm seçim minimum gereksinime sayılır.',
  builderMinRequiredRollsImpossibleWarn: 'Uyarı: Min gerekli rulolar mevcut stat üst sınırlarıyla +16\'ya kadar sağlanamaz',
  builderRarityHelpIntro: 'Tam nadirlikler veya ≥/≤ aralıkları seçerek hangi kalite parçaların eşleşeceğini kontrol edin. Emin değilseniz “Oto” sizin yerinize karar verir.',
  builderRarityHelpMinTotalRolls: 'Toplam rulo şartı koyarsanız, Auto +16\'ya kadar bu toplamı yapabilecek bir nadirlik seçer (5 rulo Mistik gerektirir). Aralıklar etiketlendiği yönde genişler.',
  builderRarityHelpNoMinRolls: 'Oto modunda rulo minimumu yoksa kural geniş kalır ve her nadirlikle çalışır.',
  builderRarityHelpStartSubs: '+0\'da Auto, nadirliğin bu kadar alt statle başlayabildiğini kontrol eder (1→≥Sıradışı, 2→≥Nadir, 3→≥Destansı, 4→≥Efsanevi).',
  builderInsertAsConfig: 'Konfig #{n} olarak ekle',
  builderInsertHiddenTooltip: 'Mevcut filtreler yeni konfigi eklendikten sonra gizler.',
  builderAddAsNew: 'Yeni konfig olarak ekle',
  builderSaveAsConfig: 'Konfig #{n} olarak kaydet',
  builderSaveHiddenTooltip: 'Mevcut filtreler bu konfigi kaydettikten sonra gizler.',
  builderUnsavedChangesAria: 'kaydedilmemiş değişiklikler',

  builderAutoPlusLate: 'Oto + Geç',
  builderAutoPlusLateHelp: 'Oto + Geç açıkken ekstra ≥ kademeleri ekler ve +4/+8/+12 seviyelerinde nadir dalları görünür tutar.',
  builderAutoGeExample: 'Örnek: Min = 1 alt stat ve Auto ≥ {tier} şunları ekler:',
  builderAutoLateTitle: 'Auto + Geç yaması (ek ≥ dalları)',
  builderAutoLateIntro: 'Auto, geç eşiklerin ulaşılabilir kalması için +4, +8 ve +12\'de ekstra ≥ nadirlik dalları ekler.',
  builderAutoLateL4: '+4: ≥{rare} dalı ve ≥{uncommon} için 1 gerektiren dal ekler',
  builderAutoLateL8: '+8: ≥{epic} dalı ekler',
  builderAutoLateL12: '+12: ≥{legendary} dalı ekler',
  builderAutoLateDisabledNote: 'Yalnızca Nadirlik Auto ve Kilometre Taşı Eşikleri Geç olduğunda etkinleşir.',

  // Builder kopya kağıdı (popover)
  builderCheatSheetTitle: 'Builder kopya kağıdı',
  builderCheatSheetSectionRarity: 'Nadirlik örnekleri',
  builderCheatSheetRarityExactTitle: 'Tam Epik',
  builderCheatSheetRarityExactBody: 'Yalnızca bu nadirlik geçmeli diyorsan sabit bir seviye seç. Saf epik bayraklar ya da ileride yeniden kuracağın parçalar için ideal.',
  builderCheatSheetRarityExactChip: 'Nadirlik: {tier}',
  builderCheatSheetRarityAutoTitle: 'Auto (en düşük uygun)',
  builderCheatSheetRarityAutoBody: 'Auto kuralı geniş tutar ve substat sayın ile rol hedeflerini karşılayan en düşük nadirliği seçer.',
  builderCheatSheetRarityAutoChip: 'Geçerli en düşük kademe',
  builderCheatSheetRarityAutoChipFull: 'Nadirlik: Auto',
  builderCheatSheetRarityAutoLateTitle: 'Auto + Geç eşikleri',
  builderCheatSheetRarityAutoLateBody: 'Geç açıkken “Auto ≥ Rare” (veya üstü) ekleyerek nadir dalların listede kalmasını, matematiğin de ulaşılabilir olmasını sağla.',

  builderCheatSheetSectionSubstats: 'Alt statlar ve gereksinim',
  builderCheatSheetSubstatsLockTitle: 'Kilitli + opsiyonel',
  builderCheatSheetSubstatsLockBody: 'Kilitli statlar (🔒) her zaman görünür. Opsiyoneller diğer yuvaları doldurur ve farklı destek kombinasyonları verir.',
  builderCheatSheetSubstatsFlexTitle: 'Opsiyoneller için Flex',
  builderCheatSheetSubstatsFlexBody: 'Flex zorunlu sayının üstündeki fazla seçimleri döndürür, böylece konfigürasyon kopyalamadan tüm geçerli kombinasyonları (ör. 3’ten herhangi 2) üretirsin. Sihirli değnek simgesi Flex çalışırken görünür.',
  builderCheatSheetFlexChip: 'Flex açık',
  builderCheatSheetSubstatsAutoTitle: 'Gereken = Auto',
  builderCheatSheetSubstatsAutoBody: 'Auto gereklilik sayısını seçtiğin alt statlarla (maks. 4) senkron tutar, elle ayarlama ihtiyacını kaldırır.',

  builderCheatSheetSectionRolls: 'Rol göstergeleri',
  builderCheatSheetRollsMinTitle: 'Minimum roller (stat başına)',
  builderCheatSheetRollsMinBody: 'Yeşil değerler hedeflediğin aşamada beklediğin minimum rol sayısını gösterir. “Erken” ilerlemeyi izler ve sonraki bölünmeleri kullanılır kılar.',
  builderCheatSheetRollsCapTitle: 'Rol sınırları',
  builderCheatSheetRollsCapBody: 'Kırmızı sınırlar o statta ekstra rolleri engeller. Statı tutup taban değerinde bırakmak istiyorsan 0 kullan.',
  builderCheatSheetRollsCapChip: 'Sınır 0',
  builderCheatSheetRollsSumTitle: 'Gerekli minimum toplam',
  builderCheatSheetRollsSumBody: 'Seçtiğin statlar için toplam bir alt sınır ekler. Auto, toplamı jokerlerle paylaşırken Erken/Geç erişilemeyen dağılımları temizler.',

  builderCheatSheetSectionMilestones: 'Aşamalar',
  builderCheatSheetMilestonesEarlyTitle: 'Erken (takip)',
  builderCheatSheetMilestonesEarlyBody: 'Erken, şu ana kadar aldığın rolleri listeler ve +16 hedefine ulaşabilen tüm dağılımları gösterir.',
  builderCheatSheetMilestonesEarlyRow0: 'SPD ≥ 5 ve ACC ≥ 5 — başlangıç rolleri',
  builderCheatSheetMilestonesEarlyRow4: '+4 ilk rolü ekler: SPD ≥ 10 veya ACC ≥ 10',
  builderCheatSheetMilestonesEarlyRow8: '+8, +16’da SPD ≥ 15 ve ACC ≥ 10’a ulaşan tüm ikili rolleri gösterir',
  builderCheatSheetMilestonesEarlyRow12: '+12/+16 SPD ≥ 15 ve ACC ≥ 10’da birleşir',
  builderCheatSheetMilestonesLateTitle: 'Geç (şimdi lazım olan)',
  builderCheatSheetMilestonesLateBody: 'Geç, hedef +16’yı sürdürebilmek için şu anda hangi minimum değerlere ihtiyaç olduğunu listeler. Önceki seviyeler yalnızca mümkün seçenekleri gösterir. Kuşatma ya da etkinlik ganimeti gibi nadir düşen eşyalar için önerilir.',
  builderCheatSheetMilestonesLateRow0: '+0/+4 tabanı — SPD ≥ 5 ve ACC ≥ 5',
  builderCheatSheetMilestonesLateRow8: '+8 ikinci role ihtiyaç duyar: SPD ≥ 10 veya ACC ≥ 10',
  builderCheatSheetMilestonesLateRow12: '+12, rayında kalmak için SPD ≥ 15 veya ACC ≥ 10 ister',
  builderCheatSheetMilestonesLateRow16: '+16 nihai hedef — SPD ≥ 15 ve ACC ≥ 10',

  builderCheatSheetSectionAdvanced: 'Hepsini birleştir',
  builderCheatSheetAdvancedTitle: 'Geç Auto ≥ Epik + Flex + sınırlar',
  builderCheatSheetAdvancedBody: 'SPD/ACC için rol hedefleri koyar, RES jokerini döndürür, CDMG%’yi 0’a çeker ve {legendary} dalları {late}, {autoEpic} ve {locked} anahtarı açıkken görünür tutar.',

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
  filterConfigName: 'Konfig adı',
  filterConfigNameInvalid: 'Geçersiz düzenli ifade',
  filterLimitConfigs: 'Konfigler',
  filterLimitConfigsTooltip: 'Mevcut filtreleri geçen konfig çiplerini göstermek için aç/kapat.',
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
  statHPATKDEF: 'HP/ATK/DEF',
  statSPD: 'SPD',
  statRES: 'RES',
  statACC: 'ACC',
  statCR: 'CR%',
  statCDMG: 'CDMG%',
  statRollCount: 'Rulo sayısı',

  // Note dialog
  noteTitle: 'Not',
  titleClearNote: 'Not silinsin mi?',
  msgClearNote: 'Bu işlem mevcut notu HSFC’dan kaldırır. Geri alınamaz.',
  noteColorTooltip: 'Renk: {name}',
  noteInsertConfigs: 'Insert config chips tag',
  noteInsertMetasets: 'Insert Metaset list',
  noteMetasetNoSets: 'No sets',

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
  rollIndicatorTip1: 'Bu alt statta yükseltme talep etmek için rulo göstergesini kullanın. Sol tık beklentiyi artırır; sağ tık azaltır.',
  rollIndicatorTip2: '★ durumundan sol tık minimum gereksinime (0..5 rulo), sağ tık da rulo tavanına (0..4) geçer.',
  rollIndicatorTip3: 'Rulo tavanındayken sol tık sınırı düşürür (1→0→★), sağ tık yükseltir (0→1→…→4→★).',
  rollIndicatorTip4: 'Yeşil sayılar istediğiniz minimum ruloları gösterir; kırmızılar bu sınırın üzerindeki fazladan ruloları kısıtlar.',
  
  
  

  // Filter helpers
  
  
  

  // Factions (UI labels)
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Stat labels (UI)
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  // Builder panel caption and toasts
  
  toastConfigsSaved: 'Konfigler kaydedildi. İndirilenler’i kontrol edin.',
  toastSellfileSaved: 'Sellfile dışa aktarıldı.',
  toastSellfileExportFailed: 'Sellfile dışa aktarma başarısız oldu. Ayrıntılar için konsola bakın.',
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
  tutActionBody: 'Eşleşen eşyalarla nasıl davranılacağını seçin. `Koru` onları Koru olarak işaretler, böylece RSL Helper dokunmaz; `Sat` onları Sat olarak işaretler, böylece RSL Helper satış kuyruğuna ekler.',
  tutEnabledTitle: 'Sellfile içinde etkin',
  tutEnabledBody: '`Sellfile içinde etkin` anahtarını kullanarak bu konfigin satırlarının dışa aktarımdan sonra etkin kalıp kalmayacağını belirleyin. Devre dışı konfigler yine kaydedilir ve dışa aktarılır, ancak RSL Helper\'da pasif kalır ve önizlemede üstü çizili görünür.',
  tutBasicsTitle: 'Rütbe/Nadirlik/Seviyeler',
  tutBasicsBody: '`Rütbe`, `Nadirlik`, `Faksiyon`, `Min seviye` ve `Maks seviye` değerlerini ayarlayın. Basamaklar +0/+4/+8/+12/+16 olarak ilerler, bu nedenle builder yalnızca bu pencere içinde satırlar üretir. `Nadirlik = Oto` seçili alt statlerin bu basamaklarda mümkün kalmasını ve +16\'da rulo hedeflerinize ulaşılmasını sağlayan en düşük nadirliği seçer.',
  tutSlotsTitle: 'Yuvaları seçin',
  tutSlotsBody: '`Botlar`ı hedefleyelim. Seçmek için `Botlar` simgesine tıklayın. Şimdi sizin için seçeceğiz.',
  tutMainTitle: 'Ana stat seçin',
  tutMainBody: '`Ana stat`ta `SPD` seçin. Böylece kural sadece hız botları için geçerli olur.',
  tutSetsTitle: 'İsteğe bağlı: Set seçin',
  tutSetsBody: '`Sets` içinden (ör. Speed) seçin veya kapsamı geniş tutmak için açık bırakın. Burada örnek olarak Speed seçeceğiz.',
  tutAddConfigTitle: 'Konfig ekle',
  tutAddConfigBody: '`Yeni konfig olarak ekle`ye tıklayın. `İleri`ye basın; sizin için tıklarız. Eklendikten sonra düğme metni `Seçilenden sonra ekle` olarak değişir.',
  tutConfigAddedTitle: 'Konfig eklendi',
  tutConfigAddedBody: 'Harika! Yeni `konfig çipi` seçildi. Düğmede artık `Konfig #2 olarak ekle` yazıyor; sonraki konfigler hemen arkasına eklenir.',
  tutSeeRulesTitle: 'Kurallarınızı görün',
  tutSeeRulesBody: '`Sellfile Preview`, bu konfigin ürettiği kuralları gösterir. `Alt statlar` seçilmediğinden bir kural görürsünüz — özünde: `Speed` setinde `SPD` ana statlı tüm `Botlar`ı koru. Bir satıra tıklamak ilgili konfigi seçer; bir çipe tıklamak ilk satıra gider.',

  tutAdvIntroTitle: 'Gelişmiş örnek',
  tutAdvIntroBody: 'Şimdi `Alt statlar` ve `rulolar`la daha güçlü parçaları hedefleyelim. Yeniden kullanılabilir, basit ve okunur hedefler belirleyeceğiz.',
  tutAdvSelectSlotsMainTitle: 'Yuvaları ve ana statları seçin',
  tutAdvSelectSlotsMainBody: '`Yuvalar`da `Zırh` ve `Botlar`ı seçin, `Ana stat`ta `HP%`, `ATK%`, `DEF%` seçin. Bunları sizin için uyguladık.',
  tutAdvNameTitle: 'Konfiginize ad verin',
  tutAdvNameBody: 'Bu konfige kısa ve net bir `Ad` verin. Şimdi bir örnek dolduracağız.',
  tutAdvChooseSubstatsTitle: 'Alt stat seçin',
  tutAdvChooseSubstatsBody: '`Alt statlar`da `SPD`, `CR%` ve `CDMG%` seçin. Her tıklama döngüsü: seç → kilitle (🔒 zorunlu) → temizle. `SPD`/`CR%` seçili kalacak, sadece `CDMG%`u kilitleyeceğiz.',
  tutAdvRequiredTitle: 'Gerekli alt statlar',
  tutAdvRequiredBody: 'Seçtiğiniz alt statlerden kaçının bulunması gerektiğini seçin. `Oto` seçtiğiniz sayı kadarını (en fazla dört) yansıtır. Kilitli alt statlar her zaman sayılır, bu yüzden `Gerekli = 2` için eşyada kilitli `CDMG%` ile birlikte `SPD` ya da `CR%`den biri bulunmalıdır.',
  tutAdvMinRollsTitle: 'Minimum gerekli rulolar',
  tutAdvMinRollsBody: '`Min gerekli rulolar` seçili (veya kilitli) alt statler arasında paylaşılan toplam hedeftir. Örnek: `3`, +16\'ya kadar toplamda en az üç rulo anlamına gelir, her bir statta üç değil. `0` genel kontrolü atlar.\n\nİpucu: 💡 Hedefi `Seçilenler` ile yalnızca `🔒` alt statlar arasında çevirmek için simgeye tıklayın.',
  tutAdvMilestonesBody: '`Aşama eşikleri`, rulolar istediğiniz anda erken satırların nasıl davranacağını belirler. `Erken`, her basamakta halihazırda sahip olduğunuz ruloları takip eder; `Geç`, +16 hedefi ulaşılabilir kalsın diye şu anda gerekli olanı ister. Anahtar yalnızca herhangi bir alt statte (ya da toplamda) sıfırdan büyük bir minimum varsa anlamlıdır.',
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
  tutAdvAddBody: '`Konfig #2 olarak ekle`ye tıklayarak bu gelişmiş örneği kaydedin. `İleri`ye basın, tıklamayı biz yaparız. Birden çok konfigi ve sıralarını yönetebilirsiniz; ilk eşleşme kazanır.',
  tutAdvAddedTitle: 'Gelişmiş konfig eklendi',
  tutAdvAddedBody: 'Süper! Gelişmiş `konfig çipi` eklendi ve seçildi. Çip menüsünden kopyala, taşı veya sil işlemlerini yapabilirsiniz.',
  tutAdvPreviewEarlyTitle: 'Bu kurallar ne yapar',
  tutAdvPreviewEarlyBody: '`Sellfile Preview`, bu konfigin oluşturduğu satırları gösterir — `SPD`/`CR%`/`CDMG%` karışımlarından yaklaşık 84 tanesi `Gerekli = 2` ve rulo hedeflerini karşılar. `Erken` ile tablo her basamakta elinizde olanı listeler, böylece iki zorunlu rulo mümkün olur olmaz (burada +8\'de) görünür. Hâlâ eşleşmeyen parçalar sonraki konfiglere akar ve `Nihai satış` artıkları yakalayabilir.',
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
  tutPreviewHeaderMenuBody: '`Sellfile Preview` başlığına sağ tıklayarak tablo seçeneklerini açın. Buradan `Çok satırlı satırlar` seçeneğini açıp kapatabilir, `Yuvalar simge olarak`, `Fraksiyonlar simge olarak` ve `Setler simge olarak` görünümünü yönetebilir, `Stat metinlerini renklendir` özelliğini açıp `Renkleri yönet` menüsünü açabilir ve `Renk körü paleti`ni (Normal, Okabe–Ito, Tritan) seçebilirsiniz. Menüyü kapatmak için `Esc` tuşuna basın veya dışarı tıklayın.\n\nİpucu: 💡 Bu öğreticiyi istediğiniz zaman yardım düğmesinden başlatabilirsiniz.',
  tutPreviewFinishTitle: 'Önizle ve bitir',
  tutPreviewFinishBody: '`Sellfile Preview` son kurallarınızı gösterir. Kurallarınızı bir `RSL Helper Sellfile` ile birleştirmek için `Sellfile yükle` yapabilirsiniz — genelde gerekmez. Yüklerseniz, onun kuralları sizin konfig kurallarınızdan (`konfig çipleri`) önce gelir. İlk eşleşme kazanır — dolayısıyla yüklenen dosyadaki `Sat` kuralları sizinkilerden önce eşleşebilir.',
  

  // Extra Example: Accessories — Auto Rarity + Late (Banner SPD)
  tutAutoLateIntroTitle: 'Aksesuar örneği: Auto + Geç',
  tutAutoLateIntroBody: '`Sancak` için `Nadirlik = Auto` ve `Aşama eşikleri = Geç` olacak basit bir kural kuruyoruz. `SPD`yi `Alt stat` olarak seçin ve `Min gerekli rulolar = 3` hedefini `+16`ya ayarlayın. `Auto`, üç SPD rulosuna ulaşabilecek en düşük nadirliği seçer; `Geç` ise tam kontrolü +16\'ya bırakıp her basamakta yalnızca gerekli olanı ister.',
  tutAutoLateAddTitle: 'Bu konfigi ekle',
  tutAutoLateAddBody: '`Konfig #3 olarak ekle`ye tıklayın. Kuralları önizlemede görmek için onu hemen ekleyeceğiz.',
  tutAutoLatePreviewTitle: 'Auto + Geç önizlemede',
  tutAutoLatePreviewBody: '`Sellfile Preview` artık `Destansı` ve `Efsanevi` `Sancak` satırlarını gösteriyor. `Auto`, +16\'da üç SPD rulosuna ulaşabilecek tüm nadirlikleri tutar; `Geç`, erken basamakları erişilebilir bırakır ve üç rulonun bir anda gelmesini beklemez. Vurguyu görmeniz için satırı sizin yerinize seçeceğiz.',
// Chips context menus
  chipsMenuSelectAll: 'Tümünü seç',
  chipsMenuCopyAllConfigs: 'Tüm konfigleri kopyala',
  chipsMenuPasteAtEnd: 'Sona yapıştır',
  chipsFilteredEmpty: 'Mevcut filtrelere uyan konfig yok',
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
