'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import NewsFeed from '@/components/NewsFeed'
import EconomicCalendar from '@/components/EconomicCalendar'
import SettingsPanel from '@/components/SettingsPanel'
import AuthWidget from '@/components/AuthWidget'
import { createClient } from '@/lib/supabase/client'
import { color, font, radius, shadow } from '@/lib/theme'

const TABS = ['NEWS', 'CALENDAR', 'SAVED']
const TAB_KEY = 'mw_active_tab'

function useClock() {
  const [clock, setClock] = useState('')
  const [tz, setTz]       = useState('Europe/Istanbul')
  useEffect(() => {
    function getTz() {
      try { return JSON.parse(localStorage.getItem('mw_calendar_prefs') || '{}').timezone || 'Europe/Istanbul' }
      catch { return 'Europe/Istanbul' }
    }
    const tick = () => {
      const t = getTz(); setTz(t)
      setClock(new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit', timeZone:t }))
    }
    tick()
    const id = setInterval(tick, 1000)
    window.addEventListener('storage', tick)
    return () => { clearInterval(id); window.removeEventListener('storage', tick) }
  }, [])
  return { clock, tz }
}

function shortTz(tz) {
  const m = {
    'Europe/Istanbul':'IST','UTC':'UTC','Europe/London':'LON',
    'America/New_York':'NYC','America/Chicago':'CHI','America/Los_Angeles':'LA',
    'Asia/Tokyo':'TKY','Australia/Sydney':'SYD','Asia/Dubai':'DXB',
    'Asia/Singapore':'SGP','Europe/Berlin':'FRA','Europe/Paris':'PAR',
    'Europe/Zurich':'ZRH','Asia/Hong_Kong':'HKG',
  }
  return m[tz] || tz.split('/').pop().slice(0,3).toUpperCase()
}

// YENİ: ABD piyasası (NYSE/NASDAQ) açık mı kapalı mı — sade bir gösterge.
// Hafta içi 09:30–16:00 America/New_York saatine göre hesaplanır.
function useMarketStatus() {
  const [open, setOpen] = useState(null)
  useEffect(() => {
    function check() {
      try {
        const now = new Date()
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York', hour12:false,
          weekday:'short', hour:'2-digit', minute:'2-digit',
        }).formatToParts(now)
        const get = t => parts.find(p => p.type === t)?.value
        const wd = get('weekday')
        const hh = parseInt(get('hour'), 10)
        const mm = parseInt(get('minute'), 10)
        const mins = hh * 60 + mm
        const isWeekday = !['Sat','Sun'].includes(wd)
        setOpen(isWeekday && mins >= 9*60+30 && mins < 16*60)
      } catch { setOpen(null) }
    }
    check()
    const id = setInterval(check, 30000)
    return () => clearInterval(id)
  }, [])
  return open
}

export default function Home() {
  const [activeTab,    setActiveTab]    = useState('NEWS')
  const [showSettings, setShowSettings] = useState(false)
  const { clock, tz } = useClock()
  const marketOpen = useMarketStatus()

  // Tab seçimini hatırla
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY)
      if (saved && TABS.includes(saved)) setActiveTab(saved)
    } catch {}
  }, [])

  // BUG FIX: Google girişinden sonra (app/auth/callback/route.js), eskiden
  // var olmayan bir "/saved" sayfasına yönlendiriliyorduk (404 hatası).
  // Artık ana sayfaya "?tab=saved" query param'ıyla dönülüyor; burada bu
  // param'ı okuyup doğru sekmeyi açıyoruz, sonra URL'i temizliyoruz
  // (adres çubuğunda ?tab=saved kalıp kafa karıştırmasın diye).
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab')?.toUpperCase()
      if (tab && TABS.includes(tab)) {
        switchTab(tab)
        window.history.replaceState({}, '', window.location.pathname)
      }
    } catch {}
  }, [])

  // Uygulama ilk açıldığında haber/takvim cron'unu başlat.
  // startCron() sunucu tarafında sadece bir kez gerçek çalışır
  // (bkz. lib/fetchers/startCron.js — process guard'lı).
  useEffect(() => {
    fetch('/api/cron').catch(() => {})
  }, [])

  function switchTab(tab) {
    setActiveTab(tab)
    try { localStorage.setItem(TAB_KEY, tab) } catch {}
  }

  return (
    <div style={s.root}>
      <div style={s.tabBar}>
        {/* NEWS */}
        <button onClick={() => switchTab('NEWS')}
          style={{ ...s.tab, ...(activeTab==='NEWS' ? s.tabActive : {}) }}>
          NEWS
        </button>

        {/* Saat + piyasa durumu + Ayarlar ortada */}
        <div style={s.center}>
          {marketOpen !== null && (
            <span title={marketOpen ? 'ABD piyasası açık' : 'ABD piyasası kapalı'} style={s.marketDot}>
              <span style={{ ...s.marketDotCore, background: marketOpen ? color.success : color.textFaint }} />
            </span>
          )}
          {clock && (
            <div style={s.clockWrap}>
              <span style={s.clockTime}>{clock}</span>
              <span style={s.clockTz}>{shortTz(tz)}</span>
            </div>
          )}
          <button onClick={() => setShowSettings(true)} style={s.settingsBtn} title="Ayarlar">
            ⚙
          </button>
          <AuthWidget />
        </div>

        {/* CALENDAR */}
        <button onClick={() => switchTab('CALENDAR')}
          style={{ ...s.tab, ...(activeTab==='CALENDAR' ? s.tabActive : {}) }}>
          CALENDAR
        </button>
      </div>

      {/* SAVED sekmesi tab bar'ın altında küçük */}
      <div style={s.savedBar}>
        <button onClick={() => switchTab('SAVED')}
          style={{ ...s.savedBtn, ...(activeTab==='SAVED' ? s.savedBtnActive : {}) }}>
          ★ KAYDEDİLENLER
        </button>
      </div>

      <main style={s.main}>
        {activeTab === 'NEWS'     && <NewsFeed />}
        {activeTab === 'CALENDAR' && <EconomicCalendar />}
        {activeTab === 'SAVED'    && <SavedNews />}
      </main>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  )
}

/* Kaydedilen haberler görünümü.
   Giriş yapılmışsa Supabase'teki user_saved_news'ten (cihazlar arası
   senkron), yapılmamışsa eski localStorage listesinden okur. */
function SavedNews() {
  const [saved, setSaved]     = useState([])
  const [user, setUser]       = useState(undefined)
  const [loading, setLoading] = useState(true)
  const [query, setQuery]     = useState('') // YENİ: kaydedilenlerde arama

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return
      setUser(data.user ?? null)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })

    return () => { cancelled = true; sub.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (user === undefined) return // henüz bilinmiyor, bekle

    if (user === null) {
      // Giriş yapılmamış — eski localStorage davranışı
      try {
        const raw = localStorage.getItem('mw_saved_news')
        setSaved(raw ? JSON.parse(raw) : [])
      } catch { setSaved([]) }
      setLoading(false)
      return
    }

    // Giriş yapılmış — sunucudan çek
    setLoading(true)
    fetch('/api/saved')
      .then(r => r.json())
      .then(({ data }) => {
        const mapped = (data || [])
          .filter(row => row.news_items)
          .map(row => ({ ...row.news_items, saved_at: row.created_at }))
        setSaved(mapped)
      })
      .catch(() => setSaved([]))
      .finally(() => setLoading(false))
  }, [user])

  async function remove(id) {
    setSaved(prev => prev.filter(n => n.id !== id))

    if (user) {
      try {
        await fetch(`/api/saved?news_id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      } catch {}
    } else {
      try {
        const raw = localStorage.getItem('mw_saved_news')
        const next = (raw ? JSON.parse(raw) : []).filter(n => n.id !== id)
        localStorage.setItem('mw_saved_news', JSON.stringify(next))
      } catch {}
    }
  }

  if (loading) return null

  if (saved.length === 0) return (
    <div style={{ padding:40, textAlign:'center', color:color.textDim, fontSize:13 }}>
      <div style={{ fontSize:32, marginBottom:12, color: color.gold }}>★</div>
      <div>Henüz kaydedilen haber yok.</div>
      <div style={{ fontSize:11, color:color.textFaint, marginTop:6 }}>
        Haberlerde ★ ikonuna basarak kaydet.
      </div>
      {user === null && (
        <div style={{ fontSize:11, color:color.textFaint, marginTop:14 }}>
          <Link href="/login" style={{ color:color.accent }}>Google ile giriş yap</Link>,
          {' '}kayıtların cihazlar arasında senkron olsun.
        </div>
      )}
    </div>
  )

  const filtered = query.trim()
    ? saved.filter(n => (n.title || '').toLowerCase().includes(query.trim().toLowerCase()))
    : saved

  return (
    <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column' }}>
      {/* YENİ: kaydedilenlerde arama — sade tek satır */}
      {saved.length > 3 && (
        <div style={{ padding:'10px 14px 8px', flexShrink:0 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Kaydedilenlerde ara…"
            style={s.savedSearchInput}
          />
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ padding:24, textAlign:'center', color:color.textFaint, fontSize:12 }}>
          Eşleşen kayıt bulunamadı.
        </div>
      )}

      {filtered.map((item, i) => (
        <div key={item.id || i} style={s.savedRow}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:10, color:color.textFaint, fontFamily:font.mono, marginBottom:4 }}>
              {item.source} · {new Date(item.published_at).toLocaleDateString('tr-TR')}
            </div>
            <a href={item.url || '#'} target="_blank" rel="noopener noreferrer" style={s.savedLink}>
              {item.title}
            </a>
          </div>
          <button onClick={() => remove(item.id)} style={s.savedRemoveBtn}>✕</button>
        </div>
      ))}
    </div>
  )
}

const s = {
  root:     { minHeight:'100vh', background:color.bg, color:color.text, fontFamily:font.mono, display:'flex', flexDirection:'column' },
  tabBar:   { display:'flex', alignItems:'center', borderBottom:`1px solid ${color.border}`, background:color.bgRaised, flexShrink:0 },
  tab:      { flex:1, padding:'12px 0', border:'none', background:'transparent', color:color.textFaint, fontSize:'11px', fontWeight:'700', letterSpacing:'0.12em', cursor:'pointer', borderBottom:'2px solid transparent', transition:'color 0.15s, border-color 0.15s' },
  tabActive:{ color:color.accent, borderBottom:`2px solid ${color.accent}` },
  center:   { display:'flex', alignItems:'center', gap:8, flexShrink:0, padding:'0 8px', borderLeft:`1px solid ${color.borderSoft}`, borderRight:`1px solid ${color.borderSoft}` },
  marketDot:{ width:8, height:8, display:'flex', alignItems:'center', justifyContent:'center' },
  marketDotCore:{ width:6, height:6, borderRadius:'50%' },
  clockWrap:{ display:'flex', flexDirection:'column', alignItems:'center', gap:1 },
  clockTime:{ fontSize:'11px', color:color.textDim, fontFamily:font.mono, fontWeight:'600', letterSpacing:'0.06em', lineHeight:1.2 },
  clockTz:  { fontSize:'8px', color:color.textGhost, fontWeight:'700', letterSpacing:'0.1em' },
  settingsBtn: { background:'none', border:'none', color:color.textFaint, fontSize:15, cursor:'pointer', padding:'2px 4px', lineHeight:1, transition:'color 0.15s' },
  savedBar: { display:'flex', borderBottom:`1px solid ${color.borderSoft}`, background:color.bgRaised, padding:'0 12px' },
  savedBtn: { padding:'6px 10px', background:'none', border:'none', color:color.textFaint, fontSize:9, fontWeight:700, letterSpacing:'0.08em', cursor:'pointer', borderBottom:'2px solid transparent', transition:'color 0.15s, border-color 0.15s' },
  savedBtnActive: { color:color.gold, borderBottom:`2px solid ${color.gold}` },
  main:     { flex:1, overflow:'hidden', display:'flex', flexDirection:'column' },
  savedSearchInput: {
    width:'100%', boxSizing:'border-box', padding:'8px 12px', borderRadius:radius.md,
    background:color.bgInset, border:`1px solid ${color.border}`, color:color.text,
    fontSize:12, fontFamily:font.mono, outline:'none',
  },
  savedRow: {
    display:'flex', gap:10, padding:'12px 14px',
    borderBottom:`1px solid ${color.borderSoft}`, alignItems:'flex-start',
  },
  savedLink: { fontSize:13, color:color.text, textDecoration:'none', lineHeight:1.4, display:'block' },
  savedRemoveBtn: {
    background:'none', border:'none', color:color.textFaint,
    fontSize:16, cursor:'pointer', padding:'0 2px', flexShrink:0,
  },
}
