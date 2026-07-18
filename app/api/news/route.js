export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'

// GÜVENLİK: Bu route herkese açık, kimlik doğrulaması olmayan bir okuma
// endpoint'i. Önceden SUPABASE_SERVICE_ROLE_KEY kullanıyordu — bu RLS'i
// tamamen bypass ediyordu ve gereksiz bir "en az yetki" ihlaliydi (salt
// okuma yapan bir endpoint'in RLS bypass etmeye ihtiyacı yok). Artık anon
// key kullanılıyor; erişim, Supabase tarafında news_items/news_sources
// tabloları üzerinde tanımlı "herkes okuyabilir" RLS politikasıyla sınırlı.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const asset   = searchParams.get('asset')
  const ticker  = searchParams.get('ticker')
  const impact  = searchParams.get('impact')
  // limit'i makul bir aralıkta tut — sınırsız değer DB'ye aşırı yük bindirebilir
  const rawLimit = parseInt(searchParams.get('limit') || '100')
  const limit    = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 100
  const rawPage  = parseInt(searchParams.get('page') || '0')
  const page     = Number.isFinite(rawPage) && rawPage >= 0 ? rawPage : 0

  // ✅ news_sources join eklendi — kaynak adı için
  let query = supabase
    .from('news_items')
    .select('*, news_sources(name)')
    .order('published_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)

  if (asset  && asset  !== 'all') query = query.contains('asset_types', [asset])
  if (ticker)                     query = query.contains('tickers', [ticker])
  if (impact)                     query = query.eq('impact_level', impact)

  const { data, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data, count: data.length })
}
