// lib/http/resolveOrigin.js
//
// Render (ve genel olarak çoğu PaaS), uygulamayı bir reverse proxy
// arkasında çalıştırır: dışarıya https://xxx.onrender.com görünür ama
// Next.js process'i içeride http://localhost:10000 gibi bir portu
// dinler. `new URL(request.url).origin` bu iç adresi döndürebiliyordu
// (Node'un aldığı ham istek URL'i proxy'nin gördüğü dış adresi değil,
// kendi dinlediği iç adresi yansıtır). Sonuç: Google girişi veya çıkış
// sonrası kullanıcı http://localhost:10000/... adresine
// yönlendiriliyordu ("bu siteye ulaşılamıyor" hatası).
//
// GÜVENLİK NOTU — X-Forwarded-Host güvenilmez olabilir:
// Bu header normalde proxy tarafından set edilir, ama proxy istemcinin
// gönderdiği aynı isimli header'ı override etmiyorsa (yanlış yapılandırılmış
// proxy, veya uygulama proxy olmadan doğrudan internete açıksa), bir
// saldırgan `X-Forwarded-Host: evil.com` göndererek OAuth/signout
// redirect'ini kendi domainine yönlendirebilir (open redirect → phishing).
//
// Bu yüzden forwardedHost, sadece NEXT_PUBLIC_SITE_URL ile aynı host'a
// eşleşiyorsa (env tanımlıysa) ya da bilinen bir ALLOWED_HOSTS listesinde
// varsa güvenilir sayılır. env tanımlı değilse (örn. yerel geliştirme)
// eski davranışa (proxy header'ına güven) düşülür — bu durumda risk zaten
// yerel makineyle sınırlıdır.
//
// Çözüm sırası:
//   1) NEXT_PUBLIC_SITE_URL tanımlıysa: forwardedHost sadece bu host'a
//      eşleşirse kullanılır, aksi halde NEXT_PUBLIC_SITE_URL'e düşülür.
//   2) NEXT_PUBLIC_SITE_URL tanımsızsa: forwardedHost'a güvenilir (dev/
//      geriye dönük uyumluluk) — üretimde NEXT_PUBLIC_SITE_URL set
//      edilmesi önerilir.
//   3) Hiçbiri yoksa: request.url'den hesaplanan origin (son çare).
export function resolveOrigin(request, fallbackOrigin) {
  const forwardedHost  = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto')

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || null

  if (siteUrl) {
    if (forwardedHost) {
      try {
        const siteHost = new URL(siteUrl).host
        if (forwardedHost === siteHost) {
          return `${forwardedProto || 'https'}://${forwardedHost}`
        }
        console.warn(
          `[security] X-Forwarded-Host (${forwardedHost}) NEXT_PUBLIC_SITE_URL host'uyla ` +
          `(${siteHost}) eşleşmiyor — sahte header olabilir, yok sayıldı.`
        )
      } catch {
        // NEXT_PUBLIC_SITE_URL geçersiz bir URL ise sessizce siteUrl'e düş
      }
    }
    return siteUrl
  }

  if (forwardedHost) {
    return `${forwardedProto || 'https'}://${forwardedHost}`
  }
  return fallbackOrigin
}
