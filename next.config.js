/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 15+'te doğru key: serverExternalPackages (üst seviyede, experimental
  // altında değil). Eskiden (Next 14) experimental.serverComponentsExternalPackages
  // olarak tanımlıydı — proje Next 15'e yükseltilince buna göre güncellendi.
  serverExternalPackages: ['rss-parser', 'crypto'],

  // GÜVENLİK: Temel tarayıcı-seviyesi koruma header'ları. CSP bilerek
  // eklenmedi çünkü Supabase realtime (wss://), Google avatar görselleri
  // (lh3.googleusercontent.com) ve Gemini API gibi birden fazla dış
  // origin var — dar bir CSP burada test edilmeden eklenirse siteyi
  // kolayca kırar. Diğer header'lar risksiz ve evrensel olarak faydalı.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Clickjacking: sayfa başka bir sitede iframe'e alınamaz.
          { key: 'X-Frame-Options', value: 'DENY' },
          // MIME-sniffing engelleme: tarayıcı Content-Type'ı tahmin etmeye çalışmasın.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Referrer'da gereksiz bilgi sızdırma.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // HTTPS zorunluluğu (üretimde proxy/CDN zaten HTTPS termine ediyorsa da zararsız).
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          // Gereksiz tarayıcı API'lerine erişimi kapat.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
