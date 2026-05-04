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
const RECENTLY_PLAYED_ENDPOINT = `https://api.spotify.com/v1/me/player/recently-played?limit=10`
const TOP_ARTISTS_ENDPOINT = `https://api.spotify.com/v1/me/top/artists?limit=10&time_range=short_term`
const PLAYLISTS_ENDPOINT = `https://api.spotify.com/v1/me/playlists?limit=4`

const getAccessToken = async () => {
  console.log("Refreshing Spotify access token...")
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
    }).toString(),
  })

  const data = await response.json()
  if (data.error) {
    console.error("Token refresh error:", data.error)
    throw new Error(`Spotify Token Error: ${data.error_description || data.error}`)
  }
  return data
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

    // Metadata lookup for Admin
    if (id && type) {
      console.log(`Fetching metadata for ${type}: ${id}`)
      const endpoint = `https://api.spotify.com/v1/${type}s/${id}`
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${access_token}` },
      })
      const item = await res.json()
      
      if (item.error) {
        console.error("Spotify API error:", item.error)
        throw new Error(item.error.message)
      }

      return new Response(
        JSON.stringify({
          title: item.name,
          artist: type === 'album' ? item.artists?.[0]?.name : item.owner?.display_name,
          cover_url: item.images?.[0]?.url,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Default: fetch expanded user stats
    const fetchSpotify = (endpoint) => fetch(endpoint, {
      headers: { Authorization: `Bearer ${access_token}` }
    }).then(r => r.status === 200 ? r.json() : null);

    const [nowPlaying, recentlyPlayed, topArtists, playlists] = await Promise.all([
      fetchSpotify(NOW_PLAYING_ENDPOINT),
      fetchSpotify(RECENTLY_PLAYED_ENDPOINT),
      fetchSpotify(TOP_ARTISTS_ENDPOINT),
      fetchSpotify(PLAYLISTS_ENDPOINT)
    ]);

    // Calculate top genres from top artists
    const genreCounts = {};
    topArtists?.items?.forEach(artist => {
      artist.genres?.forEach(genre => {
        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
      });
    });
    const topGenres = Object.entries(genreCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([name]) => name);

    return new Response(
      JSON.stringify({
        currently_playing: nowPlaying,
        recently_played: recentlyPlayed,
        top_artists: topArtists,
        playlists: playlists,
        top_genres: topGenres
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error("Edge Function Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
