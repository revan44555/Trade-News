// NOT: startCron() BURADA çağrılmıyor.
// layout.js hem sunucu hem build zamanında import edilir; modül-seviyesinde
// yan etkili kod (interval başlatmak, dış API çağırmak) build/edge
// ortamlarında beklenmedik anlarda tetiklenebilir ve tekrar tekrar
// çalışabilir. Cron artık app/api/cron/route.js üzerinden, gerçek bir
// istek geldiğinde başlatılıyor (bkz. o dosyadaki açıklama).

import { IBM_Plex_Mono } from 'next/font/google'

// Bug fix: font eskiden <head> içinde ham <link> ile Google Fonts'tan
// çekiliyordu — bu hem "no-page-custom-font" ESLint uyarısına (build'i
// kırabilir) hem de yavaş/render-engelleyici bir font yüklemesine yol
// açıyordu. next/font/google kullanmak fontu build zamanında indirip
// self-host eder, layout shift'i önler ve App Router'ın önerdiği yoldur.
//
// NOT: `variable` modu yerine bilerek className/style üzerinden gerçek
// font-family adını (`fontMono.style.fontFamily`) enjekte ediyoruz —
// çünkü kod tabanındaki bileşenler (page.js, login/page.js) font'u
// "'IBM Plex Mono','Courier New',monospace" gibi düz bir string olarak
// referans alıyor; CSS custom property'ye geçmek onların hepsini
// değiştirmeyi gerektirirdi.
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  display: 'swap',
})

export const metadata = {
  title: 'Market Wire',
  description: 'Real-time financial news and economic calendar',
}

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <head>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </head>
      <body style={{ margin: 0, padding: 0, background: '#0a0e1a', fontFamily: plexMono.style.fontFamily }}>
        {children}
      </body>
    </html>
  )
}
