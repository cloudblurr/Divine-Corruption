import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 5173);
const ollamaTarget = (process.env.OLLAMA_ENDPOINT || 'http://localhost:11434').replace(/\/+$/, '');
const ollamaModelsPath = process.env.OLLAMA_MODELS || path.join(os.homedir(), '.ollama', 'models');
const puterOpenAiBase = (process.env.PUTER_OPENAI_BASE || 'https://api.puter.com/puterai/openai/v1').replace(/\/+$/, '');
const puterModelsUrl = process.env.PUTER_MODELS_URL || 'https://api.puter.com/puterai/chat/models/details';
const puterAuthTokenFile = process.env.PUTER_AUTH_TOKEN_FILE || path.join(os.homedir(), 'Desktop', 'authtoken.txt');
const higherStateBaseUrl = (process.env.HIGHERSTATE_BASE_URL || 'https://higher-stateai-app.blnq.workers.dev').replace(/\/+$/, '');
const higherStateEmail = process.env.HIGHERSTATE_EMAIL || '';
const higherStatePassword = process.env.HIGHERSTATE_PASSWORD || '';
const higherStateApiKeyFile = process.env.HIGHERSTATE_API_KEY_FILE || '';
const gatewayOpenAiBase = (process.env.GATEWAY_OPENAI_BASE || process.env.HF_GATEWAY_BASE_URL || 'http://127.0.0.1:11435/v1').replace(/\/+$/, '');
const gatewayApiKeyFile = process.env.GATEWAY_API_KEY_FILE || process.env.HF_GATEWAY_API_KEY_FILE || path.join(os.homedir(), 'Documents', 'HF', '.gateway', 'api-key.txt');
const dataRoot = path.join(root, '.data');
const sqlitePath = path.join(dataRoot, 'divine-corruption.sqlite');
const localMediaRoot = path.join(root, '.media-cache');
let sqliteDb;
let cachedPuterAuthToken = null;
let cachedHigherStateAuthToken = null;
let cachedHigherStateApiKey = null;
let cachedGatewayApiKey = null;

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm']
]);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/health') {
      sendJson(res, {
        ok: true,
        ollamaTarget,
        ollamaModelsPath,
        sqlitePath,
        puterConfigured: Boolean(await getPuterAuthToken().catch(() => '')),
        higherStateBaseUrl,
        higherStateConfigured: Boolean(await getHigherStateAuthToken().catch(() => '')),
        gatewayOpenAiBase,
        gatewayConfigured: Boolean(await getGatewayApiKey().catch(() => ''))
      });
      return;
    }

    if (url.pathname === '/db/health') {
      sendJson(res, {
        ok: true,
        sqlitePath,
        counts: getSqliteCounts()
      });
      return;
    }

    if (url.pathname === '/db/export') {
      await handleDbExport(res);
      return;
    }

    if (url.pathname === '/db/media') {
      await handleDbMedia(req, res);
      return;
    }

    if (url.pathname.startsWith('/db/kv/')) {
      await handleDbKv(req, res, url);
      return;
    }

    if (url.pathname === '/ollama-local-models') {
      sendJson(res, { models: await listLocalOllamaModels() });
      return;
    }

    if (url.pathname === '/media/upload' && req.method === 'POST') {
      await handleLocalMediaUpload(req, res, url);
      return;
    }

    if (url.pathname === '/media/clear' && req.method === 'DELETE') {
      await clearLocalMedia(res);
      return;
    }

    if (url.pathname.startsWith('/media/object/')) {
      await serveLocalMedia(res, url);
      return;
    }

    if (url.pathname.startsWith('/ollama/')) {
      await proxyOllama(req, res, url);
      return;
    }

    if (url.pathname === '/gemini/generate' && (req.method === 'POST' || req.method === 'OPTIONS')) {
      await proxyGeminiGenerate(req, res);
      return;
    }

    if (url.pathname === '/elevenlabs/tts' && (req.method === 'POST' || req.method === 'OPTIONS')) {
      await proxyElevenLabsTts(req, res);
      return;
    }

    if (url.pathname.startsWith('/puter/') && (req.method === 'GET' || req.method === 'POST' || req.method === 'OPTIONS')) {
      await handlePuter(req, res, url);
      return;
    }

    if (url.pathname.startsWith('/higherstate/') && (req.method === 'GET' || req.method === 'POST' || req.method === 'OPTIONS')) {
      await handleHigherState(req, res, url);
      return;
    }

    if (url.pathname.startsWith('/gateway/') && (req.method === 'GET' || req.method === 'POST' || req.method === 'OPTIONS')) {
      await handleGateway(req, res, url);
      return;
    }

    await serveStatic(res, url);
  } catch (err) {
    console.error('[dev-server]', err);
    sendText(res, 500, 'Internal server error');
  }
});

await initSqlite();

server.listen(port, () => {
  console.log(`Dev server: http://localhost:${port}`);
  console.log(`Ollama proxy: /ollama -> ${ollamaTarget}`);
  console.log(`Ollama models: ${ollamaModelsPath}`);
  console.log(`Higher State AI proxy: /higherstate -> ${higherStateBaseUrl}`);
  console.log(`Gateway proxy: /gateway -> ${gatewayOpenAiBase}`);
  console.log(`SQLite DB: ${sqlitePath}`);
});

async function initSqlite() {
  await fs.mkdir(dataRoot, { recursive: true });
  sqliteDb = new DatabaseSync(sqlitePath);
  sqliteDb.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      key TEXT,
      url TEXT NOT NULL,
      storage TEXT NOT NULL,
      filename TEXT,
      content_type TEXT,
      caption TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at);
  `);
}

async function listLocalOllamaModels() {
  const manifestsRoot = path.join(ollamaModelsPath, 'manifests');
  const files = await walkFiles(manifestsRoot).catch(() => []);

  return files.map(file => {
    const rel = path.relative(manifestsRoot, file).split(path.sep);
    const registry = rel[0] || '';
    const namespace = rel[1] || '';
    const model = rel[2] || '';
    const tag = rel.slice(3).join('/') || 'latest';
    const name = namespace === 'library'
      ? `${model}:${tag}`
      : `${namespace}/${model}:${tag}`;

    return {
      name,
      model: name,
      registry,
      namespace,
      tag,
      manifest: file
    };
  }).filter(item => item.name && !item.name.startsWith('/'));
}

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await walkFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

async function proxyOllama(req, res, url) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const targetPath = url.pathname.replace(/^\/ollama/, '') || '/';
  const targetUrl = `${ollamaTarget}${targetPath}${url.search}`;
  const body = await readRequestBody(req);

  const response = await fetch(targetUrl, {
    method: req.method,
    headers: {
      'content-type': req.headers['content-type'] || 'application/json'
    },
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body
  });

  setCors(res);
  res.writeHead(response.status, {
    'content-type': response.headers.get('content-type') || 'application/json'
  });
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function proxyGeminiGenerate(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const body = JSON.parse((await readRequestBody(req)).toString('utf8') || '{}');
  const apiKey = body.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    setCors(res);
    sendJson(res, {
      error: 'Gemini API key missing. Add it in Settings or set GEMINI_API_KEY before starting the dev server.'
    }, 400);
    return;
  }

  const model = sanitizeGeminiModel(body.model || 'gemini-flash-latest');
  const request = body.request || {};
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(request)
  });

  setCors(res);
  res.writeHead(response.status, {
    'content-type': response.headers.get('content-type') || 'application/json'
  });
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function proxyElevenLabsTts(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const body = JSON.parse((await readRequestBody(req)).toString('utf8') || '{}');
  const apiKey = body.apiKey || process.env.ELEVENLABS_API_KEY;
  const voiceId = String(body.voiceId || '').replace(/^elevenlabs:/, '').trim();
  const text = String(body.text || '').trim();

  if (!apiKey || !voiceId || !text) {
    setCors(res);
    sendJson(res, { error: 'ElevenLabs TTS requires apiKey, voiceId, and text.' }, 400);
    return;
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'xi-api-key': apiKey
    },
    body: JSON.stringify({
      text,
      model_id: body.modelId || 'eleven_multilingual_v2',
      voice_settings: {
        stability: body.stability ?? 0.58,
        similarity_boost: body.similarityBoost ?? 0.82,
        style: body.style ?? 0.16,
        use_speaker_boost: true
      }
    })
  });

  setCors(res);
  res.writeHead(response.status, {
    'content-type': response.headers.get('content-type') || (response.ok ? 'audio/mpeg' : 'application/json')
  });
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function handlePuter(req, res, url) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/puter/health' && req.method === 'GET') {
    sendJson(res, { ok: true, configured: Boolean(await getPuterAuthToken().catch(() => '')) });
    return;
  }

  if (url.pathname === '/puter/models' && req.method === 'GET') {
    const response = await fetch(puterModelsUrl, {
      method: 'GET',
      headers: { accept: 'application/json' }
    });

    setCors(res);
    res.writeHead(response.status, {
      'content-type': response.headers.get('content-type') || 'application/json'
    });
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }

  if (url.pathname === '/puter/chat' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const token = body.apiKey || await getPuterAuthToken().catch(() => '');
    if (!token) {
      setCors(res);
      sendJson(res, {
        error: 'Puter auth token missing. Set PUTER_AUTH_TOKEN, PUTER_AUTH_TOKEN_FILE, or keep your token at C:\\Users\\domo\\Desktop\\authtoken.txt before starting the dev server.'
      }, 400);
      return;
    }

    const request = body.request || {};
    request.model = sanitizeOpenAiModel(body.model || request.model || 'grok-4-1-fast-non-reasoning');

    const response = await fetch(`${puterOpenAiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify(request)
    });

    setCors(res);
    res.writeHead(response.status, {
      'content-type': response.headers.get('content-type') || 'application/json'
    });
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }

  sendJson(res, { ok: false, error: 'Puter route not found' }, 404);
}

async function handleHigherState(req, res, url) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/higherstate/health' && req.method === 'GET') {
    sendJson(res, {
      ok: true,
      baseUrl: higherStateBaseUrl,
      configured: Boolean(await getHigherStateAuthToken().catch(() => ''))
    });
    return;
  }

  if (url.pathname === '/higherstate/models' && req.method === 'GET') {
    const token = await getHigherStateAuthToken();
    const response = await fetch(`${higherStateBaseUrl}/api/models?refresh=true`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`
      }
    });

    setCors(res);
    res.writeHead(response.status, {
      'content-type': response.headers.get('content-type') || 'application/json'
    });
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }

  if (url.pathname === '/higherstate/chat' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const token = body.apiKey || await getHigherStateAuthToken();
    if (!token) {
      setCors(res);
      sendJson(res, {
        error: 'Higher State AI auth missing. Set HIGHERSTATE_AUTH_TOKEN, HIGHERSTATE_API_KEY_FILE, or HIGHERSTATE_EMAIL/HIGHERSTATE_PASSWORD before starting the dev server.'
      }, 400);
      return;
    }

    const request = body.request || {};
    request.model = sanitizeOpenAiModel(body.model || request.model || 'grok-3-mini');

    const response = await fetch(`${higherStateBaseUrl}/openai/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify(request)
    });

    setCors(res);
    res.writeHead(response.status, {
      'content-type': response.headers.get('content-type') || 'application/json'
    });
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }

  sendJson(res, { ok: false, error: 'Higher State AI route not found' }, 404);
}

async function handleGateway(req, res, url) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/gateway/health' && req.method === 'GET') {
    sendJson(res, {
      ok: true,
      baseUrl: gatewayOpenAiBase,
      configured: Boolean(await getGatewayApiKey().catch(() => ''))
    });
    return;
  }

  if (url.pathname === '/gateway/models' && req.method === 'GET') {
    const token = await getGatewayApiKey().catch(() => '');
    if (!token) {
      setCors(res);
      sendJson(res, {
        error: 'Gateway API key missing. Set GATEWAY_API_KEY, GATEWAY_API_KEY_FILE, or keep the key at C:\\Users\\domo\\Documents\\HF\\.gateway\\api-key.txt before starting the dev server.'
      }, 400);
      return;
    }

    const response = await fetch(`${gatewayOpenAiBase}/models`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`
      }
    });

    setCors(res);
    res.writeHead(response.status, {
      'content-type': response.headers.get('content-type') || 'application/json'
    });
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }

  if (url.pathname === '/gateway/chat' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const token = body.apiKey || await getGatewayApiKey().catch(() => '');
    if (!token) {
      setCors(res);
      sendJson(res, {
        error: 'Gateway API key missing. Set GATEWAY_API_KEY, GATEWAY_API_KEY_FILE, or keep the key at C:\\Users\\domo\\Documents\\HF\\.gateway\\api-key.txt before starting the dev server.'
      }, 400);
      return;
    }

    const request = body.request || {};
    request.model = sanitizeOpenAiModel(body.model || request.model || 'Sao10K/L3-8B-Stheno-v3.2');

    const response = await fetch(`${gatewayOpenAiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify(request)
    });

    setCors(res);
    res.writeHead(response.status, {
      'content-type': response.headers.get('content-type') || 'application/json'
    });
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }

  sendJson(res, { ok: false, error: 'Gateway route not found' }, 404);
}

async function handleDbKv(req, res, url) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const key = decodeURIComponent(url.pathname.replace('/db/kv/', ''));
  if (!key) {
    sendJson(res, { ok: false, error: 'Missing key' }, 400);
    return;
  }

  if (req.method === 'GET') {
    const row = sqliteDb.prepare('SELECT key, value, updated_at FROM kv WHERE key = ?').get(key);
    if (!row) {
      sendJson(res, { ok: true, found: false, key, value: null });
      return;
    }
    sendJson(res, {
      ok: true,
      found: true,
      key: row.key,
      value: parseJsonValue(row.value),
      updatedAt: row.updated_at
    });
    return;
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    const body = await parseJsonBody(req);
    const value = Object.prototype.hasOwnProperty.call(body, 'value') ? body.value : body;
    const serialized = JSON.stringify(value);
    const updatedAt = new Date().toISOString();
    sqliteDb.prepare(`
      INSERT INTO kv (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).run(key, serialized, updatedAt);
    sendJson(res, { ok: true, key, updatedAt });
    return;
  }

  if (req.method === 'DELETE') {
    sqliteDb.prepare('DELETE FROM kv WHERE key = ?').run(key);
    sendJson(res, { ok: true, key });
    return;
  }

  sendJson(res, { ok: false, error: 'Method not allowed' }, 405);
}

async function handleDbMedia(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET') {
    const rows = sqliteDb.prepare('SELECT * FROM media ORDER BY created_at DESC').all();
    sendJson(res, {
      ok: true,
      media: rows.map(row => ({
        id: row.id,
        key: row.key,
        url: row.url,
        storage: row.storage,
        filename: row.filename,
        contentType: row.content_type,
        caption: row.caption,
        metadata: parseJsonValue(row.metadata),
        createdAt: row.created_at
      }))
    });
    return;
  }

  if (req.method === 'POST') {
    const body = await parseJsonBody(req);
    if (!body.id || !body.url) {
      sendJson(res, { ok: false, error: 'Media id and url are required' }, 400);
      return;
    }
    recordMediaUpload(body);
    sendJson(res, { ok: true, id: body.id });
    return;
  }

  if (req.method === 'DELETE') {
    await clearLocalMedia(res);
    return;
  }

  sendJson(res, { ok: false, error: 'Method not allowed' }, 405);
}

async function handleDbExport(res) {
  const kvRows = sqliteDb.prepare('SELECT key, value, updated_at FROM kv ORDER BY key').all();
  const mediaRows = sqliteDb.prepare('SELECT * FROM media ORDER BY created_at DESC').all();
  sendJson(res, {
    ok: true,
    sqlitePath,
    exportedAt: new Date().toISOString(),
    kv: kvRows.map(row => ({
      key: row.key,
      value: parseJsonValue(row.value),
      updatedAt: row.updated_at
    })),
    media: mediaRows.map(row => ({
      id: row.id,
      key: row.key,
      url: row.url,
      storage: row.storage,
      filename: row.filename,
      contentType: row.content_type,
      caption: row.caption,
      metadata: parseJsonValue(row.metadata),
      createdAt: row.created_at
    }))
  });
}

async function serveStatic(res, url) {
  const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const resolved = path.resolve(root, `.${requested}`);

  if (!resolved.startsWith(root)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  try {
    const data = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'content-type': contentTypes.get(ext) || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      sendText(res, 404, 'Not found');
      return;
    }
    throw err;
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function parseJsonBody(req) {
  const raw = (await readRequestBody(req)).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, value, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

function sendText(res, status, text) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function setCors(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type,authorization,x-media-upload');
}

async function handleLocalMediaUpload(req, res, url) {
  const contentType = req.headers['content-type'] || 'application/octet-stream';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await parseJsonBody(req) : null;
  const id = sanitizeName((isJson ? body.id : url.searchParams.get('id')) || `media-${Date.now()}`);
  const filename = sanitizeName((isJson ? body.filename : url.searchParams.get('filename')) || 'media.bin');
  const recordContentType = isJson ? (body.contentType || 'application/octet-stream') : contentType;
  const ext = path.extname(filename) || extensionFromType(recordContentType);
  const key = `${id}${ext}`;
  let bytes;
  if (isJson) {
    const dataUrl = body.dataUrl || '';
    const base64 = dataUrl.includes(',') ? dataUrl.split(',').pop() : dataUrl;
    bytes = Buffer.from(base64, 'base64');
  } else {
    bytes = await readRequestBody(req);
  }

  await fs.mkdir(localMediaRoot, { recursive: true });
  await fs.writeFile(path.join(localMediaRoot, key), bytes);

  const record = {
    id,
    key,
    url: `/media/object/${encodeURIComponent(key)}`,
    storage: 'local-dev',
    filename,
    contentType: recordContentType,
    caption: isJson ? (body.caption || '') : (url.searchParams.get('caption') || '')
  };
  recordMediaUpload(record);

  sendJson(res, record);
}

async function clearLocalMedia(res) {
  sqliteDb.prepare('DELETE FROM media').run();
  sqliteDb.prepare("UPDATE kv SET value = '[]', updated_at = ? WHERE key = 'gallery'").run(new Date().toISOString());
  try {
    await fs.rm(localMediaRoot, { recursive: true, force: true });
  } catch {}
  sendJson(res, { ok: true, cleared: 'local-media' });
}

async function serveLocalMedia(res, url) {
  const key = decodeURIComponent(url.pathname.replace('/media/object/', ''));
  const safeKey = sanitizeName(key);
  const filePath = path.join(localMediaRoot, safeKey);
  try {
    const bytes = await fs.readFile(filePath);
    res.writeHead(200, {
      'content-type': contentTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
      'cache-control': 'public, max-age=31536000'
    });
    res.end(bytes);
  } catch {
    sendText(res, 404, 'Media not found');
  }
}

function sanitizeName(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
}

function sanitizeGeminiModel(model) {
  return String(model).replace(/^models\//, '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 100) || 'gemini-flash-latest';
}

function sanitizeOpenAiModel(model) {
  return String(model).replace(/[^a-zA-Z0-9._:/-]/g, '').slice(0, 140) || 'grok-4-1-fast-non-reasoning';
}

async function getPuterAuthToken() {
  if (process.env.PUTER_AUTH_TOKEN) return process.env.PUTER_AUTH_TOKEN.trim();
  if (cachedPuterAuthToken) return cachedPuterAuthToken;
  const token = (await fs.readFile(puterAuthTokenFile, 'utf8')).trim();
  cachedPuterAuthToken = token;
  return token;
}

async function getHigherStateAuthToken() {
  if (process.env.HIGHERSTATE_AUTH_TOKEN) return process.env.HIGHERSTATE_AUTH_TOKEN.trim();
  if (process.env.HIGHERSTATE_API_KEY) return process.env.HIGHERSTATE_API_KEY.trim();
  if (cachedHigherStateAuthToken) return cachedHigherStateAuthToken;
  if (cachedHigherStateApiKey) return cachedHigherStateApiKey;
  if (higherStateApiKeyFile) {
    const token = (await fs.readFile(higherStateApiKeyFile, 'utf8')).trim();
    cachedHigherStateApiKey = token;
    return token;
  }
  if (!higherStateEmail || !higherStatePassword) {
    throw new Error('Higher State AI auth missing. Set HIGHERSTATE_AUTH_TOKEN, HIGHERSTATE_API_KEY_FILE, or HIGHERSTATE_EMAIL/HIGHERSTATE_PASSWORD.');
  }

  const response = await fetch(`${higherStateBaseUrl}/api/v1/auths/signin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: higherStateEmail,
      password: higherStatePassword
    })
  });
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (_) {
    data = { raw };
  }
  if (!response.ok || !data.token) {
    const message = data?.detail || data?.error || raw || `HTTP ${response.status}`;
    throw new Error(`Higher State AI login failed: ${message}`);
  }
  cachedHigherStateAuthToken = data.token;
  return cachedHigherStateAuthToken;
}

async function getGatewayApiKey() {
  if (process.env.GATEWAY_API_KEY) return process.env.GATEWAY_API_KEY.trim();
  if (process.env.HF_GATEWAY_API_KEY) return process.env.HF_GATEWAY_API_KEY.trim();
  if (cachedGatewayApiKey) return cachedGatewayApiKey;
  const token = (await fs.readFile(gatewayApiKeyFile, 'utf8')).trim();
  cachedGatewayApiKey = token;
  return token;
}

function getSqliteCounts() {
  return {
    kv: sqliteDb.prepare('SELECT COUNT(*) AS count FROM kv').get().count,
    media: sqliteDb.prepare('SELECT COUNT(*) AS count FROM media').get().count
  };
}

function recordMediaUpload(record) {
  sqliteDb.prepare(`
    INSERT INTO media (id, key, url, storage, filename, content_type, caption, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      key = excluded.key,
      url = excluded.url,
      storage = excluded.storage,
      filename = excluded.filename,
      content_type = excluded.content_type,
      caption = excluded.caption,
      metadata = excluded.metadata
  `).run(
    record.id,
    record.key || '',
    record.url,
    record.storage || 'local-dev',
    record.filename || '',
    record.contentType || 'application/octet-stream',
    record.caption || '',
    JSON.stringify(record.metadata || {}),
    new Date().toISOString()
  );
}

function parseJsonValue(value) {
  if (value === null || value === undefined || value === '') return null;
  try { return JSON.parse(value); } catch (_) { return value; }
}

function extensionFromType(type = '') {
  if (type.includes('png')) return '.png';
  if (type.includes('jpeg') || type.includes('jpg')) return '.jpg';
  if (type.includes('webp')) return '.webp';
  if (type.includes('gif')) return '.gif';
  if (type.includes('mp4')) return '.mp4';
  if (type.includes('webm')) return '.webm';
  return '.bin';
}
