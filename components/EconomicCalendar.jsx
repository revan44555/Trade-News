'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

/* ─── FF renk paleti ─── */
const C = {
  pageBg:  '#141b2e', rowOdd:  '#222', rowEven: '#141b2e',
  dayBg:   '#1c2438', theadBg: '#0f1526', border: '#1c2438',
  borderDay:'#2a3a52', text: '#e6edf5', textDim: '#888',
  textFaint:'#4a5468', textDay: '#aaa', white: '#e6edf5',
  green: '#4ade80', red: '#f0555a', blue: '#22b8f0',
  yellow: '#e0c341', high: '#f0555a', medium: '#f59e0b', low: '#f0b429',
  /* mini cal */
  calBg: '#0f1526', calRowSel: '#122a1c', calTodayBg: '#153d24',
  calDaySel: '#22c55e',
}

const FLAG = {
  USD:'🇺🇸',EUR:'🇪🇺',GBP:'🇬🇧',JPY:'🇯🇵',AUD:'🇦🇺',
  CAD:'🇨🇦',CHF:'🇨🇭',NZD:'🇳🇿',CNY:'🇨🇳',SEK:'🇸🇪',
  NOK:'🇳🇴',DKK:'🇩🇰',SGD:'🇸🇬',HKD:'🇭🇰',KRW:'🇰🇷',
  INR:'🇮🇳',BRL:'🇧🇷',MXN:'🇲🇽',ZAR:'🇿🇦',TRY:'🇹🇷',PLN:'🇵🇱',
}

const IMP = {
  high:    { color: C.high,   label: 'High',    dots: 3 },
  medium:  { color: C.medium, label: 'Medium',  dots: 2 },
  low:     { color: C.low,    label: 'Low',     dots: 1 },
  holiday: { color: '#555',   label: 'Holiday', dots: 0 },
}

const TZS = [
  {label:'UTC',       value:'UTC'},
  {label:'London',    value:'Europe/London'},
  {label:'Istanbul',  value:'Europe/Istanbul'},
  {label:'New York',  value:'America/New_York'},
  {label:'Chicago',   value:'America/Chicago'},
  {label:'LA',        value:'America/Los_Angeles'},
  {label:'Tokyo',     value:'Asia/Tokyo'},
  {label:'Sydney',    value:'Australia/Sydney'},
  {label:'Dubai',     value:'Asia/Dubai'},
  {label:'Singapore', value:'Asia/Singapore'},
  {label:'Frankfurt', value:'Europe/Berlin'},
  {label:'Paris',     value:'Europe/Paris'},
  {label:'Zurich',    value:'Europe/Zurich'},
  {label:'HK',        value:'Asia/Hong_Kong'},
]

const MAIN_CUR  = ['USD','EUR','GBP','JPY','AUD','CAD','CHF','NZD','CNY']
const OTHER_CUR = ['SEK','NOK','DKK','SGD','HKD','KRW','INR','BRL','MXN','ZAR','TRY','PLN']
const ALL_CUR   = [...MAIN_CUR, ...OTHER_CUR]
const ALL_IMP   = ['high','medium','low','holiday']
const MONTHS    = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_S  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const KEY       = 'mw_calendar_prefs'

function loadP() { try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null } catch { return null } }
function saveP(p) { try { localStorage.setItem(KEY, JSON.stringify(p)) } catch {} }
function hasV(v) { return v != null && String(v).trim() !== '' && String(v).trim() !== '—' }
function actColor(a, f) {
  const av = parseFloat(String(a).replace(/[^0-9.\-]/g, ''))
  const fv = parseFloat(String(f).replace(/[^0-9.\-]/g, ''))
  if (isNaN(av)) return C.text
  if (isNaN(fv) || f == null || String(f).trim() === '' || String(f).trim() === '—') return C.text
  return av >= fv ? C.green : C.red
}
// Actual vs Previous karşılaştırması için ayrı renk
function actVsPrevColor(a, p) {
  const av = parseFloat(String(a).replace(/[^0-9.\-]/g, ''))
  const pv = parseFloat(String(p).replace(/[^0-9.\-]/g, ''))
  if (isNaN(av) || isNaN(pv)) return C.textFaint
  return av >= pv ? C.green : C.red
}
function toISO(d) { return d.toLocaleDateString('en-CA') }
function offsetDay(n) { const d = new Date(); d.setDate(d.getDate() + n); return toISO(d) }

/* ─── Impact dots ─── */
function Dots({ level, size = 7 }) {
  const cfg = IMP[level] || IMP.low
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:2, alignItems:'center', justifyContent:'center' }}>
      {[2,1,0].map(i => (
        <div key={i} style={{
          width: size, height: size, borderRadius: '50%',
          background: i < cfg.dots ? cfg.color : '#333',
          border: `1px solid ${i < cfg.dots ? cfg.color : '#2a3a52'}`,
          flexShrink: 0,
        }}/>
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════
   FF Mini Calendar — birebir kopya
   Üstte küçük ay tablosu, altta hızlı linkler
══════════════════════════════════════════ */
function MiniCal({ weekOffset, selectedDay, onSelectDay, onSelectWeek }) {
  const today = new Date()
  const todayStr = toISO(today)
  const [cy, setCy] = useState(today.getFullYear())
  const [cm, setCm] = useState(today.getMonth())

  /* Seçim değişince ayı güncelle */
  useEffect(() => {
    if (selectedDay) {
      const d = new Date(selectedDay + 'T12:00:00Z')
      setCy(d.getFullYear()); setCm(d.getMonth())
    } else {
      const now = new Date(), dow = now.getDay()
      const mon = new Date(now)
      mon.setDate(now.getDate() - ((dow + 6) % 7) + weekOffset * 7)
      setCy(mon.getFullYear()); setCm(mon.getMonth())
    }
  }, [weekOffset, selectedDay])

  function changeMonth(d) {
    let m = cm + d, y = cy
    if (m < 0) { m = 11; y-- } else if (m > 11) { m = 0; y++ }
    setCm(m); setCy(y)
  }

  /* Izgara — Pazar=0 (FF pazar başlar) */
  function buildGrid() {
    const startDow = new Date(cy, cm, 1).getDay() // 0=Sun
    const dim = new Date(cy, cm + 1, 0).getDate()
    const prevDim = new Date(cy, cm, 0).getDate()
    const cells = []
    for (let i = startDow - 1; i >= 0; i--)
      cells.push({ d: prevDim - i, m: cm - 1, y: cy, cur: false })
    for (let d = 1; d <= dim; d++)
      cells.push({ d, m: cm, y: cy, cur: true })
    while (cells.length % 7 !== 0) {
      cells.push({ d: cells.length - dim - startDow + 1, m: cm + 1, y: cy, cur: false })
    }
    return cells
  }

  function cellKey(c) {
    let m = c.m, y = c.y
    if (m < 0) { m = 11; y-- } else if (m > 11) { m = 0; y++ }
    return `${y}-${String(m + 1).padStart(2,'0')}-${String(c.d).padStart(2,'0')}`
  }

  /* Seçili hafta günleri — useMemo ile memoize, her render'da yeniden hesaplanmaz */
  const wset = useMemo(() => {
    const now = new Date(), dow = now.getDay()
    const mon = new Date(now)
    mon.setDate(now.getDate() - ((dow + 6) % 7) + weekOffset * 7)
    const s = new Set()
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon); d.setDate(mon.getDate() + i)
      s.add(toISO(d))
    }
    return s
  }, [weekOffset])

  /* Hafta satırına tıkla → weekOffset hesapla */
  function clickRow(row) {
    const first = row.find(c => c.cur) || row[0]
    const cd = new Date(cellKey(first) + 'T12:00:00Z')
    cd.setDate(cd.getDate() - ((cd.getDay() + 6) % 7))
    const now = new Date(), dow = now.getDay()
    const thisMon = new Date(now)
    thisMon.setDate(now.getDate() - ((dow + 6) % 7))
    thisMon.setHours(0,0,0,0); cd.setHours(0,0,0,0)
    onSelectWeek(Math.round((cd - thisMon) / (7 * 86400000)))
  }

  const cells = buildGrid()
  const rows = []
  for (let r = 0; r < cells.length / 7; r++) rows.push(cells.slice(r * 7, (r + 1) * 7))

  /* FF link listesi */
  const links = [
    ['Yesterday', () => onSelectDay(offsetDay(-1))],
    ['Today',     () => onSelectDay(todayStr)],
    ['Tomorrow',  () => onSelectDay(offsetDay(1))],
    null,
    ['Last Week',  () => onSelectWeek(-1)],
    ['This Week',  () => onSelectWeek(0)],
    ['Next Week',  () => onSelectWeek(1)],
    null,
    ['Last Month', () => { const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-1); onSelectDay(toISO(d)) }],
    ['This Month', () => { const d=new Date(); d.setDate(1); onSelectDay(toISO(d)) }],
    ['Next Month', () => { const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()+1); onSelectDay(toISO(d)) }],
  ]

  return (
    <div style={{
      background: 'linear-gradient(180deg, #0d1220 0%, #0a0e1a 100%)',
      borderBottom: `1px solid ${C.border}`,
      flexShrink: 0,
      fontSize: 11,
      padding: '10px 12px 12px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    }}>

      {/* Ay başlık */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div style={{ display:'flex', gap:2 }}>
          <button onClick={() => setCy(y => y-1)} style={NAV}>«</button>
          <button onClick={() => changeMonth(-1)} style={NAV}>‹</button>
        </div>
        <span style={{
          fontSize: 12, fontWeight: 800, color: '#8b96ab',
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          {MONTHS_S[cm]} {cy}
        </span>
        <div style={{ display:'flex', gap:2 }}>
          <button onClick={() => changeMonth(1)} style={NAV}>›</button>
          <button onClick={() => setCy(y => y+1)} style={NAV}>»</button>
        </div>
      </div>

      {/* Gün başlıkları */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '18px repeat(7, 1fr)',
        marginBottom: 2,
      }}>
        <div />
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} style={{
            textAlign: 'center', fontSize: 9, fontWeight: 800,
            color: '#2a3a52', letterSpacing: '0.06em', padding: '2px 0',
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* Hafta satırları */}
      {rows.map((row, ri) => {
        const rowSel = !selectedDay && row.some(c => wset.has(cellKey(c)))
        return (
          <div key={ri} style={{
            display: 'grid',
            gridTemplateColumns: '18px repeat(7, 1fr)',
            background: rowSel ? 'rgba(14,165,233,0.06)' : 'transparent',
            borderRadius: rowSel ? 4 : 0,
            marginBottom: 1,
          }}>
            {/* » hafta oku */}
            <div
              onClick={() => clickRow(row)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 7, color: rowSel ? '#22b8f0' : '#1c2438',
                cursor: 'pointer', fontWeight: 900,
                borderRadius: 2,
                transition: 'color 0.15s',
              }}
            >»</div>

            {row.map((cell, ci) => {
              const k = cellKey(cell)
              const isTd   = k === todayStr
              const isDSel = k === selectedDay
              const isWSel = !selectedDay && wset.has(k)
              return (
                <div
                  key={ci}
                  onClick={() => onSelectDay(k)}
                  style={{
                    height: 26,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11,
                    cursor: 'pointer',
                    borderRadius: 4,
                    background: isDSel ? '#22b8f0'
                      : isTd   ? '#153d24'
                      : 'transparent',
                    color: !cell.cur  ? '#1c2438'
                      : isDSel ? '#fff'
                      : isTd   ? '#4ade80'
                      : isWSel ? '#7dd3f5'
                      : '#8b96ab',
                    fontWeight: isTd || isDSel ? 800 : 400,
                    outline: isTd && !isDSel ? '1px solid #153d24' : 'none',
                    transition: 'all 0.1s',
                  }}
                >
                  {cell.d}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

/* ══════════════════════════════════════════
   ANA COMPONENT
══════════════════════════════════════════ */
export default function EconomicCalendar() {
  const [events,        setEvents]        = useState([])
  const [loading,       setLoading]       = useState(true)
  const [showFilter,    setShowFilter]    = useState(false)
  const [timezone,      setTimezone]      = useState('Europe/Istanbul')
  const [selectedDay,   setSelectedDay]   = useState(null)
  const [weekOffset,    setWeekOffset]    = useState(0)
  const [notifPerm,     setNotifPerm]     = useState('default')
  const [isMobile,      setIsMobile]      = useState(false)
  const [prefsLoaded,   setPrefsLoaded]   = useState(false)
  const [selCurrencies, setSelCurrencies] = useState(new Set(MAIN_CUR))
  const [selImpacts,    setSelImpacts]    = useState(new Set(ALL_IMP))
  // Bildirim — kaç dk önce: 5, 15, 30, 60 | currency bazlı filtre
  const [notifMinutes,  setNotifMinutes]  = useState(5)
  const [notifCurs,     setNotifCurs]     = useState(new Set(['USD','EUR','GBP','JPY']))
  const [inAppAlerts,   setInAppAlerts]   = useState([])  // [{id, text, color}]
  // Geçmiş günler varsayılan olarak kapalı
  const [collapsedDays, setCollapsedDays] = useState(new Set())
  const [showCal,       setShowCal]       = useState(false)
  const [now,           setNow]           = useState(Date.now())  // countdown için
  // 'week' = mevcut hafta-bazlı gezinme, 'past30' = son 30 günün tamamı
  // (backend zaten -7/+14 gün varsayılanını destekliyordu, sadece frontend
  // hep dar bir hafta penceresi istiyordu — bkz. fetchData())
  const [rangeMode,     setRangeMode]     = useState('week')

  function toggleDay(key) {
    setCollapsedDays(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  /* Countdown ticker — her saniye güncelle */
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  /* Supabase Realtime — economic_events güncellenince yansır */
  useEffect(() => {
    if (!prefsLoaded) return
    const channel = supabaseBrowser
      .channel('economic-events-live')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'economic_events' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setEvents(prev => prev.map(ev =>
              ev.id === payload.new.id ? { ...ev, ...payload.new } : ev
            ))
          } else if (payload.eventType === 'INSERT') {
            setEvents(prev => [...prev, payload.new])
          }
        }
      )
      .subscribe()
    return () => { supabaseBrowser.removeChannel(channel) }
  }, [prefsLoaded])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const p = loadP()
    if (p) {
      if (p.timezone) setTimezone(p.timezone)

      // Yüklenen currency listesi geçerliyse kullan, yoksa default'a dön
      if (Array.isArray(p.currencies) && p.currencies.length > 0) {
        // Sadece ALL_CUR içindeki geçerli değerleri al
        const valid = p.currencies.filter(c => ALL_CUR.includes(c))
        setSelCurrencies(new Set(valid.length > 0 ? valid : MAIN_CUR))
      }

      // Impact listesi — ALL_IMP ile karşılaştır, eksik varsa tümünü aç
      if (Array.isArray(p.impacts) && p.impacts.length > 0) {
        const valid = p.impacts.filter(i => ALL_IMP.includes(i))
        // Kullanıcının kaydettiği seçimi koru; hiçbiri geçerli değilse
        // güvenli varsayılan olarak tüm filtreleri aç.
        setSelImpacts(new Set(valid.length > 0 ? valid : ALL_IMP))
      }

      if (p.notifMinutes)  setNotifMinutes(p.notifMinutes)
      if (p.notifCurs)     setNotifCurs(new Set(p.notifCurs))
      // Daha önce aktif ettiyse tekrar sor — in-app çalışır
      if (p.notifEnabled)  setNotifPerm('granted')
    }
    // Tarayıcı bildirimi ayrıca granted ise de aktif et
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted')
      setNotifPerm('granted')
    setPrefsLoaded(true)
  }, [])

  useEffect(() => {
    // Bug fix: burada eskiden her zaman ALL_IMP kaydediliyordu, bu yüzden
    // kullanıcının Impact filtresindeki seçimi sayfa yenilenince kayboluyordu.
    // Artık gerçek seçim (selImpacts) kaydediliyor.
    saveP({ timezone, currencies: [...selCurrencies], impacts: [...selImpacts], notifMinutes, notifCurs: [...notifCurs] })
  }, [timezone, selCurrencies, selImpacts, notifMinutes, notifCurs])

  /* ── In-app alert sistemi — mobilde de çalışır ── */
  useEffect(() => {
    if (notifPerm !== 'granted') return
    const notified = new Set()

    const check = () => {
      events.forEach(ev => {
        if (ev.impact_level !== 'high') return
        if (!notifCurs.has(ev.currency)) return
        if (notified.has(ev.event_hash)) return
        const diff = new Date(ev.scheduled_at).getTime() - Date.now()
        const target = notifMinutes * 60 * 1000
        if (diff > target - 30000 && diff <= target + 30000) {
          notified.add(ev.event_hash)
          const label = notifMinutes === 60 ? '1 saat' : `${notifMinutes} dk`
          const alertId = ev.event_hash + '-' + Date.now()

          // In-app banner ekle
          setInAppAlerts(prev => [...prev, {
            id: alertId,
            text: `⚠️ ${ev.currency} — ${ev.event_name} (${label} kaldı)`,
            color: C.high,
          }])

          // 8 saniye sonra kaldır
          setTimeout(() => {
            setInAppAlerts(prev => prev.filter(a => a.id !== alertId))
          }, 8000)

          // Tarayıcı bildirimi de dene (destekliyorsa)
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(`⚠️ ${ev.currency} — ${ev.event_name}`, {
                body: `${label} kaldı`, icon: '/favicon.ico', tag: ev.event_hash,
              })
            } catch {}
          }
        }
      })
    }

    check()
    const id = setInterval(check, 30000)
    return () => clearInterval(id)
  }, [events, timezone, notifMinutes, notifCurs, notifPerm])

  useEffect(() => { if (prefsLoaded) fetchData() }, [weekOffset, selectedDay, rangeMode, prefsLoaded, timezone])

  // Veri gelince geçmiş günleri otomatik kapat (bugün ve gelecek açık kalır)
  useEffect(() => {
    if (events.length === 0) return
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: timezone })
    const pastKeys = new Set()
    for (const ev of events) {
      const key = ev.scheduled_at?.split('T')[0]
      if (key && key < todayKey) pastKeys.add(key)
    }
    setCollapsedDays(pastKeys)
  }, [events])

  async function fetchData() {
    setLoading(true)
    try {
      let from, to
      if (selectedDay) {
        // 'YYYY-MM-DD' → günün tam UTC aralığı.
        // 'T00:00:00' (timezone suffix yok) local time olarak parse edilir — hataya yol açar.
        // 'T00:00:00Z' ile UTC'ye sabitleriz; API zaten UTC ile çalışıyor.
        from = new Date(selectedDay + 'T00:00:00Z')
        to   = new Date(selectedDay + 'T23:59:59Z')
      } else if (rangeMode === 'past30') {
        // Son 30 gün: backend zaten DB'de biriken tüm veriyi -7/+14 varsayılan
        // penceresinin ötesinde de sorgulayabiliyor (from/to açıkça verilirse
        // sınırsız) — burada bilerek geniş bir aralık istiyoruz. ForexFactory
        // kaynağı (lastweek/thisweek/nextweek feed'leri) en fazla ~3 hafta
        // geriye gider; DB'de daha fazlası birikmemiş olabilir, o zaman bu
        // görünüm elindeki en eski veriye kadar gösterir.
        to   = new Date(); to.setHours(23, 59, 59, 999)
        from = new Date(to); from.setDate(from.getDate() - 30); from.setHours(0, 0, 0, 0)
      } else {
        // Hafta başlangıcını seçili timezone'a göre hesapla
        // Örn: Tokyo (UTC+9) kullanıcısı için Pazartesi 00:00 JST = Pazar 15:00 UTC
        const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }))
        const dow = nowInTz.getDay()
        const monInTz = new Date(nowInTz)
        monInTz.setDate(nowInTz.getDate() - ((dow + 6) % 7) + weekOffset * 7)
        monInTz.setHours(0, 0, 0, 0)

        // Geri gerçek UTC'ye çevir
        const tzOffset = new Date(monInTz.toLocaleString('en-US', { timeZone: timezone })).getTime()
                       - new Date(monInTz.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()

        from = new Date(monInTz.getTime() - tzOffset)
        to   = new Date(from); to.setDate(from.getDate() + 6); to.setHours(23, 59, 59, 999)
      }
      const res  = await fetch(`/api/calendar?from=${from.toISOString()}&to=${to.toISOString()}`)
      const json = await res.json()
      setEvents(json.data || [])
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function requestNotif() {
    // Mobil tarayıcılarda Notification API çalışmıyor — in-app alert kullan
    // Sadece granted kontrolü için deniyoruz, olmasa da in-app çalışır
    if ('Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission() } catch {}
    }
    // Her durumda in-app bildirimi aktif et
    setNotifPerm('granted')
    saveP({ timezone, currencies: [...selCurrencies], impacts: [...selImpacts], notifMinutes, notifCurs: [...notifCurs], notifEnabled: true })
  }

  function toggleCur(c) { setSelCurrencies(p => { const n=new Set(p); n.has(c)?n.delete(c):n.add(c); return n }) }
  function toggleImp(i) { setSelImpacts(p => { const n=new Set(p); n.has(i)?n.delete(i):n.add(i); return n }) }

  function fmtCountdown(iso) {
    const diff = new Date(iso).getTime() - now
    if (diff <= 0) return null
    const totalSec = Math.floor(diff / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    if (h > 0) return `${h}s ${String(m).padStart(2,'0')}dk`
    if (m > 0) return `${m}dk ${String(s).padStart(2,'0')}sn`
    return `${s}sn`
  }

  function fmtTime(iso) {
    try {
      return new Date(iso).toLocaleTimeString('en-US', {
        hour:'numeric', minute:'2-digit', hour12:true, timeZone:timezone
      }).toLowerCase()
    } catch { return '' }
  }

  function fmtDay(key) {
    try {
      const d = new Date(key + 'T12:00:00Z')
      return isMobile
        ? d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', timeZone:timezone })
        : d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', timeZone:timezone })
    } catch { return key }
  }

  function isToday(key) { return key === new Date().toLocaleDateString('en-CA', { timeZone:timezone }) }
  function isPast(iso)  { return new Date(iso) < new Date() }
  function isDayPast(key) {
    try { return new Date(key + 'T23:59:59') < new Date() } catch { return false }
  }

  function navLabel() {
    if (selectedDay) {
      try {
        return new Date(selectedDay + 'T12:00:00Z').toLocaleDateString('en-US', {
          weekday:'short', month:'short', day:'numeric'
        })
      } catch { return selectedDay }
    }
    if (rangeMode === 'past30') return 'Last 30 Days'
    if (weekOffset === 0)  return 'This Week'
    if (weekOffset === -1) return 'Last Week'
    if (weekOffset === 1)  return 'Next Week'
    if (weekOffset < 0)    return `${Math.abs(weekOffset)} Wks Ago`
    return `In ${weekOffset} Wks`
  }

  function navPrev() {
    if (selectedDay) {
      const d = new Date(selectedDay + 'T12:00:00Z'); d.setDate(d.getDate() - 1)
      setSelectedDay(toISO(d))
    } else if (rangeMode === 'past30') {
      // "Son 30 Gün" sabit bir pencere — ok tuşları bu modda hafta
      // kaydırmıyor, çıkmak için görünümü değiştirmek gerekiyor.
      return
    } else setWeekOffset(w => w - 1)
  }
  function navNext() {
    if (selectedDay) {
      const d = new Date(selectedDay + 'T12:00:00Z'); d.setDate(d.getDate() + 1)
      setSelectedDay(toISO(d))
    } else if (rangeMode === 'past30') {
      return
    } else setWeekOffset(w => w + 1)
  }

  const filtered = events.filter(e => {
    const imp = e.impact_level || 'low'
    const cur = e.currency || ''
    // impact_level DB'de beklenmedik değer varsa göster (filtreyi geç)
    const impOk = selImpacts.has(imp) || !['high','medium','low','holiday'].includes(imp)
    // currency filter — ALL veya boş currency event'leri her zaman göster
    const curOk = cur === '' || cur === 'ALL' || selCurrencies.has(cur)
    return impOk && curOk
  })

  const grouped = {}
  for (const e of filtered) {
    if (!e.scheduled_at) continue
    // UTC split yerine timezone'a göre tarih — NYC'de gece yarısı sonrası event'ler doğru güne düşer
    const key = new Date(e.scheduled_at).toLocaleDateString('en-CA', { timeZone: timezone })
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(e)
  }

  /* ── Mini takvim — her zaman görünür ── */
  const miniCal = (
    <MiniCal
      weekOffset={weekOffset}
      selectedDay={selectedDay}
      onSelectDay={day => { setSelectedDay(day); setWeekOffset(0); setRangeMode('week') }}
      onSelectWeek={o  => { setWeekOffset(o); setSelectedDay(null); setRangeMode('week') }}
    />
  )

  /* ── Topbar ── */
  const topBar = (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding: isMobile ? '7px 10px' : '7px 14px',
      background:'#0f1526',
      borderBottom:`1px solid ${C.border}`,
      flexShrink: 0,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:3 }}>
        <button onClick={navPrev} disabled={rangeMode === 'past30' && !selectedDay}
          style={{...TBTN, opacity: (rangeMode === 'past30' && !selectedDay) ? 0.35 : 1}}>‹</button>
        <span style={{
          fontSize:11, fontWeight:700,
          color: selectedDay ? C.yellow : C.textDim,
          minWidth: isMobile ? 80 : 100, textAlign:'center',
          letterSpacing:'0.04em', textTransform:'uppercase',
          cursor: selectedDay ? 'pointer' : 'default',
        }}
          onClick={() => { if (selectedDay) { setSelectedDay(null) } }}
        >
          {navLabel()}
        </span>
        <button onClick={navNext} disabled={rangeMode === 'past30' && !selectedDay}
          style={{...TBTN, opacity: (rangeMode === 'past30' && !selectedDay) ? 0.35 : 1}}>›</button>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        {!selectedDay && (
          <button
            onClick={() => {
              if (rangeMode === 'past30') { setRangeMode('week'); setWeekOffset(0) }
              else setRangeMode('past30')
            }}
            title="Son 30 günün tüm ekonomik olayları"
            style={{
              padding:'5px 8px', borderRadius:3,
              border:`1px solid ${rangeMode === 'past30' ? C.blue : C.border}`,
              background: rangeMode === 'past30' ? 'rgba(68,153,221,0.1)' : 'transparent',
              color: rangeMode === 'past30' ? C.blue : C.textDim,
              fontSize:11, fontWeight:600, cursor:'pointer',
            }}>
            30G
          </button>
        )}
        {notifPerm !== 'granted'
          ? <button onClick={requestNotif} style={{...TBTN, color:'#f0b429', fontSize:13}}>🔔</button>
          : <span style={{fontSize:11, color:C.green, padding:'0 4px'}}>🔔✓</span>
        }
        <button
          onClick={() => setShowFilter(f => !f)}
          style={{
            display:'flex', alignItems:'center', gap:5,
            padding:'5px 10px', borderRadius:3,
            border:`1px solid ${showFilter ? C.blue : C.border}`,
            background: showFilter ? 'rgba(68,153,221,0.1)' : 'transparent',
            color: showFilter ? C.blue : C.textDim,
            fontSize:11, fontWeight:600, cursor:'pointer', position:'relative',
          }}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><path d="M0 1h12L8 6v5l-4-2V6z"/></svg>
          Filter
          {(selCurrencies.size < ALL_CUR.length || selImpacts.size < ALL_IMP.length) && (
            <span style={{ position:'absolute', top:3, right:3, width:5, height:5, borderRadius:'50%', background:C.blue }}/>
          )}
        </button>
      </div>
    </div>
  )

  /* ── Filter panel ── */
  const filterPanel = showFilter && (
    <div style={{
      background:'#0f1526', borderBottom:`1px solid ${C.border}`,
      padding:'12px 14px', display:'flex', flexDirection:'column',
      gap:14, flexShrink:0, maxHeight:'58vh', overflowY:'auto',
    }}>
      <div>
        <div style={SL}>Timezone</div>
        <div style={SG}>
          {TZS.map(tz => (
            <button key={tz.value} onClick={() => setTimezone(tz.value)}
              style={{...SC,...(timezone===tz.value?SCO:{})}}>
              {tz.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div style={SL}>
          Currencies
          <span style={SLK} onClick={() => setSelCurrencies(new Set(ALL_CUR))}>All</span>
          <span style={SLK} onClick={() => setSelCurrencies(new Set())}>None</span>
        </div>
        <div style={SG}>
          {ALL_CUR.map(c => (
            <button key={c} onClick={() => toggleCur(c)}
              style={{...SC,...(selCurrencies.has(c)?SCO:{})}}>
              {FLAG[c]||''} {c}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div style={SL}>
          Impact
          <span style={SLK} onClick={() => setSelImpacts(new Set(ALL_IMP))}>All</span>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {ALL_IMP.map(imp => {
            const cfg = IMP[imp], on = selImpacts.has(imp)
            return (
              <button key={imp} onClick={() => toggleImp(imp)}
                style={{
                  display:'flex', alignItems:'center', gap:7,
                  padding:'6px 14px', borderRadius:3,
                  border:`1px solid ${on?cfg.color:C.border}`,
                  background: on ? cfg.color+'18' : 'transparent',
                  color: on ? cfg.color : C.textDim,
                  fontSize:12, fontWeight:700, cursor:'pointer',
                }}>
                <span style={{width:9,height:9,borderRadius:'50%',background:cfg.color,display:'inline-block',flexShrink:0}}/>
                {cfg.label}
              </button>
            )
          })}
        </div>
      </div>
      {/* Bildirim ayarları */}
      {notifPerm === 'granted' && (
        <div>
          <div style={SL}>🔔 Notification Timing</div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
            {[5,15,30,60].map(m => (
              <button key={m} onClick={() => setNotifMinutes(m)} style={{
                padding:'4px 12px', borderRadius:3, fontSize:11, fontWeight:700, cursor:'pointer',
                border:`1px solid ${notifMinutes===m ? C.yellow : C.border}`,
                background: notifMinutes===m ? C.yellow+'22' : 'transparent',
                color: notifMinutes===m ? C.yellow : C.textDim,
              }}>
                {m === 60 ? '1 hr' : `${m} min`}
              </button>
            ))}
          </div>
          <div style={SL}>
            Currency Alerts
            <span style={SLK} onClick={() => setNotifCurs(new Set(MAIN_CUR))}>All</span>
            <span style={SLK} onClick={() => setNotifCurs(new Set())}>None</span>
          </div>
          <div style={SG}>
            {MAIN_CUR.map(c => (
              <button key={c} onClick={() => setNotifCurs(p => { const n=new Set(p); n.has(c)?n.delete(c):n.add(c); return n })}
                style={{...SC,...(notifCurs.has(c)?{...SCO,borderColor:C.yellow,color:C.yellow,background:C.yellow+'18'}:{})}}>
                {FLAG[c]||''} {c}
              </button>
            ))}
          </div>
        </div>
      )}
      {notifPerm !== 'granted' && (
        <div style={{fontSize:11,color:C.textFaint}}>
          🔔 <span style={{cursor:'pointer',color:C.yellow,textDecoration:'underline'}} onClick={requestNotif}>Enable notifications</span> to set alert timing and currency filters.
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{fontSize:11,color:C.textFaint}}>{filtered.length} events</span>
        <button onClick={() => setShowFilter(false)} style={{
          padding:'6px 18px', borderRadius:3, border:'none',
          background:C.blue, color:'#111', fontSize:12, fontWeight:700, cursor:'pointer',
        }}>Apply ✓</button>
      </div>
    </div>
  )

  /* ════════════════════════════════════════
     PC GÖRÜNÜMÜ
  ════════════════════════════════════════ */
  if (!isMobile) {
    let lastTime = ''
    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100%', background:C.pageBg, fontFamily:'Arial,sans-serif', fontSize:13 }}>
        {topBar}
        {miniCal}
        {filterPanel}
        <div style={{ flex:1, overflowY:'auto' }}>
          {loading && <Spinner/>}
          {!loading && filtered.length === 0 && <Empty/>}
          {!loading && (
            <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
              <thead>
                <tr style={{ background: C.theadBg }}>
                  <th style={{...TH, width:50}}>Date</th>
                  <th style={{...TH, width:66}}>Time</th>
                  <th style={{...TH, width:50}}>Cur</th>
                  <th style={{...TH, width:36, textAlign:'center'}}>Imp</th>
                  <th style={TH}>Event</th>
                  <th style={{...TH, width:66, textAlign:'right'}}>Actual</th>
                  <th style={{...TH, width:66, textAlign:'right'}}>Forecast</th>
                  <th style={{...TH, width:66, textAlign:'right', paddingRight:14}}>Previous</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(grouped).map(([dateKey, dayEvents]) => {
                  lastTime = ''
                  const today   = isToday(dateKey)
                  const dayPast = isDayPast(dateKey) && !today
                  const isCollapsed = dayPast && collapsedDays.has(dateKey)
                  return [
                    <tr
                      key={'d-'+dateKey}
                      onClick={() => dayPast && toggleDay(dateKey)}
                      style={{
                        background: today ? '#122a1c' : dayPast ? '#0f1526' : C.dayBg,
                        cursor: dayPast ? 'pointer' : 'default',
                      }}
                    >
                      <td colSpan={8} style={{
                        padding: dayPast ? '5px 12px' : '7px 12px',
                        fontSize: dayPast ? 11 : 13,
                        fontWeight: dayPast ? 400 : 700,
                        color: today ? C.green : dayPast ? C.textFaint : C.textDay,
                        borderTop: `1px solid ${today?'#153d24':C.borderDay}`,
                        borderBottom: `1px solid ${C.border}`,
                        position:'sticky', top:0, zIndex:2,
                        opacity: dayPast ? 0.5 : 1,
                        userSelect: 'none',
                      }}>
                        {fmtDay(dateKey)}
                        {dayPast && (
                          <span style={{marginLeft:8, fontSize:10, color:'#444'}}>
                            ({dayEvents.length} events) {isCollapsed ? '›' : '⌄'}
                          </span>
                        )}
                        {today && <span style={{
                          marginLeft:10, fontSize:9, fontWeight:800,
                          background:C.green, color:'#111',
                          padding:'1px 7px', borderRadius:2,
                          letterSpacing:'0.08em', verticalAlign:'middle',
                        }}>TODAY</span>}
                      </td>
                    </tr>,
                    ...(!isCollapsed ? dayEvents.map((ev, i) => {
                      const cfg = IMP[ev.impact_level] || IMP.low
                      const past = isPast(ev.scheduled_at)
                      const released = hasV(ev.actual)
                      const timeStr = fmtTime(ev.scheduled_at)
                      const showTime = timeStr !== lastTime
                      if (showTime) lastTime = timeStr
                      const diffMs   = new Date(ev.scheduled_at).getTime() - now
                      const upcoming = !past && ev.impact_level === 'high' && diffMs > 0 && diffMs < 60 * 60 * 1000
                      const countdown = upcoming ? fmtCountdown(ev.scheduled_at) : null
                      const bg = upcoming ? '#3a1618' : i%2===0 ? C.rowOdd : C.rowEven
                      return (
                        <tr key={ev.id||i} style={{
                          background:bg, opacity:past&&!released?0.4:1,
                          borderLeft:upcoming?`3px solid ${C.high}`:`3px solid transparent`,
                        }}>
                          <td style={{...TD, paddingLeft:12, color:C.textFaint, fontSize:10}}/>
                          <td style={{...TD, fontFamily:'monospace', fontSize:12,
                            color:upcoming?C.high:past?C.textFaint:C.textDim,
                            whiteSpace:'nowrap', paddingLeft:6}}>
                            {showTime ? (timeStr==='12:00 am'?'All Day':timeStr) : ''}
                          </td>
                          <td style={TD}>
                            <div style={{display:'flex',alignItems:'center',gap:4}}>
                              <span style={{fontSize:14,lineHeight:1}}>{FLAG[ev.currency]||'🌐'}</span>
                              <span style={{fontSize:11,fontWeight:700,color:cfg.color,letterSpacing:'0.03em'}}>{ev.currency}</span>
                            </div>
                          </td>
                          <td style={{...TD,textAlign:'center'}}>
                            <div style={{display:'flex',justifyContent:'center'}}><Dots level={ev.impact_level} size={7}/></div>
                          </td>
                          <td style={{...TD, paddingRight:8}}>
                            <div style={{fontSize:13,color:past&&!released?C.textFaint:C.white,lineHeight:1.3}}>
                              {ev.event_name}
                            </div>
                            {upcoming && countdown && (
                              <span style={{
                                fontSize:10, fontWeight:800, color:C.high,
                                fontFamily:'monospace', letterSpacing:'0.02em',
                                animation: diffMs < 5*60*1000 ? 'pulse 1s infinite' : 'none',
                              }}>⏱ {countdown}</span>
                            )}
                          </td>
                          <td style={{...TD,textAlign:'right',fontFamily:'monospace',fontWeight:700}}>
                            {released && (
                              <span style={{color:actColor(ev.actual,ev.forecast),fontSize:13}}>
                                {ev.actual}
                                {/* vs Previous — küçük ok */}
                                {hasV(ev.previous) && (
                                  <span style={{
                                    fontSize:9, marginLeft:3, fontWeight:700,
                                    color: actVsPrevColor(ev.actual, ev.previous),
                                  }}>
                                    {parseFloat(String(ev.actual).replace(/[^0-9.\-]/g,'')) >= parseFloat(String(ev.previous).replace(/[^0-9.\-]/g,'')) ? '▲' : '▼'}
                                  </span>
                                )}
                              </span>
                            )}
                          </td>
                          <td style={{...TD,textAlign:'right',fontFamily:'monospace'}}>
                            {hasV(ev.forecast) && <span style={{color:C.textDim,fontSize:12}}>{ev.forecast}</span>}
                          </td>
                          <td style={{...TD,textAlign:'right',fontFamily:'monospace',paddingRight:14}}>
                            {hasV(ev.previous) && <span style={{color:C.textFaint,fontSize:12}}>{ev.previous}</span>}
                          </td>
                        </tr>
                      )
                    }) : []),
                  ]
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    )
  }

  /* ════════════════════════════════════════
     MOBİL GÖRÜNÜMÜ
  ════════════════════════════════════════ */
  let lastTimeMob = ''
  return (
    <div style={{
      display:'flex', flexDirection:'column', height:'100%',
      background:C.pageBg,
      fontFamily:"-apple-system,'Helvetica Neue',Arial,sans-serif",
    }}>
      {topBar}
      {miniCal}
      {filterPanel}

      {/* In-app alert bannerları */}
      {inAppAlerts.length > 0 && (
        <div style={{ position:'sticky', top:0, zIndex:10, display:'flex', flexDirection:'column', gap:2, padding:'4px 8px' }}>
          {inAppAlerts.map(a => (
            <div key={a.id} style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              background: '#3a1618', border:`1px solid ${a.color}`,
              borderLeft:`3px solid ${a.color}`,
              borderRadius:4, padding:'8px 12px',
              fontSize:12, fontWeight:700, color: a.color,
              boxShadow:`0 2px 12px ${a.color}33`,
              animation:'slideIn 0.2s ease',
            }}>
              <span>{a.text}</span>
              <button onClick={() => setInAppAlerts(p => p.filter(x => x.id !== a.id))}
                style={{ background:'none', border:'none', color:'#555', fontSize:14, cursor:'pointer', padding:'0 0 0 8px' }}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex:1, overflowY:'auto' }}>
        {loading && <Spinner/>}
        {!loading && filtered.length === 0 && <Empty/>}
        {!loading && Object.entries(grouped).map(([dateKey, dayEvents]) => {
          lastTimeMob = ''
          const today   = isToday(dateKey)
          const dayPast = isDayPast(dateKey) && !today
          const isCollapsed = dayPast && collapsedDays.has(dateKey)
          return (
            <div key={dateKey}>
              {/* Gün başlığı */}
              <div
                onClick={() => dayPast && toggleDay(dateKey)}
                style={{
                  display:'flex', alignItems:'center', gap:8,
                  padding: dayPast ? '6px 12px' : '9px 12px',
                  background: today ? '#122a1c' : dayPast ? '#0f1526' : '#141b2e',
                  borderTop: `${dayPast?1:2}px solid ${today?'#153d24':dayPast?'#222':'#333'}`,
                  borderBottom: `1px solid ${C.border}`,
                  position:'sticky', top:0, zIndex:3,
                  opacity: dayPast ? 0.5 : 1,
                  cursor: dayPast ? 'pointer' : 'default',
                  userSelect: 'none',
                }}>
                {!dayPast && <div style={{width:3,height:14,borderRadius:2,background:today?C.green:C.textFaint,flexShrink:0}}/>}
                <span style={{
                  fontSize: dayPast ? 11 : 13,
                  fontWeight: dayPast ? 400 : 700,
                  color: today ? C.green : dayPast ? C.textFaint : C.textDay,
                  flex:1,
                }}>
                  {fmtDay(dateKey)}
                  {dayPast && (
                    <span style={{marginLeft:6, fontSize:10, color:'#444'}}>
                      ({dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''})
                    </span>
                  )}
                </span>
                {today && <span style={{
                  fontSize:9, fontWeight:800, letterSpacing:'0.07em',
                  background:C.green, color:'#111', padding:'2px 7px', borderRadius:2,
                }}>TODAY</span>}
                {dayPast && (
                  <span style={{fontSize:11, color:'#444', marginLeft:4}}>
                    {isCollapsed ? '›' : '⌄'}
                  </span>
                )}
              </div>

              {/* Event kartları — geçmiş gün kapalıysa gizle */}
              {!isCollapsed && dayEvents.map((ev, i) => {
                const cfg = IMP[ev.impact_level] || IMP.low
                const past = isPast(ev.scheduled_at)
                const released = hasV(ev.actual)
                const timeStr = fmtTime(ev.scheduled_at)
                const showTime = timeStr !== lastTimeMob
                if (showTime) lastTimeMob = timeStr
                const diffMs   = new Date(ev.scheduled_at).getTime() - now
                const upcoming = !past && ev.impact_level === 'high' && diffMs > 0 && diffMs < 60 * 60 * 1000
                const countdown = upcoming ? fmtCountdown(ev.scheduled_at) : null
                return (
                  <div key={ev.id||i} style={{
                    display:'flex',
                    background: upcoming ? '#3a1618' : i%2===0 ? C.rowOdd : C.rowEven,
                    borderBottom: `1px solid ${C.border}`,
                    borderLeft: `3px solid ${upcoming ? C.high : cfg.color}`,
                    opacity: past&&!released ? 0.38 : 1,
                    minHeight: 48,
                  }}>
                    {/* Saat */}
                    <div style={{
                      width:48, flexShrink:0,
                      display:'flex', flexDirection:'column',
                      alignItems:'center', justifyContent:'center',
                      borderRight:`1px solid ${C.border}`,
                    }}>
                      {showTime ? (
                        timeStr === '12:00 am' ? (
                          <span style={{fontSize:8,color:C.textFaint,fontWeight:700,textTransform:'uppercase'}}>All Day</span>
                        ) : (
                          <>
                            <span style={{fontSize:12,fontWeight:700,fontFamily:'monospace',color:upcoming?C.high:past?C.textFaint:C.text,lineHeight:1.1}}>
                              {timeStr.replace(/\s?(am|pm)/i,'')}
                            </span>
                            <span style={{fontSize:9,fontWeight:600,color:upcoming?C.high:C.textFaint,textTransform:'uppercase'}}>
                              {timeStr.match(/am|pm/i)?.[0]||''}
                            </span>
                          </>
                        )
                      ) : (
                        <div style={{width:1,height:'60%',background:C.border}}/>
                      )}
                    </div>
                    {/* Impact */}
                    <div style={{width:20,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',borderRight:`1px solid ${C.border}`}}>
                      <Dots level={ev.impact_level} size={5}/>
                    </div>
                    {/* Currency + Event */}
                    <div style={{flex:1,minWidth:0,padding:'7px 8px',display:'flex',flexDirection:'column',justifyContent:'center',gap:3}}>
                      <div style={{display:'flex',alignItems:'center',gap:5}}>
                        <span style={{fontSize:13,lineHeight:1}}>{FLAG[ev.currency]||'🌐'}</span>
                        <span style={{fontSize:10,fontWeight:700,color:cfg.color,letterSpacing:'0.04em'}}>{ev.currency}</span>
                        {upcoming && countdown && (
                          <span style={{
                            fontSize:9, fontWeight:800, color:C.high,
                            background:'rgba(221,68,68,0.12)',
                            padding:'2px 6px', borderRadius:3,
                            fontFamily:'monospace', letterSpacing:'0.02em',
                            animation: diffMs < 5*60*1000 ? 'pulse 1s infinite' : 'none',
                          }}>
                            ⏱ {countdown}
                          </span>
                        )}
                      </div>
                      <div style={{fontSize:13,lineHeight:1.3,fontWeight:500,color:past&&!released?C.textDim:C.white,wordBreak:'break-word'}}>
                        {ev.event_name}
                      </div>
                    </div>
                    {/* A/F/P */}
                    <div style={{width:80,flexShrink:0,display:'flex',flexDirection:'column',alignItems:'flex-end',justifyContent:'center',paddingRight:10,gap:2,borderLeft:`1px solid ${C.border}`}}>
                      <div style={{display:'flex',alignItems:'baseline',gap:3}}>
                        <span style={{fontSize:8,color:C.textFaint,fontWeight:700}}>A</span>
                        {released ? (
                          <span style={{display:'flex',alignItems:'baseline',gap:2}}>
                            <span style={{fontSize:13,fontWeight:700,fontFamily:'monospace',color:actColor(ev.actual,ev.forecast)}}>{ev.actual}</span>
                            {hasV(ev.previous) && (
                              <span style={{fontSize:9,fontWeight:700,color:actVsPrevColor(ev.actual,ev.previous)}}>
                                {parseFloat(String(ev.actual).replace(/[^0-9.\-]/g,'')) >= parseFloat(String(ev.previous).replace(/[^0-9.\-]/g,'')) ? '▲' : '▼'}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span style={{fontSize:11,color:C.textFaint}}>—</span>
                        )}
                      </div>
                      {hasV(ev.forecast) && (
                        <div style={{display:'flex',alignItems:'baseline',gap:3}}>
                          <span style={{fontSize:8,color:C.textFaint,fontWeight:700}}>F</span>
                          <span style={{fontSize:11,color:C.textDim,fontFamily:'monospace'}}>{ev.forecast}</span>
                        </div>
                      )}
                      {hasV(ev.previous) && (
                        <div style={{display:'flex',alignItems:'baseline',gap:3}}>
                          <span style={{fontSize:8,color:C.textFaint,fontWeight:700}}>P</span>
                          <span style={{fontSize:11,color:C.textFaint,fontFamily:'monospace'}}>{ev.previous}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Yardımcı ─── */
function Spinner() {
  return (
    <div style={{padding:'50px 0',display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
      <div style={{width:22,height:22,borderRadius:'50%',border:'2px solid #333',borderTopColor:'#22b8f0',animation:'spin 0.7s linear infinite'}}/>
      <span style={{color:'#666',fontSize:13}}>Loading...</span>
    </div>
  )
}
function Empty() {
  return <div style={{padding:'50px 0',textAlign:'center',color:'#555',fontSize:13}}>No events</div>
}

/* ─── Stil sabitler ─── */
const TBTN = {
  width:30, height:30, borderRadius:3,
  border:'1px solid #1c2438', background:'transparent',
  color:'#888', fontSize:17, cursor:'pointer',
  display:'flex', alignItems:'center', justifyContent:'center',
}
const NAV = {
  width:18, height:18, borderRadius:2,
  border:'1px solid #1c2438', background:'transparent',
  color:'#666', fontSize:11, cursor:'pointer',
  display:'flex', alignItems:'center', justifyContent:'center',
  padding:0, lineHeight:1,
}
const TH = {
  padding:'7px 5px', fontSize:10, fontWeight:700, color:'#555',
  textTransform:'uppercase', letterSpacing:'0.06em',
  borderBottom:'2px solid #1c2438', textAlign:'left', flexShrink:0,
}
const TD = {
  padding:'5px 3px', borderBottom:'1px solid #151b2c', verticalAlign:'middle',
}
const SL = {
  display:'flex', alignItems:'center', gap:8,
  fontSize:10, fontWeight:700, color:'#444',
  textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6,
}
const SG  = { display:'flex', flexWrap:'wrap', gap:4 }
const SLK = { color:'#22b8f0', cursor:'pointer', fontSize:10, fontWeight:600 }
const SC  = { padding:'3px 8px', borderRadius:2, border:'1px solid #1c2438', background:'transparent', color:'#666', fontSize:11, fontWeight:600, cursor:'pointer' }
const SCO = { background:'rgba(68,153,221,0.12)', borderColor:'#22b8f0', color:'#22b8f0' }
