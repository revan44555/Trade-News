// app/auth/callback/route.js
//
// Google (Supabase Auth üzerinden) kullanıcıyı giriş sonrası bu URL'e
// yönlendirir: /auth/callback?code=... . Bu route o kodu gerçek bir
// oturuma (session cookie) çevirir, sonra kullanıcıyı uygulamaya geri
// gönderir.
//
// GÜVENLİK NOTU — open redirect koruması:
// `next` parametresi sadece uygulama içi göreli bir path olabilir
// (örn. "/?tab=saved"). Dışarıdan tam bir URL ("https://evil.com")
// verilirse yok sayılır ve kullanıcı ana sayfaya yönlendirilir — aksi
// halde bu endpoint bir "open redirect" (kimlik avı) aracına
// dönüşebilirdi.
//
// BUG FIX — yanlış origin (localhost'a yönlendirme):
// Render (ve genel olarak çoğu PaaS), uygulamayı bir reverse proxy
// arkasında çalıştırır: dışarıya https://xxx.onrender.com görünür ama
// Next.js process'i içeride http://localhost:10000 gibi bir portu
// dinler. `new URL(request.url).origin` bu iç adresi döndürebiliyordu,
// çünkü Node'un aldığı ham istek URL'i proxy'nin gördüğü dış adresi
// değil, kendi dinlediği iç adresi yansıtıyor. Sonuç: Google girişinden
// sonra kullanıcı http://localhost:10000/... adresine yönlendiriliyordu
// (tarayıcıda "bağlanılamıyor" hatası).
//
// Çözüm: önce proxy'nin ilettiği X-Forwarded-Host/X-Forwarded-Proto
// header'larına bak (Render bunları doğru dolduruyor); onlar da yoksa
// NEXT_PUBLIC_SITE_URL env değişkenine düş; o da yoksa en son çare
// olarak request.url'den hesaplanan origin'i kullan.

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { resolveOrigin } from '@/lib/http/resolveOrigin'
import { NextResponse } from 'next/server'

function safeNextPath(next) {
  if (!next) return '/'
  // Sadece "/" ile başlayan, "//" ile başlamayan (protocol-relative URL
  // olabilir) göreli path'lere izin ver.
  if (next.startsWith('/') && !next.startsWith('//')) return next
  return '/'
}

export async function GET(request) {
  const { searchParams, origin: rawOrigin } = new URL(request.url)
  const origin = resolveOrigin(request, rawOrigin)
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
    console.error('OAuth callback hata:', error.message)
  }

  // Kod yok veya değişim başarısız oldu — hata ile giriş sayfasına dön
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
