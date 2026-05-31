// ui/memory.js - Eternal Memory panel
import { getState, saveMemory } from '../state.js';
import { showToast } from './toast.js';

export function initMemoryUI() {
  renderMemory();

  const clearBtn = document.getElementById('btn-clear-memory');
  if (clearBtn) {
    clearBtn.onclick = async () => {
      if (!confirm('Clear all sacred memories? This cannot be undone.')) return;
      await saveMemory([]);
      renderMemory();
      showToast('All memory has been cleared.');
    };
  }
}

function renderMemory() {
  const state = getState();
  const container = document.getElementById('memory-list');
  const empty = document.getElementById('memory-empty');

  if (!container) return;
  container.innerHTML = '';

  const memories = state.memory || [];

  if (memories.length === 0) {
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  memories.slice().reverse().forEach((mem, idx) => {
    const entry = document.createElement('div');
    entry.className = 'memory-entry rounded-3xl border border-white/10 bg-white/5 p-6';

    const date = new Date(mem.timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    entry.innerHTML = `
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1">
          <div class="font-semibold text-lg text-amber-300">${mem.title}</div>
          ${mem.node ? `<div class="text-xs text-amber-400/60 mt-0.5">from scenario: ${mem.node}</div>` : ''}
          <div class="mt-3 text-[15px] leading-relaxed text-slate-300">${mem.summary || mem.content || ''}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-xs text-slate-500">${date}</div>
          <button class="delete-mem mt-2 text-[10px] px-2 py-0.5 rounded border border-red-900/40 text-red-400 hover:bg-red-950/50">Delete</button>
        </div>
      </div>
    `;

    entry.querySelector('.delete-mem').onclick = async () => {
      const updated = state.memory.filter(m => m.id !== mem.id);
      await saveMemory(updated);
      renderMemory();
    };

    container.appendChild(entry);
  });
}