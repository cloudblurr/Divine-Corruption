// ui/chat-view.js - Chat panel rendering (messages, input, drawer, media viewer)
import { DEFAULT_JESUS_AVATAR, getState, saveNodes, setActiveNode, saveChatHistory } from '../state.js';
import { showToast } from './toast.js';
import { callJesus, CLOUD_ROLEPLAY_MODELS, extractChatLore, UNCENSORED_ROLEPLAY_MODELS } from '../utils/ai.js';
import { DEFAULT_VOICE_ID, speakCharacterText } from '../utils/tts.js';
import { PUTER_GROK_MODELS } from '../utils/puter.js';
import { addPendingLore, getPendingLore, onLoreChange } from '../services/lore-service.js';
import { initFloatingMedia, openMedia } from './floating-media.js';

let currentNode = null;
let messages = [];
let isLoading = false;
let currentDrawerTab = 'gallery';
let drawerOpen = false;
let assistantMsgCount = 0;
let loreExtracting = false;

const t = (key) => window.miniappI18n?.t(key) ?? key;

export function initChatUI() {
  renderChatPanel();
  initFloatingMedia();
  setupDrawer();
  wireLoreNotification();

  document.addEventListener('node-changed', (e) => {
    loadNodeContext(e.detail.nodeId);
  });
  document.addEventListener('settings-changed', () => {
    populateChatModelSelect();
  });

  const state = getState();
  if (state.activeNodeId) {
    loadNodeContext(state.activeNodeId);
  } else {
    messages = state.chatHistory || [];
    messages.length ? renderMessages() : renderEmptyChat({ clearNode: true });
  }

  window.__divineChat = { loadNodeContext, renderEmptyChat };
}

function renderChatPanel() {
  const panel = document.getElementById('panel-chat');
  if (!panel) return;

  panel.innerHTML = `
    <!-- Chat Header -->
    <div class="flex items-center justify-between mb-4 gap-4">
      <div class="min-w-0">
        <h2 class="text-3xl font-semibold tracking-tight" data-i18n="app.chat.title">Speak with the Lord</h2>
        <p id="chat-context-label" class="text-sm text-amber-400/70 truncate"></p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <select id="chat-model-select" class="neu-input text-xs max-w-[260px] hidden sm:block"></select>
        <button id="btn-new-dawn" class="chat-toolbar-btn px-3 text-[10px] font-semibold" aria-label="Start scene at the beginning" title="New Dawn">DAWN</button>
        <button id="btn-drawer-gallery" class="chat-toolbar-btn" aria-label="Gallery drawer" title="Gallery">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        </button>
        <button id="btn-drawer-lore" class="chat-toolbar-btn" aria-label="Lore drawer" title="Lore">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
        </button>
        <button id="btn-drawer-info" class="chat-toolbar-btn" aria-label="Character info" title="Character Info">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </button>
        <button id="btn-compile" class="hidden rounded-2xl neu-btn-primary px-4 py-2 text-sm font-medium" style="background:linear-gradient(145deg,#059669,#047857);">
          <span data-i18n="app.chat.compile">Compile & Seal Arc</span>
        </button>
      </div>
    </div>

    <!-- Auto-Lore Notification Bar -->
    <div id="chat-lore-notification" class="hidden mb-3 rounded-2xl px-4 py-3" style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);"></div>

    <!-- Chat Container -->
    <div class="flex h-[calc(100vh-260px)] min-h-[420px] flex-col rounded-3xl neu-card overflow-hidden">
      <div id="chat-messages" class="flex-1 space-y-4 overflow-y-auto p-6 scrollbar-thin"></div>
      <div class="p-4" style="border-top:1px solid var(--border);background:rgba(255,255,255,0.015);">
        <div class="flex items-end gap-3">
          <textarea id="chat-input" rows="1" wrap="soft"
            class="chat-composer flex-1 rounded-2xl neu-input px-5 py-3 text-base"
            placeholder="Ask for guidance, share your heart..."></textarea>
          <button id="btn-voice" class="chat-toolbar-btn h-12 w-12" aria-label="Speak last dialogue">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-4-4H5m14 0v-4" /></svg>
          </button>
          <button id="btn-send" class="flex h-12 shrink-0 items-center justify-center rounded-2xl neu-btn-primary px-7 font-semibold">
            <span data-i18n="app.chat.send">Send</span>
          </button>
        </div>
      </div>
    </div>
  `;

  wireChatInputs();
  populateChatModelSelect();
  wireDrawerButtons();
}

function populateChatModelSelect() {
  const select = document.getElementById('chat-model-select');
  if (!select) return;
  const settings = getState().settings || {};
  const models = settings.aiProvider === 'gemini'
    ? CLOUD_ROLEPLAY_MODELS.filter(model => model.id?.startsWith('gemini:'))
    : settings.aiProvider === 'puter'
      ? (settings.puterAvailableModels?.length ? settings.puterAvailableModels : PUTER_GROK_MODELS)
      : settings.ollamaAvailableModels?.length ? settings.ollamaAvailableModels : UNCENSORED_ROLEPLAY_MODELS;
  select.innerHTML = models.map(m => `<option value="${m.id}" ${m.id === settings.roleplayModelId ? 'selected' : ''}>${m.name}</option>`).join('');
}

function wireChatInputs() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('btn-send');
  const voiceBtn = document.getElementById('btn-voice');
  const compileBtn = document.getElementById('btn-compile');
  const newDawnBtn = document.getElementById('btn-new-dawn');

  const sendMessage = async () => {
    const text = input.value.trim();
    if (!text || isLoading) return;

    messages.push({ role: 'user', content: text, timestamp: Date.now() });
    renderMessages();
    await persistMessages();
    input.value = '';
    resizeChatInput(input);
    isLoading = true;
    sendBtn.disabled = true;

    const typingEl = document.createElement('div');
    typingEl.className = 'chat-message assistant flex gap-3 items-start';
    typingEl.innerHTML = `
      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400 text-slate-950 text-xs font-bold">JC</div>
      <div class="rounded-2xl bg-white/5 px-4 py-3 text-sm text-slate-400 animate-pulse">The Lord is considering your words...</div>
    `;
    document.getElementById('chat-messages').appendChild(typingEl);
    scrollChat();

    try {
      const reply = await callJesus(
        messages.filter(m => !m.error).map(m => ({ role: m.role, content: m.content })),
        currentNode,
        { modelId: getSelectedChatModel() }
      );
      messages.push({ role: 'assistant', content: reply, timestamp: Date.now() });

      await persistMessages();
      typingEl.remove();
      renderMessages();
      // Auto-lore extraction every 5 assistant messages
      maybeExtractLore();
    } catch (err) {
      typingEl.remove();
      messages.push({
        role: 'assistant',
        content: formatChatError(err),
        timestamp: Date.now(),
        error: true
      });
      await persistMessages();
      renderMessages();
      showToast('Roleplay model failed. Check Settings or try Regenerate.', 'error');
    } finally {
      isLoading = false;
      sendBtn.disabled = false;
      scrollChat();
    }
  };

  sendBtn.onclick = sendMessage;
  input.addEventListener('input', () => resizeChatInput(input));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  resizeChatInput(input);

  voiceBtn.onclick = async () => {
    const last = [...messages].reverse().find(m => m.role === 'assistant');
    if (!last) { showToast('No message from Jesus to speak yet.'); return; }
    const dialogue = extractDialogueSegments(last.content).map(segment => segment.speech).join('\n\n').trim();
    if (!dialogue) {
      showToast('No spoken dialogue found in the last response.');
      return;
    }
    try {
      await speakCharacterText(dialogue, {
        voiceId: getState().settings?.voiceId || DEFAULT_VOICE_ID,
        timeoutMs: 60000
      });
    } catch (err) {
      showToast('Voice failed. Sign in for TTS.', 'error');
    }
  };

  compileBtn.onclick = async () => {
    if (!currentNode || messages.length < 3) {
      showToast('Have a longer conversation before compiling.'); return;
    }
    compileBtn.disabled = true;
    compileBtn.textContent = 'Compiling...';

    const { compileConversation } = await import('../utils/ai.js');
    const memoryEntry = await compileConversation(messages, currentNode.title);

    const state = getState();
    const { saveMemory } = await import('../state.js');
    await saveMemory([...(state.memory || []), memoryEntry]);

    const idx = state.nodes.findIndex(n => n.id === currentNode.id);
    if (idx !== -1) {
      const updated = [...state.nodes];
      updated[idx] = {
        ...updated[idx],
        chatHistory: [],
        compiledAt: new Date().toISOString(),
        newDawn: false
      };
      await saveNodes(updated);
    }

    await setActiveNode(null);
    messages = [];
    currentNode = null;
    renderEmptyChat({ clearNode: true });
    showToast('Conversation sealed into Eternal Memory.', 'success');
    compileBtn.disabled = false;
    compileBtn.textContent = 'Compile & Seal Arc';
    compileBtn.classList.add('hidden');
  };

  if (newDawnBtn) {
    newDawnBtn.onclick = async () => {
      if (isLoading) return;
      const target = currentNode ? `the scenario "${currentNode.title}"` : 'the direct chat';
      if (!confirm(`Begin ${target} again from its opening moment? Current uncompiled chat messages will be cleared from this thread.`)) return;

      messages = [];
      assistantMsgCount = 0;

      if (currentNode) {
        const state = getState();
        const idx = state.nodes.findIndex(n => n.id === currentNode.id);
        if (idx !== -1) {
          const updated = [...state.nodes];
          updated[idx] = {
            ...updated[idx],
            chatHistory: [],
            newDawn: true,
            compiledAt: updated[idx].compiledAt || ''
          };
          await saveNodes(updated);
          currentNode = updated[idx];
        }
      } else {
        await saveChatHistory([]);
      }

      renderEmptyChat({ clearNode: false });
      showToast('New Dawn prepared. The next response will start at the beginning.', 'success');
    };
  }
}

function resizeChatInput(input) {
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}

function getSelectedChatModel() {
  const settings = getState().settings || {};
  const selected = document.getElementById('chat-model-select')?.value || settings.roleplayModelId;
  if (settings.aiProvider === 'gemini' && !selected?.startsWith('gemini:')) {
    return settings.roleplayModelId;
  }
  if (settings.aiProvider === 'puter' && !selected?.startsWith('puter:')) {
    return settings.roleplayModelId;
  }
  if (!['gemini', 'puter'].includes(settings.aiProvider) && !selected?.startsWith('ollama:')) {
    return settings.roleplayModelId;
  }
  return selected || settings.roleplayModelId;
}

async function persistMessages() {
  if (currentNode) {
    const state = getState();
    const idx = state.nodes.findIndex(n => n.id === currentNode.id);
    if (idx !== -1) {
      const updated = [...state.nodes];
      updated[idx] = { ...updated[idx], chatHistory: messages };
      await saveNodes(updated);
      currentNode = updated[idx];
      return;
    }
  }
  await saveChatHistory(messages);
}

function wireDrawerButtons() {
  document.getElementById('btn-drawer-gallery')?.addEventListener('click', () => openDrawer('gallery'));
  document.getElementById('btn-drawer-lore')?.addEventListener('click', () => openDrawer('lore'));
  document.getElementById('btn-drawer-info')?.addEventListener('click', () => openDrawer('info'));
}

// ─── Drawer System ───
function setupDrawer() {
  const closeBtn = document.getElementById('chat-drawer-close');
  if (closeBtn) closeBtn.onclick = () => closeDrawer();

  document.querySelectorAll('.drawer-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.drawer;
      activateDrawerTab(tab);
    });
  });
}

function openDrawer(tab = 'gallery') {
  const drawer = document.getElementById('chat-drawer');
  if (!drawer) return;
  drawer.classList.remove('hidden');
  drawerOpen = true;
  activateDrawerTab(tab);
}

function closeDrawer() {
  document.getElementById('chat-drawer')?.classList.add('hidden');
  drawerOpen = false;
}

function activateDrawerTab(tab) {
  currentDrawerTab = tab;
  document.querySelectorAll('.drawer-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.drawer === tab);
  });
  renderDrawerContent(tab);
}

function renderDrawerContent(tab) {
  const container = document.getElementById('drawer-content');
  if (!container) return;

  const state = getState();

  if (tab === 'gallery') {
    renderDrawerGallery(container, state);
  } else if (tab === 'lore') {
    renderDrawerLore(container, state);
  } else if (tab === 'info') {
    renderDrawerInfo(container, state);
  }
}

function renderDrawerGallery(container, state) {
  const gallery = state.gallery || [];
  if (gallery.length === 0) {
    container.innerHTML = `<div class="flex flex-col items-center justify-center h-48 text-slate-500 text-sm text-center px-4">
      <svg class="w-8 h-8 mb-2 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
      No images in gallery yet.</div>`;
    return;
  }

  container.innerHTML = `<div class="grid grid-cols-3 gap-2">${gallery.map(item => `
    <div class="drawer-gallery-thumb group relative aspect-square rounded-xl overflow-hidden cursor-pointer transition" style="border:1px solid var(--border);"
         data-src="${item.src || item.url || ''}" data-caption="${item.caption || item.prompt || ''}" data-type="${item.type || 'image'}">
      ${item.type === 'video' ? `
        <video src="${item.src || item.url || ''}" class="w-full h-full object-cover" muted preload="metadata" playsinline></video>
        <div class="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/15 transition">
          <div class="w-8 h-8 rounded-full flex items-center justify-center" style="background:rgba(180,83,9,0.9);box-shadow:0 2px 8px rgba(0,0,0,0.5);">
            <svg class="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
      ` : `
        <img src="${item.src || item.url || ''}" class="w-full h-full object-cover" alt="gallery ref" />
      `}
      <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
        ${item.type === 'video' ? '' : '<svg class="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>'}
      </div>
    </div>
  `).join('')}</div>`;

  container.querySelectorAll('.drawer-gallery-thumb').forEach(thumb => {
    thumb.onclick = () => {
      openMedia(thumb.dataset.src, thumb.dataset.caption, thumb.dataset.type || 'image');
    };
  });
}

function renderDrawerLore(container, state) {
  const books = state.lorebooks || [];
  const pending = getPendingLore();

  let html = '';

  // Pending lore section
  if (pending.length > 0) {
    html += `
      <div class="mb-4 p-3 rounded-xl" style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);">
        <div class="flex items-center justify-between mb-2">
          <div class="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">Pending Lore (${pending.length})</div>
          <button class="drawer-goto-biblicalai text-[10px] text-emerald-400 hover:text-emerald-300 transition">Review →</button>
        </div>
        ${pending.slice(0, 4).map(e => `
          <div class="mb-1.5 last:mb-0">
            <div class="text-xs font-medium text-emerald-300">${escapeHtml(e.title)}</div>
            <div class="text-[11px] text-slate-400 line-clamp-1">${escapeHtml((e.content || '').slice(0, 100))}</div>
          </div>
        `).join('')}
        ${pending.length > 4 ? `<div class="text-[10px] text-emerald-400/50 mt-1">+${pending.length - 4} more...</div>` : ''}
      </div>
    `;
  }

  if (books.length === 0 && pending.length === 0) {
    container.innerHTML = `<div class="flex flex-col items-center justify-center h-48 text-slate-500 text-sm text-center px-4">
      <svg class="w-8 h-8 mb-2 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
      No lorebooks or pending lore yet.</div>`;
    container.innerHTML = html;
    return;
  }

  html += books.map(book => `
    <div class="mb-4">
      <div class="text-xs font-semibold uppercase tracking-wider text-amber-400/70 mb-2 px-1">${book.title}</div>
      ${(book.entries || []).map(e => `
        <div class="mb-2 rounded-xl p-3" style="border:1px solid var(--border);background:var(--neu-bg);">
          <div class="text-sm font-medium text-amber-300">${e.title}</div>
          <div class="text-xs text-slate-400 mt-1 leading-relaxed">${e.content?.slice(0, 160)}${e.content?.length > 160 ? '...' : ''}</div>
        </div>
      `).join('') || '<div class="text-xs text-slate-500 italic px-1">No entries yet.</div>'}
    </div>
  `).join('');

  container.innerHTML = html;

  // Wire the "Review" button
  container.querySelector('.drawer-goto-biblicalai')?.addEventListener('click', () => {
    closeDrawer();
    const nav = document.querySelector('[data-tab="biblicalai"]');
    if (nav) nav.click();
  });
}

function renderDrawerInfo(container, state) {
  const char = state.character;
  if (!char) {
    container.innerHTML = `<div class="text-center py-12 text-slate-500 text-sm">No character loaded.</div>`;
    return;
  }

  const fields = [
    { label: 'Name', key: 'name' },
    { label: 'Title', key: 'title' },
    { label: 'Biography', key: 'bio' },
    { label: 'Personality', key: 'personality' },
    { label: 'System Prompt', key: 'systemPrompt', mono: true },
    { label: 'Scenario', key: 'scenario' },
    { label: 'First Message', key: 'first_mes', key2: 'firstMes' },
    { label: 'Example Dialogue', key: 'mes_example', key2: 'mesExample', mono: true },
    { label: 'Creator Notes', key: 'creator_notes', key2: 'creatorNotes' },
    { label: 'Tags', key: 'tags', isTags: true },
  ];

  container.innerHTML = `
    <div class="space-y-3">
      ${fields.map(f => {
        let val = char[f.key] ?? char[f.key2] ?? '';
        if (f.isTags && Array.isArray(val)) val = val.join(', ');
        if (!val) return '';
        const display = typeof val === 'string' ? val : String(val);
        return `
          <div class="rounded-xl p-3" style="border:1px solid var(--border);background:var(--neu-bg);">
            <div class="text-[10px] uppercase tracking-wider text-amber-400/60 mb-1">${f.label}</div>
            <div class="${f.mono ? 'font-mono text-[11px]' : 'text-sm'} text-slate-300 leading-relaxed whitespace-pre-wrap break-words max-h-40 overflow-y-auto scrollbar-thin">${escapeHtml(display)}</div>
          </div>
        `;
      }).join('')}

      <div class="pt-2">
        <button id="drawer-export-json" class="w-full py-2.5 rounded-xl neu-btn text-xs font-semibold">Export Tavern Card JSON</button>
      </div>
    </div>
  `;

  container.querySelector('#drawer-export-json')?.addEventListener('click', async () => {
    const { exportAsChubTavernJSON } = await import('../state.js');
    const json = exportAsChubTavernJSON(char);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(char.name || 'jesus').toLowerCase().replace(/\s+/g, '-')}-tavern-card.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Tavern Card exported.');
  });
}


// ─── Node Context ───
function loadNodeContext(nodeId) {
  const state = getState();
  const node = state.nodes.find(n => n.id === nodeId);
  if (!node) return;

  currentNode = node;
  messages = node.chatHistory || [];
  assistantMsgCount = messages.filter(m => m.role === 'assistant').length;
  renderMessages();

  const label = document.getElementById('chat-context-label');
  if (label) label.textContent = `In the scenario: ${node.title}`;

  const compileBtn = document.getElementById('btn-compile');
  if (compileBtn) compileBtn.classList.remove('hidden');

  if (messages.length === 0 && node.initialPrompt) {
    setTimeout(() => {
      messages.push({ role: 'assistant', content: node.initialPrompt, timestamp: Date.now() });
      renderMessages();
      persistMessages();
    }, 400);
  }
}

function renderEmptyChat({ clearNode = true } = {}) {
  if (clearNode) currentNode = null;
  messages = [];
  assistantMsgCount = 0;

  const label = document.getElementById('chat-context-label');
  if (label) {
    label.textContent = currentNode
      ? `In the scenario: ${currentNode.title}`
      : 'Speaking directly with the Lord';
  }

  const compileBtn = document.getElementById('btn-compile');
  if (compileBtn) compileBtn.classList.toggle('hidden', !currentNode);

  const container = document.getElementById('chat-messages');
  if (container) {
    const char = getState().character || {};
    const avatarSrc = char.avatar || DEFAULT_JESUS_AVATAR;
    const avatarAlt = char.name || 'Jesus Christ';
    container.innerHTML = `
      <div class="flex h-full flex-col items-center justify-center text-center px-8">
        <img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(avatarAlt)}" class="mb-4 h-24 w-24 rounded-full object-cover ring-4 ring-amber-400/25 shadow-xl shadow-amber-500/10" />
        <div class="mb-4 text-5xl opacity-70">✝︎</div>
        <div class="text-lg font-medium text-slate-300">I am with you always.</div>
        <div class="mt-2 max-w-xs text-sm text-slate-400">Share what is on your heart. Ask for guidance, healing, or simply be still in My presence.</div>
      </div>
    `;
  }
}

function renderMessages() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  if (messages.length === 0) { renderEmptyChat({ clearNode: false }); return; }

  container.innerHTML = '';

  const char = getState().character || {};
  const avatarSrc = char.avatar || DEFAULT_JESUS_AVATAR;

  messages.forEach((msg, index) => {
    const div = document.createElement('div');
    div.className = `chat-message flex gap-3 ${msg.role === 'user' ? 'user justify-end' : 'assistant'}`;

    if (msg.role === 'user') {
      div.innerHTML = `
        <div class="max-w-[75%] rounded-3xl neu-btn-primary px-5 py-3 text-sm font-medium leading-relaxed">
          ${escapeHtml(msg.content)}
          <div class="mt-2 flex justify-end">
            <button class="copy-msg-btn text-[10px] opacity-70 hover:opacity-100" data-msg-index="${index}">COPY</button>
          </div>
        </div>`;
    } else if (msg.error) {
      div.innerHTML = `
        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-xs font-bold text-red-300 ring-1 ring-red-400/30">!</div>
        <div class="flex-1 max-w-[80%]">
          <div class="rounded-3xl px-5 py-4 text-[14px] leading-relaxed border border-red-500/30 bg-red-500/10 text-red-100">
            ${escapeHtml(msg.content)}
          </div>
          <div class="mt-2 flex items-center gap-2">
            <button class="copy-msg-btn inline-flex items-center gap-1.5 rounded-xl px-3 py-1 text-[10px] transition-all active:scale-95 border border-white/10"
              data-msg-index="${index}" aria-label="Copy message">COPY</button>
            <button class="regen-msg-btn inline-flex items-center gap-1.5 rounded-xl px-3 py-1 text-[10px] transition-all active:scale-95 border border-amber-500/20 text-amber-300"
              data-msg-index="${index}" aria-label="Regenerate response">REGENERATE</button>
          </div>
        </div>`;
    } else {
      const avatarHtml = avatarSrc
        ? `<img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(char.name || 'Jesus')}" class="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-amber-400/30" />`
        : `<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-yellow-600 text-xs font-bold text-slate-950 shadow-lg shadow-amber-400/20">JC</div>`;
      div.innerHTML = `
        ${avatarHtml}
        <div class="flex-1 max-w-[80%]">
          <div class="rounded-3xl neu-card px-5 py-4 text-[15px] leading-relaxed" style="color:var(--foreground);">
            ${formatAssistantText(msg.content, index)}
          </div>
          <div class="mt-2 flex items-center gap-2">
            <button class="copy-msg-btn inline-flex items-center gap-1.5 rounded-xl px-3 py-1 text-[10px] transition-all active:scale-95 border border-white/10"
              data-msg-index="${index}" aria-label="Copy message">COPY</button>
            <button class="regen-msg-btn inline-flex items-center gap-1.5 rounded-xl px-3 py-1 text-[10px] transition-all active:scale-95 border border-amber-500/20 text-amber-300"
              data-msg-index="${index}" aria-label="Regenerate response">REGENERATE</button>
          </div>
        </div>`;
    }

    container.appendChild(div);
  });

  container.querySelectorAll('.speak-dialogue-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopImmediatePropagation();
      const msg = messages[Number(btn.dataset.msgIndex)];
      const dialogue = extractDialogueSegments(msg?.content || '')[Number(btn.dataset.dialogueIndex)];
      const text = dialogue?.speech?.trim();
      if (!text) {
        showToast('No dialogue found for this line.', 'error');
        return;
      }
      const voiceId = getState().settings?.voiceId || DEFAULT_VOICE_ID;
      const orig = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<svg class="h-3.5 w-3.5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-4-4H5m14 0v-4" /></svg>`;
      try {
        await speakCharacterText(text, { voiceId, timeoutMs: 120000 });
      } catch (err) {
        showToast('Voice failed. Sign in for TTS.', 'error');
      } finally {
        btn.innerHTML = orig;
        btn.disabled = false;
      }
    });
  });

  container.querySelectorAll('.copy-msg-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopImmediatePropagation();
      const msg = messages[Number(btn.dataset.msgIndex)];
      await navigator.clipboard.writeText(msg?.content || '');
      showToast('Copied message.', 'success');
    });
  });

  container.querySelectorAll('.regen-msg-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopImmediatePropagation();
      await regenerateAssistantMessage(Number(btn.dataset.msgIndex), btn);
    });
  });

  scrollChat();
}

async function regenerateAssistantMessage(index, btn) {
  if (isLoading || !messages[index] || messages[index].role !== 'assistant') return;
  const history = messages.slice(0, index).filter(m => !m.error).map(m => ({ role: m.role, content: m.content }));
  if (!history.some(m => m.role === 'user')) {
    showToast('Nothing to regenerate yet.', 'error');
    return;
  }

  isLoading = true;
  const original = btn.textContent;
  btn.textContent = 'REGENERATING...';
  btn.disabled = true;
  try {
    const reply = await callJesus(history, currentNode, { modelId: getSelectedChatModel() });
    messages = [...messages.slice(0, index), { role: 'assistant', content: reply, timestamp: Date.now() }];
    await persistMessages();
    renderMessages();
    showToast('Response regenerated.', 'success');
  } catch (err) {
    showToast('Regeneration failed.', 'error');
  } finally {
    isLoading = false;
    btn.disabled = false;
    btn.textContent = original;
  }
}

function scrollChat() {
  const c = document.getElementById('chat-messages');
  if (c) requestAnimationFrame(() => c.scrollTop = c.scrollHeight);
}

// ─── Auto-Lore Extraction ───
async function maybeExtractLore() {
  assistantMsgCount++;
  if (assistantMsgCount % 3 !== 0 || loreExtracting || messages.length < 4) return;

  loreExtracting = true;
  try {
    const charName = getState().character?.name || 'Jesus Christ';
    const loreEntries = await extractChatLore(messages, charName);
    if (loreEntries.length > 0) {
      loreEntries.forEach(entry => {
        addPendingLore({ ...entry, source: 'Auto-Extracted from Chat' });
      });
      showLoreNotification(loreEntries);
      showToast(`BiblicalAI found ${loreEntries.length} lore seed${loreEntries.length === 1 ? '' : 's'} from this scene.`, {
        type: 'success',
        duration: 10000,
        actions: [
          {
            label: 'Review',
            onClick: () => document.querySelector('[data-tab="biblicalai"]')?.click()
          }
        ]
      });
    }
  } catch (err) {
    console.error('[Auto-lore] extraction failed:', err);
  } finally {
    loreExtracting = false;
  }
}

function showLoreNotification(entriesOrCount) {
  const bar = document.getElementById('chat-lore-notification');
  if (!bar) return;
  const entries = Array.isArray(entriesOrCount) ? entriesOrCount : [];
  const count = entries.length || Number(entriesOrCount) || 0;
  const titles = entries.slice(0, 2).map(entry => entry.title).filter(Boolean).join(', ');

  bar.classList.remove('hidden');
  bar.innerHTML = `
    <div class="flex items-center justify-between gap-3 w-full">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-6 h-6 rounded-full bg-emerald-500/25 flex items-center justify-center shrink-0">
          <span class="text-emerald-400 text-[11px] font-bold">${count}</span>
        </div>
        <span class="text-sm text-emerald-300 truncate">${count} new lore seed${count > 1 ? 's' : ''}${titles ? `: ${escapeHtml(titles)}` : ''}</span>
      </div>
      <div class="flex gap-2 shrink-0">
        <button id="lore-notif-review" class="text-[11px] px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-medium transition">Review</button>
        <button id="lore-notif-dismiss" class="text-[11px] px-2 py-1 rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-900 transition">✕</button>
      </div>
    </div>
  `;

  bar.querySelector('#lore-notif-review').onclick = () => {
    bar.classList.add('hidden');
    const nav = document.querySelector('[data-tab="biblicalai"]');
    if (nav) nav.click();
  };
  bar.querySelector('#lore-notif-dismiss').onclick = () => bar.classList.add('hidden');

  // Auto-hide after 15s
  setTimeout(() => { bar.classList.add('hidden'); }, 15000);
}

function wireLoreNotification() {
  onLoreChange(() => {
    const pending = getPendingLore();
    const bar = document.getElementById('chat-lore-notification');
    if (bar && pending.length === 0) bar.classList.add('hidden');
  });
}

function formatAssistantText(text, msgIndex = 0) {
  if (!text) return '';
  const segments = extractDialogueSegments(text);
  if (!segments.length) return formatPlainAssistantText(text);

  let html = '';
  let cursor = 0;
  segments.forEach((segment, dialogueIndex) => {
    if (segment.start > cursor) {
      html += formatPlainAssistantText(text.slice(cursor, segment.start));
    }
    html += `
      <span class="assistant-dialogue">
        <button class="speak-dialogue-btn" data-msg-index="${msgIndex}" data-dialogue-index="${dialogueIndex}" title="Speak this dialogue" aria-label="Speak this dialogue">
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.5a6.5 6.5 0 006.5-6.5M12 18.5A6.5 6.5 0 015.5 12M12 18.5V22m-3.5 0h7M9 9v3a3 3 0 006 0V9a3 3 0 00-6 0z" /></svg>
        </button>
        <span>${escapeHtml(segment.full)}</span>
      </span>`;
    cursor = segment.end;
  });
  if (cursor < text.length) html += formatPlainAssistantText(text.slice(cursor));
  return html;
}

function formatPlainAssistantText(text) {
  let html = escapeHtml(text);
  html = html.replace(/\*([^*]+)\*/g, '<em class="text-amber-300/80">$1</em>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

function extractDialogueSegments(text) {
  const source = String(text || '');
  const segments = [];
  const patterns = [
    /"([^"\n]{2,900})"/g,
    /\u201c([^\u201d]{2,900})\u201d/g
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const speech = normalizeDialogueForSpeech(match[1]);
      if (!speech || speech.length < 2) continue;
      segments.push({
        start: match.index,
        end: match.index + match[0].length,
        full: match[0],
        speech
      });
    }
  });

  return segments
    .sort((a, b) => a.start - b.start)
    .filter((segment, index, all) => index === 0 || segment.start >= all[index - 1].end);
}

function normalizeDialogueForSpeech(text) {
  return String(text || '')
    .replace(/\*[^*]*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatChatError(err) {
  const message = err?.message || String(err);
  return `Roleplay engine error: ${message}`;
}
