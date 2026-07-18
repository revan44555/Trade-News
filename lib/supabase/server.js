// lib/supabase/server.js
//
// Sunucu tarafında (Server Component, Route Handler, Server Action) kullanılan
// Supabase client'ı. Kullanıcının oturum çerezini okuyarak isteği o kullanıcı
// olarak yapar — yani RLS politikaları kullanıcı bazlı çalışır.
//
// ÖNEMLİ GÜVENLİK NOTU: Bu client anon key kullanır, service role key
// KULLANMAZ. Böylece bu client üzerinden yapılan hiçbir sorgu RLS'i bypass
// edemez; kullanıcı sadece kendi verisine erişebilir. Gerçekten admin
// yetkisi gereken (cron, webhook gibi) yerlerde ayrı bir "admin client"
// (bkz. lib/supabase/admin.js) kullanılmalı — asla bu dosya değil.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component içinden çağrıldıysa cookie set edilemez;
            // middleware zaten session'ı tazeliyor, bu yüzden yok sayılabilir.
          }
        },
      },
    }
  )
}
