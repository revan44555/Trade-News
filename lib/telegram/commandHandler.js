// lib/telegram/commandHandler.js
//
// Telegram bot komutlarının (/start, /filtre, /durum, ⭐ kaydet vb.)
// ORTAK mantığı — hem site botu (app/api/telegram/webhook) hem de
// kullanıcıların kendi botları (app/api/telegram/user-webhook/[botId])
// bu fonksiyonu çağırır.
//
// Neden ortak? Site botunda da, kullanıcı botlarında da aynı özellikler
// (haber/takvim bildirimi, filtre, günlük özet, kaydetme) çalışmalı —
// tek bir yerde tutmak, biri güncellenip diğerinin unutulmasını önler.
//
// botId: null → site botu (telegram_subscribers.bot_id = NULL satırları)
//        <id> → kullanıcının kendi botu (bot_id = <id> satırları)
// Bu ayrım sayesinde aynı kişi hem site botuna hem kendi botuna farklı
// chat_id'lerle (ya da aynı chat_id ile, artık pkey (bot_id,chat_id) çifti
// olduğu için) bağımsız şekilde abone olabilir.

const IMPACT_LABELS = { high: '🔴 Yüksek', medium: '🟠 Orta', low: '🟡 Düşük' }

function filterKeyboard(active) {
  const row = ['high', 'medium', 'low'].map(level => ({
    text: `${active.includes(level) ? '✅' : '⬜'} ${IMPACT_LABELS[level]}`,
    callback_data: `filtre:${level}`,
  }))
  return { inline_keyboard: [row] }
}

async function getOrCreateSubscriber(supabase, botId, chatId, username) {
  const { data } = await supabase
    .from('telegram_subscribers')
    .select('*')
    .eq('bot_id', botId)
    .eq('chat_id', chatId)
    .maybeSingle()

  if (data) return data

  const { data: created } = await supabase
    .from('telegram_subscribers')
    .insert({ bot_id: botId, chat_id: chatId, username })
    .select()
    .single()

  return created
}

/**
 * @param {object} ctx
 * @param {object} ctx.supabase   - admin (service role) client
 * @param {function} ctx.tg       - (method, body) => Telegram API çağrısı yapan fonksiyon
 * @param {number|null} ctx.botId - null: site botu, id: kullanıcı botu
 * @param {object} ctx.update     - Telegram'dan gelen ham update objesi
 * @param {string} ctx.botLabel   - karşılama mesajında gösterilecek bot adı
 */
export async function handleTelegramUpdate({ supabase, tg, botId, update, botLabel = 'Market Wire' }) {
  function sendText(chatId, text, extra = {}) {
    return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra })
  }
  function answerCallback(id, text) {
    return tg('answerCallbackQuery', { callback_query_id: id, text, show_alert: false })
  }

  // ── Buton tıklaması (callback_query) ──
  if (update.callback_query) {
    const cq = update.callback_query
    const chatId = cq.message.chat.id
    const sub = await getOrCreateSubscriber(supabase, botId, chatId, cq.from.username)

    if (cq.data.startsWith('filtre:')) {
      const level = cq.data.split(':')[1]
      const current = new Set(sub.impact_filter || [])
      current.has(level) ? current.delete(level) : current.add(level)
      const updatedFilter = [...current]

      await supabase
        .from('telegram_subscribers')
        .update({ impact_filter: updatedFilter })
        .eq('bot_id', botId).eq('chat_id', chatId)

      await tg('editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: cq.message.message_id,
        reply_markup: filterKeyboard(updatedFilter),
      })
      await answerCallback(cq.id, `Filtre güncellendi: ${updatedFilter.join(', ') || 'hiçbiri'}`)
      return { ok: true }
    }

    if (cq.data.startsWith('save:')) {
      const newsId = cq.data.split(':')[1]
      const { error } = await supabase
        .from('saved_news')
        .upsert(
          { news_id: newsId, telegram_chat_id: chatId },
          { onConflict: 'news_id,telegram_chat_id', ignoreDuplicates: true }
        )
      await answerCallback(cq.id, error ? 'Kaydedilemedi' : '⭐ Kaydedildi')
      return { ok: true }
    }

    await answerCallback(cq.id, '')
    return { ok: true }
  }

  // ── Metin komutu ──
  const msg = update.message
  if (!msg?.text) return { ok: true, skipped: 'no_text' }

  const chatId = msg.chat.id
  const text = msg.text.trim()

  if (text.startsWith('/start')) {
    await getOrCreateSubscriber(supabase, botId, chatId, msg.from?.username)
    await sendText(chatId,
      `👋 <b>${botLabel} botuna hoş geldin.</b>\n\n` +
      `Varsayılan olarak <b>yüksek</b> ve <b>orta</b> etkili haberler + yaklaşan yüksek etkili takvim olayları sana gelecek.\n\n` +
      `Komutlar:\n` +
      `/filtre — hangi etki seviyelerini alacağını seç\n` +
      `/ozet_ac — anlık yerine günlük özet moduna geç\n` +
      `/ozet_kapat — günlük özeti kapat, anlık bildirime dön\n` +
      `/durdur — bildirimleri geçici olarak kes\n` +
      `/devam — bildirimleri tekrar aç\n` +
      `/durum — mevcut ayarlarını göster\n` +
      `/kaydedilenler — ⭐ ile kaydettiğin haberleri listele`)
    return { ok: true }
  }

  if (text.startsWith('/durdur')) {
    await supabase.from('telegram_subscribers').update({ is_active: false }).eq('bot_id', botId).eq('chat_id', chatId)
    await sendText(chatId, '🔕 Bildirimler durduruldu. Tekrar açmak için /devam yaz.')
    return { ok: true }
  }

  if (text.startsWith('/devam')) {
    await supabase.from('telegram_subscribers').update({ is_active: true }).eq('bot_id', botId).eq('chat_id', chatId)
    await sendText(chatId, '🔔 Bildirimler tekrar açık.')
    return { ok: true }
  }

  if (text.startsWith('/filtre')) {
    const sub = await getOrCreateSubscriber(supabase, botId, chatId, msg.from?.username)
    await sendText(chatId, 'Almak istediğin etki seviyelerini seç:', {
      reply_markup: filterKeyboard(sub.impact_filter || []),
    })
    return { ok: true }
  }

  if (text.startsWith('/ozet_ac')) {
    await supabase.from('telegram_subscribers').update({ digest_mode: true }).eq('bot_id', botId).eq('chat_id', chatId)
    await sendText(chatId, '📋 Günlük özet modu açıldı. Artık anlık yerine her sabah özet alacaksın.')
    return { ok: true }
  }

  if (text.startsWith('/ozet_kapat')) {
    await supabase.from('telegram_subscribers').update({ digest_mode: false }).eq('bot_id', botId).eq('chat_id', chatId)
    await sendText(chatId, '⚡ Anlık bildirim moduna dönüldü.')
    return { ok: true }
  }

  if (text.startsWith('/durum')) {
    const sub = await getOrCreateSubscriber(supabase, botId, chatId, msg.from?.username)
    await sendText(chatId,
      `<b>Mevcut ayarların:</b>\n` +
      `Durum: ${sub.is_active ? '🔔 Aktif' : '🔕 Durduruldu'}\n` +
      `Filtre: ${(sub.impact_filter || []).join(', ') || 'yok'}\n` +
      `Mod: ${sub.digest_mode ? '📋 Günlük özet' : '⚡ Anlık'}`)
    return { ok: true }
  }

  if (text.startsWith('/kaydedilenler')) {
    const { data: saved } = await supabase
      .from('saved_news')
      .select('news_id, created_at, news_items(title, url)')
      .eq('telegram_chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(10)

    if (!saved?.length) {
      await sendText(chatId, 'Henüz kaydettiğin haber yok. Bir habere gelen ⭐ butonuna basarak kaydedebilirsin.')
      return { ok: true }
    }

    const lines = saved.map(s =>
      `⭐ ${s.news_items?.title || '(silinmiş haber)'}` +
      (s.news_items?.url ? `\n<a href="${s.news_items.url}">Habere git →</a>` : '')
    ).join('\n\n')

    await sendText(chatId, `<b>Son kaydettiklerin:</b>\n\n${lines}`, { disable_web_page_preview: true })
    return { ok: true }
  }

  return { ok: true, skipped: 'unknown_command' }
}
