// main.js - Divine Corruption Bootstrap (with Auth + Divinity Zone)
import { initState, saveCharacter, getState, setActiveNode, getDefaultCharacter } from './state.js';
import { showToast } from './ui/toast.js';
import { initProfileUI } from './ui/profile-view.js';
import { initCharactersUI } from './ui/characters.js';
import { initGalleryUI } from './ui/gallery.js';
import { initLorebooksUI } from './ui/lorebooks.js';
import { initNodesUI } from './ui/nodes.js';
import { initChatUI } from './ui/chat-view.js';
import { initBiblicalAI } from './ui/biblicalai.js';
import { initSettingsUI } from './ui/settings.js';
import { normalizeAnyCharacterJSON } from './utils/ai.js';
import { fetchOllamaModels, warmOllamaModels } from './utils/ollama.js';
import { initBlessingMaker } from './ui/blessingmaker.js';
import { initDivinityZone, showDivinityZoneDirect } from './ui/divinity-zone.js';
import { initAuth, checkAndGate } from './ui/auth.js';
import { dbGet, dbSet } from './db.js';

let currentTab = 'profile';
let i18n = null;
const APP_SPLASH_VERSION = 'divinelogo-v2';

function t(key, values) {
  return i18n?.t(key, values) ?? key;
}

async function bootstrap() {
  i18n = window.miniappI18n;
  
  const state = await initState();
  maybeWarmupModels(state);
  
  const splash = document.getElementById('splash-screen');
  const uploadScreen = document.getElementById('upload-screen');
  const dashboard = document.getElementById('dashboard');

  // Check if user has seen the splash (one-time only)
  const hasSeenSplash = await dbGet('hasSeenSplash');

  if (hasSeenSplash === APP_SPLASH_VERSION) {
    splash.classList.add('hidden');
    await proceedAfterSplash(state, uploadScreen, dashboard);
  } else {
    splash.classList.remove('hidden');
    setupSplash(splash, state, uploadScreen, dashboard);
  }
}

function setupSplash(splash, state, uploadScreen, dashboard) {
  const enterBtn = document.getElementById('btn-enter-splash');
  
  enterBtn.onclick = async () => {
    await dbSet('hasSeenSplash', APP_SPLASH_VERSION);
    
    splash.style.transition = 'opacity 280ms ease';
    splash.style.opacity = '0';
    
    setTimeout(() => {
      splash.classList.add('hidden');
      splash.style.opacity = '1';
      proceedAfterSplash(state, uploadScreen, dashboard);
    }, 280);
  };
}

async function proceedAfterSplash(state, uploadScreen, dashboard) {
  // Initialize Divinity Zone (public, no auth needed)
  initDivinityZone();
  setupDivinityZoneStandalone();

  // Initialize Blessing Maker
  initBlessingMaker();

  // Setup auth gate
  initAuth(() => {
    // On successful auth, show dashboard
    const dzScreen = document.getElementById('divinity-zone-screen');
    if (dzScreen) dzScreen.classList.add('hidden');
    showDashboard(uploadScreen, dashboard, getState());
  });

  // Check auth status
  const passed = await checkAndGate();

  if (passed) {
    // No PIN set or already authed
    proceedToApp(state, uploadScreen, dashboard);
  }
  // If not passed, auth screen is showing. User either enters PIN, goes to Divinity Zone, or removes PIN.
}

function proceedToApp(state, uploadScreen, dashboard) {
  setupUploadHandlers(uploadScreen, dashboard);

  if (state.character) {
    showDashboard(uploadScreen, dashboard, state);
  } else {
    uploadScreen.classList.remove('hidden');
    dashboard.classList.add('hidden');
  }

  // Global keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName === 'BODY') {
      e.preventDefault();
      const chatInput = document.getElementById('chat-input');
      if (chatInput) {
        switchTab('chat');
        chatInput.focus();
      }
    }
  });
}

function setupDivinityZoneStandalone() {
  // Back button and generate button are wired inside ui/divinity-zone.js
  // Make Divinity Zone accessible from auth screen button
  window.__showDivinityZone = () => showDivinityZoneDirect();
}

function setupUploadHandlers(uploadScreen, dashboard) {
  const jsonInput = document.getElementById('json-upload');
  const loadDefaultBtn = document.getElementById('btn-load-default');

  jsonInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const character = await normalizeAnyCharacterJSON(text);
      await saveCharacter(character);
      showToast('Character loaded (Smut Engine ready).', 'success');
      showDashboard(uploadScreen, dashboard, getState());
    } catch (err) {
      showToast('Failed to load character JSON. Please check the file.', 'error');
    }
  });

  const dropZone = jsonInput.parentElement;
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('!border-amber-400');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('!border-amber-400'));
  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('!border-amber-400');
    
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/json') {
      try {
        const text = await file.text();
        const character = await normalizeAnyCharacterJSON(text);
        await saveCharacter(character);
        showToast(t('app.toasts.uploaded'), 'success');
        showDashboard(uploadScreen, dashboard, getState());
      } catch (err) {
        showToast('Failed to parse JSON (even with AI help).', 'error');
      }
    }
  });

  loadDefaultBtn.addEventListener('click', async () => {
    const defaultChar = getDefaultCharacter();
    await saveCharacter(defaultChar);
    showToast('Default Jesus character loaded with love.', 'success');
    showDashboard(uploadScreen, dashboard, getState());
  });
}

function showDashboard(uploadScreen, dashboard, state) {
  uploadScreen.classList.add('hidden');
  dashboard.classList.remove('hidden');

  // Initialize all UI modules
  initProfileUI();
  initCharactersUI();
  initGalleryUI();
  initLorebooksUI();
  initNodesUI();
  initChatUI();
  initBiblicalAI();
  initSettingsUI();

  setupNavigation();
  document.addEventListener('state-refresh-requested', () => {
    initProfileUI();
    initCharactersUI();
    initGalleryUI();
    initLorebooksUI();
    initNodesUI();
    initChatUI();
    initBiblicalAI();
    initSettingsUI();
  });
  switchTab('profile');
}

function setupNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
    });
  });

  setupNavScrollArrows();
}

function setupNavScrollArrows() {
  const container = document.getElementById('nav-scroll-container');
  const track = document.getElementById('nav-tabs');
  const leftArrow = document.getElementById('nav-arrow-left');
  const rightArrow = document.getElementById('nav-arrow-right');

  if (!container || !track || !leftArrow || !rightArrow) return;

  const SCROLL_AMOUNT = 160;

  function checkOverflow() {
    const hasOverflow = track.scrollWidth > track.clientWidth + 4;
    container.classList.toggle('has-overflow', hasOverflow);
  }

  leftArrow.addEventListener('click', () => {
    track.scrollBy({ left: -SCROLL_AMOUNT, behavior: 'smooth' });
  });

  rightArrow.addEventListener('click', () => {
    track.scrollBy({ left: SCROLL_AMOUNT, behavior: 'smooth' });
  });

  const ro = new ResizeObserver(checkOverflow);
  ro.observe(track);
  checkOverflow();
}

export function switchTab(tabName) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  
  const panel = document.getElementById(`panel-${tabName}`);
  if (panel) panel.classList.remove('hidden');

  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.remove('active');
    if (t.dataset.tab === tabName) t.classList.add('active');
  });

  currentTab = tabName;
}

// Boot the app
document.addEventListener('DOMContentLoaded', bootstrap);

async function maybeWarmupModels(state) {
  const settings = state.settings || {};
  if (!settings.warmupModelsOnStart) return;
  if (settings.aiProvider && settings.aiProvider !== 'ollama') return;

  try {
    const endpoint = settings.ollamaEndpoint || '/ollama';
    const models = settings.ollamaAvailableModels?.length
      ? settings.ollamaAvailableModels
      : await fetchOllamaModels(endpoint);
    const results = await warmOllamaModels({ endpoint, models, limit: 6, timeoutMs: 30000 });
    console.info('[Ollama warmup]', results);
  } catch (err) {
    console.warn('[Ollama warmup] failed:', err);
  }
}
