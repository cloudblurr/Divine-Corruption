// utils/app-db.js - IndexedDB persistence for all app data

const DB_NAME = 'divine-corruption-db';
const DB_VERSION = 1;
const KV_STORE = 'kv';
const MEDIA_STORE = 'media';

let dbPromise = null;

export async function appDbGet(key) {
  return withStore(KV_STORE, 'readonly', store => requestToPromise(store.get(key)));
}

export async function appDbSet(key, value) {
  return withStore(KV_STORE, 'readwrite', store => {
    store.put({ key, value, updatedAt: Date.now() });
  });
}

export async function appDbRemove(key) {
  return withStore(KV_STORE, 'readwrite', store => {
    store.delete(key);
  });
}

export async function appDbSetMedia(id, record) {
  return withStore(MEDIA_STORE, 'readwrite', store => {
    store.put({ ...record, id, updatedAt: Date.now() });
  });
}

export async function appDbGetMedia(id) {
  return withStore(MEDIA_STORE, 'readonly', store => requestToPromise(store.get(id)));
}

export async function appDbExport() {
  const [kv, media] = await Promise.all([
    getAll(KV_STORE),
    getAll(MEDIA_STORE)
  ]);
  return { kv, media, exportedAt: new Date().toISOString() };
}

async function getAll(storeName) {
  return withStore(storeName, 'readonly', store => requestToPromise(store.getAll()));
}

async function withStore(storeName, mode, fn) {
  if (!('indexedDB' in globalThis)) return null;
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;

    tx.oncomplete = () => resolve(result?.value ?? result ?? null);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));

    try {
      result = fn(store);
    } catch (err) {
      reject(err);
    }
  });
}

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result?.value ?? req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}
