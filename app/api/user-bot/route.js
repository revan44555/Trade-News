// app/api/user-bot/route.js
//
// Google ile giriş yapmış kullanıcının kendi Telegram bot token'ını
// ekleme (POST), durumunu görme (GET) ve kaldırma (DELETE) uçları.
//
// GÜVENLİK ÖZETİ:
//   - Google girişi zorunlu (requireUser) — token asla kimliksiz
//     eklenemez, "1 hesap = 1 bot" kuralı DB'de unique(user_id) ile
//     de garanti altına alınmış.
//   - Token, Telegram'a getMe isteğiyle önce gerçekten çalışıp
//     çalışmadığı doğrulanır, sonra Vault'a ŞİFRELENEREK yazılır —
//     düz metin hiçbir zaman tabloya girmez.
//   - Bu route, RLS'e tabi normal client (createClient) ile kullanıcıyı
//     doğrular, ama Vault RPC'lerini ve user_bots insert/update/delete
//     işlemlerini admin (service role) client ile yapar — çünkü bu
//     tabloya anon/authenticated'in yazma izni yok (bkz. migration).
//     Kullanıcı kimliği (user.id) her admin sorgusunda elle .eq('user_id', ...)
//     ile filtrelenerek "kullanıcı sadece kendi kaydını değiştirebilir"
//     kuralı burada da (RLS'in bypass edildiği bu route içinde) korunur.

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrigin } from '@/lib/http/resolveOrigin'
import {
  looksLikeBotToken,
  verifyBotToken,
  setBotWebhook,
  deleteBotWebhook,
  generateBotWebhookSecret,
  encryptBotToken,
  decryptBotToken,
  deleteBotTokenSecret,
} from '@/lib/telegram/userBots'

async function requireUser(supabase) {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

// Kullanıcıya asla vault_secret_id, webhook_secret gibi iç alanları
// döndürmüyoruz — sadece UI'ın ihtiyacı olan alanlar.
function publicBotView(bot) {
  if (!bot) return null
  return {
    bot_username: bot.bot_username,
    status: bot.status,
    last_error: bot.last_error,
    has_chat: !!bot.telegram_chat_id,
    created_at: bot.created_at,
  }
}

export async function GET() {
  const supabase = await createClient()
  const user = await requireUser(supabase)
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: bot, error } = await admin
    .from('user_bots')
    .select('bot_username, status, last_error, telegram_chat_id, created_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data: publicBotView(bot) })
}

export async function POST(request) {
  const supabase = await createClient()
  const user = await requireUser(supabase)
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const token = body?.token?.trim()

  if (!token || !looksLikeBotToken(token)) {
    return Response.json(
      { error: 'invalid_token_format', message: 'Bu bir Telegram bot token\'ına benzemiyor. @BotFather\'dan aldığın token\'ı olduğu gibi yapıştır.' },
      { status: 400 }
    )
  }

  // 1) Token gerçekten çalışıyor mu? (Telegram'a getMe isteği)
  const verify = await verifyBotToken(token)
  if (!verify.ok) {
    return Response.json(
      { error: 'token_verification_failed', message: `Telegram bu token'ı kabul etmedi: ${verify.error}` },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  // 2) Kullanıcının zaten bir botu var mı? (1 hesap = 1 bot kuralı —
  // varsa eskisini temizleyip yenisiyle değiştiriyoruz, "güncelleme"
  // gibi davranıyor kullanıcı için.)
  const { data: existing } = await admin
    .from('user_bots')
    .select('id, vault_secret_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    await deleteBotTokenSecret(admin, existing.vault_secret_id)
    // İlişkili telegram_subscribers satırı da (varsa) cascade ile silinecek
    // (bkz. migration: bot_id ... on delete cascade), user_bots satırını
    // silmek yeterli.
    await admin.from('user_bots').delete().eq('id', existing.id)
  }

  // 3) Token'ı Vault'a şifreleyerek yaz
  const vaultSecretId = await encryptBotToken(admin, token, `user_bot:${user.id}`)
  if (!vaultSecretId) {
    return Response.json({ error: 'encryption_failed' }, { status: 500 })
  }

  const webhookSecret = generateBotWebhookSecret()

  // 4) user_bots satırını oluştur (pending — henüz webhook bağlanmadı)
  const { data: created, error: insertErr } = await admin
    .from('user_bots')
    .insert({
      user_id: user.id,
      vault_secret_id: vaultSecretId,
      bot_username: verify.username,
      webhook_secret: webhookSecret,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertErr) {
    await deleteBotTokenSecret(admin, vaultSecretId)
    return Response.json({ error: insertErr.message }, { status: 500 })
  }

  // 5) Telegram'a webhook kaydet — URL'de bot satırının id'si var,
  // gelen her update bu id üzerinden doğru kullanıcıya eşleniyor
  // (bkz. app/api/telegram/user-webhook/[botId]/route.js).
  const origin = resolveOrigin(request, new URL(request.url).origin)
  const webhookUrl = `${origin}/api/telegram/user-webhook/${created.id}`

  const hookResult = await setBotWebhook(token, webhookUrl, webhookSecret)

  if (!hookResult.ok) {
    await admin.from('user_bots')
      .update({ status: 'invalid', last_error: hookResult.error })
      .eq('id', created.id)
    return Response.json(
      { error: 'webhook_setup_failed', message: hookResult.error },
      { status: 502 }
    )
  }

  await admin.from('user_bots')
    .update({ status: 'active', last_error: null })
    .eq('id', created.id)

  return Response.json({
    ok: true,
    data: { bot_username: verify.username, status: 'active' },
  })
}

export async function DELETE() {
  const supabase = await createClient()
  const user = await requireUser(supabase)
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('user_bots')
    .select('id, vault_secret_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existing) return Response.json({ ok: true, skipped: 'no_bot' })

  // Token'ı çözüp Telegram'a deleteWebhook gönderiyoruz (nazik temizlik —
  // başarısız olsa da DB tarafındaki silme işlemine devam ediyoruz).
  const token = await decryptBotToken(admin, existing.vault_secret_id)
  if (token) await deleteBotWebhook(token)

  await deleteBotTokenSecret(admin, existing.vault_secret_id)
  await admin.from('user_bots').delete().eq('id', existing.id)

  return Response.json({ ok: true })
}
