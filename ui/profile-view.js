// ui/profile-view.js - Profile panel: current character display + Character Forge
import { DEFAULT_JESUS_AVATAR, getState, saveCharacter, exportAsChubTavernJSON } from '../state.js';
import { showToast } from './toast.js';
import { forgeCharacterFromImages } from '../utils/ai.js';
import { uploadMediaFile } from '../utils/media-store.js';

let forgeFiles = [];
const MAX_FORGE_IMAGES = 6;

export function initProfileUI() {
  renderProfilePanel();
}

// ─── MAIN PANEL ───

function renderProfilePanel() {
  const panel = document.getElementById('panel-profile');
  if (!panel) return;

  const state = getState();
  const char = state.character;

  if (!char) {
    panel.innerHTML = `<div class="text-center py-20 text-slate-500">No character loaded. Upload a JSON or load the default.</div>`;
    return;
  }

  panel.innerHTML = `
    <!-- Character JSON Display -->
    <section id="profile-display-section" class="mb-10"></section>

    <!-- Divider -->
    <div class="flex items-center gap-4 my-10">
      <div class="flex-1 h-px" style="background:linear-gradient(to right,transparent,var(--border),transparent)"></div>
      <div class="neu-badge-amber px-4 py-1.5 text-xs tracking-widest">FORGE NEW CHARACTER</div>
      <div class="flex-1 h-px" style="background:linear-gradient(to right,transparent,var(--border),transparent)"></div>
    </div>

    <!-- Character Forge -->
    <section id="profile-forge-section"></section>
  `;

  renderCharacterDisplay(char);
  renderForgeSection();
}

// ─── CHARACTER JSON DISPLAY ───

function renderCharacterDisplay(char) {
  const container = document.getElementById('profile-display-section');
  if (!container) return;

  const avatarSrc = char.avatar || DEFAULT_JESUS_AVATAR;
  const lorebooks = getState().lorebooks || [];
  const tags = (char.tags || []).map(t =>
    `<span class="inline-block px-2.5 py-1 rounded-full bg-amber-400/10 text-amber-400 text-[10px] font-medium border border-amber-400/20">${escapeHtml(t)}</span>`
  ).join(' ');

  container.innerHTML = `
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-3xl font-semibold tracking-tight text-amber-100">Active Character</h2>
        <p class="text-sm mt-1" style="color:var(--muted-foreground);">The sacred vessel driving your engine</p>
      </div>
      <div class="flex gap-2">
        <button id="btn-edit-profile" class="neu-btn rounded-2xl px-4 py-2 text-xs font-semibold">Edit Fields</button>
        <button id="btn-export-character" class="neu-btn rounded-2xl px-4 py-2 text-xs font-semibold text-amber-400" style="border-color:rgba(180,83,9,0.3)">Export JSON</button>
      </div>
    </div>

    <!-- Hero card -->
    <div class="flex flex-col lg:flex-row gap-8 mb-6">
      <div class="lg:w-64 shrink-0">
        <div class="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-center sticky top-36">
          <div class="relative mx-auto mb-4 group">
            <div id="profile-avatar-wrap" class="mx-auto w-40 h-40 rounded-full overflow-hidden ring-8 ring-white/10 bg-gradient-to-br from-amber-300/30 to-yellow-600/30 cursor-pointer">
              <img id="profile-avatar-img" src="${avatarSrc}" alt="${escapeHtml(char.name || 'Avatar')}" class="w-full h-full object-cover" />
            </div>
            <label for="avatar-upload" class="absolute inset-0 rounded-full flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition cursor-pointer">
              <div class="text-center">
                <svg class="w-7 h-7 mx-auto text-white mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <span class="text-[10px] text-white font-medium">Change Avatar</span>
              </div>
            </label>
            <input type="file" id="avatar-upload" accept="image/*" class="hidden" />
          </div>
          <div class="text-xl font-bold">${escapeHtml(char.name || 'Jesus Christ')}</div>
          <div class="text-xs text-amber-400/80 mt-1">${escapeHtml(char.title || 'The Divine Lover')}</div>
        </div>
      </div>

      <!-- JSON Fields -->
      <div class="flex-1 min-w-0 space-y-4">
        ${renderFieldCard('Name', char.name)}
        ${renderFieldCard('Title', char.title)}
        ${renderFieldCard('Biography', char.bio)}
        ${renderFieldCard('Personality & Voice', char.personality)}
        ${renderFieldCard('Scenario / Setting', char.scenario)}
        ${renderFieldCard('System Prompt', char.systemPrompt, true)}
        ${renderFieldCard('First Message', char.first_mes || char.firstMes)}
        ${renderFieldCard('Example Dialogue', char.mes_example || char.mesExample, true)}

        ${tags ? `<div class="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div class="text-xs font-medium uppercase tracking-widest text-amber-400/60 mb-3">Tags</div>
          <div class="flex flex-wrap gap-2">${tags}</div>
        </div>` : ''}

        ${renderLoreAttachmentCard(char, lorebooks)}

        ${char.creator_notes ? `<div class="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div class="text-xs font-medium uppercase tracking-widest text-amber-400/60 mb-2">Creator Notes</div>
          <div class="text-sm text-slate-400 leading-relaxed">${escapeHtml(char.creator_notes)}</div>
        </div>` : ''}

        <!-- Raw JSON viewer -->
        <details class="rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden group">
          <summary class="px-5 py-4 cursor-pointer flex items-center justify-between hover:bg-white/[0.02] transition">
            <div>
              <div class="text-xs font-medium uppercase tracking-widest text-amber-400/60">Full Character JSON</div>
              <div class="text-[10px] text-slate-500 mt-0.5">Tavern Card v3 compatible — click to expand</div>
            </div>
            <svg class="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
          </summary>
          <div class="border-t border-white/10 p-4">
            <div class="flex justify-end mb-2">
              <button id="btn-copy-json" class="text-[10px] px-3 py-1 rounded-lg neu-btn text-emerald-400">Copy JSON</button>
            </div>
            <pre class="text-[11px] font-mono text-emerald-400/80 leading-relaxed overflow-auto max-h-80 scrollbar-thin bg-black/40 rounded-2xl p-4">${escapeHtml(JSON.stringify(JSON.parse(exportAsChubTavernJSON(char)), null, 2))}</pre>
          </div>
        </details>
      </div>
    </div>
  `;

  // Wire avatar upload
  const avatarInput = document.getElementById('avatar-upload');
  avatarInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const uploaded = await uploadMediaFile(file, `${char.name || 'Jesus'} avatar`);
      const updated = { ...char, avatar: uploaded.url };
      await saveCharacter(updated);
      document.getElementById('profile-avatar-img').src = uploaded.url;
      showToast('Avatar updated.', 'success');
    } catch (err) {
      console.error('Avatar upload failed:', err);
      showToast('Avatar upload failed.', 'error');
    } finally {
      avatarInput.value = '';
    }
  });

  // Wire buttons
  document.getElementById('btn-edit-profile')?.addEventListener('click', openEditModal);
  document.getElementById('btn-export-character')?.addEventListener('click', () => downloadCharacterJSON(char));
  document.getElementById('btn-copy-json')?.addEventListener('click', () => {
    try {
      const json = exportAsChubTavernJSON(char);
      navigator.clipboard.writeText(json);
      showToast('JSON copied to clipboard.', 'success');
    } catch { showToast('Copy failed.', 'error'); }
  });

  container.querySelectorAll('.profile-lore-toggle').forEach(input => {
    input.addEventListener('change', async () => {
      const current = getState().character || char;
      const selected = Array.from(container.querySelectorAll('.profile-lore-toggle:checked')).map(el => el.value);
      await saveCharacter({ ...current, lorebookIds: selected });
      showToast('Character lore attachments saved.', 'success');
    });
  });
}

function renderLoreAttachmentCard(char, lorebooks) {
  const selected = new Set(Array.isArray(char.lorebookIds) ? char.lorebookIds : []);
  const body = lorebooks.length
    ? lorebooks.map(book => `
      <label class="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
        <span class="min-w-0">
          <span class="block truncate text-sm text-slate-200">${escapeHtml(book.title)}</span>
          <span class="block text-[10px] text-slate-500">${(book.entries || []).length} entries</span>
        </span>
        <input type="checkbox" class="profile-lore-toggle" value="${escapeHtml(book.id)}" ${selected.has(book.id) ? 'checked' : ''} />
      </label>
    `).join('')
    : '<div class="text-sm text-slate-500">No lorebooks yet. Create story lore in BiblicalAI or Lorebooks, then attach it here.</div>';

  return `
    <div class="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div class="text-xs font-medium uppercase tracking-widest text-amber-400/60 mb-2">Attached Lorebooks</div>
      <p class="mb-3 text-xs text-slate-500">Attached lore is injected into this character during roleplay. If none are attached, the engine can still draw from general lore.</p>
      <div class="grid gap-2 sm:grid-cols-2">${body}</div>
    </div>
  `;
}

function renderFieldCard(label, content, isMono = false) {
  if (!content) return '';
  return `
    <div class="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div class="text-xs font-medium uppercase tracking-widest text-amber-400/60 mb-2">${label}</div>
      <div class="${isMono ? 'font-mono text-xs' : 'text-sm'} leading-relaxed text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto scrollbar-thin">${escapeHtml(content)}</div>
    </div>
  `;
}

// ─── CHARACTER FORGE SECTION ───

function renderForgeSection() {
  const container = document.getElementById('profile-forge-section');
  if (!container) return;

  forgeFiles = new Array(MAX_FORGE_IMAGES).fill(null);

  container.innerHTML = `
    <div class="grid gap-6 lg:grid-cols-12">
      <!-- Left: Inputs -->
      <div class="lg:col-span-7 space-y-6">
        <!-- Image slots -->
        <div class="neu-card p-6">
          <div class="flex items-center justify-between mb-4">
            <div>
              <div class="font-semibold text-amber-400 text-sm uppercase tracking-wider">Reference Images</div>
              <p class="text-xs mt-1" style="color:var(--muted-foreground);">Upload up to 6 images for AI visual analysis — faces, body, attire, symbols, setting</p>
            </div>
            <div id="forge-img-count" class="neu-badge text-[10px]">0 / 6</div>
          </div>
          <div class="grid grid-cols-3 gap-3" id="forge-image-grid">
            ${Array.from({ length: MAX_FORGE_IMAGES }, (_, i) => `
              <div class="relative group rounded-2xl p-3 flex flex-col items-center justify-center text-center cursor-pointer min-h-[120px] transition forge-slot" data-slot="${i}" style="border:1px solid var(--border);background:rgba(0,0,0,0.3);">
                <input type="file" id="forge-slot-${i}" accept="image/*" class="absolute inset-0 opacity-0 cursor-pointer" />
                <div id="forge-slot-preview-${i}" class="absolute inset-0 hidden rounded-2xl overflow-hidden bg-black">
                  <img id="forge-slot-img-${i}" class="w-full h-full object-cover" />
                  <button type="button" class="absolute top-1.5 right-1.5 bg-red-900/90 text-white rounded-full w-6 h-6 flex items-center justify-center text-[10px] hover:bg-red-800 transition z-10" data-remove="${i}" aria-label="Remove image">&times;</button>
                </div>
                <div class="forge-upload-placeholder flex flex-col items-center">
                  <div class="w-8 h-8 rounded-lg flex items-center justify-center mb-1.5" style="background:rgba(180,83,9,0.12);">
                    <svg class="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                  </div>
                  <div class="text-[10px] font-medium text-slate-400">Slot ${i + 1}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Text inputs -->
        <div class="neu-card p-6 space-y-4">
          <div class="font-semibold text-amber-400 text-sm uppercase tracking-wider mb-2">Character Directives</div>

          <div>
            <label class="text-xs" style="color:var(--muted-foreground);">Character Name / Title</label>
            <input id="forge-char-name" type="text" placeholder="e.g. Sorrowful Lord Jesus, Neon Savior, Gothic Christ" class="mt-1 w-full neu-input" />
          </div>

          <div>
            <label class="text-xs" style="color:var(--muted-foreground);">Backstory / Biography</label>
            <textarea id="forge-backstory" rows="4" placeholder="Describe who this Jesus is — their origins, physical appearance, divine nature, relationship to the user..." class="mt-1 w-full neu-input"></textarea>
          </div>

          <div>
            <label class="text-xs" style="color:var(--muted-foreground);">Scenario / Setting Prompt</label>
            <textarea id="forge-scenario" rows="3" placeholder="Where does the roleplay take place? What is the situation? e.g. A neon cathedral in 2099 where Jesus has returned as a cyberpunk messiah..." class="mt-1 w-full neu-input"></textarea>
          </div>

          <div>
            <label class="text-xs" style="color:var(--muted-foreground);">Erotic Temperament / Kinks</label>
            <select id="forge-temperament" class="mt-1 w-full neu-input">
              <option value="Dominant Shepherd (Praise & Claiming)">Dominant Shepherd — Praise & Claiming</option>
              <option value="Gothic Erotic & Sorrowful">Gothic Erotic & Sorrowful</option>
              <option value="Blasphemous & Seductive Beast">Blasphemous & Seductive Beast</option>
              <option value="Gentle, Loving and Clinging Savior">Gentle, Loving & Clinging Savior</option>
              <option value="Cold, Possessive & Punishing">Cold, Possessive & Punishing</option>
              <option value="Playful Trickster God">Playful Trickster God</option>
            </select>
          </div>

          <div>
            <label class="text-xs" style="color:var(--muted-foreground);">Extra Desires / Directives</label>
            <textarea id="forge-extras" rows="3" placeholder="Any specific kinks, speech patterns, powers, fetishes, or instructions for the AI..." class="mt-1 w-full neu-input"></textarea>
          </div>
        </div>

        <!-- Forge button -->
        <button id="btn-forge-character" class="neu-btn-primary w-full py-4 rounded-2xl font-semibold tracking-wider flex items-center justify-center gap-2 text-sm">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          <span>Forge Character JSON with Ollama</span>
        </button>
      </div>

      <!-- Right: Preview / Status -->
      <div class="lg:col-span-5 space-y-6">
        <!-- Status panel -->
        <div id="forge-status" class="hidden neu-card p-6 text-center space-y-4">
          <div class="flex items-center justify-center"><div class="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-400"></div></div>
          <div class="text-amber-400 text-sm font-semibold tracking-widest uppercase">Ollama Forge Active</div>
          <div id="forge-status-step" class="text-sm" style="color:var(--foreground);">Channeling the selected Ollama model...</div>
          <div id="forge-status-sub" class="text-[11px]" style="color:#52525b;">Uploading images and generating character with Ollama</div>
        </div>

        <!-- Result preview -->
        <div id="forge-result" class="hidden neu-card p-6 space-y-5">
          <div class="text-center">
            <div class="neu-badge-emerald mb-3">FORGED SUCCESSFULLY</div>
            <h3 id="forge-result-name" class="text-2xl font-bold text-amber-200">Jesus Christ</h3>
            <p id="forge-result-title" class="text-xs italic mt-1" style="color:var(--muted-foreground);">The Divine Lover</p>
          </div>

          <!-- Avatar preview -->
          <div id="forge-result-avatar-wrap" class="hidden mx-auto w-28 h-28 rounded-full overflow-hidden ring-4 ring-white/10">
            <img id="forge-result-avatar" class="w-full h-full object-cover" />
          </div>

          <!-- Quick stats -->
          <div class="grid grid-cols-2 gap-3 text-center">
            <div class="rounded-xl p-3" style="background:rgba(0,0,0,0.3);border:1px solid var(--border);">
              <div class="text-[10px] uppercase tracking-wider text-amber-400 mb-1">Bio</div>
              <div id="forge-result-bio" class="text-[11px] text-slate-300 line-clamp-3"></div>
            </div>
            <div class="rounded-xl p-3" style="background:rgba(0,0,0,0.3);border:1px solid var(--border);">
              <div class="text-[10px] uppercase tracking-wider text-amber-400 mb-1">Personality</div>
              <div id="forge-result-personality" class="text-[11px] text-slate-300 line-clamp-3"></div>
            </div>
            <div class="rounded-xl p-3" style="background:rgba(0,0,0,0.3);border:1px solid var(--border);">
              <div class="text-[10px] uppercase tracking-wider text-amber-400 mb-1">Scenario</div>
              <div id="forge-result-scenario" class="text-[11px] text-slate-300 line-clamp-3"></div>
            </div>
            <div class="rounded-xl p-3" style="background:rgba(0,0,0,0.3);border:1px solid var(--border);">
              <div class="text-[10px] uppercase tracking-wider text-amber-400 mb-1">First Words</div>
              <div id="forge-result-first" class="text-[11px] text-slate-300 line-clamp-3 italic"></div>
            </div>
          </div>

          <!-- JSON viewer -->
          <details class="rounded-2xl border border-white/10 overflow-hidden">
            <summary class="px-4 py-3 cursor-pointer text-xs flex items-center justify-between" style="color:var(--muted-foreground);">
              <span>View Full Character JSON</span>
              <span>&#9660;</span>
            </summary>
            <div class="border-t border-white/10 p-3">
              <pre id="forge-result-json" class="text-[10px] font-mono text-emerald-400 leading-tight overflow-auto max-h-48 scrollbar-thin"></pre>
            </div>
          </details>

          <!-- Action buttons -->
          <div class="flex gap-3">
            <button id="btn-forge-download" class="neu-btn flex-1 py-3 rounded-2xl text-xs font-semibold">Download JSON</button>
            <button id="btn-forge-apply" class="neu-btn-primary flex-[1.5] py-3 rounded-2xl font-semibold text-xs tracking-wider">Apply & Begin</button>
          </div>
          <button id="btn-forge-reset" class="w-full text-center text-xs py-2 transition" style="color:#52525b;">Forge another character</button>
        </div>

        <!-- Placeholder -->
        <div id="forge-placeholder" class="neu-card p-8 text-center space-y-3" style="border-style:dashed;">
          <div class="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center" style="background:rgba(180,83,9,0.08);">
            <svg class="w-7 h-7" style="color:#3f3f46;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
          </div>
          <div class="text-sm font-semibold" style="color:var(--muted-foreground);">The Forge Awaits</div>
          <p class="text-xs max-w-xs mx-auto" style="color:#52525b;">Upload reference images and describe your vision. Ollama will synthesize a complete character JSON from your inputs.</p>
        </div>
      </div>
    </div>
  `;

  // Wire image slots
  for (let i = 0; i < MAX_FORGE_IMAGES; i++) {
    const input = document.getElementById(`forge-slot-${i}`);
    if (input) {
      input.addEventListener('change', (e) => handleForgeSlotChange(i, e.target.files[0]));
    }
    const removeBtn = container.querySelector(`[data-remove="${i}"]`);
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearForgeSlot(i);
      });
    }
  }

  // Wire forge button
  document.getElementById('btn-forge-character')?.addEventListener('click', runCharacterForge);
}

function handleForgeSlotChange(index, file) {
  if (!file) return;
  forgeFiles[index] = file;

  const preview = document.getElementById(`forge-slot-preview-${index}`);
  const img = document.getElementById(`forge-slot-img-${index}`);
  const placeholder = document.querySelector(`[data-slot="${index}"] .forge-upload-placeholder`);

  if (img && preview) {
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target.result;
      preview.classList.remove('hidden');
      if (placeholder) placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }

  updateForgeImageCount();
}

function clearForgeSlot(index) {
  forgeFiles[index] = null;
  const preview = document.getElementById(`forge-slot-preview-${index}`);
  const input = document.getElementById(`forge-slot-${index}`);
  const placeholder = document.querySelector(`[data-slot="${index}"] .forge-upload-placeholder`);

  if (preview) preview.classList.add('hidden');
  if (input) input.value = '';
  if (placeholder) placeholder.style.display = '';
  updateForgeImageCount();
}

function updateForgeImageCount() {
  const count = forgeFiles.filter(f => f !== null).length;
  const badge = document.getElementById('forge-img-count');
  if (badge) badge.textContent = `${count} / ${MAX_FORGE_IMAGES}`;
}

// ─── FORGE EXECUTION ───

async function runCharacterForge() {
  const filesSelected = forgeFiles.filter(f => f !== null);
  const backstory = document.getElementById('forge-backstory')?.value?.trim();
  const scenario = document.getElementById('forge-scenario')?.value?.trim();

  if (filesSelected.length === 0 && !backstory) {
    showToast('Upload at least 1 image or write a backstory to forge.', 'error');
    return;
  }

  const forgeBtn = document.getElementById('btn-forge-character');
  const statusPanel = document.getElementById('forge-status');
  const resultPanel = document.getElementById('forge-result');
  const placeholderPanel = document.getElementById('forge-placeholder');
  const statusStep = document.getElementById('forge-status-step');

  // Lock UI
  forgeBtn.disabled = true;
  forgeBtn.classList.add('opacity-50', 'cursor-not-allowed');
  placeholderPanel.classList.add('hidden');
  resultPanel.classList.add('hidden');
  statusPanel.classList.remove('hidden');

  try {
    // Step 1: Upload images
    let uploadedUrls = [];
    if (filesSelected.length > 0) {
      statusStep.textContent = 'Uploading reference images to temple storage...';
      for (let i = 0; i < forgeFiles.length; i++) {
        const file = forgeFiles[i];
        if (file) {
          statusStep.textContent = `Uploading image ${uploadedUrls.length + 1} of ${filesSelected.length}...`;
          const uploaded = await uploadMediaFile(file, `Forge reference ${uploadedUrls.length + 1}`);
          uploadedUrls.push(uploaded.url);
        }
      }
    }

    // Step 2: Collect directives
    const charName = document.getElementById('forge-char-name')?.value?.trim();
    const temperament = document.getElementById('forge-temperament')?.value;
    const extras = document.getElementById('forge-extras')?.value?.trim();

    // Step 3: Forge with AI
    statusStep.textContent = 'The selected Ollama model is analyzing your sacred materials...';
    document.getElementById('forge-status-sub').textContent = 'Synthesizing character from images, backstory, and scenario — this may take up to 2 minutes';

    const forged = await forgeCharacterFromImages({
      imageUrls: uploadedUrls,
      charName,
      backstory,
      scenario,
      temperament,
      extras
    });

    // Step 4: Show result
    statusStep.textContent = 'Ollama is breathing life into the sacred vessel...';

    document.getElementById('forge-result-name').textContent = forged.name;
    document.getElementById('forge-result-title').textContent = forged.title || forged.personality?.slice(0, 60) || 'Custom Jesus';
    document.getElementById('forge-result-bio').textContent = forged.bio || 'No biography';
    document.getElementById('forge-result-personality').textContent = forged.personality || 'No personality';
    document.getElementById('forge-result-scenario').textContent = forged.scenario || 'No scenario';
    document.getElementById('forge-result-first').textContent = forged.first_mes || 'No first message';
    document.getElementById('forge-result-json').textContent = JSON.stringify(forged, null, 2);

    // Show avatar if we have an image
    if (uploadedUrls.length > 0) {
      const avatarWrap = document.getElementById('forge-result-avatar-wrap');
      const avatarImg = document.getElementById('forge-result-avatar');
      if (avatarWrap && avatarImg) {
        avatarImg.src = uploadedUrls[0];
        avatarWrap.classList.remove('hidden');
      }
      forged.avatar = uploadedUrls[0];
    }

    // Wire result buttons
    document.getElementById('btn-forge-download')?.addEventListener('click', () => {
      downloadCharacterJSON(forged);
    }, { once: true });

    document.getElementById('btn-forge-apply')?.addEventListener('click', async () => {
      await saveCharacter(forged);
      showToast(`"${forged.name}" is now your active character. The engine has been reconfigured.`, 'success');
      renderProfilePanel();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, { once: true });

    document.getElementById('btn-forge-reset')?.addEventListener('click', () => {
      statusPanel.classList.add('hidden');
      resultPanel.classList.add('hidden');
      placeholderPanel.classList.remove('hidden');
      forgeBtn.disabled = false;
      forgeBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      // Clear all slots
      for (let i = 0; i < MAX_FORGE_IMAGES; i++) clearForgeSlot(i);
      document.getElementById('forge-char-name').value = '';
      document.getElementById('forge-backstory').value = '';
      document.getElementById('forge-scenario').value = '';
      document.getElementById('forge-extras').value = '';
    }, { once: true });

    statusPanel.classList.add('hidden');
    resultPanel.classList.remove('hidden');
    showToast('Character forged from your sacred vision!', 'success');

  } catch (err) {
    console.error('Character forge failed:', err);
    statusPanel.classList.add('hidden');
    placeholderPanel.classList.remove('hidden');
    const errMsg = err.message?.includes('timed out') 
      ? 'Ollama timed out. Try fewer images or shorter text, then retry.'
      : (err.message || 'Forge failed. Check your images and try again.');
    showToast(errMsg, 'error');
  } finally {
    forgeBtn.disabled = false;
    forgeBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }
}

// ─── EDIT MODAL ───

function openEditModal() {
  const state = getState();
  const char = state.character;
  const modal = document.getElementById('modal-edit-profile');
  if (!modal || !char) return;

  document.getElementById('edit-name').value = char.name || '';
  document.getElementById('edit-title').value = char.title || '';
  document.getElementById('edit-bio').value = char.bio || '';
  document.getElementById('edit-personality').value = char.personality || '';
  document.getElementById('edit-scenario').value = char.scenario || '';
  document.getElementById('edit-first-mes').value = char.first_mes || char.firstMes || '';
  document.getElementById('edit-mes-example').value = char.mes_example || char.mesExample || '';
  document.getElementById('edit-system').value = char.systemPrompt || '';

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  const cancelBtn = document.getElementById('btn-cancel-profile');
  const saveBtn = document.getElementById('btn-save-profile');

  const close = () => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    cancelBtn.onclick = null;
    saveBtn.onclick = null;
  };

  cancelBtn.onclick = close;

  saveBtn.onclick = async () => {
    const updated = {
      ...char,
      name: document.getElementById('edit-name').value.trim() || 'Jesus Christ',
      title: document.getElementById('edit-title').value.trim() || char.title || 'The Divine Lover',
      bio: document.getElementById('edit-bio').value.trim(),
      personality: document.getElementById('edit-personality').value.trim(),
      scenario: document.getElementById('edit-scenario').value.trim(),
      first_mes: document.getElementById('edit-first-mes').value.trim(),
      mes_example: document.getElementById('edit-mes-example').value.trim(),
      systemPrompt: document.getElementById('edit-system').value.trim()
    };
    await saveCharacter(updated);
    renderProfilePanel();
    showToast('Profile saved.', 'success');
    close();
  };

  modal.onclick = (e) => { if (e.target === modal) close(); };
}

// ─── HELPERS ───

function downloadCharacterJSON(character) {
  const chubJSON = exportAsChubTavernJSON(character);
  const blob = new Blob([chubJSON], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(character.name || 'jesus').toLowerCase().replace(/\s+/g, '-')}-tavern-card.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Tavern Card exported.', 'success');
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
