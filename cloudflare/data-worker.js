// Cloudflare Worker for durable app data and media persistence.
// Bind D1 as APP_DB and R2 as MEDIA_BUCKET.

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));

    await ensureSchema(env);

    if (url.pathname === '/health') {
      return json({
        ok: true,
        kv: await countRows(env, 'kv'),
        media: await countRows(env, 'media')
      });
    }

    if (url.pathname === '/db/health') {
      return json({
        ok: true,
        storage: 'cloudflare-d1-r2',
        counts: {
          kv: await countRows(env, 'kv'),
          media: await countRows(env, 'media')
        }
      });
    }

    if (url.pathname === '/db/export') {
      return handleDbExport(env);
    }

    if (url.pathname === '/db/media') {
      return handleDbMedia(request, env);
    }

    if (url.pathname.startsWith('/db/kv/')) {
      return handleDbKv(request, env, url);
    }

    if ((url.pathname === '/media/upload' || url.pathname === '/upload') && request.method === 'POST') {
      return handleMediaUpload(request, env, url);
    }

    if ((url.pathname === '/media/clear' || url.pathname === '/clear') && request.method === 'DELETE') {
      return handleMediaClear(env);
    }

    if (url.pathname.startsWith('/media/object/') || url.pathname.startsWith('/object/')) {
      return handleMediaObject(request, env, url);
    }

    return cors(new Response('Not found', { status: 404 }));
  }
};

async function ensureSchema(env) {
  await env.APP_DB.batch([
    env.APP_DB.prepare(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )
    `),
    env.APP_DB.prepare(`
      CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY,
        key TEXT,
        url TEXT NOT NULL,
        storage TEXT NOT NULL,
        filename TEXT,
        content_type TEXT,
        caption TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )
    `),
    env.APP_DB.prepare('CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at)')
  ]);
}

async function handleDbKv(request, env, url) {
  const key = decodeURIComponent(url.pathname.replace('/db/kv/', ''));
  if (!key) return json({ ok: false, error: 'Missing key' }, 400);

  if (request.method === 'GET') {
    const row = await env.APP_DB.prepare('SELECT key, value, updated_at FROM kv WHERE key = ?').bind(key).first();
    if (!row) return json({ ok: true, found: false, key, value: null });
    return json({
      ok: true,
      found: true,
      key: row.key,
      value: parseJsonValue(row.value),
      updatedAt: row.updated_at
    });
  }

  if (request.method === 'PUT' || request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const value = Object.prototype.hasOwnProperty.call(body, 'value') ? body.value : body;
    const updatedAt = new Date().toISOString();
    await env.APP_DB.prepare(`
      INSERT INTO kv (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).bind(key, JSON.stringify(value), updatedAt).run();
    return json({ ok: true, key, updatedAt });
  }

  if (request.method === 'DELETE') {
    await env.APP_DB.prepare('DELETE FROM kv WHERE key = ?').bind(key).run();
    return json({ ok: true, key });
  }

  return json({ ok: false, error: 'Method not allowed' }, 405);
}

async function handleDbMedia(request, env) {
  if (request.method === 'GET') {
    const result = await env.APP_DB.prepare('SELECT * FROM media ORDER BY created_at DESC').all();
    return json({
      ok: true,
      media: (result.results || []).map(row => ({
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

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (!body.id || !body.url) return json({ ok: false, error: 'Media id and url are required' }, 400);
    await recordMedia(env, body);
    return json({ ok: true, id: body.id });
  }

  if (request.method === 'DELETE') {
    return handleMediaClear(env);
  }

  return json({ ok: false, error: 'Method not allowed' }, 405);
}

async function handleDbExport(env) {
  const kv = await env.APP_DB.prepare('SELECT key, value, updated_at FROM kv ORDER BY key').all();
  const media = await env.APP_DB.prepare('SELECT * FROM media ORDER BY created_at DESC').all();
  return json({
    ok: true,
    storage: 'cloudflare-d1-r2',
    exportedAt: new Date().toISOString(),
    kv: (kv.results || []).map(row => ({
      key: row.key,
      value: parseJsonValue(row.value),
      updatedAt: row.updated_at
    })),
    media: (media.results || []).map(row => ({
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

async function handleMediaUpload(request, env, url) {
  const requestType = request.headers.get('content-type') || '';
  const isJson = requestType.includes('application/json');
  const body = isJson ? await request.json().catch(() => ({})) : {};
  const id = sanitize((isJson ? body.id : url.searchParams.get('id')) || crypto.randomUUID());
  const filename = sanitize((isJson ? body.filename : url.searchParams.get('filename')) || 'media.bin');
  const contentType = isJson ? (body.contentType || 'application/octet-stream') : (requestType || 'application/octet-stream');
  const ext = extensionFromType(contentType, filename);
  const key = `${id}${ext}`;
  const bytes = isJson
    ? Uint8Array.from(atob(String(body.dataUrl || '').split(',').pop()), c => c.charCodeAt(0))
    : await request.arrayBuffer();

  await env.MEDIA_BUCKET.put(key, bytes, {
    httpMetadata: { contentType },
    customMetadata: {
      filename,
      caption: body.caption || '',
      uploadedAt: new Date().toISOString()
    }
  });

  const record = {
    id,
    key,
    url: `${url.origin}/media/object/${encodeURIComponent(key)}`,
    storage: 'cloudflare-r2',
    filename,
    contentType,
    caption: isJson ? (body.caption || '') : (url.searchParams.get('caption') || '')
  };
  await recordMedia(env, record);
  return json(record);
}

async function handleMediaClear(env) {
  let deleted = 0;
  let cursor = undefined;
  do {
    const listed = await env.MEDIA_BUCKET.list({ cursor, limit: 1000 });
    const keys = (listed.objects || []).map(object => object.key);
    if (keys.length) {
      await env.MEDIA_BUCKET.delete(keys);
      deleted += keys.length;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  await env.APP_DB.prepare('DELETE FROM media').run();
  await env.APP_DB.prepare("UPDATE kv SET value = '[]', updated_at = ? WHERE key = 'gallery'").bind(new Date().toISOString()).run();

  return json({ ok: true, deleted });
}

async function handleMediaObject(request, env, url) {
  if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);

  const key = decodeURIComponent(
    url.pathname.startsWith('/media/object/')
      ? url.pathname.replace('/media/object/', '')
      : url.pathname.replace('/object/', '')
  );
  const object = await env.MEDIA_BUCKET.get(key);
  if (!object) return cors(new Response('Not found', { status: 404 }));
  return cors(new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType || 'application/octet-stream',
      'cache-control': 'public, max-age=31536000'
    }
  }));
}

async function recordMedia(env, record) {
  await env.APP_DB.prepare(`
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
  `).bind(
    record.id,
    record.key || '',
    record.url,
    record.storage || 'cloudflare-r2',
    record.filename || '',
    record.contentType || 'application/octet-stream',
    record.caption || '',
    JSON.stringify(record.metadata || {}),
    record.createdAt || new Date().toISOString()
  ).run();
}

async function countRows(env, table) {
  const row = await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return row?.count || 0;
}

function json(value, status = 200) {
  return cors(new Response(JSON.stringify(value), { status, headers: JSON_HEADERS }));
}

function cors(response) {
  response.headers.set('access-control-allow-origin', '*');
  response.headers.set('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
  response.headers.set('access-control-allow-headers', 'content-type,x-media-upload');
  return response;
}

function parseJsonValue(value) {
  if (value === null || value === undefined || value === '') return null;
  try { return JSON.parse(value); } catch (_) { return value; }
}

function sanitize(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
}

function extensionFromType(type = '', filename = '') {
  const named = filename.match(/\.[a-zA-Z0-9]+$/)?.[0];
  if (named) return named;
  if (type.includes('png')) return '.png';
  if (type.includes('jpeg') || type.includes('jpg')) return '.jpg';
  if (type.includes('webp')) return '.webp';
  if (type.includes('gif')) return '.gif';
  if (type.includes('mp4')) return '.mp4';
  if (type.includes('webm')) return '.webm';
  return '.bin';
}
