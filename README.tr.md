# Sellfile Creator for RSL Helper

Sellfile Creator, RSL Helper için satış dosyaları oluşturmayı kolaylaştırır — set, yuva, ana stat, alt statlar ve daha fazlasına göre ekipman filtreleri tanımlayın, eşleşen sonuçları canlı önizleyin ve hazır satış dosyalarını saniyeler içinde dışa aktarın.

> Bu araç hayranlar tarafından geliştirildi. Plarium, Raid: Shadow Legends veya RSL Helper ile bağlantılı değildir. Bahsi geçen tüm ticari markalar sahiplerine aittir.

## Özellikler

- **Tarif oluşturucu** — slot, set, yıldız, nadirlik, ana stat, alt statlar (minimum rulo
  sayıları ve hedef değerler), fraksiyon ve seviye kilometre taşları filtreli adlandırılmış
  sakla/sat tarifleri oluşturun. Yeniden kullanılabilir bir kütüphane oluşturun ve tek
  tıkla RSL Helper satış dosyası (`.hsf`) olarak dışa aktarın.
- **Sellfile önizlemesi** — dışa aktarmadan önce oluşturulan RSL Helper satış dosyasını
  Önizleme sekmesinde görüntüleyin.
- **Metasetler** — ekipman setlerini (örn. Hız + Algı) adlandırılmış koleksiyonlarda
  gruplandırın ve tariflerde ve korumalarda yeniden kullanın.
- **Ekipman denetçisi** — gerçek zamanlı senkronizasyon için RSL Helper'a bağlanın veya her tarifin hangi öğelerle eşleştiğini görmek için bir `.db` dosyası yükleyin.
- **Ekipman Farkı** — tarifleri ayarlarken veya dinamik geçersiz kılmaları denerken hangi parçaların *sakla* ile *sat* arasında geçtiğini tam olarak görmek için bir önce/sonra görünümü açın. Bir çip güncel toplamları gösterir; yan yana bir liste değişen her parçayı gösterir.
- **Zindan simülatörü** — farming yaparken veya ekipman geliştirirken satış dosyanızın
  etkisini doğrulamak için çeşitli zorluk ve yükseltme seviyelerinde Ateş Şövalyesi,
  Ejderha ve Buz Golemi için saklama olasılığı yüzdelerini görün.
- **Korumalar** — asla kaybetmek istemediğiniz slot/set/stat kombinasyonlarını tanımlayın;
  tarayıcı, kurulumunuz korunan bir kombinasyonu kotasının altına düşüreceğinde satış
  dosyasına otomatik olarak saklama kuralları ekler.
- **Ekipman Analizi** — KPI kartları, çapraz filtre grafikleri (slot, yıldız, nadirlik,
  kaynak, seviye), bir set ağaç haritası, ana stat çubukları ve alt stat radarı içeren
  analitik gösterge paneli. Diğerlerini filtrelemek için herhangi bir grafiğe tıklayın;
  aktif filtreyi doğrudan Ekipman denetçisine gönderin.
- **Nihai satış** — tek bir düğme, ayarlanabilir seviye aralıklarında eşleşmeyen ekipman
  için yedek satış kuralları ekleyerek hiçbir şeyin gözden kaçmamasını sağlar.
- **Temalar** — koyu ve açık mod arasında geçiş yapın, yerleşik tema düzenleyiciyle
  renkleri ve köşe yarıçapını özelleştirin veya renk körü dostu bir paleti etkinleştirin.

## Nasıl kullanılır

### Reçete dosyası
- SFC (`.sfc`): Uygulamanın proje dosyası. Yükleyip paylaşabileceğiniz bir kayıt dosyası gibi düşünün. RSL Helper SFC’yi doğrudan okumaz.
- HSF (`.hsf`): RSL Helper’ın tükettiği Sellfile. Buradan dışa aktarın ve RSL Helper’a yükleyin.
- Varsayılan kayıt adı: `SellfileCreatorRecipes_YYYYMMDD_HHMM.sfc`.

### Reçete Oluşturucu
- Reçete Oluşturucu alanlarını doldurun ve reçeteye net bir isim verin.
- «Yeni reçete olarak ekle» seçeneğiyle kaydedin. Ardından oluşturucunun altındaki listeden seçip «Seçili reçeteyi güncelle» ile değişiklikleri kaydedin.
- Yükle/Kaydet: «Reçeteleri yükle» ve «Reçeteleri kaydet» işlemleri önizlemeyi yeniden oluşturmak için gereken her şeyi saklar.
  - **SFC Dosyası Yükle** yanındaki chevron (▾) bu menüyü açar: **Dosyadan yükle…** her zamanki gibi dosya seçiciyi açar; **Ön Ayarı Yükle: Başlangıç** veya **Ön Ayarı Yükle: Orta Oyundan Son Oyuna** onay istendikten sonra yerleşik ön ayarlardan birini yükler (mevcut kurulumunuz değiştirilecektir).
- Reset/Insert/Apply menüleri: Reset, «Reçete olarak ekle» veya «Reçete olarak uygula» seçeneklerine sağ tıklayarak ortak menüyü aç. Mevcut oluşturucu durumunu varsayılan şablon olarak kaydet, fabrika varsayılanlarına geri dön, «Eklendikten sonra otomatik sıfırla» seçeneğini açarak ekledikten hemen sonra alanları temizle veya «Seçili reçeteye otomatik uygula»yı açarak ~400 ms hareketsizlikten sonra düzenlemeleri vurgulanan reçeteye işle. Auto reset ve Auto apply aynı anda açık kalamaz — biri açıldığında diğeri kapanır — ve tercihlerin her ikisi de oturumlar arasında saklanır.
- Not: «Not ekle…» / «Not düzenle…» reçete dosyasına not ekler. Not içeren dosyayı yüklediğinizde otomatik gösterilir. `<!-- recipes:1,0 -->` belirli reçete çiplerini ekler (0 bir sonrakini seçer). `<!-- recipes-re:"speed" -->` adı desene uyan tüm reçeteleri gösterir (büyük/küçük harf duyarsızdır). `<!-- dungeon-simulator -->` ekleyerek Feuerritter, Ejderha ve Buz Golem için üç zorluk aşaması (N20/N25/H10) ve iki güçlendirme modu genelinde canlı keep-chance tablosu görüntüleyin; +0/+4/+8/+12/+16 seviyelerindeki keep oranlarını gösterir. `<!-- recipe-overrides [columns=N] -->` ekleyerek oturum süresince reçetelerin dışa aktarım modlarını ve ayarlarını geçersiz kılan etkileşimli soru kartları (radyo/onay kutusu grupları) yerleştirin — saklanan reçeteler hiçbir zaman değiştirilmez. `<!-- safeguard-overrides [columns=N] -->` ekleyerek oturum süresince koruma özelliklerini (sayı, etkinleştirme, alt istatistikler, iyileştirme şansı ve daha fazlası) geçersiz kılan kaydırıcı ve seçenek kartları yerleştirin — saklanan korumalar hiçbir zaman değiştirilmez. Bu işaretçilerden biri mevcut olduğunda, not altbilgisi **Dinamik geçersiz kılmaları devre dışı bırak / etkinleştir** düğmesini ve **Seçenekleri Sıfırla** düğmesini gösterir. Geçerli yanıtları bir adla kaydetmek için «Dinamik geçersiz kılmalar» menüsündeki **Geçerli Seçimi Kaydet…** seçeneğini kullan — kayıtlı geçersiz kılma setleri aynı menüde görünür ve tek tıklamayla yüklenebilir. Yalnızca geçerli notta bulunan seçimler kaydedilir; bir set yüklenirken artık mevcut olmayan sorular atlanır.
- Autosave geri yükleme: Uygulama açıldığında iletişim kutusu her autosave bölümünü kendi onay kutusuyla listeler. Yalnızca ihtiyacın olanı geri yükle — reçeteler (seçili çip dahil), metasetler, Alt stat hedef değerleri, Final satış bakiyesi, sabitlenmiş not, filtre paneli (açık/kapalı durumu, çipler, daraltılmış bölümler) ve Ekipman Denetçisi kuyruğu. Kutuyu boş bırakırsan mevcut çalışman aynen kalır. Autosave ayrıca hangi Final satış anahtarlarının (Artefaktlar, Aksesuarlar ve seviye aralıkları) açık olduğunu hatırlar, bu yüzden Araçlar tekrar açıldığında son dışa aktarmanın birebir kopyasını görürsün.

### Oluşturucu düzeni (yukarıdan aşağıya)
- Eylem ve Etkin: Bir eşya reçeteyle eşleştiğinde ne olacağını tanımlar.
  - `Koru` eşyayı Koru olarak işaretler; RSL Helper dokunmaz.
  - `Sat` eşyayı Sat olarak işaretler; RSL Helper satışı sıraya koyar.
  - «Sellfile içinde etkin» anahtarı, dışa aktarılan satırların aktif kalıp kalmayacağını belirler. Kapalı reçeteler önizlemede üstü çizili görünür ve RSL Helper’da etkisi olmaz; tamamen hariç tutmak isterseniz dışa aktarma menüsünden «Dışa aktarırken devre dışı kuralları atla» seçeneğini açın.
- Rütbe: 6★ ekipmanı 5★’dan farklı ele almak istiyorsanız kuralı belirli yıldız rütbeleriyle sınırlandırın. `Herhangi` tüm rütbeleri kapsar.
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
- Faksiyon: Belirli bir takım için aksesuar topluyorsanız kuralı o faksiyonla sınırlandırın. Yüzük, Muska ve Sancak filtreye uyar; zırh faksiyon görmez, bu yüzden `Herhangi` güvenlidir.
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
- Kilitli Minimum rulolar (🔒) en az bir alt stat kilitliyken görünür. Kilit satırındaki sayılara tıklayarak yalnızca kilitli statlar için ayrılacak rulo sayısını belirle; oluşturucunun geri kalanı global minimumu izlemeye devam eder. Kilit değeri vurgulanan global sayıya eşit veya ondan yüksek olduğunda global rozet temizlenir ve tek taban olarak kilit kalır. Stati kilitten çıkarmak (veya Auto’ya dokunmak) her iki rozeti de temizler; globalde daha küçük bir sayı seçmek iki rozeti yeniden açar ve hangi tabanın hangi statlara uygulandığını gösterir.
- Örnek: SPD ve CR% statlarını kilitle, Minimum ruloları = 3 yap ve 🔒 satırını 2’ye ayarla. Oluşturucu toplamda 3 rulo ister; bunların en az 2 tanesi kilitli SPD/CR% seçimlerine gitmelidir. Kilit = 3 olduğunda global rozet otomatik olarak söner çünkü iki taban aynı olur.
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
- Oluşturucunun sağ üst köşesindeki «Alt stat hedefleri…» düğmesi, Araçlar diyaloğundaki **Alt stat hedefleri** sekmesini açar.
- Hedefler globaldir; tüm reçetelere uygulanır.
- Bu hedefler seviye aralıklarına göre (0–3, 4–7, 8–11, 12–15, 16) kullanılan eşikleri belirler ve Rulo hedefleri ızgarası için geri dönüş değeri sağlar.
- «Varsayılanlara döndür» önerilen hedefleri geri yükler.

### Metasetler
- «Metasetleri yönet…» diyaloğunu açın.
- Metaset ekleyin/yeniden adlandırın ve kapsadıkları setleri seçin. Arayüz set seçicisiyle aynıdır.
- Başlangıç metasetleri sunulur; istediğiniz zaman düzenleyebilir veya silebilirsiniz.
- «Varsayılanlara döndür» kullanımdaki metasetler için güvenli seçenekler sunar (sil, açık setlerle değiştir, başka bir metasetle değiştir).

### Final satış
- Önizleme başlığındaki `Final satış` anahtarını kullanarak kalan eşyalar için satış kuralları ekleyin. Etiket değişmez; kehribar dolgulu durum aktif olduğunu, nötr kenarlık ise kapalı olduğunu gösterir.
- Anahtarın yanındaki “Araçlar” düğmesine tıklayarak `Final satış` sekmesini açın ve Artefakt/Aksesuar kapsamını ile hangi seviye aralıklarının (0–3, 4–7, 8–11, 12–15, 16) açık olacağını seçin. Varsayılan 0–15’tir; `+16` yalnızca sekmede açtığınızda satılır.
- `Final satış` kapalıysa, hiçbir kurala uymayan eşyalar otomatik olarak korunur. Satış yalnızca açık bir Sat kuralı eşleştiğinde olur.
- `Final satış` açıkken üretilen Sat kuralları tüm bilinen setleri içerir. Önizleme «Tüm bilinen setler» der; dışa aktarılan dosya yine her seti tek tek listeler.

### Benzersizleri Koru
- Oluşturucu panelinin üzerindeki geçiş düğmesini kullanarak oluşturucuyu Benzersizleri Koru moduna alın; kaybetmek istemediğiniz kombinasyonları burada işaretleyin. `Benzersizleri Koru` anahtarını açarak tarayıcının Koru satırları eklemesini sağlayın (bir kuralı düzenlemek de otomatik olarak etkinleştirir).
- Benzersizleri Koru kuralları öğeleri “tüketmez”; her kural aynı aday havuzunu değerlendirir. Bir parça birden fazla kurala uyuyorsa hepsinde sayılır.
- Her kural slot, set veya metaset, rank, nadirlik, ana stat ve (aksesuarlar için) fraksiyon seçmenize izin verir. Boş bırakmak “herhangi” anlamına gelir.
- `Mod`, kuralın nasıl dışa aktarıldığını belirler: `Kapalı` kuralı devre dışı bırakır, `Var olanı koru` kotaya ulaşana kadar satılacak eşleşmeler için Koru satırları ekler, `Açıkları öngör` ise eksik kombinasyonlar için geçici Koru kuralları da üretir; böylece DB güncellenene kadar yeni düşenler korunur.
- Alt statlar isteğe bağlıdır: bir veya birkaçını seçerek yalnızca bu alt statlara sahip eşyaları sayarsınız. Eşleşme çipi (`Herhangi bir Alt Stat` / `Tüm Alt Statlar` / `Alt Stat başına`) en az birinin mi, hepsinin mi gerektiğini veya her alt stat için ayrı kota uygulanacağını belirler. Boş bırakmak alt stat filtresi olmaması demektir.
- Seçili alt statlar her zaman normalize formüle göre sıralanır (glifler yok sayılır); ağırlık kontrolleri `Herhangi bir Alt Stat` ve `Tüm Alt Statlar` ile görünür, `Alt Stat başına` eşit ağırlıkta kalır (eşik değerinde eşitlikler korunur).
- `Rütbeye göre ağırlık` (`Ana stat başına` yanındaki çip) daha yüksek rütbeli eşyaya puan avantajı verir — yalnızca **ana istatistikte**: 6★ tam, 5★ yaklaşık %85 sayılır. Böylece bir 6★, alt istatleri yalnızca biraz daha iyi olan aynı ana istatlı bir 5★'ı geçer. Sadece aynı ana istat içindeki sıralamayı keskinleştirir (daha yüksek rütbeli her parça için genel bir bonus değildir) ve ana istatı maksimum seviyedeki değeriyle kullanır; bu yüzden seviye atlatmak puanı asla değiştirmez. En az bir alt istat seçili olmalıdır; yeni kurallarda varsayılan olarak açıktır. Her parça, kendi slotunun ve ana istatistiğinin en iyisiyle karşılaştırılır.
- `≥ Gerekli adet` uygulamanın size verdiği sözdür. Rank ve Nadirlik dışındaki her seçicinin altındaki kapsam çipleri (`Koruma başına`, `Slot başına`, `Set başına`, `Fraksiyon başına`, `Ana stat başına`) bu kotanın nasıl paylaşıldığını belirler; hepsini kapatırsanız paylaşım otomatik olarak `Koruma başına` havuzuna döner.
- `Gerekli adet` bilgi ipucu aktif kapsam bölmesini (`X slot başına × set başına × ...`) ve basit bir eksik satırını (`({missing} eksik)`) gösterir.
- Tarayıcı, yalnızca bir kuralı karşılayan ve aksi hâlde satılacak eşyalar için Koru satırları ekler; bu da yalnızca kota karşılanmadığında olur. `Açıkları öngör` modunda eksik kombinasyonlar için geçici kurallar eklenir.
- **Yoksay seçenekleri** (kuralın etkinleştirme anahtarının yanındaki çipler) her kuralın neyi saydığını ince ayarlar:
  - `Önceki korumaları yoksay` – koruma adayları alt statlara göre sıraladığında, önceki korumaların zaten tuttuğu eşyaları havuzundan çıkarır ve onların yerine bir sonraki en iyi seçenekleri alır. Genel bir korumadan sonra ikinci bir SPD/CR koruması eklediğinizde ve onun aynı parçaları yeniden korumak yerine puan sıralamasında daha aşağıya inmesini istediğinizde işe yarar. Alt statı olmayan korumalar etkilenmez. Varsayılan: kapalı.
  - `Kuşanılmışları yoksay (Koleksiyon)` – şu anda koleksiyon kahramanlarında kuşanılı olan eşyaları bu kuralın eşleşme sayacından dışlar, böylece kotayı karşılamazlar. Varsayılan: kapalı.
  - `Kuşanılmışları yoksay (Kasada)` – aynı mantık, ama kasadaki kahramanlar için. Varsayılan: kapalı.
- **`İyileştirme şansı ≥ N%`** (isteğe bağlı yetenek avcısı): standart top-N'nin ötesinde güvenlik ağını genişletir. Tarayıcı her zaman önce **mevcut** alt stat değerine göre top-N parçaları korur — bunlar hiçbir zaman tehlikede değildir. Ayrıca bu top-N'nin *dışındaki*, iyileştirme şansı eşiği karşılayan her parçayı da korur. Fikir şudur: «seviyeye getirildiklerinde rekabetçi olma ihtimali yüksek ham dropları elde tutmak».

  **İyileştirme şansı nedir?** Uygulama, bir parçanın +16'ya yükseltilirken tüm olası atış yollarını simüle eder — bazı atışlar önemsediğiniz alt stata isabet eder, bazıları etmez — ve parçanın tüm bu geleceklerde kaç kez top N'e girdiğini sayar. %68 iyileştirme şansına sahip bir parça, simüle edilen yükseltme yollarının yaklaşık ikisinde top N'e girer.

  **İyileştirme şansı bir *tahmindir*, gear’ı asıl koruyan kural değildir — bunlar iki ayrı sistemdir.** Bu çoğu kişiyi yanıltıyor, o yüzden net olalım:

  - Safeguard, **her zaman top-N parçaları *şu anki* alt stat değerlerine göre tutar**. Bir parçayı asıl koruyan şey, bu güncel değere göre sıralamadır.
  - İyileştirme şansı *farklı* bir soruyu yanıtlar: «her şey +16’ya yükseltildiğinde bu parça hâlâ en iyilerimden biri olacak mı?». **Hem parçayı hem rakiplerini +16’daki öngörülen değerlerine göre** puanlar ve parçanın kaç kez top N’e girdiğini sayar.

  Farklı sorular sordukları için ikisi çelişebilir — bu beklenen bir durumdur, hata değildir:

  - Bir parça **%0 iyileştirme şansı gösterip yine de korunabilir.** *Bugün* en iyilerinden biridir (bu yüzden güncel değere göre top-N onu tutar), ama simülasyon, hâlâ yükseltilmekte olan rakiplerin +16’ya kadar onu geçmesini bekler (yani *gelecekteki* top-N şansı ~%0’dır). Bir parçayı güncel top-N’e sokan tek bir iyi atış onu anında korur — bu sırada iyileştirme şansı baştan sona %0 kalabilir, çünkü onu koruyan şey hiçbir zaman o sayı değildi.
  - Bir parça **yüksek iyileştirme şansı gösterip yine de (henüz) korunmuyor olabilir.** Güncel top-N’de olmayan, umut vaat eden ham bir drop’tur: yalnızca aşağıdaki eşiği açarsanız tutulur.

  **Temel kural: eşik yalnızca korumaya ekleme yapabilir, asla çıkarma yapamaz.** Mevcut top-N'niz iyileştirme şansı puanından bağımsız olarak her zaman korunur. Tamamen yükseltilmiş bir parça (+16) mevcut sabit değerini doğrudan sayar — «yükseltme potansiyelini tüketti» diye korumadan çıkarılamaz.

  **Örnek — SPD bayrakları, Gerekli Sayı = 2, Fraksiyona göre (rank-6 efsanevi):**

  | Bayrak | SPD | Seviye | İyileştirme şansı | Standart | Eşik ≥ %50 | Eşik ≥ %25 |
  | --- | --- | --- | --- | --- | --- | --- |
  | A | 12 | +16 | %100 | ✔ top-2 | ✔ top-2 | ✔ top-2 |
  | B | 6 | +16 | %0 | ✔ top-2 | ✔ top-2 | ✔ top-2 |
  | C | 5 | +0 | %26 | ✗ satıldı | ✗ satıldı | ✔ eşik ekler |

  Rank-6 bayraklar SPD'yi olay başına **5 veya 6** artırır; bu nedenle taze haldeki tek gerçekçi değerler **5** (minimum) veya **6** (maksimum)'dur. Bayrağın SPD=12 olması, yükseltmeler sırasında tam olarak bir bonus SPD atışı aldığı anlamına gelir (6 başlangıç + 6'lık 1 atış). Bayrak B, bonus SPD atışı olmadan tamamen seviye atlatılmıştır — puanı 6'da kilitlidir.

  Bayrak B %0 iyileştirme şansı alır: sabit SPD=6'sının, gelecekteki atışları onu geçebilecek herhangi bir seviyesiz rakibe yenilmesi beklenir. Buna rağmen korunmaya devam eder çünkü **mevcut** değere göre standart top-2'dedir. İyileştirme şansı hiçbir zaman top-N'den öğe çıkaramaz — bunu yalnızca eşik genişleme mantığı kullanır.

  Bayrak C (SPD=5, taze), mevcut değere göre top-2'nin hemen dışındadır. %26 iyileştirme şansı, simüle edilen yükseltme yollarının yaklaşık 1'inde top-2'ye gireceği anlamına gelir. Eşik ≥ **%25** ile koruma altına alınır; eşik ≥ %50 ile satılmaya devam eder.

  Bayrak C **SPD=6** ile başlamış olsaydı, iyileştirme şansı **%68**'e yükselirdi — çok daha güçlü bir aday. Eşik ≥ **%65** onu korurdu.

  **Rank-6 epic bayraklar** yalnızca **3 SPD atış olayı** alır (efsanevi için 4'e karşı, çünkü +4 yükseltme mevcut bir alt stata atış yapmak yerine yeni bir alt stat ekler). Ortaya çıkan şanslar neredeyse aynıdır: SPD=6 taze → **%70**, SPD=5 taze → **%26**.

  **Önerilen eşikler (rank-6 ekipman):**
  - **%65** — maksimum atışlı taze dropları korur (SPD=6, ~%68–70 şans). Gelecek vaat eden dropların seviye atlatılırken hayatta kalmasını istiyorsanız iyi bir varsayılan.
  - **%25** — minimum atışlı dropları da korur (SPD=5, ~%26 şans). Daha geniş ağ; envanter alanı sorun değilse kullanın.
  - **%100'den kaçının**: yalnızca zaten standart top-N tarafından tutulan tam seviyeli parçalarla eşleşir, bu nedenle standart moda göre hiçbir şey eklemez.

Kapsam çiplerini üst üste koymak kimin kendi kotasını alacağını değiştirir. Tek havuz için `Koruma başına` açık bırakın; `Slot başına`, `Set başına`, `Fraksiyon başına` ve `Ana stat başına` düğmelerini katmanlayarak Slot × Set × Fraksiyon × Ana stat karışımlarını bağımsız takip edebilirsiniz.

#### Kota kapsamları bir bakışta
| Kapsam düğmesi | Kota davranışı | Ne zaman parlıyor |
| --- | --- | --- |
| `Koruma başına` | Tüm koruma tek bir havuza bağlı kalır. | Setten bağımsız olarak beş SPD botunu koruyun. |
| `Slot başına` | Her slot için kotayı yeniden üretir. | Yüzük, muska ve sancağı ikişer tane ayrı ayrı saklayın. |
| `Set başına` | Karttaki her set/metaset için havuzu kopyalar. | Stoneskin ve Protection düşüşlerini ayrı sayın. |
| `Fraksiyon başına` | Her fraksiyon kendi kotasına sahip olur. | Her fraksiyon için üç Merciless yüzük bırakın. |
| `Ana stat başına` | Seçili ana statların her biri kendi havuzuna sahip olur. | ACC ve RES sancakları farklı kotalarda takip edin. |

#### Gerçek dünyadan örnekler
| Senaryo | Filtreler | Gerekli adet | Kapsam düğmeleri | Tarayıcının garantisi |
| --- | --- | --- | --- | --- |
| SPD botlar tükeniyor | Slot = Botlar, Ana stat = SPD, Setler boş | `5` | `Koruma başına` | Hangi set olursa olsun en az beş SPD botu kalır. |
| Savage + Lethal eldivenleri karıştırmak | Slot = Eldiven, Set = Savage + Lethal, Ana stat = CDMG% | `3` | `Koruma başına` | Set karışımı değişse bile üç yüksek hasar eldiveni korunur. |
| Fraksiyon başına Merciless yüzük | Slot = Yüzük, Set = Merciless, Fraksiyon boş | `3` | `Fraksiyon başına` | Her fraksiyon kendi üç Merciless yüzüğünü tutar. |
| Fraksiyon başına HP% yüzük | Slot = Yüzük, Ana stat = HP%, Setler boş | `2` | `Fraksiyon başına` | Her fraksiyon ikişer HP% yüzük saklar. |
| Çekirdek aksesuarlar fraksiyon başına | Üç kural (Yüzük, Muska, Sancak), Set/Ana stat boş | `5` | `Fraksiyon başına` | Her fraksiyon her aksesuar slotunda beşer parça bırakır. |
| Stoneskin + Protection aksesuarları | Slot = Yüzük/Muska/Sancak, Set = Stoneskin + Protection, Ana stat boş | `2` | `Set başına` + `Fraksiyon başına` + `Slot başına` | Her fraksiyon her aksesuar slotu için iki Stoneskin ve iki Protection parça tutar. |
| En hızlı SPD aksesuarları | Slot = Yüzük/Muska/Sancak, Alt statlar = SPD | `5` | `Koruma başına` | Aksesuarlarındaki en iyi beş SPD rollarını korur (eşitlikler dahil). |
| SPD’li ACC sancakları | Slot = Sancak, Ana stat = ACC, Alt statlar = SPD + ACC, Ağırlıklar: SPD daha yüksek | `3` | `Fraksiyon başına` | Her fraksiyon SPD’nin daha önemli olduğu en iyi ACC sancaklarını tutar. |

İpucu: “Benzersizleri Koru” sekmesini açmadan önce `.db` içe aktarın veya Ekipman diyaloğunda eşya ekleyin ki tarayıcı gerçek veriyi görsün. Bir kural kartına tıklayın; eşleşen eşyalar vurgulanır. `Filtre`yi `Seçim`e alarak sadece bu eşleşmeleri görürsünüz.

### Zindan Düşüşleri (Simülatör)
Araçlar’ı açıp **Zindan Düşüşleri** sekmesine geçin. Mevcut Sellfile kurallarınızla zindan farmını simüle eder; set ve seviye adımına göre ne kadar ekipman tutacağınızı gösterir.

- Bir zindan ve aşama seçin.
- Simülasyon modu:
  - `Seviye yükseltme`: roll’lar, eşya satılacak noktaya geldiğinde durur; bu yüzden gerçek seviyeleme ile uyumludur.
  - `Anlık görüntü`: roll’lar her zaman +16’ya kadar gider, eşya daha önce satılacak olsa bile.
- Tablo, o aşamadaki tüm düşüşlere göre tutulan düşüş oranını +0 / +4 / +8 / +12 / +16 için gösterir.
- Bir hücreye tıklayıp slot + ana stat dökümünü görün, sonra **Belirli alt stat olasılıkları** ile tam olasılıkları ve koşu tahminlerini açın.

Notlar:
- Mevcut Tut/Sat kurallarınızı kullanır; Nihai satış ve Benzersizleri Koru dahildir.
- Her aşama için yaklaşık 100.000 düşüş çalıştırır ve çalışırken günceller.
- Düşüş oranları ve roll’lar simülasyondur; sayılar tahmindir.

### Ekipman Analizi
Araçlar'ı açıp **Ekipman Analizi** sekmesine geçin — içe aktarılan ekipmanınızın analitik görünümü.

**KPI Kartları (üst satır):** Sekiz yüzde kartı — **6★ Oranı**, **Efsanevi+**, **Maksimum (+16)**, **Giyili**, **Kasaya Kilitli**, **Chaos'd**, **Glyphed**, **Yükselmiş** — her biri tooltip ile gösterilir.

**Çapraz filtreli donutlar:** Altı grafik — **Yuvalar**, **Derece**, **Nadirlik**, **Sonuç**, **Kaynak**, **Seviye** — tıklandığında birbirini günceller.
- Bir dilime tıklayarak o boyut için filtre ekleyin; diğer tüm grafikler anında eşleşen ekipmanı gösterir. Her grafik kendi boyutunu dışarıda bırakır; bu sayede her zaman tam aralığını gösterir.
- **Yuvalar** donutundaki bir dilime çift tıklamak tüm bir grubu seçer: herhangi bir zırh parçası (Silah, Miğfer, Kalkan, Eldiven, Zırh, Çizme) altı zırh yuvasını seçer; herhangi bir aksesuar (Yüzük, Muska, Sancak) üçünü birden seçer.
- **Yuvalar** ve **Kaynak** donutları kategori ikonları gösterir. **Seviye** donutu her arkı seviye metniyle etiketler.


**Setler Treemap'ı:** Donutların altında görüntülenir. Her karo bir ekipman setini temsil eder; karo alanı öğe sayısıyla orantılıdır. Karo arka planı soldan sağa sonuç renk bantlarına bölünmüştür (Sat / Korunmuş / Sakla / Eşleşme yok). Bir karoya tıklayarak o seti çapraz filtre olarak ekleyin.

**Filtre rozetleri:** Her boyutun etkin seçimleri donutların altında rozetler olarak görünür; bir rozetteki sil ikonuna tıklayarak yalnızca o filtreyi kaldırın. Ana stat seçimleri de rozet olarak görünür. **Filtreleri temizle** düğmesi tüm boyutları aynı anda sıfırlar.

**Ana Stat Çubuğu:** Filtrelenmiş ekipmanda her ana statın ne sıklıkla göründüğünü gösterir. Bir çubuğa tıklayarak ayrıntıya inin — Alt stat sıklık grafiği yalnızca o ana stat seçili ekipmanın alt statlarını gösterecek şekilde güncellenir. Seçimi kaldırmak için tekrar tıklayın.

**İyileştirme Şansı:** Ekipmanınızın iyileşme olasılığı, %10'luk adımlar halinde gruplandırılır. Sağdaki sayı her grupta kaç eşya bulunduğunu gösterir. Koruması olmayan ekipman ve sonuna gelmiş +16 ekipman dahil edilmez. Yalnızca o grubu göstermek için bir gruba tıklayın.

**Alt Stat Sıklık Radarı:** Filtrelenmiş (ve isteğe bağlı olarak ana stata göre sınırlı) ekipmanda her alt statın ne sıklıkla göründüğünü örümcek grafik olarak gösterir. Ortak oluşum pivotu olarak seçmek için bir eksen işaretine tıklayın — radar aynı anda seçilen tüm alt statları içeren ekipmanla kısıtlanır (en fazla 4 pivot). Aktif pivotlar grafiğin altında rozetler olarak görünür; × birini kaldırır, **Filtreleri temizle** hepsini kaldırır.

**Yuva × Ana Stat Isı Haritası:** Yuva (sütunlar) × ana stat (satırlar) başına öğe sayısı. Sütun başlığına veya bir hücreye tıklayarak o yuvaya göre filtreleyin.

**Şampiyon İstatistikleri Sekmesi:** Şampiyon başına giyili parçalar üzerinden toplam alt stat değerleri. Konuma göre filtreleyin (**Tümü** / **Koleksiyon** / **Kasa**), **Tam giyili** öğesini açıp glifleri dahil edin veya hariç tutun. Min/Ort/Medyan/Maks serilerini gösterir.

**Şampiyon ekipmanı:** Şampiyon başına ekipman yuvası kapsamı, iki kompakt tablo (**Koleksiyon** / **Kasa**) halinde. Her satır 3×3 yuva ızgarası gösterir (dolu = takılı, ana hat = boş, kesik çizgi = ascensiona kadar kilitli). Dolu bir yuvaya tıklayarak o parçayı seçin — seçim Ekipman İnceleyicisi ile paylaşılır. **Satışı simüle et** ile satılacak ekipmanın bulunduğu yuvaları kırmızıyla boyayıp eksik olarak sayabilir, veya **Tam donanımı göster** ile tüm yuvaları dolu olan şampiyonları da listeleyebilirsiniz.

**Düğmeler:**
- **Anlık görüntü kopyala:** Analitik görünümün tamamını PNG olarak render eder ve panoya kopyalar. Not: Şampiyon ekipmanı bölümü anlık görüntüye dahil edilmez.
- **Ekipman Denetçisi'ne uygula:** Etkin çapraz filtreyi Ekipman Denetçisi liste filtresine gönderir (yalnızca filtre etkinken görünür).

### Reçete yönetimi
- Kaydedilen reçete listesi: Her reçete oluşturucunun altında küçük bir etiket olarak görünür. Sol tık seçer, çoğaltmak/yeniden sıralamak/silmek için sağ tık menülerini kullanabilirsin; «Reçeteleri sil» düğmesi tüm listeyi (onay isteyerek) kaldırır.
- Hover bağlantısı: Bir etiketin üzerine gelmek Sellfile Önizleme tablosunda o reçeteden gelen her satırı vurgular; tablodaki satırın üzerine gelmek de listede ilgili etiketi aydınlatır.
- Tıklama bağlantısı: Sellfile tablosundaki satıra tıklamak onun bağlı olduğu reçeteyi seçer ve oluşturucuya yükler. Baz `.hsf` satırları seçimi değiştirmez.
- Sağ tık menüleri: Her kaydedilmiş reçetede Duplicate/Move/Copy/Delete seçenekleri bulunur. Listenin boş alanındaki menü ise `Copy All` ve `Paste` kısayollarını paylaşır; böylece tüm reçeteleri tek hamlede panoya alabilir ya da toplu yapıştırabilirsiniz.
- Pano yedeği: Clipboard erişimi engellenirse içerik önceden seçili hâlde ayrı bir iletişim kutusunda açılır — `Ctrl/Cmd+C` ile kopyalayın veya `Paste` iletişim kutusuna yapıştırın.
- Reçeteler aç/kapat: Builder başlığındaki anahtar, tüm reçeteleri silmeden global olarak devre dışı bırakır ve önizleme pipeline'ını duraklatır — yalnızca koruma ihracatını hızlıca kontrol etmek veya Nihai Satış'ın tek başına ne ürettiğini görmek için kullanışlıdır.

### Sellfile önizlemesi (Rules & Ekipman Denetçisi)
- Önizleme başlığı `Rules`/`Ekipman Denetçisi` anahtarını, “Araçlar” düğmesini ve “Load RSL Helper Sellfile” düğmesini yan yana tutar; böylece tabloyu nereden değiştireceğinizi veya Ekipman diyaloğunu (Araçlar → Gear sekmesi) nereden açacağınızı her zaman bilirsiniz.
- `Rules` görünümü (varsayılan): Dışa aktarılacak tüm kuralları, yüklediğiniz isteğe bağlı baz `.hsf` satırları dahil gösterir. Başlıktaki sayaçlar Keep vs Sell dağılımında kalır; filtre satırı Slot/Rütbe/Nadirlik/Seviye için Herhangi/Yalnızca (`Any/Only`) çiplerini ve iki Reçeteler düğmesini birlikte gösterir: `Daralt` çip görünürlüğünü kontrol eder, `Seçim` ise seçtiğiniz çiplere göre Sellfile satırlarını gizleyen basit Açık/Kapalı düğmesi olarak çalışır ve Ekipman Denetçisi’ne geçmeden önce bile hazır kalır.
- `Ekipman Denetçisi` görünümü: Tabloyu içeri aktardığınız veya oluşturduğunuz öğelerin listesine çevirir, böylece Araçlar iletişim kutusunu yeniden açmadan inceleme yapabilirsiniz. Sayaçlar/rozetler Keep/Sell/Kapsam/Eşleşme yok kombinasyonuna, yani “ilk eşleşen reçete kazanır” kuralına göre geçer; filtre satırı ise `Daralt` ve `Seçim` düğmelerini korur. `Seçim` tri-state’i (`Off` → `İlk` → `Eşleşmeye göre`) bu görünümde Ekipman Denetçisi satırlarının İlk/Herhangi davranışını ayırır ve `Rules`’a döndüğünüzde de Sellfile satırlarını seçtiğiniz reçetelerle sınırlamaya devam eder. `.db` içe aktarmaları otomatik olarak bu görünüme geçer; istediğiniz zaman `Rules`’a dönebilirsiniz.
- “Load RSL Helper Sellfile” sürükle-bırak ile aynı yönlendirmeyi paylaşır: `.sfc` oluşturucuyu değiştirir, `.hsf` isteğe bağlı baz Sellfile olarak katmanlanır ve `.db` dosyaları Ekipman Denetçisi’ne kuyruklanır (reçetelere dokunmadan). “Clear” düğmesi baz `.hsf` katmanını kaldırır.
- Palet simgesini kullanarak alt stat etiketleri için metin/arka plan renklerini düzenleyin.
- `Rules` görünümünde tablo sütunları hâlâ “Idx” alanını içerir. `Ekipman Denetçisi` görünümünde bu alan yuva/set, eşya istatistikleri ve ilk eşleşen reçete rozetini gösterir; böylece her artefakta ne olacağını doğrudan önizleme içinde görebilirsiniz.

### Önizleme kontrolleri
- Renkleri yönet: Palet ikonunu kullanın; «Varsayılanlara döndür» önerilen renkleri geri yükler.
- Filtreler: Paneli açıp Reçete aramasına anında odaklanmak için `Ctrl+F` (`Cmd+F` macOS’ta) kısayolunu kullanın. Bir bölüm başlığını sağ tıklayın (veya simgesine `Ctrl`/`Cmd`+tıklayın) ve tüm bölümleri tek seferde daraltıp genişletin. `Daralt`, aktif filtreyle eşleşmeyen kayıtlı çipleri gizleyerek önizlemenin okunabilir kalmasını sağlar. `Seçim` tabloda hangi reçetelerin izinli olduğunu yönetir: `Rules` görünümünde basit bir Açık/Kapalı anahtardır, `Ekipman Denetçisi` görünümünde ise `Off` → `İlk` → `Eşleşmeye göre` döngüsünü izleyerek Ekipman Denetçisi satırlarını İlk/Herhangi davranışına göre ayırır.
- Sütun menüsü (başlığa sağ tık):
  - Sütunları sıfırla: Varsayılan sütunları ve genişlikleri geri getirir.
  - Genişlikleri uyarla: Sütunları pencere genişliğine göre ayarlar.
  - Çok satırlı satırlar: Satırlarda satır sonu kullanımını açar (alt statlar için faydalı).
  - Sütun göster/gizle: Her sütun için onay kutuları.
- Sütun sırası: Başlığı yatay sürükleyin.
- Sütun genişliği: Başlığın sağ kenarını sürükleyin.
- Tıklama davranışı: Tablo satırına tıklamak ilgili reçeteyi seçer (otomatik kaydırma yok). Bir reçete etiketine tıklamak tabloyu ilk eşleşen satıra kaydırır.

### Ekipman Denetçisi
- Sellfile Önizlemesi başlığındaki “Araçlar” düğmesine tıklayarak Ekipman diyaloğunu açın (Araçlar → Gear sekmesi). Örnek ekipman oluşturun veya satırları yapıştırın; öğeler anında önizlemeye senkronize edilir, bu yüzden iletişim kutusunu kapatmak Ekipman Denetçisi tablosunu temizlemez.
- RSL Helper'a bağlanarak gerçek zamanlı senkronizasyon sağlayın (önizleme başlığındaki Connect düğmesi) veya `.db` dosyalarını uygulamaya bırakın ya da “Load RSL Helper Sellfile” düğmesini kullanın.- Her Ekipman Denetçisi satırı yuva, set, seviye, ana stat, alt statlar (glifler ve rulolar dahil), kaynağı (envanter vs gelen kutusu) ve Keep/Sell ile ilk eşleşen reçete etiketlerini gösterir. Devre dışı kurallar asla eşleşmez; “No Match” satırları Sellfile’ın dokunmayacağı öğeleri temsil eder.
- Başlıktaki sayaçlar Keep/Sell/Kapsam/Eşleşme yok toplamlarını gösterir. Dört sonuç filtresi butonu — **Keep**, **Sell**, **Kapsam** ve **Eşleşme yok** — bağımsız birer anahtar gibi çalışır: listeyi daraltmak için herhangi bir kombinasyonu etkinleştirin. **Kapsam**, kurallarınızın satacağı bir parçayla aynı set+slot’u paylaşan öğeleri soldurur (ancak görünür tutar), böylece bir adayı rakipleriyle tek bir görünümde karşılaştırabilirsiniz. Bir veya daha fazla **Kaynak** da seçiliyse, bunlar referans küme olarak görev yapar — yalnızca seçili kaynaklardaki Satış etiketli öğeler birincil öğe olur; arkadaşlar ise *tüm* kaynaklardan alınır ve söz konusu ekipman parçasının nerede olduğundan bağımsız olarak her kopyasını görebilirsiniz. **Eşleşme yok**, hiçbir kuralın dokunmadığı ekipmanı gösterir – reçetelerinizdeki boşlukları tespit etmek için yararlıdır. Dışa aktarmadan önce edge case’lere odaklanmak için `Seçim` `Off`/`İlk`/`Eşleşmeye göre` anahtarıyla birleştirin.
- Önizleme anahtarını kullanarak kurallar tablosu ile Ekipman Denetçisi tablosu arasında Araçlar iletişim kutusunu yeniden açmadan gidip gelin; böylece üretilen satırları tetikleyen ekipmanla yan yana karşılaştırabilirsiniz.

- **Koruyucu Sırası katmanı:** ızgara menüsünde, her parçanın sıra çipinin neyi gösterdiğini değiştiren bir **Koruyucu Sırası** düğmesi vardır (güncel alt stat değerine göre; **#1** en iyisidir; yeşil = tutulur, kırmızı = satılırdı). **Kapalı** onu gizler; **Grup** parçanın kendi grubundaki sırasını gösterir — kuralın ayrı tuttuğu slot / set / fraksiyon / ana stat kapsamı (ör. **#2**); **Koruyucu** tüm koruyucudaki sırayı gösterir (ör. **#7**); **İkisi** önce grup, sonra koruyucu olarak **#2 · #7** gösterir (grubunda 2., genelde 7.). Çip ve ipucu görüntülenen sıraya göre sıralanır, çip parçanın en üst sıradaki eşleşen kuralını gösterir ve tıklamak o kurala atlar. Koruyucu kuralları seçiliyken çip o kuralları yansıtır; yalnızca *başka* bir kuralla sıralanan bir parça yine de en iyi sırasını biraz soluk gösterir. Safeguard'ların açık olmasını gerektirir.

### Ekipman Farkı (Önce / Sonra)
- Ekipman Denetçisi başlığındaki **Diff** düğmesi, bir şeyi değiştirdiğinizde hangi parçaların **Sakla** ile **Sat** arasında geçtiğini gösteren bir karşılaştırmayı açar — tarifleri ince ayarlarken veya Not iletişim kutusundaki dinamik geçersiz kılmaları denerken kullanışlıdır.
- Düğmenin yanındaki küçük bir çip, referans noktanıza göre güncel değişimi gösterir: kaç parçanın artık daha fazla (veya daha az) **Satıldığını**, **Saklandığını** ve **Korumalar** tarafından korunduğunu.
- **Diff** düğmesine sol tıklama, değişen parçaların **yan yana önce/sonra** görünümünü açar (sol = önce, sağ = sonra) ve eşzamanlı kaydırma sağlar. Kapatmak için tekrar tıklayın.
- Seçenekler için düğmeye sağ tıklayın:
  - **Referans ayarla** — karşılaştırdığınız «önce» olarak mevcut durumu sabitler.
  - **Referansı otomatik izle** (varsayılan olarak açık) — «önce»yi en son tarif/koruma düzenlemenizde tutar, böylece fark her zaman en son değişikliğinizi yansıtır.
- Bilmeniz gereken iki şey:
  - Not iletişim kutusunda **dinamik geçersiz kılmaları** değiştirmek **birikir** — birden çok geçersiz kılma, yalnızca sonuncuyu değil, birleşik etkilerini gösterir.
  - Oluşturucuda bir tarif veya koruma düzenlemek, referansı o düzenlemeye taşır («Referansı otomatik izle» açıkken). Her şeyi sabit bir noktayla karşılaştırmak için onu kapatın (veya «Referans ayarla» kullanın).
- Normal Ekipman Denetçisi filtreleriniz hâlâ geçerlidir: bir parça, değişiklikten önce veya sonra filtreyle eşleşirse görünür.

### Dışa aktarma
- Baz dosya yüklüyse «Birleştirilmiş RSL Helper Sellfile’ı dışa aktar» görünür; aksi durumda «RSL Helper Sellfile’ı dışa aktar».
- Çalışmanızı korumak için oluşturucu alanındaki «Reçeteleri kaydet»/«Reçeteleri yükle» seçeneklerini kullanın.
- Varsayılan HSF adı: `Sellfile_YYYYMMDD_HHMM.hsf`.

## Örnekler

Tüm örneklerde rulo başına 6★ alt stat hedefleri: SPD=5, CR%=5, CDMG%=5.

**Erken vs Geç eşikleri**
- **Erken**: Eşikler o ana kadar kazanılan ruloları yansıtır. ★ + toplam hedef kombinasyonlarında sadece her seviyedeki minimal bölünmeler gösterilir (liste sabit kalır). Diğer durumlarda hedef mümkün olana dek seçilen statlardaki ilerlemeyi listeler, ardından Alt stat hedeflerine sabitlenir (global Σ daha fazlasını gerektirmedikçe).
- **Geç**: +16 hedefinin ulaşılabilir kalması için şu anda bulunması gereken ruloları ister. ★ + toplam hedef ile, aynı minimal bölünmeleri erken seviyelerde ve tekrar +16’da listeler. Stat bazlı hedeflerde her seviye için gerekli alt sınırlar verilir.

#### Oluşturucu senaryoları bir bakışta

| Senaryo | Kurulum | Oluşturucunun çıkışı |
| --- | --- | --- |
| Erken (2 alt stat) | SPD min = 2, CR% min = 1, Seviyeler +0..+16 | `+0:` SPD ≥ 5, CR ≥ 5<br>`+4:` [10,5] ve [5,10]<br>`+8:` [15,5], [10,10], [5,15]<br>`+12/+16:` [15,10] |
| Geç (2 alt stat) | Yukarıdakiyle aynı | `+0/+4:` [5,5]<br>`+8:` [10,5] veya [5,10]<br>`+12:` [15,5] veya [10,10]<br>`+16:` [15,10] |
| Erken (3 alt stat) | SPD min = 2, CR% min = 1, CDMG% serbest, Gerekli = 3 | `+0:` [SPD, CR, CDMG] ≥ [5,5,5]<br>`+4:` tek rulo dağılımları (10/5/5 permütasyonları)<br>`+8:` çift rulo dağılımları (üst sınırlara uyar)<br>`+12/+16:` [15,10,5] |
| Geç (3 alt stat) | Önceki ile aynı | `+0/+4:` [5,5,5]<br>`+8:` [10,5,5] veya [5,10,5]<br>`+12:` [15,5,5] veya [10,10,5]<br>`+16:` [15,10,5] |
| Birini kilitle, iki stat iste | Alt statlar SPD/HP/ATK; SPD’yi kilitle (🔒); Gerekli alt stat = 2 | Oluşturucu SPD+HP ve SPD+ATK satırları üretir; SPD’siz HP+ATK satırları oluşmaz. |
| 3 statta ruloları topla, flex slotu dondur | Alt statlar SPD/CR%/CDMG%/HP%/ATK%/DEF%; Gerekli = 4; SPD/CR%/CDMG% için Min = 1; HP%/ATK%/DEF% için rulo üst sınırı = 0 | SPD/CR%/CDMG% ruloları paylaşır, dördüncü stat permütasyonlarda döner ama rulo almaz; üst sınırlar (★ üzerinde sağ tık) ekstra ruloları engeller. |
| Jokerli Erken (yalnızca seçilenler) | Alt statlar SPD ve ACC; SPD min = 2; ACC = ★; Gerekli = Oto (2); Seviyeler +0..+16 | Erken, SPD(2)’ye +16’da ulaşabilecek tüm öğeleri listeler. SPD’de iki rulo mümkün olduğunda SPD ≥ satırı görünür. |
| Jokerlerle toplam rulo (2 alt stat) | Alt statlar SPD ve ACC (ikisinde de ★); Gerekli = 2; Minimum rulo = 1 | **Erken:** +4/+8/+12/+16’da iki satır — SPD ≥ 10, ACC ≥ 9 ve SPD ≥ 5, ACC ≥ 18.<br>**Geç:** +0/+4/+8/+12 temel satırları gösterir ve +16’da aynı iki satırı tekrarlar; daha yüksek hedeflerde Geç gerekli bölünmeleri daha erken ister. |

## Katkıda bulunmak isteyenler için notlar

- Çeviriler: Yayın paketleri `i18n/` altında yerelleştirme şablonları içerir (örn. `i18n/tr-TR.l10n.json`).
- Düzenle ve test et: Uygulamayı açıp düzenlediğin `*.l10n.json` dosyasını üzerine sürükleyerek anlık oturumda hemen uygula (herhangi bir kurulum gerekmez veya yapılamaz).
- Düzeltme gönder: Güncellenmiş JSON’u Discord mesajı olarak gönder. Anahtarları değiştirme; eksik anahtarlar İngilizceye geri döner.
- Yerleşik diller: Gönderilen tüm diller tek HTML dosyasına derlenir, bu yüzden uygulama tamamen çevrimdışı çalışır. Düzeltmelerin bir sonraki sürüme eklenir.
- `Stream-Helper-DB-to-Creator.bat` DB watcher’ı başlatır ve varsayılan RSL Helper veritabanını Sellfile Creator’a aktarır, böylece reçete’leri canlı kontrol etmek daha kolay olur.

## Teşekkürler

Değerli katkıları için **[STBL] Nasgor**’a,  
Sellfile’ları için **[SP] Panda**’ya,  
ekipman temizliği videoları için **KruYseN**’e,  
ve elbette RSL Helper için **Farbstoff**’a teşekkürler!

## Yazar
Hazırlayan [STBL] Nusi㊷  
Yerelleştirme AI

© Nusi㊷ - 2026
