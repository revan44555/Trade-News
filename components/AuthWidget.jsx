'use client'
// components/AuthWidget.jsx
//
// Sağ üstte küçük bir kullanıcı rozeti: giriş yapılmamışsa "Giriş yap"
// linki, yapılmışsa Google profil fotoğrafı + çıkış butonu gösterir.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { color, font, radius, shadow } from '@/lib/theme'

export default function AuthWidget() {
  const [user, setUser]       = useState(undefined) // undefined = henüz yüklenmedi
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  if (user === undefined) return null // yükleniyor, flash önle
  if (user === null) {
    return (
      <Link href="/login" style={s.loginLink}>
        Giriş yap
      </Link>
    )
  }

  const avatarUrl = user.user_metadata?.avatar_url
  const name       = user.user_metadata?.full_name || user.email

  return (
    <div style={s.wrap}>
      <button onClick={() => setMenuOpen(v => !v)} style={s.avatarBtn} title={name}>
        {avatarUrl
          ? <img src={avatarUrl} alt="" style={s.avatarImg} referrerPolicy="no-referrer" />
          : <span style={s.avatarFallback}>{(name || '?')[0].toUpperCase()}</span>}
      </button>

      {menuOpen && (
        <>
          <div style={s.backdrop} onClick={() => setMenuOpen(false)} />
          <div style={s.menu}>
            <div style={s.menuName}>{name}</div>
            <form action="/auth/signout" method="post">
              <button type="submit" style={s.signOutBtn}>Çıkış yap</button>
            </form>
          </div>
        </>
      )}
    </div>
  )
}

const s = {
  wrap: { position:'relative' },
  loginLink: {
    fontSize:10.5, color:color.accent, textDecoration:'none', fontWeight:700,
    letterSpacing:'0.04em', padding:'4px 8px', border:`1px solid ${color.accentDim}`, borderRadius:radius.md,
  },
  avatarBtn: {
    width:26, height:26, borderRadius:'50%', border:`1px solid ${color.border}`,
    background:color.bgInset, cursor:'pointer', padding:0, overflow:'hidden',
    display:'flex', alignItems:'center', justifyContent:'center',
    transition:'border-color 0.15s',
  },
  avatarImg: { width:'100%', height:'100%', objectFit:'cover' },
  avatarFallback: { fontSize:11, fontWeight:700, color:color.accent },
  backdrop: { position:'fixed', inset:0, zIndex:40 },
  menu: {
    position:'absolute', top:32, right:0, zIndex:50, minWidth:160,
    background:color.bgPanel, border:`1px solid ${color.border}`, borderRadius:radius.lg,
    padding:10, boxShadow:shadow.card,
  },
  menuName: { fontSize:11, color:color.textDim, padding:'2px 4px 8px', wordBreak:'break-word' },
  signOutBtn: {
    width:'100%', background:'none', border:`1px solid ${color.border}`, borderRadius:radius.md,
    color:color.danger, fontSize:11, fontWeight:600, padding:'6px 8px', cursor:'pointer',
  },
}
