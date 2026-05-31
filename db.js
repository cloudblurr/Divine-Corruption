// db.js - Enhanced persistence layer wrapping miniappsAI.storage
// Provides auto-save, change listeners, batch ops, migration, and error recovery
import { appDbGet, appDbSet, appDbRemove } from './utils/app-db.js';

const listeners = {};
let pendingSaves = {};
let saveTimers = {};
const LOCAL_DATA_ENDPOINT = '/db';

export function getDataEndpoint() {
  const localValue = typeof globalThis.localStorage !== 'undefined'
    ? globalThis.localStorage.getItem('cloudflareDataEndpoint')
    : '';
  const windowValue = typeof window !== 'undefined' ? window.__DATA_ENDPOINT__ : '';
  return (localValue || windowValue || LOCAL_DATA_ENDPOINT).replace(/\/+$/, '') || LOCAL_DATA_ENDPOINT;
}

export function setDataEndpoint(endpoint) {
  const normalized = (endpoint || LOCAL_DATA_ENDPOINT).replace(/\/+$/, '') || LOCAL_DATA_ENDPOINT;
  if (typeof globalThis.localStorage !== 'undefined') {
    if (normalized === LOCAL_DATA_ENDPOINT) {
      globalThis.localStorage.removeItem('cloudflareDataEndpoint');
    } else {
      globalThis.localStorage.setItem('cloudflareDataEndpoint', normalized);
    }
  }
  return normalized;
}

function hasIndexedDb() {
  return typeof globalThis.indexedDB !== 'undefined';
}

function parseStoredValue(raw) {
  if (raw === null || raw === undefined) return null;
  try { return JSON.parse(raw); } catch (_) { return raw; }
}

function getLocalStorage() {
  return {
    async getItem(key) {
      return globalThis.localStorage?.getItem(key) ?? null;
    },
    async setItem(key, value) {
      globalThis.localStorage?.setItem(key, value);
    },
    async removeItem(key) {
      globalThis.localStorage?.removeItem(key);
    }
  };
}

function getLegacyStorages() {
  const storages = [];
  if (canUseServerStorage()) storages.push(getServerStorage());
  if (hasIndexedDb()) storages.push(getIndexedDbStorage());
  if (globalThis.miniappsAI?.storage) storages.push(globalThis.miniappsAI.storage);
  if (globalThis.localStorage) storages.push(getLocalStorage());
  return storages;
}

function canUseServerStorage() {
  return typeof fetch === 'function'
    && typeof location !== 'undefined'
    && /^https?:$/.test(location.protocol);
}

function getServerStorage() {
  return {
    async getItem(key) {
      const endpoint = getDataEndpoint();
      const response = await fetch(`${endpoint}/kv/${encodeURIComponent(key)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Data get failed with HTTP ${response.status}`);
      const data = await response.json();
      return data.found ? JSON.stringify(data.value) : null;
    },
    async setItem(key, value) {
      let parsed = value;
      try { parsed = JSON.parse(value); } catch (_) {}
      const endpoint = getDataEndpoint();
      const response = await fetch(`${endpoint}/kv/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: parsed })
      });
      if (!response.ok) throw new Error(`Data set failed with HTTP ${response.status}`);
    },
    async removeItem(key) {
      const endpoint = getDataEndpoint();
      const response = await fetch(`${endpoint}/kv/${encodeURIComponent(key)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`Data remove failed with HTTP ${response.status}`);
    }
  };
}

function getIndexedDbStorage() {
  return {
    async getItem(key) {
      const value = await appDbGet(key);
      return value === null || value === undefined ? null : JSON.stringify(value);
    },
    async setItem(key, value) {
      try { await appDbSet(key, JSON.parse(value)); }
      catch (_) { await appDbSet(key, value); }
    },
    async removeItem(key) {
      await appDbRemove(key);
    }
  };
}

function getStorage() {
  if (canUseServerStorage()) return getServerStorage();
  if (hasIndexedDb()) return getIndexedDbStorage();

  if (globalThis.miniappsAI?.storage) {
    return globalThis.miniappsAI.storage;
  }

  return getLocalStorage();
}

// ─── Core CRUD ───

export async function dbGet(key) {
  try {
    const storage = getStorage();
    let raw = null;
    try {
      raw = await storage.getItem(key);
    } catch (primaryErr) {
      console.warn(`[DB] Primary read skipped for "${key}":`, primaryErr);
    }
    if (raw !== null && raw !== undefined) return parseStoredValue(raw);

    if (canUseServerStorage() || hasIndexedDb()) {
      for (const legacyStorage of getLegacyStorages()) {
        if (legacyStorage === storage) continue;
        try {
          const legacyRaw = await legacyStorage.getItem(key);
          if (legacyRaw !== null && legacyRaw !== undefined) {
            const migrated = parseStoredValue(legacyRaw);
            await storage.setItem(key, JSON.stringify(migrated));
            return migrated;
          }
        } catch (legacyErr) {
          console.warn(`[DB] Legacy read skipped for "${key}":`, legacyErr);
        }
      }
    }

    return null;
  } catch (err) {
    console.error(`[DB] Failed to read "${key}":`, err);
    return null;
  }
}

export async function dbSet(key, value, { sync = true, debounce = 0 } = {}) {
  try {
    if (debounce > 0) {
      return debounceSet(key, value, debounce, sync);
    }
    try {
      await getStorage().setItem(key, JSON.stringify(value));
    } catch (primaryErr) {
      if (!canUseServerStorage()) throw primaryErr;
      console.warn(`[DB] SQLite write failed for "${key}", falling back locally:`, primaryErr);
      if (hasIndexedDb()) await getIndexedDbStorage().setItem(key, JSON.stringify(value));
      else await getLocalStorage().setItem(key, JSON.stringify(value));
    }
    emitChange(key, value);
    return true;
  } catch (err) {
    if (err?.name === 'STORAGE_QUOTA_EXCEEDED' || err?.code === 'STORAGE_QUOTA_EXCEEDED') {
      console.error(`[DB] Storage quota exceeded for "${key}".`);
      emitError(key, 'quota', err);
      return false;
    }
    console.error(`[DB] Failed to write "${key}":`, err);
    return false;
  }
}

export async function dbRemove(key) {
  try {
    await getStorage().removeItem(key);
    emitChange(key, null);
    return true;
  } catch (err) {
    console.error(`[DB] Failed to remove "${key}":`, err);
    return false;
  }
}

// ─── Debounced auto-save ───

function debounceSet(key, value, ms, sync) {
  return new Promise((resolve) => {
    pendingSaves[key] = { value, sync, resolve };
    clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(async () => {
      const pending = pendingSaves[key];
      delete pendingSaves[key];
      if (pending) {
        const ok = await dbSet(key, pending.value, { sync: pending.sync });
        pending.resolve(ok);
      }
    }, ms);
  });
}

export async function dbFlush() {
  const keys = Object.keys(pendingSaves);
  const results = await Promise.all(keys.map(async (key) => {
    clearTimeout(saveTimers[key]);
    const pending = pendingSaves[key];
    delete pendingSaves[key];
    return dbSet(key, pending.value, { sync: pending.sync });
  }));
  return results.every(Boolean);
}

// ─── Batch read ───

export async function dbGetMany(keys) {
  const results = await Promise.all(keys.map(k => dbGet(k)));
  const map = {};
  keys.forEach((k, i) => { map[k] = results[i]; });
  return map;
}

// ─── Change listeners (reactive UI) ───

export function dbOn(key, callback) {
  if (!listeners[key]) listeners[key] = new Set();
  listeners[key].add(callback);
  return () => listeners[key]?.delete(callback);
}

function emitChange(key, value) {
  listeners[key]?.forEach(fn => {
    try { fn(value); } catch (e) { console.error('[DB] Listener error:', e); }
  });
  listeners['*']?.forEach(fn => {
    try { fn(key, value); } catch (e) { console.error('[DB] Wildcard listener error:', e); }
  });
}

function emitError(key, type, err) {
  listeners[`error:${key}`]?.forEach(fn => {
    try { fn(type, err); } catch (e) { console.error('[DB] Error listener fail:', e); }
  });
}

// ─── Migration helper ───

export async function dbMigrate(migrations) {
  const versionRaw = await getStorage().getItem('_db_version');
  const current = versionRaw ? parseInt(versionRaw, 10) : 0;

  let migrated = false;
  for (const [version, fn] of migrations) {
    if (version > current) {
      try {
        await fn(dbGet, dbSet);
        await getStorage().setItem('_db_version', String(version));
        migrated = true;
      } catch (err) {
        console.error(`[DB] Migration v${version} failed:`, err);
      }
    }
  }
  return migrated;
}

// ─── Divinity Zone: shared JSON catalog ───

const DIVINITY_KEY = 'divinity_zone_catalog';
const DIVINITY_META_KEY = 'divinity_zone_meta';

export async function getDivinityCatalog() {
  const catalog = await dbGet(DIVINITY_KEY);
  return Array.isArray(catalog) ? catalog : [];
}

export async function setDivinityCatalog(items) {
  await dbSet(DIVINITY_KEY, items);
  await dbSet(DIVINITY_META_KEY, { lastUpdated: Date.now(), count: items.length });
  return true;
}

export async function appendDivinityItems(newItems) {
  const existing = await getDivinityCatalog();
  const merged = [...existing, ...newItems];
  return setDivinityCatalog(merged);
}

export async function getDivinityMeta() {
  return await dbGet(DIVINITY_META_KEY) || { lastUpdated: 0, count: 0 };
}

// ─── Auth helpers ───

const AUTH_KEY = 'auth_config';

export async function getAuthConfig() {
  return await dbGet(AUTH_KEY) || { pinHash: null, enabled: false };
}

export async function setAuthConfig(config) {
  await dbSet(AUTH_KEY, config);
}

// Simple hash for PIN (not cryptographic — just obfuscation for client-side)
export function hashPin(pin) {
  let hash = 0;
  const salt = 'divine_corruption_v1_';
  const str = salt + pin + salt;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return 'dc_' + Math.abs(hash).toString(36);
}

// ─── Save-before-unload ───

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    // Flush any pending debounced saves
    const keys = Object.keys(pendingSaves);
    for (const key of keys) {
      clearTimeout(saveTimers[key]);
      const pending = pendingSaves[key];
      if (pending) {
        try {
          getStorage().setItem(key, JSON.stringify(pending.value));
        } catch (e) { /* best effort */ }
      }
    }
  });
}
