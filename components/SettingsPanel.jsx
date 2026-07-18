'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// GÜNCELLE: kendi bot kullanıcı adınızı buraya yazın (t.me/<bu> şeklinde
// açılacak). Bu, "1 tık, kur" deneyimi için gerekli — botunuz zaten
// çalışıyor, sadece ziyaretçiyi ona yönlendiriyoruz.
const SITE_BOT_USERNAME = 'MarketWireBot' // TODO: kendi bot kullanıcı adınla değiştir

const TIMEZONES = [
  { label: 'Istanbul',     value: 'Europe/Istanbul' },
  { label: 'UTC',          value: 'UTC' },
  { label: 'London',       value: 'Europe/London' },
  { label: 'New York',     value: 'America/New_York' },
  { label: 'Chicago',      value: 'America/Chicago' },
  { label: 'Los Angeles',  value: 'America/Los_Angeles' },
  { label: 'Dubai',        value: 'Asia/Dubai' },
  { label: 'Singapore',    value: 'Asia/Singapore' },
  { label: 'Tokyo',        value: 'Asia/Tokyo' },
  { label: 'Sydney',       value: 'Australia/Sydney' },
  { label: 'Hong Kong',    value: 'Asia/Hong_Kong' },
  { label: 'Frankfurt',    value: 'Europe/Berlin' },
  { label: 'Zürich',       value: 'Europe/Zurich' },
]

const AI_LANGS = [
  { label: '🇹🇷 Türkçe',    value: 'Turkish' },
  { label: '🇬🇧 English',   value: 'English' },
  { label: '🇩🇪 Deutsch',   value: 'German' },
  { label: '🇫🇷 Français',  value: 'French' },
  { label: '🇪🇸 Español',   value: 'Spanish' },
  { label: '🇸🇦 العربية',   value: 'Arabic' },
  { label: '🇯🇵 日本語',    value: 'Japanese' },
  { label: '🇨🇳 中文',      value: 'Chinese' },
]

const PREFS_KEY = 'mw_calendar_prefs'

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') } catch { return {} }
}
function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...p })) } catch {}
}

export default function SettingsPanel({ onClose }) {
  const [tz,       setTz]       = useState('Europe/Istanbul')
  const [aiLang,   setAiLang]   = useState('Turkish')
  const [saved,    setSaved]    = useState(false)

  useEffect(() => {
    const p = loadPrefs()
    if (p.timezone) setTz(p.timezone)
    if (p.aiLang)   setAiLang(p.aiLang)
  }, [])

  function apply() {
    savePrefs({ timezone: tz, aiLang })
    window.dispatchEvent(new Event('storage'))
    setSaved(true)
    setTimeout(() => { setSaved(false); onClose() }, 800)
  }

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,0.6)',
        zIndex:40, backdropFilter:'blur(2px)',
      }}/>

      {/* Panel */}
      <div style={{
        position:'fixed', bottom:0, left:0, right:0,
        zIndex:50,
        background:'#0f1526',
        borderTop:'1px solid #1c2438',
        borderRadius:'14px 14px 0 0',
        padding:'0 0 32px',
        boxShadow:'0 -8px 40px rgba(0,0,0,0.8)',
        animation:'slideUp 0.25s cubic-bezier(0.32,0.72,0,1)',
      }}>
        {/* Handle */}
        <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 4px' }}>
          <div style={{ width:36, height:4, borderRadius:2, background:'#1c2438' }}/>
        </div>

        {/* Başlık */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'8px 18px 14px',
          borderBottom:'1px solid #151b2c',
        }}>
          <span style={{ fontSize:13, fontWeight:700, color:'#e6edf5', letterSpacing:'0.04em' }}>
            ⚙️ Ayarlar
          </span>
          <button onClick={onClose} style={{
            background:'#151b2c', border:'1px solid #1c2438',
            borderRadius:'50%', width:28, height:28,
            color:'#4a5468', fontSize:14, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>✕</button>
        </div>

        <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:20 }}>

          {/* Timezone */}
          <div>
            <div style={label}>🕐 Saat Dilimi</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:8 }}>
              {TIMEZONES.map(t => (
                <button key={t.value} onClick={() => setTz(t.value)} style={{
                  padding:'5px 12px', borderRadius:5, cursor:'pointer',
                  fontSize:11, fontWeight:600,
                  border:`1px solid ${tz === t.value ? '#22b8f0' : '#1c2438'}`,
                  background: tz === t.value ? '#22b8f018' : 'transparent',
                  color: tz === t.value ? '#22b8f0' : '#4a5468',
                  transition:'all 0.15s',
                }}>{t.label}</button>
              ))}
            </div>
          </div>

          {/* AI Özet Dili */}
          <div>
            <div style={label}>✦ AI Özet Dili</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:8 }}>
              {AI_LANGS.map(l => (
                <button key={l.value} onClick={() => setAiLang(l.value)} style={{
                  padding:'5px 12px', borderRadius:5, cursor:'pointer',
                  fontSize:11, fontWeight:600,
                  border:`1px solid ${aiLang === l.value ? '#c084fc' : '#1c2438'}`,
                  background: aiLang === l.value ? '#c084fc18' : 'transparent',
                  color: aiLang === l.value ? '#c084fc' : '#4a5468',
                  transition:'all 0.15s',
                }}>{l.label}</button>
              ))}
            </div>
          </div>

          {/* Telegram Bot */}
          <TelegramSection />

          {/* Kaydet */}
          <button onClick={apply} style={{
            padding:'13px', borderRadius:8, border:'none', cursor:'pointer',
            background: saved ? '#22c55e' : '#22b8f0',
            color:'#fff', fontSize:13, fontWeight:700,
            letterSpacing:'0.04em', transition:'background 0.2s',
          }}>
            {saved ? '✓ Kaydedildi' : 'Kaydet'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform:translateY(100%); opacity:0; }
          to   { transform:translateY(0);    opacity:1; }
        }
      `}</style>
    </>
  )
}

const label = {
  fontSize:10, fontWeight:700, color:'#4a5468',
  letterSpacing:'0.08em', textTransform:'uppercase',
}

/* ════════════════════════════════════════
   TELEGRAM BÖLÜMÜ
   1) Değer önerisi + "bizim botumuza katıl" (1 tık, giriş gerektirmez)
   2) "Kendi botunu bağla" (Google girişi gerekir, token formu)
   3) Katlanmış: kendi bot token'ını nasıl alırsın (BotFather rehberi)
════════════════════════════════════════ */
function TelegramSection() {
  const [mode, setMode] = useState('intro') // 'intro' | 'own-bot' | 'how-to-get-token'

  return (
    <div>
      <div style={label}>📢 Telegram Bildirimleri</div>

      <div style={{
        marginTop:8, padding:'14px 12px', borderRadius:8,
        background:'#0d1220', border:'1px solid #1c2438',
      }}>
        {/* Değer önerisi — her zaman görünür */}
        <div style={{ fontSize:11.5, color:'#8b96ab', lineHeight:1.7, marginBottom:12 }}>
          Yüksek etkili haberler ve ekonomik takvim olayları çıktığı anda
          telefonuna Telegram bildirimi olarak düşsün — siteyi açık tutmana
          gerek kalmaz. İstediğin etki seviyesini (yüksek/orta/düşük) ve anlık
          ya da günlük özet modunu bot içinden seçebilirsin.
        </div>

        {mode === 'intro' && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <a
              href={`https://t.me/${SITE_BOT_USERNAME}?start=1`}
              target="_blank" rel="noopener noreferrer"
              style={{
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                padding:'11px', borderRadius:7, textDecoration:'none',
                background:'#22b8f0', color:'#fff', fontSize:12.5, fontWeight:700,
              }}>
              💬 Botumuza Katıl — @{SITE_BOT_USERNAME}
            </a>
            <div style={{ fontSize:10, color:'#4a5468', textAlign:'center' }}>
              1 tık, hesap gerekmez. Telegram açılır, /start yazman yeterli.
            </div>

            <button
              onClick={() => setMode('own-bot')}
              style={{
                marginTop:6, padding:'9px', borderRadius:7, cursor:'pointer',
                border:'1px solid #1c2438', background:'transparent',
                color:'#8b96ab', fontSize:11.5, fontWeight:600,
              }}>
              🤖 Kendi botumu bağlamak istiyorum →
            </button>
          </div>
        )}

        {mode === 'own-bot' && <OwnBotPanel onShowHowTo={() => setMode('how-to-get-token')} onBack={() => setMode('intro')} />}
        {mode === 'how-to-get-token' && <TelegramGuide onBack={() => setMode('own-bot')} />}
      </div>
    </div>
  )
}

/* ── "Kendi botunu bağla" paneli: giriş kontrolü + token formu + durum ── */
function OwnBotPanel({ onShowHowTo, onBack }) {
  const [user,    setUser]    = useState(undefined) // undefined: yükleniyor, null: girişsiz
  const [bot,     setBot]     = useState(undefined) // undefined: yükleniyor, null: bot yok
  const [token,   setToken]   = useState('')
  const [busy,    setBusy]    = useState(false)
  const [errMsg,  setErrMsg]  = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data?.user || null))
  }, [])

  useEffect(() => {
    if (user === undefined) return
    if (!user) { setBot(null); return }
    fetch('/api/user-bot')
      .then(r => r.json())
      .then(j => setBot(j.data || null))
      .catch(() => setBot(null))
  }, [user])

  async function submitToken(e) {
    e.preventDefault()
    if (!token.trim()) return
    setBusy(true); setErrMsg('')
    try {
      const res = await fetch('/api/user-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        setErrMsg(json.message || json.error || 'Bir şeyler ters gitti.')
        return
      }
      setToken('')
      setBot(json.data)
    } catch (err) {
      setErrMsg('Bağlantı hatası, tekrar dene.')
    } finally {
      setBusy(false)
    }
  }

  async function removeBot() {
    setBusy(true)
    try {
      await fetch('/api/user-bot', { method: 'DELETE' })
      setBot(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <button onClick={onBack} style={backBtnStyle}>← Geri</button>

      {user === undefined && (
        <div style={{ fontSize:11, color:'#4a5468' }}>Yükleniyor…</div>
      )}

      {user === null && (
        <div style={{ fontSize:11.5, color:'#8b96ab', lineHeight:1.7 }}>
          Kendi botunu bağlamak için önce Google ile giriş yapman gerekiyor.
          Bu, token&apos;ının senin hesabına bağlı kalmasını ve başka birinin
          onu kullanamamasını sağlar. Sağ üstteki giriş butonunu kullanabilirsin.
        </div>
      )}

      {user && bot === undefined && (
        <div style={{ fontSize:11, color:'#4a5468' }}>Bot durumu kontrol ediliyor…</div>
      )}

      {user && bot === null && (
        <>
          <div style={{ fontSize:11.5, color:'#8b96ab', lineHeight:1.7 }}>
            @BotFather&apos;dan aldığın bot token&apos;ını aşağıya yapıştır.
            Token&apos;ı doğrulayıp şifreli olarak kaydedeceğiz — token&apos;ın
            kendisini bir daha ekranda göstermeyeceğiz.
          </div>
          <form onSubmit={submitToken} style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <input
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              style={{
                padding:'10px 11px', borderRadius:6, fontSize:11.5,
                background:'#141b2e', border:'1px solid #1c2438',
                color:'#e6edf5', fontFamily:'monospace',
              }}
            />
            {errMsg && <div style={{ fontSize:10.5, color:'#f0555a' }}>{errMsg}</div>}
            <button type="submit" disabled={busy || !token.trim()} style={{
              padding:'10px', borderRadius:6, border:'none', cursor: busy ? 'default' : 'pointer',
              background: busy ? '#1c2438' : '#22b8f0', color:'#fff',
              fontSize:12, fontWeight:700, opacity: !token.trim() ? 0.5 : 1,
            }}>
              {busy ? 'Doğrulanıyor…' : 'Botu Bağla'}
            </button>
          </form>
          <button onClick={onShowHowTo} style={{
            background:'none', border:'none', color:'#22b8f0', fontSize:10.5,
            cursor:'pointer', textAlign:'left', padding:0, textDecoration:'underline',
          }}>
            Bot token&apos;ımı nereden alırım?
          </button>
        </>
      )}

      {user && bot && (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{
            display:'flex', alignItems:'center', gap:7,
            padding:'9px 10px', borderRadius:6,
            background: bot.status === 'active' ? '#22c55e18' : '#f0555a18',
            border:`1px solid ${bot.status === 'active' ? '#22c55e' : '#f0555a'}`,
          }}>
            <span style={{
              width:6, height:6, borderRadius:'50%', flexShrink:0,
              background: bot.status === 'active' ? '#22c55e' : '#f0555a',
            }}/>
            <span style={{ fontSize:11.5, color:'#e6edf5', fontWeight:600, flex:1 }}>
              @{bot.bot_username}
            </span>
            <span style={{ fontSize:10, color: bot.status === 'active' ? '#22c55e' : '#f0555a' }}>
              {bot.status === 'active' ? 'Aktif' : bot.status === 'pending' ? 'Bekliyor' : 'Sorunlu'}
            </span>
          </div>

          {bot.last_error && (
            <div style={{ fontSize:10.5, color:'#f0555a' }}>{bot.last_error}</div>
          )}

          {!bot.has_chat && bot.status === 'active' && (
            <a
              href={`https://t.me/${bot.bot_username}?start=1`}
              target="_blank" rel="noopener noreferrer"
              style={{
                display:'block', textAlign:'center', padding:'9px', borderRadius:6,
                background:'#22b8f0', color:'#fff', fontSize:11.5, fontWeight:700,
                textDecoration:'none',
              }}>
              Son adım: botuna git ve /start yaz →
            </a>
          )}

          <button onClick={removeBot} disabled={busy} style={{
            padding:'9px', borderRadius:6, cursor: busy ? 'default' : 'pointer',
            border:'1px solid #f0555a50', background:'transparent',
            color:'#f0555a', fontSize:11, fontWeight:600,
          }}>
            {busy ? 'Kaldırılıyor…' : 'Botu Kaldır'}
          </button>
        </div>
      )}
    </div>
  )
}

const backBtnStyle = {
  alignSelf:'flex-start', background:'none', border:'none',
  color:'#4a5468', fontSize:11, cursor:'pointer', padding:0,
}
function Step({ n, title, children }) {
  return (
    <div style={{ display:'flex', gap:10 }}>
      <div style={{
        width:20, height:20, borderRadius:'50%', flexShrink:0,
        background:'#22b8f018', border:'1px solid #22b8f0',
        color:'#22b8f0', fontSize:10, fontWeight:800,
        display:'flex', alignItems:'center', justifyContent:'center',
        marginTop:1,
      }}>{n}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, fontWeight:700, color:'#e6edf5', marginBottom:3 }}>{title}</div>
        <div style={{ fontSize:11.5, color:'#8b96ab', lineHeight:1.6 }}>{children}</div>
      </div>
    </div>
  )
}

function Code({ children }) {
  return (
    <code style={{
      background:'#141b2e', border:'1px solid #1c2438', borderRadius:4,
      padding:'1px 6px', fontSize:11, color:'#22b8f0', fontFamily:'monospace',
    }}>{children}</code>
  )
}

function TelegramGuide({ onBack }) {
  return (
    <div style={{
      marginTop:8, padding:'14px 12px', borderRadius:8,
      background:'#0d1220', border:'1px solid #1c2438',
      display:'flex', flexDirection:'column', gap:14,
    }}>
      {onBack && <button onClick={onBack} style={backBtnStyle}>← Geri</button>}

      <div style={{ fontSize:11, color:'#4a5468', lineHeight:1.6 }}>
        Kendi Telegram botunu oluşturmak tamamen ücretsizdir ve 2 dakika sürer.
        Token&apos;ı aldıktan sonra geri gelip yukarıdaki kutuya yapıştırman
        yeterli — webhook bağlantısı, veritabanı, her şeyi site senin için
        otomatik kurar.
      </div>

      <Step n="1" title="BotFather ile bot oluştur">
        Telegram&apos;da <Code>@BotFather</Code> hesabını bul ve <Code>/newbot</Code> komutunu
        gönder. Bot için bir isim ve kullanıcı adı (sonu <Code>_bot</Code> ile bitmeli)
        iste. İşlem bitince sana bir <b>Bot Token</b> verecek — bu şuna benzer:
        <br/><Code>123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxx</Code>
      </Step>

      <Step n="2" title="Token'ı buraya yapıştır">
        Geri dön, token&apos;ı yapıştır ve <b>&quot;Botu Bağla&quot;</b>ya bas.
        Site token&apos;ın gerçekten çalıştığını doğrular, şifreleyerek
        kaydeder ve botunu otomatik olarak aktif eder — sonrasında botuna
        gidip <Code>/start</Code> yazman yeterli.
      </Step>

      <div style={{
        fontSize:10.5, color:'#4a5468', paddingTop:8,
        borderTop:'1px solid #1c2438', lineHeight:1.6,
      }}>
        🔒 Token&apos;ın şifrelenerek saklanır ve sadece senin Google hesabına
        bağlıdır — bir daha ekranda gösterilmez, başka hiçbir hesap onu
        kullanamaz.
      </div>
    </div>
  )
}
