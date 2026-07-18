-- ─────────────────────────────────────────────────────────────
-- Google girişi (Supabase Auth) + genel RLS sertleştirmesi
-- Supabase SQL Editor'de bir kere çalıştır (telegram_migration.sql'den
-- SONRA çalıştırılmalı).
--
-- Bu migration şunları yapar:
--   1) Web arayüzü için, Google ile giriş yapan kullanıcıya bağlı yeni bir
--      "user_saved_news" tablosu oluşturur (localStorage yerine).
--   2) Var olan tüm tablolarda RLS'i açar ve en-az-yetki politikaları tanımlar.
--      Backend (service role / admin client) RLS'i zaten bypass ettiği için
--      bu, sadece anon/authenticated rollerinin (yani tarayıcıdan gelen
--      isteklerin) neye erişebileceğini sınırlar — "tanımsız erişim"
--      senaryosuna karşı bir güvenlik ağıdır.
-- ─────────────────────────────────────────────────────────────

-- ── 1) Google ile giriş yapan kullanıcıların kaydettiği haberler ──
--
-- Telegram botu üzerinden kaydedilenlerden (saved_news, telegram_chat_id
-- ile) tamamen ayrı — bu tablo Supabase Auth'taki auth.users.id'ye bağlı.
create table if not exists user_saved_news (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  news_id    uuid not null references news_items(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, news_id)
);

create index if not exists idx_user_saved_news_user_id on user_saved_news(user_id);

alter table user_saved_news enable row level security;

-- Kullanıcı sadece kendi kaydettiklerini görebilir/ekleyebilir/silebilir.
-- auth.uid() Supabase'in JWT'den okuduğu, o anki giriş yapmış kullanıcının
-- id'sidir — sahte bir user_id ile başka birinin verisine yazmak/okumak
-- bu politika sayesinde mümkün değildir.
create policy "kullanıcı kendi kayıtlarını okur"
  on user_saved_news for select
  using (auth.uid() = user_id);

create policy "kullanıcı kendi kaydını ekler"
  on user_saved_news for insert
  with check (auth.uid() = user_id);

create policy "kullanıcı kendi kaydını siler"
  on user_saved_news for delete
  using (auth.uid() = user_id);


-- ── 2) Herkese açık okunabilir tablolarda RLS + "sadece okuma" politikası ──
--
-- Bu tablolar zaten /api/news ve /api/calendar üzerinden herkese açık
-- gösteriliyor; buradaki amaç anon/authenticated rolünün YAZMA
-- yapamayacağını garanti altına almak (yazma sadece admin/service-role
-- client ile, cron ve webhook route'larından yapılır).

alter table news_items      enable row level security;
alter table news_sources    enable row level security;
alter table economic_events enable row level security;

create policy "herkes haberleri okuyabilir"
  on news_items for select
  using (true);

create policy "herkes kaynakları okuyabilir"
  on news_sources for select
  using (true);

create policy "herkes takvim olaylarını okuyabilir"
  on economic_events for select
  using (true);

-- NOT: insert/update/delete için bilerek hiçbir policy tanımlanmadı.
-- RLS açıkken policy'siz bırakılan işlemler varsayılan olarak REDDEDİLİR
-- (service role hariç) — yani anon/authenticated hiçbir zaman bu
-- tablolara yazamaz, sadece admin client (service role, RLS'i zaten
-- bypass eder) yazabilir.


-- ── 3) telegram_subscribers ve saved_news (Telegram) için de RLS ──
--
-- Bu tablolara sadece backend (webhook/notify/digest route'ları, admin
-- client ile) erişiyor; hiçbir tarayıcı isteği bu tabloları doğrudan
-- görmemeli. RLS'i açıp policy EKLEMEYEREK anon/authenticated erişimini
-- tamamen kapatıyoruz.

alter table telegram_subscribers enable row level security;
alter table saved_news           enable row level security;

-- Kasıtlı olarak hiçbir select/insert/update/delete policy'si yok:
-- bu iki tabloya sadece service role (admin client) erişebilir.
