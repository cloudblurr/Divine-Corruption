// services/lore-service.js - Centralized lore management
// Pending queue, lorebook CRUD, events, auto-lore integration
import { getState, saveCharacter, saveLorebooks } from '../state.js';

let pendingLoreQueue = [];
const listeners = new Set();

// ─── Events ───
export function onLoreChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitLoreChange() {
  listeners.forEach(fn => { try { fn(); } catch (e) { console.error('[LoreService]', e); } });
}

// ─── Pending Queue ───
export function getPendingLore() {
  return [...pendingLoreQueue];
}

export function addPendingLore(entry) {
  const lore = {
    id: entry.id || 'ldraft-' + Date.now() + Math.random().toString(36).slice(2, 7),
    title: entry.title || 'Untitled Lore',
    content: entry.content || '',
    tags: entry.tags || [],
    source: entry.source || 'BiblicalAI',
    timestamp: Date.now()
  };
  pendingLoreQueue.unshift(lore);
  emitLoreChange();
  return lore;
}

export function removePendingLore(id) {
  pendingLoreQueue = pendingLoreQueue.filter(e => e.id !== id);
  emitLoreChange();
}

export function updatePendingLore(id, updates) {
  const entry = pendingLoreQueue.find(e => e.id === id);
  if (entry) {
    Object.assign(entry, updates);
    emitLoreChange();
  }
}

export function clearPendingLore() {
  pendingLoreQueue = [];
  emitLoreChange();
}

// ─── Approve to Lorebook ───
export async function approveLoreToBook(entry, bookIndex) {
  const state = getState();
  const books = [...(state.lorebooks || [])];
  if (!books[bookIndex]) return false;

  books[bookIndex].entries = books[bookIndex].entries || [];
  books[bookIndex].entries.push({
    id: entry.id,
    title: entry.title,
    content: entry.content,
    source: entry.source || 'BiblicalAI',
    tags: entry.tags || [],
    timestamp: Date.now()
  });

  await saveLorebooks(books);
  await attachBookToActiveCharacter(books[bookIndex].id);
  removePendingLore(entry.id);
  return true;
}

export async function approveAllToBook(bookIndex) {
  const entries = [...pendingLoreQueue];
  for (const entry of entries) {
    await approveLoreToBook(entry, bookIndex);
  }
}

export async function createLorebookAndApprove(entry, bookTitle) {
  const state = getState();
  const books = [...(state.lorebooks || [])];
  const newBook = {
    id: 'lb-' + Date.now(),
    title: bookTitle,
    entries: [{
      id: entry.id,
      title: entry.title,
      content: entry.content,
      source: entry.source || 'BiblicalAI',
      tags: entry.tags || [],
      timestamp: Date.now()
    }],
    createdAt: Date.now()
  };
  books.push(newBook);
  await saveLorebooks(books);
  await attachBookToActiveCharacter(newBook.id);
  removePendingLore(entry.id);
  return newBook;
}

// ─── Delete Entry from Lorebook ───
export async function deleteLoreEntry(bookIndex, entryId) {
  const state = getState();
  const books = [...(state.lorebooks || [])];
  if (!books[bookIndex]) return false;
  books[bookIndex].entries = (books[bookIndex].entries || []).filter(e => e.id !== entryId);
  await saveLorebooks(books);
  return true;
}

async function attachBookToActiveCharacter(bookId) {
  const state = getState();
  if (!state.character || !bookId) return;
  const current = Array.isArray(state.character.lorebookIds) ? state.character.lorebookIds : [];
  if (current.includes(bookId)) return;
  await saveCharacter({ ...state.character, lorebookIds: [...current, bookId] });
}
