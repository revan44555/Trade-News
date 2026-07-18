// app/api/telegram/webhook/route.js
//
// SİTE BOTU için webhook — env'deki TELEGRAM_BOT_TOKEN ile çalışan,
// herkesin ortaklaşa abone olduğu "resmi" bot. Kullanıcıların KENDİ
// botları için ayrı bir endpoint var: app/api/telegram/user-webhook/[botId].
//
// Komut mantığının kendisi (yani /start, /filtre, /durum vb.) artık
// lib/telegram/commandHandler.js içinde, iki webhook türü de aynı
// mantığı kullanıyor — botId=null burada "site botu" anlamına gelir.
//
// BotFather ile bot oluşturduktan sonra bu URL'i Telegram'a webhook
// olarak bildirmen gerekir (bkz. dosya sonundaki kurulum notu).

export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { verifyWebhookSecret } from '@/lib/security/verifyWebhookSecret'
import { handleTelegramUpdate } from '@/lib/telegram/commandHandler'

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

async function tg(method, body) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function POST(request) {
  try {
    const check = verifyWebhookSecret(request, 'x-telegram-bot-api-secret-token')
    if (!check.ok) return Response.json(check.body, { status: check.status })

    const supabase = createAdminClient()
    const update = await request.json()

    const result = await handleTelegramUpdate({
      supabase,
      tg,
      botId: null, // site botu: telegram_subscribers.bot_id = NULL satırları
      update,
      botLabel: 'Market Wire',
    })

    return Response.json(result)
  } catch (err) {
    console.error('Telegram webhook hata:', err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────
// KURULUM:
// Deploy sonrası bir kere şunu çalıştır (TOKEN ve SENIN-SITEN'i doldur):
//
//   curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
//     -d url=https://SENIN-SITEN/api/telegram/webhook \
//     -d secret_token=<TELEGRAM_WEBHOOK_SECRET>
//
// Bu, Telegram'a "her yeni mesajda bu URL'e POST at" der.
// getUpdates ile polling yapmaya gerek kalmaz.
// ─────────────────────────────────────────────────────────────
