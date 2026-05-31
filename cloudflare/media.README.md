# Cloudflare R2 Media Worker

This Worker stores all app media uploads in Cloudflare R2 and serves them back
from stable `/object/:key` URLs.

Files:

- `media-worker.js` - Worker source.
- `wrangler.media.jsonc` - Worker + R2 binding config.

## Deploy

```powershell
npx wrangler deploy -c cloudflare/wrangler.media.jsonc
```

The config expects an R2 bucket named `divine-corruption-media` bound as
`MEDIA_BUCKET`.

If the bucket does not exist yet:

```powershell
npx wrangler r2 bucket create divine-corruption-media
```

After deploy, open the app and set:

```text
Settings -> Storage -> Media endpoint = https://<your-worker>.workers.dev
```

The app will then upload gallery files, generated media, profile avatars, and
forge reference images to R2. Each successful upload is also recorded in the
local SQLite `media` table through `/db/media`.

## API

```text
POST /upload
GET  /object/:key
```

Upload body:

```json
{
  "id": "media-id",
  "filename": "image.png",
  "contentType": "image/png",
  "caption": "optional caption",
  "dataUrl": "data:image/png;base64,..."
}
```
