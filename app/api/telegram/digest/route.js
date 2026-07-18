// app/api/telegram/digest/route.js
//
// Günlük özet gönderir. Harici bir cron servisi (Vercel Cron, cron-job.org
// vb.) tarafından her saat çağrılmalı; her abone kendi digest_hour_local
// saatine gelince özeti alır — böylece herkes kendi saat diliminde sabah
// özeti görür.
//
// Vercel Cron örneği (vercel.json):
//   { "crons": [{ "path": "/api/telegram/digest", "schedule": "0 * * * *" }] }

export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { verifyWebhookSecret } from '@/lib/security/verifyWebhookSecret'
import { sendTelegramMessage, escapeHtml } from '@/lib/telegram/sendMessage'
import { decryptBotToken } from '@/lib/telegram/userBots'

function currentHourInTz(tz) {
  return Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz }).format(new Date()))
}

const IMPACT_EMOJI = { high: '🔴', medium: '🟠', low: '🟡' }

// GÜVENLİK: news_items.title ve economic_events.event_name RSS/Finnhub gibi
// DIŞ kaynaklardan geliyor — üçüncü şahıs kontrolünde, güvenilmez veri.
// parse_mode: 'HTML' ile gönderildiği için escape edilmezse bir kaynak,
// başlığa geçerli bir <a href="..."> etiketi koyarak günlük özete link/
// biçimlendirme enjekte edebilir (bkz. buildNewsMessage/buildEventMessage'daki
// aynı önlem). Burada da aynı escapeHtml kullanılmalı.
function buildDigestText(newsItems, events, lang) {
  const header = lang === 'English' ? '📋 <b>Daily Summary</b>' : '📋 <b>Günlük Özet</b>'
  const newsLines = newsItems.slice(0, 10).map(n =>
    `${IMPACT_EMOJI[n.impact_level] || '⚪'} ${escapeHtml(n.title)}`
  ).join('\n')
  const eventLines = events.slice(0, 8).map(e =>
    `⏱ ${escapeHtml(e.currency)} — ${escapeHtml(e.event_name)} (${new Date(e.scheduled_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })})`
  ).join('\n')

  return `${header}\n\n<b>Haberler</b>\n${newsLines || '—'}\n\n<b>Bugünkü Takvim</b>\n${eventLines || '—'}`
}

export async function GET(request) {
  try {
    // Cron servisinden gelen isteği zorunlu olarak doğrula (secret tanımsızsa reddet)
    const check = verifyWebhookSecret(request)
    if (!check.ok) return Response.json(check.body, { status: check.status })

    const supabase = createAdminClient()

    const { data: subscribers } = await supabase
      .from('telegram_subscribers')
      .select('*')
      .eq('is_active', true)
      .eq('digest_mode', true)

    if (!subscribers?.length) return Response.json({ ok: true, sent: 0 })

    // notify/route.js'deki sendToTargets ile aynı mantık: kullanıcı
    // botlarının token'larını tek seferde toplu çözüp Map'e koyuyoruz,
    // digest saatine gelen her abone için tekrar tekrar RPC çağırmıyoruz.
    const userBotIds = [...new Set(subscribers.filter(s => s.bot_id).map(s => s.bot_id))]
    const tokenByBotId = new Map()
    if (userBotIds.length) {
      const { data: bots } = await supabase
        .from('user_bots')
        .select('id, vault_secret_id, status')
        .in('id', userBotIds)
      for (const bot of bots || []) {
        if (bot.status !== 'active') continue
        const token = await decryptBotToken(supabase, bot.vault_secret_id)
        if (token) tokenByBotId.set(bot.id, token)
      }
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const untilTomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const [{ data: newsItems }, { data: events }] = await Promise.all([
      supabase.from('news_items').select('*').gte('created_at', since).order('created_at', { ascending: false }),
      supabase.from('economic_events').select('*').eq('impact_level', 'high')
        .gte('scheduled_at', new Date().toISOString()).lte('scheduled_at', untilTomorrow)
        .order('scheduled_at', { ascending: true }),
    ])

    let sentCount = 0
    for (const sub of subscribers) {
      const hour = currentHourInTz(sub.timezone || 'Europe/Istanbul')
      if (hour !== (sub.digest_hour_local ?? 8)) continue // sırası gelmemiş, atla

      // Kullanıcı botu ama token çözülemediyse (silinmiş/geçersiz) bu
      // aboneyi atla — site botu abonelerini (bot_id null) etkilemez.
      const token = sub.bot_id ? tokenByBotId.get(sub.bot_id) : undefined
      if (sub.bot_id && !token) continue

      const filteredNews = (newsItems || []).filter(n => sub.impact_filter?.includes(n.impact_level))
      const text = buildDigestText(filteredNews, events || [], sub.ai_lang)
      const result = await sendTelegramMessage(text, { chatId: sub.chat_id, disablePreview: true, token })
      if (result.ok) sentCount++
    }

    return Response.json({ ok: true, sent: sentCount, evaluated: subscribers.length })
  } catch (err) {
    console.error('Telegram digest hata:', err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
