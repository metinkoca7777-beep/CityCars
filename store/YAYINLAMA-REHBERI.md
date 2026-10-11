# CityCars — Google Play hızlı yayınlama rehberi (Türkçe)

Gereken her şey hazır. Geriye sadece kendi Play Console hesabınızdaki tıklamalar kalıyor.

## Yüklenecekler

| Dosya | Nereye |
|---|---|
| `CityCars-1.0.0.aab` (imzalı, versionCode 1, sürüm 1.0.0, paket `com.kolomp.citycars`) | Test et ve yayınla → kanalınız → Yeni sürüm oluştur |
| `store/icon-512.png` | Ana mağaza girişi → Uygulama simgesi |
| `store/feature-graphic-1024x500.png` | Ana mağaza girişi → Öne çıkan grafik |
| `store/screenshots/en/01…08-*.png` | Telefon ekran görüntüleri (8 adet). 7" ve 10" tablet için aynı dosyalar |
| `store/listings/<dil>.md` | en-US, tr-TR, es-ES, de-DE, fr-FR, pt-BR için ad, kısa ve tam açıklama |
| `store/listings/release-notes-all.txt` | "Sürüm notları" alanına yapıştırın — 6 dili birden kapsar |

Yükleme anahtarını (`citycars-upload.jks` + şifre dosyası) güvenli saklayın. Her güncelleme aynı anahtarla imzalanmalı.

## En hızlı yol — yaklaşık 30 dakikalık tıklama

### 1. Uygulamayı oluştur (2 dk)
Play Console → **Uygulama oluştur**
- Uygulama adı: `CityCars: World Tour Driving`
- Varsayılan dil: **English (United States) – en-US**
- Uygulama/oyun: **Oyun** · Ücretsiz/ücretli: **Ücretsiz**
- Beyanları onayla → **Uygulama oluştur**

### 2. Ana mağaza girişi (5 dk)
Kullanıcı kazan → Mağaza varlığı → **Ana mağaza girişi**
- `store/listings/en-US.md` içindeki ad / kısa / tam açıklamayı yapıştırın
- Simge, öne çıkan grafik ve 8 ekran görüntüsünü yükleyin
- **Çevirileri yönet → Kendi çevirilerinizi ekleyin**: tr-TR, es-ES, de-DE, fr-FR, pt-BR → her birine ilgili `store/listings/<dil>.md` dosyasını yapıştırın. (İsteğe bağlı: es-419 ve pt-PT de ekleyip es-ES / pt-BR metinlerini kullanın.)

### 3. Mağaza ayarları (1 dk)
- Kategori: **Oyun → Yarış** (alternatif: Gündelik)
- Etiketler: Sürüş, Açık dünya, Gündelik, Yarış, Simülasyon
- E-posta: metin@kolomp.com · Web sitesi: `https://citycars-xi.vercel.app`

### 4. Uygulama içeriği (10 dk) — Politika ve programlar → Uygulama içeriği
| Bölüm | Cevap |
|---|---|
| Gizlilik politikası | `https://citycars-xi.vercel.app/privacy.html` |
| Reklamlar | **Evet, uygulamam reklam içeriyor** |
| Uygulama erişimi | **Tüm işlevler özel erişim olmadan kullanılabilir** |
| Hedef kitle | **13-15, 16-17, 18+** (13 yaş altını **seçmeyin** — Aileler politikası devreye girer, reklam ağları kısıtlanır) |
| İçerik derecelendirmesi (IARC) | Kategori **Oyun**. Şiddet: sadece *çizgi film/fantastik, hafif* (oyuncak arabalar nesnelere çarpar, variller patlar; insan zarar görmez, kan yok). Diğer her şey: **Hayır** → beklenen **PEGI 3 / ESRB Everyone** |
| Veri güvenliği | Veri toplanıyor: **Evet** (AdMob SDK). Türler: **Cihaz veya diğer kimlikler** (Reklam kimliği), **Yaklaşık konum**, **Uygulama etkileşimleri**, **Kilitlenme günlükleri / Teşhis**. Her biri için: paylaşılıyor **Evet**; amaç **Reklamcılık veya pazarlama, Analiz, Dolandırıcılık önleme**; aktarımda şifreli **Evet**; silme talebi **Hayır** (oyun sunucuda veri tutmuyor) |
| Reklam kimliği | **Evet** — reklamcılık için |
| Devlet / haber / COVID-19 / finans / sağlık | **Hayır / Hiçbiri** |

### 5. AAB'yi yükle
**A) Yeni kişisel geliştirici hesabı (en yaygın durum).** Google üretimden önce **en az 12 test kullanıcısıyla 14 gün kapalı test** ister:
1. Test et ve yayınla → **Test → Kapalı test → Kanal oluştur** (ör. "Beta")
2. Ülkeler: tümü · Test kullanıcıları: en az 12 Gmail adresiyle bir e-posta listesi oluşturup kaydedin
3. **Yeni sürüm oluştur** → **Play Uygulama İmzalama**'yı kabul edin → `CityCars-1.0.0.aab` dosyasını yükleyin
4. Sürüm adı `1.0.0 (1)` · Sürüm notları: `store/listings/release-notes-all.txt` içeriğini yapıştırın
5. **Sonraki → Kaydet → İncelemeye gönder** (ilk inceleme genelde 1–7 gün sürer)
6. Katılım bağlantısını test kullanıcılarıyla paylaşın; uygulamayı yükleyip 14 gün tutmaları gerekir
7. 14 gün sonra: Kontrol paneli → **Üretime erişim başvurusu** → kısa anketi doldurun → aynı sürümü **Üretim**'e taşıyın

**B) Kurumsal hesap veya Kasım 2023'ten önce açılmış kişisel hesap:** kapalı testi atlayın — Test et ve yayınla → **Üretim → Yeni sürüm oluştur** → AAB'yi yükleyin → İncelemeye gönderin.

### 6. Yayından sonra
- AdMob → Uygulamalar → CityCars → **Google Play'e bağla**
- AdMob → **app-ads.txt** → "Güncellemeleri kontrol et" (site zaten `https://citycars-xi.vercel.app/app-ads.txt` dosyasını yayınlıyor)
- Yeni AdMob uygulamaları, uygulama yayına girip incelenene kadar az ya da hiç gerçek reklam göstermeyebilir — bu normaldir.

## Reddedilmemek için
- Gizlilik politikası adresi herkese açık olmalı (açık).
- Veri güvenliği cevapları AdMob SDK ile uyumlu olmalı (yukarıdaki tablo uyumlu).
- Mağaza metninde başka oyun/marka adı geçmesin (ör. "Bruno Simon" asla).
- Oyunda olmayan özellik vaat etmeyin; buradaki metinler sadece var olanı anlatıyor.
- Yükledikten sonra **Lansman öncesi raporu**'na bakın; uygulamayı otomatik olarak gerçek cihazlarda dener.

## Sonraki güncellemeler
Her yeni AAB'de versionCode artmalı (2, 3, …) ve aynı yükleme anahtarı kullanılmalı. Bana "yeni AAB" demeniz yeterli.
