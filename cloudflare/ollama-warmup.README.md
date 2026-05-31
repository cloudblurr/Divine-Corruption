# Ollama Warmup Worker

This Worker keeps selected self-hosted Ollama models warm by calling `/api/chat`
on a Cron Trigger with a tiny prompt and a `keep_alive` value.

It does not use Cloudflare Workers AI. It uses Cloudflare Workers Cron Triggers
as a scheduler for your own Ollama VM.

## Configure

Edit `wrangler.ollama-warmup.jsonc`:

- `OLLAMA_BASE_URL`: public or Cloudflare Tunnel URL for your Ollama service.
- `OLLAMA_MODELS`: comma-separated Ollama model names to warm.
- `OLLAMA_KEEP_ALIVE`: how long Ollama should keep the model loaded after each ping.
- `triggers.crons`: how often Cloudflare runs the pinger.

Start conservatively:

```jsonc
"OLLAMA_MODELS": "dolphin-mistral:latest",
"OLLAMA_KEEP_ALIVE": "30m",
"OLLAMA_WARMUP_CONCURRENCY": "1",
"triggers": { "crons": ["*/5 * * * *"] }
```

Large models still need enough VM RAM/VRAM. If a model fails with an allocation
error, no cron can keep it loaded; use a smaller quantization/model or increase
available memory.

## Secrets

Optional secrets:

```powershell
npx wrangler secret put WARMUP_AUTH_TOKEN -c cloudflare/wrangler.ollama-warmup.jsonc
npx wrangler secret put OLLAMA_AUTH_TOKEN -c cloudflare/wrangler.ollama-warmup.jsonc
npx wrangler secret put OLLAMA_SHARED_SECRET -c cloudflare/wrangler.ollama-warmup.jsonc
npx wrangler secret put CF_ACCESS_CLIENT_ID -c cloudflare/wrangler.ollama-warmup.jsonc
npx wrangler secret put CF_ACCESS_CLIENT_SECRET -c cloudflare/wrangler.ollama-warmup.jsonc
```

`WARMUP_AUTH_TOKEN` protects the manual `POST /warmup` endpoint. The other
secrets are forwarded to your Ollama gateway if you protect the VM with a proxy,
Cloudflare Access, or a custom shared-secret check.

## Deploy

```powershell
npx wrangler deploy -c cloudflare/wrangler.ollama-warmup.jsonc
```

Local scheduled test:

```powershell
npx wrangler dev -c cloudflare/wrangler.ollama-warmup.jsonc --test-scheduled
curl "http://localhost:8787/cdn-cgi/handler/scheduled?format=json"
```
