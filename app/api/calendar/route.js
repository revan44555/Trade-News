export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'

// GÜVENLİK: bkz. app/api/news/route.js üzerindeki not — salt okuma yapan
// herkese açık endpoint'ler service role key değil, RLS'e tabi anon key
// kullanmalı.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const currency = searchParams.get('currency')
  const impact   = searchParams.get('impact')
  const from     = searchParams.get('from')
  const to       = searchParams.get('to')

  const fromDate = from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const toDate   = to   || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

  let query = supabase
    .from('economic_events')
    .select('*')
    .gte('scheduled_at', fromDate)
    .lte('scheduled_at', toDate)
    .order('scheduled_at', { ascending: true })

  if (currency) query = query.eq('currency', currency)
  if (impact)   query = query.eq('impact_level', impact)

  const { data, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data, count: data.length })
}
