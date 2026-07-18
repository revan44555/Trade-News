// lib/security/verifyWebhookSecret.js
//
// Tüm backend-only endpoint'ler (cron, telegram webhook/notify/digest)
// için ORTAK ve ZORUNLU secret doğrulaması.
//
// Önceki davranış: secret env değişkeni tanımlı DEĞİLSE kontrol tamamen
// atlanıyordu ("if (secret) { ... }") — yani kurulumu yarım bırakan biri
// farkında olmadan endpoint'i herkese açık bırakıyordu. Bu artık bir güvenlik
// açığı olarak kabul ediliyor: secret tanımlı değilse istek reddedilir,
// sessizce izin verilmez.
//
// Karşılaştırma timing-attack'e karşı sabit zamanlı (crypto.timingSafeEqual)
// yapılır.

import crypto from 'crypto'

/**
 * İki secret'ı sabit-zamanlı (timing-safe) karşılaştırır. Boş/undefined
 * girdilerde false döner (asla "boş == boş" diye eşleştirmez).
 *
 * Kullanıcı botları webhook'u (app/api/telegram/user-webhook/[botId])
 * gibi, secret'ın env değil DB'den geldiği durumlar için export edildi.
 */
export function verifyWebhookSecretValue(provided, expected) {
  if (!provided || !expected) return false

  const a = Buffer.from(String(provided))
  const b = Buffer.from(String(expected))

  // Uzunluk farklıysa timingSafeEqual hata fırlatır; önce onu eliyoruz.
  // (Uzunluk sızıntısı burada pratikte önemsiz, ama yine de sabit-zamanlı
  // bir yol izlemek için iki taraflı hash karşılaştırması kullanıyoruz.)
  const aHash = crypto.createHash('sha256').update(a).digest()
  const bHash = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(aHash, bHash)
}

/**
 * @param {Request} request
 * @param {string} headerName - örn. 'x-webhook-secret'
 * @returns {{ ok: true } | { ok: false, status: number, body: object }}
 */
export function verifyWebhookSecret(request, headerName = 'x-webhook-secret') {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET

  if (!expected) {
    console.error(
      `[security] TELEGRAM_WEBHOOK_SECRET tanımlı değil — istek reddedildi. ` +
      `Bu endpoint'i kullanmak için .env içine TELEGRAM_WEBHOOK_SECRET eklenmeli.`
    )
    return {
      ok: false,
      status: 503,
      body: { error: 'server_misconfigured', message: 'Webhook secret tanımlı değil.' },
    }
  }

  const provided = request.headers.get(headerName) || ''

  if (!verifyWebhookSecretValue(provided, expected)) {
    return { ok: false, status: 401, body: { error: 'unauthorized' } }
  }

  return { ok: true }
}
