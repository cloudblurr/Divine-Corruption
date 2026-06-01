// ui/settings.js - Full Settings Menu for Divine Corruption
// Upload new Christ JSON, change most depraved models, custom system prompt, etc.
import { 
  getState, 
  saveSettings, 
  saveCharacter, 
  getDefaultCharacter,
  getJesusEngineCharacter
} from '../state.js';
import { showToast } from './toast.js';
import { CLOUD_ROLEPLAY_MODELS, UNCENSORED_ROLEPLAY_MODELS, normalizeAnyCharacterJSON, GLOBAL_SYSTEM_PROMPT } from '../utils/ai.js';
import {
  DEFAULT_OLLAMA_ENDPOINT,
  fetchOllamaModels,
  mergeModelOptions,
  toOllamaModelId,
  warmOllamaModels
} from '../utils/ollama.js';
import {
  DEFAULT_GEMINI_CONTINUATION_LIMIT,
  DEFAULT_GEMINI_ENDPOINT,
  DEFAULT_GEMINI_MAX_OUTPUT_TOKENS,
  DEFAULT_GEMINI_MODEL_ID,
  DEFAULT_GEMINI_SAFETY_THRESHOLD,
  DEFAULT_GEMINI_THINKING_MODE
} from '../utils/gemini.js';
import {
  DEFAULT_PUTER_CONTINUATION_LIMIT,
  DEFAULT_PUTER_ENDPOINT,
  DEFAULT_PUTER_MAX_TOKENS,
  DEFAULT_PUTER_MODEL_ID,
  DEFAULT_PUTER_TRANSPORT,
  PUTER_TRANSPORT_PROXY,
  PUTER_TRANSPORT_SDK,
  PUTER_GROK_MODELS,
  fetchPuterModels
} from '../utils/puter.js';
import {
  DEFAULT_HIGHERSTATE_CONTINUATION_LIMIT,
  DEFAULT_HIGHERSTATE_ENDPOINT,
  DEFAULT_HIGHERSTATE_MAX_TOKENS,
  DEFAULT_HIGHERSTATE_MODEL_ID,
  HIGHERSTATE_ROLEPLAY_MODELS,
  fetchHigherStateModels
} from '../utils/higherstate.js';
import {
  DEFAULT_GATEWAY_CONTINUATION_LIMIT,
  DEFAULT_GATEWAY_ENDPOINT,
  DEFAULT_GATEWAY_MAX_TOKENS,
  DEFAULT_GATEWAY_MODEL_ID,
  GATEWAY_ROLEPLAY_MODELS,
  fetchGatewayModels
} from '../utils/gateway.js';
import { exportAsChubTavernJSON } from '../state.js';
import { getAuthConfig, setAuthConfig, hashPin, dbRemove, getDataEndpoint, setDataEndpoint } from '../db.js';
import { showPinSetupModal } from './auth.js';
import { DEFAULT_VOICE_ID, ELEVENLABS_ADAM_VOICE_ID } from '../utils/tts.js';

export function initSettingsUI() {
  const panel = document.getElementById('panel-settings');
  if (!panel) return;

  renderSettingsPanel(panel);
  setupSettingsListeners(panel);
}

function getRoleplayModelOptions(settings = {}) {
  if (settings.aiProvider === 'gemini') {
    return CLOUD_ROLEPLAY_MODELS.filter(model => model.id?.startsWith('gemini:'));
  }

  if (settings.aiProvider === 'puter') {
    return settings.puterAvailableModels?.length
      ? settings.puterAvailableModels
      : PUTER_GROK_MODELS;
  }

  if (settings.aiProvider === 'higherstate') {
    return settings.higherStateAvailableModels?.length
      ? settings.higherStateAvailableModels
      : HIGHERSTATE_ROLEPLAY_MODELS;
  }

  if (settings.aiProvider === 'gateway') {
    return settings.gatewayAvailableModels?.length
      ? settings.gatewayAvailableModels
      : GATEWAY_ROLEPLAY_MODELS;
  }

  const source = settings.ollamaAvailableModels?.length
    ? settings.ollamaAvailableModels
    : UNCENSORED_ROLEPLAY_MODELS;
  return mergeModelOptions(source).filter(model => model.id?.startsWith('ollama:'));
}

function renderRoleplayOptions(settings = {}) {
  const selected = settings.roleplayModelId || (
    settings.aiProvider === 'gemini'
      ? DEFAULT_GEMINI_MODEL_ID
      : settings.aiProvider === 'puter'
        ? DEFAULT_PUTER_MODEL_ID
        : settings.aiProvider === 'higherstate'
          ? DEFAULT_HIGHERSTATE_MODEL_ID
        : settings.aiProvider === 'gateway'
          ? DEFAULT_GATEWAY_MODEL_ID
      : toOllamaModelId('dolphin-mistral:latest')
  );
  return getRoleplayModelOptions(settings).map(m => `
    <option value="${m.id}" ${selected === m.id ? 'selected' : ''}>
      ${m.name} - ${m.desc}
    </option>
  `).join('');
}

function renderSettingsPanel(panel) {
  const state = getState();
  const settings = state.settings || {};
  const char = state.character;
  const puterTransport = settings.puterTransport || DEFAULT_PUTER_TRANSPORT;

  panel.innerHTML = `
    <div class="flex items-center justify-between mb-8">
      <div>
        <h2 class="text-3xl font-semibold tracking-tight">Sacred Settings</h2>
        <p class="text-sm" style="color:var(--muted-foreground);">Control the engine of your corruption</p>
      </div>
    </div>

    <div class="max-w-3xl space-y-8">

      <!-- Character Management -->
      <div class="neu-card p-7">
        <div class="flex items-center gap-3 mb-4">
          <div class="text-amber-400">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h3 class="font-semibold text-lg">The Vessel (Current Christ)</h3>
        </div>

        <div class="flex items-center gap-4 mb-6">
          <div class="flex-1">
            <div class="text-sm" style="color:var(--muted-foreground);">Active Character</div>
            <div class="font-medium text-xl text-amber-100">${char?.name || 'No character loaded'}</div>
            <div class="text-xs mt-0.5" style="color:#52525b;">${char?.title || ''}</div>
          </div>
          <div class="text-right">
            <button id="settings-export-card"
                    class="neu-btn px-4 py-2 text-sm rounded-2xl">
              Export Tavern Card
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label class="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed p-6 transition hover:border-amber-400/60" style="border-color:var(--border);background:rgba(255,255,255,0.02);">
            <div class="mb-3 text-amber-400">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903 5 5 0 0110.76 1.51A4.5 4.5 0 0117 16v2m-6-4v4m0 0l-2-2m2 2l2-2" />
              </svg>
            </div>
            <span class="font-medium text-sm">Upload New Christ JSON</span>
            <span class="text-[10px] mt-1" style="color:#52525b;">chub.ai / SillyTavern format</span>
            <input type="file" id="settings-json-upload" accept=".json" class="hidden" />
          </label>

          <button id="settings-load-default"
                  class="neu-btn flex flex-col items-center justify-center rounded-2xl border p-6 transition text-left">
            <div class="mb-2 text-emerald-400">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7-7 7m-4 0l7-7-7-7" />
              </svg>
            </div>
            <span class="font-medium text-sm">Reload Default Jesus</span>
            <span class="text-[10px] mt-1" style="color:#52525b;">The original blessed smut engine</span>
          </button>
        </div>
      </div>

      <!-- Roleplay Model -->
      <div class="neu-card p-7">
        <div class="flex items-center gap-3 mb-4">
          <div class="text-red-400">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 class="font-semibold text-lg">Roleplay Engine</h3>
        </div>
        <p class="text-sm mb-4" style="color:var(--muted-foreground);">Choose the provider used for roleplay responses. Ollama and Gateway stay local; Gemini and Puter/Grok are cloud-backed and may enforce provider safeguards.</p>

        <label class="block text-[10px] uppercase tracking-widest mb-1" style="color:var(--muted-foreground);">Provider</label>
        <select id="settings-ai-provider" class="w-full neu-input text-sm mb-3">
          <option value="ollama" ${!['gemini', 'puter', 'higherstate', 'gateway'].includes(settings.aiProvider) ? 'selected' : ''}>Ollama Local / VM</option>
          <option value="higherstate" ${settings.aiProvider === 'higherstate' ? 'selected' : ''}>Higher State AI / Puter Models</option>
          <option value="gemini" ${settings.aiProvider === 'gemini' ? 'selected' : ''}>Gemini API (experimental)</option>
          <option value="puter" ${settings.aiProvider === 'puter' ? 'selected' : ''}>Puter.com / xAI Grok</option>
          <option value="gateway" ${settings.aiProvider === 'gateway' ? 'selected' : ''}>Gateway / HF Local</option>
        </select>

        <label class="block text-[10px] uppercase tracking-widest mb-1" style="color:var(--muted-foreground);">Model</label>
        <select id="settings-model" class="w-full neu-input text-sm">
          ${renderRoleplayOptions(settings)}
        </select>
        <label class="mt-3 inline-flex items-center gap-2 cursor-pointer text-xs" style="color:var(--muted-foreground);">
          <input type="checkbox" id="settings-new-dawn-mode" ${settings.newDawnMode !== false ? 'checked' : ''} />
          New Dawn mode: new or reset scenarios begin at the opening scene until compiled memories exist
        </label>
        <div class="mt-3 flex flex-wrap gap-2">
          <button id="settings-load-jesusengine" class="neu-btn-primary px-4 py-2 text-xs rounded-xl">Load JesusEngine</button>
          <span class="self-center text-[10px]" style="color:var(--muted-foreground);">Imports the HolyCraft workspace profile and selects Higher State AI.</span>
        </div>

        <div id="settings-ollama-config" class="mt-4 ${settings.aiProvider === 'ollama' || !['gemini', 'puter', 'higherstate', 'gateway'].includes(settings.aiProvider) ? '' : 'hidden'}">
        <div class="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input id="settings-ollama-endpoint" class="neu-input text-sm"
                 value="${settings.ollamaEndpoint || DEFAULT_OLLAMA_ENDPOINT}"
                 placeholder="http://your-vm:11434 or /ollama" />
          <button id="settings-refresh-ollama" class="neu-btn px-4 py-2 text-sm rounded-2xl">Refresh Models</button>
        </div>
        <div class="mt-3 flex items-center justify-between gap-3">
          <label class="inline-flex items-center gap-2 cursor-pointer text-xs" style="color:var(--muted-foreground);">
            <input type="checkbox" id="settings-warmup-enabled" ${settings.warmupModelsOnStart ? 'checked' : ''} />
            Warm selected models on startup
          </label>
          <button id="settings-warmup-ollama" class="neu-btn px-4 py-2 text-xs rounded-xl">Ping Models</button>
        </div>
        </div>

        <div id="settings-gemini-config" class="mt-4 space-y-3 ${settings.aiProvider === 'gemini' ? '' : 'hidden'}">
          <input id="settings-gemini-key" class="neu-input text-sm"
                 type="password"
                 value="${settings.geminiApiKey || ''}"
                 placeholder="Gemini API key (or set GEMINI_API_KEY on the dev server)" />
          <input id="settings-gemini-endpoint" class="neu-input text-sm"
                 value="${settings.geminiEndpoint || DEFAULT_GEMINI_ENDPOINT}"
                 placeholder="/gemini" />
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-[10px] uppercase tracking-widest" style="color:var(--muted-foreground);">Max output tokens</span>
              <input id="settings-gemini-max-output" class="neu-input text-sm" type="number" min="256" max="8192" step="256"
                     value="${settings.geminiMaxOutputTokens || DEFAULT_GEMINI_MAX_OUTPUT_TOKENS}" />
            </label>
            <label class="block">
              <span class="mb-1 block text-[10px] uppercase tracking-widest" style="color:var(--muted-foreground);">Auto-continues</span>
              <input id="settings-gemini-continuations" class="neu-input text-sm" type="number" min="0" max="5" step="1"
                     value="${settings.geminiContinuationLimit ?? DEFAULT_GEMINI_CONTINUATION_LIMIT}" />
            </label>
          </div>
          <div class="grid gap-3 sm:grid-cols-[1fr_auto]">
            <select id="settings-gemini-safety" class="neu-input text-sm">
              <option value="DEFAULT" ${settings.geminiSafetyThreshold === 'DEFAULT' ? 'selected' : ''}>Gemini default safety</option>
              <option value="BLOCK_ONLY_HIGH" ${(settings.geminiSafetyThreshold || DEFAULT_GEMINI_SAFETY_THRESHOLD) === 'BLOCK_ONLY_HIGH' ? 'selected' : ''}>Block only high probability</option>
              <option value="BLOCK_NONE" ${settings.geminiSafetyThreshold === 'BLOCK_NONE' ? 'selected' : ''}>Block none where API allows</option>
            </select>
            <button id="settings-test-gemini" class="neu-btn px-4 py-2 text-xs rounded-xl">Test Gemini</button>
          </div>
          <select id="settings-gemini-thinking" class="neu-input text-sm">
            <option value="minimal" ${(settings.geminiThinkingMode || DEFAULT_GEMINI_THINKING_MODE) === 'minimal' ? 'selected' : ''}>Minimal thinking - best for long chat replies</option>
            <option value="low" ${settings.geminiThinkingMode === 'low' ? 'selected' : ''}>Low thinking</option>
            <option value="default" ${settings.geminiThinkingMode === 'default' ? 'selected' : ''}>Provider default thinking</option>
            <option value="high" ${settings.geminiThinkingMode === 'high' ? 'selected' : ''}>High thinking</option>
          </select>
          <div class="text-[10px]" style="color:var(--muted-foreground);">Gemini may still block prompts or responses. Built-in protections cannot be disabled.</div>
        </div>
        <div id="settings-higherstate-config" class="mt-4 space-y-3 ${settings.aiProvider === 'higherstate' ? '' : 'hidden'}">
          <input id="settings-higherstate-endpoint" class="neu-input text-sm"
                 value="${settings.higherStateEndpoint || DEFAULT_HIGHERSTATE_ENDPOINT}"
                 placeholder="/higherstate or http://localhost:3141/v1" />
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-[10px] uppercase tracking-widest" style="color:var(--muted-foreground);">Max response tokens</span>
              <input id="settings-higherstate-max-tokens" class="neu-input text-sm" type="number" min="256" max="32768" step="256"
                     value="${settings.higherStateMaxTokens || DEFAULT_HIGHERSTATE_MAX_TOKENS}" />
            </label>
            <label class="block">
              <span class="mb-1 block text-[10px] uppercase tracking-widest" style="color:var(--muted-foreground);">Auto-continues</span>
              <input id="settings-higherstate-continuations" class="neu-input text-sm" type="number" min="0" max="5" step="1"
                     value="${settings.higherStateContinuationLimit ?? DEFAULT_HIGHERSTATE_CONTINUATION_LIMIT}" />
            </label>
          </div>
          <div class="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div class="text-[10px] self-center" style="color:var(--muted-foreground);">Uses the dev-server /higherstate proxy by default. The proxy signs into Higher State AI and exposes the dynamic Puter-backed model catalog.</div>
            <button id="settings-refresh-higherstate" class="neu-btn px-4 py-2 text-xs rounded-xl">Refresh Higher State</button>
            <button id="settings-test-higherstate" class="neu-btn px-4 py-2 text-xs rounded-xl">Test Higher State</button>
          </div>
        </div>
        <div id="settings-puter-config" class="mt-4 space-y-3 ${settings.aiProvider === 'puter' ? '' : 'hidden'}">
          <label class="block">
            <span class="mb-1 block text-[10px] uppercase tracking-widest" style="color:var(--muted-foreground);">Puter transport</span>
            <select id="settings-puter-transport" class="neu-input text-sm">
              <option value="${PUTER_TRANSPORT_SDK}" ${puterTransport === PUTER_TRANSPORT_SDK ? 'selected' : ''}>Puter.js SDK - browser login</option>
              <option value="${PUTER_TRANSPORT_PROXY}" ${puterTransport === PUTER_TRANSPORT_PROXY ? 'selected' : ''}>Dev Server Proxy - token file</option>
            </select>
          </label>
          <div id="settings-puter-proxy-config" class="${puterTransport === PUTER_TRANSPORT_SDK ? 'hidden' : ''}">
            <input id="settings-puter-endpoint" class="neu-input text-sm"
                   value="${settings.puterEndpoint || DEFAULT_PUTER_ENDPOINT}"
                   placeholder="/puter" />
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-[10px] uppercase tracking-widest" style="color:var(--muted-foreground);">Max response tokens</span>
              <input id="settings-puter-max-tokens" class="neu-input text-sm" type="number" min="256" max="32768" step="256"
                     value="${settings.puterMaxTokens || DEFAULT_PUTER_MAX_TOKENS}" />
            </label>
            <label class="block">
              <span class="mb-1 block text-[10px] uppercase tracking-widest" style="color:var(--muted-foreground);">Auto-continues</span>
              <input id="settings-puter-continuations" class="neu-input text-sm" type="number" min="0" max="5" step="1"
                     value="${settings.puterContinuationLimit ?? DEFAULT_PUTER_CONTINUATION_LIMIT}" />
            </label>
          </div>
          <div class="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div class="text-[10px] self-center" style="color:var(--muted-foreground);">${puterTransport === PUTER_TRANSPORT_SDK
              ? 'Uses Puter.js from js.puter.com/v2 with Puter browser login. No auth token is stored in this app.'
              : 'Uses the dev server token from PUTER_AUTH_TOKEN or Desktop/authtoken.txt. The token is not saved in browser settings.'}</div>
            <button id="settings-refresh-puter" class="neu-btn px-4 py-2 text-xs rounded-xl">Refresh Grok</button>
            <button id="settings-test-puter" class="neu-btn px-4 py-2 text-xs rounded-xl">Test Puter</button>
          </div>
        </div>
        <div id="settings-gateway-config" class="mt-4 space-y-3 ${settings.aiProvider === 'gateway' ? '' : 'hidden'}">
          <input id="settings-gateway-endpoint" class="neu-input text-sm"
                 value="${settings.gatewayEndpoint || DEFAULT_GATEWAY_ENDPOINT}"
                 placeholder="/gateway" />
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-[10px] uppercase tracking-widest" style="color:var(--muted-foreground);">Max response tokens</span>
              <input id="settings-gateway-max-tokens" class="neu-input text-sm" type="number" min="256" max="32768" step="256"
                     value="${settings.gatewayMaxTokens || DEFAULT_GATEWAY_MAX_TOKENS}" />
            </label>
            <label class="block">
              <span class="mb-1 block text-[10px] uppercase tracking-widest" style="color:var(--muted-foreground);">Auto-continues</span>
              <input id="settings-gateway-continuations" class="neu-input text-sm" type="number" min="0" max="5" step="1"
                     value="${settings.gatewayContinuationLimit ?? DEFAULT_GATEWAY_CONTINUATION_LIMIT}" />
            </label>
          </div>
          <div class="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div class="text-[10px] self-center" style="color:var(--muted-foreground);">Uses the dev server key from Documents/HF/.gateway/api-key.txt and proxies to http://127.0.0.1:11435/v1. The key is not saved in browser settings.</div>
            <button id="settings-refresh-gateway" class="neu-btn px-4 py-2 text-xs rounded-xl">Refresh Gateway</button>
            <button id="settings-test-gateway" class="neu-btn px-4 py-2 text-xs rounded-xl">Test Gateway</button>
          </div>
        </div>
        <div id="settings-ollama-status" class="text-[10px] text-red-400/70 mt-2">
          ${settings.aiProvider === 'gemini'
            ? `Gemini endpoint: ${settings.geminiEndpoint || DEFAULT_GEMINI_ENDPOINT}. ${getRoleplayModelOptions(settings).length} model options loaded.`
            : settings.aiProvider === 'higherstate'
              ? `Higher State AI endpoint: ${settings.higherStateEndpoint || DEFAULT_HIGHERSTATE_ENDPOINT}. ${getRoleplayModelOptions(settings).length} model options loaded.`
            : settings.aiProvider === 'puter'
              ? `Puter ${puterTransport === PUTER_TRANSPORT_SDK ? 'SDK' : 'endpoint'}: ${puterTransport === PUTER_TRANSPORT_SDK ? 'Puter.js browser SDK' : settings.puterEndpoint || DEFAULT_PUTER_ENDPOINT}. ${getRoleplayModelOptions(settings).length} Grok model options loaded.`
              : settings.aiProvider === 'gateway'
                ? `Gateway endpoint: ${settings.gatewayEndpoint || DEFAULT_GATEWAY_ENDPOINT}. ${getRoleplayModelOptions(settings).length} model options loaded.`
            : `Endpoint: ${settings.ollamaEndpoint || DEFAULT_OLLAMA_ENDPOINT}. ${getRoleplayModelOptions(settings).length} model options loaded.`}
        </div>
      </div>

      <!-- Storage -->
      <div class="neu-card p-7">
        <div class="flex items-center gap-3 mb-4">
          <div class="text-sky-400">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7c0 1.657 3.582 3 8 3s8-1.343 8-3-3.582-3-8-3-8 1.343-8 3zm0 0v10c0 1.657 3.582 3 8 3s8-1.343 8-3V7" />
            </svg>
          </div>
          <h3 class="font-semibold text-lg">Storage</h3>
        </div>
        <p class="text-sm mb-4" style="color:var(--muted-foreground);">App data is saved to the local SQLite dev-server database first, with IndexedDB fallback. Media uploads use this Cloudflare Worker/R2 endpoint when configured, with local dev fallback.</p>
        <label class="block text-[10px] uppercase tracking-widest mb-1" style="color:var(--muted-foreground);">Data endpoint</label>
        <input id="settings-data-endpoint" class="neu-input text-sm mb-3"
               value="${settings.cloudflareDataEndpoint || getDataEndpoint()}"
               placeholder="https://your-worker.workers.dev/db or /db" />
        <label class="block text-[10px] uppercase tracking-widest mb-1" style="color:var(--muted-foreground);">Media endpoint</label>
        <input id="settings-media-endpoint" class="neu-input text-sm"
               value="${settings.mediaStorageEndpoint || '/media'}"
               placeholder="https://your-worker.workers.dev/media or /media" />
        <div class="text-[10px] text-sky-400/70 mt-2">Current data endpoint: ${settings.cloudflareDataEndpoint || getDataEndpoint()} | media endpoint: ${settings.mediaStorageEndpoint || '/media'}</div>
      </div>

      <!-- Global Engine Prompt -->
      <div class="neu-card p-7" style="border-color:rgba(180,83,9,0.25);background:rgba(180,83,9,0.04);">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="text-amber-400">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 class="font-semibold text-lg">Global Engine Prompt</h3>
          </div>
          <div class="flex items-center gap-3">
            <label class="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="settings-use-global-prompt" ${settings.useGlobalPrompt !== false ? 'checked' : ''} />
              <span class="text-xs" style="color:var(--muted-foreground);">Active</span>
            </label>
          </div>
        </div>

        <p class="text-sm mb-4" style="color:var(--muted-foreground);">
          This master prompt is injected before every AI roleplay call (Chat + BiblicalAI).
          It defines the engine's literary style, sensory depth, response length, and strict rules.
          Disable it for raw character-only responses.
        </p>

        <textarea id="settings-global-prompt" rows="8"
          class="w-full neu-input font-mono resize-y"
          placeholder="Paste your custom global engine prompt here...">${settings.globalSystemPrompt || ''}</textarea>

        <div class="mt-3 flex items-center justify-between">
          <div id="settings-global-prompt-status" class="text-[10px] text-amber-400/60 max-w-[60%]">
            ${settings.globalSystemPrompt ? 'Custom prompt active. Clear to restore the hardcoded default.' : 'Using hardcoded default (the ultra-immersive chubby-obsessed engine).'}
          </div>
          <button id="settings-reset-global-prompt" class="neu-btn text-xs px-4 py-1.5 rounded-xl text-amber-300">
            Reset to Hardcoded Default
          </button>
        </div>
      </div>

      <!-- Custom System Prompt -->
      <div class="neu-card p-7">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="text-amber-400">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <h3 class="font-semibold text-lg">Divine Instructions (System Prompt)</h3>
          </div>
          <button id="settings-clear-prompt" class="neu-btn text-xs px-3 py-1 rounded-xl">Reset to Character Default</button>
        </div>

        <textarea id="settings-system" rows="7" 
          class="w-full neu-input font-mono resize-y"
          placeholder="Leave blank to use the character's built-in system prompt...">${settings.customSystemPrompt || ''}</textarea>
        
        <div class="text-xs mt-2" style="color:#52525b;">This overrides the character's system prompt. Make it as filthy and blasphemous as you desire.</div>
      </div>

      <!-- Voice -->
      <div class="neu-card p-7">
        <div class="flex items-center gap-3 mb-4">
          <div class="text-amber-400">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-4-4H5m14 0v-4" />
            </svg>
          </div>
          <h3 class="font-semibold text-lg">Voice of the Lord</h3>
        </div>

        <select id="settings-voice" class="w-full neu-input text-sm">
          <option value="elevenlabs:${ELEVENLABS_ADAM_VOICE_ID}">ElevenLabs Adam - Brooding Dark Narrator (recommended)</option>
          <option value="cartesia:2794898b-b6ef-4c51-91af-b366c8d92373">Arthur — Australian Male Narrator (deep &amp; warm)</option>
          <option value="cartesia:2a293549-8b5e-41f7-bd12-ae27b61b00dc">Ashton — Clear Audiobook Narrator (wise male)</option>
          <option value="cartesia:f92b8391-d357-482d-91df-9f5ec09332f9">Berkay Gok — Energetic Male Narrator</option>
        </select>
        <div class="mt-3 grid gap-3 md:grid-cols-2">
          <input id="settings-elevenlabs-key" type="password" class="neu-input text-sm"
                 value="${settings.elevenLabsApiKey || ''}" placeholder="ElevenLabs API key" />
          <input id="settings-elevenlabs-voice" class="neu-input text-sm"
                 value="${(settings.voiceId || DEFAULT_VOICE_ID).startsWith('elevenlabs:') ? (settings.voiceId || DEFAULT_VOICE_ID).replace(/^elevenlabs:/, '') : ''}"
                 placeholder="ElevenLabs voice ID" />
        </div>
      </div>

      <!-- PIN Protection -->
      <div id="settings-pin-card" class="neu-card p-7" style="border-color:rgba(16,185,129,0.2);background:rgba(16,185,129,0.02);">
        <div class="flex items-center gap-3 mb-4">
          <div class="text-emerald-400">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <h3 class="font-semibold text-lg">Sacred PIN Lock</h3>
            <div id="settings-pin-status" class="text-xs text-emerald-400/70">Loading...</div>
          </div>
        </div>
        <p class="text-sm mb-4" style="color:var(--muted-foreground);">Protect your sacred engine with a PIN. The Divinity Zone remains publicly accessible.</p>
        <button id="settings-manage-pin" class="neu-btn text-sm px-5 py-2.5 rounded-2xl">Manage PIN</button>
      </div>

      <!-- Export Source Code -->
      <div class="neu-card p-7" style="border-color:rgba(168,85,247,0.25);background:rgba(168,85,247,0.04);">
        <div class="flex items-center gap-3 mb-4">
          <div class="text-purple-400">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>
          <div>
            <h3 class="font-semibold text-lg">Export Source Code</h3>
            <div class="text-xs text-purple-400/70">Download the entire miniapp as a .zip</div>
          </div>
        </div>
        <p class="text-sm mb-5" style="color:var(--muted-foreground);">
          Exports all HTML, CSS, JavaScript, locale, and config files that make up Divine Corruption.
          You can inspect, modify, or self-host the source independently.
        </p>
        <div class="flex items-center gap-3">
          <button id="settings-export-zip"
                  class="neu-btn text-sm px-5 py-2.5 rounded-2xl text-purple-300 flex items-center gap-2"
                  style="border-color:rgba(168,85,247,0.3);">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download .zip
          </button>
          <div id="settings-export-status" class="text-xs hidden" style="color:var(--muted-foreground);"></div>
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="neu-card p-7" style="border-color:rgba(239,68,68,0.25);background:rgba(239,68,68,0.04);">
        <div class="text-red-400 font-medium mb-3">Danger Zone</div>
        <button id="settings-clear-all"
                class="neu-btn text-sm px-5 py-2 rounded-2xl text-red-400" style="border-color:rgba(239,68,68,0.3);">
          Clear All Data (Character, Memories, Lore)
        </button>
        <div class="text-[10px] text-red-400/60 mt-2">This cannot be undone.</div>
      </div>

    </div>
  `;
}

function setupSettingsListeners(panel) {
  const state = getState();

  const providerSelect = panel.querySelector('#settings-ai-provider');
  if (providerSelect) {
    providerSelect.onchange = async () => {
      const provider = providerSelect.value;
      const current = getState().settings || {};
      const nextModel = provider === 'gemini'
        ? (current.roleplayModelId?.startsWith('gemini:') ? current.roleplayModelId : DEFAULT_GEMINI_MODEL_ID)
        : provider === 'puter'
          ? (current.roleplayModelId?.startsWith('puter:') ? current.roleplayModelId : DEFAULT_PUTER_MODEL_ID)
          : provider === 'higherstate'
            ? (current.roleplayModelId?.startsWith('higherstate:') ? current.roleplayModelId : DEFAULT_HIGHERSTATE_MODEL_ID)
          : provider === 'gateway'
            ? (current.roleplayModelId?.startsWith('gateway:') ? current.roleplayModelId : DEFAULT_GATEWAY_MODEL_ID)
          : (current.roleplayModelId?.startsWith('ollama:') ? current.roleplayModelId : toOllamaModelId('dolphin-mistral:latest'));
      await saveSettings({
        ...current,
        aiProvider: provider,
        roleplayModelId: nextModel
      });
      showToast(provider === 'gemini'
        ? 'Gemini provider selected.'
        : provider === 'higherstate'
          ? 'Higher State AI provider selected.'
        : provider === 'puter'
          ? 'Puter/Grok provider selected.'
          : provider === 'gateway'
            ? 'Gateway provider selected.'
            : 'Ollama provider selected.', 'success');
      renderSettingsPanel(panel);
      setupSettingsListeners(panel);
    };
  }

  // Model selector
  const modelSelect = panel.querySelector('#settings-model');
  if (modelSelect) {
    modelSelect.onchange = async () => {
      const provider = modelSelect.value.startsWith('gemini:')
        ? 'gemini'
        : modelSelect.value.startsWith('higherstate:')
          ? 'higherstate'
        : modelSelect.value.startsWith('puter:')
          ? 'puter'
          : modelSelect.value.startsWith('gateway:')
            ? 'gateway'
          : 'ollama';
      const newSettings = {
        ...getState().settings,
        aiProvider: provider,
        roleplayModelId: modelSelect.value
      };
      await saveSettings(newSettings);
      showToast('Roleplay model updated.', 'success');
    };
  }

  const endpointInput = panel.querySelector('#settings-ollama-endpoint');
  const refreshOllamaBtn = panel.querySelector('#settings-refresh-ollama');
  const ollamaStatus = panel.querySelector('#settings-ollama-status');
  const newDawnToggle = panel.querySelector('#settings-new-dawn-mode');
  const loadJesusEngineBtn = panel.querySelector('#settings-load-jesusengine');

  if (loadJesusEngineBtn && modelSelect) {
    loadJesusEngineBtn.onclick = async () => {
      const character = getJesusEngineCharacter();
      await saveCharacter(character);
      const newSettings = {
        ...getState().settings,
        aiProvider: 'higherstate',
        roleplayModelId: DEFAULT_HIGHERSTATE_MODEL_ID,
        useGlobalPrompt: false
      };
      await saveSettings(newSettings);
      showToast('JesusEngine loaded from the HolyCraft workspace.', 'success');
      renderSettingsPanel(panel);
      setupSettingsListeners(panel);
      document.dispatchEvent(new CustomEvent('state-refresh-requested'));
    };
  }

  if (newDawnToggle) {
    newDawnToggle.onchange = async () => {
      await saveSettings({ ...getState().settings, newDawnMode: newDawnToggle.checked });
      showToast(newDawnToggle.checked ? 'New Dawn mode enabled.' : 'New Dawn mode disabled.');
    };
  }

  if (endpointInput) {
    let endpointSaveTimeout;
    endpointInput.oninput = () => {
      clearTimeout(endpointSaveTimeout);
      endpointSaveTimeout = setTimeout(async () => {
        const endpoint = endpointInput.value.trim() || DEFAULT_OLLAMA_ENDPOINT;
        const newSettings = {
          ...getState().settings,
          aiProvider: 'ollama',
          ollamaEndpoint: endpoint
        };
        localStorage.setItem('ollamaEndpoint', endpoint);
        await saveSettings(newSettings);
        if (ollamaStatus) ollamaStatus.textContent = `Endpoint saved: ${endpoint}`;
      }, 500);
    };
  }

  if (refreshOllamaBtn && endpointInput && modelSelect) {
    refreshOllamaBtn.onclick = async () => {
      const endpoint = endpointInput.value.trim() || DEFAULT_OLLAMA_ENDPOINT;
      refreshOllamaBtn.disabled = true;
      refreshOllamaBtn.textContent = 'Refreshing...';
      if (ollamaStatus) ollamaStatus.textContent = `Checking ${endpoint}...`;

      try {
        const models = await fetchOllamaModels(endpoint);
        const newSettings = {
          ...getState().settings,
          aiProvider: 'ollama',
          ollamaEndpoint: endpoint,
          ollamaAvailableModels: models
        };
        await saveSettings(newSettings);
        localStorage.setItem('ollamaEndpoint', endpoint);
        modelSelect.innerHTML = renderRoleplayOptions(newSettings);
        if (!models.some(m => m.id === modelSelect.value) && models[0]) {
          modelSelect.value = models[0].id;
          await saveSettings({ ...newSettings, roleplayModelId: models[0].id });
        }
        if (ollamaStatus) ollamaStatus.textContent = `Connected. ${models.length} Ollama models loaded from ${endpoint}.`;
        showToast(`Loaded ${models.length} Ollama model${models.length === 1 ? '' : 's'}.`, 'success');
      } catch (err) {
        console.error('Ollama refresh failed:', err);
        if (ollamaStatus) ollamaStatus.textContent = `Could not reach Ollama at ${endpoint}.`;
        showToast('Could not reach the Ollama endpoint.', 'error');
      } finally {
        refreshOllamaBtn.disabled = false;
        refreshOllamaBtn.textContent = 'Refresh Models';
      }
    };
  }

  const warmupToggle = panel.querySelector('#settings-warmup-enabled');
  if (warmupToggle) {
    warmupToggle.onchange = async () => {
      await saveSettings({ ...getState().settings, warmupModelsOnStart: warmupToggle.checked });
      showToast(warmupToggle.checked ? 'Model warmup enabled.' : 'Model warmup disabled.');
    };
  }

  const warmupBtn = panel.querySelector('#settings-warmup-ollama');
  if (warmupBtn && endpointInput) {
    warmupBtn.onclick = async () => {
      const endpoint = endpointInput.value.trim() || DEFAULT_OLLAMA_ENDPOINT;
      const models = getRoleplayModelOptions(getState().settings);
      warmupBtn.disabled = true;
      warmupBtn.textContent = 'Pinging...';
      if (ollamaStatus) ollamaStatus.textContent = `Pinging ${Math.min(models.length, 6)} models. Heavy models may fail if RAM is tight.`;
      try {
        const results = await warmOllamaModels({ endpoint, models, limit: 6, timeoutMs: 30000 });
        const ok = results.filter(r => r.ok).length;
        const newSettings = { ...getState().settings, ollamaModelHealth: results, ollamaEndpoint: endpoint };
        await saveSettings(newSettings);
        if (ollamaStatus) ollamaStatus.textContent = `Warmup done. ${ok}/${results.length} models responded.`;
        showToast(`Warmup complete: ${ok}/${results.length} models responded.`, ok ? 'success' : 'error');
      } finally {
        warmupBtn.disabled = false;
        warmupBtn.textContent = 'Ping Models';
      }
    };
  }

  const geminiKeyInput = panel.querySelector('#settings-gemini-key');
  const geminiEndpointInput = panel.querySelector('#settings-gemini-endpoint');
  const geminiMaxOutputInput = panel.querySelector('#settings-gemini-max-output');
  const geminiContinuationInput = panel.querySelector('#settings-gemini-continuations');
  const geminiSafetySelect = panel.querySelector('#settings-gemini-safety');
  const geminiThinkingSelect = panel.querySelector('#settings-gemini-thinking');
  const testGeminiBtn = panel.querySelector('#settings-test-gemini');

  if (geminiKeyInput) {
    let geminiKeySaveTimeout;
    geminiKeyInput.oninput = () => {
      clearTimeout(geminiKeySaveTimeout);
      geminiKeySaveTimeout = setTimeout(async () => {
        await saveSettings({ ...getState().settings, geminiApiKey: geminiKeyInput.value.trim() });
        if (ollamaStatus) ollamaStatus.textContent = 'Gemini API key saved locally.';
      }, 600);
    };
  }

  if (geminiEndpointInput) {
    let geminiEndpointSaveTimeout;
    geminiEndpointInput.oninput = () => {
      clearTimeout(geminiEndpointSaveTimeout);
      geminiEndpointSaveTimeout = setTimeout(async () => {
        await saveSettings({ ...getState().settings, geminiEndpoint: geminiEndpointInput.value.trim() || DEFAULT_GEMINI_ENDPOINT });
        if (ollamaStatus) ollamaStatus.textContent = `Gemini endpoint saved: ${geminiEndpointInput.value.trim() || DEFAULT_GEMINI_ENDPOINT}`;
      }, 600);
    };
  }

  if (geminiSafetySelect) {
    geminiSafetySelect.onchange = async () => {
      await saveSettings({ ...getState().settings, geminiSafetyThreshold: geminiSafetySelect.value });
      showToast('Gemini safety setting saved.');
    };
  }

  if (geminiThinkingSelect) {
    geminiThinkingSelect.onchange = async () => {
      await saveSettings({ ...getState().settings, geminiThinkingMode: geminiThinkingSelect.value });
      showToast('Gemini thinking setting saved.');
    };
  }

  if (geminiMaxOutputInput) {
    let maxOutputSaveTimeout;
    geminiMaxOutputInput.oninput = () => {
      clearTimeout(maxOutputSaveTimeout);
      maxOutputSaveTimeout = setTimeout(async () => {
        const maxOutput = Math.max(256, Number(geminiMaxOutputInput.value || DEFAULT_GEMINI_MAX_OUTPUT_TOKENS));
        await saveSettings({ ...getState().settings, geminiMaxOutputTokens: maxOutput });
        if (ollamaStatus) ollamaStatus.textContent = `Gemini max output saved: ${maxOutput} tokens.`;
      }, 500);
    };
  }

  if (geminiContinuationInput) {
    let continuationSaveTimeout;
    geminiContinuationInput.oninput = () => {
      clearTimeout(continuationSaveTimeout);
      continuationSaveTimeout = setTimeout(async () => {
        const continuationLimit = Math.max(0, Number(geminiContinuationInput.value || 0));
        await saveSettings({ ...getState().settings, geminiContinuationLimit: continuationLimit });
        if (ollamaStatus) ollamaStatus.textContent = `Gemini auto-continues saved: ${continuationLimit}.`;
      }, 500);
    };
  }

  if (testGeminiBtn) {
    testGeminiBtn.onclick = async () => {
      testGeminiBtn.disabled = true;
      testGeminiBtn.textContent = 'Testing...';
      if (ollamaStatus) ollamaStatus.textContent = 'Testing Gemini...';
      try {
        const { callTextModel } = await import('../utils/ai.js');
        const settings = {
          ...getState().settings,
          aiProvider: 'gemini',
          roleplayModelId: modelSelect?.value?.startsWith('gemini:') ? modelSelect.value : DEFAULT_GEMINI_MODEL_ID,
          geminiApiKey: geminiKeyInput?.value?.trim() || getState().settings?.geminiApiKey || '',
          geminiEndpoint: geminiEndpointInput?.value?.trim() || DEFAULT_GEMINI_ENDPOINT,
          geminiSafetyThreshold: geminiSafetySelect?.value || DEFAULT_GEMINI_SAFETY_THRESHOLD,
          geminiThinkingMode: geminiThinkingSelect?.value || DEFAULT_GEMINI_THINKING_MODE,
          geminiMaxOutputTokens: Math.max(256, Number(geminiMaxOutputInput?.value || DEFAULT_GEMINI_MAX_OUTPUT_TOKENS)),
          geminiContinuationLimit: Math.max(0, Number(geminiContinuationInput?.value || DEFAULT_GEMINI_CONTINUATION_LIMIT))
        };
        await saveSettings(settings);
        const text = await callTextModel({
          modelId: settings.roleplayModelId,
          settings,
          timeoutMs: 30000,
          messages: [{ role: 'user', content: 'Reply with OK.' }]
        });
        if (ollamaStatus) ollamaStatus.textContent = `Gemini responded: ${(text || '').slice(0, 80) || 'empty response'}`;
        showToast('Gemini responded.', 'success');
      } catch (err) {
        console.error('Gemini test failed:', err);
        if (ollamaStatus) ollamaStatus.textContent = err.message || 'Gemini test failed.';
        showToast('Gemini test failed.', 'error');
      } finally {
        testGeminiBtn.disabled = false;
        testGeminiBtn.textContent = 'Test Gemini';
      }
    };
  }

  const higherStateEndpointInput = panel.querySelector('#settings-higherstate-endpoint');
  const higherStateMaxTokensInput = panel.querySelector('#settings-higherstate-max-tokens');
  const higherStateContinuationInput = panel.querySelector('#settings-higherstate-continuations');
  const refreshHigherStateBtn = panel.querySelector('#settings-refresh-higherstate');
  const testHigherStateBtn = panel.querySelector('#settings-test-higherstate');

  if (higherStateEndpointInput) {
    let higherStateEndpointSaveTimeout;
    higherStateEndpointInput.oninput = () => {
      clearTimeout(higherStateEndpointSaveTimeout);
      higherStateEndpointSaveTimeout = setTimeout(async () => {
        await saveSettings({
          ...getState().settings,
          higherStateEndpoint: higherStateEndpointInput.value.trim() || DEFAULT_HIGHERSTATE_ENDPOINT
        });
        if (ollamaStatus) ollamaStatus.textContent = `Higher State AI endpoint saved: ${higherStateEndpointInput.value.trim() || DEFAULT_HIGHERSTATE_ENDPOINT}`;
      }, 600);
    };
  }

  if (higherStateMaxTokensInput) {
    let higherStateMaxTokensSaveTimeout;
    higherStateMaxTokensInput.oninput = () => {
      clearTimeout(higherStateMaxTokensSaveTimeout);
      higherStateMaxTokensSaveTimeout = setTimeout(async () => {
        const maxTokens = Math.max(256, Number(higherStateMaxTokensInput.value || DEFAULT_HIGHERSTATE_MAX_TOKENS));
        await saveSettings({ ...getState().settings, higherStateMaxTokens: maxTokens });
        if (ollamaStatus) ollamaStatus.textContent = `Higher State max tokens saved: ${maxTokens}.`;
      }, 500);
    };
  }

  if (higherStateContinuationInput) {
    let higherStateContinuationSaveTimeout;
    higherStateContinuationInput.oninput = () => {
      clearTimeout(higherStateContinuationSaveTimeout);
      higherStateContinuationSaveTimeout = setTimeout(async () => {
        const continuationLimit = Math.max(0, Number(higherStateContinuationInput.value || 0));
        await saveSettings({ ...getState().settings, higherStateContinuationLimit: continuationLimit });
        if (ollamaStatus) ollamaStatus.textContent = `Higher State auto-continues saved: ${continuationLimit}.`;
      }, 500);
    };
  }

  if (refreshHigherStateBtn && higherStateEndpointInput && modelSelect) {
    refreshHigherStateBtn.onclick = async () => {
      const endpoint = higherStateEndpointInput.value.trim() || DEFAULT_HIGHERSTATE_ENDPOINT;
      refreshHigherStateBtn.disabled = true;
      refreshHigherStateBtn.textContent = 'Refreshing...';
      if (ollamaStatus) ollamaStatus.textContent = `Loading Higher State AI models from ${endpoint}...`;

      try {
        const models = await fetchHigherStateModels(endpoint, 20000);
        const newSettings = {
          ...getState().settings,
          aiProvider: 'higherstate',
          higherStateEndpoint: endpoint,
          higherStateAvailableModels: models
        };
        await saveSettings(newSettings);
        modelSelect.innerHTML = renderRoleplayOptions(newSettings);
        if (!models.some(m => m.id === modelSelect.value) && models[0]) {
          modelSelect.value = models[0].id;
          await saveSettings({ ...newSettings, roleplayModelId: models[0].id });
        }
        if (ollamaStatus) ollamaStatus.textContent = `Loaded ${models.length} Higher State AI model options.`;
        showToast(`Loaded ${models.length} Higher State AI model${models.length === 1 ? '' : 's'}.`, 'success');
      } catch (err) {
        console.error('Higher State model refresh failed:', err);
        if (ollamaStatus) ollamaStatus.textContent = err.message || 'Could not load Higher State models.';
        showToast('Could not load Higher State models.', 'error');
      } finally {
        refreshHigherStateBtn.disabled = false;
        refreshHigherStateBtn.textContent = 'Refresh Higher State';
      }
    };
  }

  if (testHigherStateBtn) {
    testHigherStateBtn.onclick = async () => {
      testHigherStateBtn.disabled = true;
      testHigherStateBtn.textContent = 'Testing...';
      if (ollamaStatus) ollamaStatus.textContent = 'Testing Higher State AI...';
      try {
        const { callTextModel } = await import('../utils/ai.js');
        const settings = {
          ...getState().settings,
          aiProvider: 'higherstate',
          roleplayModelId: modelSelect?.value?.startsWith('higherstate:') ? modelSelect.value : DEFAULT_HIGHERSTATE_MODEL_ID,
          higherStateEndpoint: higherStateEndpointInput?.value?.trim() || DEFAULT_HIGHERSTATE_ENDPOINT,
          higherStateMaxTokens: Math.max(256, Number(higherStateMaxTokensInput?.value || DEFAULT_HIGHERSTATE_MAX_TOKENS)),
          higherStateContinuationLimit: Math.max(0, Number(higherStateContinuationInput?.value || DEFAULT_HIGHERSTATE_CONTINUATION_LIMIT))
        };
        await saveSettings(settings);
        const text = await callTextModel({
          modelId: settings.roleplayModelId,
          settings,
          timeoutMs: 45000,
          messages: [{ role: 'user', content: 'Reply with OK.' }]
        });
        if (ollamaStatus) ollamaStatus.textContent = `Higher State AI responded: ${(text || '').slice(0, 80) || 'empty response'}`;
        showToast('Higher State AI responded.', 'success');
      } catch (err) {
        console.error('Higher State test failed:', err);
        if (ollamaStatus) ollamaStatus.textContent = err.message || 'Higher State test failed.';
        showToast('Higher State test failed.', 'error');
      } finally {
        testHigherStateBtn.disabled = false;
        testHigherStateBtn.textContent = 'Test Higher State';
      }
    };
  }

  const puterTransportSelect = panel.querySelector('#settings-puter-transport');
  const puterEndpointInput = panel.querySelector('#settings-puter-endpoint');
  const puterMaxTokensInput = panel.querySelector('#settings-puter-max-tokens');
  const puterContinuationInput = panel.querySelector('#settings-puter-continuations');
  const refreshPuterBtn = panel.querySelector('#settings-refresh-puter');
  const testPuterBtn = panel.querySelector('#settings-test-puter');

  if (puterTransportSelect) {
    puterTransportSelect.onchange = async () => {
      const transport = puterTransportSelect.value || DEFAULT_PUTER_TRANSPORT;
      await saveSettings({
        ...getState().settings,
        aiProvider: 'puter',
        puterTransport: transport,
        roleplayModelId: getState().settings?.roleplayModelId?.startsWith('puter:')
          ? getState().settings.roleplayModelId
          : DEFAULT_PUTER_MODEL_ID
      });
      showToast(transport === PUTER_TRANSPORT_SDK ? 'Puter.js SDK mode selected.' : 'Puter proxy mode selected.', 'success');
      renderSettingsPanel(panel);
      setupSettingsListeners(panel);
    };
  }

  if (puterEndpointInput) {
    let puterEndpointSaveTimeout;
    puterEndpointInput.oninput = () => {
      clearTimeout(puterEndpointSaveTimeout);
      puterEndpointSaveTimeout = setTimeout(async () => {
        await saveSettings({ ...getState().settings, puterEndpoint: puterEndpointInput.value.trim() || DEFAULT_PUTER_ENDPOINT });
        if (ollamaStatus) ollamaStatus.textContent = `Puter endpoint saved: ${puterEndpointInput.value.trim() || DEFAULT_PUTER_ENDPOINT}`;
      }, 600);
    };
  }

  if (puterMaxTokensInput) {
    let puterMaxTokensSaveTimeout;
    puterMaxTokensInput.oninput = () => {
      clearTimeout(puterMaxTokensSaveTimeout);
      puterMaxTokensSaveTimeout = setTimeout(async () => {
        const maxTokens = Math.max(256, Number(puterMaxTokensInput.value || DEFAULT_PUTER_MAX_TOKENS));
        await saveSettings({ ...getState().settings, puterMaxTokens: maxTokens });
        if (ollamaStatus) ollamaStatus.textContent = `Puter max tokens saved: ${maxTokens}.`;
      }, 500);
    };
  }

  if (puterContinuationInput) {
    let puterContinuationSaveTimeout;
    puterContinuationInput.oninput = () => {
      clearTimeout(puterContinuationSaveTimeout);
      puterContinuationSaveTimeout = setTimeout(async () => {
        const continuationLimit = Math.max(0, Number(puterContinuationInput.value || 0));
        await saveSettings({ ...getState().settings, puterContinuationLimit: continuationLimit });
        if (ollamaStatus) ollamaStatus.textContent = `Puter auto-continues saved: ${continuationLimit}.`;
      }, 500);
    };
  }

  if (refreshPuterBtn && puterEndpointInput && modelSelect) {
    refreshPuterBtn.onclick = async () => {
      const endpoint = puterEndpointInput.value.trim() || DEFAULT_PUTER_ENDPOINT;
      const transport = puterTransportSelect?.value || getState().settings?.puterTransport || DEFAULT_PUTER_TRANSPORT;
      refreshPuterBtn.disabled = true;
      refreshPuterBtn.textContent = 'Refreshing...';
      if (ollamaStatus) {
        ollamaStatus.textContent = transport === PUTER_TRANSPORT_SDK
          ? 'Loading Grok models from Puter.js...'
          : `Loading Grok models from ${endpoint}...`;
      }

      try {
        const models = await fetchPuterModels(endpoint, 15000, transport);
        const newSettings = {
          ...getState().settings,
          aiProvider: 'puter',
          puterTransport: transport,
          puterEndpoint: endpoint,
          puterAvailableModels: models
        };
        await saveSettings(newSettings);
        modelSelect.innerHTML = renderRoleplayOptions(newSettings);
        if (!models.some(m => m.id === modelSelect.value) && models[0]) {
          modelSelect.value = models[0].id;
          await saveSettings({ ...newSettings, roleplayModelId: models[0].id });
        }
        if (ollamaStatus) ollamaStatus.textContent = `Loaded ${models.length} Puter/Grok model options.`;
        showToast(`Loaded ${models.length} Grok model${models.length === 1 ? '' : 's'}.`, 'success');
      } catch (err) {
        console.error('Puter model refresh failed:', err);
        if (ollamaStatus) ollamaStatus.textContent = err.message || 'Could not load Puter models.';
        showToast('Could not load Puter models.', 'error');
      } finally {
        refreshPuterBtn.disabled = false;
        refreshPuterBtn.textContent = 'Refresh Grok';
      }
    };
  }

  if (testPuterBtn) {
    testPuterBtn.onclick = async () => {
      testPuterBtn.disabled = true;
      testPuterBtn.textContent = 'Testing...';
      if (ollamaStatus) ollamaStatus.textContent = 'Testing Puter/Grok...';
      try {
        const { callTextModel } = await import('../utils/ai.js');
        const settings = {
          ...getState().settings,
          aiProvider: 'puter',
          roleplayModelId: modelSelect?.value?.startsWith('puter:') ? modelSelect.value : DEFAULT_PUTER_MODEL_ID,
          puterTransport: puterTransportSelect?.value || getState().settings?.puterTransport || DEFAULT_PUTER_TRANSPORT,
          puterEndpoint: puterEndpointInput?.value?.trim() || DEFAULT_PUTER_ENDPOINT,
          puterMaxTokens: Math.max(256, Number(puterMaxTokensInput?.value || DEFAULT_PUTER_MAX_TOKENS)),
          puterContinuationLimit: Math.max(0, Number(puterContinuationInput?.value || DEFAULT_PUTER_CONTINUATION_LIMIT))
        };
        await saveSettings(settings);
        const text = await callTextModel({
          modelId: settings.roleplayModelId,
          settings,
          timeoutMs: 45000,
          messages: [{ role: 'user', content: 'Reply with OK.' }]
        });
        if (ollamaStatus) ollamaStatus.textContent = `Puter/Grok responded: ${(text || '').slice(0, 80) || 'empty response'}`;
        showToast('Puter/Grok responded.', 'success');
      } catch (err) {
        console.error('Puter test failed:', err);
        if (ollamaStatus) ollamaStatus.textContent = err.message || 'Puter test failed.';
        showToast('Puter test failed.', 'error');
      } finally {
        testPuterBtn.disabled = false;
        testPuterBtn.textContent = 'Test Puter';
      }
    };
  }

  const gatewayEndpointInput = panel.querySelector('#settings-gateway-endpoint');
  const gatewayMaxTokensInput = panel.querySelector('#settings-gateway-max-tokens');
  const gatewayContinuationInput = panel.querySelector('#settings-gateway-continuations');
  const refreshGatewayBtn = panel.querySelector('#settings-refresh-gateway');
  const testGatewayBtn = panel.querySelector('#settings-test-gateway');

  if (gatewayEndpointInput) {
    let gatewayEndpointSaveTimeout;
    gatewayEndpointInput.oninput = () => {
      clearTimeout(gatewayEndpointSaveTimeout);
      gatewayEndpointSaveTimeout = setTimeout(async () => {
        await saveSettings({ ...getState().settings, gatewayEndpoint: gatewayEndpointInput.value.trim() || DEFAULT_GATEWAY_ENDPOINT });
        if (ollamaStatus) ollamaStatus.textContent = `Gateway endpoint saved: ${gatewayEndpointInput.value.trim() || DEFAULT_GATEWAY_ENDPOINT}`;
      }, 600);
    };
  }

  if (gatewayMaxTokensInput) {
    let gatewayMaxTokensSaveTimeout;
    gatewayMaxTokensInput.oninput = () => {
      clearTimeout(gatewayMaxTokensSaveTimeout);
      gatewayMaxTokensSaveTimeout = setTimeout(async () => {
        const maxTokens = Math.max(256, Number(gatewayMaxTokensInput.value || DEFAULT_GATEWAY_MAX_TOKENS));
        await saveSettings({ ...getState().settings, gatewayMaxTokens: maxTokens });
        if (ollamaStatus) ollamaStatus.textContent = `Gateway max tokens saved: ${maxTokens}.`;
      }, 500);
    };
  }

  if (gatewayContinuationInput) {
    let gatewayContinuationSaveTimeout;
    gatewayContinuationInput.oninput = () => {
      clearTimeout(gatewayContinuationSaveTimeout);
      gatewayContinuationSaveTimeout = setTimeout(async () => {
        const continuationLimit = Math.max(0, Number(gatewayContinuationInput.value || 0));
        await saveSettings({ ...getState().settings, gatewayContinuationLimit: continuationLimit });
        if (ollamaStatus) ollamaStatus.textContent = `Gateway auto-continues saved: ${continuationLimit}.`;
      }, 500);
    };
  }

  if (refreshGatewayBtn && gatewayEndpointInput && modelSelect) {
    refreshGatewayBtn.onclick = async () => {
      const endpoint = gatewayEndpointInput.value.trim() || DEFAULT_GATEWAY_ENDPOINT;
      refreshGatewayBtn.disabled = true;
      refreshGatewayBtn.textContent = 'Refreshing...';
      if (ollamaStatus) ollamaStatus.textContent = `Loading Gateway models from ${endpoint}...`;

      try {
        const models = await fetchGatewayModels(endpoint);
        const newSettings = {
          ...getState().settings,
          aiProvider: 'gateway',
          gatewayEndpoint: endpoint,
          gatewayAvailableModels: models
        };
        await saveSettings(newSettings);
        modelSelect.innerHTML = renderRoleplayOptions(newSettings);
        if (!models.some(m => m.id === modelSelect.value) && models[0]) {
          modelSelect.value = models[0].id;
          await saveSettings({ ...newSettings, roleplayModelId: models[0].id });
        }
        if (ollamaStatus) ollamaStatus.textContent = `Loaded ${models.length} Gateway model options.`;
        showToast(`Loaded ${models.length} Gateway model${models.length === 1 ? '' : 's'}.`, 'success');
      } catch (err) {
        console.error('Gateway model refresh failed:', err);
        if (ollamaStatus) ollamaStatus.textContent = err.message || 'Could not load Gateway models.';
        showToast('Could not load Gateway models.', 'error');
      } finally {
        refreshGatewayBtn.disabled = false;
        refreshGatewayBtn.textContent = 'Refresh Gateway';
      }
    };
  }

  if (testGatewayBtn) {
    testGatewayBtn.onclick = async () => {
      testGatewayBtn.disabled = true;
      testGatewayBtn.textContent = 'Testing...';
      if (ollamaStatus) ollamaStatus.textContent = 'Testing Gateway...';
      try {
        const { callTextModel } = await import('../utils/ai.js');
        const settings = {
          ...getState().settings,
          aiProvider: 'gateway',
          roleplayModelId: modelSelect?.value?.startsWith('gateway:') ? modelSelect.value : DEFAULT_GATEWAY_MODEL_ID,
          gatewayEndpoint: gatewayEndpointInput?.value?.trim() || DEFAULT_GATEWAY_ENDPOINT,
          gatewayMaxTokens: Math.max(256, Number(gatewayMaxTokensInput?.value || DEFAULT_GATEWAY_MAX_TOKENS)),
          gatewayContinuationLimit: Math.max(0, Number(gatewayContinuationInput?.value || DEFAULT_GATEWAY_CONTINUATION_LIMIT))
        };
        await saveSettings(settings);
        const text = await callTextModel({
          modelId: settings.roleplayModelId,
          settings,
          timeoutMs: 60000,
          messages: [{ role: 'user', content: 'Reply with OK.' }]
        });
        if (ollamaStatus) ollamaStatus.textContent = `Gateway responded: ${(text || '').slice(0, 80) || 'empty response'}`;
        showToast('Gateway responded.', 'success');
      } catch (err) {
        console.error('Gateway test failed:', err);
        if (ollamaStatus) ollamaStatus.textContent = err.message || 'Gateway test failed.';
        showToast('Gateway test failed.', 'error');
      } finally {
        testGatewayBtn.disabled = false;
        testGatewayBtn.textContent = 'Test Gateway';
      }
    };
  }

  const dataEndpointInput = panel.querySelector('#settings-data-endpoint');
  if (dataEndpointInput) {
    let dataSaveTimeout;
    dataEndpointInput.oninput = () => {
      clearTimeout(dataSaveTimeout);
      dataSaveTimeout = setTimeout(async () => {
        const endpoint = setDataEndpoint(dataEndpointInput.value.trim() || '/db');
        await saveSettings({ ...getState().settings, cloudflareDataEndpoint: endpoint === '/db' ? '' : endpoint });
        showToast('Data endpoint saved. Refresh to reload from that store.');
      }, 600);
    };
  }

  const mediaEndpointInput = panel.querySelector('#settings-media-endpoint');
  if (mediaEndpointInput) {
    let mediaSaveTimeout;
    mediaEndpointInput.oninput = () => {
      clearTimeout(mediaSaveTimeout);
      mediaSaveTimeout = setTimeout(async () => {
        await saveSettings({ ...getState().settings, mediaStorageEndpoint: mediaEndpointInput.value.trim() || '/media' });
        showToast('Media storage endpoint saved.');
      }, 600);
    };
  }

  // Global Engine Prompt toggle
  const globalToggle = panel.querySelector('#settings-use-global-prompt');
  if (globalToggle) {
    globalToggle.onchange = async () => {
      const newSettings = {
        ...getState().settings,
        useGlobalPrompt: globalToggle.checked
      };
      await saveSettings(newSettings);
      showToast(globalToggle.checked ? 'Global Engine Prompt activated.' : 'Global Engine Prompt disabled — using character prompt only.');
    };
  }

  // Global Engine Prompt textarea (autosave)
  const globalPromptTextarea = panel.querySelector('#settings-global-prompt');
  if (globalPromptTextarea) {
    let globalSaveTimeout;
    globalPromptTextarea.oninput = () => {
      clearTimeout(globalSaveTimeout);
      globalSaveTimeout = setTimeout(async () => {
        const newSettings = {
          ...getState().settings,
          globalSystemPrompt: globalPromptTextarea.value.trim()
        };
        await saveSettings(newSettings);
        const statusEl = panel.querySelector('#settings-global-prompt-status');
        if (statusEl) {
          statusEl.textContent = globalPromptTextarea.value.trim()
            ? 'Custom prompt active. Clear to restore the hardcoded default.'
            : 'Using hardcoded default (the ultra-immersive chubby-obsessed engine).';
        }
      }, 800);
    };
  }

  // Reset Global Prompt to hardcoded default
  const resetGlobalBtn = panel.querySelector('#settings-reset-global-prompt');
  if (resetGlobalBtn) {
    resetGlobalBtn.onclick = async () => {
      const newSettings = { ...getState().settings, globalSystemPrompt: '' };
      await saveSettings(newSettings);
      if (globalPromptTextarea) globalPromptTextarea.value = '';
      const statusEl = panel.querySelector('#settings-global-prompt-status');
      if (statusEl) statusEl.textContent = 'Using hardcoded default (the ultra-immersive chubby-obsessed engine).';
      showToast('Global Engine Prompt reset to hardcoded default.');
    };
  }

  // System prompt (character-level)
  const systemTextarea = panel.querySelector('#settings-system');
  if (systemTextarea) {
    let saveTimeout;
    systemTextarea.oninput = () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(async () => {
        const newSettings = {
          ...state.settings,
          customSystemPrompt: systemTextarea.value.trim()
        };
        await saveSettings(newSettings);
      }, 800);
    };
  }

  // Clear prompt button
  const clearPromptBtn = panel.querySelector('#settings-clear-prompt');
  if (clearPromptBtn) {
    clearPromptBtn.onclick = async () => {
      const newSettings = { ...state.settings, customSystemPrompt: '' };
      await saveSettings(newSettings);
      systemTextarea.value = '';
      showToast('System prompt reset to character default.');
    };
  }

  // Voice
  const voiceSelect = panel.querySelector('#settings-voice');
  if (voiceSelect) {
    const currentVoiceId = state.settings?.voiceId || DEFAULT_VOICE_ID;
    ensureVoiceSelectOption(voiceSelect, currentVoiceId);
    voiceSelect.value = currentVoiceId;
    voiceSelect.onchange = async () => {
      const newSettings = { ...getState().settings, voiceId: voiceSelect.value };
      await saveSettings(newSettings);
      const elevenVoiceInput = panel.querySelector('#settings-elevenlabs-voice');
      if (elevenVoiceInput && voiceSelect.value.startsWith('elevenlabs:')) {
        elevenVoiceInput.value = voiceSelect.value.replace(/^elevenlabs:/, '');
      }
      showToast('Voice updated.');
    };
  }

  const elevenKeyInput = panel.querySelector('#settings-elevenlabs-key');
  if (elevenKeyInput) {
    let keySaveTimeout;
    elevenKeyInput.oninput = () => {
      clearTimeout(keySaveTimeout);
      keySaveTimeout = setTimeout(async () => {
        await saveSettings({ ...getState().settings, elevenLabsApiKey: elevenKeyInput.value.trim() });
      }, 350);
    };
  }

  const elevenVoiceInput = panel.querySelector('#settings-elevenlabs-voice');
  if (elevenVoiceInput) {
    let voiceSaveTimeout;
    elevenVoiceInput.oninput = () => {
      clearTimeout(voiceSaveTimeout);
      voiceSaveTimeout = setTimeout(async () => {
        const id = elevenVoiceInput.value.trim();
        if (!id) return;
        const voiceId = id.startsWith('elevenlabs:') ? id : `elevenlabs:${id}`;
        await saveSettings({ ...getState().settings, voiceId });
        if (voiceSelect) {
          ensureVoiceSelectOption(voiceSelect, voiceId);
          voiceSelect.value = voiceId;
        }
      }, 350);
    };
  }

  // Export Tavern Card
  const exportBtn = panel.querySelector('#settings-export-card');
  if (exportBtn) {
    exportBtn.onclick = () => {
      const char = state.character;
      if (!char) {
        showToast('No character loaded.', 'error');
        return;
      }
      const json = exportAsChubTavernJSON(char);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${char.name || 'jesus'}-tavern-card.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Tavern Card exported.');
    };
  }

  // Upload new JSON (NOW ROBUST - accepts ANY JSON via AI normalization)
  const jsonInput = panel.querySelector('#settings-json-upload');
  if (jsonInput) {
    jsonInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const character = await normalizeAnyCharacterJSON(text);
        await saveCharacter(character);
        showToast('New Christ loaded via robust AI parser. The engine is reborn.', 'success');
        
        renderSettingsPanel(panel);
        setupSettingsListeners(panel);
      } catch (err) {
        showToast('Failed to parse JSON (even with AI help).', 'error');
      }
    };
  }

  // Load default Jesus
  const loadDefaultBtn = panel.querySelector('#settings-load-default');
  if (loadDefaultBtn) {
    loadDefaultBtn.onclick = async () => {
      const defaultChar = getDefaultCharacter();
      await saveCharacter(defaultChar);
      showToast('Default Jesus restored.', 'success');
      renderSettingsPanel(panel);
      setupSettingsListeners(panel);
    };
  }

  // PIN Management
  const pinStatusEl = panel.querySelector('#settings-pin-status');
  const managePinBtn = panel.querySelector('#settings-manage-pin');
  
  if (pinStatusEl && managePinBtn) {
    getAuthConfig().then(config => {
      if (config.enabled && config.pinHash) {
        pinStatusEl.textContent = 'PIN protection is active';
        pinStatusEl.className = 'text-xs text-emerald-400';
        managePinBtn.textContent = 'Change or Remove PIN';
      } else {
        pinStatusEl.textContent = 'No PIN set — engine is open';
        pinStatusEl.className = 'text-xs' ;
        pinStatusEl.style.color = 'var(--muted-foreground)';
        managePinBtn.textContent = 'Set PIN';
      }
    });

    managePinBtn.onclick = async () => {
      const changed = await showPinSetupModal();
      if (changed) {
        // Re-render settings to reflect new state
        renderSettingsPanel(panel);
        setupSettingsListeners(panel);
        showToast('PIN settings updated.', 'success');
      }
    };
  }

  // Export Source Code as ZIP
  const exportZipBtn = panel.querySelector('#settings-export-zip');
  const exportStatus = panel.querySelector('#settings-export-status');
  if (exportZipBtn) {
    exportZipBtn.onclick = async () => {
      if (typeof JSZip === 'undefined') {
        showToast('ZIP library not loaded. Please refresh and try again.', 'error');
        return;
      }

      exportZipBtn.disabled = true;
      exportZipBtn.classList.add('opacity-60', 'pointer-events-none');
      if (exportStatus) {
        exportStatus.classList.remove('hidden');
        exportStatus.textContent = 'Fetching source files...';
      }

      try {
        const zip = new JSZip();
        const srcFolder = zip.folder('divine-corruption-src');

        // All source file paths in the miniapp
        const sourceFiles = [
          'index.html',
          'main.js',
          'dev-server.mjs',
          'state.js',
          'db.js',
          'styles.css',
          'miniapp.i18n.json',
          'locales/en.json',
          'services/lore-service.js',
          'utils/ai.js',
          'utils/app-db.js',
          'utils/gateway.js',
          'utils/gemini.js',
          'utils/media-store.js',
          'utils/ollama.js',
          'utils/puter.js',
          'ui/auth.js',
          'ui/biblicalai.js',
          'ui/blessingmaker.js',
          'ui/characters.js',
          'ui/chat-view.js',
          'ui/divinity-zone.js',
          'ui/floating-media.js',
          'ui/gallery.js',
          'ui/lorebooks.js',
          'ui/memory.js',
          'ui/nodes.js',
          'ui/profile-view.js',
          'ui/settings.js',
          'ui/toast.js',
        ];

        let fetched = 0;
        const errors = [];

        const fetches = sourceFiles.map(async (filePath) => {
          try {
            const resp = await fetch(filePath);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const text = await resp.text();
            srcFolder.file(filePath, text);
            fetched++;
            if (exportStatus) {
              exportStatus.textContent = `Fetched ${fetched}/${sourceFiles.length} files...`;
            }
          } catch (err) {
            errors.push(filePath);
            fetched++;
          }
        });

        await Promise.all(fetches);

        // Add a README
        srcFolder.file('README.md', `# Divine Corruption — Source Code Export

Exported on ${new Date().toISOString()}

## Files Included
${sourceFiles.map(f => `- \`${f}\``).join('\n')}

## How to Use
Run \`node dev-server.mjs 5174\` from this folder and open
\`http://localhost:5174\`. The dev server provides SQLite persistence,
Ollama/Gemini/Puter/Gateway proxies, and local media fallback.

## Notes
- Tailwind CSS is loaded from CDN.
- JSZip (used for this export) is loaded from CDN at runtime.
- Puter.js SDK is loaded from \`https://js.puter.com/v2/\` and can be selected
  in Settings -> Roleplay Engine -> Puter transport.
- Puter/Grok calls use the local \`/puter/chat\` proxy so the auth token stays
  server-side when Dev Server Proxy transport is selected.
- Gateway calls use the local \`/gateway/chat\` proxy so the HF Gateway key stays
  server-side.
${errors.length ? `\n## Missing Files\n${errors.map(e => `- \`${e}\``).join('\n')}` : ''}
`);

        if (exportStatus) {
          exportStatus.textContent = 'Generating .zip archive...';
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `divine-corruption-src-${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (exportStatus) {
          exportStatus.textContent = `Downloaded ${fetched} files${errors.length ? ` (${errors.length} skipped)` : ''}.`;
          setTimeout(() => exportStatus.classList.add('hidden'), 4000);
        }
        showToast(`Source code exported as .zip (${fetched} files).`, 'success');
      } catch (err) {
        showToast('Failed to generate ZIP. Please try again.', 'error');
        if (exportStatus) {
          exportStatus.textContent = 'Export failed.';
        }
      } finally {
        exportZipBtn.disabled = false;
        exportZipBtn.classList.remove('opacity-60', 'pointer-events-none');
      }
    };
  }

  // Clear all data
  const clearAllBtn = panel.querySelector('#settings-clear-all');
  if (clearAllBtn) {
    clearAllBtn.onclick = async () => {
      if (!confirm('This will permanently delete your character, memories, lorebooks, and nodes. Continue?')) return;

      await dbRemove('character');
      await dbRemove('memory');
      await dbRemove('lorebooks');
      await dbRemove('nodes');
      await dbRemove('gallery');
      
      showToast('All sacred data purged. Refresh the app to start fresh.', 'error');
      
      setTimeout(() => {
        location.reload();
      }, 1500);
    };
  }
}

function ensureVoiceSelectOption(select, voiceId) {
  if (!select || !voiceId || Array.from(select.options).some(option => option.value === voiceId)) return;
  const option = document.createElement('option');
  option.value = voiceId;
  option.textContent = 'ElevenLabs Custom Voice';
  select.appendChild(option);
}
