export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const encoder = new TextEncoder()

  // Supabase instance'ı ReadableStream scope'unda oluştur —
  // hem start() hem cancel() aynı instance'ı kullanmalı.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  let closed    = false
  let channel   = null
  let keepAlive = null

  const stream = new ReadableStream({
    start(controller) {
      channel = supabase
        .channel('news-stream')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'news_items' },
          (payload) => {
            if (closed) return
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(payload.new)}\n\n`)
              )
            } catch {
              closed = true
            }
          }
        )
        .subscribe()

      keepAlive = setInterval(() => {
        if (closed) {
          clearInterval(keepAlive)
          return
        }
        try {
          controller.enqueue(encoder.encode(': ping\n\n'))
        } catch {
          closed = true
          clearInterval(keepAlive)
          // Aynı supabase instance'ını kullan
          if (channel) supabase.removeChannel(channel)
        }
      }, 30000)
    },

    cancel() {
      closed = true
      if (keepAlive) clearInterval(keepAlive)
      // Aynı supabase instance'ından channel'ı kaldır — artık doğru çalışır
      if (channel) supabase.removeChannel(channel)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
