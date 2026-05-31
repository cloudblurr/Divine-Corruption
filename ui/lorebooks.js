// ui/lorebooks.js - Lorebooks with BiblicalAI integration & entry management
import { getState, saveLorebooks } from '../state.js';
import { showToast } from './toast.js';
import { generateLore } from '../utils/ai.js';
import { getPendingLore, deleteLoreEntry, onLoreChange } from '../services/lore-service.js';

const t = (key) => window.miniappI18n?.t(key) ?? key;

export function initLorebooksUI() {
  renderLorebooks();

  const newBtn = document.getElementById('btn-new-lorebook');
  if (newBtn) newBtn.onclick = createNewLorebook;

  onLoreChange(() => renderLorebooks());
}

function renderLorebooks() {
  const state = getState();
  const container = document.getElementById('lorebooks-list');
  const empty = document.getElementById('lorebooks-empty');
  if (!container) return;

  container.innerHTML = '';
  const books = state.lorebooks || [];
  const pendingCount = getPendingLore().length;

  if (books.length === 0 && pendingCount === 0) {
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  // Pending lore banner
  if (pendingCount > 0) {
    const banner = document.createElement('div');
    banner.className = 'rounded-2xl p-4 mb-4 flex items-center justify-between gap-4';
    banner.style.cssText = 'background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);';
    banner.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <span class="text-emerald-400 text-sm font-bold">${pendingCount}</span>
        </div>
        <div>
          <div class="text-sm font-medium text-emerald-300">${pendingCount} Pending Lore Card${pendingCount > 1 ? 's' : ''}</div>
          <div class="text-[11px] text-emerald-400/60">From BiblicalAI or auto-extracted from chat</div>
        </div>
      </div>
      <button id="btn-go-biblicalai" class="neu-btn rounded-xl px-4 py-2 text-xs font-semibold text-emerald-400" style="border-color:rgba(16,185,129,0.3);">Review in BiblicalAI</button>
    `;
    container.appendChild(banner);
    banner.querySelector('#btn-go-biblicalai').onclick = () => {
      const nav = document.querySelector('[data-tab="biblicalai"]');
      if (nav) nav.click();
    };
  }

  books.forEach((book, index) => {
    const card = document.createElement('div');
    card.className = 'lorebook-card rounded-3xl border border-white/10 bg-white/5 p-6';

    const entries = book.entries || [];

    card.innerHTML = `
      <div class="flex justify-between items-start gap-4">
        <div class="min-w-0">
          <div class="font-semibold text-xl">${escapeHtml(book.title)}</div>
          <div class="text-xs text-amber-400/70 mt-0.5">${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}</div>
        </div>
        <div class="flex gap-2 shrink-0">
          <button class="brainstorm-btn text-xs px-3 py-1.5 rounded-xl border border-emerald-400/30 text-emerald-400 hover:bg-emerald-950/40 transition font-medium">+ LoreAI</button>
          <button class="delete-book-btn text-xs px-3 py-1.5 rounded-xl text-red-400 hover:bg-red-950/40 border border-red-900/30 transition">Delete</button>
        </div>
      </div>

      <div class="mt-5 space-y-3">
        ${entries.length > 0 ? entries.map((entry, eIdx) => `
          <div class="lore-entry group border-l-2 border-amber-400/30 pl-3 py-1 relative">
            <div class="flex items-start justify-between gap-2">
              <div class="flex-1 min-w-0">
                <div class="font-medium text-amber-300">${escapeHtml(entry.title)}</div>
                <div class="text-slate-400 mt-0.5 leading-snug text-sm">${escapeHtml(entry.content || '')}</div>
                ${entry.source ? `<div class="text-[10px] text-amber-400/40 mt-1">source: ${escapeHtml(entry.source)}</div>` : ''}
              </div>
              <button class="delete-entry-btn opacity-0 group-hover:opacity-100 transition shrink-0 text-[10px] px-2 py-0.5 rounded-lg border border-red-900/40 text-red-400 hover:bg-red-950/50" data-book="${index}" data-entry="${eIdx}" title="Delete entry">✕</button>
            </div>
          </div>
        `).join('') : '<div class="text-sm text-slate-500 italic">No entries yet. Use LoreAI to generate wisdom or approve cards from BiblicalAI.</div>'}
      </div>
    `;

    // Brainstorm button
    card.querySelector('.brainstorm-btn').onclick = () => openBrainstormModal(book, index);

    // Delete book
    card.querySelector('.delete-book-btn').onclick = async () => {
      if (!confirm(`Delete "${book.title}" and all its entries?`)) return;
      const updated = state.lorebooks.filter((_, i) => i !== index);
      await saveLorebooks(updated);
      renderLorebooks();
      showToast('Lorebook deleted.');
    };

    // Delete individual entries
    card.querySelectorAll('.delete-entry-btn').forEach(btn => {
      btn.onclick = async () => {
        const bookIdx = parseInt(btn.dataset.book);
        const entryId = entries[parseInt(btn.dataset.entry)]?.id;
        if (!entryId) return;
        if (!confirm('Delete this lore entry?')) return;
        await deleteLoreEntry(bookIdx, entryId);
        renderLorebooks();
        showToast('Lore entry deleted.');
      };
    });

    container.appendChild(card);
  });
}

function createNewLorebook() {
  const title = prompt('Name this lorebook (e.g. "Parables of the Kingdom")');
  if (!title || !title.trim()) return;

  const state = getState();
  const newBook = {
    id: 'lb-' + Date.now(),
    title: title.trim(),
    entries: [],
    createdAt: Date.now()
  };

  const updated = [...(state.lorebooks || []), newBook];
  saveLorebooks(updated).then(() => {
    renderLorebooks();
    showToast('New lorebook created.');
  });
}

function openBrainstormModal(book, bookIndex) {
  const modal = document.getElementById('modal-lorebrain');
  if (!modal) return;

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  const topicInput = document.getElementById('lore-topic');
  const select = document.getElementById('lorebook-select');
  const cancelBtn = document.getElementById('btn-cancel-brain');
  const generateBtn = document.getElementById('btn-do-brainstorm');

  // Populate select with all lorebooks
  const state = getState();
  select.innerHTML = '';
  state.lorebooks.forEach((b, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${b.title} (${(b.entries || []).length} entries)`;
    if (i === bookIndex) opt.selected = true;
    select.appendChild(opt);
  });

  topicInput.value = '';

  const close = () => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  };

  cancelBtn.onclick = close;

  generateBtn.onclick = async () => {
    const topic = topicInput.value.trim();
    if (!topic) {
      showToast('Enter a topic for LoreAI.', 'error');
      return;
    }

    generateBtn.disabled = true;
    const origText = generateBtn.textContent;
    generateBtn.textContent = 'Channeling sacred wisdom...';

    const targetIndex = parseInt(select.value);
    const entries = await generateLore(topic, state.lorebooks[targetIndex].title);

    if (entries.length) {
      const updatedBooks = [...state.lorebooks];
      updatedBooks[targetIndex].entries = [
        ...(updatedBooks[targetIndex].entries || []),
        ...entries.map(e => ({
          id: 'lore-' + Date.now() + Math.random().toString(36).slice(2, 7),
          ...e,
          source: 'LoreAI',
          timestamp: Date.now()
        }))
      ];

      await saveLorebooks(updatedBooks);
      renderLorebooks();
      showToast(`LoreAI added ${entries.length} entries to "${updatedBooks[targetIndex].title}".`, 'success');
      close();
    } else {
      showToast('LoreAI could not generate entries. Try a different topic.', 'error');
    }

    generateBtn.disabled = false;
    generateBtn.textContent = origText;
  };

  modal.onclick = (e) => { if (e.target === modal) close(); };
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
