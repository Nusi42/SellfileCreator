# RSL Helper Sellfile Creator

RSL Helper için satış kurallarını sade bir arayüzle oluşturun, önizleyin ve dışa aktarın.

> Bağımsız bir hayran projesidir. Plarium, Raid: Shadow Legends veya RSL Helper ile bağlantısı yoktur. Tüm ticari markalar sahiplerine aittir.

## Özellikler
- Kurallar oluşturup kaydedin: Konfigürasyonlar hazırlayın ve tekrar kullanabileceğiniz bir kütüphane edin.
- Sellfile önizlemesi: Üretilen kuralları mevcut sellfile dosyanızla birlikte veya onsuz görün.
- Sellfile ile birlikte önizleme (isteğe bağlı): `.hsf` dosyanızı uygulamaya sürükleyin; mevcut kurallarınızla beraber gösterilir. Bir Konfigürasyon dosyası (`.hsfc`) da bırakabilirsiniz. Üstteki katman hangi dosyaların kabul edildiğini gösterir.
- Metasetler: Ekipman setlerini (ör. Hız + Algı) isimlendirin ve farklı kurallarda yeniden kullanın.
- Tek tıkla dışa aktarma: RSL Helper’da kullanılmaya hazır bir HSF (sellfile) dosyası dışa aktarın.

## Kullanım

### Konfigürasyon dosyası
- HSFC (`.hsfc`): Bu uygulamaya özel proje dosyasıdır. Yükleyebileceğiniz veya paylaşabileceğiniz bir kayıt gibi düşünün. RSL Helper HSFC’yi doğrudan kullanmaz.
- HSF (`.hsf`): RSL Helper’ın kullandığı sellfile’dır. Uygulamadan dışa aktarın ve ardından RSL Helper’a yükleyin.
- Kaydetme varsayılan adı: `SellfileCreatorRules_YYYYMMDD_HHMM.hsfc`.

### Configs Builder
- Configs Builder’ı doldurun ve konfigürasyonunuza net bir ad verin.
- Kaydetmek için «Yeni config olarak ekle» seçeneğine tıklayın. Ardından builder’ın altındaki listeden konfigürasyonu seçin, düzenleyin ve «Seçili config’i güncelle» ile kaydedin.
- Yükle/Kaydet: Özel kurallarınızı yeniden kullanmak için «Config yükle» ve «Config kaydet» seçeneklerini kullanın. Bu işlemler önizlemeyi yeniden oluşturmak için gereken her şeyi saklar.
- Not: «Not ekle» (veya «Notu düzenle») butonuyla konfigürasyon dosyasına not iliştirebilirsiniz. Not içeren bir HSFC yüklendiğinde not otomatik olarak gösterilir.

### Builder düzeni (yukarıdan aşağıya)
- Eylem: Tut veya Sat, ayrıca «Etkin» anahtarı.
  - «Etkin», bu konfigürasyonun kurallarının aktif olup olmayacağını belirler. Kapalıysa kurallar dışa aktarılır ancak RSL Helper bunları yok sayar. Önizlemede beyaz çizgiyle üzeri çizilmiş görünür ve kaydedilen etiket «Tut/Sat» metnini üzeri çizili şekilde gösterir.
- Rütbe, Nadirlik, Fraksiyon, Seviyeler.
  - Fraksiyon (isteğe bağlı) yalnızca aksesuarlar (Yüzük, Tılsım, Sancak) için geçerlidir.
  - Seviyeler: Minimum ve maksimum seviyeyi +0, +4, +8, +12, +16 arasından seçin. Bu aralıktaki her eşikte kurallar oluşturulur.
  - Nadirlik = Auto (önerilir): Seçtiğiniz seviye aralığında kriterlerinizi karşılayan en düşük nadirliği belirler.
    - Minimum atış yoksa Auto kuralları geniş bırakır ve tüm nadirliklerde çalışır.
    - +0 seviyesinde 1/2/3/4 alt stat istiyorsanız Auto, nadirliğin bu sayıyla başlamasını sağlar (1 → ≥ Olağandışı, 2 → ≥ Nadir, 3 → ≥ Destansı, 4 → ≥ Efsanevi).
    - «En az 3 atış» gibi toplam atış sayısı istiyorsanız Auto, +16’da bu toplamı sağlayan nadirliği seçer. 5 atış için Mistik nadirlik seçilir.
    - «Auto ≥» yongası (Nadirlik yanında): Auto için taban belirler ve Late ile birlikte ilgili eşiklerde ekstra «≥» satırları ekler.
      - Döngü: Olağandışı → Nadir → Destansı. «Auto ≥ Nadir» ifadesi, Auto’nun ≥ Nadir’in altına düşmeyeceği anlamına gelir.
      - Late + minimum atış değerleriyle en iyi sonucu verir. Pasifken «Auto + Late» etiketi üzerinde çapraz çizgi görürsünüz.
      - Örnek: SPD ve ATK% alt statlı sancak, ATK% iki atış ister. Nadirlik = Auto, Mod = Late ve Auto ≥ Destansı ayarlayın.
        - Seviye aralığı boyunca Destansı satırlar; +8/+12’de ekstra ≥ Efsanevi satırlar görürsünüz (Efsanevi çoğu zaman son atışı +16’da alır).
        - Sonuç: Destansı seviye düzenli, Efsanevi adil kalır; yalnızca yüksek nadirlik yüzünden hiçbir eşya elenmez.
    - +16 öncesi varlık: Nadirlik henüz tüm istenen alt statlara sahip olamıyorsa, kural ilgili seviyede mümkün olan maksimumu kullanır. +16’da hedeflediğiniz değerler uygulanır.

- Ana stat ve Alt statlar – aynı düğmelerden oluşan üç satır:
  1) Any
  2) HP, HP%, ATK, ATK%, DEF, DEF%
  3) SPD, RES, ACC, CR%, CDMG%
  - Ana stat çoklu seçimi destekler. Boş = Any. Birden fazla değer seçerseniz her ana stat için ayrı bir kural oluşur.
  - «Any», hızlı sıfırlamadır. Alt statlarda «Any» seçili değil anlamına gelir; belirli alt statlar seçildiğinde Any kapanır.
  - Alt statların üç durumu vardır: tıkla = seç; tekrar tıkla = kilitle (🔒); bir kez daha tıkla = kaldır. Kilitli alt statlar her zaman kurala dahil edilir. Toplam hedef sayısı max(Gereken, Kilitli) olup en fazla 4’tür.
  - Atış göstergesi: seçilen her alt stat üzerinde küçük bir yuvarlak.
    - Sol tık = arttır. Sağ tık = azalt.
    - Joker (★): Atışlar bu stat üzerinde serbestçe dağılabilir.
    - ★ üzerinde sol tık minimum atış (yeşil) belirler: 0 → 1 → 2 → 3 → 4 → 5 → ★.
    - ★ üzerinde sağ tık, atış üst sınırını (kırmızı) belirler: 0 → 1 → 2 → 3 → 4 → ★. 0, o statta atış yapılmasını yasaklar.
    - Minimum ile üst sınır birbirini dışlar.
- Gerekli alt statlar – sağ tarafta. Seçtiğiniz alt statlardan kaçının eşyada bulunması gerektiğini belirler. Kilitli alt statlar her zaman sayılır.
- Set/Metaset seçimi: Alt stat bölümü altında seçili setler ve metasetler çipler olarak gösterilir.
- Early/Late modu:
  - Early: Nihai hedefe kadar geçerli olacak tüm dağılımları her seviyede içerir. Joker + minimum atış kullanıldığında Early her seviyede olası tüm bölüşümleri listeler. Üst sınırlar korunur.
  - Late: +16 hedefine erişilebilir kalması için her seviyede yalnızca gerekeni şart koşar. Joker + minimum atış ile, erken seviyelerde varlığı gösterir ve +16’da minimum dağılımı uygular. Her stat için minimum değerler olduğunda Late her seviye için alt sınırlar üretir.

Örnek: Early (2 alt stat) – SPD min = 2, CR% min = 1 (seviye 0..16)
- +0: SPD ≥ 5, CR ≥ 5
- +4: [10,5] ve [5,10]
- +8: [15,5], [10,10], [5,15]
- +12/+16: [15,10]

Örnek: Late (2 alt stat) – SPD min = 2, CR% min = 1 (0..16)
- +0/+4: [5,5]
- +8: [10,5] veya [5,10]
- +12: [15,5] veya [10,10]
- +16: [15,10]

Örnek: Early (3 alt stat) – SPD min = 2, CR% min = 1, CDMG% serbest, Gerekli = 3
- +0: [SPD, CR, CDMG] ≥ [5,5,5]
- +4: tek atışlı dağılımlar: [10,5,5], [5,10,5], [5,5,10]
- +8: iki atışlı dağılımlar (sınırlar korunur)
- +12/+16: [15,10,5]

Örnek: Late (3 alt stat) – SPD min = 2, CR% min = 1, CDMG% serbest, Gerekli = 3
- +0/+4: [5,5,5]
- +8: [10,5,5] veya [5,10,5]
- +12: [15,5,5] veya [10,10,5]
- +16: [15,10,5]

İpucu: Bir statta atışı yasaklamak için üst sınırı kullanın. ★ üzerinden sağ tıklayıp sınırı 0’a çekin. Böylece CDMG% temel değerde kalır, SPD/CR atışları alır.

Örnek: Bir statı kilitle, ikisini zorunlu tut
- SPD, HP, ATK seçin. SPD’yi kilitlemek için iki kez tıklayın (🔒).
- Gerekli alt stat = 2.
- Sonuç: Kurallar SPD+HP ve SPD+ATK içerir; SPD olmadan HP+ATK içermez.

Örnek: 3 statta atış, 4’üncüde yasak
- Amaç: SPD, CR%, CDMG% ve HP%/ATK%/DEF%’ten birine sahip eşyaları tutmak; dördüncü statta atışı engellemek.
- SPD, CR%, CDMG%, HP%, ATK%, DEF% seçin.
- Gerekli alt stat = 4.
- Göstergeler:
  - ★ → sol tık (minimum): SPD/CR%/CDMG% için minimum değerleri girin (ör. her biri 1).
  - ★ → sağ tık (üst sınır): HP%/ATK%/DEF% için 0 belirleyin.
- Sonuç: Dördüncü stat üçlü arasında döner, ancak atış almaz; SPD/CR%/CDMG% tüm atışları toplar.

Örnek: Joker’li Early (yalnızca seçilen alt statlar)
- SPD ve ACC seçin.
- Göstergeler: SPD min = 2; ACC = ★.
- Gerekli alt stat: Auto (2).
- Seviyeler: +0..+16.
- Sonuç: Early, +16’da SPD(2) hedefine ulaşma şansı olan eşyaları gösterir (SPD veya ACC atış aldığı satırlar). SPD için iki atış mümkün olduğunda minimum satır görünür.

Örnek: Joker’li toplam atış (2 alt stat)
- SPD ve ACC’yi seçip ★ durumuna getirin.
- Gerekli alt stat: 2. Minimum atış: 1.
- Early:
  - +4/+8/+12/+16: iki satır – SPD ≥ 10, ACC ≥ 9 ve SPD ≥ 5, ACC ≥ 18 (asgarî dağılımlar, stabildir).
- Late:
  - +0/+4/+8/+12: yalnızca varlık (minimum = 0); +16: yukarıdaki iki satır. Daha yüksek minimumlar için Late uygun eşiklerde asgarî dağılımları zorunlu kılar.

## Katkıda bulunanlar için notlar

- Çeviriler: Yayın arşivleri `i18n/` klasöründe yerelleştirme şablonları içerir (örn. `i18n/en-US.l10n.json`, `i18n/de-DE.l10n.json`, `i18n/fr-FR.l10n.json`, `i18n/es-ES.l10n.json`, `i18n/pt-PT.l10n.json` ve ayrıca `i18n/ru-RU.l10n.json`, `i18n/uk-UA.l10n.json`, `i18n/tr-TR.l10n.json` taslakları).
- Düzenle ve test et: Uygulamayı açıp düzenlediğin `*.l10n.json` dosyasını üzerine sürükle; değişiklikler oturum boyunca hemen uygulanır (kurulum gerekmez).
- Düzeltme gönder: Güncellenmiş JSON’u pull request ile (tercih edilir) ya da bir issue’ya ekleyerek gönder. Anahtarları değiştirme; eksik anahtarlar İngilizce’ye düşer.
- Dahili diller: Tüm dağıtılan diller tek HTML dosyasına gömülüdür, böylece uygulama çevrimdışı da çalışır. Katkıların bir sonraki sürüme dahil edilir.

## Teşekkürler

[STBL] Nasgor’a paha biçilmez katkıları için çok teşekkürler,  
ve elbette RSL Helper için Farbstoff’a da teşekkürler!

## Yazar
Hazırlayan [STBL] Nusi㊷
Yerelleştirme Codex tarafından
