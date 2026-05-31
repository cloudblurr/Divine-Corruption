// utils/ollama.js - Ollama model discovery and chat adapter

export const OLLAMA_MODEL_PREFIX = 'ollama:';
export const DEFAULT_OLLAMA_ENDPOINT = '/ollama';
export const DEFAULT_OLLAMA_MODEL = 'dolphin-mistral:latest';
export const DEFAULT_ROLEPLAY_MODEL_ID = `${OLLAMA_MODEL_PREFIX}${DEFAULT_OLLAMA_MODEL}`;

export const DISCOVERED_OLLAMA_MODELS = [
  {
    id: `${OLLAMA_MODEL_PREFIX}dolphin-mistral:latest`,
    name: 'Dolphin Mistral',
    desc: 'Ollama VM - verified working, Llama 7B, Q4_0',
    tier: 10
  },
  {
    id: `${OLLAMA_MODEL_PREFIX}fluffy/l3-8b-stheno-v3.2:q4_K_M`,
    name: 'Stheno v3.2 8B',
    desc: 'Ollama VM - Llama 3 roleplay model, Q4_K_M',
    tier: 10
  },
  {
    id: `${OLLAMA_MODEL_PREFIX}sunapi386/llama-3-lexi-uncensored:8b`,
    name: 'Llama 3 Lexi 8B',
    desc: 'Ollama VM - Llama 3, Q4_K_M',
    tier: 9
  },
  {
    id: `${OLLAMA_MODEL_PREFIX}gurubot/TopicalStorm-uncensored:8b-q4_K_M`,
    name: 'TopicalStorm 8B',
    desc: 'Ollama VM - Llama 8B, Q4_K_M',
    tier: 9
  },
  {
    id: `${OLLAMA_MODEL_PREFIX}CognitiveComputations/dolphin-mistral-nemo:latest`,
    name: 'Dolphin Mistral Nemo',
    desc: 'Ollama VM - 12.2B, Q4_0',
    tier: 8
  },
  {
    id: `${OLLAMA_MODEL_PREFIX}dolphin3:latest`,
    name: 'Dolphin 3',
    desc: 'Ollama VM - Llama 8B, Q4_K_M',
    tier: 8
  },
  {
    id: `${OLLAMA_MODEL_PREFIX}dolphin-llama3:latest`,
    name: 'Dolphin Llama 3',
    desc: 'Ollama VM - Llama 8B, Q4_0',
    tier: 8
  },
  {
    id: `${OLLAMA_MODEL_PREFIX}nous-hermes2:latest`,
    name: 'Nous Hermes 2',
    desc: 'Ollama VM - Llama 11B, Q4_0',
    tier: 7
  },
  {
    id: `${OLLAMA_MODEL_PREFIX}huihui_ai/qwen3-abliterated:8b`,
    name: 'Qwen3 Abliterated 8B',
    desc: 'Ollama VM - Qwen3 8.2B, Q4_K_M',
    tier: 7
  },
  {
    id: `${OLLAMA_MODEL_PREFIX}openchat:latest`,
    name: 'OpenChat',
    desc: 'Ollama VM - Llama 7B, Q4_0',
    tier: 6
  },
  {
    id: `${OLLAMA_MODEL_PREFIX}wizardlm2:7b`,
    name: 'WizardLM2 7B',
    desc: 'Ollama VM - Llama 7B, Q4_0',
    tier: 6
  },
  {
    id: `${OLLAMA_MODEL_PREFIX}thirdeyeai/Qwen2.5-Coder-7B-Instruct-Uncensored:Q4_0`,
    name: 'Qwen2.5 Coder 7B',
    desc: 'Ollama VM - Qwen2 coder model',
    tier: 5
  },
  {
    id: `${OLLAMA_MODEL_PREFIX}dolphincoder:7b`,
    name: 'DolphinCoder 7B',
    desc: 'Ollama VM - StarCoder2 7B, Q4_0',
    tier: 5
  }
];

export function toOllamaModelId(modelName) {
  if (!modelName) return DEFAULT_ROLEPLAY_MODEL_ID;
  return modelName.startsWith(OLLAMA_MODEL_PREFIX)
    ? modelName
    : `${OLLAMA_MODEL_PREFIX}${modelName}`;
}

export function isOllamaModelId(modelId) {
  return typeof modelId === 'string' && modelId.startsWith(OLLAMA_MODEL_PREFIX);
}

export function stripOllamaPrefix(modelId) {
  if (!modelId) return DEFAULT_OLLAMA_MODEL;
  return isOllamaModelId(modelId) ? modelId.slice(OLLAMA_MODEL_PREFIX.length) : modelId;
}

export function normalizeOllamaEndpoint(endpoint) {
  let value = (endpoint || DEFAULT_OLLAMA_ENDPOINT).trim();
  if (!value) value = DEFAULT_OLLAMA_ENDPOINT;
  value = value.replace(/\/+$/, '');
  if (value.endsWith('/api')) value = value.slice(0, -4);
  return value || DEFAULT_OLLAMA_ENDPOINT;
}

export function getConfiguredOllamaEndpoint(settings = {}) {
  const localValue = typeof localStorage !== 'undefined'
    ? localStorage.getItem('ollamaEndpoint')
    : '';
  const windowValue = typeof window !== 'undefined' ? window.__OLLAMA_ENDPOINT__ : '';
  return normalizeOllamaEndpoint(settings.ollamaEndpoint || localValue || windowValue || DEFAULT_OLLAMA_ENDPOINT);
}

export function mapOllamaTagToModel(tag) {
  const name = tag?.model || tag?.name;
  if (!name) return null;
  const details = tag.details || {};
  const bits = [
    details.family || details.families?.[0],
    details.parameter_size,
    details.quantization_level
  ].filter(Boolean);

  return {
    id: toOllamaModelId(name),
    name,
    desc: tag.manifest
      ? `Ollama manifest - ${tag.namespace || 'local'}:${tag.tag || 'latest'}`
      : bits.length ? `Ollama VM - ${bits.join(', ')}` : 'Ollama VM model',
    tier: 6
  };
}

export function mergeModelOptions(...groups) {
  const seen = new Set();
  const merged = [];
  groups.flat().filter(Boolean).forEach(model => {
    if (!model.id || seen.has(model.id)) return;
    seen.add(model.id);
    merged.push(model);
  });
  return merged;
}

export async function fetchOllamaModels(endpoint, timeoutMs = 10000) {
  const base = normalizeOllamaEndpoint(endpoint);
  const localModels = base === '/ollama'
    ? await fetchOllamaLocalManifestModels(timeoutMs).catch(() => [])
    : [];

  const apiModels = await fetchOllamaApiModels(base, timeoutMs).catch((err) => {
    if (localModels.length) return [];
    throw err;
  });

  return mergeModelOptions(localModels, apiModels);
}

async function fetchOllamaLocalManifestModels(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('/ollama-local-models', {
      method: 'GET',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Local Ollama manifests failed with HTTP ${response.status}`);
    const data = await response.json();
    return (data.models || []).map(mapOllamaTagToModel).filter(Boolean);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOllamaApiModels(base, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${base}/api/tags`, {
      method: 'GET',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Ollama tags failed with HTTP ${response.status}`);
    const data = await response.json();
    return (data.models || []).map(mapOllamaTagToModel).filter(Boolean);
  } finally {
    clearTimeout(timer);
  }
}

export async function callOllamaChat({
  endpoint,
  model,
  messages,
  timeoutMs = 90000,
  keepAlive = '30m',
  options = {}
}) {
  const base = normalizeOllamaEndpoint(endpoint);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: stripOllamaPrefix(model),
        messages: normalizeMessages(messages),
        stream: false,
        keep_alive: keepAlive,
        options: {
          temperature: 0.9,
          top_p: 0.95,
          num_ctx: 4096,
          ...options
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Ollama chat failed with HTTP ${response.status}${errText ? `: ${errText}` : ''}`);
    }

    const data = await response.json();
    return data?.message?.content || data?.response || '';
  } finally {
    clearTimeout(timer);
  }
}

export async function warmOllamaModels({ endpoint, models, timeoutMs = 20000, limit = 6 } = {}) {
  const picked = (models || []).slice(0, limit);
  const results = [];

  for (const model of picked) {
    const modelName = stripOllamaPrefix(model.id || model.model || model.name);
    try {
      const reply = await callOllamaChat({
        endpoint,
        model: modelName,
        timeoutMs,
        options: { num_ctx: 1024, num_predict: 4 },
        messages: [{ role: 'user', content: 'Reply with OK.' }]
      });
      results.push({ id: toOllamaModelId(modelName), name: modelName, ok: true, reply: reply?.trim() || '' });
    } catch (err) {
      results.push({ id: toOllamaModelId(modelName), name: modelName, ok: false, error: err.message || String(err) });
    }
  }

  return results;
}

function normalizeMessages(messages = []) {
  return messages.map(message => ({
    role: normalizeRole(message.role),
    content: flattenContent(message.content)
  }));
}

function normalizeRole(role) {
  if (role === 'assistant' || role === 'system' || role === 'user') return role;
  return 'user';
}

function flattenContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(part => {
      if (typeof part === 'string') return part;
      if (part?.type === 'text') return part.text || '';
      if (part?.type === 'image_url') return `[Image reference: ${part.url || part.image_url?.url || 'attached image'}]`;
      return part?.text || '';
    }).filter(Boolean).join('\n\n');
  }
  if (content && typeof content === 'object') {
    return content.text || JSON.stringify(content);
  }
  return '';
}
