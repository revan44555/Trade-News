// app/api/telegram/user-webhook/[botId]/route.js
//
// Kullanıcıların KENDİ Telegram botları için webhook. Site botundan
// (app/api/telegram/webhook) farkı: token sabit değil, URL'deki botId
// (user_bots.id) üzerinden DB'den bulunuyor ve Vault'tan çözülüyor.
//
// GÜVENLİK:
//   - Her kullanıcı botunun KENDİNE ÖZGÜ bir webhook_secret'ı var
//     (user_bots.webhook_secret, setWebhook çağrısında Telegram'a
//     verildi). Gelen isteğin gerçekten Telegram'dan ve gerçekten BU
//     bota ait olduğunu doğrulamak için X-Telegram-Bot-Api-Secret-Token
//     header'ı, bu satırın webhook_secret'ıyla sabit-zamanlı karşılaştırılır
//     (bkz. verifyWebhookSecret — site botuyla aynı fonksiyon, ama
//     karşılaştırılan secret artık DB'den, request bazlı okunuyor).
//   - botId geçersiz/bulunamayan bir id ise, ya da bot 'disabled'/'invalid'
//     durumdaysa istek sessizce 200 ile reddedilir (Telegram'a hata
//     döndürmek retry'a yol açar; bilgi sızdırmamak için 404 yerine 200
//     ok:false tercih edildi — botId zaten tahmin edilmesi zor, sıralı
//     bir bigint, ama yine de dışarıya "bu id var/yok" bilgisini ayırt
//     ettirmemek daha güvenli).

export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { verifyWebhookSecretValue } from '@/lib/security/verifyWebhookSecret'
import { handleTelegramUpdate } from '@/lib/telegram/commandHandler'
import { decryptBotToken } from '@/lib/telegram/userBots'

async function tgWith(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function POST(request, { params }) {
  try {
    const botId = Number(params.botId)
    if (!Number.isInteger(botId) || botId <= 0) {
      return Response.json({ ok: false }, { status: 200 })
    }

    const supabase = createAdminClient()

    const { data: bot } = await supabase
      .from('user_bots')
      .select('id, vault_secret_id, webhook_secret, status, bot_username')
      .eq('id', botId)
      .maybeSingle()

    if (!bot || bot.status === 'disabled') {
      return Response.json({ ok: false }, { status: 200 })
    }

    // Bu botun kendi secret'ıyla sabit-zamanlı karşılaştırma — sahte
    // istekleri (Telegram olmayan biri bu URL'i tahmin edip POST atarsa)
    // eler.
    const headerSecret = request.headers.get('x-telegram-bot-api-secret-token') || ''
    if (!verifyWebhookSecretValue(headerSecret, bot.webhook_secret)) {
      return Response.json({ ok: false }, { status: 200 })
    }

    const token = await decryptBotToken(supabase, bot.vault_secret_id)
    if (!token) {
      return Response.json({ ok: false }, { status: 200 })
    }

    const update = await request.json()

    const result = await handleTelegramUpdate({
      supabase,
      tg: (method, body) => tgWith(token, method, body),
      botId: bot.id,
      update,
      botLabel: `@${bot.bot_username}`,
    })

    return Response.json(result)
  } catch (err) {
    console.error('Kullanıcı botu webhook hata:', err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
