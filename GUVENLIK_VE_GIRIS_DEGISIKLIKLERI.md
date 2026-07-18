# Market Wire — Güvenlik Sertleştirme + Google Girişi

## 🆕 Kurulum için yapılması gerekenler

### 1) Supabase'de Google Girişini aç
1. Supabase Dashboard → **Authentication → Providers → Google** → Enable.
2. Google Cloud Console'da bir **OAuth 2.0 Client ID** oluştur (Web application).
3. "Authorized redirect URI" olarak Supabase'in sana verdiği adresi ekle:
   `https://<proje-ref>.supabase.co/auth/v1/callback`
4. Client ID / Secret'ı Supabase'teki Google provider ayarına yapıştır, kaydet.
5. Supabase Dashboard → **Authentication → URL Configuration** → "Redirect URLs"
   listesine kendi domainini ekle: `https://senin-domainin.com/auth/callback`
   (localhost'ta test için `http://localhost:3000/auth/callback` da ekle.)

Bu projeye Google Client ID/Secret için **hiçbir env değişkeni eklemedim** —
onlar sadece Supabase tarafında saklanıyor, uygulama koduna hiç girmiyor.

### 2) Yeni migration'ı çalıştır
Supabase SQL Editor'de sırayla:
1. `supabase/telegram_migration.sql` (daha önce çalıştırdıysan atla)
2. `supabase/auth_and_rls_migration.sql` ← **yeni dosya**, mutlaka çalıştır.

Bu dosya:
- `user_saved_news` tablosunu oluşturur (Google hesabına bağlı "kaydedilenler").
- Tüm tablolarda RLS'i açar ve en-az-yetki politikalarını tanımlar.

### 3) `.env` dosyasını güncelle
`.env.example`'daki yeni notlara bak. En kritik değişiklik:
**`TELEGRAM_BOT_TOKEN` kullanıyorsan `TELEGRAM_WEBHOOK_SECRET` artık ZORUNLU.**
Boş bırakırsan webhook/notify/digest endpoint'leri artık çalışmaz (bilerek —
önceden "secret yoksa serbest bırak" davranışı bir güvenlik açığıydı).

```bash
openssl rand -hex 32   # TELEGRAM_WEBHOOK_SECRET için güçlü bir değer üret
```

### 4) `npm install` (yeni bağımlılık: `@supabase/ssr`)

---

## 🔒 Yapılan güvenlik değişiklikleri

| # | Değişiklik | Neden |
|---|---|---|
| 1 | `TELEGRAM_WEBHOOK_SECRET` artık **zorunlu** (webhook/notify/digest route'ları) | Önceden secret tanımsızsa kontrol tamamen atlanıyordu — kurulumu yarım bırakan biri farkında olmadan endpoint'i herkese açık bırakabiliyordu. |
| 2 | Secret karşılaştırması artık **sabit zamanlı** (`crypto.timingSafeEqual`) | Timing-attack riskini ortadan kaldırır. |
| 3 | `service_role` key artık **sadece** cron/webhook/fetcher gibi backend-only yerlerde | `news`/`calendar` gibi herkese açık okuma endpoint'leri artık RLS'e tabi `anon` key kullanıyor — en az yetki prensibi. |
| 4 | Tüm tablolarda **RLS açıldı** + policy'ler tanımlandı | Önceden migration'da RLS hiç açılmamıştı; anon/authenticated rolünün ne yapabileceği artık veritabanı seviyesinde garanti altında. |
| 5 | Next.js **14.2.5 → 14.2.35** | 14.2.5, Aralık 2025'te açıklanan kritik RSC güvenlik açıklarına (CVE-2025-55183, CVE-2025-55184, CVE-2025-67779) karşı savunmasızdı. 14.2.35 bunların hepsini yamalı sürüm. |
| 6 | `lib/supabase/admin.js` net bir "sadece backend" uyarısıyla izole edildi | Kod tabanında service-role client'ın nerede kullanılabileceği artık açıkça belirtilmiş durumda — ileride yanlışlıkla kullanıcı-tetiklemeli bir route'a eklenmesini zorlaştırır. |
| 7 | Google OAuth callback'inde **open-redirect koruması** | `?next=` parametresi sadece uygulama-içi göreli path olabiliyor; dışarıdan URL enjekte edilemiyor. |

## 🔑 Google ile Giriş — neler eklendi

- `app/login/page.js` — Google ile giriş sayfası (Supabase Auth `signInWithOAuth`).
- `app/auth/callback/route.js` — OAuth kod → session dönüşümü.
- `app/auth/signout/route.js` — çıkış.
- `components/AuthWidget.jsx` — sağ üstte avatar/giriş linki.
- `middleware.js` — her istekte oturumu tazeler.
- `lib/supabase/{client,server,admin}.js` — üç ayrı, amacına uygun Supabase client'ı.
- `app/api/saved/route.js` — kaydedilen haberleri kullanıcıya bağlı (RLS'e tabi) yöneten API.
- Giriş yapılmışsa "Kaydedilenler" artık **cihazlar arası senkron** (Supabase); giriş
  yapılmamışsa eskisi gibi `localStorage`'da kalmaya devam ediyor — kimse zorlanmıyor.
- Haber detay panelinde artık gerçek bir ⭐ **kaydet/kaldır** butonu var (önceden kod
  vardı ama hiçbir UI'a bağlı değildi).

Not: Telegram botu üzerinden kaydedilen haberler (`saved_news` tablosu, `telegram_chat_id`
ile) ayrı bir sistem olarak korundu — Google girişiyle karışmıyor.
