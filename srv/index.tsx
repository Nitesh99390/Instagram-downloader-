import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

// Enable CORS for the API
app.use('/api/*', cors())

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const IG_APP_ID = '936619743392459' // public web App ID used by instagram.com

type MediaUrl = { url: string; type: string; ext: string; quality?: string }
type Resolved = { title: string; pictureUrl: string | null; urls: MediaUrl[] }

/* ── Helpers ── */
function decodeUrl(s: string): string {
  return s.replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/&amp;/g, '&')
}
function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

// Extract the shortcode from any instagram URL (reel / p / tv)
function getShortcode(rawUrl: string): string | null {
  const m = rawUrl.match(/instagram\.com\/(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/)
  return m ? m[1] : null
}

function dedupePush(arr: MediaUrl[], seen: Set<string>, item: MediaUrl) {
  if (item.url && !seen.has(item.url)) {
    seen.add(item.url)
    arr.push(item)
  }
}

/* ── Strategy 1: Instagram GraphQL API (App-ID, no login, public content) ── */
async function tryGraphQL(shortcode: string): Promise<Resolved | null> {
  const variables = encodeURIComponent(
    JSON.stringify({ shortcode, fetch_comment_count: 0, fetch_related_profile_media_count: 0, parent_comment_count: 0, child_comment_count: 0, fetch_like_count: 0, fetch_tagged_user_count: 0, fetch_preview_comment_count: 0, has_threaded_comments: false, hoisted_comment_id: null, hoisted_reply_id: null })
  )
  const endpoint = `https://www.instagram.com/api/graphql`
  const body = `variables=${variables}&doc_id=10015901848480474`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-IG-App-ID': IG_APP_ID,
      'X-FB-LSD': 'AVqbxe3J_YA',
      'X-ASBD-ID': '129477',
      Origin: 'https://www.instagram.com',
      Referer: `https://www.instagram.com/p/${shortcode}/`,
    },
    body,
  })
  if (!res.ok) return null

  let json: any
  try {
    json = await res.json()
  } catch {
    return null
  }

  const media = json?.data?.xdt_shortcode_media || json?.data?.shortcode_media
  if (!media) return null

  return parseMediaNode(media)
}

/* ── Parse a GraphQL media node into our shape ── */
function parseMediaNode(media: any): Resolved {
  const urls: MediaUrl[] = []
  const seen = new Set<string>()
  let pictureUrl: string | null = media.display_url || null

  const handleNode = (node: any) => {
    if (node.is_video && node.video_url) {
      dedupePush(urls, seen, { url: node.video_url, type: 'video', ext: 'mp4', quality: 'HD' })
    } else if (node.display_url) {
      dedupePush(urls, seen, { url: node.display_url, type: 'image', ext: 'jpg' })
    }
  }

  if (media.edge_sidecar_to_children?.edges?.length) {
    // Carousel
    for (const e of media.edge_sidecar_to_children.edges) handleNode(e.node)
  } else {
    handleNode(media)
  }

  const caption =
    media.edge_media_to_caption?.edges?.[0]?.node?.text ||
    media.title ||
    'Instagram media'

  return { title: caption.substring(0, 140), pictureUrl, urls }
}

/* ── Strategy 2: Instagram embed page (public, often returns media) ── */
async function tryEmbed(shortcode: string): Promise<Resolved | null> {
  const url = `https://www.instagram.com/p/${shortcode}/embed/captioned/`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
  })
  if (!res.ok) return null
  const html = await res.text()

  const urls: MediaUrl[] = []
  const seen = new Set<string>()
  let pictureUrl: string | null = null

  // The embed embeds a JSON "contextJSON" with video / image urls
  const videoMatch = html.match(/"video_url":"([^"]+)"/)
  if (videoMatch) {
    dedupePush(urls, seen, { url: decodeUrl(videoMatch[1]), type: 'video', ext: 'mp4', quality: 'HD' })
  }

  const imgMatches = [...html.matchAll(/"display_url":"([^"]+)"/g)]
  for (const m of imgMatches) {
    const img = decodeUrl(m[1])
    if (!pictureUrl) pictureUrl = img
    if (!videoMatch) dedupePush(urls, seen, { url: img, type: 'image', ext: 'jpg' })
  }

  // fallback: <img class="EmbeddedMediaImage" src="...">
  if (!urls.length) {
    const embImg = html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/)
    if (embImg) {
      const img = decodeHtml(embImg[1])
      pictureUrl = img
      dedupePush(urls, seen, { url: img, type: 'image', ext: 'jpg' })
    }
  }

  const titleMatch = html.match(/<title>([^<]+)<\/title>/)
  const title = titleMatch ? decodeHtml(titleMatch[1]) : 'Instagram media'

  if (!urls.length) return null
  return { title, pictureUrl, urls }
}

/* ── Strategy 3: public page OpenGraph (thumbnail / video meta) ── */
async function tryOpenGraph(rawUrl: string): Promise<Resolved | null> {
  const url = rawUrl.split('?')[0].replace(/\/$/, '') + '/'
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
  })
  if (!res.ok) return null
  const html = await res.text()

  const urls: MediaUrl[] = []
  const seen = new Set<string>()

  const vid =
    html.match(/<meta property="og:video" content="([^"]+)"/) ||
    html.match(/<meta property="og:video:secure_url" content="([^"]+)"/) ||
    html.match(/"video_url":"([^"]+)"/)
  if (vid) dedupePush(urls, seen, { url: decodeUrl(decodeHtml(vid[1])), type: 'video', ext: 'mp4', quality: 'HD' })

  const imgMeta =
    html.match(/<meta property="og:image" content="([^"]+)"/) ||
    html.match(/"display_url":"([^"]+)"/)
  const pictureUrl = imgMeta ? decodeUrl(decodeHtml(imgMeta[1])) : null
  if (!urls.length && pictureUrl) {
    dedupePush(urls, seen, { url: pictureUrl, type: 'image', ext: 'jpg' })
  }

  const titleMeta =
    html.match(/<meta property="og:title" content="([^"]+)"/) ||
    html.match(/<title>([^<]+)<\/title>/)
  const title = titleMeta ? decodeHtml(titleMeta[1]) : 'Instagram media'

  if (!urls.length) return null
  return { title, pictureUrl, urls }
}

/* ── Orchestrator: try strategies in order until one succeeds ── */
async function resolveInstagram(rawUrl: string): Promise<Resolved | null> {
  const shortcode = getShortcode(rawUrl)

  const strategies: Array<() => Promise<Resolved | null>> = []
  if (shortcode) {
    strategies.push(() => tryGraphQL(shortcode))
    strategies.push(() => tryEmbed(shortcode))
  }
  strategies.push(() => tryOpenGraph(rawUrl))

  for (const run of strategies) {
    try {
      const r = await run()
      if (r && r.urls.length) return r
    } catch {
      /* try next */
    }
  }
  return null
}

/* ── API endpoint ── */
app.post('/api/download', async (c) => {
  try {
    const { url } = await c.req.json<{ url: string }>()

    if (!url || !url.includes('instagram.com')) {
      return c.json({ error: 'Please provide a valid Instagram link.' }, 400)
    }
    if (!getShortcode(url)) {
      return c.json(
        { error: 'Unrecognised link. Use a Reel, Post or IGTV link like instagram.com/reel/...' },
        400
      )
    }

    const data = await resolveInstagram(url)

    if (!data || !data.urls.length) {
      return c.json(
        {
          error:
            'Could not fetch this media. It may be private, age-restricted, or temporarily blocked by Instagram. Try another public Reel or Post.',
        },
        404
      )
    }

    return c.json([
      {
        urls: data.urls,
        pictureUrl: data.pictureUrl,
        meta: { title: data.title },
      },
    ])
  } catch (err: any) {
    return c.json({ error: err?.message || 'Server error while fetching media.' }, 500)
  }
})

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok', service: 'ReelSave Pro' }))

// All static assets are served automatically by Cloudflare Pages from ./dist.
// This Worker only handles /api/* routes.

export default app
