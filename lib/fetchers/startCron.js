// Serverless/multi-worker ortamlarında her process kendi global'ına sahiptir.
// global.__cronStarted guard'ı SADECE aynı process içinde tekrar başlatmayı önler.
//
// ⚠️ ÖNEMLİ: Bu guard, birden fazla process/instance (ör. Vercel'de birden
// fazla serverless instance, veya PM2/cluster ile çoklu worker) ile deploy
// edildiğinde cron'un birden fazla kez çalışmasını ENGELLEMEZ. Böyle bir
// senaryoda her instance kendi cron'unu başlatır ve aynı haberler/takvim
// verisi tekrar tekrar çekilir (upsert sayesinde veri bozulmaz ama gereksiz
// API çağrısı ve DB yükü oluşur).
//
// Tek instance / tek process deploy (ör. tek VPS, tek container) için bu
// guard yeterlidir. Çoklu instance'a geçilecekse gerçek bir distributed lock
// (Supabase'de bir "cron_lock" tablosu + advisory lock, veya ayrı bir
// cron job servisi) eklenmesi önerilir — şu an böyle bir mekanizma yoktur.

if (typeof global.__cronStarted === 'undefined') {
  global.__cronStarted = false
}

let _newsInterval     = null
let _calendarInterval = null

export function startCron() {
  // Aynı process içinde zaten başladıysa çık
  if (global.__cronStarted) return
  global.__cronStarted = true

  console.log('⏰ Cron başladı (pid:', process.pid, ')')

  const runNews = async () => {
    try {
      const { fetchRssSources }  = await import('./rssFetcher.js')
      const { fetchFinnhubNews } = await import('./finnhubFetcher.js')
      await Promise.all([fetchRssSources(), fetchFinnhubNews()])
    } catch (err) {
      console.error('News cron hata:', err.message)
    }
  }

  const runCalendar = async () => {
    try {
      const { fetchEconomicCalendar } = await import('./calendarFetcher.js')
      await fetchEconomicCalendar()
    } catch (err) {
      console.error('Calendar cron hata:', err.message)
    }
  }

  // İlk çalışma — deploy sonrası hemen veri gelsin
  runNews()
  runCalendar()

  // Önceki interval'leri temizle (hot-reload güvenliği)
  if (_newsInterval)     clearInterval(_newsInterval)
  if (_calendarInterval) clearInterval(_calendarInterval)

  // Haberler her 1 dakika, takvim her 3 saat
  _newsInterval     = setInterval(runNews,     60 * 1000)
  _calendarInterval = setInterval(runCalendar, 3 * 60 * 60 * 1000)
}

// Servis kapatılırken interval'leri temizle (graceful shutdown)
export function stopCron() {
  if (_newsInterval)     { clearInterval(_newsInterval);     _newsInterval = null }
  if (_calendarInterval) { clearInterval(_calendarInterval); _calendarInterval = null }
  global.__cronStarted = false
  console.log('⏰ Cron durduruldu')
}
