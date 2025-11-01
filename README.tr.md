# RSL Helper Sellfile Creator

RSL Helper için satış kurallarını basit bir arayüzle oluşturun, önizleyin ve dışa aktarın.

> Bu araç hayranlar tarafından geliştirildi. Plarium, Raid: Shadow Legends veya RSL Helper ile bağlantılı değildir. Bahsi geçen tüm ticari markalar sahiplerine aittir.

## Özellikler
- Kuralları oluşturun ve kaydedin: Konfigler hazırlayın ve tekrar kullanabileceğiniz bir kitaplık oluşturun.
- Sellfile önizlemesi: Üretilen kuralları mevcut Sellfile’ınızla birlikte veya onsuz görün.
- Sellfile ile birlikte önizleme (isteğe bağlı): `.hsf` dosyanızı uygulamaya sürükleyip bırakın. Ayrıca bir konfig dosyası (`.hsfc`) da bırakabilirsiniz; katman hangi dosyaların kabul edildiğini gösterir.
- Metasetler: Ekipman setlerini (ör. Hız + Algı) gruplayın ve birçok kuralda tekrar kullanın.
- Tek tıkla dışa aktarma: RSL Helper’da kullanılmaya hazır bir HSF dosyası üretin.

## Nasıl kullanılır

### Konfig dosyası
- HSFC (`.hsfc`): Uygulamanın proje dosyası. Yükleyip paylaşabileceğiniz bir kayıt dosyası gibi düşünün. RSL Helper HSFC’yi doğrudan okumaz.
- HSF (`.hsf`): RSL Helper’ın tükettiği Sellfile. Buradan dışa aktarın ve RSL Helper’a yükleyin.
- Varsayılan kayıt adı: `SellfileCreatorRules_YYYYMMDD_HHMM.hsfc`.

### Konfig Oluşturucu
- Konfig Oluşturucu alanlarını doldurun ve konfige net bir isim verin.
- «Yeni konfig olarak ekle» seçeneğiyle kaydedin. Ardından oluşturucunun altındaki listeden seçip «Seçili konfigi güncelle» ile değişiklikleri kaydedin.
- Yükle/Kaydet: «Konfigleri yükle» ve «Konfigleri kaydet» işlemleri önizlemeyi yeniden oluşturmak için gereken her şeyi saklar.
- Not: «Not ekle…» / «Not düzenle…» konfig dosyasına not ekler. Not içeren dosyayı yüklediğinizde otomatik gösterilir. `<!-- configs:1,0 -->` belirli konfig çiplerini ekler (0 bir sonrakini seçer). `<!-- configs-re:"speed" -->` adı desene uyan tüm konfigleri gösterir (büyük/küçük harf duyarsızdır).

### Oluşturucu düzeni (yukarıdan aşağıya)
- Eylem ve Etkin: Bir eşya konfigle eşleştiğinde ne olacağını tanımlar.
  - `Koru` eşyayı Koru olarak işaretler; RSL Helper dokunmaz.
  - `Sat` eşyayı Sat olarak işaretler; RSL Helper satışı sıraya koyar.
  - «Sellfile içinde etkin» anahtarı, dışa aktarılan satırların aktif kalıp kalmayacağını belirler. Kapatılan konfigler yine dışa aktarılır ama RSL Helper’da üstü çizili ve etkisiz görünür.
- Rütbe: 6★ ekipmanı 5★’dan farklı ele almak istiyorsanız kuralı belirli yıldız rütbeleriyle sınırlandırın. `Hepsi` tüm rütbeleri kapsar.
- Seviyeler: +0, +4, +8, +12, +16 dönüm noktaları arasından minimum ve maksimum seviyeyi seçin. Satırlar yalnızca bu aralıkta üretilir.
- Nadirlik: `Oto` (önerilen) seçili seviyelerde koşulları karşılayan en düşük nadirliği bulur.
  - Stat başına minimum ya da toplam hedef yoksa, Oto kuralı geniş tutar; tüm nadirlikler geçerlidir.
  - 1/2/3/4 başlangıç alt statı istiyorsanız, Oto nadirliğin bu sayıyla başlayabildiğini doğrular (1→≥ Sıradışı, 2→≥ Nadir, 3→≥ Destansı, 4→≥ Efsanevi).
  - Toplam rulo şartı varsa, Oto hedefinizi +16’da yakalayabilen en düşük nadirliği seçer (5 rulo için Mitik gerekir).
  - `Oto ≥` çipi (Kilometre Taşı Eşikleri'nin altında) tabanı yükseltir ve «Geç» mod aktifken +4/+8/+12’de ek ≥ dalları ekler.
    - Döngü: Sıradışı → Nadir → Destansı. «Oto ≥ Nadir» Sıradışı’yı dışarıda bırakır.
    - Yalnızca Nadirlik = Oto ve Eşikler = Geç iken aktiftir; diğer durumda çip üzerinde eğik çizgi görünür.
    - Örnek: SPD ve ATK% alt statlı bir sancak, ATK% için 2 rulo istiyor. Nadirlik = Oto, Eşikler = Geç, Oto ≥ Destansı. Sonuç: Her seviyede Destansı satırlar ve +8/+12’de ≥ Efsanevi dallar; nadir droplar elenmez.
  - +16’ya kadar oluşturucu, nadirliğin o anda izin verdiği alt stat sayısını kullanır. +16’da hedefiniz tam olarak uygulanır.
- Faksiyon: Belirli bir takım için aksesuar topluyorsanız kuralı o faksiyonla sınırlandırın. Yüzük, Muska ve Sancak filtreye uyar; zırh faksiyon görmez, bu yüzden `Hepsi` güvenlidir.
- Yuvalar: Kuralları belirli ekipman parçalarına (Silah, Çizme vb.) odaklayın. Boş bırakırsanız tüm yuvaları kapsar.
- Setler ve metasetler: Belirli setleri veya isimlendirilmiş metasetleri hedefleyin. Boş = tüm setler.
- Ana stat: Kabul edilen ana statları tanımlar.
  - Birden fazla seçenek ekleyebilirsiniz; seçim olmazsa herhangi biri geçerlidir.
  - Birden fazla ana stat seçmek her biri için ayrı satır üretir.
- Alt statlar: Hangi alt statların önemli olduğunu belirtin.
  - Tek tık alt stati açıp kapatır. Kilitlenen alt statlar oluşturulan satırlarda her zaman kalır.
  - Etiket yanındaki kilit simgesi (🔒) stati zorunlu kılar; sağ tık kilitleme/açma ve rulo ayarları için hızlı menüyü açar.
  - `Herhangi` seçimi sıfırlar ve kısıtlama olmadığı anlamına gelir. Somut alt statlar seçildiğinde `Herhangi` kapanır.
  - Satır başına `max(Gerekli, kilitli)` kadar alt stat yer alır (en fazla dört). Kilitli bir stat yer garantiler.
- Flex anahtarı: Gerekli sayının üzerinde seçenek varsa Flex bu seçenekleri tüm permütasyonlara dağıtır, böylece her geçerli kombinasyon üretilir. Kilitli statlar sabit kalır; döndürülecek seçenek kalmadığında Flex kendini kapatır.
- Rulo göstergesi: Seçili her alt stat yükseltme sayısını gösteren küçük bir daire taşır.
  - Sol tık beklentiyi yükseltir, sağ tık düşürür.
- ★ durumundan: sol tık yeşil minimuma (0→1→…→5), sağ tık kırmızı üst sınıra (0→1→…→4) geçer.
- Kırmızı üst sınırdayken sol tık limiti düşürür (1→0→★), sağ tık artırır (0→1→…→4→★). Minimum ve üst sınır bir arada kullanılamaz.
- Rulo hedefleri (Taban/+1…+5): Seçili bir alt stat üzerine sağ tıklayarak Rulo hedefleri ızgarasını aç. Taban +0 değerini tutar; her +N alanı o kadar ek rulo sonrasındaki değeri gösterir. Alanı boş bırakarak Alt stat hedeflerini yeniden kullanabilir veya «Global alt stat hedeflerini kullan» seçeneğiyle tamamını temizleyebilirsin. Önizleme rozetleri anında güncellenir, böylece dışa aktarmadan önce rakamları doğrulayabilirsin.
- Gerekli alt stat sayısı: Kurala takılması için item üzerinde kaç seçili alt stat olması gerektiğini tanımlar.
  - `Oto` seçimi takip eder (en fazla dört).
  - Kilitli alt statlar (🔒) her zaman sayılır ve imkânsız kombinasyonlarda uyarı gösterilir.
- Minimum rulolar (global): Seçili ya da kilitli alt statlar arasında paylaşılması gereken toplam rulo sayısını ayarlar. `0` toplam kontrolünü atlar. Erken mod +16’ya kadar hedefe ulaşabilecek kombinasyonları listeler.
- Eşikler (Seviye başına): Minimum rulo istediğinizde +16 öncesinde nasıl davranacağını belirtir.
  - `Erken` her seviyede halihazırda kazanılan ruloları takip eder.
  - `Geç` +16 hedefinin hâlâ mümkün olması için şu anda zorunlu olan ruloları ister.
  - Bu anahtar yalnızca herhangi bir alt statın Min > 0 olması veya global toplamın 0’dan büyük olması durumunda anlamlıdır.

### Seviye ve rulolar: hızlı rehber
- Erken eşikler: Şartlar yerine getirilebilir hâle gelince satırlar Alt stat hedeflerinde sabitlenir. Öncesinde Erken yalnızca geçerli kombinasyonları gösterir.
- Toplam rulolar (Σ): Minimum rulo, hedef seviyede seçili alt statlar üzerindeki toplam rulo sayısıdır.
- Jokerler ve toplam hedef: Sadece ★ alt statlar ve toplam hedef > 0 iken Erken her seviyede minimal bölünmeleri gösterir. Geç aynı bölünmeleri erken seviyelerde ve +16’da tekrarlar.
- Mitik (5 rulo): Mitik nadirlik +16’da tek alt statta beş rulo alabilir (diğerleri dörtte kalır). Mitik dahilse jeneratör ekstra başlangıç rulonu da hesaplar.

### Alt stat hedefleri
- Oluşturucunun sağ üst köşesindeki «Alt stat hedefleri…» düğmesiyle açılır.
- Hedefler globaldir; tüm konfiglere uygulanır.
- Bu hedefler seviye aralıklarına göre (0–3, 4–7, 8–11, 12–15, 16) kullanılan eşikleri belirler ve Rulo hedefleri ızgarası için geri dönüş değeri sağlar.
- «Varsayılanlara döndür» önerilen hedefleri geri yükler.

### Metasetler
- «Metasetleri yönet…» diyaloğunu açın.
- Metaset ekleyin/yeniden adlandırın ve kapsadıkları setleri seçin. Arayüz set seçicisiyle aynıdır.
- Başlangıç metasetleri sunulur; istediğiniz zaman düzenleyebilir veya silebilirsiniz.
- «Varsayılanlara döndür» kullanımdaki metasetler için güvenli seçenekler sunar (sil, açık setlerle değiştir, başka bir metasetle değiştir).

### Final satış
- Dışa aktar düğmesinin yanındaki anahtar kalan eşyalar için satış kuralları ekler. Varsayılan olarak açık gelir.
- Hangi ekipman türlerinin (Artefakt / Aksesuar) ve hangi seviye aralıklarının (0–3, 4–7, 8–11, 12–15, 16) etkilenacağını seçin. Varsayılan 0–15’tir; +16’daki parçalar satılmaz.
- Final satış kapalıysa, hiçbir kurala uymayan eşyalar otomatik olarak korunur. Satış yalnızca açık bir Sat kuralı eşleştiğinde olur.
- Final satış açıkken üretilen Sat kuralları tüm bilinen setleri içerir. Önizleme «Tüm bilinen setler» der; dışa aktarılan dosya yine her seti tek tek listeler.

### Konfig yönetimi
- Kaydedilen konfigler oluşturucunun altında etiket olarak görünür. Sol tık seçer; sağ tık kopyala, taşı, çoğalt veya sil işlemlerini açar.
- «Tüm konfigleri sil» tüm konfigleri siler (onay istenir).
- Hover bağlantısı: Bir etiketin üzerine gelmek, önizleme tablosundaki ilgili satırları vurgular ve tersi.
- Tabloda satıra tıklamak satırın ait olduğu konfigi seçer (baz HSF satırları seçimi değiştirmez).
- Panoya alternatif: Clipboard erişimi engellenirse, metni seçili şekilde gösteren bir iletişim kutusu açılır.

### Sellfile önizlemesi (isteğe bağlı baz dosyayla)
- Kuralları mevcut bir `.hsf` ile birleştirebilirsiniz.
  - «RSL Helper Sellfile yükle» (veya sürükle-bırak) baz dosyayı ekler.
  - «Temizle» yüklenen dosyayı kaldırır.
- Palet simgesi, alt stat etiketleri için metin ve arka plan renklerini düzenlemenizi sağlar.
- Tablo dışa aktarılacak tüm satırları gösterir. «Idx» ve «Cfg» sütunları satırı üreten konfigi belirtir; baz dosyadan gelenlerde «Cfg» boş kalır.

### Önizleme kontrolleri
- Renkleri yönet: Palet ikonunu kullanın; «Varsayılanlara döndür» önerilen renkleri geri yükler.
- Sütun menüsü (başlığa sağ tık):
  - Sütunları sıfırla: Varsayılan sütunları ve genişlikleri geri getirir.
  - Genişlikleri uyarla: Sütunları pencere genişliğine göre ayarlar.
  - Çok satırlı satırlar: Satırlarda satır sonu kullanımını açar (alt statlar için faydalı).
  - Sütun göster/gizle: Her sütun için onay kutuları.
- Sütun sırası: Başlığı yatay sürükleyin.
- Sütun genişliği: Başlığın sağ kenarını sürükleyin.
- Tıklama davranışı: Tablo satırına tıklamak ilgili konfigi seçer (otomatik kaydırma yok). Bir konfig etiketine tıklamak tabloyu ilk eşleşen satıra kaydırır.

### Dışa aktarma
- Baz dosya yüklüyse «Birleştirilmiş RSL Helper Sellfile’ı dışa aktar» görünür; aksi durumda «RSL Helper Sellfile’ı dışa aktar».
- Çalışmanızı korumak için oluşturucu alanındaki «Konfigleri kaydet»/«Konfigleri yükle» seçeneklerini kullanın.
- Varsayılan HSF adı: `Sellfile_YYYYMMDD_HHMM.hsf`.

## Örnekler

Tüm örneklerde rulo başına 6★ alt stat hedefleri: SPD=5, CR%=5, CDMG%=5.

Erken vs Geç
- Erken: Eşikler o ana kadar kazanılan ruloları yansıtır. ★ + toplam hedef kombinasyonlarında sadece her seviyedeki minimal bölünmeler gösterilir (liste sabit kalır). Diğer durumlarda hedef mümkün olana dek seçilen statlardaki ilerlemeyi listeler, ardından Alt stat hedeflerine sabitlenir (global Σ daha fazlasını gerektirmedikçe).
- Geç: +16 hedefinin ulaşılabilir kalması için şu anda bulunması gereken ruloları ister. ★ + toplam hedef ile, aynı minimal bölünmeleri erken seviyelerde ve tekrar +16’da listeler. Stat bazlı hedeflerde her seviye için gerekli alt sınırlar verilir.

Örnek: Erken (2 alt stat) — SPD min=2, CR% min=1 (0..16)
- +0: SPD ≥ 5, CR ≥ 5
- +4: [10,5] ve [5,10]
- +8: [15,5], [10,10], [5,15]
- +12/+16: [15,10]

Örnek: Geç (2 alt stat) — SPD min=2, CR% min=1 (0..16)
- +0/+4: [5,5]
- +8: [10,5] veya [5,10]
- +12: [15,5] veya [10,10]
- +16: [15,10]

Örnek: Erken (3 alt stat) — SPD min=2, CR% min=1, CDMG% serbest, Gerekli=3
- +0: [SPD, CR, CDMG] ≥ [5,5,5]
- +4: tek rulo dağılımları: [10,5,5], [5,10,5], [5,5,10]
- +8: iki rulo dağılımları (üst sınırlara uyar)
- +12/+16: [15,10,5]

Örnek: Geç (3 alt stat) — SPD min=2, CR% min=1, CDMG% serbest, Gerekli=3
- +0/+4: [5,5,5]
- +8: [10,5,5] veya [5,10,5]
- +12: [15,5,5] veya [10,10,5]
- +16: [15,10,5]

İpucu: Bir statta ruloları yasaklamak için üst sınır kullanın. ★ durumunda sağ tıklayıp üst sınırı açın ve 0 yapın; böylece CDMG% temel değerde kalır, SPD/CR ruloları alır.

Örnek: Bir alt statı kilitle, ikisini iste
- Alt statlar: SPD, HP, ATK. SPD’ye basın ve kilit simgesini (🔒) açarak sabitleyin.
- Gerekli alt stat = 2.
- Sonuç: SPD+HP ve SPD+ATK satırları oluşur; SPD’siz HP+ATK gelmez (kilitlenen statlar hep dahil).

Örnek: 3 statta ruloları topla, 4.’yü kapat
- Hedef: SPD, CR%, CDMG% ve HP%/ATK%/DEF%’ten biri olsun, ama bu dördüncü statta rulo olmasın.
- Alt statlar: SPD, CR%, CDMG%, HP%, ATK%, DEF%.
- Gerekli alt stat = 4.
- Göstergeler:
  - ★ → sol tık (minimum): SPD/CR%/CDMG% için hedef minimumları ayarlayın (ör. 1).
  - ★ → sağ tık (üst sınır): HP%/ATK%/DEF% için üst sınırı 0 yapın.
- Sonuç: Dördüncü stat üçlü arasında döner ama rulo almaz; SPD/CR%/CDMG% ruloları paylaşır.

Örnek: Jokerli Erken (yalnızca seçilenler)
- Alt statlar: SPD ve ACC.
- Göstergeler: SPD min = 2; ACC = ★.
- Gerekli alt stat: Oto (2).
- Seviyeler: +0 ila +16.
- Etki: Erken, SPD(2)’ye +16’da ulaşabilecek eşyaları gösterir (SPD veya ACC rulo aldığında). SPD’de iki rulo mümkün olduğunda SPD minimum satırı görünür.

Örnek: Jokerlerle toplam rulo (2 alt stat)
- Alt statlar: SPD ve ACC, ikisi de ★.
- Gerekli alt stat: 2. Minimum rulo: 1.
- Erken:
  - +4/+8/+12/+16: iki satır — SPD ≥ 10, ACC ≥ 9 ve SPD ≥ 5, ACC ≥ 18 (minimal dağılımlar; kararlı).
- Geç:
  - +0/+4/+8/+12: yalnızca temel satırlar; +16: yukarıdaki iki satır. Minimum daha yüksekse Geç uygun seviyelerde gerekli bölünmeleri zorunlu kılar (örneğin min 2 → +12’de tek rulo dağılımı, +16’da çift rulo dağılımı).

## Katkıda bulunmak isteyenler için notlar

- Çeviriler: Yayın paketleri `i18n/` altında yerelleştirme şablonları içerir (örn. `i18n/tr-TR.l10n.json`).
- Düzenle ve test et: Uygulamayı açıp düzenlediğin `*.l10n.json` dosyasını üzerine sürükleyerek anlık oturumda hemen uygula (herhangi bir kurulum gerekmez veya yapılamaz).
- Düzeltme gönder: Güncellenmiş JSON’u Discord mesajı olarak gönder. Anahtarları değiştirme; eksik anahtarlar İngilizceye geri döner.
- Yerleşik diller: Gönderilen tüm diller tek HTML dosyasına derlenir, bu yüzden uygulama tamamen çevrimdışı çalışır. Düzeltmelerin bir sonraki sürüme eklenir.

## Teşekkürler

Değerli katkıları için **[STBL] Nasgor**’a,  
Sellfile’ları için **[SP] Panda**’ya,  
ekipman temizliği videoları için **[IPЯ] KruYseN**’e,  
ve elbette RSL Helper için **Farbstoff**’a teşekkürler!

## Yazar
Hazırlayan [STBL] Nusi㊷  
Yerelleştirme Codex
