// ui/characters.js - Character dashboard / vault.
import { activateCharacter, getState, saveCharacter, saveCharacters, exportAsChubTavernJSON } from '../state.js';
import { showToast } from './toast.js';
import { switchTab } from '../main.js';

export function initCharactersUI() {
  renderCharactersDashboard();
}

function renderCharactersDashboard() {
  const panel = document.getElementById('panel-characters');
  if (!panel) return;

  const state = getState();
  const activeId = state.character?.id;
  const characters = state.characters || [];

  panel.innerHTML = `
    <div class="flex items-center justify-between gap-4 mb-6">
      <div>
        <h2 class="text-3xl font-semibold tracking-tight">Characters</h2>
        <p class="text-sm text-zinc-400">Imported and forged characters, with their saved galleries, hidden memories, and story nodes.</p>
      </div>
      <button id="btn-save-character-snapshot" class="neu-btn-primary rounded-2xl px-4 py-2 text-sm">Save Current Snapshot</button>
    </div>
    <div id="characters-grid" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3"></div>
    <div id="characters-empty" class="hidden text-center text-zinc-500 py-16">No saved characters yet.</div>
  `;

  panel.querySelector('#btn-save-character-snapshot')?.addEventListener('click', async () => {
    if (!getState().character) {
      showToast('No active character to save.', 'error');
      return;
    }
    await saveCharacter(getState().character);
    renderCharactersDashboard();
    showToast('Character snapshot saved.', 'success');
  });

  const grid = panel.querySelector('#characters-grid');
  const empty = panel.querySelector('#characters-empty');
  if (!grid) return;
  grid.innerHTML = '';

  if (!characters.length) {
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  characters.forEach(bundle => {
    const character = bundle.character || bundle;
    const isActive = character.id === activeId || bundle.id === activeId;
    const galleryCount = Array.isArray(bundle.gallery) ? bundle.gallery.length : 0;
    const memoryCount = Array.isArray(bundle.memory) ? bundle.memory.length : 0;
    const nodeCount = Array.isArray(bundle.nodes) ? bundle.nodes.length : 0;
    const loreCount = Array.isArray(character.lorebookIds) ? character.lorebookIds.length : 0;

    const card = document.createElement('div');
    card.className = `rounded-3xl border p-5 bg-white/[0.04] ${isActive ? 'border-amber-400/70' : 'border-white/10'}`;
    card.innerHTML = `
      <div class="flex items-start gap-4">
        <img src="${escapeHtml(character.avatar || 'https://i.imgur.com/rlLwlL4.jpeg')}" alt="${escapeHtml(character.name || 'Character')}" class="h-16 w-16 rounded-2xl object-cover ring-2 ring-white/10" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <div class="truncate text-lg font-semibold text-amber-100">${escapeHtml(character.name || 'Unnamed Character')}</div>
            ${isActive ? '<span class="rounded bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-zinc-950">ACTIVE</span>' : ''}
          </div>
          <div class="truncate text-xs text-amber-400/70">${escapeHtml(character.title || '')}</div>
          <div class="mt-2 line-clamp-3 text-xs leading-relaxed text-zinc-400">${escapeHtml(character.bio || character.description || 'No biography saved yet.')}</div>
        </div>
      </div>
      <div class="mt-4 grid grid-cols-4 gap-2 text-center">
        ${statCell(galleryCount, 'Gallery')}
        ${statCell(memoryCount, 'Memory')}
        ${statCell(nodeCount, 'Nodes')}
        ${statCell(loreCount, 'Lore')}
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        <button class="activate-character-btn neu-btn-primary rounded-xl px-3 py-2 text-xs ${isActive ? 'opacity-60' : ''}" ${isActive ? 'disabled' : ''}>Activate</button>
        <button class="open-profile-btn neu-btn rounded-xl px-3 py-2 text-xs">Profile</button>
        <button class="export-character-btn neu-btn rounded-xl px-3 py-2 text-xs">Export</button>
        <button class="delete-character-btn ml-auto rounded-xl border border-red-900/40 px-3 py-2 text-xs text-red-400 hover:bg-red-950/40">Delete</button>
      </div>
    `;

    card.querySelector('.activate-character-btn')?.addEventListener('click', async () => {
      const ok = await activateCharacter(bundle.id || character.id);
      if (!ok) {
        showToast('Could not activate character.', 'error');
        return;
      }
      showToast(`${character.name || 'Character'} activated.`, 'success');
      renderCharactersDashboard();
      document.dispatchEvent(new CustomEvent('state-refresh-requested'));
    });

    card.querySelector('.open-profile-btn')?.addEventListener('click', async () => {
      if (!isActive) await activateCharacter(bundle.id || character.id);
      switchTab('profile');
      document.dispatchEvent(new CustomEvent('state-refresh-requested'));
    });

    card.querySelector('.export-character-btn')?.addEventListener('click', () => {
      downloadCharacterJSON(character);
    });

    card.querySelector('.delete-character-btn')?.addEventListener('click', async () => {
      if (isActive) {
        showToast('Activate another character before deleting this one.', 'error');
        return;
      }
      if (!confirm(`Delete "${character.name || 'this character'}" from the dashboard?`)) return;
      await saveCharacters((getState().characters || []).filter(item => (item.id || item.character?.id) !== (bundle.id || character.id)));
      renderCharactersDashboard();
      showToast('Character removed from dashboard.');
    });

    grid.appendChild(card);
  });
}

function statCell(count, label) {
  return `
    <div class="rounded-xl border border-white/10 bg-black/20 px-2 py-2">
      <div class="text-sm font-semibold text-amber-200">${count}</div>
      <div class="text-[10px] text-zinc-500">${label}</div>
    </div>
  `;
}

function downloadCharacterJSON(character) {
  const blob = new Blob([exportAsChubTavernJSON(character)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(character.name || 'character').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-tavern-card.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Character exported.', 'success');
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
