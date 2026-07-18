// lib/supabase/client.js
//
// Tarayıcıda (Client Component'lerde) kullanılan Supabase client'ı.
// Sadece NEXT_PUBLIC_* anahtarları kullanır (anon key) — bu key public
// olmaya güvenlidir çünkü tüm tablo erişimi Supabase tarafında RLS
// politikaları ile sınırlanır. Asla SUPABASE_SERVICE_ROLE_KEY buraya
// eklenmemeli.

'use client'

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}
