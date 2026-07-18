import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'

// Bug fix: createAdminClient() eskiden modül yüklenirken (import zamanında)
// çağrılıyordu. SUPABASE_SERVICE_ROLE_KEY tanımlı değilse bu, dosya import
// edilir edilmez hata fırlatıyordu. Artık client yalnızca gerçekten
// kullanıldığında oluşturuluyor (createAdminClient() zaten memoize ediyor).
function getSupabase() {
  return createAdminClient()
}

const FINNHUB_KEY = process.env.FINNHUB_API_KEY

const FOREX_PAIRS    = new Set(['EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CAD','USD/CHF','NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY'])
const CRYPTO_TICKERS = new Set(['BTC','ETH','SOL','BNB','XRP','DOGE','ADA'])
const STOCK_TICKERS  = new Set(['AAPL','TSLA','NVDA','MSFT','AMZN','GOOGL','META','SPX','NDX'])

const FINNHUB_SOURCE_NAMES = {
  general: 'Finnhub Markets',
  forex:   'Finnhub Forex',
  crypto:  'Finnhub Crypto',
}

// news_sources tablosundaki Finnhub kayıtlarını önbelleğe al
const _sourceIdCache = {}

async function getSourceId(category) {
  if (_sourceIdCache[category]) return _sourceIdCache[category]

  const supabase = getSupabase()
  const name = FINNHUB_SOURCE_NAMES[category]

  // Var mı bak
  const { data: existing } = await supabase
    .from('news_sources')
    .select('id')
    .eq('name', name)
    .single()

  if (existing?.id) {
    _sourceIdCache[category] = existing.id
    return existing.id
  }

  // Yoksa oluştur
  const { data: created, error } = await supabase
    .from('news_sources')
    .insert({ name, type: 'api', url: 'https://finnhub.io', is_active: true })
    .select('id')
    .single()

  if (error) {
    console.error(`Finnhub source_id oluşturulamadı [${category}]:`, error.message)
    return null
  }

  _sourceIdCache[category] = created.id
  return created.id
}

function extractTickers(text) {
  const forexPairs = text.match(/\b(EUR|USD|GBP|JPY|AUD|CAD|CHF|NZD)\/(USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD)\b/g)?.filter(t => FOREX_PAIRS.has(t)) || []
  const cryptos    = text.match(/\b(BTC|ETH|SOL|BNB|XRP|DOGE|ADA)\b/g)?.filter(t => CRYPTO_TICKERS.has(t)) || []
  const stocks     = text.match(/\b[A-Z]{2,5}\b/g)?.filter(t => STOCK_TICKERS.has(t)) || []
  return [...new Set([...forexPairs, ...cryptos, ...stocks])]
}

function guessImpact(title) {
  if (/fed|rate decision|nfp|cpi|gdp|inflation|fomc|ecb|emergency|crash|crisis|trump|tariff|sanction|war|attack|default|recession|collapse|ban|executive order|nato|g7|g20|opec|geopolit/i.test(title)) return 'high'
  if (/jobless|pmi|retail|earnings|forecast|outlook|warning|powell|yellen|lagarde|boj|rba|rbnz|boe|snb|rate|hike|cut|pivot|debt|deficit|surplus|trade deal|election|vote/i.test(title)) return 'medium'
  return 'low'
}

function normalizeNewsItem(raw, sourceId, assetTypes = []) {
  const url   = raw.link || raw.url || ''
  const title = raw.title || ''
  const urlHash = crypto.createHash('md5').update(url || title).digest('hex')
  return {
    source_id:    sourceId,
    title:        title.trim(),
    summary:      raw.contentSnippet?.slice(0, 500) || null,
    url:          url || null,
    url_hash:     urlHash,
    asset_types:  assetTypes,
    tickers:      extractTickers(title),
    impact_level: guessImpact(title),
    published_at: new Date(raw.pubDate || new Date()).toISOString(),
  }
}

export async function fetchFinnhubNews() {
  if (!FINNHUB_KEY) { console.warn('FINNHUB_API_KEY eksik, atlanıyor'); return }

  const assetMap = {
    general: ['equity'],
    forex:   ['forex'],
    crypto:  ['crypto'],
  }

  for (const category of Object.keys(assetMap)) {
    try {
      // Her kategori için gerçek source_id al — null geçmiyoruz
      const sourceId = await getSourceId(category)

      const res = await fetch(
        `https://finnhub.io/api/v1/news?category=${category}&token=${FINNHUB_KEY}`
      )
      if (!res.ok) throw new Error(`Finnhub ${category}: ${res.status}`)

      const data = await res.json()
      if (!Array.isArray(data)) {
        console.warn(`Finnhub ${category}: beklenmeyen yanıt formatı`)
        continue
      }

      const normalized = data.slice(0, 15).map(item =>
        normalizeNewsItem(
          {
            title:          item.headline,
            link:           item.url,
            contentSnippet: item.summary,
            pubDate:        new Date(item.datetime * 1000).toISOString(),
          },
          sourceId,             // ✅ gerçek UUID
          assetMap[category]
        )
      )

      const { error } = await getSupabase()
        .from('news_items')
        .upsert(normalized, { onConflict: 'url_hash', ignoreDuplicates: true })

      if (error) console.error(`Finnhub insert [${category}]:`, error.message)
      else console.log(`✓ Finnhub ${category}: ${normalized.length} haber`)

      await new Promise(r => setTimeout(r, 1100))
    } catch (err) {
      console.error(`Finnhub fetch error [${category}]:`, err.message)
    }
  }
}
