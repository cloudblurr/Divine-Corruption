// utils/higherstate.js - Higher State AI OpenWebUI/Puter model adapter.

export const HIGHERSTATE_MODEL_PREFIX = 'higherstate:';
export const DEFAULT_HIGHERSTATE_ENDPOINT = '/higherstate';
export const DEFAULT_HIGHERSTATE_MODEL = 'grok-3-mini';
export const DEFAULT_HIGHERSTATE_MODEL_ID = `${HIGHERSTATE_MODEL_PREFIX}${DEFAULT_HIGHERSTATE_MODEL}`;
export const JESUS_ENGINE_MODEL = 'jesusengine';
export const JESUS_ENGINE_MODEL_ID = `${HIGHERSTATE_MODEL_PREFIX}${JESUS_ENGINE_MODEL}`;
export const DEFAULT_HIGHERSTATE_MAX_TOKENS = 4096;
export const DEFAULT_HIGHERSTATE_CONTINUATION_LIMIT = 1;

export const HIGHERSTATE_ROLEPLAY_MODELS = [
  {
    id: JESUS_ENGINE_MODEL_ID,
    name: 'JesusEngine',
    desc: 'Workspace JesusEngine profile via Higher State AI / Puter.com',
    tier: 10,
    upstreamModel: DEFAULT_HIGHERSTATE_MODEL
  },
  {
    id: `${HIGHERSTATE_MODEL_PREFIX}grok-3-mini`,
    name: 'Grok 3 Mini',
    desc: 'Higher State AI / Puter.com xAI',
    tier: 9
  },
  {
    id: `${HIGHERSTATE_MODEL_PREFIX}grok-3`,
    name: 'Grok 3',
    desc: 'Higher State AI / Puter.com xAI',
    tier: 9
  },
  {
    id: `${HIGHERSTATE_MODEL_PREFIX}claude-opus-4-7`,
    name: 'Claude Opus 4.7',
    desc: 'Higher State AI / Puter.com Claude',
    tier: 8
  },
  {
    id: `${HIGHERSTATE_MODEL_PREFIX}gemini-2.5-flash`,
    name: 'Gemini 2.5 Flash',
    desc: 'Higher State AI / Puter.com Gemini',
    tier: 8
  },
  {
    id: `${HIGHERSTATE_MODEL_PREFIX}gpt-4o-mini`,
    name: 'GPT-4o Mini',
    desc: 'Higher State AI / Puter.com OpenAI',
    tier: 7
  }
];

export function toHigherStateModelId(modelName) {
  if (!modelName) return DEFAULT_HIGHERSTATE_MODEL_ID;
  return modelName.startsWith(HIGHERSTATE_MODEL_PREFIX)
    ? modelName
    : `${HIGHERSTATE_MODEL_PREFIX}${modelName}`;
}

export function isHigherStateModelId(modelId) {
  return typeof modelId === 'string' && modelId.startsWith(HIGHERSTATE_MODEL_PREFIX);
}

export function stripHigherStatePrefix(modelId) {
  if (!modelId) return DEFAULT_HIGHERSTATE_MODEL;
  return isHigherStateModelId(modelId) ? modelId.slice(HIGHERSTATE_MODEL_PREFIX.length) : modelId;
}

export function normalizeHigherStateEndpoint(endpoint) {
  let value = (endpoint || DEFAULT_HIGHERSTATE_ENDPOINT).trim();
  if (!value) value = DEFAULT_HIGHERSTATE_ENDPOINT;
  return value.replace(/\/+$/, '') || DEFAULT_HIGHERSTATE_ENDPOINT;
}

export async function fetchHigherStateModels(endpoint = DEFAULT_HIGHERSTATE_ENDPOINT, timeoutMs = 15000) {
  const base = normalizeHigherStateEndpoint(endpoint);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(modelsUrl(base), {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Higher State AI models failed with HTTP ${response.status}`);
    const data = await response.json();
    const source = Array.isArray(data) ? data : data.data || data.models || [];
    const models = source.map(mapHigherStateModel).filter(Boolean);
    return mergeHigherStateModels(HIGHERSTATE_ROLEPLAY_MODELS, models);
  } finally {
    clearTimeout(timer);
  }
}

export async function callHigherStateText({
  endpoint = DEFAULT_HIGHERSTATE_ENDPOINT,
  apiKey = '',
  model = DEFAULT_HIGHERSTATE_MODEL,
  messages = [],
  timeoutMs = 90000,
  temperature = 0.9,
  maxTokens = DEFAULT_HIGHERSTATE_MAX_TOKENS,
  continuationLimit = DEFAULT_HIGHERSTATE_CONTINUATION_LIMIT
}) {
  const base = normalizeHigherStateEndpoint(endpoint);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const originalMessages = normalizeMessages(messages);
    let activeMessages = originalMessages;
    let fullText = '';
    const maxTurns = Math.max(0, Number.parseInt(continuationLimit, 10) || 0);

    for (let turn = 0; turn <= maxTurns; turn++) {
      const result = await chatOnce({
        base,
        apiKey,
        model: resolveHigherStateModel(model),
        messages: activeMessages,
        temperature,
        maxTokens,
        signal: controller.signal
      });

      if (result.text) fullText = joinContinuation(fullText, result.text);
      if (result.finishReason !== 'length') return fullText.trim();
      if (turn === maxTurns) break;

      activeMessages = [
        ...originalMessages,
        { role: 'assistant', content: fullText || result.text || '' },
        {
          role: 'user',
          content: 'Continue exactly where you stopped. Do not recap, restart, apologize, or add a heading. Continue the same response until it reaches a natural ending.'
        }
      ];
    }

    if (fullText.trim()) return fullText.trim();
    throw new Error('Higher State AI returned an empty response.');
  } finally {
    clearTimeout(timer);
  }
}

async function chatOnce({ base, apiKey, model, messages, temperature, maxTokens, signal }) {
  const directOpenAi = isOpenAiBase(base);
  const response = await fetch(directOpenAi ? `${base}/chat/completions` : `${base}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(directOpenAi && apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    signal,
    body: JSON.stringify(
      directOpenAi
        ? {
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: false
          }
        : {
            apiKey,
            model,
            request: {
              model,
              messages,
              temperature,
              max_tokens: maxTokens,
              stream: false
            }
          }
    )
  });

  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (_) {
    data = { raw };
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.error || raw || `HTTP ${response.status}`;
    throw new Error(`Higher State AI failed: ${message}`);
  }

  const choice = data?.choices?.[0];
  const text = choice?.message?.content || choice?.text || data?.text || '';
  return {
    finishReason: choice?.finish_reason || '',
    text: Array.isArray(text)
      ? text.map(part => part?.text || '').filter(Boolean).join('\n').trim()
      : String(text || '').trim()
  };
}

function modelsUrl(base) {
  return isOpenAiBase(base) ? `${base}/models` : `${base}/models`;
}

function isOpenAiBase(base) {
  return /\/v1$/i.test(base);
}

function resolveHigherStateModel(model) {
  const stripped = stripHigherStatePrefix(model);
  if (stripped === JESUS_ENGINE_MODEL) return DEFAULT_HIGHERSTATE_MODEL;
  return stripped || DEFAULT_HIGHERSTATE_MODEL;
}

function mapHigherStateModel(model) {
  const id = model?.id || model?.model || '';
  if (!id) return null;
  const provider = model?.provider || model?.owned_by || model?.owner || providerFromId(id);
  return {
    id: toHigherStateModelId(id),
    name: model?.name || formatModelName(id),
    desc: `${formatProvider(provider)} - Higher State AI / Puter.com`,
    tier: tierForModel(id, provider)
  };
}

function providerFromId(id) {
  const lowered = String(id || '').toLowerCase();
  if (lowered.includes('grok') || lowered.includes('x-ai')) return 'xAI';
  if (lowered.includes('claude') || lowered.includes('anthropic')) return 'Claude';
  if (lowered.includes('gemini') || lowered.includes('google')) return 'Gemini';
  if (lowered.startsWith('gpt') || lowered.startsWith('o1') || lowered.startsWith('o3') || lowered.startsWith('o4')) return 'OpenAI';
  return 'Puter';
}

function formatProvider(provider) {
  const value = String(provider || 'Puter');
  if (value.toLowerCase() === 'xai') return 'xAI';
  if (value.toLowerCase() === 'claude') return 'Claude';
  if (value.toLowerCase() === 'gemini') return 'Gemini';
  if (value.toLowerCase() === 'openai') return 'OpenAI';
  return value;
}

function formatModelName(id) {
  return String(id)
    .replace(/^openrouter:/, '')
    .replace(/^[^/]+\/(.+)$/, '$1')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function tierForModel(id, provider) {
  const haystack = `${id} ${provider}`.toLowerCase();
  if (haystack.includes('jesusengine') || haystack.includes('grok') || haystack.includes('opus')) return 10;
  if (haystack.includes('claude') || haystack.includes('gemini') || haystack.includes('gpt')) return 8;
  return 6;
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
  if (content && typeof content === 'object') return content.text || JSON.stringify(content);
  return '';
}

function mergeHigherStateModels(...groups) {
  const seen = new Set();
  const merged = [];
  groups.flat().filter(Boolean).forEach(model => {
    if (!model.id || seen.has(model.id)) return;
    seen.add(model.id);
    merged.push(model);
  });
  return merged;
}

function joinContinuation(previous, next) {
  const left = (previous || '').trimEnd();
  const right = (next || '').trimStart();
  if (!left) return right;
  if (!right) return left;
  return `${left}\n\n${right}`;
}
