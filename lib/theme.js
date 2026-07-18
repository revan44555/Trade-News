// lib/theme.js
//
// Market Wire için merkezi tasarım token'ları.
// Tüm bileşenler renk/boşluk/gölge değerlerini buradan alır, böylece
// tema tek bir yerden güncellenebilir ve tutarlılık korunur.
//
// Palet mantığı: koyu "derin lacivert" zemin (siyahtan daha az yorucu,
// terminal hissini korur) + iki canlı vurgu rengi (cyan = bilgi/marka,
// amber = kaydedilenler/uyarı) + impact seviyeleri için sıcaktan soğuğa
// giden bir gradyan (kırmızı → turuncu → sarı).

export const color = {
  // Zemin katmanları (koyudan açığa)
  bg:        '#0a0e1a',   // ana sayfa zemini
  bgRaised:  '#0d1220',   // panel/kart zemini
  bgPanel:   '#0f1526',   // modal/bottom-sheet zemini
  bgInset:   '#141b2e',   // input, chip zemini

  border:      '#1c2438',
  borderSoft:  '#151b2c',
  borderStrong:'#2a3a52',

  // Metin
  text:        '#e6edf5',
  textDim:     '#8b96ab',
  textFaint:   '#4a5468',
  textGhost:   '#2e3548',

  // Marka / vurgu
  accent:      '#22b8f0',   // cyan — birincil marka rengi
  accentDim:   '#22b8f033',
  accentSoft:  '#22b8f018',
  gold:        '#f0b429',   // kaydedilenler / yıldız
  goldDim:     '#f0b42933',

  // Durum
  success: '#22c55e',
  danger:  '#f0555a',
  warning: '#f59e0b',

  // Impact seviyeleri (haber/takvim önem derecesi)
  impact: {
    high:    '#f0555a',
    medium:  '#f59e0b',
    low:     '#e0c341',
    holiday: '#8b96ab',
  },
}

export const radius = { sm: 4, md: 7, lg: 10, xl: 16, pill: 999 }

export const shadow = {
  panel: '0 -10px 44px rgba(0,0,0,0.85)',
  card:  '0 2px 10px rgba(0,0,0,0.35)',
  glow:  `0 0 0 1px ${color.accentDim}`,
}

export const font = {
  mono: "'IBM Plex Mono','Courier New',monospace",
}

// Kaynak renklerinde (news feed) kullanılan sabit eşleme — merkezi tutuluyor
export const sourceColorMap = {
  'ForexLive':'#22b8f0','ZeroHedge':'#f0555a','Seeking Alpha':'#22c55e',
  'MarketWatch':'#f0b429','CNBC Markets':'#a78bfa','Yahoo Finance':'#818cf8',
  'Cointelegraph':'#22b8f0','CoinDesk':'#f59e0b','Decrypt':'#f472b6',
  'OilPrice':'#a3e635','Action Forex':'#2dd4da','Forex Crunch':'#c084fc',
  'FX News Group':'#2dd4bf','Investing.com Forex':'#60a5fa',
  'Finnhub Markets':'#8b96ab','Finnhub Forex':'#8b96ab','Finnhub Crypto':'#8b96ab',
}

export function sourceColor(name) {
  if (!name) return color.textFaint
  return sourceColorMap[name] || '#6b7690'
}

export function impactColor(level) {
  return color.impact[level] || color.impact.low
}
