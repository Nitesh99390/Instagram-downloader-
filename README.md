# ReelSave Pro — Instagram Downloader

## Project Overview
- **Name**: ReelSave Pro
- **Goal**: A professional, fast and free web app to download public Instagram Reels, Posts, Carousels and Photos in HD — no login required.
- **Tech Stack**: Hono + Cloudflare Pages + Vanilla JS + Custom CSS (no heavy frameworks)

## ✅ Currently Completed Features
- **Professional landing page** — sticky navbar, animated hero with custom phone mockup, gradient ambient glow.
- **Smart downloader card**:
  - URL input with gradient focus ring
  - One-tap **Paste from clipboard**
  - Live **media type detection** (Reel / Post / Carousel badge)
  - **Quality selector** (HD / SD / Audio) with smart auto-hiding of unavailable options
  - Preview card with thumbnail, title, Download & Copy-link buttons
- **Download counter** (persisted in localStorage)
- **Recent downloads history** (last 10, with thumbnails, persisted locally)
- **FAQ accordion**, **How-it-works** steps, **stats bar**, **feature grid**
- **PWA support** — installable, offline shell caching via service worker, manifest, SVG favicon
- **SEO/social** — Open Graph + Twitter card meta, robots.txt, og-image
- **Toast notifications** for all user actions
- **Fully responsive** (mobile → desktop)
- **Backend `/api/download`** with multi-strategy Instagram extraction (GraphQL → embed → OpenGraph)

## 🔌 Functional Entry URIs
| Path | Method | Description | Params |
|------|--------|-------------|--------|
| `/` | GET | Main web app (static) | — |
| `/api/download` | POST | Resolve an Instagram link to media URLs | JSON body `{ "url": "https://instagram.com/reel/..." }` |
| `/api/health` | GET | Service health check | — |

**`/api/download` response shape:**
```json
[{ "urls": [{ "url": "...", "type": "video", "ext": "mp4" }], "pictureUrl": "...", "meta": { "title": "..." } }]
```

## 📊 Data Architecture
- **Storage**: Browser `localStorage` only (download counter `rs_count`, history `rs_history`). No server-side database.
- **Data flow**: Browser → `POST /api/download` (Cloudflare Worker) → Instagram public endpoints → parsed media URLs → browser.

## ⚠️ Important Limitation (Instagram extraction)
Instagram aggressively blocks scraping from **datacenter / cloud IPs** (such as Cloudflare Workers) by serving a login-wall instead of media JSON. As a result, the built-in direct extraction may fail for many links when deployed.

**For reliable, production-grade downloads, integrate a third-party extraction API** (e.g. a RapidAPI "Instagram Downloader" service that uses residential proxies). The API key should be stored as a Cloudflare secret:
```bash
npx wrangler pages secret put RAPIDAPI_KEY --project-name <project>
```
Then the backend can call that API as a fallback strategy.

## 🚧 Features Not Yet Implemented
- Third-party extraction API fallback (requires user-provided API key)
- Batch / multiple-link downloads
- Server-side proxying of the media file (currently links open directly)

## 🔭 Recommended Next Steps
1. Provide a RapidAPI (or similar) Instagram-downloader API key → wire it as a fallback in `resolveInstagram()`.
2. Add a media-proxy route so downloads keep a proper filename.
3. Deploy to Cloudflare Pages.

## 🧑 User Guide
1. Copy any **public** Instagram Reel/Post link (Share → Copy link).
2. Paste it into the box (or tap **Paste**).
3. Click **Get Download Link**, choose quality, and hit **Download**.

## 🚀 Deployment
- **Platform**: Cloudflare Pages
- **Status**: ⏳ Not yet deployed (running locally in sandbox)
- **Local dev**: `npm run build && pm2 start ecosystem.config.cjs` → http://localhost:3000
- **Last Updated**: 2026-06-26
