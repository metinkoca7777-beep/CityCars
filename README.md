# CityCars: World Tour 🚗🌍

Dünyanın en ünlü turistik şehirlerinde oyuncak bir arabayla dolaştığın 3D sürüş oyunu.
[bruno-simon.com](https://bruno-simon.com)'daki "oyuncak arabayla serbest gezinme" hissinden **esinlenmiş**, tamamen özgün bir oyundur: tüm modeller, sesler ve müzikler kodla (prosedürel) üretilir. Hiçbir harici görsel/ses dosyası kullanılmaz, bu yüzden APK çok küçüktür.

## İçerik

| | |
|---|---|
| **17 şehir** | İstanbul, Kapadokya, Paris, Londra, New York, Roma, Atina, Tokyo, Dubai, Kahire, Rio, Sidney, Barselona, Agra, San Francisco, Berlin, Amsterdam |
| **50+ turistik yer** | Ayasofya, Sultanahmet, Galata, Kız Kulesi, Peri Bacaları, Uçhisar, Eyfel, Zafer Takı, Louvre, Big Ben, London Eye, Tower Bridge, Özgürlük Heykeli, Times Meydanı, Kolezyum, Trevi, Parthenon, Tokyo Kulesi, Burç Halife, Piramitler, Sfenks, Kurtarıcı İsa, Opera Binası, Sagrada Família, Tac Mahal, Golden Gate… |
| **Oynanış** | Serbest gezinti, turistik yer keşfi (bilgi kartı + ödül), altın toplama, tur yarışı (madalyalar), rampalar, bowling/kutu kulesi dağıtma, trafik |
| **Efektler** | Gündüz / gün batımı / neon gece, bloom ışıma, gölgeler, drift dumanı, lastik izi, nitro alevi, kıvılcım, konfeti, havai fişek, sıcak hava balonları, dönen London Eye ve yel değirmenleri |
| **Ses** | Vites geçişli motor sesi, lastik sürtünmesi, nitro, korna, çarpma, her şehre özel prosedürel müzik (saz/makam, akordeon, koto, samba, sitar, techno…) ve ortam sesleri (martı, kuş, cırcır böceği) |
| **Gelir** | AdMob: ödüllü reklam (x2 ödül, bedava altın), sık olmayan geçiş reklamı (en az 3 dk arayla), sadece menülerde banner. GDPR onay formu (UMP) dahil |
| **Bağlılık** | Günlük ödül serisi, şehir başına 3 yıldızlı görevler, 9 satın alınabilir araba, şehir kilitleri |
| **Diller** | Türkçe, English, Español, Deutsch, Français, Português (cihaz diline göre otomatik) |
| **Kontroller** | Dokunmatik (analog direksiyon + gaz/fren/nitro/drift/korna), klavye, gamepad |

## Geliştirme

```bash
npm install
npm run dev        # tarayıcıda http://localhost:5173
npm run build      # dist/ klasörüne üretim derlemesi
```

Klavye: WASD/oklar sür · Boşluk drift · Shift nitro · H korna · R sıfırla · C kamera · Esc duraklat.

## Android / Google Play'e yükleme

### 1) Kendi kimliklerini gir (yayından ÖNCE zorunlu)
- **Paket adı:** `capacitor.config.json` ve `android/app/build.gradle` içinde `com.kolomp.citycars`. İstersen değiştir (Play'e yüklendikten sonra değiştirilemez).
- **AdMob:** [apps.admob.com](https://apps.admob.com)'da uygulama + 3 reklam birimi (Banner, Geçiş, Ödüllü) oluştur:
  - `android/app/src/main/AndroidManifest.xml` → `com.google.android.gms.ads.APPLICATION_ID` değerini kendi **Uygulama Kimliğin** yap.
  - `src/ads.js` → `AD_IDS` içine kendi reklam birimi kimliklerini yaz ve `TESTING = false` yap.
  - Şu an Google'ın **test** kimlikleri var; bu haliyle gerçek gelir gelmez.
- **Gizlilik politikası:** `public/privacy.html` hazır. Bir adreste yayınla (ör. GitHub Pages) ve `src/main.js` içindeki `PRIVACY_URL`'yi güncelle; aynı adresi Play Console'a gir.

### 2) Derleme
Android Studio (JDK 21, Android SDK 36) ile:
```bash
npm run cap:sync          # web derlemesi + android klasörüne kopyalama
npx cap open android      # Android Studio'da aç → Build > Generate Signed Bundle (AAB)
```
veya komut satırından:
```bash
keytool -genkey -v -keystore citycars-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
# android/keystore.properties oluştur (commit etme!):
#   storeFile=/tam/yol/citycars-upload.jks
#   storePassword=...
#   keyAlias=upload
#   keyPassword=...
cd android && ./gradlew bundleRelease   # → app/build/outputs/bundle/release/app-release.aab
```
Her yeni sürümde `versionCode`'u artır (`VERSION_CODE` ortam değişkeni ile de verilebilir).

### 3) GitHub Actions ile otomatik derleme
`.github/workflows/android.yml` her push'ta debug APK üretir (Actions → Artifacts). İmzalı AAB için depo ayarlarına şu secret'ları ekle:
`ANDROID_KEYSTORE_BASE64` (`base64 -w0 citycars-upload.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

### 4) Play Console
- Mağaza metinleri (TR + EN), kategori ve anahtar kelimeler: `store/listing.md`
- Simge 512×512: `store/icon-512.png` · Öne çıkan grafik: `store/feature-graphic-1024x500.png` · Ekran görüntüleri: `store/screenshots/`
- "Reklam içeriyor: Evet", Veri güvenliği formunda AdMob'un topladığı verileri (Reklam Kimliği, yaklaşık konum, uygulama etkileşimleri) beyan et.
- İçerik derecelendirme anketini doldur; hedef kitleyi 13+ seçmek reklam kurallarını basitleştirir (çocuklara yönelik seçersen Aileler politikası ve yalnızca sertifikalı reklam ağları gerekir).

## Dikkat edilmesi gerekenler
- Bazı modern yapıların (ör. Burç Halife, Louvre Piramidi, gece aydınlatmalı Eyfel) görünümü üzerinde ticari marka/tasarım hakları bulunabilir. Modeller basitleştirilmiş, sembolik çizimlerdir; yine de yayından önce hukuki açıdan kontrol edilmesi önerilir.
- Bruno Simon'un adını, varlıklarını veya markasını mağaza sayfasında kullanma.

## Proje yapısı
```
src/main.js        Oyun döngüsü, kamera, HUD, menüler, yarış/keşif mantığı
src/world.js       Şehir üretimi: yollar, binalar, ağaçlar, trafik, altınlar, rampalar, gökyüzü, deniz
src/landmarks.js   50+ turistik yerin prosedürel 3D modelleri
src/cities.js      Şehir verileri (renkler, saat, müzik tarzı, turistik yerler + TR/EN bilgiler)
src/cars.js        Araba modelleri ve fizik (cannon-es RaycastVehicle)
src/audio.js       Sentezlenmiş ses efektleri ve şehir müzikleri (Web Audio)
src/effects.js     Parçacıklar ve lastik izleri
src/ads.js         AdMob entegrasyonu
src/save.js        Kayıt, günlük ödül, yıldızlar
src/i18n.js        Çeviriler
android/           Capacitor Android projesi
store/             Play Store görselleri ve metinleri
```
