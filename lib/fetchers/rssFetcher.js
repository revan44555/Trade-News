import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'

// Bug fix: createAdminClient() modül yüklenirken (import zamanında) çağrılıyordu.
// SUPABASE_SERVICE_ROLE_KEY tanımlı değilse bu, dosya import edilir edilmez
// (dolayısıyla startCron() her çağrıldığında) hata fırlatıyordu. Şimdi client
// yalnızca gerçekten kullanıldığında oluşturuluyor; createAdminClient() zaten
// kendi içinde memoize ediyor, bu yüzden performans kaybı yok.
function getSupabase() {
  return createAdminClient()
}

let _parser = null
async function getParser() {
  if (_parser) return _parser
  const { default: Parser } = await import('rss-parser')
  _parser = new Parser({ timeout: 10000, headers: { 'User-Agent': 'FinancialNewsBot/1.0' } })
  return _parser
}

const FOREX_PAIRS = new Set(['EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CAD','USD/CHF','NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY'])
const CRYPTO_TICKERS = new Set(['BTC','ETH','SOL','BNB','XRP','DOGE','ADA'])
const STOCK_TICKERS = new Set(['AAPL','TSLA','NVDA','MSFT','AMZN','GOOGL','META','SPX','NDX'])

function extractTickers(text) {
  const forexPairs = text.match(/\b(EUR|USD|GBP|JPY|AUD|CAD|CHF|NZD)\/(USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD)\b/g)?.filter(t => FOREX_PAIRS.has(t)) || []
  const cryptos = text.match(/\b(BTC|ETH|SOL|BNB|XRP|DOGE|ADA)\b/g)?.filter(t => CRYPTO_TICKERS.has(t)) || []
  const stocks = text.match(/\b[A-Z]{2,5}\b/g)?.filter(t => STOCK_TICKERS.has(t)) || []
  return [...new Set([...forexPairs, ...cryptos, ...stocks])]
}

function guessImpact(title) {
  if (/fed|rate decision|nfp|cpi|gdp|inflation|fomc|ecb|emergency|crash|crisis|trump|tariff|sanction|war|attack|default|recession|collapse|ban|executive order|nato|g7|g20|opec|geopolit/i.test(title)) return 'high'
  if (/jobless|pmi|retail|earnings|forecast|outlook|warning|powell|yellen|lagarde|boj|rba|rbnz|boe|snb|rate|hike|cut|pivot|debt|deficit|surplus|trade deal|election|vote/i.test(title)) return 'medium'
  return 'low'
}

function normalizeNewsItem(raw, sourceId, assetTypes = []) {
  const url = raw.link || raw.url || ''
  const title = raw.title || ''
  const published = raw.pubDate || raw.isoDate || new Date().toISOString()
  const urlHash = crypto.createHash('md5').update(url || title).digest('hex')
  return {
    source_id: sourceId,
    title: title.trim(),
    summary: raw.contentSnippet?.slice(0, 500) || null,
    url: url || null,
    url_hash: urlHash,
    asset_types: assetTypes,
    tickers: extractTickers(title + ' ' + (raw.contentSnippet || '')),
    impact_level: guessImpact(title),
    published_at: new Date(published).toISOString(),
  }
}

export async function fetchRssSources() {
  const supabase = getSupabase()
  const { data: sources, error } = await supabase
    .from('news_sources').select('*').eq('type', 'rss').eq('is_active', true)

  if (error) { console.error('Sources fetch error:', error); return }

  // Kitco kaldırıldı
  const BLOCKED_SOURCES = ['kitco.com']
  const activeSources = sources.filter(s =>
    !BLOCKED_SOURCES.some(blocked => s.url?.includes(blocked))
  )

  const parser = await getParser()

  for (const source of activeSources) {
    try {
      await fetchSingleRss(source, parser)
      await supabase.from('news_sources')
        .update({ last_fetched_at: new Date().toISOString() }).eq('id', source.id)
    } catch (err) {
      console.error(`RSS error [${source.name}]:`, err.message)
    }
  }
}

async function fetchSingleRss(source, parser) {
  const supabase = getSupabase()
  const feed = await parser.parseURL(source.url)
  const normalized = feed.items.slice(0, 20).map(item =>
    normalizeNewsItem(item, source.id, source.asset_types)
  )
  const { error } = await supabase.from('news_items')
    .upsert(normalized, { onConflict: 'url_hash', ignoreDuplicates: true })
  if (error) console.error(`Insert error [${source.name}]:`, error.message)
  else console.log(`✓ ${source.name}: ${normalized.length} haber işlendi`)
}
          
