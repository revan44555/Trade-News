// lib/telegram/sendMessage.js  (GÜNCELLENMİŞ)
//
// Artık tek bir sabit TELEGRAM_CHAT_ID yerine, her çağrıda hedef chatId
// parametre olarak veriliyor — böylece çoklu abone desteklenir.
//
// GÜNCELLEME — kullanıcı botları desteği:
// opts.token verilirse o token kullanılır (kullanıcının kendi botu),
// verilmezse eskisi gibi process.env.TELEGRAM_BOT_TOKEN'a (site botu)
// düşülür. Böylece mevcut tüm çağrı yerleri (notify/digest/webhook)
// hiçbir değişiklik yapmadan çalışmaya devam eder — sadece kullanıcı
// botlarını da göndermek isteyen yeni kod opts.token'ı açıkça verir.

const TELEGRAM_API = 'https://api.telegram.org'

// export edildi: digest/route.js gibi dış kaynaklı metin basan diğer
// yerler de aynı escape mantığını kullanmalı — kopyalanmış bir ikinci
// implementasyon, biri güncellenip diğeri unutulduğunda tutarsızlığa yol açar.
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Telegram'a HTML formatlı bir mesaj gönderir.
 * @param {string} text
 * @param {object} opts - { chatId?: string|number, token?: string, disablePreview?: boolean, replyMarkup?: object }
 */
export async function sendTelegramMessage(text, opts = {}) {
  const token  = opts.token ?? process.env.TELEGRAM_BOT_TOKEN
  const chatId = opts.chatId ?? process.env.TELEGRAM_CHAT_ID // geriye dönük uyumluluk

  if (!token || !chatId) {
    console.warn('Telegram: bot token veya chatId eksik, gönderim atlanıyor')
    return { ok: false, error: 'missing_config' }
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: opts.disablePreview ?? false,
        ...(opts.replyMarkup ? { reply_markup: opts.replyMarkup } : {}),
      }),
    })

    const data = await res.json()
    if (!res.ok || !data.ok) {
      console.error(`Telegram sendMessage hata (chat ${chatId}):`, data.description || res.status)
      // 403 = bot bloklanmış / kanaldan çıkarılmış → aboneyi pasif işaretlemek isteyebilirsin
      return { ok: false, error: data.description || `HTTP ${res.status}`, code: data.error_code }
    }
    return { ok: true }
  } catch (err) {
    console.error('Telegram sendMessage exception:', err.message)
    return { ok: false, error: err.message }
  }
}

const IMPACT_EMOJI = { high: '🔴', medium: '🟠', low: '🟡' }

/** Haber öğesini Telegram mesaj metnine dönüştürür (gönderim ayrı). */
export function buildNewsMessage(item) {
  const emoji  = IMPACT_EMOJI[item.impact_level] || '⚪'
  const tickers = Array.isArray(item.tickers) && item.tickers.length
    ? `\n<code>${item.tickers.map(escapeHtml).join(' · ')}</code>`
    : ''

  return `${emoji} <b>${escapeHtml(item.title)}</b>${tickers}` +
    (item.url ? `\n\n<a href="${escapeHtml(item.url)}">Habere git →</a>` : '')
}

/** Yaklaşan ekonomik takvim olayını mesaj metnine dönüştürür. */
export function buildEventMessage(ev, minutesLeft) {
  const label = minutesLeft >= 60
    ? `${Math.round(minutesLeft / 60)} saat`
    : `${minutesLeft} dakika`

  return `⏱ <b>${escapeHtml(ev.currency || '')} — ${escapeHtml(ev.event_name)}</b>\n` +
    `${label} kaldı` +
    (ev.forecast ? `\nBeklenti: <code>${escapeHtml(ev.forecast)}</code>` : '') +
    (ev.previous ? ` · Önceki: <code>${escapeHtml(ev.previous)}</code>` : '')
}

// Geriye dönük uyumluluk: eski çağıranlar için (varsayılan chatId ile)
export async function notifyNewsItem(item, chatId) {
  return sendTelegramMessage(buildNewsMessage(item), { chatId })
}
export async function notifyEconomicEvent(ev, minutesLeft, chatId) {
  return sendTelegramMessage(buildEventMessage(ev, minutesLeft), { chatId })
}
