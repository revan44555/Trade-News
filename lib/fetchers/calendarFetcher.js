import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'

// GÜVENLİK: Bu dosya arka planda (cron) çalışan, kullanıcı isteğiyle tetiklenmeyen
// bir fetcher — upsert yapabilmesi için admin (service role) client gerekli.
// Sadece burada ve diğer lib/fetchers/*.js dosyalarında admin client kullanılmalı.
//
// Bug fix: createAdminClient() eskiden modül yüklenirken (import zamanında)
// çağrılıyordu. SUPABASE_SERVICE_ROLE_KEY tanımlı değilse bu, dosya import
// edilir edilmez hata fırlatıyordu. Artık client yalnızca gerçekten
// kullanıldığında oluşturuluyor (createAdminClient() zaten memoize ediyor).
function getSupabase() {
  return createAdminClient()
}

const COUNTRY_TO_CURRENCY = {
  USD:'USD', EUR:'EUR', GBP:'GBP', JPY:'JPY', AUD:'AUD', CAD:'CAD',
  CHF:'CHF', NZD:'NZD', CNY:'CNY', ALL:'ALL',
  US:'USD', EU:'EUR', GB:'GBP', JP:'JPY', AU:'AUD', CA:'CAD',
  CH:'CHF', NZ:'NZD', CN:'CNY', DE:'EUR', FR:'EUR', IT:'EUR',
  ES:'EUR', NL:'EUR', BE:'EUR', FI:'EUR', IE:'EUR', PT:'EUR',
  GR:'EUR', AT:'EUR', SK:'EUR', LT:'EUR', LV:'EUR', EE:'EUR',
  SE:'SEK', NO:'NOK', DK:'DKK', SG:'SGD', HK:'HKD', KR:'KRW',
  IN:'INR', BR:'BRL', MX:'MXN', ZA:'ZAR', TR:'TRY', PL:'PLN',
  HU:'HUF', CZ:'CZK', RU:'RUB', RO:'RON', ID:'IDR', TH:'THB',
}

function toCurrency(raw) {
  if (!raw) return ''
  const r = raw.trim()
  return COUNTRY_TO_CURRENCY[r] || r
}

function mapImpact(impact) {
  if (!impact) return 'low'
  const v = impact.toString().toLowerCase().trim()
  if (v === 'high'   || v === '3') return 'high'
  if (v === 'medium' || v === '2') return 'medium'
  // 'holiday' DB constraint'ı ihlal edebilir — 'low' olarak map et
  if (v === 'holiday')             return 'low'
  if (v === 'low'    || v === '1') return 'low'
  return 'low'
}

async function fetchWeekJson(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, */*',
      },
    })
    if (!res.ok) { console.warn(`FF JSON [${url}]: ${res.status}`); return [] }
    const data = await res.json()
    if (!Array.isArray(data)) return []
    console.log(`✓ FF JSON: ${data.length} event (${url})`)
    return data
  } catch (err) {
    console.error(`FF JSON fetch error [${url}]:`, err.message)
    return []
  }
}

function parseJsonEvent(event) {
  const title    = event.title   || 'Unknown'
  const country  = event.country || ''
  const currency = toCurrency(country)
  const date     = event.date    || ''

  let scheduled_at
  try {
    // ForexFactory tarih stringi zaten UTC — doğrudan parse güvenli
    const d = new Date(date)
    scheduled_at = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
  } catch {
    scheduled_at = new Date().toISOString()
  }

  return {
    event_name:   title,
    country,
    currency,
    impact_level: mapImpact(event.impact),
    scheduled_at,
    actual:   event.actual   && event.actual   !== '' ? String(event.actual)   : null,
    forecast: event.forecast && event.forecast !== '' ? String(event.forecast) : null,
    previous: event.previous && event.previous !== '' ? String(event.previous) : null,
    unit:     null,
    event_hash: crypto.createHash('md5').update(`ff-${title}-${date}-${currency}`).digest('hex'),
  }
}

export async function fetchEconomicCalendar() {
  console.log('📅 Calendar fetch başladı...')

  // Geçen hafta + bu hafta + gelecek hafta — paralel çek
  // lastweek olmadan UI varsayılan penceresi (-7 ~ +14 gün) eksik kalıyordu
  const [lastWeek, thisWeek, nextWeek] = await Promise.all([
    fetchWeekJson('https://nfs.faireconomy.media/ff_calendar_lastweek.json'),
    fetchWeekJson('https://nfs.faireconomy.media/ff_calendar_thisweek.json'),
    fetchWeekJson('https://nfs.faireconomy.media/ff_calendar_nextweek.json'),
  ])

  const allRaw = [...lastWeek, ...thisWeek, ...nextWeek]
  if (allRaw.length === 0) {
    console.log('Calendar: hiç event gelmedi')
    return
  }

  const seen   = new Set()
  const unique = allRaw.map(parseJsonEvent).filter(e => {
    if (seen.has(e.event_hash)) return false
    seen.add(e.event_hash)
    return true
  })

  // Upsert — var olanı güncelle (actual/forecast/previous değerleri güncellenir)
  const supabase = getSupabase()
  const { error } = await supabase
    .from('economic_events')
    .upsert(unique, { onConflict: 'event_hash', ignoreDuplicates: false })

  if (error) console.error('Calendar insert error:', error.message)
  else console.log(`✅ Calendar: ${unique.length} event upserted`)
}
