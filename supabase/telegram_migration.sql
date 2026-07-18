-- ─────────────────────────────────────────────────────────────
-- Telegram bot genişletmesi: çoklu abone + kalıcı tekrar-önleme
-- Supabase SQL Editor'de bir kere çalıştır.
-- ─────────────────────────────────────────────────────────────

-- 1) Abone tablosu — her kullanıcı botu kendi DM'inde /start ile başlatır
create table if not exists telegram_subscribers (
  chat_id           bigint primary key,
  username          text,
  impact_filter     text[] default array['high','medium'],  -- 'high' | 'medium' | 'low'
  ticker_filter     text[] default null,                     -- null = tüm ticker'lar
  digest_mode       boolean default false,                   -- true: anlık yerine günlük özet
  digest_hour_local int default 8,                            -- 0-23, kullanıcının kendi saatinde
  ai_lang           text default 'Turkish',
  timezone          text default 'Europe/Istanbul',
  is_active         boolean default true,
  created_at        timestamptz default now()
);

-- 2) Ekonomik olaylar için kalıcı bildirim kilidi
--    (in-memory Map yerine — çoklu-instance deploy'da güvenilir)
alter table economic_events
  add column if not exists telegram_notified_at timestamptz;

-- 3) Telegram üzerinden ⭐ kaydedilen haberler
--    Not: Web arayüzündeki mevcut kaydetme özelliği (NewsFeed.jsx,
--    localStorage 'mw_saved_news') tamamen tarayıcı bazlıdır ve bu tabloyla
--    ilişkisi yoktur — cihaza özel kalmaya devam eder. Bu tablo sadece
--    Telegram botu üzerinden yapılan kaydetmeleri saklar.
create table if not exists saved_news (
  id                bigint generated always as identity primary key,
  news_id           uuid not null references news_items(id) on delete cascade,
  telegram_chat_id  bigint not null references telegram_subscribers(chat_id) on delete cascade,
  created_at        timestamptz default now(),
  unique (news_id, telegram_chat_id)
);

create index if not exists idx_saved_news_chat_id on saved_news(telegram_chat_id);

-- İpucu: bir kullanıcı botu bloklarsa (403 hatası) is_active = false
-- yapmak isteyebilirsiniz — bkz. lib/telegram/sendMessage.js içindeki
-- error_code kontrolü.
