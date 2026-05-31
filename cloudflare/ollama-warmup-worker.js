// Cloudflare Worker cron pinger for a self-hosted Ollama VM.
// Deploy with wrangler.ollama-warmup.jsonc, then point OLLAMA_BASE_URL at a
// public or Cloudflare Tunnel URL that can reach your VM's Ollama service.

const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_KEEP_ALIVE = '30m';
const DEFAULT_PROMPT = 'Reply OK.';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      return json({
        ok: true,
        worker: 'divine-corruption-ollama-warmup',
        schedule: 'configured in wrangler.ollama-warmup.jsonc',
        models: getModels(env),
        ollamaBaseUrl: sanitizeBaseUrl(env.OLLAMA_BASE_URL) || null,
        keepAlive: env.OLLAMA_KEEP_ALIVE || DEFAULT_KEEP_ALIVE
      });
    }

    if (request.method === 'GET' && url.pathname === '/status') {
      const response = await fetchOllama(env, '/api/ps', {
        method: 'GET',
        timeoutMs: getTimeoutMs(env)
      });
      return json(response);
    }

    if (request.method === 'POST' && url.pathname === '/warmup') {
      if (!await isAuthorized(request, env)) {
        return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      }
      const result = await warmModels(env, { reason: 'manual' });
      return json(result, { status: result.ok ? 200 : 502 });
    }

    return json({ ok: false, error: 'Not found' }, { status: 404 });
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      warmModels(env, {
        reason: 'cron',
        cron: controller.cron,
        scheduledTime: controller.scheduledTime
      }).then((result) => {
        console.log(JSON.stringify({
          event: 'ollama-warmup',
          ok: result.ok,
          warmed: result.results.filter((item) => item.ok).length,
          total: result.results.length
        }));
      }).catch((err) => {
        console.error(JSON.stringify({
          event: 'ollama-warmup',
          ok: false,
          error: err?.message || String(err)
        }));
        throw err;
      })
    );
  }
};

async function warmModels(env, meta = {}) {
  const models = getModels(env);
  if (!models.length) {
    return { ok: false, ...meta, error: 'No models configured. Set OLLAMA_MODELS.' };
  }

  const concurrency = Math.max(1, Number.parseInt(env.OLLAMA_WARMUP_CONCURRENCY || '1', 10) || 1);
  const results = [];

  for (let i = 0; i < models.length; i += concurrency) {
    const batch = models.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((model) => pingModel(env, model)));
    results.push(...batchResults);
  }

  return {
    ok: results.some((item) => item.ok),
    ...meta,
    keepAlive: env.OLLAMA_KEEP_ALIVE || DEFAULT_KEEP_ALIVE,
    results,
    checkedAt: new Date().toISOString()
  };
}

async function pingModel(env, model) {
  const startedAt = Date.now();
  const payload = {
    model,
    stream: false,
    keep_alive: env.OLLAMA_KEEP_ALIVE || DEFAULT_KEEP_ALIVE,
    messages: [{ role: 'user', content: env.OLLAMA_PING_PROMPT || DEFAULT_PROMPT }],
    options: {
      num_ctx: Number.parseInt(env.OLLAMA_NUM_CTX || '1024', 10) || 1024,
      num_predict: Number.parseInt(env.OLLAMA_NUM_PREDICT || '1', 10) || 1
    }
  };

  try {
    const response = await fetchOllama(env, '/api/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: getTimeoutMs(env)
    });

    return {
      model,
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
      loadDurationNs: response.body?.load_duration || null,
      error: response.ok ? null : response.bodySnippet || response.statusText
    };
  } catch (err) {
    return {
      model,
      ok: false,
      durationMs: Date.now() - startedAt,
      error: err?.message || String(err)
    };
  }
}

async function fetchOllama(env, pathname, init = {}) {
  const baseUrl = sanitizeBaseUrl(env.OLLAMA_BASE_URL);
  if (!baseUrl) throw new Error('OLLAMA_BASE_URL is required.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('Ollama warmup timed out'), init.timeoutMs || DEFAULT_TIMEOUT_MS);

  try {
    const headers = new Headers(init.headers || {});
    if (init.body) headers.set('content-type', 'application/json');
    applyAuthHeaders(headers, env);

    const response = await fetch(`${baseUrl}${pathname}`, {
      method: init.method || 'GET',
      headers,
      body: init.body,
      signal: controller.signal
    });

    let body = null;
    let bodySnippet = '';
    if (response.ok) {
      body = await response.json().catch(() => null);
    } else {
      bodySnippet = await readTextSnippet(response, 2048);
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      body,
      bodySnippet
    };
  } finally {
    clearTimeout(timeout);
  }
}

function applyAuthHeaders(headers, env) {
  if (env.OLLAMA_AUTH_TOKEN) {
    headers.set('authorization', `Bearer ${env.OLLAMA_AUTH_TOKEN}`);
  }
  if (env.OLLAMA_SHARED_SECRET) {
    headers.set('x-ollama-warmup-secret', env.OLLAMA_SHARED_SECRET);
  }
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    headers.set('cf-access-client-id', env.CF_ACCESS_CLIENT_ID);
    headers.set('cf-access-client-secret', env.CF_ACCESS_CLIENT_SECRET);
  }
}

async function isAuthorized(request, env) {
  if (!env.WARMUP_AUTH_TOKEN) return false;
  const expected = `Bearer ${env.WARMUP_AUTH_TOKEN}`;
  const actual = request.headers.get('authorization') || '';
  return actual === expected;
}

function getModels(env) {
  return String(env.OLLAMA_MODELS || '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
}

function getTimeoutMs(env) {
  const parsed = Number.parseInt(env.OLLAMA_REQUEST_TIMEOUT_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function sanitizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

async function readTextSnippet(response, maxBytes) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = '';

  while (bytesRead < maxBytes) {
    const { value, done } = await reader.read();
    if (done || !value) break;
    const chunk = value.slice(0, Math.max(0, maxBytes - bytesRead));
    bytesRead += chunk.byteLength;
    text += decoder.decode(chunk, { stream: true });
  }

  try { await reader.cancel(); } catch (_) {}
  return text + decoder.decode();
}

function json(value, init = {}) {
  return new Response(JSON.stringify(value, null, 2), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
