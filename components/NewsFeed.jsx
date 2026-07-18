'use client'
import { useEffect, useState, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { color, font, radius, shadow, sourceColor as themeSourceColor, impactColor } from '@/lib/theme'

const ASSET_FILTERS = ['all', 'forex', 'crypto', 'equity', 'commodity']

function getDot(level) { return impactColor(level) }
function sourceColor(name) { return themeSourceColor(name) }

function getTimezone() {
  try {
    const raw = localStorage.getItem('mw_calendar_prefs')
    if (!raw) return 'Europe/Istanbul'
    return JSON.parse(raw).timezone || 'Europe/Istanbul'
  } catch { return 'Europe/Istanbul' }
}

function fmtTime(dateStr, tz) {
  try {
    return new Date(dateStr).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', timeZone: tz })
  } catch { return '' }
}

function fmtFull(dateStr, tz) {
  try {
    return new Date(dateStr).toLocaleString('en-GB', {
      day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', timeZone: tz
    })
  } catch { return '' }
}

/* ── Başlık normalize ── */
function normalizeTitle(t) {
  if (!t) return ''
  return t.toLowerCase().replace(/[^a-z0-9\s]/g,'')
    .split(/\s+/)
    .filter(w => !['the','a','an','in','on','at','of','to','for','and','or','but','is','are','was','were','by','from','with'].includes(w))
    .join(' ').slice(0, 60)
}

function similarity(a, b) {
  const sa = new Set(a.split(' ').filter(Boolean))
  const sb = new Set(b.split(' ').filter(Boolean))
  if (!sa.size || !sb.size) return 0
  let inter = 0; for (const w of sa) if (sb.has(w)) inter++
  return inter / (sa.size + sb.size - inter)
}

function groupDuplicates(items) {
  const THRESHOLD = 0.55
  const groups = [], used = new Set()
  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue
    const normA = normalizeTitle(items[i].title)
    const group = { main: items[i], others: [] }
    used.add(i)
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j)) continue
      if (similarity(normA, normalizeTitle(items[j].title)) >= THRESHOLD) {
        group.others.push(items[j]); used.add(j)
      }
    }
    groups.push(group)
  }
  return groups
}

const SAVED_KEY = 'mw_saved_news'

function getSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]') } catch { return [] }
}
function getAiLang() {
  try { return JSON.parse(localStorage.getItem('mw_calendar_prefs') || '{}').aiLang || 'Turkish' } catch { return 'Turkish' }
}

/**
 * Bir haberi kaydeder/kaldırır. Giriş yapılmışsa sunucudaki
 * user_saved_news tablosuna (Google hesabına bağlı, cihazlar arası
 * senkron), yapılmamışsa eski localStorage listesine yazar.
 * @param {boolean} shouldSave - true: kaydet, false: kaldır
 */
async function setSaveState(item, user, shouldSave) {
  if (user) {
    if (shouldSave) {
      await fetch('/api/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ news_id: item.id }),
      })
    } else {
      await fetch(`/api/saved?news_id=${encodeURIComponent(item.id)}`, { method: 'DELETE' })
    }
    return
  }

  const saved = getSaved()
  const next = shouldSave
    ? [...saved.filter(n => n.id !== item.id), { id:item.id, title:item.title, url:item.url, published_at:item.published_at, source:item.news_sources?.name || '' }]
    : saved.filter(n => n.id !== item.id)
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)) } catch {}
}

async function checkIsSaved(newsId, user) {
  if (user) {
    try {
      const res = await fetch('/api/saved')
      const { data } = await res.json()
      return (data || []).some(r => r.news_id === newsId)
    } catch { return false }
  }
  return getSaved().some(n => n.id === newsId)
}
function DetailPanel({ item, allNews, onClose, tz, user }) {
  const [aiSummary,  setAiSummary]  = useState('')
  const [aiLoading,  setAiLoading]  = useState(true)
  const [aiError,    setAiError]    = useState(false)
  const [related,    setRelated]    = useState([])
  const [translateY, setTranslateY] = useState(0)
  const [isSaved,    setIsSaved]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const touchStart  = useRef(null)

  const source = item.news_sources?.name || null
  const color_ = getDot(item.impact_level)

  /* Swipe down to close */
  function onTouchStart(e) { touchStart.current = e.touches[0].clientY }
  function onTouchMove(e) {
    if (touchStart.current === null) return
    const dy = e.touches[0].clientY - touchStart.current
    if (dy > 0) setTranslateY(dy)
  }
  function onTouchEnd() {
    if (translateY > 80) onClose()
    else setTranslateY(0)
    touchStart.current = null
  }

  /* Gemini özeti */
  useEffect(() => {
    let cancelled = false
    async function fetchSummary() {
      setAiLoading(true); setAiError(false)
      try {
        const lang = getAiLang()
        const res = await fetch('/api/news/summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title:item.title, summary:item.summary, tickers:item.tickers, lang }),
        })
        const data = await res.json()
        if (!cancelled) {
          if (data.summary) setAiSummary(data.summary)
          else setAiError(true)
        }
      } catch { if (!cancelled) setAiError(true) }
      finally  { if (!cancelled) setAiLoading(false) }
    }
    fetchSummary()
    return () => { cancelled = true }
  }, [item.id])

  /* İlgili haberler */
  useEffect(() => {
    const tickers = item.tickers || []
    const srcName = item.news_sources?.name
    const rel = allNews
      .filter(n => {
        if (n.id === item.id) return false
        const sharedTicker = tickers.length > 0 && (n.tickers || []).some(t => tickers.includes(t))
        const sameSource   = srcName && n.news_sources?.name === srcName
        return sharedTicker || sameSource
      })
      .slice(0, 6)
    setRelated(rel)
  }, [item.id])

  /* Escape ile kapat */
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [])

  /* Kaydedilme durumunu yükle */
  useEffect(() => {
    let cancelled = false
    checkIsSaved(item.id, user).then(v => { if (!cancelled) setIsSaved(v) })
    return () => { cancelled = true }
  }, [item.id, user])

  async function handleSaveClick() {
    if (saving) return
    setSaving(true)
    const next = !isSaved
    setIsSaved(next) // optimistic
    try {
      await setSaveState(item, user, next)
    } catch {
      setIsSaved(!next) // geri al
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Karartma — dışarı basınca kapan */}
      <div onClick={onClose} style={{
        position:'fixed', inset:0,
        background:'rgba(3,6,12,0.6)',
        backdropFilter:'blur(1.5px)',
        zIndex:40,
      }}/>

      {/* Panel */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          position:'fixed', bottom:0, left:0, right:0,
          zIndex:50,
          background: color.bgPanel,
          borderTop:`1px solid ${color.border}`,
          borderRadius:`${radius.xl}px ${radius.xl}px 0 0`,
          maxHeight:'80vh',
          display:'flex', flexDirection:'column',
          boxShadow: shadow.panel,
          transform:`translateY(${translateY}px)`,
          transition: translateY === 0 ? 'transform 0.2s ease' : 'none',
          animation:'slideUp 0.28s cubic-bezier(0.32,0.72,0,1)',
        }}>

        {/* Sürükle çubuğu */}
        <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 6px', cursor:'grab' }}>
          <div style={{ width:40, height:4, borderRadius:2, background:color.border }}/>
        </div>

        {/* Başlık + kapat */}
        <div style={{
          display:'flex', alignItems:'flex-start', gap:10,
          padding:'4px 16px 12px',
          borderBottom:`1px solid ${color.borderSoft}`,
        }}>
          <div style={{ width:3, minHeight:32, borderRadius:2, background:color_, flexShrink:0, marginTop:2 }}/>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:5, flexWrap:'wrap' }}>
              <span style={{ fontSize:10, color:color.textFaint, fontFamily:font.mono }}>
                {fmtFull(item.published_at, tz)}
              </span>
              {source && (
                <span style={{
                  fontSize:10, padding:'1px 6px', borderRadius:radius.sm,
                  border:`1px solid ${sourceColor(source)}44`,
                  color:sourceColor(source), fontWeight:700,
                }}>{source}</span>
              )}
            </div>
            <p style={{ fontSize:13, fontWeight:700, color:color.text, lineHeight:1.4, margin:0 }}>
              {item.title}
            </p>
          </div>
          <button onClick={handleSaveClick} disabled={saving} title={isSaved ? 'Kaydı kaldır' : 'Kaydet'} style={{
            background:color.bgInset, border:`1px solid ${isSaved ? color.goldDim.slice(0,7)+'66' : color.border}`,
            borderRadius:'50%', width:28, height:28, flexShrink:0,
            color: isSaved ? color.gold : color.textFaint, fontSize:14, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
            opacity: saving ? 0.6 : 1, transition:'color 0.15s, border-color 0.15s',
          }}>{isSaved ? '★' : '☆'}</button>
          <button onClick={onClose} style={{
            background:color.bgInset, border:`1px solid ${color.border}`,
            borderRadius:'50%', width:28, height:28, flexShrink:0,
            color:color.textFaint, fontSize:13, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>✕</button>
        </div>

        {/* İçerik */}
        <div style={{ flex:1, overflowY:'auto', padding:'14px 16px', display:'flex', flexDirection:'column', gap:14 }}>

          {/* AI Özet */}
          <div style={{
            background:color.bgRaised, border:`1px solid ${color.border}`,
            borderRadius:radius.lg, padding:'12px 14px',
          }}>
            <div style={{ fontSize:10, color:color.accent, fontWeight:700, letterSpacing:'0.06em', marginBottom:8 }}>
              ✦ AI ÖZET
            </div>
            {aiLoading
              ? <div style={{ fontSize:12, color:color.textFaint }}>⏳ Analiz ediliyor...</div>
              : aiError
              ? <div style={{ fontSize:12, color:color.textFaint }}>Özet üretilemedi.</div>
              : <p style={{ fontSize:13, color:color.textDim, lineHeight:1.6, margin:0 }}>{aiSummary}</p>
            }
          </div>

          {/* İlgili haberler */}
          {related.length > 0 && (
            <div>
              <div style={{ fontSize:10, color:color.textFaint, fontWeight:700, letterSpacing:'0.06em', marginBottom:8 }}>
                İLGİLİ HABERLER
              </div>
              {related.map((n, i) => (
                <div key={n.id || i} style={{
                  padding:'9px 0',
                  borderBottom: i < related.length-1 ? `1px solid ${color.borderSoft}` : 'none',
                  display:'flex', gap:8, alignItems:'flex-start',
                }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:getDot(n.impact_level), marginTop:5, flexShrink:0 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:10, color:color.textFaint, marginBottom:3 }}>
                      {n.news_sources?.name} · {fmtTime(n.published_at, tz)}
                    </div>
                    <a href={n.url||'#'} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize:12, color:color.textDim, textDecoration:'none', lineHeight:1.4, display:'block' }}>
                      {n.title}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Orijinale git */}
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" style={{
              display:'block', textAlign:'center',
              padding:'12px', borderRadius:radius.lg,
              background:color.bgRaised, border:`1px solid ${color.border}`,
              color:color.accent, fontSize:12, fontWeight:700,
              textDecoration:'none',
            }}>
              Orijinal Habere Git ↗
            </a>
          )}
          <div style={{ height:16 }}/>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform:translateY(100%); }
          to   { transform:translateY(0); }
        }
      `}</style>
    </>
  )
}

/* ════════════════════════════════════════
   TEK HABER SATIRI
════════════════════════════════════════ */
function NewsRow({ item, isNew, dimmed = false, onSelect }) {
  const dotColor = getDot(item.impact_level)
  const source   = item.news_sources?.name || null
  const [tz]     = useState(getTimezone)
  const [hover, setHover] = useState(false)

  return (
    <div
      onClick={() => onSelect(item)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...s.row,
        ...(isNew ? s.rowNew : {}),
        ...(hover ? s.rowHover : {}),
        opacity: dimmed ? 0.55 : 1,
        cursor: 'pointer',
      }}
    >
      <div style={{ ...s.dot, background: dotColor, boxShadow: `0 0 6px ${dotColor}55` }} />
      <div style={s.content}>
        <div style={s.meta}>
          <span style={s.time}>{fmtTime(item.published_at, tz)}</span>
          {source && (
            <span style={{
              ...s.sourceTag,
              color: sourceColor(source),
              borderColor: sourceColor(source) + '44',
            }}>{source}</span>
          )}
          {(item.tickers||[]).map(t => (
            <span key={t} style={s.ticker}>{t}</span>
          ))}
        </div>
        <span style={s.title}>{item.title}</span>
        {item.summary && <p style={s.summary}>{item.summary}</p>}
      </div>
      {/* Detay ok */}
      <div style={{ color: hover ? color.textFaint : color.textGhost, fontSize:14, flexShrink:0, alignSelf:'center', transition:'color 0.15s' }}>›</div>
    </div>
  )
}

/* ════════════════════════════════════════
   DUPLICATE GRUP
════════════════════════════════════════ */
function NewsGroup({ group, isNew, onSelect }) {
  const [expanded, setExpanded] = useState(false)
  const hasOthers = group.others.length > 0

  return (
    <div>
      <div style={{ position:'relative' }}>
        <NewsRow item={group.main} isNew={isNew} onSelect={onSelect} />
        {hasOthers && (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
            style={{
              position:'absolute', bottom:6, right:32,
              display:'flex', alignItems:'center', gap:3,
              background:color.bgInset, border:`1px solid ${color.border}`,
              borderRadius:radius.sm, padding:'2px 7px', cursor:'pointer',
              color:color.textFaint, fontSize:9, fontWeight:700,
            }}
          >
            +{group.others.length} {expanded ? '▲' : '▼'}
          </button>
        )}
      </div>
      {expanded && group.others.map((item, i) => (
        <NewsRow key={item.id || i} item={item} isNew={false} dimmed onSelect={onSelect} />
      ))}
    </div>
  )
}

/* ════════════════════════════════════════
   ANA COMPONENT
════════════════════════════════════════ */
export default function NewsFeed() {
  const [news,        setNews]      = useState([])
  const [filter,      setFilter]    = useState('all')
  const [impactFilter,setImpact]    = useState(new Set(['high','medium','low']))
  const [loading,     setLoading]   = useState(true)
  const [newIds,      setNewIds]    = useState(new Set())
  const [timezone,    setTimezone]  = useState('Europe/Istanbul')
  const [sseStatus,   setSseStatus] = useState('connecting')
  const [selected,    setSelected]  = useState(null)   // detay paneli
  const [user,        setUser]      = useState(null)
  const [query,       setQuery]     = useState('')      // YENİ: haber arama
  const [showSearch,  setShowSearch]= useState(false)    // YENİ: arama kutusu aç/kapa
  const esRef     = useRef(null)
  const filterRef = useRef(filter)
  const retryRef  = useRef(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  function toggleImpact(lvl) {
    setImpact(prev => { const n = new Set(prev); n.has(lvl) ? n.delete(lvl) : n.add(lvl); return n })
  }

  useEffect(() => {
    setTimezone(getTimezone())
    const onStorage = () => setTimezone(getTimezone())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => { filterRef.current = filter }, [filter])
  useEffect(() => { fetchNews(filter) }, [filter])

  /* SSE */
  useEffect(() => {
    function connect() {
      if (esRef.current) esRef.current.close()
      setSseStatus('connecting')
      const es = new EventSource('/api/news/stream')
      esRef.current = es

      es.onopen = () => {
        setSseStatus('connected')
        if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null }
      }
      es.onmessage = (e) => {
        if (es.readyState === 1) setSseStatus('connected')
        if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null }
        try {
          const item = JSON.parse(e.data)
          if (filterRef.current !== 'all' && !item.asset_types?.includes(filterRef.current)) return
          setNews(prev => [item, ...prev.slice(0, 99)])
          setNewIds(prev => new Set([...prev, item.id]))
          setTimeout(() => setNewIds(prev => { const n=new Set(prev); n.delete(item.id); return n }), 3000)
        } catch {}
      }
      es.onerror = () => {
        setSseStatus('disconnected')
        es.close()
        retryRef.current = setTimeout(connect, 5000)
      }
      setTimeout(() => { if (es.readyState === 1) setSseStatus('connected') }, 4000)
    }
    connect()
    return () => {
      if (esRef.current) esRef.current.close()
      if (retryRef.current) clearTimeout(retryRef.current)
    }
  }, [])

  async function fetchNews(asset) {
    setLoading(true)
    try {
      const params = asset !== 'all' ? `?asset=${asset}` : ''
      const res  = await fetch(`/api/news${params}`)
      const json = await res.json()
      setNews(json.data || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const grouped = useMemo(() => {
    let filtered = news.filter(item => impactFilter.has(item.impact_level || 'low'))
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      filtered = filtered.filter(item =>
        (item.title || '').toLowerCase().includes(q) ||
        (item.tickers || []).some(t => t.toLowerCase().includes(q)) ||
        (item.news_sources?.name || '').toLowerCase().includes(q)
      )
    }
    return groupDuplicates(filtered)
  }, [news, impactFilter, query])

  return (
    <div style={s.container}>
      {/* Satır 1: asset filtreler + arama + SSE dot */}
      <div style={s.filterRow}>
        {ASSET_FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ ...s.filterBtn, ...(filter === f ? s.filterBtnActive : {}) }}>
            {f.toUpperCase()}
          </button>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
          <button
            onClick={() => setShowSearch(v => !v)}
            title="Ara"
            style={{ ...s.searchToggle, ...(showSearch ? s.searchToggleActive : {}) }}
          >⌕</button>
          <span title={sseStatus} style={{
            width:7, height:7, borderRadius:'50%', display:'inline-block',
            background: sseStatus==='connected' ? color.success : sseStatus==='connecting' ? color.warning : color.danger,
            boxShadow: sseStatus==='connected' ? `0 0 6px ${color.success}66` : 'none',
          }}/>
        </div>
      </div>

      {/* YENİ: arama kutusu — sadece açıldığında görünür, sadeliği korur */}
      {showSearch && (
        <div style={{ padding:'0 12px 8px' }}>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Başlık, ticker veya kaynak ara…"
            style={s.searchInput}
          />
        </div>
      )}

      {/* Satır 2: impact filtresi */}
      <div style={s.impactRow}>
        <span style={{fontSize:9,color:color.textFaint,fontWeight:700,letterSpacing:'0.06em',marginRight:4}}>IMPACT</span>
        {[
          { key:'high', color:color.impact.high, label:'HIGH' },
          { key:'medium', color:color.impact.medium, label:'MED' },
          { key:'low', color:color.impact.low, label:'LOW' },
        ].map(({ key, color: c, label }) => {
          const on = impactFilter.has(key)
          return (
            <button key={key} onClick={() => toggleImpact(key)} style={{
              display:'flex', alignItems:'center', gap:4,
              padding:'3px 9px', borderRadius:radius.sm, cursor:'pointer',
              border:`1px solid ${on ? c+'88' : color.border}`,
              background: on ? c+'18' : 'transparent',
              color: on ? c : color.textFaint,
              fontSize:10, fontWeight:700, letterSpacing:'0.04em',
              transition:'all 0.15s',
            }}>
              <span style={{width:6,height:6,borderRadius:'50%',background:on?c:color.textFaint,flexShrink:0}}/>
              {label}
            </button>
          )
        })}
      </div>

      {/* Liste */}
      <div style={s.list}>
        {loading && <div style={s.center}>Yükleniyor...</div>}
        {!loading && grouped.length === 0 && (
          <div style={s.center}>
            {query.trim() ? 'Aramanla eşleşen haber yok.' : 'Haber bulunamadı'}
          </div>
        )}
        {!loading && grouped.map((group, i) => (
          <NewsGroup
            key={group.main.id || i}
            group={group}
            isNew={newIds.has(group.main.id)}
            onSelect={setSelected}
          />
        ))}
      </div>

      {/* Detay paneli */}
      {selected && (
        <DetailPanel
          item={selected}
          allNews={news}
          tz={timezone}
          user={user}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

const s = {
  container:       { display:'flex', flexDirection:'column', height:'100%', position:'relative' },
  filterRow:       { display:'flex', gap:6, padding:'9px 12px 7px', borderBottom:`1px solid ${color.borderSoft}`, flexWrap:'wrap', alignItems:'center' },
  impactRow:       { display:'flex', gap:6, padding:'6px 12px 8px', borderBottom:`1px solid ${color.border}`, alignItems:'center', flexWrap:'wrap' },
  filterBtn:       { padding:'4px 10px', borderRadius:radius.sm, border:`1px solid ${color.borderStrong}`, background:'transparent', color:color.textDim, fontSize:10, fontWeight:600, cursor:'pointer', letterSpacing:'0.05em', transition:'all 0.15s' },
  filterBtnActive: { background:color.accent, borderColor:color.accent, color:'#fff' },
  searchToggle:    { background:'transparent', border:`1px solid ${color.borderStrong}`, borderRadius:radius.sm, color:color.textDim, fontSize:13, width:24, height:24, cursor:'pointer', lineHeight:1, transition:'all 0.15s' },
  searchToggleActive: { color:color.accent, borderColor:color.accent },
  searchInput:     { width:'100%', boxSizing:'border-box', padding:'7px 11px', borderRadius:radius.md, background:color.bgInset, border:`1px solid ${color.border}`, color:color.text, fontSize:12, fontFamily:font.mono, outline:'none' },
  list:            { flex:1, overflowY:'auto' },
  center:          { padding:32, textAlign:'center', color:color.textDim, fontSize:13 },
  row:             { display:'flex', gap:10, padding:'11px 14px', borderBottom:`1px solid ${color.borderSoft}`, alignItems:'flex-start', transition:'background 0.15s' },
  rowNew:          { background: color.accentSoft },
  rowHover:        { background: 'rgba(255,255,255,0.02)' },
  dot:             { width:8, height:8, borderRadius:'50%', marginTop:5, flexShrink:0 },
  content:         { flex:1, minWidth:0 },
  meta:            { display:'flex', alignItems:'center', gap:5, marginBottom:3, flexWrap:'wrap' },
  time:            { fontSize:11, color:color.textFaint, fontFamily:'monospace' },
  sourceTag:       { fontSize:10, padding:'1px 6px', borderRadius:radius.sm, border:'1px solid', fontWeight:700, letterSpacing:'0.03em', whiteSpace:'nowrap' },
  ticker:          { fontSize:10, padding:'1px 5px', borderRadius:radius.sm, background:color.bgInset, color:color.accent, fontFamily:'monospace', fontWeight:600 },
  title:           { display:'block', fontSize:13, color:color.text, lineHeight:1.45, fontWeight:500 },
  summary:         { fontSize:11, color:color.textDim, marginTop:4, lineHeight:1.5, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' },
}
