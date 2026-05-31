// utils/media-store.js - Cloudflare media endpoint client with local fallback support

import { getState } from '../state.js';
import { getDataEndpoint } from '../db.js';
import { appDbSetMedia } from './app-db.js';

export function getMediaEndpoint() {
  return (getState().settings?.mediaStorageEndpoint || '/media').replace(/\/+$/, '');
}

export async function uploadMediaFile(file, caption = '') {
  const filename = file.name || 'media';
  const contentType = file.type || 'application/octet-stream';
  try {
    return await uploadMediaBlob(file, { filename, contentType, caption });
  } catch (err) {
    console.warn('[media] raw upload failed, falling back to data URL:', err);
    const dataUrl = await readFileAsDataURL(file);
    return uploadMediaDataUrl(dataUrl, { filename, contentType, caption });
  }
}

export async function uploadMediaBlob(blob, { filename = 'media', contentType = '', caption = '' } = {}) {
  const id = 'media-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  const endpoint = getMediaEndpoint();
  const url = new URL(`${endpoint}/upload`, typeof location !== 'undefined' ? location.href : 'http://localhost');
  url.searchParams.set('id', id);
  url.searchParams.set('filename', filename);
  url.searchParams.set('caption', caption || '');

  const resp = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': contentType || 'application/octet-stream',
      'X-Media-Upload': 'raw'
    },
    body: blob
  });
  if (!resp.ok) throw new Error(`Media upload failed with HTTP ${resp.status}`);
  const uploaded = await resp.json();
  await recordMediaMetadata({ ...uploaded, caption, contentType, filename }).catch(() => {});
  return uploaded;
}

export async function uploadMediaDataUrl(dataUrl, { filename = 'media', contentType = '', caption = '' } = {}) {
  const id = 'media-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  const endpoint = getMediaEndpoint();

  try {
    const resp = await fetch(`${endpoint}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, filename, contentType, caption, dataUrl })
    });
    if (!resp.ok) throw new Error(`Media upload failed with HTTP ${resp.status}`);
    const uploaded = await resp.json();
    await recordMediaMetadata({ ...uploaded, caption, contentType, filename }).catch(() => {});
    return uploaded;
  } catch (err) {
    await appDbSetMedia(id, { id, src: dataUrl, filename, contentType, caption, storage: 'indexeddb' });
    return { id, url: dataUrl, storage: 'indexeddb', filename, contentType, caption };
  }
}

export async function clearRemoteMediaStorage() {
  const endpoint = getMediaEndpoint();
  const response = await fetch(`${endpoint}/clear`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Media clear failed with HTTP ${response.status}`);
  return response.json().catch(() => ({ ok: true }));
}

async function recordMediaMetadata(record) {
  if (typeof fetch !== 'function' || typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return;
  await fetch(`${getDataEndpoint()}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record)
  });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
