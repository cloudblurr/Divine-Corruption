// ui/biblicalai.js - BiblicalAI: Story lore agent with full lore management
// Chat + generate structured lore cards + lorebook picker + approve/deny/edit flow
import { exportAsChubTavernJSON, getState, saveCharacter, saveGallery } from '../state.js';
import { showToast } from './toast.js';
import { ROLEPLAY_MODEL_ID, callTextModel, forgeCharacterWithGrok } from '../utils/ai.js';
import { DEFAULT_PUTER_MODEL_ID, PUTER_GROK_MODELS } from '../utils/puter.js';
import { uploadMediaFile } from '../utils/media-store.js';
import {
  getPendingLore, addPendingLore, removePendingLore, updatePendingLore,
  clearPendingLore, approveLoreToBook, approveAllToBook, createLorebookAndApprove,
  onLoreChange
} from '../services/lore-service.js';

let biblicalMessages = [];
let forgeFiles = new Array(6).fill(null);
let lastForgedCharacter = null;

export function initBiblicalAI() {
  const container = document.getElementById('panel-biblicalai');
  if (!container) return;

  const messagesEl = document.getElementById('biblicalai-messages');
  const input = document.getElementById('biblicalai-input');
  const sendBtn = document.getElementById('btn-biblicalai-send');

  if (!messagesEl || !input || !sendBtn) return;

  if (biblicalMessages.length === 0) {
    biblicalMessages.push({
      role: 'assistant',
      content: "I am BiblicalAI, your story lore engine. Ask for locations, rituals, factions, histories, relationships, mysteries, or scene consequences, and I will create lore cards you can approve into lorebooks."
    });
    renderBiblicalMessages(messagesEl);
  }

  document.querySelectorAll('.lore-seed-btn').forEach(btn => {
    btn.onclick = () => {
      input.value = `Generate story-rich lore about: ${btn.dataset.topic}`;
      sendBiblicalMessage();
    };
  });

  const sendBiblicalMessage = async () => {
    const text = input.value.trim();
    if (!text) return;

    biblicalMessages.push({ role: 'user', content: text });
    renderBiblicalMessages(messagesEl);
    input.value = '';
    sendBtn.disabled = true;

    const thinking = document.createElement('div');
    thinking.className = 'text-emerald-400 text-xs italic px-2 py-1';
    thinking.textContent = 'BiblicalAI is shaping story lore...';
    messagesEl.appendChild(thinking);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
      const settings = getState().settings || {};
      const biblicalSystemMsg = buildBiblicalSystemPrompt();

      const responseText = await callTextModel({
        modelId: settings.roleplayModelId || ROLEPLAY_MODEL_ID,
        messages: [
          { role: 'system', content: biblicalSystemMsg },
          { role: 'user', content: buildBiblicalUserPrompt(text) }
        ],
        settings,
        timeoutMs: 60000
      });

      biblicalMessages.push({ role: 'assistant', content: responseText || "The visions are clouded, beloved. Try again." });
      renderBiblicalMessages(messagesEl);

      const newEntries = parseLoreFromResponse(responseText || '');
      if (newEntries.length > 0) {
        newEntries.forEach(entry => addPendingLore({ ...entry, source: 'BiblicalAI' }));
        showToast(`${newEntries.length} lore card${newEntries.length > 1 ? 's' : ''} ready for review.`, 'success');
      }
    } catch (err) {
      biblicalMessages.push({ role: 'assistant', content: "The divine channel is noisy. Speak again, seeker." });
      renderBiblicalMessages(messagesEl);
    } finally {
      if (thinking.parentNode) thinking.remove();
      sendBtn.disabled = false;
      input.focus();
    }
  };

  sendBtn.onclick = sendBiblicalMessage;
  input.addEventListener('keypress', e => {
    if (e.key === 'Enter') { e.preventDefault(); sendBiblicalMessage(); }
  });

  document.getElementById('btn-approve-all-lore')?.addEventListener('click', handleApproveAll);
  renderCharacterForge();

  onLoreChange(() => {
    renderPendingLore();
    updateApproveAllBtn();
    updateLoreBadge();
  });
  renderPendingLore();
  updateApproveAllBtn();
  updateLoreBadge();
}

// Character Forge

function renderCharacterForge() {
  const host = document.getElementById('biblicalai-forge-host');
  if (!host) return;

  const settings = getState().settings || {};
  const currentModel = settings.roleplayModelId?.startsWith('puter:') ? settings.roleplayModelId : DEFAULT_PUTER_MODEL_ID;
  forgeFiles = new Array(6).fill(null);
  lastForgedCharacter = null;

  host.innerHTML = `
    <section class="motion-panel rounded-3xl border border-white/10 bg-white/[0.035] p-5">
      <div class="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-amber-400">BiblicalAI Forge</div>
          <h3 class="mt-1 text-2xl font-semibold text-amber-100">Character Forge</h3>
          <p class="mt-1 max-w-3xl text-sm text-zinc-400">Compile religious or general character JSON with xAI Grok. Add up to six photos, fill any fields you know, or let Grok create a story-first character from scratch.</p>
        </div>
        <select id="bforge-model" class="neu-input max-w-xs text-xs">
          ${PUTER_GROK_MODELS.map(model => `<option value="${escapeHtml(model.id)}" ${model.id === currentModel ? 'selected' : ''}>${escapeHtml(model.name)}</option>`).join('')}
        </select>
      </div>

      <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div class="space-y-5">
          <div class="grid gap-3 md:grid-cols-3">
            <label class="space-y-1 text-xs text-zinc-400">Mode
              <select id="bforge-mode" class="neu-input">
                <option value="religious">Religious centered</option>
                <option value="general">General character</option>
              </select>
            </label>
            <label class="space-y-1 text-xs text-zinc-400">Character Name / Title
              <input id="bforge-name" class="neu-input" placeholder="Optional" />
            </label>
            <label class="space-y-1 text-xs text-zinc-400">Archetype
              <input id="bforge-archetype" class="neu-input" placeholder="Prophet, saint, knight, oracle..." />
            </label>
          </div>

          <div class="grid gap-3 md:grid-cols-[220px_1fr]">
            <label class="space-y-1 text-xs text-zinc-400">Setting
              <select id="bforge-setting" class="neu-input">
                <option>Medieval</option>
                <option>Modern</option>
                <option>Sci-fi</option>
                <option>Tribal</option>
                <option>Gothic</option>
                <option>Apocalyptic</option>
                <option>Mythic Biblical</option>
                <option>Urban Fantasy</option>
              </select>
            </label>
            <label class="space-y-1 text-xs text-zinc-400">User Prompt
              <input id="bforge-prompt" class="neu-input" placeholder="Story hooks, relationship, theology, conflict, visual direction..." />
            </label>
          </div>

          <label class="block space-y-1 text-xs text-zinc-400">Kinks / Mature Themes
            <textarea id="bforge-kinks" class="neu-input" rows="2" placeholder="Optional adult fictional themes. Grok will keep them moderated and story-led."></textarea>
          </label>

          <div>
            <div class="mb-2 flex items-center justify-between">
              <div class="text-xs uppercase tracking-[0.2em] text-zinc-500">Reference Photos</div>
              <div id="bforge-image-count" class="neu-badge">0 / 6</div>
            </div>
            <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
              ${Array.from({ length: 6 }, (_, index) => `
                <label class="bforge-slot relative flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/30 text-center text-xs text-zinc-500">
                  <input id="bforge-image-${index}" type="file" accept="image/*" class="absolute inset-0 opacity-0" />
                  <img id="bforge-preview-${index}" class="hidden h-full w-full object-cover" alt="" />
                  <span id="bforge-placeholder-${index}">Photo ${index + 1}</span>
                  <button type="button" data-bforge-remove="${index}" class="hidden absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-xs text-red-300">x</button>
                </label>
              `).join('')}
            </div>
          </div>

          <details class="rounded-2xl border border-white/10 bg-black/20 p-4">
            <summary class="cursor-pointer text-sm font-semibold text-amber-200">Manual field drafts</summary>
            <div class="mt-4 grid gap-3 md:grid-cols-2">
              <textarea id="bforge-bio" class="neu-input" rows="3" placeholder="Bio draft"></textarea>
              <textarea id="bforge-personality" class="neu-input" rows="3" placeholder="Personality draft"></textarea>
              <textarea id="bforge-scenario" class="neu-input" rows="3" placeholder="Scenario draft"></textarea>
              <textarea id="bforge-first" class="neu-input" rows="3" placeholder="First message draft"></textarea>
              <textarea id="bforge-system" class="neu-input md:col-span-2" rows="4" placeholder="System prompt draft"></textarea>
            </div>
          </details>

          <div class="flex flex-wrap gap-3">
            <button id="bforge-compile" class="neu-btn-primary rounded-2xl px-5 py-3 text-sm font-semibold">Compile JSON</button>
            <button id="bforge-scratch" class="neu-btn rounded-2xl px-5 py-3 text-sm">Create From Scratch</button>
            <button id="bforge-reset" class="neu-btn rounded-2xl px-5 py-3 text-sm">Reset</button>
          </div>
        </div>

        <aside class="rounded-3xl border border-white/10 bg-black/25 p-5">
          <div id="bforge-status" class="hidden text-sm text-amber-300">Preparing forge...</div>
          <div id="bforge-empty" class="py-12 text-center text-sm text-zinc-500">A compiled character JSON will appear here.</div>
          <div id="bforge-result" class="hidden space-y-4">
            <div>
              <div id="bforge-result-name" class="text-xl font-semibold text-amber-100"></div>
              <div id="bforge-result-title" class="text-xs text-amber-400/80"></div>
            </div>
            <img id="bforge-result-avatar" class="hidden h-28 w-28 rounded-2xl object-cover ring-2 ring-white/10" alt="" />
            <p id="bforge-result-bio" class="text-xs leading-relaxed text-zinc-300"></p>
            <pre id="bforge-result-json" class="max-h-64 overflow-auto rounded-2xl bg-black/50 p-3 text-[10px] text-emerald-300"></pre>
            <div class="grid grid-cols-2 gap-2">
              <button id="bforge-copy" class="neu-btn rounded-xl px-3 py-2 text-xs">Copy</button>
              <button id="bforge-export" class="neu-btn rounded-xl px-3 py-2 text-xs">Export</button>
              <button id="bforge-apply" class="neu-btn-primary col-span-2 rounded-xl px-3 py-2 text-xs">Apply Character</button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  `;

  for (let i = 0; i < 6; i++) {
    host.querySelector(`#bforge-image-${i}`)?.addEventListener('change', (event) => handleForgeImage(i, event.target.files?.[0]));
    host.querySelector(`[data-bforge-remove="${i}"]`)?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearForgeImage(i);
    });
  }
  host.querySelector('#bforge-compile')?.addEventListener('click', () => runBiblicalForge(false));
  host.querySelector('#bforge-scratch')?.addEventListener('click', () => runBiblicalForge(true));
  host.querySelector('#bforge-reset')?.addEventListener('click', renderCharacterForge);
  host.querySelector('#bforge-copy')?.addEventListener('click', copyForgedCharacter);
  host.querySelector('#bforge-export')?.addEventListener('click', exportForgedCharacter);
  host.querySelector('#bforge-apply')?.addEventListener('click', applyForgedCharacter);
}

function handleForgeImage(index, file) {
  if (!file) return;
  forgeFiles[index] = file;
  const preview = document.getElementById(`bforge-preview-${index}`);
  const placeholder = document.getElementById(`bforge-placeholder-${index}`);
  const remove = document.querySelector(`[data-bforge-remove="${index}"]`);
  if (preview) {
    preview.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');
  }
  placeholder?.classList.add('hidden');
  remove?.classList.remove('hidden');
  updateForgeCount();
}

function clearForgeImage(index) {
  forgeFiles[index] = null;
  const preview = document.getElementById(`bforge-preview-${index}`);
  const placeholder = document.getElementById(`bforge-placeholder-${index}`);
  const remove = document.querySelector(`[data-bforge-remove="${index}"]`);
  const input = document.getElementById(`bforge-image-${index}`);
  if (preview) {
    if (preview.src) URL.revokeObjectURL(preview.src);
    preview.src = '';
    preview.classList.add('hidden');
  }
  if (input) input.value = '';
  placeholder?.classList.remove('hidden');
  remove?.classList.add('hidden');
  updateForgeCount();
}

function updateForgeCount() {
  const count = forgeFiles.filter(Boolean).length;
  const badge = document.getElementById('bforge-image-count');
  if (badge) badge.textContent = `${count} / 6`;
}

async function runBiblicalForge(fromScratch) {
  const host = document.getElementById('biblicalai-forge-host');
  const status = document.getElementById('bforge-status');
  const empty = document.getElementById('bforge-empty');
  const result = document.getElementById('bforge-result');
  const compile = document.getElementById('bforge-compile');
  const scratch = document.getElementById('bforge-scratch');
  if (!host || !status || !empty || !result) return;

  compile.disabled = true;
  scratch.disabled = true;
  status.classList.remove('hidden');
  empty.classList.add('hidden');
  result.classList.add('hidden');

  try {
    const files = fromScratch ? [] : forgeFiles.filter(Boolean);
    const uploaded = [];
    for (let i = 0; i < files.length; i++) {
      status.textContent = `Uploading reference photo ${i + 1} of ${files.length}...`;
      const item = await uploadMediaFile(files[i], `BiblicalAI forge reference ${i + 1}`);
      uploaded.push(item.url);
    }

    status.textContent = 'Grok is compiling the character JSON...';
    const character = await forgeCharacterWithGrok({
      imageUrls: uploaded,
      charName: valueOf('bforge-name'),
      archetype: valueOf('bforge-archetype'),
      religiousMode: valueOf('bforge-mode') !== 'general',
      setting: valueOf('bforge-setting'),
      kinks: valueOf('bforge-kinks'),
      userPrompt: valueOf('bforge-prompt'),
      modelId: valueOf('bforge-model') || DEFAULT_PUTER_MODEL_ID,
      fieldDraft: {
        bio: valueOf('bforge-bio'),
        personality: valueOf('bforge-personality'),
        scenario: valueOf('bforge-scenario'),
        first_mes: valueOf('bforge-first'),
        systemPrompt: valueOf('bforge-system')
      }
    });

    lastForgedCharacter = character;
    renderForgeResult(character);
    showToast('Grok compiled a character JSON.', 'success');
  } catch (err) {
    console.error('BiblicalAI forge failed:', err);
    empty.classList.remove('hidden');
    showToast(err.message || 'Character forge failed.', 'error');
  } finally {
    status.classList.add('hidden');
    compile.disabled = false;
    scratch.disabled = false;
  }
}

function renderForgeResult(character) {
  const empty = document.getElementById('bforge-empty');
  const result = document.getElementById('bforge-result');
  empty?.classList.add('hidden');
  result?.classList.remove('hidden');
  document.getElementById('bforge-result-name').textContent = character.name || 'Forged Character';
  document.getElementById('bforge-result-title').textContent = character.title || '';
  document.getElementById('bforge-result-bio').textContent = character.bio || '';
  document.getElementById('bforge-result-json').textContent = exportAsChubTavernJSON(character);
  const avatar = document.getElementById('bforge-result-avatar');
  if (avatar && character.avatar) {
    avatar.src = character.avatar;
    avatar.classList.remove('hidden');
  }
}

async function copyForgedCharacter() {
  if (!lastForgedCharacter) return;
  await navigator.clipboard.writeText(exportAsChubTavernJSON(lastForgedCharacter));
  showToast('Forged JSON copied.', 'success');
}

function exportForgedCharacter() {
  if (!lastForgedCharacter) return;
  const blob = new Blob([exportAsChubTavernJSON(lastForgedCharacter)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(lastForgedCharacter.name || 'forged-character').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Forged character exported.', 'success');
}

async function applyForgedCharacter() {
  if (!lastForgedCharacter) return;
  await saveCharacter(lastForgedCharacter);
  const photos = Array.isArray(lastForgedCharacter.photos) ? lastForgedCharacter.photos : [];
  if (photos.length) {
    const current = getState().gallery || [];
    const existing = new Set(current.map(item => item.src));
    const photoItems = photos.filter(src => src && !existing.has(src)).map((src, index) => ({
      id: `forge-${Date.now()}-${index}`,
      src,
      storage: 'cloudflare-r2',
      type: 'image',
      caption: `${lastForgedCharacter.name || 'Forged character'} reference ${index + 1}`,
      timestamp: new Date().toISOString()
    }));
    if (photoItems.length) await saveGallery([...current, ...photoItems]);
  }
  document.dispatchEvent(new CustomEvent('state-refresh-requested'));
  showToast(`${lastForgedCharacter.name || 'Character'} applied and saved.`, 'success');
}

function valueOf(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

// ─── Prompts ───

function buildBiblicalSystemPrompt() {
  return `You are BiblicalAI, a story-first lore engine. You create continuity-safe lore entries the user can approve into lorebooks and attach to characters.

CRITICAL: When generating lore entries, you MUST respond with a JSON array inside a code block. Format:
\`\`\`json
[{"title": "Entry Title", "content": "Detailed content paragraph...", "tags": ["tag1", "tag2"]}]
\`\`\`

You may include brief conversational text BEFORE or AFTER the JSON block, but the JSON array is mandatory when creating lore entries. Each entry content should be 80-200 words, atmospheric and actionable in future scenes. Favor history, setting, recurring symbols, factions, vows, consequences, emotional shifts, and character-specific details. Avoid gratuitous content unless the user's current story context truly requires mature detail.`;
}

function buildBiblicalUserPrompt(text) {
  return `User request: "${text}"

Respond helpfully with concise commentary, then generate 1-4 lore entries as a JSON array in a code block. Make each entry rich, story-based, and useful during roleplay.

Example response format:
Here's what I envision for you...

\`\`\`json
[{"title": "The Bell Beneath the Chapel", "content": "A buried bronze bell beneath the ruined chapel rings only when an old promise is about to surface...", "tags": ["location", "omen"]}]
\`\`\``;
}

// ─── Parsing ───

function parseLoreFromResponse(text) {
  let entries = extractJsonArrays(text);

  if (entries.length === 0) {
    entries = parseLoreMarkers(text);
  }

  if (entries.length === 0 && text.length > 120) {
    const cleaned = text.replace(/```[\s\S]*?```/g, '').replace(/LORE_TITLE:|LORE_CONTENT:/gi, '').trim();
    if (cleaned.length > 80) {
      entries.push({
        title: 'Divine Vision',
        content: cleaned.slice(0, 600),
        tags: ['auto-extracted']
      });
    }
  }
  return entries;
}

function extractJsonArrays(text) {
  const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/gi;
  const entries = [];
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    try {
      let cleaned = match[1].trim();
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrayMatch) cleaned = arrayMatch[0];
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        parsed.forEach(item => {
          if (item && (item.title || item.name) && (item.content || item.description || item.text)) {
            entries.push({
              title: item.title || item.name || 'Untitled',
              content: item.content || item.description || item.text || '',
              tags: Array.isArray(item.tags) ? item.tags : []
            });
          }
        });
      }
    } catch (e) { /* not valid JSON, skip */ }
  }
  return entries;
}

function parseLoreMarkers(text) {
  const entries = [];
  const blocks = text.split(/LORE_TITLE:/i).filter(b => b.trim());
  blocks.forEach(block => {
    const titleMatch = block.match(/^\s*(.+?)(?:\n|$)/i);
    const contentMatch = block.match(/LORE_CONTENT:\s*([\s\S]+)/i);
    if (titleMatch && contentMatch) {
      entries.push({
        title: titleMatch[1].trim(),
        content: contentMatch[1].trim(),
        tags: []
      });
    }
  });
  return entries;
}

// ─── Messages Rendering ───

function renderBiblicalMessages(container) {
  container.innerHTML = '';
  biblicalMessages.forEach(msg => {
    const div = document.createElement('div');
    div.className = `flex ${msg.role === 'user' ? 'justify-end' : ''}`;
    if (msg.role === 'user') {
      div.innerHTML = `<div class="max-w-[80%] rounded-2xl bg-emerald-900/60 px-4 py-2.5 text-sm leading-relaxed">${escapeHtml(msg.content)}</div>`;
    } else {
      div.innerHTML = `<div class="max-w-[85%]"><div class="rounded-2xl bg-emerald-950/70 border border-emerald-800/60 px-4 py-3 text-sm leading-relaxed">${formatBiblicalText(msg.content)}</div></div>`;
    }
    container.appendChild(div);
  });
  container.scrollTop = container.scrollHeight;
}

function formatBiblicalText(text) {
  let html = escapeHtml(text);
  html = html.replace(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/gi, (_, code) => {
    return `<div class="my-2 rounded-xl bg-black/40 px-3 py-2 text-[11px] font-mono text-emerald-300/80 overflow-x-auto"><pre class="whitespace-pre-wrap">${escapeHtml(code.trim()).slice(0, 500)}${code.length > 500 ? '\n...' : ''}</pre></div>`;
  });
  html = html.replace(/\*([^*]+)\*/g, '<em class="text-emerald-300/70">$1</em>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

// ─── Pending Lore Cards ───

function renderPendingLore() {
  const container = document.getElementById('biblicalai-pending');
  if (!container) return;

  const pending = getPendingLore();
  container.innerHTML = '';

  if (pending.length === 0) {
    container.innerHTML = `<div class="text-xs text-slate-500 px-2 py-6 text-center">No pending lore cards. Chat with BiblicalAI to generate some.</div>`;
    updateApproveAllBtn();
    return;
  }

  pending.forEach(entry => {
    container.appendChild(createPendingCard(entry));
  });
  updateApproveAllBtn();
}

function createPendingCard(entry) {
  const card = document.createElement('div');
  card.className = 'lore-pending-card rounded-2xl p-4 text-sm';
  card.dataset.loreId = entry.id;

  const tagsHtml = (entry.tags || []).map(t =>
    `<span class="inline-block px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-300 text-[10px]">${escapeHtml(t)}</span>`
  ).join(' ');

  card.innerHTML = `
    <div class="flex items-start justify-between gap-2 mb-1">
      <div class="font-semibold text-emerald-300 flex-1 lore-title-display">${escapeHtml(entry.title)}</div>
      <button class="edit-lore-btn text-[10px] px-2 py-0.5 rounded-lg border border-emerald-800/50 text-emerald-400 hover:bg-emerald-950/60 transition shrink-0" title="Edit this entry">EDIT</button>
    </div>
    <div class="text-slate-300 text-xs leading-snug line-clamp-3 mb-2 lore-content-preview">${escapeHtml((entry.content || '').slice(0, 200))}${(entry.content || '').length > 200 ? '...' : ''}</div>
    ${tagsHtml ? `<div class="flex flex-wrap gap-1 mb-3">${tagsHtml}</div>` : ''}
    <div class="flex gap-2">
      <button class="approve-lore-btn flex-1 text-[11px] py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold tracking-wide transition">APPROVE</button>
      <button class="deny-lore-btn flex-1 text-[11px] py-1.5 rounded-xl border border-red-900/60 hover:bg-red-950 text-red-400 transition">DENY</button>
    </div>
    <div class="lore-edit-area hidden mt-3 space-y-2">
      <input class="lore-edit-title w-full neu-input text-xs" value="${escapeHtml(entry.title)}" placeholder="Title" />
      <textarea class="lore-edit-content w-full neu-input text-xs" rows="4" placeholder="Content">${escapeHtml(entry.content || '')}</textarea>
      <input class="lore-edit-tags w-full neu-input text-[11px]" value="${escapeHtml((entry.tags || []).join(', '))}" placeholder="Tags (comma-separated)" />
      <div class="flex gap-2">
        <button class="save-edit-btn flex-1 text-[11px] py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-medium transition">Save Changes</button>
        <button class="cancel-edit-btn flex-1 text-[11px] py-1.5 rounded-xl border border-zinc-700 text-zinc-400 hover:bg-zinc-900 transition">Cancel</button>
      </div>
    </div>
  `;

  card.querySelector('.edit-lore-btn').onclick = () => {
    const editArea = card.querySelector('.lore-edit-area');
    const isHidden = editArea.classList.contains('hidden');
    editArea.classList.toggle('hidden');
    card.querySelector('.edit-lore-btn').textContent = isHidden ? 'CLOSE' : 'EDIT';
  };

  card.querySelector('.cancel-edit-btn').onclick = () => {
    card.querySelector('.lore-edit-area').classList.add('hidden');
    card.querySelector('.edit-lore-btn').textContent = 'EDIT';
  };

  card.querySelector('.save-edit-btn').onclick = () => {
    const newTitle = card.querySelector('.lore-edit-title').value.trim();
    const newContent = card.querySelector('.lore-edit-content').value.trim();
    const newTags = card.querySelector('.lore-edit-tags').value.split(',').map(t => t.trim()).filter(Boolean);
    if (!newTitle && !newContent) return;
    updatePendingLore(entry.id, {
      title: newTitle || entry.title,
      content: newContent || entry.content,
      tags: newTags.length ? newTags : entry.tags
    });
    showToast('Lore card updated.', 'success');
  };

  card.querySelector('.approve-lore-btn').onclick = () => openLorebookPicker(entry);
  card.querySelector('.deny-lore-btn').onclick = () => {
    removePendingLore(entry.id);
    showToast('Lore card discarded.');
  };

  return card;
}

function updateApproveAllBtn() {
  const btn = document.getElementById('btn-approve-all-lore');
  if (!btn) return;
  const count = getPendingLore().length;
  if (count > 1) {
    btn.classList.remove('hidden');
    btn.textContent = `Approve All (${count})`;
  } else {
    btn.classList.add('hidden');
  }
}

async function handleApproveAll() {
  const state = getState();
  const books = state.lorebooks || [];
  const pending = getPendingLore();

  if (pending.length === 0) return;

  if (books.length === 0) {
    showToast('Create a lorebook first before approving.', 'error');
    return;
  }

  if (books.length === 1) {
    await approveAllToBook(0);
    showToast(`All ${pending.length} entries approved into "${books[0].title}".`, 'success');
    return;
  }

  openLorebookPicker(pending[0], true);
}

// ─── Lorebook Picker Modal ───

function openLorebookPicker(entry, approveAll = false) {
  const existing = document.getElementById('modal-lore-picker');
  if (existing) existing.remove();

  const state = getState();
  const books = state.lorebooks || [];

  const modal = document.createElement('div');
  modal.id = 'modal-lore-picker';
  modal.className = 'fixed inset-0 z-[120] flex items-center justify-center p-4';
  modal.style.background = 'rgba(0,0,0,0.75)';

  const bookOptions = books.map((b, i) =>
    `<option value="${i}">${escapeHtml(b.title)} (${(b.entries || []).length} entries)</option>`
  ).join('');

  modal.innerHTML = `
    <div class="w-full max-w-md neu-card p-6">
      <h3 class="text-lg font-semibold text-emerald-300 mb-1">${approveAll ? 'Approve All Lore' : 'Approve Lore Entry'}</h3>
      <p class="text-xs mb-4" style="color:var(--muted-foreground);">${approveAll ? `Add all ${getPendingLore().length} pending entries to a lorebook.` : `Choose a destination lorebook for "${escapeHtml(entry.title)}".`}</p>

      ${books.length > 0 ? `
        <div class="mb-4">
          <label class="text-xs block mb-1.5" style="color:var(--muted-foreground);">Add to Existing Lorebook</label>
          <select id="picker-book-select" class="w-full neu-input text-sm">${bookOptions}</select>
          <button id="picker-approve-existing" class="mt-3 w-full py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold transition">${approveAll ? 'Approve All to Selected' : 'Approve to Selected'}</button>
        </div>
        <div class="flex items-center gap-3 my-4"><div class="flex-1 h-px" style="background:var(--border);"></div><span class="text-[10px] text-zinc-500 uppercase tracking-widest">or</span><div class="flex-1 h-px" style="background:var(--border);"></div></div>
      ` : ''}

      <div>
        <label class="text-xs block mb-1.5" style="color:var(--muted-foreground);">Create New Lorebook</label>
        <input id="picker-new-book" type="text" class="w-full neu-input text-sm" placeholder="e.g. Sacred Rituals, Temple Erotica..." />
        <button id="picker-approve-new" class="mt-3 w-full py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold transition">Create & ${approveAll ? 'Approve All' : 'Approve'}</button>
      </div>

      <button id="picker-cancel" class="mt-4 w-full py-2 rounded-2xl text-sm" style="color:var(--muted-foreground);border:1px solid var(--border);">Cancel</button>
    </div>
  `;

  document.body.appendChild(modal);

  requestAnimationFrame(() => modal.querySelector('#picker-new-book')?.focus());

  modal.querySelector('#picker-approve-existing')?.addEventListener('click', async () => {
    const select = modal.querySelector('#picker-book-select');
    const bookIndex = parseInt(select.value);
    if (approveAll) {
      await approveAllToBook(bookIndex);
      showToast(`All entries approved into "${books[bookIndex].title}".`, 'success');
    } else {
      await approveLoreToBook(entry, bookIndex);
      showToast(`Lore approved into "${books[bookIndex].title}".`, 'success');
    }
    modal.remove();
  });

  modal.querySelector('#picker-approve-new').addEventListener('click', async () => {
    const title = modal.querySelector('#picker-new-book').value.trim();
    if (!title) { showToast('Enter a lorebook name.', 'error'); return; }
    if (approveAll) {
      const pending = getPendingLore();
      const first = pending[0];
      await createLorebookAndApprove(first, title);
      const state2 = getState();
      const newIdx = state2.lorebooks.length - 1;
      for (let i = 1; i < pending.length; i++) {
        await approveLoreToBook(pending[i], newIdx);
      }
      showToast(`All entries approved into new "${title}" lorebook.`, 'success');
    } else {
      await createLorebookAndApprove(entry, title);
      showToast(`Lore approved into new "${title}" lorebook.`, 'success');
    }
    modal.remove();
  });

  modal.querySelector('#picker-cancel').onclick = () => modal.remove();
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', esc); }
  });
}

// ─── Helpers ───

function updateLoreBadge() {
  const badge = document.getElementById('lore-badge');
  if (!badge) return;
  const count = getPendingLore().length;
  if (count > 0) {
    badge.classList.remove('hidden');
    badge.textContent = count;
  } else {
    badge.classList.add('hidden');
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Expose for chat-view auto-lore integration
window.__biblicalAI = {
  addPendingLore: (entry) => {
    addPendingLore({ ...entry, source: entry.source || 'Auto-Extracted' });
  }
};
