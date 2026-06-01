# Divine Corruption

Static roleplay app with local dev-server support for SQLite persistence,
Cloudflare-backed storage, Ollama/Gemini/Puter/Gateway model routing, and character
media workflows.

## GitHub Pages

This repo can be served directly from the repository root with GitHub Pages.
For the `cloudblurr/Divine-Corruption` project repo, the Pages URL will be:

```text
https://cloudblurr.github.io/Divine-Corruption/
```

GitHub Pages can host the static interface, but it cannot run `dev-server.mjs`.
Use the local dev server for Ollama, local SQLite, Puter token proxying,
Gateway key proxying, and ElevenLabs proxying.

## Files Included
- `index.html`
- `main.js`
- `state.js`
- `db.js`
- `styles.css`
- `miniapp.i18n.json`
- `locales/en.json`
- `services/lore-service.js`
- `utils/ai.js`
- `utils/gateway.js`
- `ui/auth.js`
- `ui/biblicalai.js`
- `ui/blessingmaker.js`
- `ui/chat-view.js`
- `ui/divinity-zone.js`
- `ui/floating-media.js`
- `ui/gallery.js`
- `ui/lorebooks.js`
- `ui/memory.js`
- `ui/nodes.js`
- `ui/profile-view.js`
- `ui/settings.js`
- `ui/toast.js`

## How to Use
Run the local dev server:

```bash
node dev-server.mjs 5174
```

Then open `http://localhost:5174`.

The dev server proxies `/ollama/*` to `http://localhost:11434` by default so
the browser can call your self-hosted Ollama models without CORS issues. To use
a different VM endpoint:

```bash
OLLAMA_ENDPOINT=http://your-vm:11434 node dev-server.mjs 5174
```

You can also update the endpoint from Settings inside the app.

## SQLite Persistence

The dev server creates a local SQLite database at:

```text
.data/divine-corruption.sqlite
```

All existing app saves now flow through `db.js` into `/db/kv/:key` first, then
fall back to IndexedDB/localStorage if the app is opened without the dev server.
This covers character JSON, settings, global chat history, story-node chats,
memory, lorebooks, gallery records, auth config, and Divinity Zone catalog data.

Useful endpoints:

```text
GET    /db/health
GET    /db/export
GET    /db/kv/:key
PUT    /db/kv/:key
DELETE /db/kv/:key
GET    /db/media
POST   /db/media
```

Media uploaded through the local `/media/upload` endpoint is saved into
`.media-cache` and recorded in the SQLite `media` table. Media uploaded to a
Cloudflare R2 Worker endpoint is also recorded in SQLite via `/db/media`.

## Cloudflare D1 + R2 Persistence

The app can now use a Cloudflare Worker as the durable store for app data and
media. The deployed endpoint for this workspace is:

```text
https://divine-corruption-data.blnq.workers.dev
```

The browser DB layer reads `window.__DATA_ENDPOINT__` from `index.html`, which
currently points to:

```text
https://divine-corruption-data.blnq.workers.dev/db
```

Media storage should point to:

```text
https://divine-corruption-data.blnq.workers.dev/media
```

Cloudflare files:

```text
cloudflare/data-worker.js
cloudflare/wrangler.data.jsonc
```

Provisioned resources:

```text
D1 database: divine-corruption-db
R2 bucket:   divine-corruption-media
Worker:      divine-corruption-data
```

Deploy/update:

```powershell
$env:CLOUDFLARE_API_TOKEN = (Get-Content -Raw "C:\Users\domo\Desktop\cloudflareAPItoken.txt").Trim()
$env:CLOUDFLARE_ACCOUNT_ID = "44d53af1cbad58434c8537110e556fa5"
npx wrangler deploy -c cloudflare/wrangler.data.jsonc
```

Useful Worker endpoints:

```text
GET    /db/health
GET    /db/export
GET    /db/kv/:key
PUT    /db/kv/:key
DELETE /db/kv/:key
GET    /db/media
POST   /db/media
POST   /media/upload
GET    /media/object/:key
```

## Puter.com / xAI Grok

Puter/Grok support is available in Settings -> Roleplay Engine -> Provider.
The provider has two transports:

```text
Puter.js SDK - browser login
Dev Server Proxy - token file
```

The Puter.js SDK transport uses the browser script:

```html
<script src="https://js.puter.com/v2/" defer></script>
```

and calls `puter.ai.chat()` / `puter.ai.listModels('xai')` directly from the
browser. The dev-server proxy transport talks to the local dev server at
`/puter`, and the dev server sends requests to Puter's OpenAI-compatible
endpoint:

```text
https://api.puter.com/puterai/openai/v1/chat/completions
```

For proxy mode, the auth token is intentionally not stored in app source or browser settings.
The dev server reads it from one of these places:

```powershell
$env:PUTER_AUTH_TOKEN = "<token>"
node dev-server.mjs 5174
```

or:

```powershell
$env:PUTER_AUTH_TOKEN_FILE = "C:\Users\domo\Desktop\authtoken.txt"
node dev-server.mjs 5174
```

If neither env var is set, the dev server also checks
`C:\Users\domo\Desktop\authtoken.txt` by default. Useful endpoints:

```text
GET  /puter/health
GET  /puter/models
POST /puter/chat
```

The default Grok model is `grok-4-1-fast-non-reasoning`, with model refresh
available from Settings in either transport.

## Gateway / HF Local

Gateway support is available in Settings -> Roleplay Engine -> Provider as
`Gateway / HF Local`. The browser talks to the local dev server at `/gateway`,
and the dev server sends requests to the OpenAI-compatible endpoint:

```text
http://127.0.0.1:11435/v1
```

The Gateway API key is intentionally not stored in app source or browser
settings. The dev server reads it from one of these places:

```powershell
$env:GATEWAY_API_KEY = "<key>"
node dev-server.mjs 5174
```

or:

```powershell
$env:GATEWAY_API_KEY_FILE = "C:\Users\domo\Documents\HF\.gateway\api-key.txt"
node dev-server.mjs 5174
```

If neither env var is set, the dev server also checks
`C:\Users\domo\Documents\HF\.gateway\api-key.txt` by default. Useful endpoints:

```text
GET  /gateway/health
GET  /gateway/models
POST /gateway/chat
```

The default Gateway model is `Sao10K/L3-8B-Stheno-v3.2`, with model refresh
available from Settings.

## Cloudflare R2 Media

Cloudflare Worker/R2 files live in `cloudflare/`:

```text
cloudflare/media-worker.js
cloudflare/wrangler.media.jsonc
```

Deploy the Worker after creating/authenticating Cloudflare credentials:

```powershell
npx wrangler deploy -c cloudflare/wrangler.media.jsonc
```

Then set Settings -> Storage -> Media endpoint to the deployed Worker URL, for
example:

```text
https://divine-corruption-media.<your-subdomain>.workers.dev
```

When configured, gallery uploads, generated media, profile avatars, and forge
reference images all upload to R2 through that Worker.

## Notes
- Tailwind CSS is loaded from CDN.
- JSZip (used for this export) is loaded from CDN at runtime.
- Text model calls now use Ollama `/api/chat` when an Ollama model is selected.
- Puter/Grok model calls use the local `/puter/chat` proxy so the auth token
  stays server-side.
- Gateway model calls use the local `/gateway/chat` proxy so the HF Gateway key
  stays server-side.
- Cloudflare API deployment may require re-authentication; an API call from this
  session returned Cloudflare error `10000`.
