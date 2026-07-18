export const dynamic = 'force-dynamic'

import { startCron } from '@/lib/fetchers/startCron'

// Bu endpoint, haber/takvim çekme cron'unu başlatır.
//
// Neden layout.js yerine burada?
// layout.js modül seviyesinde import edildiğinde Next.js onu build sırasında
// ve her sunucu instance'ının soğuk başlangıcında (cold start) çalıştırabilir.
// Bu, cron'un ne zaman/kaç kez başladığını öngörülemez hale getirir.
// Bir route handler ise sadece gerçek bir HTTP isteği geldiğinde çalışır,
// bu yüzden cron'u başlatmak için güvenli ve öngörülebilir bir yerdir.
//
// Kullanım:
//  - Uygulama ilk yüklendiğinde (app/page.js) bu endpoint'e bir kere GET
//    isteği atılır, cron o an başlar (startCron() zaten aynı process
//    içinde ikinci kez çağrılırsa hiçbir şey yapmıyor — bkz. startCron.js).
//  - İsterseniz Vercel Cron / harici bir uptime-ping servisi ile bu
//    endpoint'i periyodik çağırarak cron'un ayakta kaldığından emin olabilirsiniz.
//
// GÜVENLİK NOTU: startCron() zaten process-level guard'lı olduğundan bu
// endpoint'in dışarıdan tekrar tekrar çağrılması veri bozulmasına yol açmaz
// (upsert kullanılıyor). Yine de gereksiz bilgi ifşasını önlemek için yanıt
// minimal tutulur ve cron'un gerçekten başlatılıp başlatılmadığı dışa
// sızdırılmaz.
//
// GÜVENLİK NOTU 2 — flood koruması:
// Bu endpoint bilerek secret istemiyor (app/page.js her yüklendiğinde
// kimliksiz çağırıyor, bu normal akış). Ama secret'sız + herkese açık
// olması, biri bu URL'i saniyede binlerce kez çağırırsa (startCron()
// no-op olsa da) gereksiz CPU/log yükü oluşturabilir. Süreç-seviyesinde
// çok basit bir cooldown ekleyerek bunu sınırlıyoruz — bu bir auth
// mekanizması değil, sadece kötüye kullanımın maliyetini düşürmeye
// yönelik bir önlem.
const COOLDOWN_MS = 2000
let _lastHit = 0

export async function GET() {
  const now = Date.now()
  if (now - _lastHit < COOLDOWN_MS) {
    return Response.json({ ok: true })
  }
  _lastHit = now

  startCron()
  return Response.json({ ok: true })
}
