-- ─────────────────────────────────────────────────────────────
-- "Kendi Telegram Botunu Bağla" özelliği
-- Supabase SQL Editor'de bir kere çalıştır
-- (telegram_migration.sql VE auth_and_rls_migration.sql'den SONRA).
--
-- Fikir: Kullanıcı Google ile giriş yapar, kendi BotFather token'ını
-- siteye yapıştırır. Site bu token'ı Supabase Vault ile ŞİFRELEYEREK
-- saklar (düz metin hiçbir zaman tabloya yazılmaz), Telegram'a webhook
-- kaydeder ve o andan itibaren kullanıcının kendi botu, sitedeki
-- fonksiyonların (haber/takvim bildirimi, /filtre, /durum, ⭐ kaydetme)
-- tamamını kendi kanalında/DM'inde gösterir.
--
-- Neden Google hesabına bağlı (1 hesap = 1 token)?
-- Token girişini kimliksiz bırakırsak, biri tek bir token'ı çalıp
-- yüzlerce "hesaba" ekleyebilir ve o bot adına spam/karışıklık
-- yaratabilir. Google girişi + "1 kullanıcı en fazla 1 aktif bot"
-- kısıtı, bunu pratik olarak imkansız hale getirir: token'ı çözecek
-- yetkiye sadece backend (service role) sahip, kullanıcı sadece
-- KENDİ token'ının çalışıp çalışmadığını görebilir, token'ın kendisini
-- tekrar okuyamaz.
-- ─────────────────────────────────────────────────────────────


-- ── 1) Supabase Vault'u aktif et (pgsodium tabanlı şifreleme) ──
-- Vault, "secrets" adlı özel bir şemada anahtarları/şifreli verileri
-- tutar. Şifreleme/çözme anahtarı HİÇBİR ZAMAN uygulama koduna ya da
-- env değişkenine çıkmaz — sadece veritabanı içinde, service_role
-- yetkisiyle çağrılan fonksiyonlarla erişilir.
create extension if not exists supabase_vault cascade;


-- ── 2) Kullanıcının kendi botu ──
-- Token'ın kendisi bu tabloda YOK — sadece Vault'taki secret'a bir
-- referans (vault_secret_id) var. Token'ı okumak için ayrı bir
-- fonksiyon (decrypt_user_bot_token) çağırmak gerekiyor, o da sadece
-- service_role tarafından çalıştırılabiliyor.
create table if not exists user_bots (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  vault_secret_id  uuid not null,              -- vault.secrets.id — şifreli token'a referans
  bot_username     text not null,              -- örn. "MarketWireBot" — @BotFather'dan getUpdates ile doğrulanır
  telegram_chat_id bigint,                     -- kullanıcı /start yazınca dolar (webhook üzerinden)
  webhook_secret   text not null,              -- bu botun secret_token'ı (Telegram X-Telegram-Bot-Api-Secret-Token doğrulaması için) — timingSafeEqual ile karşılaştırılır, gizli tutulması gerekmez kadar hassas değil ama yine de rastgele üretilir
  status           text not null default 'pending'
                     check (status in ('pending','active','invalid','disabled')),
  last_error       text,                       -- doğrulama/gönderim hatası varsa (kullanıcıya göstermek için)
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),

  -- 1 hesap = 1 aktif bot. Kullanıcı yeni token eklerse eskisi silinir/
  -- değiştirilir — asla aynı anda birden fazla satır olmaz.
  unique (user_id)
);

create index if not exists idx_user_bots_user_id  on user_bots(user_id);
create index if not exists idx_user_bots_chat_id   on user_bots(telegram_chat_id);

alter table user_bots enable row level security;

-- Kullanıcı sadece KENDİ bot kaydının durumunu (status, bot_username,
-- last_error) görebilir — vault_secret_id ve webhook_secret gibi
-- hassas alanlar da teorik olarak okunabilir durumda (RLS satır
-- bazlı, kolon bazlı değil) ama zaten client bunları kullanamaz;
-- token'ın kendisi bu tabloda hiç yok. Yine de API katmanında
-- (app/api/user-bot/route.js) sadece status/bot_username/last_error
-- döndürülecek — defense in depth.
create policy "kullanıcı kendi bot kaydını okur"
  on user_bots for select
  using (auth.uid() = user_id);

-- Insert/update/delete kasıtlı olarak anon/authenticated'e AÇIK DEĞİL.
-- Token kaydetme/silme işlemi her zaman admin client (service role)
-- üzerinden, app/api/user-bot/route.js içindeki requireUser() kontrolü
-- ile yapılır — böylece "token'ı Vault'a yazmadan satırı ekleme" gibi
-- yarım işlemler client'tan asla tetiklenemez.


-- ── 3) telegram_subscribers'a bot_id ekle ──
-- Mevcut sistemde tüm aboneler TEK botun (env'deki TELEGRAM_BOT_TOKEN)
-- altındaydı. Artık her abone hangi bota ait olduğunu bilmeli:
--   bot_id = NULL  → eski/ortak site botu (env token, geriye dönük uyumluluk)
--   bot_id = <id>  → user_bots.id — kullanıcının kendi botu
alter table telegram_subscribers
  add column if not exists bot_id bigint references user_bots(id) on delete cascade;

create index if not exists idx_telegram_subscribers_bot_id on telegram_subscribers(bot_id);

-- Eskiden (chat_id) tek başına primary key'di — artık aynı chat_id
-- farklı botlarda (biri site botu, biri kullanıcı botu) ayrı ayrı
-- abone olabilmeli. primary key'i (bot_id, chat_id) çiftine taşıyoruz.
-- NOT: Bu adım mevcut satırları bozmaz (bot_id NULL kalır, eski site
-- botu aboneleri olarak çalışmaya devam eder).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'telegram_subscribers_pkey'
  ) then
    alter table telegram_subscribers drop constraint telegram_subscribers_pkey;
  end if;
end $$;

create unique index if not exists idx_telegram_subscribers_bot_chat
  on telegram_subscribers (coalesce(bot_id, 0), chat_id);


-- ── 4) Token'ı şifreleyerek saklayan / çözen yardımcı fonksiyonlar ──
--
-- encrypt_user_bot_token: düz metin token'ı Vault'a yazar, secret id
-- döner. SECURITY DEFINER ile tanımlı — yani çağıran kullanıcının
-- RLS'inden bağımsız olarak Vault'a erişebilir, ama fonksiyonun
-- KENDİSİ sadece service_role tarafından EXECUTE edilebilir (aşağıdaki
-- revoke/grant ile), yani anon/authenticated bu fonksiyonu doğrudan
-- çağıramaz.
create or replace function encrypt_user_bot_token(p_token text, p_description text default 'user telegram bot token')
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
begin
  v_secret_id := vault.create_secret(p_token, p_description);
  return v_secret_id;
end;
$$;

-- decrypt_user_bot_token: sadece backend'in (service role) çağırdığı
-- route'lar bunu kullanır (notify/digest/webhook gönderiminde token
-- gerektiğinde). Token asla API response'una, loga veya client'a
-- dönmez — sadece fonksiyon içinde okunup Telegram API çağrısında
-- kullanılır.
create or replace function decrypt_user_bot_token(p_secret_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_token text;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where id = p_secret_id;
  return v_token;
end;
$$;

-- delete_user_bot_secret: kullanıcı botunu kaldırdığında/değiştirdiğinde
-- eski secret'ı Vault'tan da temizler (token sonsuza kadar DB'de asılı
-- kalmasın).
create or replace function delete_user_bot_secret(p_secret_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  delete from vault.secrets where id = p_secret_id;
end;
$$;

-- Bu üç fonksiyona sadece service_role çağırabilsin — anon/authenticated
-- rolünden EXECUTE yetkisi bilerek kaldırılıyor. Aksi halde herhangi bir
-- authenticated kullanıcı decrypt_user_bot_token(başkasının_secret_id'si)
-- diyerek başka birinin token'ını çözebilirdi (secret_id'ler UUID
-- olduğundan tahmin etmek zor olsa da, "zor tahmin edilir" bir yetki
-- sınırı değildir — açıkça kapatılmalı).
revoke execute on function encrypt_user_bot_token(text, text) from public, anon, authenticated;
revoke execute on function decrypt_user_bot_token(uuid)        from public, anon, authenticated;
revoke execute on function delete_user_bot_secret(uuid)        from public, anon, authenticated;

grant execute on function encrypt_user_bot_token(text, text) to service_role;
grant execute on function decrypt_user_bot_token(uuid)        to service_role;
grant execute on function delete_user_bot_secret(uuid)        to service_role;
