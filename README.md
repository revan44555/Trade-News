# Market Wire — Trade News

Gerçek zamanlı finansal haber akışı ve ekonomik takvim uygulaması. Next.js 14
(App Router) + Supabase üzerine kurulu; forex, kripto ve hisse haberlerini
RSS ve Finnhub'dan toplayıp gerçek zamanlı olarak gösterir, ekonomik takvim
olaylarını takip eder ve isteğe bağlı olarak Telegram'a bildirim gönderir.

## Proje Hakkında Bir Not

Bu projenin kod tabanı büyük ölçüde yapay zeka destekli geliştirme
araçlarıyla oluşturulmuştur. Ürün fikri, özellik kapsamı, kullanıcı akışı ve
mimari kararların büyük bir kısmı bana aittir; yapay zeka bu fikirleri
uygulanabilir koda dönüştürme sürecinde bir geliştirme aracı olarak
kullanılmıştır. Şeffaflık adına bunu burada belirtmek istedim.

## Özellikler

- 📰 Gerçek zamanlı haber akışı (SSE ile canlı güncelleme)
- 📅 Ekonomik takvim (ForexFactory verisiyle)
- ✦ AI destekli haber özetleri (Gemini)
- ⭐ Haber kaydetme
- 📢 Telegram bot bildirimleri (yüksek etkili haberler ve olaylar için)

## Kurulum

```bash
npm install
cp .env.example .env.local   # sonra .env.local içini doldur
npm run dev
```

Uygulama `http://localhost:3000` adresinde açılır.

### Gerekli ortam değişkenleri

Tüm değişkenler ve nereden alınacakları `.env.example` dosyasında açıklanmıştır.
Özet:

| Değişken | Zorunlu mu? | Açıklama |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase proje URL'i |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (gizli) |
| `FINNHUB_API_KEY` | opsiyonel | Ek haber kaynağı için |
| `GEMINI_API_KEY` | opsiyonel | AI haber özeti için |
| `TELEGRAM_BOT_TOKEN` | opsiyonel | Telegram bildirimleri için |
| `TELEGRAM_CHAT_ID` | opsiyonel | Bildirimlerin gideceği kanal/grup |
| `TELEGRAM_WEBHOOK_SECRET` | opsiyonel | Webhook'u doğrulamak için |

### Supabase tabloları

Uygulama şu tabloları bekler (Supabase'te elle oluşturulmalı):
`news_sources`, `news_items`, `economic_events`.

## Telegram Bot Kurulumu (adım adım)

Uygulamanın Telegram bildirimlerini aktif etmek istersen:

1. **Bot oluştur** — Telegram'da `@BotFather`'a git, `/newbot` yaz, bot için
   bir isim ve `_bot` ile biten bir kullanıcı adı belirle. Sana bir **Bot
   Token** verecek (örn. `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxx`).

2. **Kanal/grup oluştur** — Bildirimlerin gideceği bir Telegram kanalı ya da
   grubu oluştur, botunu oraya **yönetici (admin)** olarak ekle.

3. **Chat ID'yi bul** — Kanala bir mesaj gönder, sonra tarayıcıda
   `https://api.telegram.org/bot<TOKEN>/getUpdates` adresini aç. Dönen JSON
   içindeki `"chat":{"id":...}` alanını bul (kanallarda genelde `-100` ile
   başlayan negatif bir sayıdır).

4. **Env değişkenlerini ekle** — `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` ve
   kendi belirleyeceğin bir `TELEGRAM_WEBHOOK_SECRET` değerini `.env.local`
   dosyasına (veya deploy ortamının env ayarlarına) ekle.

5. **Supabase Webhook'unu bağla** — Supabase panelinde
   **Database → Webhooks → Create a new hook** yolunu izleyip iki webhook
   oluştur:
   - Tablo: `news_items`, Olay: `INSERT`
   - Tablo: `economic_events`, Olay: `INSERT, UPDATE`

   İkisi için de: `HTTP Method: POST`,
   `URL: https://SENIN-SITEN/api/telegram/notify`,
   Header: `x-webhook-secret: <TELEGRAM_WEBHOOK_SECRET değerin>`.

6. **Test et** — `news_items` tablosuna elle `impact_level: "high"` olan bir
   satır ekleyerek bildirimin geldiğini doğrula.

> Bu adımlar uygulama içinde de **Ayarlar (⚙) → "📢 Telegram botunda aktif"**
> kutusuna tıklayınca açılır.

## Telegram Bot — Genişletilmiş Özellikler (yeni)

Bot artık tek bir kanala yayın yapmakla sınırlı değil; kullanıcılar botu
kendi DM'lerinde başlatıp **kişisel abone** olabiliyor, filtre seçebiliyor
ve günlük özet moduna geçebiliyor.

**Kurulum adımları (1-4 yukarıdaki temel kurulumun üzerine eklenir):**

1. `supabase/telegram_migration.sql` dosyasını Supabase SQL Editor'de çalıştır
   (`telegram_subscribers` tablosunu oluşturur, `economic_events`'e
   `telegram_notified_at` kolonu ekler).

2. Webhook'u Telegram'a tanıt (deploy sonrası bir kez):
   ```bash
   curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
     -d url=https://SENIN-SITEN/api/telegram/webhook \
     -d secret_token=<TELEGRAM_WEBHOOK_SECRET>
   ```

3. Günlük özet için bir cron tetikleyici ekle (Vercel Cron örneği,
   `vercel.json`):
   ```json
   { "crons": [{ "path": "/api/telegram/digest", "schedule": "0 * * * *" }] }
   ```
   (Saatte bir çalışır; her abone kendi `digest_hour_local` saatine
   gelince özeti alır — böylece herkes kendi saat diliminde sabah özeti görür.)
   Vercel dışı bir barındırmada cron-job.org gibi harici bir servisle bu
   endpoint'i saatte bir çağırabilirsin. İstek header'ına
   `x-webhook-secret: <TELEGRAM_WEBHOOK_SECRET>` eklemeyi unutma.

**Kullanıcı komutları** (botla DM'de):

| Komut | Ne yapar |
|---|---|
| `/start` | Abone kaydı oluşturur (varsayılan: yüksek+orta etki, anlık mod) |
| `/filtre` | İnline butonlarla hangi etki seviyelerini alacağını seçer |
| `/ozet_ac` | Anlık yerine günlük özet moduna geçer |
| `/ozet_kapat` | Anlık bildirime döner |
| `/durdur` | Bildirimleri geçici olarak keser |
| `/devam` | Bildirimleri tekrar açar |
| `/durum` | Mevcut ayarları gösterir |
| `/kaydedilenler` | ⭐ ile kaydettiğin son 10 haberi listeler |

**Neler değişti:**
- `TELEGRAM_CHAT_ID` artık zorunlu değil (geriye dönük uyumluluk için hâlâ
  fallback olarak kullanılabilir) — bildirimler `telegram_subscribers`
  tablosundaki aktif abonelere, filtrelerine göre gönderiliyor.
- Ekonomik olay bildirimlerinde tekrar-önleme artık in-memory Map yerine
  `economic_events.telegram_notified_at` kolonuyla yapılıyor; çoklu-instance
  deploy'larda (Vercel gibi) da güvenilir çalışır.
- Her haber bildirimine `⭐ Kaydet` inline butonu eklendi. Bu, ayrı bir
  `saved_news` tablosuna yazıyor (`telegram_migration.sql` içinde) — web
  arayüzündeki mevcut kaydetme özelliğinden (tarayıcı localStorage,
  `NewsFeed.jsx`) tamamen bağımsızdır; ikisi şu an senkron değildir, her biri
  kendi ortamında (Telegram / tarayıcı) kalıcıdır.

## Script'ler

```bash
npm run dev     # geliştirme sunucusu
npm run build   # production build
npm run start   # production sunucusu
npm run lint    # eslint
```

## Mimari notlar

- Haber/takvim verisi arka planda periyodik olarak çekilir (`lib/fetchers`).
  Bu cron, uygulama ilk açıldığında `/api/cron` endpoint'i üzerinden
  başlatılır (tek process içinde yalnızca bir kez).
- Telegram bildirimleri `/api/telegram/notify` endpoint'i üzerinden,
  Supabase Database Webhook'ları tetiklendiğinde gönderilir.

## Bulunan ve düzeltilen hatalar

Bu bölüm, projeye yapılan son incelemede bulunup düzeltilen hataları
şeffaflık için listeler.

| # | Hata | Etki | Düzeltme |
|---|---|---|---|
| 1 | `EconomicCalendar.jsx` içindeki tercih kaydetme (`saveP`) çağrıları, kullanıcının **Impact** filtresindeki gerçek seçimi (`selImpacts`) değil, her zaman sabit `ALL_IMP` değerini kaydediyordu. | Kullanıcı "High" dışındaki etki seviyelerini kapatıp sayfayı yenilediğinde filtre sıfırlanıyor, tercih hiç kalıcı olmuyordu. | İki çağrı da (`useEffect` içindeki otomatik kayıt ve `requestNotif()`) artık gerçek `[...selImpacts]` değerini kaydediyor. |
| 2 | `lib/fetchers/{rssFetcher,calendarFetcher,finnhubFetcher}.js` dosyalarının hepsi `createAdminClient()`'ı **modül yüklenirken** (import zamanında, üst seviyede) çağırıyordu. | `SUPABASE_SERVICE_ROLE_KEY` tanımsızsa (ör. eksik `.env`), bu üç dosyadan biri import edildiği anda (dolayısıyla `startCron()` her çağrıldığında, yani her `/api/cron` isteğinde) hata fırlatıyordu — cron tamamen çalışmaz hale geliyordu. | Client artık yalnızca gerçekten kullanıldığı anda, fonksiyon içinde `getSupabase()` ile (lazy) oluşturuluyor. `createAdminClient()` zaten kendi içinde memoize ettiği için performans kaybı yok. |
| 3 | Next.js `14.2.35` kullanılıyordu. Next.js 14 desteği **26 Ekim 2025**'te sona erdi (14.2.35 son yama sürümüydü); Mayıs 2026'daki güvenlik güncellemesinde açıklanan 12+ CVE (DoS, SSRF, cache poisoning, XSS) yalnızca 15.x/16.x hatlarına yamalandı, 14.x için yama planlanmıyor. | Proje, artık yama almayan ve halka açık CVE'leri olan bir Next.js sürümüyle deploy ediliyordu. | `package.json` Next.js `15.5.18` + React `19`'a yükseltildi. Bu proje dinamik route segmenti (`[param]`) veya sayfa seviyesinde senkron `params`/`searchParams` kullanmadığı için (tüm sorgu parametreleri `new URL(request.url).searchParams` ile okunuyor) 14→15 arasındaki kırıcı "async request API" değişikliğinden etkilenmiyor — güvenli bir yükseltme. `next.config.js`'teki `experimental.serverComponentsExternalPackages` de Next 15'in üst-seviye `serverExternalPackages` anahtarına taşındı. `package-lock.json` silindi; `npm install` ile yeniden oluşturulmalı. |
| 4 | Next 15'e geçince `next build` sırasında ESLint artık hataya çevriliyor; `app/login/page.js`'te iç-uygulama linki (`/login` → `/`) ham `<a>` etiketiyle yazılmıştı. | `@next/next/no-html-link-for-pages` kuralı build'i **kırıyordu** (Render/Vercel deploy'u başarısız oluyordu). | `app/login/page.js`, `app/page.js` (SavedNews) ve `components/AuthWidget.jsx` içindeki tüm iç-uygulama linkleri `next/link`'in `<Link>` bileşenine çevrildi. |
| 5 | `app/layout.js` Google Fonts'u `<head>` içine ham bir `<link rel="stylesheet">` ile çekiyordu. | `@next/next/no-page-custom-font` uyarısı veriyordu ve font, App Router'ın önerdiği gibi self-host/optimize edilmiyordu (render-engelleyici, layout shift riski). | `next/font/google` (`IBM_Plex_Mono`) kullanılacak şekilde değiştirildi; font artık build zamanında self-host ediliyor. |
| 6 | `supabase/auth_and_rls_migration.sql` yazılmıştı ama **hiç çalıştırılmamıştı** — bu bir SQL dosyası, Supabase otomatik uygulamaz. | `news_items`/`economic_events` tabloları RLS açık ama select policy'siz kaldığından, `/api/news` ve `/api/calendar` (anon key kullanıyor) sessizce **boş dizi** döndürüyordu — hata yok, ama haberler ve takvim hep boş görünüyordu (cron arka planda veriyi doğru şekilde yazmasına rağmen, çünkü cron admin/service-role client kullanıp RLS'i zaten bypass ediyor). | Kod değişikliği yok — migration'ı Supabase SQL Editor'de çalıştırmak gerekiyordu. Kalıcı çözüm için deploy adımlarına (bkz. Kurulum) bu migration'ı çalıştırma notu eklendi. |
| 7 | `app/auth/callback/route.js` ve `app/auth/signout/route.js`, yönlendirme adresini `new URL(request.url).origin` ile hesaplıyordu. | Render gibi reverse-proxy arkasında çalışan platformlarda, Next.js'in aldığı ham istek URL'i proxy'nin dışarıya gösterdiği adresi değil, uygulamanın içeride dinlediği portu (`http://localhost:10000` gibi) yansıtabiliyor. Sonuç: Google ile giriş yaptıktan veya çıkış yaptıktan sonra kullanıcı `localhost:10000`'e yönlendiriliyor ve "bu siteye ulaşılamıyor" hatası alıyordu. | Yeni `lib/http/resolveOrigin.js` yardımcı fonksiyonu eklendi: önce proxy'nin `X-Forwarded-Host`/`X-Forwarded-Proto` header'larına bakıyor, yoksa `NEXT_PUBLIC_SITE_URL` env değişkenine düşüyor, o da yoksa son çare olarak eski davranışı (`request.url`'den hesaplanan origin) kullanıyor. `.env.example`'a `NEXT_PUBLIC_SITE_URL` eklendi — Render'da bu değişkeni gerçek uygulama adresine (ör. `https://trade-news-7h0e.onrender.com`) ayarlaman önerilir. |
| 8 | `app/login/page.js`, Google girişi sonrası kullanıcıyı `next=/saved` parametresiyle yönlendiriyordu. Ama `/saved` diye bağımsız bir sayfa (route) hiç yok — "Kaydedilenler" `app/page.js` içindeki bir **sekme** (client-side state + `localStorage`), ayrı bir URL değil. | Giriş başarılı oluyordu (session doğru kuruluyordu) ama son adımda tarayıcı `https://.../saved`'a gidince Next.js "404 This page could not be found" veriyordu. | `redirectTo` artık `next=/?tab=saved` kullanıyor (var olan ana sayfaya, bir query param ile). `app/page.js`'e yeni bir `useEffect` eklendi: sayfa açılınca `?tab=saved` var mı diye bakıyor, varsa doğru sekmeyi otomatik açıp URL'i temizliyor. |

**Bilinen, build'i etkilemeyen uyarılar:** `components/AuthWidget.jsx` içindeki
Google profil fotoğrafı `next/image` yerine düz `<img>` ile gösteriliyor
(`no-img-element` uyarısı). Bunu `next/image`'a taşımak, Google'ın avatar
domain'ini (`lh3.googleusercontent.com`) `next.config.js`'teki
`images.remotePatterns`'e eklemeyi gerektirir; deploy ortamına göre domain
değişebileceğinden bilerek dokunulmadı — istersen kolayca eklenebilir.
Ayrıca birkaç `useEffect` için "exhaustive-deps" uyarısı var (kasıtlı: bazı
effect'ler sadece `item.id` değiştiğinde yeniden çalışmalı, her render'da
değil) — bunlar da sadece uyarı, build'i etkilemez.

Next.js'i düzenli olarak güncel tutmak için (bu proje public olduğundan)
zaman zaman `npm outdated` / Next.js güvenlik duyurularını kontrol etmek
faydalı olur: https://nextjs.org/blog
