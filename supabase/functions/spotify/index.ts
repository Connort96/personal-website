import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID')
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET')
const SPOTIFY_REFRESH_TOKEN = Deno.env.get('SPOTIFY_REFRESH_TOKEN')

const TOKEN_ENDPOINT = `https://accounts.spotify.com/api/token`
const NOW_PLAYING_ENDPOINT = `https://api.spotify.com/v1/me/player/currently-playing`
const RECENTLY_PLAYED_ENDPOINT = `https://api.spotify.com/v1/me/player/recently-played?limit=1`
const TOP_ARTISTS_ENDPOINT = `https://api.spotify.com/v1/me/top/artists?limit=10&time_range=short_term`

const getAccessToken = async () => {
  const basic = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: SPOTIFY_REFRESH_TOKEN!,
    }),
  })

  return response.json()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const type = url.searchParams.get('type')

  try {
    const { access_token } = await getAccessToken()

    // If ID and TYPE are provided, it's a metadata request for Admin
    if (id && type) {
      const endpoint = `https://api.spotify.com/v1/${type}s/${id}`
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${access_token}` },
      })
      const item = await res.json()

      if (item.error) throw new Error(item.error.message)

      return new Response(
        JSON.stringify({
          title: item.name,
          artist: type === 'album' ? item.artists?.[0]?.name : item.owner?.display_name,
          cover_url: item.images?.[0]?.url,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Default: fetch user stats for public pages
    const nowPlaying = await fetch(NOW_PLAYING_ENDPOINT, {
      headers: { Authorization: `Bearer ${access_token}` },
    })

    let current = null
    if (nowPlaying.status === 200) {
      current = await nowPlaying.json()
    }

    const recentlyPlayed = await fetch(RECENTLY_PLAYED_ENDPOINT, {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    const recent = await recentlyPlayed.json()

    const topArtists = await fetch(TOP_ARTISTS_ENDPOINT, {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    const top = await topArtists.json()

    return new Response(
      JSON.stringify({
        currently_playing: current,
        recently_played: recent,
        top_artists: top,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
