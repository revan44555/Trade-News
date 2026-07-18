// lib/telegram/userBots.js
//
// Kullanıcının kendi getirdiği Telegram bot token'ını doğrulama, Vault'a
// şifreleyerek kaydetme, Telegram'a webhook bağlama ve gerektiğinde
// (notify/digest gönderirken) token'ı çözüp okuma işlemlerini toplar.
//
// Token asla düz metin olarak user_bots tablosuna yazılmaz — sadece
// Vault'taki bir secret'a referans (vault_secret_id) tutulur. Çözme
// işlemi supabase/user_bots_migration.sql içindeki decrypt_user_bot_token()
// RPC fonksiyonu ile yapılır ve bu fonksiyon sadece service_role
// tarafından çağrılabilir.

import crypto from 'crypto'

const TELEGRAM_API = 'https://api.telegram.org'

// Bot token formatı: "<digits>:<35 char alfanumerik>" — BotFather'ın
// verdiği tüm token'lar bu kalıba uyar. Bu sadece bariz hatalı
// girdileri (boş, kopyala-yapıştır hatası) erken elemek için —
// gerçek doğrulama Telegram'a atılan getMe isteğiyle yapılır.
const TOKEN_SHAPE = /^\d{6,}:[A-Za-z0-9_-]{30,}$/

export function looksLikeBotToken(token) {
  return typeof token === 'string' && TOKEN_SHAPE.test(token.trim())
}

/**
 * Telegram'a getMe isteği atarak token'ın gerçekten çalışan bir bota ait
 * olduğunu doğrular. Başarılıysa bot'un username'ini döner.
 */
export async function verifyBotToken(token) {
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/getMe`)
    const data = await res.json()
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.description || `HTTP ${res.status}` }
    }
    if (!data.result?.is_bot || !data.result?.username) {
      return { ok: false, error: 'Bu token bir bota değil, farklı bir hesaba ait görünüyor.' }
    }
    return { ok: true, username: data.result.username }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/**
 * Telegram'a "her yeni mesajda şu URL'e POST at" der. secretToken,
 * webhook isteklerini doğrulamak için Telegram'ın bize geri göndereceği
 * X-Telegram-Bot-Api-Secret-Token header'ıdır (her kullanıcı botu için
 * ayrı, rastgele üretilir — bkz. generateBotWebhookSecret).
 */
export async function setBotWebhook(token, webhookUrl, secretToken) {
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, secret_token: secretToken }),
    })
    const data = await res.json()
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.description || `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/** Bot silinirken/değiştirilirken Telegram tarafındaki webhook'u da temizler. */
export async function deleteBotWebhook(token) {
  try {
    await fetch(`${TELEGRAM_API}/bot${token}/deleteWebhook`, { method: 'POST' })
  } catch {
    // Token zaten geçersizse (kullanıcı botu silmişse) burada hata almak
    // normal — sessizce yut, DB tarafındaki silme işlemi zaten devam eder.
  }
}

/** Her kullanıcı botu için ayrı, rastgele bir webhook secret üretir. */
export function generateBotWebhookSecret() {
  return crypto.randomBytes(24).toString('hex')
}

/**
 * DB'de saklanan vault_secret_id'den gerçek token'ı çözer.
 * SADECE admin (service role) client ile çağrılmalı.
 */
export async function decryptBotToken(supabaseAdmin, vaultSecretId) {
  const { data, error } = await supabaseAdmin
    .rpc('decrypt_user_bot_token', { p_secret_id: vaultSecretId })
  if (error) {
    console.error('decrypt_user_bot_token hata:', error.message)
    return null
  }
  return data || null
}

/**
 * Yeni token'ı Vault'a şifreleyerek yazar, secret id döner.
 * SADECE admin (service role) client ile çağrılmalı.
 */
export async function encryptBotToken(supabaseAdmin, token, description) {
  const { data, error } = await supabaseAdmin
    .rpc('encrypt_user_bot_token', { p_token: token, p_description: description })
  if (error) {
    console.error('encrypt_user_bot_token hata:', error.message)
    return null
  }
  return data || null
}

/** Vault'taki secret'ı siler (bot kaldırılırken/değiştirilirken). */
export async function deleteBotTokenSecret(supabaseAdmin, vaultSecretId) {
  const { error } = await supabaseAdmin
    .rpc('delete_user_bot_secret', { p_secret_id: vaultSecretId })
  if (error) console.error('delete_user_bot_secret hata:', error.message)
}
