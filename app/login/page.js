'use client'
// app/login/page.js
//
// Google ile giriş sayfası. Supabase Auth'un Google OAuth provider'ını
// kullanır — şifre, kendi kullanıcı tablomuz veya elle session yönetimi
// yok; Supabase bunların hepsini halleder.

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { color, font, radius, shadow } from '@/lib/theme'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  async function signInWithGoogle() {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // BUG FIX: /saved diye bağımsız bir sayfa (route) hiç yok —
        // "Kaydedilenler" ana sayfadaki (app/page.js) bir sekme (tab),
        // sadece localStorage ile hatırlanıyor. Eskiden buraya
        // yönlendirilince Next.js "sayfa yok" (404) hatası veriyordu.
        // Artık ana sayfaya, hangi sekmenin açılacağını belirten bir
        // query param ile dönülüyor; app/page.js bunu okuyup SAVED
        // sekmesini otomatik açıyor (bkz. o dosyadaki ilgili useEffect).
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/?tab=saved')}`,
        // Google'ın her seferinde hesap seçim ekranını göstermesini sağlar
        // — kullanıcı yanlış Google hesabına takılı kalmasın diye.
        queryParams: { prompt: 'select_account' },
      },
    })

    if (signInError) {
      setError('Giriş başlatılamadı. Lütfen tekrar deneyin.')
      setLoading(false)
    }
    // Başarılıysa tarayıcı Google'a yönlendirilir, buradaki state
    // önemsizleşir.
  }

  return (
    <div style={s.root}>
      <div style={s.card}>
        <div style={s.logoMark}>MW</div>
        <h1 style={s.title}>Market Wire</h1>
        <p style={s.subtitle}>
          Kaydettiğin haberleri cihazlar arasında senkronlamak için
          Google ile giriş yap.
        </p>

        <button
          onClick={signInWithGoogle}
          disabled={loading}
          style={{ ...s.googleBtn, ...(loading ? s.googleBtnDisabled : {}) }}
        >
          <GoogleIcon />
          {loading ? 'Yönlendiriliyor…' : 'Google ile giriş yap'}
        </button>

        {error && <div style={s.error}>{error}</div>}

        <Link href="/" style={s.skip}>Giriş yapmadan devam et →</Link>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.08-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33C2.44 15.98 5.48 18 9 18z"/>
      <path fill="#FBBC05" d="M3.97 10.72c-.18-.54-.28-1.11-.28-1.72s.1-1.18.28-1.72V4.95H.96A8.996 8.996 0 000 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
    </svg>
  )
}

const s = {
  root:  { minHeight:'100vh', background:color.bg, color:color.text, fontFamily:font.mono, display:'flex', alignItems:'center', justifyContent:'center', padding:20 },
  card:  { width:'100%', maxWidth:360, background:color.bgPanel, border:`1px solid ${color.border}`, borderRadius:radius.xl, padding:'36px 28px', textAlign:'center', boxShadow:shadow.card },
  logoMark: {
    width:52, height:52, margin:'0 auto 18px', borderRadius:radius.lg,
    background:color.accentSoft, border:`1px solid ${color.accentDim}`,
    display:'flex', alignItems:'center', justifyContent:'center',
    fontSize:16, fontWeight:800, letterSpacing:'0.02em', color:color.accent,
  },
  title: { fontSize:18, fontWeight:700, letterSpacing:'0.02em', margin:'0 0 8px' },
  subtitle: { fontSize:12.5, color:color.textDim, lineHeight:1.5, margin:'0 0 24px' },
  googleBtn: {
    width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:10,
    background:'#fff', color:'#1f2937', border:'none', borderRadius:radius.md,
    padding:'11px 16px', fontSize:13, fontWeight:600, fontFamily:'inherit',
    cursor:'pointer', transition:'opacity 0.15s',
  },
  googleBtnDisabled: { opacity:0.6, cursor:'default' },
  error: { marginTop:14, fontSize:11.5, color:color.danger },
  skip:  { display:'inline-block', marginTop:20, fontSize:11, color:color.textFaint, textDecoration:'none' },
}
