// app/auth/signout/route.js
//
// BUG FIX: bkz. app/auth/callback/route.js üzerindeki not — Render gibi
// reverse-proxy arkasında çalışan ortamlarda `request.url`'den hesaplanan
// origin, dış adres yerine iç (localhost:10000 gibi) adresi verebiliyordu.
// Çıkış sonrası kullanıcı "localhost'a bağlanılamıyor" hatası alıyordu.
export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { resolveOrigin } from '@/lib/http/resolveOrigin'
import { NextResponse } from 'next/server'

// GÜVENLİK NOTU — CSRF:
// Bu endpoint çerez tabanlı session kullanan bir POST route, bu yüzden
// teorik olarak başka bir site "gizli form" ile kullanıcıyı istemsizce
// çıkış yaptırabilir (zararı düşük: veri kaybı yok, sadece oturum kapanır,
// ama yine de istenmeyen bir davranış). same-site cookie zaten büyük
// ölçüde koruyor; buna ek olarak Origin/Referer'ın kendi sitemizle
// eşleştiğini kontrol ediyoruz — ucuz ve etkili bir ek katman.
function isSameOriginRequest(request, expectedOrigin) {
  const origin = request.headers.get('origin')
  if (origin) return origin === expectedOrigin

  // Bazı tarayıcılar/istemciler same-origin POST'larda Origin header'ı
  // göndermeyebilir; bu durumda Referer'a düş.
  const referer = request.headers.get('referer')
  if (referer) {
    try {
      return new URL(referer).origin === expectedOrigin
    } catch {
      return false
    }
  }

  // Hiçbiri yoksa reddetmiyoruz (bazı meşru istemciler bu header'ları
  // taşımaz) — bu kontrol savunma derinliği amaçlı, tek başına auth değil.
  return true
}

export async function POST(request) {
  const rawOrigin = new URL(request.url).origin
  const origin = resolveOrigin(request, rawOrigin)

  if (!isSameOriginRequest(request, origin)) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 })
  }

  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(`${origin}/`)
}
