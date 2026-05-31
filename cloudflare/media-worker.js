// Cloudflare Worker for persistent media storage.
// Bind an R2 bucket as MEDIA_BUCKET and deploy this worker. Then set
// Settings -> Storage -> media endpoint to the worker URL.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));

    if (url.pathname === '/upload' && request.method === 'POST') {
      const body = await request.json();
      const id = sanitize(body.id || crypto.randomUUID());
      const filename = sanitize(body.filename || 'media.bin');
      const contentType = body.contentType || 'application/octet-stream';
      const ext = extensionFromType(contentType, filename);
      const key = `${id}${ext}`;
      const base64 = String(body.dataUrl || '').split(',').pop();
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

      await env.MEDIA_BUCKET.put(key, bytes, {
        httpMetadata: { contentType },
        customMetadata: {
          filename,
          caption: body.caption || '',
          uploadedAt: new Date().toISOString()
        }
      });

      return json({ id, key, url: `${url.origin}/object/${encodeURIComponent(key)}`, storage: 'cloudflare-r2', filename, contentType });
    }

    if (url.pathname.startsWith('/object/') && request.method === 'GET') {
      const key = decodeURIComponent(url.pathname.replace('/object/', ''));
      const object = await env.MEDIA_BUCKET.get(key);
      if (!object) return cors(new Response('Not found', { status: 404 }));
      return cors(new Response(object.body, {
        headers: {
          'content-type': object.httpMetadata?.contentType || 'application/octet-stream',
          'cache-control': 'public, max-age=31536000'
        }
      }));
    }

    return cors(new Response('Not found', { status: 404 }));
  }
};

function json(value) {
  return cors(new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' }
  }));
}

function cors(response) {
  response.headers.set('access-control-allow-origin', '*');
  response.headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  response.headers.set('access-control-allow-headers', 'content-type');
  return response;
}

function sanitize(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
}

function extensionFromType(type, filename) {
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
