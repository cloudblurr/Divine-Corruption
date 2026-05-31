// ui/divinity-zone.js - Public Divinity Zone repository for shared character JSONs.
import { getDivinityCatalog, setDivinityCatalog, getDivinityMeta } from '../db.js';
import { DEFAULT_JESUS_AVATAR, exportAsChubTavernJSON, saveCharacter } from '../state.js';
import { showToast } from './toast.js';

let catalog = [];
let currentQuery = '';
let currentTag = 'all';

export function initDivinityZone() {
  renderDashboardPanel();
  setupStandaloneScreen();
  window.__showDivinityZone = () => showDivinityZoneDirect();
}

export function showDivinityZoneDirect() {
  const authScreen = document.getElementById('auth-screen');
  const dzScreen = document.getElementById('divinity-zone-screen');
  if (authScreen) authScreen.classList.add('hidden');
  if (dzScreen) dzScreen.classList.remove('hidden');
  renderHub('standalone');
}

function setupStandaloneScreen() {
  const backBtn = document.getElementById('dz-back-to-auth');
  if (!backBtn) return;
  backBtn.onclick = () => {
    document.getElementById('divinity-zone-screen')?.classList.add('hidden');
    document.getElementById('auth-screen')?.classList.remove('hidden');
  };
}

function renderDashboardPanel() {
  const panel = document.getElementById('panel-divinity');
  if (!panel) return;
  panel.innerHTML = `<div id="dz-dashboard-root"></div>`;
  renderHub('dashboard');
}

async function renderHub(context) {
  const root = document.getElementById(context === 'standalone' ? 'dz-standalone-root' : 'dz-dashboard-root');
  if (!root) return;

  catalog = await getDivinityCatalog();
  root.innerHTML = `
    <section class="space-y-6">
      <div class="rounded-3xl border border-white/10 bg-white/[0.035] p-6 motion-panel">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-3xl">
            <div class="text-xs uppercase tracking-[0.3em] text-amber-400">Public Repository</div>
            <h2 class="mt-1 text-3xl font-semibold tracking-tight text-amber-100">Divinity Zone</h2>
            <p class="mt-2 text-sm leading-relaxed text-zinc-400">A shared hub for character JSONs. Upload Tavern, Chub, or engine-ready cards for public use across every instance of the app.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <input id="dz-upload-${context}" type="file" accept=".json,application/json" multiple class="hidden" />
            <button id="dz-upload-btn-${context}" class="neu-btn-primary rounded-2xl px-5 py-3 text-sm font-semibold">Upload JSONs</button>
            <button id="dz-refresh-btn-${context}" class="neu-btn rounded-2xl px-5 py-3 text-sm">Refresh</button>
          </div>
        </div>

        <div class="mt-5 grid gap-3 lg:grid-cols-[1fr_220px]">
          <input id="dz-search-${context}" class="neu-input" placeholder="Search characters, tags, settings, notes..." value="${escapeHtml(currentQuery)}" />
          <select id="dz-tag-${context}" class="neu-input">
            ${renderTagOptions()}
          </select>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-4">
        ${statCard(catalog.length, 'Public Cards')}
        ${statCard(getAllTags().length, 'Tags')}
        ${statCard(countRecent(), 'Added This Week')}
        ${statCard(formatLastUpdatedShort(), 'Last Update')}
      </div>

      <div id="dz-catalog-${context}" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"></div>
      <div id="dz-empty-${context}" class="hidden rounded-3xl border border-dashed border-white/10 bg-black/20 py-16 text-center">
        <div class="text-lg font-semibold text-amber-100">No public JSONs yet</div>
        <p class="mx-auto mt-2 max-w-md text-sm text-zinc-500">Upload character cards to start building the shared repository.</p>
      </div>
    </section>
  `;

  wireHubControls(context);
  renderCatalog(context);
  updateMetaDisplay(context);
}

function wireHubControls(context) {
  const root = document.getElementById(context === 'standalone' ? 'dz-standalone-root' : 'dz-dashboard-root');
  const input = root?.querySelector(`#dz-upload-${context}`);
  const uploadBtn = root?.querySelector(`#dz-upload-btn-${context}`);
  const refreshBtn = root?.querySelector(`#dz-refresh-btn-${context}`);
  const search = root?.querySelector(`#dz-search-${context}`);
  const tag = root?.querySelector(`#dz-tag-${context}`);

  uploadBtn.onclick = () => input?.click();
  input.onchange = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    await uploadJsonFiles(files, context);
  };

  refreshBtn.onclick = () => renderHub(context);
  search.oninput = () => {
    currentQuery = search.value.trim();
    renderCatalog(context);
  };
  tag.onchange = () => {
    currentTag = tag.value;
    renderCatalog(context);
  };
}

async function uploadJsonFiles(files, context) {
  const accepted = [];
  const failed = [];

  for (const file of files) {
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const character = normalizeHubCharacter(raw, file.name);
      accepted.push(character);
    } catch (err) {
      failed.push(file.name);
    }
  }

  if (accepted.length) {
    const existing = await getDivinityCatalog();
    const merged = mergeCatalog(existing, accepted);
    await setDivinityCatalog(merged);
    catalog = merged;
    renderHub(context);
    showToast(`${accepted.length} public character JSON${accepted.length === 1 ? '' : 's'} uploaded.`, 'success');
  }

  if (failed.length) {
    showToast(`${failed.length} upload${failed.length === 1 ? '' : 's'} failed. Check the JSON format.`, 'error');
  }
}

function normalizeHubCharacter(raw, filename = 'character.json') {
  const data = raw.data || raw;
  const name = data.name || raw.name || data.char_name || 'Unnamed Character';
  const tags = normalizeTags(data.tags || raw.tags || []);
  const idSeed = `${name}-${filename}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    _id: `public-${hashId(idSeed)}`,
    _sourceFile: filename,
    _uploadedAt: new Date().toISOString(),
    _downloads: 0,
    name,
    title: data.title || raw.title || data.creator_notes?.split('\n')?.[0]?.slice(0, 80) || 'Community Character',
    bio: data.description || raw.description || data.bio || raw.bio || data.char_persona || '',
    personality: data.personality || raw.personality || data.char_personality || '',
    systemPrompt: data.system_prompt || raw.system_prompt || data.systemPrompt || raw.systemPrompt || '',
    scenario: data.scenario || raw.scenario || data.char_scenario || '',
    first_mes: data.first_mes || raw.first_mes || data.first_message || raw.first_message || data.greeting || '',
    mes_example: data.mes_example || raw.mes_example || data.example_dialogue || raw.example_dialogue || '',
    creator_notes: data.creator_notes || raw.creator_notes || '',
    tags,
    avatar: data.avatar || raw.avatar || DEFAULT_JESUS_AVATAR,
    original: raw
  };
}

function mergeCatalog(existing, incoming) {
  const byFingerprint = new Map();
  [...incoming, ...(existing || [])].forEach(item => {
    const fingerprint = `${(item.name || '').toLowerCase()}|${(item.bio || item.description || '').slice(0, 120).toLowerCase()}`;
    if (!byFingerprint.has(fingerprint)) byFingerprint.set(fingerprint, item);
  });
  return Array.from(byFingerprint.values()).sort((a, b) => new Date(b._uploadedAt || 0) - new Date(a._uploadedAt || 0));
}

function renderCatalog(context) {
  const grid = document.getElementById(`dz-catalog-${context}`);
  const empty = document.getElementById(`dz-empty-${context}`);
  if (!grid) return;

  const filtered = getFilteredCatalog();
  grid.innerHTML = '';

  if (!filtered.length) {
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  filtered.forEach(item => {
    const card = document.createElement('article');
    card.className = 'rounded-3xl border border-white/10 bg-white/[0.035] p-5 motion-panel';
    card.innerHTML = `
      <div class="flex items-start gap-4">
        <img src="${escapeHtml(item.avatar || DEFAULT_JESUS_AVATAR)}" class="h-16 w-16 rounded-2xl object-cover ring-2 ring-white/10" alt="${escapeHtml(item.name)}" />
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-lg font-semibold text-amber-100">${escapeHtml(item.name)}</h3>
          <div class="truncate text-xs text-amber-400/75">${escapeHtml(item.title || 'Community Character')}</div>
          <div class="mt-1 text-[10px] text-zinc-500">${formatDate(item._uploadedAt)} · ${escapeHtml(item._sourceFile || 'uploaded JSON')}</div>
        </div>
      </div>
      <p class="mt-4 line-clamp-4 text-sm leading-relaxed text-zinc-300">${escapeHtml(item.bio || item.personality || 'No description included.')}</p>
      <div class="mt-4 flex flex-wrap gap-1.5">${renderTags(item.tags)}</div>
      <div class="mt-5 grid grid-cols-2 gap-2">
        <button class="dz-view neu-btn rounded-xl px-3 py-2 text-xs">View</button>
        <button class="dz-copy neu-btn rounded-xl px-3 py-2 text-xs">Copy</button>
        <button class="dz-download neu-btn rounded-xl px-3 py-2 text-xs">Download</button>
        <button class="dz-apply neu-btn-primary rounded-xl px-3 py-2 text-xs">Apply</button>
      </div>
    `;

    card.querySelector('.dz-view').onclick = () => showDetailModal(item);
    card.querySelector('.dz-copy').onclick = () => copyCharacter(item);
    card.querySelector('.dz-download').onclick = () => downloadCharacterJSON(item);
    card.querySelector('.dz-apply').onclick = async () => applyCharacter(item);
    grid.appendChild(card);
  });
}

function getFilteredCatalog() {
  const query = currentQuery.toLowerCase();
  return (catalog || []).filter(item => {
    const tags = normalizeTags(item.tags);
    const matchesTag = currentTag === 'all' || tags.includes(currentTag);
    const haystack = [
      item.name,
      item.title,
      item.bio,
      item.personality,
      item.scenario,
      item.creator_notes,
      tags.join(' ')
    ].join(' ').toLowerCase();
    return matchesTag && (!query || haystack.includes(query));
  });
}

function showDetailModal(item) {
  const modal = document.getElementById('modal-dz-detail');
  if (!modal) return;
  const content = modal.querySelector('.dz-detail-content');
  if (!content) return;

  const fields = [
    ['Biography', item.bio],
    ['Personality', item.personality],
    ['System Prompt', item.systemPrompt],
    ['Scenario', item.scenario],
    ['First Message', item.first_mes],
    ['Example Dialogue', item.mes_example],
    ['Creator Notes', item.creator_notes]
  ];

  content.innerHTML = `
    <div class="flex items-start gap-4">
      <img src="${escapeHtml(item.avatar || DEFAULT_JESUS_AVATAR)}" class="h-20 w-20 rounded-2xl object-cover ring-2 ring-white/10" alt="${escapeHtml(item.name)}" />
      <div>
        <h3 class="text-2xl font-semibold text-amber-100">${escapeHtml(item.name)}</h3>
        <div class="text-sm text-amber-400/80">${escapeHtml(item.title || 'Community Character')}</div>
        <div class="mt-2 flex flex-wrap gap-1.5">${renderTags(item.tags)}</div>
      </div>
    </div>
    <div class="mt-5 max-h-[54vh] space-y-3 overflow-y-auto pr-2">
      ${fields.map(([label, value]) => value ? `
        <section class="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div class="mb-2 text-[10px] uppercase tracking-[0.2em] text-amber-400/70">${label}</div>
          <div class="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-300">${escapeHtml(value)}</div>
        </section>
      ` : '').join('')}
    </div>
  `;

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  const closeBtn = modal.querySelector('.dz-detail-close');
  const dlBtn = modal.querySelector('.dz-detail-download');
  const applyBtn = modal.querySelector('.dz-detail-apply');
  const close = () => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    closeBtn.onclick = null;
    dlBtn.onclick = null;
    applyBtn.onclick = null;
  };

  closeBtn.onclick = close;
  dlBtn.onclick = () => downloadCharacterJSON(item);
  applyBtn.onclick = async () => { await applyCharacter(item); close(); };
  modal.onclick = (event) => { if (event.target === modal) close(); };
}

async function copyCharacter(item) {
  await navigator.clipboard.writeText(toTavernJson(item));
  showToast('Character JSON copied.', 'success');
}

function downloadCharacterJSON(item) {
  const blob = new Blob([toTavernJson(item)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(item.name || 'public-character').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Character JSON downloaded.', 'success');
}

async function applyCharacter(item) {
  await saveCharacter(toAppCharacter(item));
  document.dispatchEvent(new CustomEvent('state-refresh-requested'));
  showToast(`${item.name || 'Character'} applied.`, 'success');
}

function toTavernJson(item) {
  return item.original
    ? JSON.stringify(item.original, null, 2)
    : exportAsChubTavernJSON(toAppCharacter(item));
}

function toAppCharacter(item) {
  return {
    name: item.name || 'Unnamed Character',
    title: item.title || 'Community Character',
    bio: item.bio || '',
    personality: item.personality || '',
    systemPrompt: item.systemPrompt || '',
    scenario: item.scenario || '',
    first_mes: item.first_mes || '',
    mes_example: item.mes_example || '',
    creator_notes: item.creator_notes || '',
    tags: normalizeTags(item.tags),
    avatar: item.avatar || DEFAULT_JESUS_AVATAR,
    chat: ''
  };
}

async function updateMetaDisplay(context) {
  const metaEl = document.getElementById(context === 'standalone' ? 'dz-meta-standalone' : 'dz-meta');
  if (!metaEl) return;
  const meta = await getDivinityMeta();
  metaEl.textContent = `${meta.count || catalog.length} public JSONs`;
}

function renderTagOptions() {
  return [
    `<option value="all" ${currentTag === 'all' ? 'selected' : ''}>All tags</option>`,
    ...getAllTags().map(tag => `<option value="${escapeHtml(tag)}" ${currentTag === tag ? 'selected' : ''}>${escapeHtml(tag)}</option>`)
  ].join('');
}

function getAllTags() {
  return Array.from(new Set((catalog || []).flatMap(item => normalizeTags(item.tags)))).sort();
}

function countRecent() {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return (catalog || []).filter(item => new Date(item._uploadedAt || 0).getTime() >= weekAgo).length;
}

function formatLastUpdatedShort() {
  const newest = (catalog || []).map(item => new Date(item._uploadedAt || 0).getTime()).filter(Boolean).sort((a, b) => b - a)[0];
  return newest ? new Date(newest).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Never';
}

function statCard(value, label) {
  return `
    <div class="rounded-3xl border border-white/10 bg-black/25 p-4">
      <div class="text-2xl font-semibold text-amber-100">${escapeHtml(String(value))}</div>
      <div class="text-xs text-zinc-500">${escapeHtml(label)}</div>
    </div>
  `;
}

function renderTags(tags = []) {
  const safe = normalizeTags(tags);
  if (!safe.length) return '<span class="dz-tag">untagged</span>';
  return safe.slice(0, 8).map(tag => `<span class="dz-tag">${escapeHtml(tag)}</span>`).join('');
}

function normalizeTags(tags) {
  if (typeof tags === 'string') tags = tags.split(/[,\n]/);
  if (!Array.isArray(tags)) return [];
  return tags.map(tag => String(tag || '').trim().toLowerCase()).filter(Boolean).slice(0, 24);
}

function formatDate(value) {
  if (!value) return 'Unknown date';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function hashId(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
