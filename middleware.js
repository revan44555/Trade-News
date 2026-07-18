// middleware.js
//
// Her istekte Supabase oturum çerezini tazeler (access token süresi
// dolmuşsa refresh token ile yeniler). Bu olmadan Server Component'ler
// bazen eski/geçersiz bir session görebilir.
//
// NOT — bu middleware SAYFA SEVİYESİNDE bir erişim kontrolü YAPMAZ:
// "Kaydedilenler" bağımsız bir route değil, app/page.js içindeki bir
// sekme (client-side tab) olduğundan burada yönlendirilecek ayrı bir
// path yok. Girişsiz erişime karşı gerçek koruma /api/saved/route.js
// içindeki requireUser() kontrolü ve veritabanı seviyesindeki RLS
// politikalarıdır (bkz. supabase/auth_and_rls_migration.sql) — sayfa
// açılır ama girişsiz kullanıcı için API her zaman 401 döner ve RLS
// hiçbir satırı göstermez.

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Session'ı tazele — bu satır olmadan token süresi dolduğunda
  // kullanıcı sessizce "çıkmış" gibi görünür.
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    /*
     * Şunlar hariç tüm route'ları eşleştir:
     * - _next/static, _next/image (statik dosyalar)
     * - favicon.ico
     * - resim uzantıları
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
