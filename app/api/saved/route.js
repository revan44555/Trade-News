// app/api/saved/route.js
//
// Google ile giriş yapmış kullanıcının kaydettiği haberleri yönetir.
//
// GÜVENLİK: Bu route admin/service-role client KULLANMAZ — bilerek
// lib/supabase/server.js (RLS'e tabi, kullanıcının oturum çerezini
// kullanan client) ile çalışır. Böylece:
//   - Kullanıcı sadece kendi user_id'siyle eşleşen satırları görebilir/
//     silebilir (bkz. supabase/auth_and_rls_migration.sql politikaları).
//   - Bu route'ta "başka bir user_id" yazmaya çalışsak bile RLS bunu
//     veritabanı seviyesinde reddeder — yani bir kod hatası yapılsa bile
//     veri sızıntısı/karışması mümkün değildir (defense in depth).
//   - Giriş yapılmamışsa auth.uid() null olur, tüm sorgular boş döner
//     veya insert/delete 401 ile reddedilir.

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'

async function requireUser(supabase) {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

export async function GET() {
  const supabase = await createClient()
  const user = await requireUser(supabase)
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('user_saved_news')
    .select('news_id, created_at, news_items(*)')
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data })
}

export async function POST(request) {
  const supabase = await createClient()
  const user = await requireUser(supabase)
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const newsId = body?.news_id
  if (!newsId || typeof newsId !== 'string') {
    return Response.json({ error: 'news_id required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('user_saved_news')
    .upsert({ user_id: user.id, news_id: newsId }, { onConflict: 'user_id,news_id', ignoreDuplicates: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

export async function DELETE(request) {
  const supabase = await createClient()
  const user = await requireUser(supabase)
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const newsId = searchParams.get('news_id')
  if (!newsId) return Response.json({ error: 'news_id required' }, { status: 400 })

  // user_id filtresi RLS tarafından zaten zorunlu kılınıyor, ama burada da
  // açıkça belirtmek "defense in depth" — kodu okuyan biri için de niyeti
  // netleştirir.
  const { error } = await supabase
    .from('user_saved_news')
    .delete()
    .eq('news_id', newsId)
    .eq('user_id', user.id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
