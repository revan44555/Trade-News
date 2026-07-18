// app/api/telegram/notify/route.js  (GÜNCELLENMİŞ — çoklu-bot destekli)
//
// Artık aboneler iki gruba ayrılıyor:
//   - bot_id = NULL  → site botu, env TELEGRAM_BOT_TOKEN ile gönderilir
//   - bot_id = <id>  → kullanıcının kendi botu, token Vault'tan çözülüp
//                        o token ile gönderilir
//
// Performans notu: Vault çözme işlemi bir RPC çağrısı (round-trip), bu
// yüzden her abone için ayrı ayrı çağırmak yerine önce hangi bot_id'lerin
// hedef listesinde olduğunu topluyoruz, TEK seferde hepsini çözüyoruz,
// sonra gönderim sırasında bu haritadan (Map) okuyoruz.
export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { verifyWebhookSecret } from '@/lib/security/verifyWebhookSecret'
import { buildNewsMessage, buildEventMessage, sendTelegramMessage } from '@/lib/telegram/sendMessage'
import { decryptBotToken } from '@/lib/telegram/userBots'

// Takvim olayları için: sadece high impact ve gelecek 24 saat içindeki olaylar
function isUpcomingHighImpact(ev) {
  if (ev.impact_level !== 'high') return false
  const diffMs = new Date(ev.scheduled_at).getTime() - Date.now()
  return diffMs > 0 && diffMs < 24 * 60 * 60 * 1000
}

// Abone bu haberi/olayı almalı mı?
function subscriberWants(sub, impactLevel, tickers) {
  if (!sub.is_active || sub.digest_mode) return false // digest modundakiler anlık almaz
  if (!sub.impact_filter?.includes(impactLevel)) return false
  if (sub.ticker_filter?.length && tickers?.length) {
    const hasMatch = tickers.some(t => sub.ticker_filter.includes(t))
    if (!hasMatch) return false
  }
  return true
}

/**
 * targets listesindeki her abone için doğru token'ı bulup mesajı gönderir.
 * user_bots'u tek seferde çekip Map'e koyarak N+1 RPC çağrısını önler.
 */
async function sendToTargets(supabase, targets, buildOpts) {
  const userBotIds = [...new Set(targets.filter(s => s.bot_id).map(s => s.bot_id))]

  const tokenByBotId = new Map()
  if (userBotIds.length) {
    const { data: bots } = await supabase
      .from('user_bots')
      .select('id, vault_secret_id, status')
      .in('id', userBotIds)

    for (const bot of bots || []) {
      if (bot.status !== 'active') continue // pasif/geçersiz botlara göndermeyi deneme
      const token = await decryptBotToken(supabase, bot.vault_secret_id)
      if (token) tokenByBotId.set(bot.id, token)
    }
  }

  return Promise.allSettled(
    targets.map(s => {
      // bot_id yoksa site botu (token undefined → sendTelegramMessage env'e düşer)
      const token = s.bot_id ? tokenByBotId.get(s.bot_id) : undefined
      if (s.bot_id && !token) return Promise.resolve({ ok: false, error: 'bot_token_unavailable' })
      return sendTelegramMessage(buildOpts.text, { ...buildOpts.opts, chatId: s.chat_id, token })
    })
  )
}

export async function POST(request) {
  try {
    const check = verifyWebhookSecret(request)
    if (!check.ok) return Response.json(check.body, { status: check.status })

    const supabase = createAdminClient()

    const payload = await request.json()
    const { type, table, record } = payload || {}
    if (!record) return Response.json({ ok: true, skipped: 'no_record' })

    // Tüm aktif aboneleri çek (anlık mod istekleri az olduğundan tek sorgu yeterli)
    const { data: subscribers } = await supabase
      .from('telegram_subscribers')
      .select('*')
      .eq('is_active', true)

    if (!subscribers?.length) {
      return Response.json({ ok: true, skipped: 'no_subscribers' })
    }

    if (table === 'news_items' && type === 'INSERT') {
      const targets = subscribers.filter(s => subscriberWants(s, record.impact_level, record.tickers))
      const text = buildNewsMessage(record)
      const replyMarkup = {
        inline_keyboard: [[{ text: '⭐ Kaydet', callback_data: `save:${record.id}` }]],
      }
      const results = await sendToTargets(supabase, targets, { text, opts: { replyMarkup } })
      return Response.json({ ok: true, sent: results.filter(r => r.value?.ok).length, total: targets.length })
    }

    if (table === 'economic_events' && (type === 'INSERT' || type === 'UPDATE')) {
      if (!isUpcomingHighImpact(record)) {
        return Response.json({ ok: true, skipped: 'not_upcoming_high_impact' })
      }

      // ── Kalıcı kilit: in-memory Map yerine DB kolonu ──
      // Çoklu-instance deploy'da (Vercel gibi) her instance kendi belleğine
      // sahip olduğundan eski in-memory çözüm aynı olayı birden fazla kez
      // bildirebiliyordu. Artık economic_events.telegram_notified_at
      // kolonunu "conditional update" ile kilit gibi kullanıyoruz: satırı
      // sadece NULL ise güncelleyebiliriz, bu tek bir instance'ın kazanmasını
      // garanti eder (Postgres row-level atomicity).
      const { data: locked, error: lockErr } = await supabase
        .from('economic_events')
        .update({ telegram_notified_at: new Date().toISOString() })
        .eq('id', record.id)
        .is('telegram_notified_at', null)
        .select()

      if (lockErr || !locked?.length) {
        return Response.json({ ok: true, skipped: 'already_notified_or_lock_failed' })
      }

      const targets = subscribers.filter(s => subscriberWants(s, 'high', [record.currency]))
      const minutesLeft = Math.round((new Date(record.scheduled_at).getTime() - Date.now()) / 60000)
      const text = buildEventMessage(record, minutesLeft)

      const results = await sendToTargets(supabase, targets, { text, opts: {} })
      return Response.json({ ok: true, sent: results.filter(r => r.value?.ok).length, total: targets.length })
    }

    return Response.json({ ok: true, skipped: 'unhandled_table' })
  } catch (err) {
    console.error('Telegram notify webhook hata:', err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
