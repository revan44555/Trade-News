// lib/supabase/admin.js
//
// ⚠️ SADECE BACKEND-ONLY, KİMLİK DOĞRULAMALI ROUTE'LARDA KULLAN ⚠️
//
// Bu client SUPABASE_SERVICE_ROLE_KEY kullanır — RLS'i tamamen bypass eder
// ve veritabanına sınırsız erişim sağlar. Aşağıdakiler DIŞINDA hiçbir yerde
// import edilmemeli:
//   - /api/cron            (secret header ile korunmalı)
//   - /api/telegram/webhook, /notify, /digest (secret header ile korunmalı)
//   - lib/fetchers/*       (arka plan veri toplama, kullanıcı isteğiyle tetiklenmez)
//
// Kullanıcı isteğiyle çalışan hiçbir route (news, calendar, saved-news vb.)
// bu client'ı kullanmamalı — onun yerine lib/supabase/server.js (RLS'e tabi)
// kullanılmalı. Bu ayrım "en az yetki" prensibinin köşe taşıdır: admin
// client'ın import edildiği her yer, tüm veritabanının açık kapısı demektir.

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

let _adminClient = null

export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY tanımlı değil. Admin client oluşturulamaz.'
    )
  }
  if (_adminClient) return _adminClient

  _adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )
  return _adminClient
}
